import { supabase } from '@/integrations/supabase/client';
import type { WorkerAttachment } from './types';
import { WorkerError } from '../../../supabase/functions/_shared/workers/contracts';
import { publicWorkerError } from '../../../supabase/functions/_shared/workers/failures';

/** Public, allowlisted text only. Upstream SQL, tokens and stacks never enter the chat. */
export class WorkerTurnError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, publicMessage?: string, public readonly requestId?: string, retryable?: boolean) {
    const safe = publicWorkerError(new WorkerError(code));
    super(publicMessage ?? safe.message);
    this.name = 'WorkerTurnError'; this.code = safe.code; this.retryable = safe.retryable && retryable !== false;
  }
}

export function workerTurnError(cause: unknown, requestId?: string): WorkerTurnError {
  if (cause instanceof WorkerTurnError) return cause;
  if (cause instanceof DOMException && cause.name === 'AbortError') return new WorkerTurnError('request_cancelled', undefined, requestId);
  if (cause instanceof Error && /timeout|tempo excedido/i.test(cause.message)) return new WorkerTurnError('timeout', undefined, requestId);
  if (cause instanceof TypeError || cause instanceof Error && /network|fetch|conex[aã]o|interrompida/i.test(cause.message)) return new WorkerTurnError('network_error', undefined, requestId);
  return new WorkerTurnError('query_failed', undefined, requestId, false);
}

export interface WorkerRequestContext {
  route: string;
  recordId?: string;
}

export interface WorkersTurnRequest {
  orgId: string;
  requestId: string;
  conversationId?: string;
  worker?: string;
  message: string;
  context?: WorkerRequestContext;
  attachments?: Array<Pick<WorkerAttachment, 'name' | 'text'>>;
}

export type WorkersStreamEvent =
  | { event: 'worker'; data: { workerId: string } }
  | { event: 'conversation'; data: { conversationId: string } }
  | { event: 'workspace'; data: { kind: 'action' | 'routine'; id: string } }
  | { event: 'progress'; data: { label: string; status: 'running' | 'complete' } }
  | { event: 'delta'; data: { text: string } }
  | { event: 'citations'; data: { citations: Array<{ label: string; url: string; source: 'app' | 'web'; date?: string }> } }
  | { event: 'usage'; data: { inputTokens: number; outputTokens: number } }
  | { event: 'done'; data: Record<string, unknown> }
  | { event: 'error'; data: { code: string; message: string; retryable?: boolean; requestId?: string } };

const EVENT_NAMES = new Set(['worker', 'conversation', 'workspace', 'progress', 'delta', 'citations', 'usage', 'done', 'error']);

