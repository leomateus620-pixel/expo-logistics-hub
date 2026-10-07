/**
 * Identidade da tentativa de venda guardada na sessão do navegador até um
 * resultado confirmado. Reabrir o diálogo ou recarregar a página reutiliza a
 * mesma chave para o mesmo conjunto de espaços e etapa, e o servidor devolve o
 * pedido original em vez de gravar outro (idempotência existente).
 */
const STORAGE_KEY = 'fenasoja.commercial-sale-attempt.v1';

export interface SaleAttempt { key: string; scope: string; startedAt: number; uncertain: boolean }

export function saleAttemptScope(lotIds: readonly string[], stage: string): string {
  return `${stage}|${[...lotIds].sort().join(',')}`;
}

function read(): SaleAttempt | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as SaleAttempt : null;
  } catch { return null; }
}

function write(attempt: SaleAttempt | null) {
  try {
    if (attempt) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attempt));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* armazenamento indisponível: a chave segue na memória da tela */ }
}

/** Reaproveita a tentativa guardada para o mesmo escopo; senão cria uma nova. */
export function resolveSaleAttempt(scope: string, newKey: () => string = () => crypto.randomUUID()): SaleAttempt {
  const stored = read();
  if (stored && stored.scope === scope) return stored;
  const attempt = { key: newKey(), scope, startedAt: Date.now(), uncertain: false };
  write(attempt);
  return attempt;
}

export function markSaleAttemptUncertain(key: string) {
  const stored = read();
  if (stored?.key === key) write({ ...stored, uncertain: true });
}

/** Só um resultado confirmado (pedido devolvido pelo servidor) encerra a tentativa. */
export function clearSaleAttempt(key: string) {
  if (read()?.key === key) write(null);
}

export function peekSaleAttempt(): SaleAttempt | null { return read(); }
