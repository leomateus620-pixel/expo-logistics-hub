import type { PersistedClient } from '@tanstack/react-query-persist-client';

/** Drop commercial inventories and confidential financial caches before hydration.
 * The live QueryClient retains coherent in-memory results through ordinary refetches. */
export function deserializeQueryCache(serialized: string): PersistedClient {
  const client = JSON.parse(serialized) as PersistedClient;
  client.clientState.queries = client.clientState.queries.filter(
    (query) => query.queryKey[0] !== 'commercial-map' && query.queryKey[0] !== 'financial-operational',
  );
  return client;
}
