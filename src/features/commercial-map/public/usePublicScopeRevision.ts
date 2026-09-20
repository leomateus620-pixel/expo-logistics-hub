import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPublicScopeRevision } from './publicMapService';

/** Defasagem máxima aceita com a página ativa e conectada. */
export const PUBLIC_MAP_REVISION_POLL_MS = 15_000;

/**
 * Observa a revisão oficial do escopo e recarrega os dados públicos quando ela
 * muda. Nada de Realtime sobre tabelas internas: só esta RPC validada por token.
 */
export function usePublicScopeRevision(slug: string, token: string) {
  const queryClient = useQueryClient();
  const lastRevision = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ['public-map', 'revision', slug, token],
    queryFn: () => fetchPublicScopeRevision(slug, token),
    enabled: Boolean(slug && token),
    refetchInterval: PUBLIC_MAP_REVISION_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
    retry: false,
    meta: { persist: false },
  });

  const revision = query.data?.revision ?? null;

  useEffect(() => {
    if (!revision) return;
    if (lastRevision.current === null) {
      lastRevision.current = revision;
      return;
    }
    if (lastRevision.current === revision) return;
    lastRevision.current = revision;
    // Invalida somente o namespace público desta área (inventário, geometria,
    // preços, somatórios, disponibilidade e ficha do lote).
    void queryClient.invalidateQueries({
      predicate: (item) => {
        const key = item.queryKey as unknown[];
        return key[0] === 'public-map' && key[1] !== 'revision' && key.includes(slug) && key.includes(token);
      },
    });
  }, [queryClient, revision, slug, token]);

  // Revalida ao voltar para a aba e ao recuperar conexão, sem esperar o poll.
  useEffect(() => {
    if (!slug || !token) return undefined;
    const revalidate = () => {
      if (document.visibilityState === 'visible') void query.refetch();
    };
    document.addEventListener('visibilitychange', revalidate);
    window.addEventListener('online', revalidate);
    return () => {
      document.removeEventListener('visibilitychange', revalidate);
      window.removeEventListener('online', revalidate);
    };
  }, [query, slug, token]);

  return { revision, lotCount: query.data?.lotCount ?? null };
}
