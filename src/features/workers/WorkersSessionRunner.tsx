import { useEffect } from 'react';
import { callWorkerWorkspace } from './workspace-api';
import type { WorkspaceSnapshot } from './workspace-contracts';

/** Valid JWT only; no stored credentials, delegated tokens or background third-party notifications. */
export default function WorkersSessionRunner({ orgId, userId }: { orgId: string; userId: string }) {
  useEffect(() => {
    let stopped = false; let running = false;
    let controller: AbortController | null = null;
    const tick = async () => {
      if (stopped || running || document.visibilityState !== 'visible') return;
      running = true; controller = new AbortController();
      try {
        const snapshot = await callWorkerWorkspace({ command: 'snapshot', orgId }, controller.signal) as WorkspaceSnapshot;
        if (stopped || document.visibilityState !== 'visible') return;
        // The server also marks expired leases as due, even when the next calendar occurrence is in the future.
        const due = snapshot.routines.some(routine => routine.state === 'active' && routine.canRunNow);
        if (!due) return;
        await callWorkerWorkspace({ command: 'executeDue', orgId, requestId: crypto.randomUUID() }, controller.signal);
        if (!stopped) window.dispatchEvent(new CustomEvent('workers-workspace-updated', { detail: { orgId } }));
      } catch { /* No retry loop: the next visible-session tick revalidates the JWT and DB lease. */ }
      finally { running = false; }
    };
    const visibility = () => {
      if (document.visibilityState === 'visible') void tick();
      else controller?.abort();
    };
    void tick();
    const timer = window.setInterval(() => { void tick(); }, 60_000);
    document.addEventListener('visibilitychange', visibility);
    return () => { stopped = true; controller?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [orgId, userId]);
  return null;
}
