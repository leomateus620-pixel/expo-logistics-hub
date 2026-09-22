import type { QueryClient } from '@tanstack/react-query';
import { commercialMapDiagnosticsEnabled, type CommercialMapStageRecorder } from './performanceDiagnostics';
import { throwIfMapRequestAborted } from './commercialMapOperation';

export type CommercialMapPrewarmStage = 'modules' | 'data' | 'cpu' | 'assets';
export interface CommercialMapPrewarmTasks {
  modules: (record: CommercialMapStageRecorder, signal: AbortSignal) => Promise<unknown>;
  data: (record: CommercialMapStageRecorder, signal: AbortSignal) => Promise<unknown>;
  cpu: (record: CommercialMapStageRecorder, signal: AbortSignal) => Promise<unknown>;
  assets: (record: CommercialMapStageRecorder, signal: AbortSignal) => Promise<unknown>;
}
export interface CommercialMapPrewarmEnvironment {
  visible(): boolean;
  constrained(): boolean;
  schedule(callback: () => void, urgent: boolean): () => void;
  subscribeVisible(callback: () => void): () => void;
}
const STAGES: readonly CommercialMapPrewarmStage[] = ['modules', 'data', 'cpu', 'assets'];
type StageState = 'pending' | 'running' | 'complete' | 'failed';
export interface CommercialMapPrewarmSnapshot {
  stages: Record<CommercialMapPrewarmStage, StageState>;
  promoted: boolean;
  handedOff: boolean;
  disposed: boolean;
}

/** Tiny injectable admission policy. Tests/QA can use fixture tasks with the
 * same scheduler; production supplies only authorized canonical query tasks. */
export function createCommercialMapPrewarm({ authorized, tasks, environment = browserPrewarmEnvironment(), record = createPortalPrewarmRecorder() }: {
  authorized: () => boolean;
  tasks: CommercialMapPrewarmTasks;
  environment?: CommercialMapPrewarmEnvironment;
  record?: CommercialMapStageRecorder;
}) {
  const state: CommercialMapPrewarmSnapshot = { stages: { modules: 'pending', data: 'pending', cpu: 'pending', assets: 'pending' },
    promoted: false, handedOff: false, disposed: false };
  const abort = new AbortController();
  let cancel: (() => void) | undefined;
  let running = false, started = false, complete = false;
  const eligible = () => !state.disposed && !state.handedOff && authorized() && environment.visible();
  const admit = () => {
    if (!eligible() || running || cancel || (environment.constrained() && !state.promoted)) return;
    const stage = STAGES.find(name => state.stages[name] !== 'complete');
    if (!stage || state.stages[stage] === 'failed') return;
    cancel = environment.schedule(() => {
      cancel = undefined;
      if (!eligible() || running) return;
      running = true; state.stages[stage] = 'running';
      if (!started) { started = true; record('start'); }
      const at = performance.now(); record(`${stage}:start`);
      void Promise.resolve().then(() => {
        throwIfMapRequestAborted(abort.signal);
        if (!authorized()) throw new DOMException('Map access changed', 'AbortError');
        return tasks[stage](record, abort.signal);
      }).then(() => {
        state.stages[stage] = 'complete';
        record(stage, { duration: performance.now() - at });
      }, error => {
        state.stages[stage] = 'failed';
        record(`${stage}:failed`, { duration: performance.now() - at, aborted: abort.signal.aborted || error?.name === 'AbortError' });
      }).finally(() => {
        running = false;
        if (STAGES.every(name => state.stages[name] === 'complete') && !complete) { complete = true; record('complete'); }
        admit();
      });
    }, state.promoted);
  };
  const unsubscribe = environment.subscribeVisible(admit);
  return {
    schedule: admit,
    promote() {
      if (state.disposed || state.handedOff || !authorized()) return;
      state.promoted = true;
      for (const stage of STAGES) if (state.stages[stage] === 'failed') state.stages[stage] = 'pending';
      cancel?.(); cancel = undefined;
      admit();
    },
    /** A click keeps already-started imports/query/worker reusable by the route;
     * its own preload admits any stages not yet started. */
    handoff() { state.handedOff = true; cancel?.(); cancel = undefined; unsubscribe(); record('handoff'); },
    dispose({ abortRunning = true }: { abortRunning?: boolean } = {}) {
      if (state.disposed) return;
      state.disposed = true; cancel?.(); cancel = undefined; unsubscribe();
      if (abortRunning) abort.abort();
    },
    snapshot: (): CommercialMapPrewarmSnapshot => ({ ...state, stages: { ...state.stages } }),
  };
}

