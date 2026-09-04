import { useEffect, useRef, useState } from 'react';
import { CommercialMapCanvas } from '../components/canvas/CommercialMapCanvas';
import { CommercialMapRendererStatus } from '../components/CommercialMapRendererStatus';
import { OFFICIAL_REFERENCE_DATA } from '../data/officialReference2026';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import {
  summarizeCommercialMapRuntimeDiagnostics,
  type CommercialMapRuntimeSummary,
} from '../utils/runtimeDiagnostics';
import { readLatestCommercialMapRenderHealth, type CommercialMapRenderHealth } from '../utils/renderingHealth';
import {
  readCommercialMapRenderTiming,
  resetCommercialMapRenderTiming,
  setCommercialMapRenderTimingEnabled,
} from '../utils/renderingTiming';
import {
  analyzeCommercialMapStressResources,
  type CommercialMapStressResourceAnalysis,
} from './renderingStressResources';
import type { CameraPreset } from '../types';
import '../commercial-map.css';
import '../commercial-map-mobile.css';
import './commercial-map-rendering-diagnostics.css';

const EMPTY_MATCHING_ENTITY_IDS = new Set<string>();
const MAXIMUM_ZOOM_WHEEL_STEPS = 80;
const STRESS_CYCLES = 20;
const STRESS_IDLE_MS = 650;
const STRESS_TRANSITION_TIMEOUT_MS = 15_000;

type StressPhase = 'hydrology' | 'quality';
type StressStatus = 'idle' | 'running' | 'passed' | 'failed' | 'cancelled' | 'inconclusive';
interface RuntimeFacts {
  visibility: DocumentVisibilityState;
  focused: boolean;
  cameraNavigating: boolean;
  lunarLaunchPhase: string;
  lunarLaunchReturning: boolean;
  actualDpr: number | null;
}
interface StressSnapshot {
  phase: StressPhase | 'baseline';
  cycle: number;
  target: boolean;
  elapsedMs: number;
  frameDelta: number;
  health: CommercialMapRenderHealth;
  runtime: CommercialMapRuntimeSummary;
  environment: RuntimeFacts;
}
interface StressReport {
  status: StressStatus;
  phase: StressPhase | 'baseline' | null;
  completedCycles: number;
  completedTransitions: number;
  totalCycles: number;
  startedAt: string | null;
  elapsedMs: number;
  error: string | null;
  snapshots: StressSnapshot[];
  lastEnvironment: RuntimeFacts | null;
  resources: CommercialMapStressResourceAnalysis | null;
}

function initialStressReport(): StressReport {
  return {
    status: 'idle', phase: null, completedCycles: 0, completedTransitions: 0,
    totalCycles: 0, startedAt: null, elapsedMs: 0, error: null, snapshots: [], lastEnvironment: null, resources: null,
  };
}

function currentDiagnosticsCanvas() {
  return document.querySelector<HTMLCanvasElement>('.commercial-map-rendering-diagnostics__viewport canvas');
}

function currentRuntimeFacts(): RuntimeFacts {
  const state = useCommercialMapStore.getState();
  const canvas = currentDiagnosticsCanvas();
  return {
    visibility: document.visibilityState,
    focused: document.hasFocus(),
    cameraNavigating: state.cameraNavigating,
    lunarLaunchPhase: state.lunarLaunchPhase,
    lunarLaunchReturning: state.lunarLaunchReturning,
    actualDpr: canvas?.clientWidth ? Number((canvas.width / canvas.clientWidth).toFixed(3)) : null,
  };
}

