import { useEffect, useRef, useState } from 'react';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import { getCommercialMapBootSnapshot, summarizeCommercialMapBoot } from '../utils/performanceDiagnostics';
import { readLatestCommercialMapRenderHealth } from '../utils/renderingHealth';
import type { EnvironmentSnapshot } from './LightingPerformanceProbe';
import { analyzeEnvironmentResources, ENVIRONMENT_SEQUENCE, maximumVectorDelta, summarizeEnvironmentFrames, type EnvironmentResourceRow } from './environmentBenchmarkAnalysis';

const MEASURED_CYCLES = 20;
const WARMUP_CYCLES = 2;
const SETTLE_MS = 2300;
const TIMEOUT_MS = 30_000;

function snapshot(canvas: HTMLCanvasElement) {
  canvas.dispatchEvent(new Event('commercial-map-snapshot-environment'));
  const value = window.__commercialMapEnvironmentSnapshot;
  if (!value) throw new Error('Environment probe unavailable');
  return value;
}

function lifecycle() {
  const d = window.__commercialMapRuntimeDiagnostics;
  return d && { canvasMounts: d.canvasMounts, rendererCreates: d.rendererCreates, controlsCreates: d.controlsCreates,
    activeCanvases: d.activeCanvases, activeControls: d.activeControls, contextLost: d.contextLost, contextRestored: d.contextRestored };
}

function protectedState() {
  const s = useCommercialMapStore.getState();
  return { selectedEntityId: s.selectedEntityId, selectedModuleId: s.selectedModuleId, interiorEntityId: s.interiorEntityId,
    search: s.search, statusFilters: s.statusFilters, classificationFilters: s.classificationFilters,
    verificationFilters: s.verificationFilters, locationFilter: s.locationFilter, activeSegmentId: s.activeSegmentId,
    labelsVisible: s.labelsVisible, cameraPreset: s.cameraPreset, cameraSequence: s.cameraSequence,
    sunriseSequence: s.sunriseSequence, layerVisibility: s.layerVisibility, layerOpacity: s.layerOpacity };
}

function delay(signal: AbortSignal, ms: number) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error('cancelled')); return; }
    const abort = () => { window.clearTimeout(timer); reject(new Error('cancelled')); };
    const timer = window.setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function rainState(canvas: HTMLCanvasElement): { blend?: number; night?: number; tier?: string; [key: string]: unknown } | null {
  try { return JSON.parse(canvas.dataset.commercialMapRain ?? 'null'); }
  catch { return null; }
}

interface TransitionRow extends EnvironmentResourceRow {
  elapsedMs: number;
  frame: ReturnType<typeof summarizeEnvironmentFrames>;
  poseDelta: Record<'position' | 'target' | 'quaternion' | 'projection', number | null>;
  intentionalHydrologyNavigation: boolean;
  protectedStateChanged: string[];
  health: ReturnType<typeof readLatestCommercialMapRenderHealth>;
  lifecycle: ReturnType<typeof lifecycle>;
  rain: ReturnType<typeof rainState>;
  longTasks: { at: number; duration: number }[];
  errors: string[];
}

interface BenchmarkReport {
  status: string; cycles: number; transitions: number; elapsedMs: number; error: string | null;
  fixture: true; forcedContinuousFrames: true; userAgent: string; viewport: number[];
  rows: TransitionRow[];
  resources: ReturnType<typeof analyzeEnvironmentResources>;
  boot: ReturnType<typeof summarizeCommercialMapBoot>;
  limitations: string[];
}

