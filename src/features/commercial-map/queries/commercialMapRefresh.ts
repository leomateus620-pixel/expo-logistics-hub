import type { QueryClient } from '@tanstack/react-query';

export const COMMERCIAL_MAP_REFRESH_DEBOUNCE_MS = 400;

interface PendingRefresh { timer: ReturnType<typeof setTimeout>; promise: Promise<void>; resolve: () => void }
const pendingByClient = new WeakMap<QueryClient, PendingRefresh>();

/**
 * Único ponto de recarga do Mapa Comercial após vendas/edições. Agrupa pedidos
 * próximos numa só recarga e nunca cancela uma carga completa em andamento —
 * cancelar e recomeçar a cada ação era o que multiplicava as consultas pesadas.
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

function flush(queryClient: QueryClient) {
  const pending = pendingByClient.get(queryClient);
  if (!pending) return;
  pendingByClient.delete(queryClient);
  void queryClient.invalidateQueries({ queryKey: ['commercial-map'] }, { cancelRefetch: false })
    .catch(() => undefined)
    .finally(pending.resolve);
}
