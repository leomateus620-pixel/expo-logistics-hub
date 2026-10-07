import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const COMMERCIAL_MAP_REVISION_INTERVAL_MS = 60_000;

// RPC criada depois do snapshot de tipos gerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function fetchCommercialMapRevision(projectId: string): Promise<string | null> {
  const { data, error } = await db.rpc('commercial_map_revision', { p_project_id: projectId });
  if (error) throw error;
  return typeof data === 'string' ? data : null;
}

/**
 * Consulta só a assinatura do estado comercial; o mapa completo é recarregado
 * apenas quando ela muda (ou quando a última carga falhou).
 */
export function useCommercialMapRevision({ projectId, enabled, isFetching, hasError, refetch,
  intervalMs = COMMERCIAL_MAP_REVISION_INTERVAL_MS, fetchRevision = fetchCommercialMapRevision }: {
  projectId: string | null | undefined;
  enabled: boolean;
  isFetching: boolean;
  hasError: boolean;
  refetch: (options: { cancelRefetch: false }) => Promise<unknown>;
  intervalMs?: number;
  fetchRevision?: (projectId: string) => Promise<string | null>;
}) {
  const known = useRef<{ projectId: string; revision: string | null } | null>(null);
  const checking = useRef(false);
  const latest = useRef({ isFetching, hasError, refetch, fetchRevision });
  latest.current = { isFetching, hasError, refetch, fetchRevision };

  // A carga completa recém-concluída define a nova referência.
  useEffect(() => {
    if (!isFetching && known.current && known.current.projectId !== projectId) known.current = null;
  }, [isFetching, projectId]);

  const check = useCallback(async () => {
    if (!enabled || !projectId || checking.current || latest.current.isFetching) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    checking.current = true;
    try {
      const revision = await latest.current.fetchRevision(projectId);
      const previous = known.current?.projectId === projectId ? known.current.revision : undefined;
      known.current = { projectId, revision };
      if ((previous !== undefined && previous !== revision) || latest.current.hasError) {
        await latest.current.refetch({ cancelRefetch: false });
      }
    } catch {
      // Falha da verificação leve não derruba o mapa; a próxima tentativa decide.
    } finally {
      checking.current = false;
    }
  }, [enabled, projectId]);

  useEffect(() => {
    if (!enabled || !projectId) return undefined;
    void check();
    const timer = window.setInterval(() => { void check(); }, intervalMs);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [check, enabled, intervalMs, projectId]);

  return check;
}
