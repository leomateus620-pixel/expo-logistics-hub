import { captureCommercialMapStageRecorder, type CommercialMapStageRecorder } from '../../../utils/performanceDiagnostics';
import type { PackedHeadquartersGeometry } from './headquartersGeometryPacking';
import type { HeadquartersWorkerResponse } from './headquartersGeometryWorker';

export interface HeadquartersPreparationWorker {
  onmessage: ((event: MessageEvent<HeadquartersWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (request: string) => void;
  terminate: () => void;
}

/** One bounded CPU payload per module. A pending worker may finish after route
 * exit; it terminates on success/failure/timeout and cannot retain a WebGL owner.
 * Every mounted consumer separately reconstructs and disposes its own geometry. */
export function createHeadquartersPreparationResource({
  createWorker,
  fallback,
  timeoutMs = 8_000,
}: {
  createWorker: () => HeadquartersPreparationWorker;
  fallback: () => Promise<PackedHeadquartersGeometry>;
  timeoutMs?: number;
}) {
  let pending: Promise<PackedHeadquartersGeometry> | undefined;
  let fallbackPending: Promise<PackedHeadquartersGeometry> | undefined;
  let workerFailed = false;
  let ready: PackedHeadquartersGeometry | undefined;
  let failure: unknown;
  let failed = false;
  const preload = (recordStage: CommercialMapStageRecorder = captureCommercialMapStageRecorder()) => {
    if (pending) { recordStage('b12-worker:cached', { source: ready ? 'cached' : 'prefetched' }); return pending; }
    recordStage('b12-worker:start', { source: 'cold' });
    const work = new Promise<PackedHeadquartersGeometry>((resolve, reject) => {
      let worker: HeadquartersPreparationWorker | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let finished = false;
      const cleanup = () => {
        clearTimeout(timer);
        if (!worker) return;
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
      };
      const finish = (packed?: PackedHeadquartersGeometry, error?: unknown) => {
        if (finished) return;
        finished = true;
        cleanup();
        if (packed) resolve(packed);
        else reject(error);
      };
      try {
        worker = createWorker();
        worker.onmessage = ({ data }) => {
          if (data.ok === true) finish(data.packed);
          else finish(undefined, new Error(data.error));
        };
        worker.onerror = (event) => { event.preventDefault?.(); finish(undefined, new Error(event.message || 'B12 worker failed')); };
        timer = setTimeout(() => finish(undefined, new Error('B12 worker preparation timed out')), timeoutMs);
        worker.postMessage('prepare');
      } catch (error) { finish(undefined, error); }
    });
    pending = work.then((packed) => {
      ready = packed;
      recordStage('b12-worker-geometry', { duration: packed.timings.geometryMs });
      recordStage('b12-worker-contact', { duration: packed.timings.contactMs });
      recordStage('b12-worker:end');
      return packed;
    }, (error: unknown) => {
      workerFailed = true;
      recordStage('b12-worker:end', { failed: true });
      throw error;
    });
    // A failed warm preload must not start expensive main-thread preparation
    // after navigation away. Reject the wakeable so an actual mounted Suspense
    // consumer retries read(), where the one fallback job may be admitted.
    void pending.catch(() => undefined);
    return pending;
  };
  return {
    preload,
    read() {
      if (ready) return ready;
      if (failed) throw failure;
      if (workerFailed) {
        if (!fallbackPending) {
          const recordStage = captureCommercialMapStageRecorder();
          recordStage('b12-worker:fallback');
          recordStage('b12-fallback:start');
          fallbackPending = Promise.resolve().then(fallback).then((packed) => {
            ready = packed;
            recordStage('b12-fallback-geometry', { duration: packed.timings.geometryMs });
            recordStage('b12-fallback-contact', { duration: packed.timings.contactMs });
            recordStage('b12-fallback:end');
            return packed;
          }, (error: unknown) => {
            failed = true;
            failure = error;
            recordStage('b12-fallback:end', { failed: true });
            throw error;
          });
          void fallbackPending.catch(() => undefined);
        }
        throw fallbackPending;
      }
      throw preload();
    },
  };
}

const preparation = createHeadquartersPreparationResource({
  createWorker: () => new Worker(new URL('./headquartersGeometryWorker.ts', import.meta.url), { type: 'module', name: 'fenasoja-b12-geometry' }),
  fallback: async () => (await import('./headquartersGeometryPreparation')).preparePackedHeadquartersGeometry(),
});

/** Lightweight early entry point: safe to start alongside renderer/data preload. */
export const preloadHeadquartersGeometry = preparation.preload;
/** Suspends the initial map until the major authored B12 structure exists. */
export const readPreparedHeadquartersGeometry = preparation.read;