/** Visible DEV harness; each mode is warmed twice before 20 measured cycles. */
export function EnvironmentBenchmark({ disabled = false }: { disabled?: boolean }) {
  const abort = useRef<AbortController | null>(null);
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState<BenchmarkReport | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; abort.current?.abort(); };
  }, []);
  const run = async () => {
    if (abort.current) return;
    const controller = new AbortController(); abort.current = controller;
    setResult(null);
    const startedAt = performance.now();
    const report: BenchmarkReport = {
      status: 'running', cycles: 0, transitions: 0, elapsedMs: 0, error: null,
      fixture: true, forcedContinuousFrames: true, userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight, devicePixelRatio],
      rows: [], resources: analyzeEnvironmentResources([]), boot: summarizeCommercialMapBoot(),
      limitations: [
        'Local fixture; not authenticated production latency or commercial data.',
        'First submitted draw is not input-to-photon certification; inspect screenshots.',
        'Hydrology intentionally changes selection and camera preset in the existing product contract; reported separately.',
        'Listener metric covers Three scene objects and OrbitControls. DOM listener accumulation requires browser debugger.',
        'Continuous frames are explicitly requested during each measurement. Does not measure idle demand-render FPS.',
      ],
    };
    const publish = (label: string) => {
      report.elapsedMs = performance.now() - startedAt;
      // Do not stringify thousands of material IDs or re-analyze history during
      // a measured transition. Publish the full evidence only after frames stop.
      if (!abort.current) report.resources = analyzeEnvironmentResources(report.rows);
      if (mounted.current) {
        setStatus(label);
        if (!abort.current) setResult({ ...report, rows: [...report.rows] });
      }
    };
    publish('waiting for interactive map');
    let observer: PerformanceObserver | null = null;
    const longTasks: { at: number; duration: number }[] = [];
    try {
      const canvas = document.querySelector<HTMLCanvasElement>('.commercial-map-rendering-diagnostics__viewport canvas');
      if (!canvas) throw new Error('canvas unavailable');
      const readyAt = performance.now();
      while (!getCommercialMapBootSnapshot().marks['secondary-hydration-complete']
        || useCommercialMapStore.getState().sunrisePhase === 'running'
        || useCommercialMapStore.getState().cameraNavigating) {
        if (performance.now() - readyAt > 90_000) throw new Error('secondary hydration / sunrise did not settle within 90s');
        await delay(controller.signal, 250);
      }
      const store = useCommercialMapStore.getState();
      store.setRainModeActive(false); store.setNightModeActive(false); store.setHydrologicalModeActive(false);
      store.requestCameraPreset('overview');
      await delay(controller.signal, 2500);
      const originalCanvas = canvas;
      const initialLifecycle = lifecycle();
      if (!initialLifecycle) throw new Error('runtime diagnostics unavailable');
      const initialSnapshot = snapshot(canvas);
      if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) longTasks.push({ at: entry.startTime, duration: entry.duration });
          if (longTasks.length > 500) longTasks.splice(0, longTasks.length - 500);
        });
        observer.observe({ type: 'longtask', buffered: false });
      }
      for (let cycle = -WARMUP_CYCLES + 1; cycle <= MEASURED_CYCLES; cycle++) {
        const phase = cycle <= 0 ? 'warmup' : 'measured';
        for (const target of ENVIRONMENT_SEQUENCE) {
          if (document.hidden || !document.hasFocus()) throw new Error('foreground required; tab hidden or unfocused');
          const before = snapshot(canvas);
          const beforeState = protectedState();
          const hydroChanged = useCommercialMapStore.getState().hydrologicalModeActive !== target.hydrology;
          const healthBefore = readLatestCommercialMapRenderHealth(canvas);
          longTasks.length = 0;
          const requestedAt = performance.now();
          canvas.dispatchEvent(new CustomEvent('commercial-map-trace-environment', { detail: { durationMs: TIMEOUT_MS } }));
          const s = useCommercialMapStore.getState();
          s.setNightModeActive(target.night); s.setRainModeActive(target.rain); s.setHydrologicalModeActive(target.hydrology);
          let settled = false;
          while (performance.now() - requestedAt < TIMEOUT_MS) {
            await delay(controller.signal, 100);
            const health = readLatestCommercialMapRenderHealth(canvas);
            if (health && (health.contextLosses > (healthBefore?.contextLosses ?? 0) || health.lastErrorCode)) throw new Error(`renderer failure: ${JSON.stringify(health)}`);
            if (document.hidden || !document.hasFocus()) throw new Error('foreground required; tab hidden or unfocused');
            const weather = rainState(canvas);
            const state = useCommercialMapStore.getState();
            const blendsSettled = weather && Math.abs(Number(weather.blend) - Number(target.rain)) < .025
              && Math.abs(Number(weather.night) - Number(target.night)) < .025;
            if (performance.now() - requestedAt >= SETTLE_MS && blendsSettled && !state.cameraNavigating
              && health?.status === 'ready' && health.presentedFrames > (healthBefore?.presentedFrames ?? 0)) {
              settled = true; break;
            }
          }
          const trace = window.__commercialMapEnvironmentTrace;
          if (trace) { trace.forceFrames = false; trace.until = 0; }
          if (!settled) throw new Error(`mode did not settle: ${target.name}; ${JSON.stringify(rainState(canvas))}`);
          const after = snapshot(canvas);
          const afterState = protectedState();
          const changed = Object.keys(beforeState).filter((key) => JSON.stringify(beforeState[key as keyof typeof beforeState]) !== JSON.stringify(afterState[key as keyof typeof afterState]));
          const poseDelta = Object.fromEntries((['position', 'target', 'quaternion', 'projection'] as const).map((key) => [key, maximumVectorDelta(before[key], after[key])])) as TransitionRow['poseDelta'];
          const frame = summarizeEnvironmentFrames(trace?.samples ?? [], requestedAt);
          const health = readLatestCommercialMapRenderHealth(canvas);
          const currentLifecycle = lifecycle();
          const errors: string[] = [];
          if (!frame.foreground || frame.samples < 2) errors.push('missing foreground frame evidence');
          if (!hydroChanged && Object.values(poseDelta).some((value) => value === null || value > .0001)) errors.push('camera changed without hydrology navigation');
          if (!hydroChanged && changed.length) errors.push(`protected state changed: ${changed.join(', ')}`);
          if (after.sceneId !== initialSnapshot.sceneId || after.cameraId !== initialSnapshot.cameraId
            || document.querySelector('.commercial-map-rendering-diagnostics__viewport canvas') !== originalCanvas
            || JSON.stringify(currentLifecycle) !== JSON.stringify(initialLifecycle)) errors.push('renderer/camera/controls lifecycle changed');
          if (health?.status !== 'ready' || health.contextLosses || health.lastErrorCode) errors.push('renderer unhealthy');
          report.rows.push({ phase, cycle, mode: target.name, qualityTier: window.__commercialMapRuntimeDiagnostics?.qualityTier ?? null,
            snapshot: after, elapsedMs: performance.now() - requestedAt, frame, poseDelta,
            intentionalHydrologyNavigation: hydroChanged, protectedStateChanged: changed,
            health, lifecycle: currentLifecycle, rain: rainState(canvas), longTasks: [...longTasks], errors });
          report.transitions += 1;
          publish(`${phase} ${cycle <= 0 ? cycle + WARMUP_CYCLES : cycle}/${cycle <= 0 ? WARMUP_CYCLES : MEASURED_CYCLES} · ${target.name}`);
          if (errors.length) throw new Error(errors.join('; '));
        }
        if (phase === 'measured') report.cycles = cycle;
      }
      report.resources = analyzeEnvironmentResources(report.rows);
      report.status = report.resources.status;
      if (report.status !== 'passed') report.error = 'Warmed resource plateau failed or lacked same-configuration evidence; inspect resource groups.';
    } catch (error) {
      report.status = controller.signal.aborted ? 'cancelled' : 'failed';
      report.error = error instanceof Error ? error.message : String(error);
    } finally {
      observer?.disconnect();
      if (window.__commercialMapEnvironmentTrace) { window.__commercialMapEnvironmentTrace.forceFrames = false; window.__commercialMapEnvironmentTrace.until = 0; }
      abort.current = null;
      report.boot = summarizeCommercialMapBoot();
      publish(report.status);
    }
  };
  const running = abort.current !== null;
  return <div className="commercial-map-district-qa commercial-map-environment-benchmark">
    <button type="button" disabled={disabled || running} onClick={() => void run()}>Medir 20 ciclos de ambientes</button>
    <button type="button" disabled={!running} onClick={() => abort.current?.abort()}>Cancelar ambientes</button>
    <output data-environment-benchmark={running ? 'running' : result?.status ?? 'idle'}>{status}</output>
    <details><summary>Resultado ambientes (fixture)</summary><pre id="environment-benchmark-result">{result ? JSON.stringify(result) : ''}</pre></details>
  </div>;
}
