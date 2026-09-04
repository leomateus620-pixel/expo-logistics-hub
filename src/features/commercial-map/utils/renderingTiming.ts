import type { WebGLRenderer } from 'three';

export const COMMERCIAL_MAP_RENDER_TIMING_EVENT = 'commercial-map-render-timing';
const SAMPLE_LIMIT = 240;
const PENDING_LIMIT = 8;
const QUERY_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 100;
type TimingPath = 'post' | 'direct';
type GpuStatus = 'not-requested' | 'supported' | 'unavailable' | 'context-lost' | 'error';

export interface CommercialMapTimingDistribution {
  samples: number;
  averageMs: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
}

export interface CommercialMapRenderTimingSnapshot {
  enabled: boolean;
  gpuStatus: GpuStatus;
  sampleLimit: number;
  pendingQueries: number;
  droppedGpuQueries: number;
  disjointGpuQueries: number;
  cpu: CommercialMapTimingDistribution;
  gpu: CommercialMapTimingDistribution;
  paths: Record<TimingPath, { cpu: CommercialMapTimingDistribution; gpu: CommercialMapTimingDistribution }>;
}

interface TimerExtension {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}
interface TimingSample { path: TimingPath; cpuMs: number; gpuMs: number | null }
interface PendingQuery { query: WebGLQuery; sample: TimingSample; submittedAt: number }
interface TimingState {
  canvas: HTMLCanvasElement;
  context: WebGL2RenderingContext;
  extension: TimerExtension | null | undefined;
  gpuStatus: GpuStatus;
  samples: TimingSample[];
  pending: PendingQuery[];
  dropped: number;
  disjoint: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  lastPublishedAt: number;
}
export interface CommercialMapRenderTimingToken {
  /** Internal token: callers only pass it back to endCommercialMapRenderTiming. */
  state: TimingState;
  query: WebGLQuery | null;
  startedAt: number;
}

let enabled = false;
const canvasStates = new WeakMap<HTMLCanvasElement, TimingState>();
const activeStates = new Set<TimingState>();

function distribution(values: number[]): CommercialMapTimingDistribution {
  values.sort((a, b) => a - b);
  const round = (value: number) => Number(value.toFixed(3));
  return {
    samples: values.length,
    averageMs: values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null,
    p95Ms: values.length ? round(values[Math.ceil(values.length * 0.95) - 1]) : null,
    p99Ms: values.length ? round(values[Math.ceil(values.length * 0.99) - 1]) : null,
  };
}

function summarize(samples: TimingSample[]) {
  return {
    cpu: distribution(samples.map((sample) => sample.cpuMs)),
    gpu: distribution(samples.flatMap((sample) => sample.gpuMs === null ? [] : [sample.gpuMs])),
  };
}

/** CPU measures command submission only, not React/input work or animation-frame intervals. */
export function readCommercialMapRenderTiming(canvas?: HTMLCanvasElement): CommercialMapRenderTimingSnapshot {
  const state = canvas ? canvasStates.get(canvas) : activeStates.values().next().value as TimingState | undefined;
  const samples = state?.samples ?? [];
  return {
    enabled: import.meta.env.DEV && enabled,
    gpuStatus: state?.gpuStatus ?? 'not-requested',
    sampleLimit: SAMPLE_LIMIT,
    pendingQueries: state?.pending.length ?? 0,
    droppedGpuQueries: state?.dropped ?? 0,
    disjointGpuQueries: state?.disjoint ?? 0,
    ...summarize(samples),
    paths: {
      post: summarize(samples.filter((sample) => sample.path === 'post')),
      direct: summarize(samples.filter((sample) => sample.path === 'direct')),
    },
  };
}

function publish(state: TimingState, force = false) {
  const now = performance.now();
  if (!force && now - state.lastPublishedAt < 1000) return;
  state.lastPublishedAt = now;
  const snapshot = readCommercialMapRenderTiming(state.canvas);
  state.canvas.dataset.commercialMapRenderTiming = JSON.stringify(snapshot);
  state.canvas.dispatchEvent(new CustomEvent(COMMERCIAL_MAP_RENDER_TIMING_EVENT, { bubbles: true, detail: snapshot }));
}

function discardPending(state: TimingState, disjoint = false) {
  clearTimeout(state.timer);
  state.timer = undefined;
  const lost = state.context.isContextLost();
  for (const pending of state.pending) {
    if (!lost) state.context.deleteQuery(pending.query);
  }
  if (disjoint) state.disjoint += state.pending.length;
  else state.dropped += state.pending.length;
  state.pending.length = 0;
  if (lost) {
    state.gpuStatus = 'context-lost';
    state.extension = undefined;
  }
}

