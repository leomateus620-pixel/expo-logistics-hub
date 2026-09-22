/** Explicit opt-in for a production QA build. No commercial rows or credentials. */
export const commercialMapDiagnosticsEnabled = import.meta.env.DEV
  || import.meta.env.VITE_COMMERCIAL_MAP_DIAGNOSTICS === 'true';

export interface PerformanceEvent {
  name: string;
  at: number;
  duration?: number;
  failed?: boolean;
  detail?: Record<string, unknown>;
}

export interface CommercialMapBootSnapshot {
  startedAt: number;
  marks: Readonly<Record<string, number>>;
  interactive: boolean;
  commercialMapReady: boolean;
  failed: boolean;
}

let snapshot: CommercialMapBootSnapshot = { startedAt: 0, marks: {}, interactive: false, commercialMapReady: false, failed: false };
const listeners = new Set<() => void>();
let longTaskObserver: PerformanceObserver | undefined;
let notificationPending = false;
let publicationPending = false;
let bootSession = 0;
let bootActive = false;
let claimedBootSession = -1;
let bootVisitOwner: object | string | undefined;
const syncTotals: Record<string, number> = {};
const PREFIX = 'commercial-map:';

/** Capture ownership when an asynchronous operation starts. A prewarm or an
 * obsolete route must never publish completion into a later route's boot. */
export type CommercialMapStageRecorder = (stage: string, detail?: Record<string, unknown>) => void;
export function captureCommercialMapStageRecorder(): CommercialMapStageRecorder {
  const session = bootSession;
  const active = bootActive;
  return (stage, detail) => {
    if (!active || !bootActive || session !== bootSession) return;
    markCommercialMapStage(stage, typeof detail?.duration === 'number' ? detail.duration : undefined,
      typeof detail?.failed === 'boolean' ? detail.failed : undefined, detail);
  };
}

function notifyBootListeners() {
  if (notificationPending) return;
  notificationPending = true;
  queueMicrotask(() => {
    notificationPending = false;
    listeners.forEach((listener) => listener());
  });
}

export const getCommercialMapBootSnapshot = () => snapshot;
/** Context recovery must pass the same presentation barrier as the first visit. */
export function resetCommercialMapReady() {
  snapshot = { ...snapshot, commercialMapReady: false, interactive: false, failed: false };
  notifyBootListeners();
}
export const subscribeCommercialMapBoot = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** A route session, not a query/refetch or environment toggle. No commercial payloads. */
export function beginCommercialMapBoot() {
  bootSession += 1;
  bootActive = true;
  // Always relative to the actual route activation, never to Portal dwell time.
  // Document navigation remains a separate clock in the diagnostic summary.
  snapshot = { startedAt: performance.now(), marks: {}, interactive: false, commercialMapReady: false, failed: false };
  for (const name of Object.keys(syncTotals)) delete syncTotals[name];
  if (commercialMapDiagnosticsEnabled && typeof window !== 'undefined') {
    window.__commercialMapPerformance = { events: [], longTasks: [] };
    longTaskObserver?.disconnect();
    if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      longTaskObserver = new PerformanceObserver((list) => {
        const tasks = window.__commercialMapPerformance?.longTasks;
        if (!tasks) return;
        for (const entry of list.getEntries()) tasks.push({ at: entry.startTime, duration: entry.duration });
        if (tasks.length > 500) tasks.splice(0, tasks.length - 500);
      });
      longTaskObserver.observe({ type: 'longtask', buffered: false });
    }
  }
  for (const entry of performance.getEntriesByType?.('mark') ?? []) if (entry.name.startsWith(PREFIX)) performance.clearMarks(entry.name);
  for (const entry of performance.getEntriesByType?.('measure') ?? []) if (entry.name.startsWith(PREFIX)) performance.clearMeasures(entry.name);
  markCommercialMapStage('module-requested');
}

/** Called by the page before queries or renderer children. A newly resolved
 * lazy factory already opened the session; a cached SPA revisit needs a new
 * one. Ordinary page rerenders/refetches retain their existing owner. */
export function claimCommercialMapBootVisit(owner: object | string) {
  if (bootVisitOwner === owner && claimedBootSession === bootSession) return false;
  const cachedVisit = claimedBootSession === bootSession;
  if (cachedVisit || !bootActive) beginCommercialMapBoot();
  bootVisitOwner = owner;
  claimedBootSession = bootSession;
  if (cachedVisit) markCommercialMapStage('module-ready');
  return true;
}

export function releaseCommercialMapBootVisit(owner: object | string) {
  if (bootVisitOwner === owner) {
    bootVisitOwner = undefined;
    // A successor's lazy factory can start before the previous page's queued
    // cleanup. That older page must not close the new, still-unclaimed boot.
    if (claimedBootSession === bootSession) {
      bootActive = false;
      longTaskObserver?.disconnect();
    }
  }
}

