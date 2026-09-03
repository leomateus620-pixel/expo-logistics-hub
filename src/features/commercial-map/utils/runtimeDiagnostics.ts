import type { ProfilerOnRenderCallback } from 'react';
import * as THREE from 'three';
import type { WebGLRenderer } from 'three';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import type { CommercialMapQualityTier } from './viewport';

interface RuntimeEvent {
  at: number;
  type: string;
  [key: string]: unknown;
}

interface RendererSnapshot {
  at: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  dpr: number;
  width: number;
  height: number;
  heapBytes: number | null;
  qualityTier: CommercialMapQualityTier | null;
}

export interface CommercialMapRuntimeDiagnostics {
  canvasMounts: number;
  activeCanvases: number;
  rendererCreates: number;
  controlsCreates: number;
  activeControls: number;
  rendererIds: number[];
  sceneIds: string[];
  cameraIds: string[];
  contextLost: number;
  contextRestored: number;
  events: RuntimeEvent[];
  reactCommits: RuntimeEvent[];
  longTasks: RuntimeEvent[];
  frameTimes: RuntimeEvent[];
  qualityChanges: RuntimeEvent[];
  qualityTier: CommercialMapQualityTier | null;
  qualityDpr: number | null;
  snapshots: RendererSnapshot[];
  capture: () => RendererSnapshot | null;
  resetSamples: () => void;
}

declare global {
  interface Window {
    __commercialMapRuntimeDiagnostics?: CommercialMapRuntimeDiagnostics;
  }
}

const rendererIds = new WeakMap<WebGLRenderer, number>();
const knownControls = new WeakSet<object>();
let nextRendererId = 1;

function now() {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function appendBounded<T>(target: T[], entry: T, limit = 240) {
  target.push(entry);
  if (target.length > limit) target.splice(0, target.length - limit);
}

function ensureDiagnostics() {
  if (typeof window === 'undefined') return null;
  if (window.__commercialMapRuntimeDiagnostics) {
    const existing = window.__commercialMapRuntimeDiagnostics;
    // DEV globals survive hot reloads. Migrate an older diagnostics object so
    // adding quality telemetry cannot turn HMR into a runtime exception.
    if (!Array.isArray(existing.qualityChanges)) {
      existing.qualityChanges = [];
      existing.qualityTier = null;
      existing.qualityDpr = null;
      const previousResetSamples = existing.resetSamples;
      existing.resetSamples = () => {
        previousResetSamples();
        existing.qualityChanges.length = 0;
      };
    }
    return existing;
  }
  const diagnostics: CommercialMapRuntimeDiagnostics = {
    canvasMounts: 0,
    activeCanvases: 0,
    rendererCreates: 0,
    controlsCreates: 0,
    activeControls: 0,
    rendererIds: [],
    sceneIds: [],
    cameraIds: [],
    contextLost: 0,
    contextRestored: 0,
    events: [],
    reactCommits: [],
    longTasks: [],
    frameTimes: [],
    qualityChanges: [],
    qualityTier: null,
    qualityDpr: null,
    snapshots: [],
    capture: () => null,
    resetSamples: () => {
      diagnostics.events.length = 0;
      diagnostics.reactCommits.length = 0;
      diagnostics.longTasks.length = 0;
      diagnostics.frameTimes.length = 0;
      diagnostics.qualityChanges.length = 0;
      diagnostics.snapshots.length = 0;
    },
  };
  window.__commercialMapRuntimeDiagnostics = diagnostics;
  return diagnostics;
}

export const recordCommercialMapProfiler: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
) => {
  if (!import.meta.env.DEV) return;
  const diagnostics = ensureDiagnostics();
  if (!diagnostics) return;
  appendBounded(diagnostics.reactCommits, {
    type: 'react-commit',
    at: commitTime,
    id,
    phase,
    actualDuration: Number(actualDuration.toFixed(3)),
    baseDuration: Number(baseDuration.toFixed(3)),
    startTime: Number(startTime.toFixed(3)),
  });
};