function abortableStressDelay(signal: AbortSignal, ms: number) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('cancelled'));
      return;
    }
    const abort = () => {
      window.clearTimeout(timer);
      reject(new Error('cancelled'));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Wait for successful screen-target draws; screenshots separately validate displayed pixels. */
async function waitForStressPresentation(
  signal: AbortSignal,
  before: CommercialMapRenderHealth | null,
  target: { hydrologicalModeActive: boolean; reducedGraphics: boolean },
) {
  const startedAt = performance.now();
  let idleSince: number | null = null;
  while (performance.now() - startedAt < STRESS_TRANSITION_TIMEOUT_MS) {
    await abortableStressDelay(signal, 100);
    const state = useCommercialMapStore.getState();
    const environment = currentRuntimeFacts();
    if (environment.visibility !== 'visible' || !environment.focused) {
      throw new Error(`foreground-required: ${JSON.stringify(environment)}`);
    }
    const health = readLatestCommercialMapRenderHealth(currentDiagnosticsCanvas());
    const elapsedMs = performance.now() - startedAt;
    if (health && (health.status !== 'ready' || health.contextLosses > (before?.contextLosses ?? 0))) {
      throw new Error(`renderer-${health.status}: ${health.lastErrorCode ?? 'context-loss'}`);
    }
    const idle = !state.cameraNavigating && state.lunarLaunchPhase === 'idle'
      && !state.lunarLaunchReturning
      && state.hydrologicalModeActive === target.hydrologicalModeActive
      && state.reducedGraphics === target.reducedGraphics;
    idleSince = idle ? idleSince ?? performance.now() : null;
    const presented = health && health.presentedFrames > (before?.presentedFrames ?? 0);
    if (presented && idleSince !== null && performance.now() - idleSince >= STRESS_IDLE_MS) {
      window.__commercialMapRuntimeDiagnostics?.capture();
      const runtime = summarizeCommercialMapRuntimeDiagnostics();
      const expectedPath = target.reducedGraphics || runtime.renderer?.qualityTier === 'LOW'
        ? 'direct'
        : 'post';
      if (health.path === expectedPath) {
        return {
          elapsedMs: Math.round(elapsedMs),
          frameDelta: health.presentedFrames - (before?.presentedFrames ?? 0),
          health,
          runtime,
          environment,
        };
      }
    }
  }
  const health = readLatestCommercialMapRenderHealth(currentDiagnosticsCanvas());
  throw new Error(`transition-timeout: ${JSON.stringify({ target, health })}`);
}

function initialSummary(): CommercialMapRuntimeSummary {
  return summarizeCommercialMapRuntimeDiagnostics(undefined);
}

function formatMetric(value: number | null, suffix = '') {
  return value === null ? '—' : `${value}${suffix}`;
}

/**
 * DEV-only, authentication-free harness for repeatable hardware/browser QA.
 * App.tsx excludes the route and dynamic import from production builds.
 */
export default function CommercialMapRenderingDiagnosticsPage() {
  const hydrologicalModeActive = useCommercialMapStore((state) => state.hydrologicalModeActive);
  const reducedGraphics = useCommercialMapStore((state) => state.reducedGraphics);
  const [summary, setSummary] = useState<CommercialMapRuntimeSummary>(initialSummary);
  const [stressReport, setStressReport] = useState<StressReport>(initialStressReport);
  const [runtimeFacts, setRuntimeFacts] = useState<RuntimeFacts>(currentRuntimeFacts);
  const [foregroundCounts, setForegroundCounts] = useState({ blurEvents: 0, hiddenEvents: 0 });
  const [timing, setTiming] = useState(readCommercialMapRenderTiming);
  const [timingEnvironmentValid, setTimingEnvironmentValid] = useState(true);
  const stressAbort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const maximumZoomFrame = useRef<number | null>(null);
  const schedulerFrame = useRef<number | null>(null);
  const contextLossExtension = useRef<WEBGL_lose_context | null>(null);
  const [schedulerReport, setSchedulerReport] = useState<{
    status: string; intervalsMs: number[]; elapsedMs: number;
  }>({ status: 'idle', intervalsMs: [], elapsedMs: 0 });

  useEffect(() => {
    mounted.current = true;
    const store = useCommercialMapStore.getState();
    store.initializeLayers(OFFICIAL_REFERENCE_DATA.layers);
    store.setHydrologicalModeActive(false);
    store.setReducedGraphics(false);
    store.setLabelsVisible(true);
    store.setTreesVisible(true);
    store.requestCameraPreset('overview');
    window.__commercialMapRuntimeDiagnostics?.resetSamples();

    const refresh = () => {
      setSummary(summarizeCommercialMapRuntimeDiagnostics());
      const facts = currentRuntimeFacts();
      const latestTiming = readCommercialMapRenderTiming();
      setRuntimeFacts(facts);
      setTiming(latestTiming);
      if (latestTiming.enabled && (facts.visibility !== 'visible' || !facts.focused)) {
        setTimingEnvironmentValid(false);
      }
    };
    const onBlur = () => {
      setForegroundCounts((counts) => ({ ...counts, blurEvents: counts.blurEvents + 1 }));
      refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') {
        setForegroundCounts((counts) => ({ ...counts, hiddenEvents: counts.hiddenEvents + 1 }));
      }
      refresh();
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    refresh();
    const timer = window.setInterval(refresh, 500);
    return () => {
      mounted.current = false;
      stressAbort.current?.abort();
      setCommercialMapRenderTimingEnabled(false);
      window.clearInterval(timer);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
      if (maximumZoomFrame.current !== null) window.cancelAnimationFrame(maximumZoomFrame.current);
      if (schedulerFrame.current !== null) window.cancelAnimationFrame(schedulerFrame.current);
      const latest = useCommercialMapStore.getState();
      latest.setHydrologicalModeActive(false);
      latest.setReducedGraphics(false);
      latest.setCameraNavigating(false);
    };
  }, []);

  const runStressCycles = async (phases: StressPhase[]) => {
    if (stressAbort.current) return;
    if (maximumZoomFrame.current !== null) {
      window.cancelAnimationFrame(maximumZoomFrame.current);
      maximumZoomFrame.current = null;
    }
    const controller = new AbortController();
    stressAbort.current = controller;
    const startedAt = performance.now();
    const report: StressReport = {
      ...initialStressReport(), status: 'running', phase: 'baseline',
      totalCycles: phases.length * STRESS_CYCLES, startedAt: new Date().toISOString(),
    };
    const publish = () => {
      report.elapsedMs = Math.round(performance.now() - startedAt);
      report.lastEnvironment = currentRuntimeFacts();
      report.resources = analyzeCommercialMapStressResources(report.snapshots, phases);
      if (mounted.current) setStressReport({ ...report, snapshots: [...report.snapshots] });
    };
    publish();
    try {
      let before = readLatestCommercialMapRenderHealth(currentDiagnosticsCanvas());
      const store = useCommercialMapStore.getState();
      store.setHydrologicalModeActive(false);
      store.setReducedGraphics(false);
      store.requestCameraPreset('overview');
      const baseline = await waitForStressPresentation(controller.signal, before, {
        hydrologicalModeActive: false, reducedGraphics: false,
      });
      report.snapshots.push({ phase: 'baseline', cycle: 0, target: false, ...baseline });
      publish();
      for (const phase of phases) {
        report.phase = phase;
        for (let cycle = 1; cycle <= STRESS_CYCLES; cycle += 1) {
          for (const target of [true, false]) {
            before = readLatestCommercialMapRenderHealth(currentDiagnosticsCanvas());
            const latest = useCommercialMapStore.getState();
            if (phase === 'hydrology') latest.setHydrologicalModeActive(target);
            else latest.setReducedGraphics(target);
            const snapshot = await waitForStressPresentation(controller.signal, before, {
              hydrologicalModeActive: phase === 'hydrology' && target,
              reducedGraphics: phase === 'quality' && target,
            });
            report.snapshots.push({ phase, cycle, target, ...snapshot });
            report.completedTransitions += 1;
            if (!target) report.completedCycles += 1;
            publish();
          }
        }
      }
      report.resources = analyzeCommercialMapStressResources(report.snapshots, phases);
      report.status = report.resources.status;
      if (report.status !== 'passed') report.error = report.resources.issues.join('; ');
    } catch (error) {
      report.status = controller.signal.aborted ? 'cancelled' : 'failed';
      report.error = error instanceof Error ? error.message : String(error);
    } finally {
      if (stressAbort.current === controller) stressAbort.current = null;
      publish();
    }
  };

  const requestPreset = (preset: CameraPreset) => {
    if (maximumZoomFrame.current !== null) {
      window.cancelAnimationFrame(maximumZoomFrame.current);
      maximumZoomFrame.current = null;
    }
    useCommercialMapStore.getState().requestCameraPreset(preset);
  };
  const measureIdleScheduler = () => {
    if (schedulerFrame.current !== null) window.cancelAnimationFrame(schedulerFrame.current);
    const startedAt = performance.now();
    let previous: number | null = null;
    const intervalsMs: number[] = [];
    setSchedulerReport({ status: 'running', intervalsMs: [], elapsedMs: 0 });
    const sample = (at: number) => {
      const elapsedMs = at - startedAt;
      if (previous !== null) intervalsMs.push(Number((at - previous).toFixed(2)));
      previous = at;
      if (elapsedMs < 2500 && intervalsMs.length < 300) {
        schedulerFrame.current = window.requestAnimationFrame(sample);
      } else {
        schedulerFrame.current = null;
        setSchedulerReport({ status: 'complete', intervalsMs, elapsedMs: Math.round(elapsedMs) });
      }
    };
    // Does not invalidate or render the map: separates browser scheduling
    // from application CPU/GPU cost. A bounded DEV experiment, not a loop fix.
    schedulerFrame.current = window.requestAnimationFrame(sample);
  };
  const loseContextForQa = () => {
    const context = currentDiagnosticsCanvas()?.getContext('webgl2');
    contextLossExtension.current = context?.getExtension('WEBGL_lose_context') ?? null;
    contextLossExtension.current?.loseContext();
  };
  const capture = () => {
    window.__commercialMapRuntimeDiagnostics?.capture();
    setSummary(summarizeCommercialMapRuntimeDiagnostics());
  };
  const resetSamples = () => {
    window.__commercialMapRuntimeDiagnostics?.resetSamples();
    resetCommercialMapRenderTiming();
    setTiming(readCommercialMapRenderTiming());
    setTimingEnvironmentValid(document.visibilityState === 'visible' && document.hasFocus());
    capture();
  };
  const zoomToMinimumDistance = () => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '.commercial-map-rendering-diagnostics__viewport canvas',
    );
    if (!canvas) return;
    if (maximumZoomFrame.current !== null) window.cancelAnimationFrame(maximumZoomFrame.current);
    const bounds = canvas.getBoundingClientRect();
    let remainingSteps = MAXIMUM_ZOOM_WHEEL_STEPS;
    const dollyIn = () => {
      canvas.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: bounds.left + bounds.width / 2,
        clientY: bounds.top + bounds.height / 2,
        ctrlKey: true,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
        deltaY: -480,
      }));
      remainingSteps -= 1;
      canvas.dataset.commercialMapQaZoomSteps = String(MAXIMUM_ZOOM_WHEEL_STEPS - remainingSteps);
      maximumZoomFrame.current = remainingSteps > 0
        ? window.requestAnimationFrame(dollyIn)
        : null;
    };
    dollyIn();
  };
  const renderer = summary.renderer;
  const stressRunning = stressReport.status === 'running';

  return (
    <section
      className={`commercial-map-shell commercial-map-rendering-diagnostics ${hydrologicalModeActive ? 'is-hydrological-mode' : ''}`}
      aria-label="Diagnóstico de renderização do Mapa Comercial"
    >
      <header className="commercial-map-rendering-diagnostics__toolbar">
        <div>
          <strong>Rendering QA</strong>
          <span>Chrome/WebGL real · rota disponível somente em DEV</span>
        </div>
        <fieldset disabled={stressRunning} className="commercial-map-rendering-diagnostics__manual-controls">
        <nav aria-label="Cenários de câmera">
          <button type="button" onClick={() => requestPreset('overview')}>Geral</button>
          <button type="button" onClick={() => requestPreset('commercial')}>Close-up</button>
          <button type="button" onClick={zoomToMinimumDistance}>Zoom máximo</button>
          <button type="button" onClick={() => requestPreset('isometric')}>Oblíqua</button>
          <button type="button" onClick={() => requestPreset('top')}>Superior</button>
          <button
            type="button"
            aria-pressed={hydrologicalModeActive}
            onClick={() => useCommercialMapStore.getState().toggleHydrologicalMode()}
          >
            Hidrológica
          </button>
          <button
            type="button"
            aria-pressed={reducedGraphics}
            onClick={() => useCommercialMapStore.getState().setReducedGraphics(!reducedGraphics)}
          >
            Reduced
          </button>
          <button type="button" onClick={resetSamples}>Zerar amostra</button>
          <button type="button" onClick={capture}>Capturar</button>
          <button type="button" onClick={measureIdleScheduler}>Medir agendamento ocioso</button>
          <button type="button" onClick={loseContextForQa}>Perder contexto (QA)</button>
          <button type="button" onClick={() => contextLossExtension.current?.restoreContext()}>Restaurar contexto (QA)</button>
        </nav>
        </fieldset>
      </header>

      <div className="commercial-map-rendering-diagnostics__stress" data-stress-status={stressReport.status}>
        <div className="commercial-map-rendering-diagnostics__stress-controls">
          <button type="button" disabled={stressRunning || !renderer} onClick={() => void runStressCycles(['hydrology'])}>20 ciclos Hidrológica</button>
          <button type="button" disabled={stressRunning || !renderer} onClick={() => void runStressCycles(['quality'])}>20 ciclos Qualidade</button>
          <button type="button" disabled={stressRunning || !renderer} onClick={() => void runStressCycles(['hydrology', 'quality'])}>20 + 20 ciclos</button>
          <button type="button" disabled={!stressRunning} onClick={() => stressAbort.current?.abort()}>Cancelar ciclos</button>
          <label>
            <input type="checkbox" checked={timing.enabled} onChange={(event) => {
              setCommercialMapRenderTimingEnabled(event.target.checked);
              resetCommercialMapRenderTiming();
              setTiming(readCommercialMapRenderTiming());
              setTimingEnvironmentValid(document.visibilityState === 'visible' && document.hasFocus());
            }} />
            Medir CPU/GPU (DEV)
          </label>
        </div>
        <output data-testid="commercial-map-stress-summary" aria-live="polite">
          {stressReport.status} · {stressReport.phase ?? '—'} · {stressReport.completedCycles}/{stressReport.totalCycles} ciclos · {stressReport.completedTransitions} transições · {Math.round(stressReport.elapsedMs / 1000)}s
          {stressReport.error ? ` · ${stressReport.error}` : ''}
        </output>
        <output data-testid="commercial-map-stress-resources" data-resource-status={stressReport.resources?.status ?? 'unmeasured'}>
          Recursos aquecidos: {stressReport.resources?.status ?? 'não medidos'} · {stressReport.resources?.coveredBuckets ?? 0}/{stressReport.resources?.requiredBuckets ?? 0} grupos de modo/destino cobertos
        </output>
        <output
          data-testid="commercial-map-runtime-facts"
          data-document-visibility={runtimeFacts.visibility}
          data-document-focused={runtimeFacts.focused}
          data-camera-navigating={runtimeFacts.cameraNavigating}
          data-actual-dpr={runtimeFacts.actualDpr ?? ''}
          data-blur-events={foregroundCounts.blurEvents}
          data-hidden-events={foregroundCounts.hiddenEvents}
        >
          Documento: {runtimeFacts.visibility} · foco: {String(runtimeFacts.focused)} · navegação: {String(runtimeFacts.cameraNavigating)} · lunar: {runtimeFacts.lunarLaunchPhase}/{String(runtimeFacts.lunarLaunchReturning)} · DPR atual: {runtimeFacts.actualDpr ?? '—'} · blur/hidden: {foregroundCounts.blurEvents}/{foregroundCounts.hiddenEvents}
        </output>
        <details>
          <summary>Resultados JSON por transição</summary>
          <pre data-testid="commercial-map-stress-json">{JSON.stringify(stressReport, null, 2)}</pre>
        </details>
        <small>Contadores confirmam draws enviados ao framebuffer da tela; screenshots validam os pixels exibidos.</small>
        <details>
          <summary>CPU/GPU JSON · {timing.enabled ? timingEnvironmentValid ? 'amostra em primeiro plano' : 'amostra inválida: foco/visibilidade' : 'desabilitado'}</summary>
          <pre data-testid="commercial-map-timing-json">{JSON.stringify({ environmentValid: timingEnvironmentValid, environment: runtimeFacts, timing }, null, 2)}</pre>
        </details>
        <details>
          <summary>Agendamento ocioso · {schedulerReport.status}</summary>
          <pre data-testid="commercial-map-scheduler-json">{JSON.stringify(schedulerReport)}</pre>
        </details>
      </div>

      <div className="commercial-map-viewport commercial-map-rendering-diagnostics__viewport">
        <div className="commercial-map-stage">
          <CommercialMapCanvas
            active
            entities={OFFICIAL_REFERENCE_DATA.entities}
            parkingOwnerEntities={OFFICIAL_REFERENCE_DATA.entities}
            siteEnvironmentEntities={OFFICIAL_REFERENCE_DATA.entities}
            lots={OFFICIAL_REFERENCE_DATA.lots}
            calibration={OFFICIAL_REFERENCE_DATA.calibration}
            matchingEntityIds={EMPTY_MATCHING_ENTITY_IDS}
            filtersActive={false}
          />
          <CommercialMapRendererStatus />
        </div>

        <aside
          className="commercial-map-rendering-diagnostics__metrics"
          aria-label="Telemetria do renderer"
          aria-live="polite"
          data-context-lost={summary.contextLost}
          data-quality-changes={summary.qualityChanges}
          data-sampled-frames={summary.sampledFrames}
        >
          <strong>Frame consistency</strong>
          <dl>
            <div><dt>FPS médio</dt><dd>{formatMetric(summary.averageFps)}</dd></div>
            <div><dt>1% low</dt><dd>{formatMetric(summary.onePercentLowFps)}</dd></div>
            <div><dt>Frame médio</dt><dd>{formatMetric(summary.averageFrameTimeMs, ' ms')}</dd></div>
            <div><dt>P95 / P99</dt><dd>{formatMetric(summary.p95FrameTimeMs)} / {formatMetric(summary.p99FrameTimeMs)} ms</dd></div>
            <div><dt>Amostras / jank</dt><dd>{summary.sampledFrames} / {summary.jankFrames}</dd></div>
            <div><dt>Long tasks</dt><dd>{summary.longTasks}</dd></div>
            <div><dt>React / tiers</dt><dd>{summary.reactCommits} / {summary.qualityChanges}</dd></div>
            <div><dt>Context lost</dt><dd>{summary.contextLost}</dd></div>
          </dl>
          <strong>GPU snapshot</strong>
          <dl>
            <div><dt>Tier / DPR</dt><dd>{renderer?.qualityTier ?? '—'} / {renderer?.dpr ?? '—'}</dd></div>
            <div><dt>Buffer</dt><dd>{renderer ? `${renderer.width}×${renderer.height}` : '—'}</dd></div>
            <div><dt>Calls</dt><dd>{renderer?.calls ?? '—'}</dd></div>
            <div><dt>Triangles</dt><dd>{renderer?.triangles.toLocaleString('pt-BR') ?? '—'}</dd></div>
            <div><dt>Programs</dt><dd>{renderer?.programs ?? '—'}</dd></div>
            <div><dt>Textures / geometry</dt><dd>{renderer ? `${renderer.textures} / ${renderer.geometries}` : '—'}</dd></div>
          </dl>
          <p title={renderer?.gpuRenderer}>{renderer?.gpuRenderer ?? 'GPU ainda não capturada'}</p>
          {timing.enabled && <>
            <strong>CPU submit / GPU query</strong>
            <dl data-timing-valid={timingEnvironmentValid}>
              <div><dt>Validade</dt><dd>{timingEnvironmentValid ? 'primeiro plano' : 'inválida · foco/aba'}</dd></div>
              <div><dt>CPU médio / P95</dt><dd>{timingEnvironmentValid ? `${formatMetric(timing.cpu.averageMs)} / ${formatMetric(timing.cpu.p95Ms)} ms` : '—'}</dd></div>
              <div><dt>GPU médio / P95</dt><dd>{timing.gpuStatus !== 'supported' ? `indisponível (${timing.gpuStatus})` : timingEnvironmentValid ? `${formatMetric(timing.gpu.averageMs)} / ${formatMetric(timing.gpu.p95Ms)} ms` : '—'}</dd></div>
              <div><dt>Amostras CPU / GPU</dt><dd>{timing.cpu.samples} / {timing.gpu.samples}</dd></div>
              <div><dt>Queries pendentes / descartadas</dt><dd>{timing.pendingQueries} / {timing.droppedGpuQueries}</dd></div>
            </dl>
          </>}
        </aside>
      </div>
    </section>
  );
}
