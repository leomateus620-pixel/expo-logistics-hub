import { useCallback, useContext, useEffect, useRef } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { browserPrewarmEnvironment, commercialMapPrewarmTasks, createCommercialMapPrewarm } from '../utils/commercialMapPrewarm';
import { commercialMapQueryKey, FULL_COMMERCIAL_MAP_SCOPE } from '../queries/commercialMapQueryKey';

export interface CommercialMapPrewarmAccess { userId?: string | null; orgId?: string | null; authorized: boolean; paused?: boolean }

/** Optional portal enhancement. It never renders a map or substitutes a guard. */
export function useCommercialMapPrewarm(access: CommercialMapPrewarmAccess) {
  const queryClient = useContext(QueryClientContext);
  const latest = useRef(access); latest.current = access;
  const controller = useRef<ReturnType<typeof createCommercialMapPrewarm> | null>(null);
  const { userId, orgId, authorized } = access;
  useEffect(() => {
    if (!queryClient || !authorized || !userId || !orgId) return;
    const allowed = () => latest.current.authorized && latest.current.userId === userId && latest.current.orgId === orgId;
    const environment = browserPrewarmEnvironment();
    const visible = environment.visible;
    environment.visible = () => visible() && !latest.current.paused;
    const session = createCommercialMapPrewarm({ authorized: allowed, environment,
      tasks: commercialMapPrewarmTasks(queryClient, userId, orgId) });
    controller.current = session;
    session.schedule();
    return () => {
      const revoked = !allowed();
      session.dispose({ abortRunning: revoked || !session.snapshot().handedOff });
      if (controller.current === session) controller.current = null;
      if (revoked) {
        // Exact full-map identity only: never cancel another user's query or a
        // commission request. AuthProvider also clears all queries on signout.
        const queryKey = commercialMapQueryKey(userId, orgId, FULL_COMMERCIAL_MAP_SCOPE);
        void queryClient.cancelQueries({ queryKey, exact: true });
        queryClient.removeQueries({ queryKey, exact: true });
      }
    };
  }, [queryClient, userId, orgId, authorized]);
  useEffect(() => { if (!access.paused) controller.current?.schedule(); }, [access.paused]);
  const onIntent = useCallback(() => { controller.current?.promote(); }, []);
  const onNavigate = useCallback(() => { controller.current?.handoff(); }, []);
  return { onIntent, onNavigate };
}