export function browserPrewarmEnvironment(): CommercialMapPrewarmEnvironment {
  return {
    visible: () => typeof document !== 'undefined' && document.visibilityState !== 'hidden',
    constrained: () => {
      const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string; rtt?: number } }).connection;
      return Boolean(connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g');
    },
    schedule(callback, urgent) {
      let cancelled = false, frame = 0, nextFrame = 0, idle = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const run = () => { if (!cancelled) callback(); };
      if (urgent) timer = setTimeout(run, 0);
      else frame = requestAnimationFrame(() => {
        nextFrame = requestAnimationFrame(() => {
          if (typeof requestIdleCallback === 'function') idle = requestIdleCallback(run, { timeout: 2500 });
          else timer = setTimeout(run, navigator.hardwareConcurrency <= 2 ? 500 : 120);
        });
      });
      return () => { cancelled = true; cancelAnimationFrame(frame); cancelAnimationFrame(nextFrame); clearTimeout(timer);
        if (idle && typeof cancelIdleCallback === 'function') cancelIdleCallback(idle); };
    },
    subscribeVisible(callback) {
      document.addEventListener('visibilitychange', callback);
      return () => document.removeEventListener('visibilitychange', callback);
    },
  };
}

interface PrewarmEvent { name: string; at: number; detail?: Record<string, unknown> }
declare global { interface Window { __commercialMapPrewarm?: { events: PrewarmEvent[] } } }
export function createPortalPrewarmRecorder(): CommercialMapStageRecorder {
  return (stage, detail) => {
    if (typeof window === 'undefined' || !commercialMapDiagnosticsEnabled) return;
    const name = `portal-prewarm:${stage}`;
    performance.clearMarks?.(name); performance.mark?.(name);
    const diagnostics = window.__commercialMapPrewarm ??= { events: [] };
    diagnostics.events.push({ name, at: performance.now(), detail });
    if (diagnostics.events.length > 160) diagnostics.events.splice(0, diagnostics.events.length - 160);
  };
}

let artworkPending: Promise<void> | undefined;
/** Public branding used by the existing headquarters/event-center materials.
 * Browser HTTP/decode cache only; no Three texture and no WebGL context. */
function preloadCommercialMapArtwork() {
  return artworkPending ??= new Promise<void>((resolve, reject) => {
    const image = new Image(); image.decoding = 'async';
    image.onload = () => { image.onload = image.onerror = null; resolve(); };
    image.onerror = () => { image.onload = image.onerror = null; artworkPending = undefined; reject(new Error('Map artwork preload failed')); };
    image.src = '/alvorada/fenasoja-symbol-official.png';
    if (image.decode) void image.decode().then(() => { image.onload = image.onerror = null; resolve(); }, () => undefined);
  });
}

/** No static renderer/service import enters the Portal's initial bundle. */
export function commercialMapPrewarmTasks(queryClient: QueryClient, userId: string, orgId: string): CommercialMapPrewarmTasks {
  return {
    async modules(record, signal) {
      const route = await import('./loadCommercialMapRouteModule');
      record('modules:resource', { source: route.commercialMapRouteModuleState() });
      await route.loadCommercialMapRouteModule(); throwIfMapRequestAborted(signal);
      const canvas = await import('./preloadCanvas');
      await canvas.preloadCommercialMapCanvas({ prepareHeadquarters: false, recordStage: record });
    },
    async data(record, signal) {
      const query = await import('../queries/commercialMapQuery'); throwIfMapRequestAborted(signal);
      const options = query.commercialMapQueryOptions(userId, orgId, query.FULL_COMMERCIAL_MAP_SCOPE, record);
      const previous = queryClient.getQueryState(options.queryKey);
      record('data:resource', { source: previous?.data ? 'cached' : previous?.fetchStatus === 'fetching' ? 'prefetched' : 'cold' });
      await queryClient.prefetchQuery(options);
      throwIfMapRequestAborted(signal);
      const result = queryClient.getQueryState(options.queryKey);
      if (result?.status !== 'success') throw result?.error ?? new Error('Map prewarm did not produce a valid inventory');
    },
    async cpu(record, signal) {
      const hq = await import('../components/canvas/headquarters/headquartersPreparationResource');
      throwIfMapRequestAborted(signal); await hq.preloadHeadquartersGeometry(record);
    },
    async assets(record, signal) {
      throwIfMapRequestAborted(signal); record('assets:resource', { source: artworkPending ? 'cached' : 'cold' });
      await preloadCommercialMapArtwork();
    },
  };
}
