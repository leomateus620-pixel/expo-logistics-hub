export const WORKER_IDS = ['agenda', 'arena', 'mapa', 'interesse', 'comissao', 'logistica', 'caixa', 'radar'] as const;
export type WorkerId = typeof WORKER_IDS[number];
export interface WorkerCitation { label: string; url: string; source: 'app' | 'web'; date?: string }
export interface WorkerRequest {
  orgId: string;
  requestId: string;
  conversationId?: string;
  worker?: WorkerId;
  message: string;
  context?: { route: string; recordId?: string };
  attachments?: Array<{ name: string; text: string }>;
}
export interface ReadTool {
  name: string;
  title?: string;
  description: string;
  readOnly: true;
  inputJsonSchema: Record<string, unknown>;
}
export interface ReadResult {
  summary: string;
  records: unknown[];
  citations: WorkerCitation[];
  total?: number;
  truncated?: boolean;
}
export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string } }
export interface ProviderResponse { calls: ToolCall[]; inputTokens: number; outputTokens: number; usageReported?: boolean }
export interface WorkerProvider {
  readonly model: string;
  complete(messages: ProviderMessage[], tools: ReadTool[], signal?: AbortSignal): Promise<ProviderResponse>;
}
export type EmitWorkerEvent = (event: 'worker' | 'progress' | 'delta' | 'citations' | 'conversation' | 'usage' | 'done' | 'error', data: unknown) => void;

export class WorkerError extends Error {
  constructor(public readonly code: string, public readonly status = 400) { super(code); }
}
export const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const onlyKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));

export function parseWorkerRequest(value: unknown): WorkerRequest {
  if (!isObject(value) || !onlyKeys(value, ['orgId', 'requestId', 'conversationId', 'worker', 'message', 'context', 'attachments'])
    || !isUuid(value.orgId) || !isUuid(value.requestId)
    || (value.conversationId !== undefined && !isUuid(value.conversationId))
    || (value.worker !== undefined && !WORKER_IDS.includes(value.worker as WorkerId))
    || typeof value.message !== 'string' || !value.message.trim() || value.message.length > 6000) throw new WorkerError('invalid_request');
  if (value.context !== undefined && (!isObject(value.context) || !onlyKeys(value.context, ['route', 'recordId'])
    || typeof value.context.route !== 'string' || value.context.route.length > 500
    || !/^\/[a-zA-Z0-9/_-]*$/.test(value.context.route) || /^\/areas\//.test(value.context.route)
    || (value.context.recordId !== undefined && !isUuid(value.context.recordId)))) throw new WorkerError('invalid_context');
  if (value.attachments !== undefined && (!Array.isArray(value.attachments) || value.attachments.length > 3
    || value.attachments.some(item => !isObject(item) || !onlyKeys(item, ['name', 'text'])
      || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 100
      || typeof item.text !== 'string' || item.text.length > 6000)
    || value.attachments.reduce((sum, item) => sum + String(item.text).length, 0) > 12000)) throw new WorkerError('invalid_attachments');
  return { ...value, message: value.message.trim() } as unknown as WorkerRequest;
}

// Only app paths inspected in the repository. Public token routes are excluded.
export function isSafeAppUrl(value: string): boolean {
  // eslint-disable-next-line no-control-regex -- Control characters are rejected in links.
  if (value.length > 1200 || /[\s\\<>\u0000-\u001f]/.test(value) || value.includes('://') || value.startsWith('//')) return false;
  const path = value.split('?')[0];
  return /^\/(?:equipe-ia(?:\/(?:conheca|agenda|arena|mapa|interesse|comissao|logistica|caixa|radar))?|cronograma-eventos(?:\/contagem-oficial)?|mapa-comercial|portal|dashboard|eventos-restaurante-arena(?:\/[a-z0-9-]+){0,2}|comissoes\/[a-z0-9-]+(?:\/[a-z0-9-]+)*|transports|vehicles|electric-carts|scooters|ver-escala|checklist)$/.test(path)
    && !/[?&](?:token|email|phone|cpf|pix)=/i.test(value);
}

export const PRIMARY_WEB_DOMAINS = ['fenasoja.com.br', 'gov.br', 'embrapa.br'] as const;
export function isPrimaryWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return value.length <= 1200 && url.protocol === 'https:' && !url.username && !url.password && !url.port
      && !/^\/areas(?:\/|$)/i.test(decodeURIComponent(url.pathname))
      && PRIMARY_WEB_DOMAINS.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))
      && !/[?&](?:token|email|phone|cpf|pix)=/i.test(value);
  } catch { return false; }
}

