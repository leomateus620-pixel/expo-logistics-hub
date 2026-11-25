import type { SalesStage } from './salesTypes';

const LEGACY_SESSION_KEY = 'fenasoja.commercial-sale-attempt.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIX = 'fenasoja.commercial-sale-attempt.v2:';
const changed = 'commercial-sale-attempts-changed';
const inMemory = new Map<string, SaleAttempt>();

export interface SaleAttemptOwner {
  projectId: string;
  operatorId: string;
}

export interface SaleAttempt extends SaleAttemptOwner {
  key: string;
  stage: SalesStage;
  lotIds: string[];
  startedAt: number;
}

const ownerPrefix = ({ projectId, operatorId }: SaleAttemptOwner) => `${PREFIX}${projectId}:${operatorId}:`;
const storageKey = (attempt: SaleAttempt) => ownerPrefix(attempt) + attempt.key;

/** Persiste antes da RPC. Cada envio tem sua própria chave e o formulário fica em memória. */
export function startSaleAttempt(owner: SaleAttemptOwner, stage: SalesStage, lotIds: readonly string[]): SaleAttempt {
  const attempt = { ...owner, stage, lotIds: [...new Set(lotIds)].sort(), key: crypto.randomUUID(), startedAt: Date.now() };
  saveAttempt(attempt);
  return attempt;
}

function saveAttempt(attempt: SaleAttempt) {
  const key = storageKey(attempt);
  try {
    localStorage.setItem(key, JSON.stringify(attempt));
  } catch {
    inMemory.set(key, attempt);
  }
  window.dispatchEvent(new Event(changed));
}

/** O registro antigo não tinha operador nem projeto. Só a consulta autorizada pode atribuí-lo. */
export function previousSessionAttempt(owner: SaleAttemptOwner): SaleAttempt | null {
  try {
    const previous = JSON.parse(sessionStorage.getItem(LEGACY_SESSION_KEY) ?? 'null');
    if (!previous || typeof previous.scope !== 'string' || typeof previous.key !== 'string' || !UUID.test(previous.key)
      || !Number.isFinite(previous.startedAt)) return null;
    const [stage, serialized, extra] = previous.scope.split('|');
    const lotIds: string[] = serialized?.split(',') ?? [];
    if (extra !== undefined || (stage !== 'RENOVACAO' && stage !== 'SEGUNDA_ETAPA')
      || !lotIds.length || lotIds.some((id) => !UUID.test(id))) return null;
    return { ...owner, key: previous.key, startedAt: previous.startedAt, stage, lotIds };
  } catch {
    return null;
  }
}

export function adoptVerifiedSessionAttempt(attempt: SaleAttempt) {
  saveAttempt(attempt);
  try { sessionStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* armazenamento indisponível */ }
}

export function clearSaleAttempt(attempt: SaleAttempt) {
  const key = storageKey(attempt);
  inMemory.delete(key);
  try { localStorage.removeItem(key); } catch { /* armazenamento indisponível */ }
  window.dispatchEvent(new Event(changed));
}

export function listSaleAttempts(owner: SaleAttemptOwner): SaleAttempt[] {
  const prefix = ownerPrefix(owner);
  const attempts = new Map([...inMemory].filter(([key]) => key.startsWith(prefix)));
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      try {
        const stored = JSON.parse(localStorage.getItem(key) ?? 'null') as SaleAttempt | null;
        if (stored && stored.operatorId === owner.operatorId && stored.projectId === owner.projectId
          && (stored.stage === 'RENOVACAO' || stored.stage === 'SEGUNDA_ETAPA')
          && Array.isArray(stored.lotIds) && stored.lotIds.length > 0 && key === storageKey(stored)) {
          attempts.set(key, stored);
        }
      } catch { /* preserva as outras tentativas se uma entrada for inválida */ }
    }
  } catch { /* armazenamento indisponível */ }
  return [...attempts.values()].sort((a, b) => b.startedAt - a.startedAt);
}

export function subscribeToSaleAttempts(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(PREFIX)) onChange();
  };
  window.addEventListener(changed, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(changed, onChange);
    window.removeEventListener('storage', onStorage);
  };
}
