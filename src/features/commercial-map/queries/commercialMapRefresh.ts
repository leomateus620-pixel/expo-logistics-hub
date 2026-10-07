import type { QueryClient } from '@tanstack/react-query';

export const COMMERCIAL_MAP_REFRESH_DEBOUNCE_MS = 400;
const MAP_KEY = ['commercial-map'] as const;

/** Diagnóstico leve (sem dados pessoais) das decisões de sincronização. */
export function recordCommercialMapSync(event: string, detail?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const log = ((window as unknown as { __commercialMapSync?: unknown[] }).__commercialMapSync ??= []);
  log.push({ event, at: Date.now(), ...detail });
  if (log.length > 50) log.shift();
}

interface PendingRefresh { timer: ReturnType<typeof setTimeout>; promise: Promise<void>; resolve: () => void }
const pendingByClient = new WeakMap<QueryClient, PendingRefresh>();

/**
 * Único ponto de recarga do Mapa Comercial após vendas/edições. Agrupa pedidos
 * próximos numa só recarga e nunca cancela uma carga em andamento. Se uma carga
 * antiga estiver em curso, ela não reflete a gravação: fica registrada UMA
 * atualização pendente, executada assim que essa carga termina.
 */
export function scheduleCommercialMapRefresh(queryClient: QueryClient, delayMs = COMMERCIAL_MAP_REFRESH_DEBOUNCE_MS): Promise<void> {
  const current = pendingByClient.get(queryClient);
  if (current) {
    clearTimeout(current.timer);
    current.timer = setTimeout(() => flush(queryClient), delayMs);
    return current.promise;
  }
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  pendingByClient.set(queryClient, { timer: setTimeout(() => flush(queryClient), delayMs), promise, resolve });
  return promise;
}

function fetchingMapQueries(queryClient: QueryClient) {
  return queryClient.getQueryCache().findAll({ queryKey: MAP_KEY, fetchStatus: 'fetching' });
}

function waitForIdle(queryClient: QueryClient): Promise<void> {
  if (fetchingMapQueries(queryClient).length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = queryClient.getQueryCache().subscribe(() => {
      if (fetchingMapQueries(queryClient).length > 0) return;
      unsubscribe();
      resolve();
    });
  });
}

function flush(queryClient: QueryClient) {
  const pending = pendingByClient.get(queryClient);
  if (!pending) return;
  pendingByClient.delete(queryClient);
  const inFlight = fetchingMapQueries(queryClient).length > 0;
  if (inFlight) recordCommercialMapSync('refresh-pending-after-inflight');
  void waitForIdle(queryClient)
    .then(() => queryClient.invalidateQueries({ queryKey: MAP_KEY }, { cancelRefetch: false }))
    .catch(() => undefined)
    .finally(pending.resolve);
}