export function registerCommercialMapRuntimeDiagnostics({
  gl,
  scene,
  camera,
}: {
  gl: WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
}) {
  if (!import.meta.env.DEV || typeof window === 'undefined') return () => undefined;
  const diagnostics = ensureDiagnostics();
  if (!diagnostics) return () => undefined;

  let rendererId = rendererIds.get(gl);
  if (!rendererId) {
    rendererId = nextRendererId;
    nextRendererId += 1;
    rendererIds.set(gl, rendererId);
    diagnostics.rendererCreates += 1;
    diagnostics.rendererIds.push(rendererId);
  }
  diagnostics.canvasMounts += 1;
  diagnostics.activeCanvases += 1;
  if (!diagnostics.sceneIds.includes(scene.uuid)) diagnostics.sceneIds.push(scene.uuid);
  if (!diagnostics.cameraIds.includes(camera.uuid)) diagnostics.cameraIds.push(camera.uuid);
  appendBounded(diagnostics.events, {
    type: 'canvas-mounted',
    at: now(),
    rendererId,
    sceneId: scene.uuid,
    cameraId: camera.uuid,
  });

  const capture = () => {
    const drawingBuffer = gl.getDrawingBufferSize(new THREE.Vector2());
    const performanceMemory = performance as Performance & {
      memory?: { usedJSHeapSize?: number };
    };
    const snapshot: RendererSnapshot = {
      at: now(),
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? 0,
      dpr: gl.getPixelRatio(),
      width: drawingBuffer.x,
      height: drawingBuffer.y,
      heapBytes: performanceMemory.memory?.usedJSHeapSize ?? null,
      qualityTier: diagnostics.qualityTier,
    };
    appendBounded(diagnostics.snapshots, snapshot, 120);
    gl.domElement.dataset.commercialMapRendererInfo = JSON.stringify(snapshot);
    return snapshot;
  };
  diagnostics.capture = capture;
  const previousAutoReset = gl.info.autoReset;
  // Reset once at the beginning of an R3F frame so draw calls include every
  // post-processing/shadow pass, not just the final fullscreen triangle.
  gl.info.autoReset = false;
  capture();

  const handleContextLost = () => {
    diagnostics.contextLost += 1;
    appendBounded(diagnostics.events, { type: 'webgl-context-lost', at: now(), rendererId });
  };
  const handleContextRestored = () => {
    diagnostics.contextRestored += 1;
    appendBounded(diagnostics.events, { type: 'webgl-context-restored', at: now(), rendererId });
  };
  gl.domElement.addEventListener('webglcontextlost', handleContextLost);
  gl.domElement.addEventListener('webglcontextrestored', handleContextRestored);

  const unsubscribe = useCommercialMapStore.subscribe((state, previous) => {
    if (state.selectedEntityId === previous.selectedEntityId) return;
    appendBounded(diagnostics.events, {
      type: 'selection-changed',
      at: now(),
      previousId: previous.selectedEntityId,
      selectedId: state.selectedEntityId,
    });
    capture();
  });
  const observer = typeof PerformanceObserver === 'undefined'
    ? null
    : new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => appendBounded(diagnostics.longTasks, {
          type: 'long-task',
          at: entry.startTime,
          duration: Number(entry.duration.toFixed(2)),
          attribution: (entry as PerformanceEntry & { attribution?: Array<{ name?: string; containerType?: string; containerName?: string }> })
            .attribution?.map((item) => ({
              name: item.name,
              containerType: item.containerType,
              containerName: item.containerName,
            })) ?? [],
        }));
      });
  try {
    observer?.observe({ type: 'longtask', buffered: false });
  } catch {
    observer?.disconnect();
  }

  return () => {
    gl.info.autoReset = previousAutoReset;
    if (diagnostics.capture === capture) diagnostics.capture = () => null;
    observer?.disconnect();
    unsubscribe();
    gl.domElement.removeEventListener('webglcontextlost', handleContextLost);
    gl.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
    diagnostics.activeCanvases = Math.max(0, diagnostics.activeCanvases - 1);
    appendBounded(diagnostics.events, { type: 'canvas-unmounted', at: now(), rendererId });
  };
}

export function registerCommercialMapControlsDiagnostics(controls: object) {
  if (!import.meta.env.DEV) return () => undefined;
  const diagnostics = ensureDiagnostics();
  if (!diagnostics) return () => undefined;
  if (!knownControls.has(controls)) {
    knownControls.add(controls);
    diagnostics.controlsCreates += 1;
  }
  diagnostics.activeControls += 1;
  appendBounded(diagnostics.events, { type: 'controls-attached', at: now() });
  return () => {
    diagnostics.activeControls = Math.max(0, diagnostics.activeControls - 1);
    appendBounded(diagnostics.events, { type: 'controls-detached', at: now() });
  };
}

export function recordCommercialMapFrame(deltaMs: number) {
  if (!import.meta.env.DEV || deltaMs <= 0) return;
  const diagnostics = ensureDiagnostics();
  if (!diagnostics) return;
  appendBounded(diagnostics.frameTimes, {
    type: 'render-frame',
    at: now(),
    duration: Number(deltaMs.toFixed(3)),
  });
}

export function recordCommercialMapQualityDecision({
  tier,
  hardwareCeiling,
  dpr,
  reducedGraphics,
  reason,
}: {
  tier: CommercialMapQualityTier;
  hardwareCeiling: CommercialMapQualityTier;
  dpr: number;
  reducedGraphics: boolean;
  reason: string;
}) {
  if (!import.meta.env.DEV || !Number.isFinite(dpr) || dpr <= 0) return;
  const diagnostics = ensureDiagnostics();
  if (!diagnostics) return;
  diagnostics.qualityTier = tier;
  diagnostics.qualityDpr = dpr;
  appendBounded(diagnostics.qualityChanges, {
    type: 'adaptive-quality-changed',
    at: now(),
    tier,
    hardwareCeiling,
    dpr: Number(dpr.toFixed(3)),
    reducedGraphics,
    reason,
  }, 120);
}
