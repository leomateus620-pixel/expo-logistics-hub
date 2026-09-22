import type { WebGLRenderer } from 'three';
import { commercialMapFrameActivity } from '../utils/frameActivity';
import { commercialMapDiagnosticsEnabled } from '../utils/performanceDiagnostics';
import { readLatestCommercialMapRenderHealth } from '../utils/renderingHealth';
import { readVisitQuality } from './VisitQualityManager';

const SAMPLE_CAPACITY = 3600;
const MAX_EVENTS = 120;

export interface VisitTelemetrySummary {
  active: boolean;
  sampledFrames: number;
  totalSampledFrames: number;
  averageFps: number | null;
  averageFrameTimeMs: number | null;
  p95FrameTimeMs: number | null;
  p99FrameTimeMs: number | null;
  stallsOver50Ms: number;
  unpresentedActiveFrames: number;
  longestPresentationGapMs: number;
  presentedFrames: number;
  entryMs: number | null;
  elapsedMs: number;
  qualityPreset: string;
  renderer: {
    calls: number; triangles: number; geometries: number; textures: number;
    programs: number; dpr: number; width: number; height: number; heapBytes: number | null;
  };
  health: ReturnType<typeof readLatestCommercialMapRenderHealth>;
  events: Array<{ at: number; type: string; detail?: string }>;
}

export interface VisitTelemetry {
  frame: (deltaMs: number, active: boolean) => void;
  controlsReady: () => void;
  event: (type: string, detail?: string) => void;
  publish: () => VisitTelemetrySummary | null;
  resetSamples: () => void;
  dispose: () => void;
}

declare global {
  interface Window {
    __commercialMapVisitDiagnostics?: VisitTelemetrySummary & {
      capture: () => VisitTelemetrySummary | null;
      resetSamples: () => void;
    };
  }
}

/** Bounded typed ring: no sample objects, sorts, GPU queries or React per frame. */
export function createVisitFrameSampler(capacity = SAMPLE_CAPACITY) {
  const samples = new Float64Array(Math.max(1, capacity));
  let count = 0;
  let cursor = 0;
  let total = 0;
  let activePreviously = false;
  return {
    record(deltaMs: number, active: boolean) {
      if (!active || !Number.isFinite(deltaMs) || deltaMs <= 0) {
        activePreviously = false;
        return;
      }
      // Demand-idle/background time is not an interaction frame interval.
      if (!activePreviously) { activePreviously = true; return; }
      samples[cursor] = deltaMs;
      cursor = (cursor + 1) % samples.length;
      count = Math.min(samples.length, count + 1);
      total += 1;
    },
    reset() { count = 0; cursor = 0; total = 0; activePreviously = false; },
    summary() {
      const sorted = Array.from(samples.subarray(0, count)).sort((a, b) => a - b);
      const mean = count ? sorted.reduce((sum, value) => sum + value, 0) / count : null;
      const percentile = (p: number) => count ? sorted[Math.ceil(count * p) - 1] : null;
      return {
        sampledFrames: count, totalSampledFrames: total,
        averageFps: mean === null ? null : 1000 / mean,
        averageFrameTimeMs: mean,
        p95FrameTimeMs: percentile(0.95), p99FrameTimeMs: percentile(0.99),
        stallsOver50Ms: sorted.filter((value) => value > 50).length,
      };
    },
  };
}

export function createVisitTelemetry(gl: WebGLRenderer, requestedAtMs = performance.now()): VisitTelemetry {
  const enabled = commercialMapDiagnosticsEnabled;
  const sampler = createVisitFrameSampler();
  const events: VisitTelemetrySummary['events'] = [];
  const activity = commercialMapFrameActivity(gl);
  const initialPresented = activity.frames;
  let lastPresented = -1;
  let entryMs: number | null = null;
  let lastPublished = 0;
  let disposed = false;
  let pendingPresentationMs = 0;
  let measuringActive = false;
  let unpresentedActiveFrames = 0;
  let longestPresentationGapMs = 0;
  // Captured before the map frame diagnostics resets gl.info, at priority -110.
  let calls = 0;
  let triangles = 0;
  const event = (type: string, detail?: string) => {
    if (!enabled) return;
    events.push({ at: performance.now() - requestedAtMs, type, detail });
    if (events.length > MAX_EVENTS) events.shift();
  };
  const publish = (): VisitTelemetrySummary | null => {
    if (!enabled) return null;
    const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
    const summary: VisitTelemetrySummary = {
      active: !disposed, ...sampler.summary(),
      unpresentedActiveFrames, longestPresentationGapMs,
      presentedFrames: activity.frames - initialPresented,
      entryMs, elapsedMs: performance.now() - requestedAtMs,
      qualityPreset: readVisitQuality().preset,
      renderer: {
        calls, triangles, geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures, programs: gl.info.programs?.length ?? 0,
        dpr: gl.getPixelRatio(), width: gl.domElement.width, height: gl.domElement.height,
        heapBytes: memory.memory?.usedJSHeapSize ?? null,
      },
      health: readLatestCommercialMapRenderHealth(gl.domElement),
      events: events.slice(),
    };
    window.__commercialMapVisitDiagnostics = { ...summary, capture: publish, resetSamples };
    gl.domElement.dataset.commercialMapVisitDiagnostics = JSON.stringify(summary);
    return summary;
  };
  const resetBoundary = () => { sampler.record(0, false); pendingPresentationMs = 0; measuringActive = false; };
  const resetSamples = () => {
    sampler.reset(); pendingPresentationMs = 0; unpresentedActiveFrames = 0; measuringActive = false;
    longestPresentationGapMs = 0; lastPresented = activity.frames;
  };
  const lost = () => { resetBoundary(); event('context-lost'); };
  if (enabled) {
    event('entry-requested');
    document.addEventListener('visibilitychange', resetBoundary);
    window.addEventListener('blur', resetBoundary);
    gl.domElement.addEventListener('webglcontextlost', lost);
  }
  return {
    frame(deltaMs, active) {
      if (!enabled || disposed) return;
      const presented = activity.frames !== lastPresented;
      lastPresented = activity.frames;
      if (!active || document.visibilityState !== 'visible' || !Number.isFinite(deltaMs) || deltaMs <= 0) resetBoundary();
      else {
        // A suspended shader/render pass is not a presented frame, but its
        // visible wait must remain in the next presentation interval. Resetting
        // the sampler here would hide freezes behind an apparently healthy FPS.
        if (measuringActive) {
          pendingPresentationMs += deltaMs;
          longestPresentationGapMs = Math.max(longestPresentationGapMs, pendingPresentationMs);
        }
        measuringActive = true;
        if (presented) {
          sampler.record(pendingPresentationMs || deltaMs, true);
          pendingPresentationMs = 0;
        } else unpresentedActiveFrames += 1;
      }
      if (presented) { calls = gl.info.render.calls; triangles = gl.info.render.triangles; }
      const now = performance.now();
      if (now - lastPublished >= 1000) { lastPublished = now; publish(); }
    },
    controlsReady() {
      if (entryMs !== null) return;
      entryMs = performance.now() - requestedAtMs;
      event('controls-ready');
      publish();
    },
    event, publish, resetSamples,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (!enabled) return;
      event('exit');
      document.removeEventListener('visibilitychange', resetBoundary);
      window.removeEventListener('blur', resetBoundary);
      gl.domElement.removeEventListener('webglcontextlost', lost);
      publish();
      // Keep the small final report, but release renderer/scene closure ownership.
      const final = window.__commercialMapVisitDiagnostics;
      if (final) { final.capture = () => null; final.resetSamples = () => undefined; }
    },
  };
}