/** Durations overlap: do not add these independent critical-path spans together. */
export function summarizeCommercialMapBoot() {
  const m = snapshot.marks;
  const span = (start: string, end: string) => m[start] !== undefined && m[end] !== undefined
    ? Math.round(m[end] - m[start]) : null;
  return {
    routeStartedAt: snapshot.startedAt,
    documentToInteractiveMs: m['first-interactive'] === undefined ? null : Math.round(m['first-interactive']),
    navigationToModuleMs: m['module-requested'] === undefined ? null : Math.round(m['module-requested'] - snapshot.startedAt),
    moduleMs: span('module-requested', 'module-ready'),
    rendererModuleMs: span('renderer-module-requested', 'renderer-module-ready'),
    dataMs: span('essential-data:start', 'essential-data:end'),
    routeDataWaitMs: span('route-data-wait:start', 'route-data-wait:end'),
    rendererMs: span('renderer:create:start', 'renderer:create:end'),
    headquartersWorkerMs: span('b12-worker:start', 'b12-worker:end'),
    webglContextMs: span('webgl-context:start', 'webgl-context:end'),
    sceneMs: span('critical-scene:start', 'critical-scene:end'),
    entityGeometryCpuMs: syncTotals['geometry-preparation'] ?? null,
    environmentMaterialMs: span('environment:materials:start', 'environment:materials:end'),
    proceduralTextureCpuMs: syncTotals.textures ?? null,
    textureUploadMs: span('texture-upload:start', 'texture-upload:end'),
    cpuStagesMs: Object.fromEntries(Object.entries(syncTotals).map(([name, duration]) => [name, Math.round(duration)])),
    shaderDirectMs: span('compile-direct:start', 'compile-direct:end'),
    shaderPostMs: span('compile-post:start', 'compile-post:end'),
    shadowMs: span('shadow-preparation:start', 'shadow-preparation:end'),
    postprocessingMs: span('postprocessing:start', 'postprocessing:end'),
    physicsMs: span('physics-preparation:start', 'physics-preparation:end'),
    firstDrawMs: span('first-frame-requested', 'first-draw'),
    interactiveMs: m['first-interactive'] === undefined ? null : Math.round(m['first-interactive'] - snapshot.startedAt),
    controlsResponseMs: span('controls-input', 'controls-responsive'),
    hydrationMs: span('first-interactive', 'secondary-hydration-complete'),
  };
}

declare global {
  interface Window {
    __commercialMapPerformance?: { events: PerformanceEvent[]; longTasks?: { at: number; duration: number }[]; summary?: ReturnType<typeof summarizeCommercialMapBoot> };
  }
}

export function markCommercialMapStage(name: string, duration?: number, failed?: boolean, detail?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !bootActive) return;
  const at = performance.now();
  const first = snapshot.marks[name] === undefined;
  if (first || failed || (name === 'essential-data:end' && snapshot.failed)
    || (name === 'commercial-map-ready' && !snapshot.commercialMapReady)
    || (name === 'first-interactive' && !snapshot.interactive)) {
    snapshot = { ...snapshot, marks: first ? { ...snapshot.marks, [name]: at } : snapshot.marks,
      interactive: snapshot.interactive || name === 'first-interactive',
      commercialMapReady: snapshot.commercialMapReady || name === 'commercial-map-ready',
      failed: name === 'essential-data:end' || name === 'essential-scene:failed' ? Boolean(failed) : snapshot.failed };
    notifyBootListeners();
  }
  const markName = PREFIX + name;
  performance.clearMarks?.(markName);
  performance.mark?.(markName);
  if (name.endsWith(':end') && performance.measure) {
    const start = PREFIX + name.replace(/:end$/, ':start');
    if (performance.getEntriesByName(start, 'mark').length) {
      const measure = PREFIX + name.slice(0, -4);
      performance.clearMeasures(measure);
      performance.measure(measure, start, markName);
    }
  }
  if (!commercialMapDiagnosticsEnabled) return;
  const diagnostics = window.__commercialMapPerformance ??= { events: [] };
  diagnostics.events.push({ name, at, duration, failed, detail });
  if (diagnostics.events.length > 500) diagnostics.events.splice(0, diagnostics.events.length - 500);
  diagnostics.summary = summarizeCommercialMapBoot();
  if (!publicationPending) {
    publicationPending = true;
    requestAnimationFrame(() => {
      publicationPending = false;
      document.documentElement.dataset.commercialMapPerformance = JSON.stringify(window.__commercialMapPerformance);
    });
  }
  if (first && name === 'first-interactive') console.table({ 'MAP BOOT (ms; overlapping spans)': diagnostics.summary });
}

export function measureCommercialMapSync<T>(name: string, task: () => T): T {
  const start = performance.now();
  markCommercialMapStage(`${name}:start`);
  try { return task(); }
  finally {
    const duration = performance.now() - start;
    if (!snapshot.interactive) syncTotals[name] = (syncTotals[name] ?? 0) + duration;
    markCommercialMapStage(`${name}:end`, duration);
  }
}

export async function measureCommercialMapStage<T>(name: string, task: () => PromiseLike<T>): Promise<T> {
  const start = performance.now();
  const record = captureCommercialMapStageRecorder();
  record(`${name}:start`);
  try {
    const result = await task();
    record(`${name}:end`, { duration: performance.now() - start });
    return result;
  } catch (error) {
    record(`${name}:end`, { duration: performance.now() - start, failed: true });
    throw error;
  }
}
