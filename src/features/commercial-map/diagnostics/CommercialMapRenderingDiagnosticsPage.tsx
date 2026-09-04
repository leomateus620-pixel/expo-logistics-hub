import { useEffect, useRef, useState } from 'react';
import { CommercialMapCanvas } from '../components/canvas/CommercialMapCanvas';
import { OFFICIAL_REFERENCE_DATA } from '../data/officialReference2026';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import {
  summarizeCommercialMapRuntimeDiagnostics,
  type CommercialMapRuntimeSummary,
} from '../utils/runtimeDiagnostics';
import type { CameraPreset } from '../types';
import '../commercial-map.css';
import '../commercial-map-mobile.css';
import './commercial-map-rendering-diagnostics.css';

const EMPTY_MATCHING_ENTITY_IDS = new Set<string>();
const MAXIMUM_ZOOM_WHEEL_STEPS = 80;

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
  const maximumZoomFrame = useRef<number | null>(null);

  useEffect(() => {
    const store = useCommercialMapStore.getState();
    store.initializeLayers(OFFICIAL_REFERENCE_DATA.layers);
    store.setHydrologicalModeActive(false);
    store.setReducedGraphics(false);
    store.setLabelsVisible(true);
    store.setTreesVisible(true);
    store.requestCameraPreset('overview');
    window.__commercialMapRuntimeDiagnostics?.resetSamples();

    const refresh = () => setSummary(summarizeCommercialMapRuntimeDiagnostics());
    refresh();
    const timer = window.setInterval(refresh, 500);
    return () => {
      window.clearInterval(timer);
      if (maximumZoomFrame.current !== null) window.cancelAnimationFrame(maximumZoomFrame.current);
      const latest = useCommercialMapStore.getState();
      latest.setHydrologicalModeActive(false);
      latest.setReducedGraphics(false);
      latest.setCameraNavigating(false);
    };
  }, []);

  const requestPreset = (preset: CameraPreset) => {
    if (maximumZoomFrame.current !== null) {
      window.cancelAnimationFrame(maximumZoomFrame.current);
      maximumZoomFrame.current = null;
    }
    useCommercialMapStore.getState().requestCameraPreset(preset);
  };
  const capture = () => {
    window.__commercialMapRuntimeDiagnostics?.capture();
    setSummary(summarizeCommercialMapRuntimeDiagnostics());
  };
  const resetSamples = () => {
    window.__commercialMapRuntimeDiagnostics?.resetSamples();
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
        </nav>
      </header>

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
        </aside>
      </div>
    </section>
  );
}
