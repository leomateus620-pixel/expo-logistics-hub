import type { PersistedClient } from '@tanstack/react-query-persist-client';

/** Drop historical commercial inventories before hydration, including old caches.
 * The live QueryClient still retains the map through ordinary refetches. */
export function deserializeQueryCache(serialized: string): PersistedClient {
  const client = JSON.parse(serialized) as PersistedClient;
  client.clientState.queries = client.clientState.queries.filter(
    (query) => query.queryKey[0] !== 'commercial-map',
  );
  return client;
}