/** Incremental SSE parser: supports split UTF-8 chunks, CRLF and multiline data. */
export async function consumeWorkersStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: WorkersStreamEvent) => void,
  signal?: AbortSignal,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completed = false;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener('abort', abort, { once: true });

  const emit = (block: string) => {
    if (completed) return;
    let event = 'message';
    const parts: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      if (line.startsWith('data:')) parts.push(line.slice(5).trimStart());
    }
    if (!parts.length || !EVENT_NAMES.has(event)) return;
    let data: unknown;
    try { data = JSON.parse(parts.join('\n')); }
    catch { throw new WorkerTurnError('invalid_response', 'A resposta do BOT FENASOJA chegou incompleta. Consulte o módulo.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new WorkerTurnError('invalid_response');
    }
    if (event === 'done') completed = true;
    onEvent({ event, data } as WorkersStreamEvent);
    if (event === 'error') {
      const failure = data as Record<string, unknown>;
      throw new WorkerTurnError(typeof failure.code === 'string' ? failure.code : 'query_failed', undefined,
        typeof failure.requestId === 'string' ? failure.requestId : undefined, failure.retryable === true);
    }
  };

  try {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    while (true) {
      const { value, done } = await reader.read();
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (buffer.length > 131_072) throw new Error('A resposta excedeu o limite permitido.');
      let delimiter: RegExpMatchArray | null;
      while ((delimiter = buffer.match(/\r?\n\r?\n/))) {
        const index = delimiter.index ?? 0;
        emit(buffer.slice(0, index));
        if (completed) return;
        buffer = buffer.slice(index + delimiter[0].length);
      }
      if (done) break;
    }
    if (buffer.trim()) emit(buffer);
    if (!completed) throw new WorkerTurnError('network_error', 'A conexão foi interrompida. A conversa foi preservada; tente novamente.');
  } finally {
    signal?.removeEventListener('abort', abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function streamWorkersTurn(
  request: WorkersTurnRequest,
  onEvent: (event: WorkersStreamEvent) => void,
  signal: AbortSignal,
) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const { data, error } = await supabase.auth.getSession();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  if (error || !data.session) throw new WorkerTurnError('forbidden', 'Entre novamente para conversar com a equipe.', request.requestId, false);
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !publishableKey) throw new WorkerTurnError('query_failed', 'A conexão da equipe ainda não foi configurada.', request.requestId, false);
  let response: Response;
  try { response = await fetch(`${baseUrl}/functions/v1/workers-orchestrator`, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      apikey: publishableKey,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(request),
  }); } catch (cause) { throw workerTurnError(cause, request.requestId); }
  if (signal.aborted) {
    await response.body?.cancel().catch(() => undefined);
    throw new DOMException('Aborted', 'AbortError');
  }
  if (!response.ok) {
    if (response.headers.get('Content-Type')?.includes('application/json')) {
      // A failure before SSE starts carries the same safe code contract.
      let payload: unknown;
      try { payload = await response.json(); } catch { /* Fall back to HTTP status. */ }
      if (payload && typeof payload === 'object' && 'error' in payload) {
        const failure = (payload as { error: unknown }).error;
        if (failure && typeof failure === 'object' && 'code' in failure && typeof failure.code === 'string') {
          throw new WorkerTurnError(failure.code, undefined, request.requestId,
            'retryable' in failure && failure.retryable === true);
        }
      }
    } else await response.body?.cancel().catch(() => undefined);
    if (response.status === 401) throw new WorkerTurnError('forbidden', 'Sua sessão expirou. Entre novamente para continuar.', request.requestId, false);
    if (response.status === 403) throw new WorkerTurnError('forbidden', 'Você não tem permissão para essa consulta.', request.requestId, false);
    if (response.status === 429) throw new WorkerTurnError('rate_limited', 'Muitas consultas em pouco tempo. Aguarde um momento.', request.requestId);
    if (response.status === 409) throw new WorkerTurnError('request_in_progress', 'Esta mensagem já está sendo processada. Aguarde a resposta.', request.requestId, false);
    if ([408, 504].includes(response.status)) throw new WorkerTurnError('timeout', undefined, request.requestId);
    throw new WorkerTurnError('query_failed', undefined, request.requestId);
  }
  if (!response.body || !response.headers.get('Content-Type')?.includes('text/event-stream')) {
    await response.body?.cancel().catch(() => undefined);
    throw new WorkerTurnError('invalid_response', undefined, request.requestId);
  }
  await consumeWorkersStream(response.body, onEvent, signal);
}

/** Only navigable app destinations or HTTPS sources; public-link tokens never leave the server. */
export function safeWorkerSourceUrl(raw: unknown, kind: 'app' | 'web'): string | null {
  if (typeof raw !== 'string' || raw.length > 2_048 || [...raw].some(character => character.charCodeAt(0) <= 32 || character === '\\')) return null;
  if (kind === 'app') {
    if (!/^\/(cronograma-eventos|eventos-restaurante-arena|mapa-comercial|comissoes|admin|transports|vehicles|electric-carts|scooters|ver-escala|checklist|portal|dashboard|equipe-ia)(\/|\?|$)/.test(raw)) return null;
    const parsed = new URL(raw, 'https://workers.invalid');
    if (parsed.origin !== 'https://workers.invalid') return null;
    const rawPath = raw.split(/[?#]/)[0];
    if (rawPath !== parsed.pathname || rawPath.includes('%')) return null;
    if ([...parsed.searchParams.keys()].some(key => !['event', 'evento', 'subevent', 'mode', 'edicao', 'view', 'aba', 'timelineYear', 'timelineMonth', 'lote'].includes(key))) return null;
    if (parsed.searchParams.has('lote') && (parsed.pathname !== '/mapa-comercial' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.searchParams.get('lote') ?? ''))) return null;
    if (parsed.hash) return null;
    return raw;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return null;
    if (!parsed.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(parsed.hostname)) return null;
    const address = parsed.hostname.split('.').map(Number);
    if (address.length === 4 && address.every(part => Number.isInteger(part) && part >= 0 && part <= 255)
      && ((address[0] === 172 && address[1] >= 16 && address[1] <= 31) || (address[0] === 100 && address[1] >= 64 && address[1] <= 127) || address[0] >= 224)) return null;
    if (/\.(?:localhost|local|internal)$/.test(parsed.hostname) || /^\/areas(?:\/|$)/i.test(decodeURIComponent(parsed.pathname))) return null;
    if ([...parsed.searchParams.keys()].some(key => /token|key|auth|email|phone/i.test(key))) return null;
    return parsed.href;
  } catch { return null; }
}