export function validateCitations(values: unknown): WorkerCitation[] {
  if (!Array.isArray(values) || values.length > 30) throw new WorkerError('invalid_citations', 502);
  return values.map(value => {
    if (!isObject(value) || typeof value.label !== 'string' || !value.label.trim() || value.label.length > 160
      || typeof value.url !== 'string' || !['app', 'web'].includes(String(value.source))
      || (value.source === 'app' ? !isSafeAppUrl(value.url) : !isPrimaryWebUrl(value.url))
      || (value.source === 'web' && (typeof value.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)))) throw new WorkerError('invalid_citations', 502);
    return { label: redactWorkerText(value.label), url: value.url, source: value.source as WorkerCitation['source'], ...(value.source === 'web' ? { date: String(value.date) } : {}) };
  });
}

export function redactWorkerText(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex -- Strip nonprinting controls from untrusted text.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/\b(?:Bearer\s+)?eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gi, '[token protegido]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[e-mail protegido]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento protegido]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[documento protegido]')
    .replace(/(?:\+?55[\s-]?)?\(?\b\d{2}\)?[\s-]?\d{4,5}[\s-]?\d{4}\b/g, '[telefone protegido]')
    .replace(/\b(?:Bearer\s+|sk-|sb_secret_)[A-Za-z0-9._-]+/gi, '[segredo protegido]')
    .replace(/\bpix\s*[:=]\s*\S+/gi, 'PIX [protegido]')
    .replace(/https?:\/\/[^\s]+/gi, '[link externo omitido]')
    .replace(/\/areas\/[^/\s]+\/[^\s]+/gi, '[link público protegido]');
}

/** Redact leaf values before JSON encoding; never regex-rewrite serialized JSON. */
export function redactWorkerData(value: unknown, depth = 0): unknown {
  if (depth > 8) return null;
  if (typeof value === 'string') return redactWorkerText(value);
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (Array.isArray(value)) return value.slice(0, 100).map(item => redactWorkerData(item, depth + 1));
  if (isObject(value)) return Object.fromEntries(Object.entries(value).filter(([key]) => !['__proto__', 'constructor', 'prototype'].includes(key))
    .map(([key, item]) => [key, redactWorkerData(item, depth + 1)]));
  return null;
}

export function workersForRequest(request: WorkerRequest, primary: WorkerId): WorkerId[] {
  const text = request.message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const workers = new Set<WorkerId>([primary]);
  if (/conflit|restaurante|arena/.test(text) && /event|agenda|cronograma|comiss/.test(text)) {
    workers.add('agenda'); workers.add('arena');
  }
  if (/comiss|responsave/.test(text) && /event|agenda|cronograma|pendenc|reuniao/.test(text)) workers.add('comissao');
  if (/clima|tempo/.test(text) && /transporte|frota/.test(text)) { workers.add('logistica'); workers.add('radar'); }
  return [...workers];
}

export function routeWorker(request: WorkerRequest): WorkerId {
  const text = request.message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const mention = /@(agenda|arena|mapa|interesse|comissao|logistica|caixa|radar)\b/.exec(text)?.[1] as WorkerId | undefined;
  if (mention) return mention;
  if (request.worker) return request.worker;
  if (/restaurante|arena|ocupacao|disponibilidade/.test(text)) return 'arena';
  if (/link publico|interesse|funil/.test(text)) return 'interesse';
  if (/lote|pavilhao|contrato|venda/.test(text)) return 'mapa';
  if (/financeiro|orcamento|despesa|receita/.test(text)) return 'caixa';
  if (/transporte|veiculo|frota|carrinho|patinete|escala/.test(text)) return 'logistica';
  if (/pesquis|agro|clima|previsao do tempo|web/.test(text)) return 'radar';
  if (/comissao|reuniao|pendencia/.test(text)) return 'comissao';
  return 'agenda';
}

export function asksForMutation(message: string): boolean {
  const text = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return /\b(apag[ae]|exclu[ai]|delet[ae]|remov[ae]|cancele?|confirm[ae]|public[ao]r?|publique|envie?|mande|dispar[ae]|alter[ae]|edit[ae]|adicion[ae]|crie|cria|cri[ao]r|salv[ae]|reserv[ae]|registr[ae]|atualiz[ae]|mude|pague|pag[au]r|rotacion[ae])\b/.test(text);
}