function poll(state: TimingState) {
  state.timer = undefined;
  if (!enabled || state.context.isContextLost()) {
    discardPending(state);
    publish(state, true);
    return;
  }
  const context = state.context;
  try {
    if (state.extension && context.getParameter(state.extension.GPU_DISJOINT_EXT)) {
      discardPending(state, true);
    } else {
      const now = performance.now();
      for (let index = state.pending.length - 1; index >= 0; index -= 1) {
        const pending = state.pending[index];
        // QUERY_RESULT is requested only after availability; never wait for GPU completion.
        if (context.getQueryParameter(pending.query, context.QUERY_RESULT_AVAILABLE)) {
          const nanoseconds = context.getQueryParameter(pending.query, context.QUERY_RESULT) as number;
          if (Number.isFinite(nanoseconds) && nanoseconds >= 0) pending.sample.gpuMs = nanoseconds / 1e6;
          else state.dropped += 1;
        } else if (now - pending.submittedAt <= QUERY_TIMEOUT_MS) continue;
        else state.dropped += 1;
        context.deleteQuery(pending.query);
        state.pending.splice(index, 1);
      }
    }
  } catch {
    state.gpuStatus = 'error';
    discardPending(state);
  }
  publish(state);
  if (state.pending.length) state.timer = setTimeout(() => poll(state), POLL_INTERVAL_MS);
}

export function setCommercialMapRenderTimingEnabled(next: boolean) {
  if (!import.meta.env.DEV) return;
  enabled = next;
  for (const state of activeStates) {
    if (!next) discardPending(state);
    publish(state, true);
  }
}

export function resetCommercialMapRenderTiming() {
  if (!import.meta.env.DEV) return;
  for (const state of activeStates) {
    discardPending(state);
    state.samples.length = 0;
    state.dropped = 0;
    state.disjoint = 0;
    publish(state, true);
  }
}

/** Called only behind import.meta.env.DEV; disabled by default and tree-shaken from production. */
export function beginCommercialMapRenderTiming(renderer: WebGLRenderer): CommercialMapRenderTimingToken | null {
  if (!import.meta.env.DEV || !enabled) return null;
  const context = renderer.getContext() as WebGL2RenderingContext;
  if (context.isContextLost()) return null;
  let state = canvasStates.get(renderer.domElement);
  if (!state) {
    state = {
      canvas: renderer.domElement, context, extension: undefined, gpuStatus: 'not-requested',
      samples: [], pending: [], dropped: 0, disjoint: 0, timer: undefined, lastPublishedAt: -Infinity,
    };
    canvasStates.set(renderer.domElement, state);
    activeStates.add(state);
  }
  let query: WebGLQuery | null = null;
  try {
    if (state.extension === undefined) {
      state.extension = typeof context.createQuery === 'function'
        ? context.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null
        : null;
      state.gpuStatus = state.extension ? 'supported' : 'unavailable';
    }
    const extension = state.extension;
    if (extension && state.gpuStatus === 'supported') {
      if (context.getParameter(extension.GPU_DISJOINT_EXT)) discardPending(state, true);
      // Do not interfere with another profiler's active timer query.
      else if (state.pending.length < PENDING_LIMIT && !context.getQuery(extension.TIME_ELAPSED_EXT, context.CURRENT_QUERY)) {
        query = context.createQuery();
        if (query) context.beginQuery(extension.TIME_ELAPSED_EXT, query);
      } else state.dropped += 1;
    }
  } catch {
    state.gpuStatus = 'error';
    if (query && !context.isContextLost()) context.deleteQuery(query);
    query = null;
  }
  return { state, query, startedAt: performance.now() };
}

export function endCommercialMapRenderTiming(
  token: CommercialMapRenderTimingToken | null,
  path: TimingPath,
  presented: boolean,
) {
  if (!import.meta.env.DEV || !token) return;
  const cpuMs = performance.now() - token.startedAt;
  const { state, query } = token;
  const context = state.context;
  if (context.isContextLost()) {
    discardPending(state);
    publish(state, true);
    return;
  }
  const sample: TimingSample = { path, cpuMs, gpuMs: null };
  try {
    if (query && state.extension) context.endQuery(state.extension.TIME_ELAPSED_EXT);
    if (presented && enabled) {
      state.samples.push(sample);
      if (state.samples.length > SAMPLE_LIMIT) state.samples.shift();
      if (query) state.pending.push({ query, sample, submittedAt: performance.now() });
    } else if (query) context.deleteQuery(query);
  } catch {
    state.gpuStatus = 'error';
    if (query && !context.isContextLost()) context.deleteQuery(query);
  }
  if (state.pending.length && state.timer === undefined) state.timer = setTimeout(() => poll(state), POLL_INTERVAL_MS);
  publish(state);
}

export function disposeCommercialMapRenderTiming(renderer: WebGLRenderer) {
  if (!import.meta.env.DEV) return;
  const state = canvasStates.get(renderer.domElement);
  if (!state) return;
  discardPending(state);
  activeStates.delete(state);
  canvasStates.delete(renderer.domElement);
  delete renderer.domElement.dataset.commercialMapRenderTiming;
}
