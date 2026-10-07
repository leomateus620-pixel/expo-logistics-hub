import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { recordCommercialMapSync } from '../queries/commercialMapRefresh';
import { useSalesStore } from '../sales/useSalesSelection';

export const COMMERCIAL_MAP_REVISION_INTERVAL_MS = 60_000;
/** Falhas seguidas ou tempo sem verificação bem-sucedida que tornam a atualização "não confirmada". */
export const COMMERCIAL_MAP_REVISION_MAX_FAILURES = 3;
export const COMMERCIAL_MAP_REVISION_STALE_MS = 5 * 60_000;
/** Intervalo mínimo entre recargas completas de recuperação (falha de verificação ou de carga). */
export const COMMERCIAL_MAP_RECOVERY_MIN_INTERVAL_MS = 3 * 60_000;
const REVISION_TIMEOUT_MS = 15_000;

// RPC criada depois do snapshot de tipos gerados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function fetchCommercialMapRevision(projectId: string, signal?: AbortSignal): Promise<string | null> {
  const request = db.rpc('commercial_map_revision', { p_project_id: projectId });
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw error;
  return typeof data === 'string' ? data : null;
}

export interface CommercialMapRevisionState {
  check: () => Promise<void>;
  /** true após falhas seguidas/tempo limite: a tela não pode afirmar que está atualizada. */
  unconfirmed: boolean;
  lastConfirmedAt: number | null;
}

/**
 * Verificação leve do estado comercial. A referência é sempre a revisão lida
 * junto com o inventário carregado (`dataRevision`) — nunca uma revisão mais nova
 * adotada sobre dados antigos. Recarga completa só quando a assinatura difere,
 * ou uma única recuperação espaçada quando a verificação/carga falha em sequência.
 */
export function useCommercialMapRevision({ projectId, dataRevision, enabled, isFetching, hasError, refetch,
  intervalMs = COMMERCIAL_MAP_REVISION_INTERVAL_MS, fetchRevision = fetchCommercialMapRevision, now = Date.now }: {
  projectId: string | null | undefined;
  dataRevision: string | null | undefined;
  enabled: boolean;
  isFetching: boolean;
  hasError: boolean;
  refetch: (options: { cancelRefetch: false }) => Promise<unknown>;
  intervalMs?: number;
  fetchRevision?: (projectId: string, signal?: AbortSignal) => Promise<string | null>;
  now?: () => number;
}): CommercialMapRevisionState {
  const checking = useRef(false);
  const requestedFor = useRef<string | null>(null);
  const failures = useRef(0);
  const lastConfirmed = useRef<number | null>(null);
  const lastRecovery = useRef(0);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [lastConfirmedAt, setLastConfirmedAt] = useState<number | null>(null);
  const latest = useRef({ isFetching, hasError, refetch, fetchRevision, dataRevision, now });
  latest.current = { isFetching, hasError, refetch, fetchRevision, dataRevision, now };

  // Novos dados carregados liberam um novo pedido para a mesma assinatura.
  useEffect(() => { if (dataRevision && requestedFor.current === dataRevision) requestedFor.current = null; }, [dataRevision]);
  useEffect(() => { failures.current = 0; lastConfirmed.current = null; requestedFor.current = null; setUnconfirmed(false); }, [projectId]);

  const recover = useCallback(async (reason: string) => {
    const at = latest.current.now();
    if (at - lastRecovery.current < COMMERCIAL_MAP_RECOVERY_MIN_INTERVAL_MS) return;
    lastRecovery.current = at;
    recordCommercialMapSync('recovery-refetch', { reason });
    await latest.current.refetch({ cancelRefetch: false });
  }, []);

  const check = useCallback(async () => {
    if (!enabled || !projectId || checking.current || latest.current.isFetching) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    // Modo Vendas aberto: não disputa o servidor com o carrinho; retoma ao sair.
    if (useSalesStore.getState().salesModeActive) return;
    checking.current = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REVISION_TIMEOUT_MS);
    try {
      const revision = await latest.current.fetchRevision(projectId, controller.signal);
      failures.current = 0;
      lastConfirmed.current = latest.current.now();
      setLastConfirmedAt(lastConfirmed.current);
      setUnconfirmed(false);
      const loaded = latest.current.dataRevision;
      if (latest.current.hasError) {
        await recover('load-error');
      } else if (revision && revision !== loaded && requestedFor.current !== revision) {
        requestedFor.current = revision;
        recordCommercialMapSync('revision-changed');
        await latest.current.refetch({ cancelRefetch: false });
      }
    } catch {
      failures.current += 1;
      const since = lastConfirmed.current ?? null;
      const tooOld = since !== null && latest.current.now() - since >= COMMERCIAL_MAP_REVISION_STALE_MS;
      recordCommercialMapSync('revision-failed', { failures: failures.current });
      // Um tempo esgotado isolado nunca exibe aviso.
      if (failures.current >= COMMERCIAL_MAP_REVISION_MAX_FAILURES || (tooOld && failures.current >= 2)) {
        setUnconfirmed(true);
        await recover('revision-failures').catch(() => undefined);
      }
    } finally {
      clearTimeout(timer);
      checking.current = false;
    }
  }, [enabled, projectId, recover]);

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

  return { check, unconfirmed, lastConfirmedAt };
}
