import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPublicScopeRevision, PublicMapAccessError } from './publicMapService';
export const PUBLIC_MAP_REVISION_POLL_MS = 15_000;

/** Poll only revisions after the authorized inventory has arrived. React Query
 * owns focus/reconnect refetches; no competing visibility listener. */
export function usePublicScopeRevision(slug: string, token: string, initialRevision?: string, initialContextRevision?: string) {
  const client = useQueryClient();
  const last = useRef({ scope: slug + token, revision: initialRevision, context: initialContextRevision, contextChecked: Date.now() });
  const query = useQuery({
    queryKey: ['public-map', 'revision', slug, token],
    queryFn: ({ signal }) => fetchPublicScopeRevision(slug, token, signal),
    enabled: Boolean(slug && token),
    initialData: initialRevision ? { slug, revision: initialRevision, contextRevision: initialContextRevision, lotCount: 0, serverTime: '' } : undefined,
    refetchInterval: PUBLIC_MAP_REVISION_POLL_MS, refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always', refetchOnReconnect: 'always',
    staleTime: PUBLIC_MAP_REVISION_POLL_MS, retry: false, meta: { persist: false },
  });
  useEffect(() => {
    if (!slug || !query.data) return;
    const next = query.data;
    const scope = slug + token;
    if (last.current.scope !== scope) last.current = { scope, revision: initialRevision, context: initialContextRevision, contextChecked: Date.now() };
    const changed = last.current.revision && last.current.revision !== next.revision;
    const contextChanged = next.contextRevision
      ? last.current.context !== next.contextRevision
      : Date.now() - last.current.contextChecked >= 60_000; // Compatible with the previous RPC during rollout.
    if (changed) void client.invalidateQueries({ predicate: item => {
      const key = item.queryKey;
      return key[0] === 'public-map' && (key[1] === 'inventory' || key[1] === 'lot') && key[2] === slug && key[3] === token;
    } });
    if (contextChanged) {
      void client.invalidateQueries({ queryKey: ['public-map', 'context', slug, token] });
      last.current.contextChecked = Date.now();
    }
    last.current.revision = next.revision;
    last.current.context = next.contextRevision;
  }, [client, initialContextRevision, initialRevision, query.data, slug, token]);
  useEffect(() => {
    if (!(query.error instanceof PublicMapAccessError)) return;
    // A revoked token must retire the already displayed inventory too.
    void client.invalidateQueries({ queryKey: ['public-map', 'inventory', slug, token] });
  }, [client, query.error, slug, token]);
  return { revision: query.data?.revision ?? null, lotCount: query.data?.lotCount ?? null };
}
