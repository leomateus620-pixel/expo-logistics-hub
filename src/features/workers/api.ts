import { supabase } from '@/integrations/supabase/client';
import type { WorkerAttachment } from './types';

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
  | { event: 'error'; data: { code: string; message: string } };

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
    catch { throw new Error('A resposta do BOT FENASOJA chegou incompleta. Tente novamente.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Não foi possível interpretar a resposta do BOT FENASOJA.');
    }
    if (event === 'done') completed = true;
    onEvent({ event, data } as WorkersStreamEvent);
    if (event === 'error') throw new Error('A consulta não pôde ser concluída. Tente novamente.');
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
    if (!completed) throw new Error('A conexão foi interrompida. A conversa foi preservada; tente novamente.');
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
  if (error || !data.session) throw new Error('Entre novamente para conversar com a equipe.');
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !publishableKey) throw new Error('A conexão da equipe ainda não foi configurada.');
  const response = await fetch(`${baseUrl}/functions/v1/workers-orchestrator`, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      apikey: publishableKey,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(request),
  });
  if (signal.aborted) {
    await response.body?.cancel().catch(() => undefined);
    throw new DOMException('Aborted', 'AbortError');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 401) throw new Error('Sua sessão expirou. Entre novamente para continuar.');
    if (response.status === 403) throw new Error('Você não tem permissão para essa consulta.');
    if (response.status === 429) throw new Error('Muitas consultas em pouco tempo. Aguarde um momento.');
    if (response.status === 409) throw new Error('Esta mensagem já está sendo processada. Aguarde a resposta.');
    throw new Error('O BOT FENASOJA está indisponível no momento. Tente novamente em instantes.');
  }
  if (!response.body || !response.headers.get('Content-Type')?.includes('text/event-stream')) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('O BOT FENASOJA não conseguiu concluir a conversa. Tente novamente.');
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
