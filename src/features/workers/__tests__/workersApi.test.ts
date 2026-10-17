import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { consumeWorkersStream, safeWorkerSourceUrl, streamWorkersTurn, WorkerTurnError, type WorkersStreamEvent } from '../api';

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mocks.getSession } } }));
const encoder = new TextEncoder();
const doneFrame = 'event: done\ndata: {}\n\n';

function closedStream(chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({ start(controller) { chunks.forEach(chunk => controller.enqueue(chunk)); controller.close(); } });
}
const request = { orgId: '10000000-0000-4000-8000-000000000001', requestId: '20000000-0000-4000-8000-000000000001', message: 'Quais eventos amanhã?' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'user-test-token' } }, error: null });
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'publishable-test');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('incremental bots SSE transport', () => {
  it('preserves UTF-8 code points split at every byte, CRLF boundaries and multiline JSON data', async () => {
    const wire = 'event: delta\r\ndata: {\r\ndata: "text": "Comissão: amanhã 🌱"\r\ndata: }\r\n\r\n' + doneFrame;
    const bytes = encoder.encode(wire);
    const events: WorkersStreamEvent[] = [];
    await consumeWorkersStream(closedStream(Array.from(bytes, byte => new Uint8Array([byte]))), event => events.push(event));
    expect(events).toEqual([{ event: 'delta', data: { text: 'Comissão: amanhã 🌱' } }, { event: 'done', data: {} }]);
  });

  it('ignores comment/unknown frames and accepts a terminal frame without a final blank line', async () => {
    const wire = ': heartbeat\n\nevent: surprise\ndata: {"secret":"ignore"}\n\nevent: done\ndata: {}';
    const events: WorkersStreamEvent[] = [];
    await consumeWorkersStream(closedStream([encoder.encode(wire)]), event => events.push(event));
    expect(events).toEqual([{ event: 'done', data: {} }]);
  });

  it('treats done as terminal even when late frames arrive in the same chunk', async () => {
    const events: WorkersStreamEvent[] = [];
    await consumeWorkersStream(closedStream([encoder.encode(doneFrame + 'event: delta\ndata: {"text":"late data"}\n\n')]), event => events.push(event));
    expect(events.map(event => event.event)).toEqual(['done']);
  });

  it('finishes and cancels the reader at done without waiting for network EOF', async () => {
    const cancel = vi.fn();
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({ start(stream) { stream.enqueue(encoder.encode(doneFrame)); }, cancel });
    const safetyTimeout = setTimeout(() => controller.abort(), 100);
    try { await expect(consumeWorkersStream(body, () => undefined, controller.signal)).resolves.toBeUndefined(); }
    finally { clearTimeout(safetyTimeout); controller.abort(); }
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('reports an interrupted response rather than treating an unterminated answer as complete', async () => {
    await expect(consumeWorkersStream(closedStream([encoder.encode('event: delta\ndata: {"text":"partial"}\n\n')]), () => undefined)).rejects.toThrow('interrompida');
    await expect(consumeWorkersStream(closedStream([encoder.encode('event: delta\ndata: {"text":')]), () => undefined)).rejects.toThrow('incompleta');
  });

  it('cancels the reader if the consumer rejects an error frame', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoder.encode('event: error\ndata: {"code":"forbidden","message":"Sem acesso"}\n\n')); }, cancel });
    await expect(consumeWorkersStream(body, () => { throw new Error('Sem acesso'); })).rejects.toThrow('Sem acesso');
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('retém código e correlação da falha sem expor mensagem técnica nem permitir repetir SQL inválido', async () => {
    const body = closedStream([encoder.encode('event: error\ndata: {"code":"sql_error","message":"SELECT segredo token privado","retryable":true,"requestId":"request-1"}\n\n')]);
    await expect(consumeWorkersStream(body, () => undefined)).rejects.toMatchObject({ name: 'WorkerTurnError', code: 'sql_error', requestId: 'request-1', retryable: false });
    expect(new WorkerTurnError('sql_error').message).not.toMatch(/SELECT segredo|token privado|segurança/);
  });

  it('cancels an already aborted stream and an abort while waiting for bytes', async () => {
    const firstCancel = vi.fn();
    const first = new AbortController(); first.abort();
    await expect(consumeWorkersStream(new ReadableStream({ cancel: firstCancel }), () => undefined, first.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(firstCancel).toHaveBeenCalledTimes(1);
    const secondCancel = vi.fn();
    const second = new AbortController();
    const task = consumeWorkersStream(new ReadableStream({ cancel: secondCancel }), () => undefined, second.signal);
    second.abort();
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
    expect(secondCancel).toHaveBeenCalledTimes(1);
  });

  it('bounds unframed data before JSON parsing', async () => {
    await expect(consumeWorkersStream(closedStream([encoder.encode('x'.repeat(131073))]), () => undefined)).rejects.toThrow('limite');
  });
});

describe('authenticated bots fetch', () => {
  it('uses only the current user token and the fixed project function URL', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(doneFrame, { headers: { 'Content-Type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetcher);
    await streamWorkersTurn(request, () => undefined, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledWith('https://project.supabase.co/functions/v1/workers-orchestrator', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer user-test-token', apikey: 'publishable-test' }), body: JSON.stringify(request) }));
  });

  it('does not request a session or make a fetch for an already aborted turn', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const abort = new AbortController(); abort.abort();
    await expect(streamWorkersTurn(request, () => undefined, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not fetch when cancellation happens during session resolution', async () => {
    let resolveSession: (value: unknown) => void = () => undefined;
    mocks.getSession.mockImplementation(() => new Promise(resolve => { resolveSession = resolve; }));
    const fetcher = vi.fn().mockResolvedValue(new Response(doneFrame, { headers: { 'Content-Type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetcher);
    const abort = new AbortController();
    const task = streamWorkersTurn(request, () => undefined, abort.signal);
    abort.abort();
    resolveSession({ data: { session: { access_token: 'user-test-token' } }, error: null });
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([[401, 'expirou'], [403, 'permissão'], [409, 'processada'], [429, 'Muitas consultas']])('maps HTTP %s without exposing a raw upstream body', async (status, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private upstream payload', { status })));
    await expect(streamWorkersTurn(request, () => undefined, new AbortController().signal)).rejects.toThrow(String(message));
  });

  it('preserva a causa de falha JSON anterior ao SSE sem ecoar detalhes da resposta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'rpc_incompatible', message: 'SQL privado e token', retryable: true } }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    await expect(streamWorkersTurn(request, () => undefined, new AbortController().signal)).rejects.toMatchObject({ code: 'rpc_incompatible', retryable: false, requestId: request.requestId });
  });

  it('identifica falha de conexão sem vazar URL ou conteúdo interno do fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch private?token=secret')));
    await expect(streamWorkersTurn(request, () => undefined, new AbortController().signal)).rejects.toMatchObject({ code: 'network_error', retryable: true, requestId: request.requestId });
  });
});

describe('bot citation boundaries', () => {
  it('accepts real app paths and rejects traversal, public tokens, unexpected parameters and private web hosts', () => {
    expect(safeWorkerSourceUrl('/transports', 'app')).toBe('/transports');
    expect(safeWorkerSourceUrl('/cronograma-eventos?event=record', 'app')).not.toBeNull();
    for (const url of ['/areas/pav13/private-token', '/comissoes/../areas/pav13/private-token', '/comissoes/%2e%2e/areas/pav13/private-token', '/mapa-comercial?token=private', '//evil.example/']) expect(safeWorkerSourceUrl(url, 'app')).toBeNull();
    for (const url of ['https://172.20.0.1/private', 'https://127.0.0.1/private', 'https://10.1.1.1/private', 'https://user:pass@www.fenasoja.com.br/', 'https://www.fenasoja.com.br/areas/pav/token', 'https://www.fenasoja.com.br/%61reas/pav/token']) expect(safeWorkerSourceUrl(url, 'web')).toBeNull();
    expect(safeWorkerSourceUrl('https://www.fenasoja.com.br/noticias', 'web')).toBe('https://www.fenasoja.com.br/noticias');
  });
});
