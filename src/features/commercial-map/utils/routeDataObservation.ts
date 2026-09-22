import type { CommercialMapStageRecorder } from './performanceDiagnostics';

export type CommercialMapRouteDataSource = 'cold' | 'prefetched' | 'cached';

/** Capture before the route creates its QueryObserver; otherwise its own cold
 * fetch would be mistaken for an existing prewarm. No cache payload is emitted. */
export function createCommercialMapRouteDataObservation(
  initial: { data?: unknown; fetchStatus?: 'fetching' | 'paused' | 'idle' } | undefined,
  record: CommercialMapStageRecorder,
) {
  const source: CommercialMapRouteDataSource = initial?.data !== undefined ? 'cached'
    : initial?.fetchStatus === 'fetching' ? 'prefetched' : 'cold';
  const startedAt = performance.now();
  let complete = false;
  record('route-data:source', { source });
  record('route-data-wait:start');
  return {
    source,
    observe(ready: boolean, failed: boolean) {
      if (complete || (!ready && !failed)) return;
      complete = true;
      record('route-data-wait:end', { source, duration: performance.now() - startedAt, failed: !ready && failed });
    },
  };
}
