import { supabase } from '@/integrations/supabase/client';

/** Classe de falha da carga do mapa: decide se a consulta é repetida. */
export type CommercialMapFailureKind =
  | 'network' | 'timeout' | 'temporary' | 'aborted'
  | 'session' | 'denied' | 'configuration' | 'invalid' | 'unknown';

export const COMMERCIAL_MAP_MAX_TRANSIENT_RETRIES = 4;
export const COMMERCIAL_MAP_RETRY_BASE_MS = 1_000;
export const COMMERCIAL_MAP_RETRY_MAX_DELAY_MS = 10_000;
/** Orçamento total de espera entre tentativas (as medições chegaram a ~23 s por consulta lenta). */
export const COMMERCIAL_MAP_RETRY_BUDGET_MS = 45_000;

interface ErrorLike { code?: unknown; status?: unknown; message?: unknown; name?: unknown; retryAfter?: unknown; headers?: unknown }

function text(error: unknown) {
  const e = (error ?? {}) as ErrorLike;
  return `${String(e.code ?? '')} ${String(e.message ?? error ?? '')}`;
}

export function classifyCommercialMapFailure(error: unknown): CommercialMapFailureKind {
  const e = (error ?? {}) as ErrorLike;
  const code = String(e.code ?? '');
  const status = typeof e.status === 'number' ? e.status : Number.NaN;
  const message = text(error);
  if (e.name === 'AbortError' || /aborted|AbortError/i.test(message)) return 'aborted';
  if (/JWT expired|PGRST301|PGRST302|invalid jwt|refresh_token|AUTH_REQUIRED/i.test(message) || status === 401) return 'session';
  if (/MAP_PERMISSION_DENIED|MAP_SEGMENT_ACCESS_DENIED/i.test(message) || code === '42501' || status === 403) return 'denied';
  if (['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code)
    || /MAP_SEGMENT_CONFIGURATION_UNAVAILABLE|does not exist|schema cache/i.test(message)) return 'configuration';
  if (/INVALID_ORDER|invalid input syntax|22P02/i.test(message)) return 'invalid';
  if (code === '57014' || /timeout|canceling statement|timed out/i.test(message) || status === 408) return 'timeout';
  if (status === 429 || (status >= 500 && status < 600) || /\b50[234]\b|upstream|gateway|too many/i.test(message)) return 'temporary';
  if (/Failed to fetch|NetworkError|Load failed|ECONN|network/i.test(message)) return 'network';
  return 'unknown';
}

export function isTransientCommercialMapFailure(kind: CommercialMapFailureKind) {
  return kind === 'network' || kind === 'timeout' || kind === 'temporary' || kind === 'unknown';
}

/** Segundos de Retry-After, quando o servidor informa. */
export function retryAfterMs(error: unknown): number | null {
  const e = (error ?? {}) as ErrorLike;
  let raw: unknown = e.retryAfter;
  const headers = e.headers as { get?: (name: string) => string | null } | undefined;
  if (raw == null && headers?.get) raw = headers.get('retry-after');
  if (raw == null) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, COMMERCIAL_MAP_RETRY_MAX_DELAY_MS * 3);
  const date = Date.parse(String(raw));
  return Number.isFinite(date) ? Math.max(0, Math.min(date - Date.now(), COMMERCIAL_MAP_RETRY_MAX_DELAY_MS * 3)) : null;
}

/** 1 s, 2 s, 4 s, 8 s (teto 10 s) com ±20% de variação; Retry-After prevalece.
 *  Servidor ocupado (tempo esgotado/503/429) espera no mínimo 2 s para não somar carga. */
export function commercialMapRetryDelay(failureCount: number, error: unknown, random: () => number = Math.random): number {
  const hinted = retryAfterMs(error);
  if (hinted !== null) return hinted;
  const kind = classifyCommercialMapFailure(error);
  const floor = kind === 'timeout' || kind === 'temporary' ? 2_000 : 0;
  const base = Math.max(floor, Math.min(COMMERCIAL_MAP_RETRY_BASE_MS * 2 ** Math.max(0, failureCount - 1), COMMERCIAL_MAP_RETRY_MAX_DELAY_MS));
  return Math.round(base * (0.8 + random() * 0.4));
}

let sessionRefresh: Promise<unknown> | null = null;
/** Usa a renovação de sessão existente uma única vez por sequência de falhas. */
function refreshSessionOnce() {
  sessionRefresh ??= supabase.auth.refreshSession().catch(() => undefined).finally(() => {
    setTimeout(() => { sessionRefresh = null; }, 30_000);
  });
  return sessionRefresh;
}

/**
 * Único responsável pelas novas tentativas da abertura (React Query).
 * Transitórias: até 4 novas tentativas dentro do orçamento; sessão: uma renovação
 * e uma nova tentativa; negação, configuração ou dados inválidos: nunca repete.
 */
export function shouldRetryCommercialMap(failureCount: number, error: unknown, refresh = refreshSessionOnce): boolean {
  const kind = classifyCommercialMapFailure(error);
  if (kind === 'session') {
    if (failureCount > 0) return false;
    void refresh();
    return true;
  }
  if (!isTransientCommercialMapFailure(kind)) return false;
  if (failureCount >= COMMERCIAL_MAP_MAX_TRANSIENT_RETRIES) return false;
  let spent = 0;
  for (let i = 1; i <= failureCount; i += 1) spent += Math.min(COMMERCIAL_MAP_RETRY_BASE_MS * 2 ** (i - 1), COMMERCIAL_MAP_RETRY_MAX_DELAY_MS);
  return spent < COMMERCIAL_MAP_RETRY_BUDGET_MS;
}
