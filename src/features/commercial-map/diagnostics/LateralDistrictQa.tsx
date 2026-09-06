import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls } from 'three-stdlib';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import { stopCommercialMapOrbitMotion } from '../utils/cameraTransition';
import { readCommercialMapRenderTiming, resetCommercialMapRenderTiming, setCommercialMapRenderTimingEnabled } from '../utils/renderingTiming';

// DEV-only repeatable poses; no new production camera mode or navigation limit.
const EVENT = 'commercial-map:district-qa';
type View = 'top' | 'oblique' | 'reverse' | 'close' | 'sweep' | 'visibility' | 'maximum' | 'snapshot';
const dispatch = (view: View, visible?: boolean) => window.dispatchEvent(new CustomEvent(EVENT, { detail: { view, visible } }));

export function LateralDistrictQaPanel() {
  const [shown, setShown] = useState(true);
  const [clean, setClean] = useState(true);
  const night = useCommercialMapStore((state) => state.nightModeActive);
  const reduced = useCommercialMapStore((state) => state.reducedGraphics);
  useEffect(() => {
    document.querySelector('.commercial-map-rendering-diagnostics')?.classList.toggle('is-district-qa', clean);
  }, [clean]);
  const [report, setReport] = useState<unknown>(null);
  useEffect(() => {
    const receive = (event: Event) => setReport((event as CustomEvent).detail);
    window.addEventListener(`${EVENT}:report`, receive);
    return () => window.removeEventListener(`${EVENT}:report`, receive);
  }, []);
  return <details className="commercial-map-district-qa" open>
    <summary>Inspeção do bairro lateral</summary>
    <div className="commercial-map-rendering-diagnostics__stress-controls">
      <button onClick={() => dispatch('top')}>Bairro superior</button>
      <button onClick={() => dispatch('oblique')}>Bairro oblíquo</button>
      <button onClick={() => dispatch('reverse')}>Bairro reverso</button>
      <button onClick={() => dispatch('close')}>Bairro perto</button>
      <button onClick={() => dispatch('maximum')}>Bairro zoom máximo</button>
      <button onClick={() => useCommercialMapStore.getState().requestCameraPreset('overview')}>Parque geral</button>
      <button aria-pressed={night} onClick={() => useCommercialMapStore.getState().toggleNightMode()}>Noite bairro</button>
      <button aria-pressed={reduced} onClick={() => useCommercialMapStore.getState().setReducedGraphics(!reduced)}>Qualidade reduzida bairro</button>
      <button onClick={() => dispatch('sweep')}>Medir bairro 6s</button>
      <button onClick={() => dispatch('snapshot')}>Registrar quadro</button>
      <button aria-pressed={shown} onClick={() => { dispatch('visibility', !shown); setShown(!shown); }}>Exibir bairro</button>
      <button aria-pressed={clean} onClick={() => setClean(!clean)}>Tela limpa</button>
    </div>
    <output data-testid="district-qa-report">{JSON.stringify(report)}</output>
  </details>;
}

/** Mounted exclusively by the DEV dynamic import in the shared map canvas. */
export function LateralDistrictQaScene() {
  const { camera, gl, invalidate, scene, size } = useThree();
  const controls = useThree((state) => state.controls) as OrbitControls | null;
  const sweep = useRef<{ started: number; frames: number[]; scheduler: number[]; valid: boolean; observed?: boolean; finished?: boolean } | null>(null);
  const schedulerFrame = useRef<number>();
  const hidden = useRef(false);
  const captureRequested = useRef(false);
  useEffect(() => () => {
    if (sweep.current) useCommercialMapStore.getState().setCameraNavigating(false);
    if (schedulerFrame.current !== undefined) window.cancelAnimationFrame(schedulerFrame.current);
    sweep.current = null;
    setCommercialMapRenderTimingEnabled(false);
  }, []);
  useEffect(() => {
    if (!controls || !(camera instanceof PerspectiveCamera)) return;
    const pose = (event: Event) => {
      const { view, visible } = (event as CustomEvent<{ view: View; visible?: boolean }>).detail;
      if (view === 'snapshot') { captureRequested.current = true; invalidate(); return; }
      if (view === 'visibility') {
        hidden.current = visible === false;
        const district = scene.getObjectByName('lateral-residential-district');
        if (district) district.visible = !hidden.current;
        invalidate();
        return;
      }
      if (useCommercialMapStore.getState().cameraNavigating) return;
      sweep.current = null;
      stopCommercialMapOrbitMotion(camera, controls);
      // Registered avenue interval: world x[-47,13], exterior z[28,44].
      const center = new Vector3(-17, 0.1, 35.5);
      const portrait = size.height > size.width;
      const directions: Record<Exclude<View, 'visibility' | 'snapshot'>, Vector3> = {
        top: portrait ? new Vector3(.008, 1, 0) : new Vector3(0, 1, .008),
        oblique: portrait ? new Vector3(1, .8, .3) : new Vector3(.3, .8, 1),
        reverse: portrait ? new Vector3(-1, .65, -.35) : new Vector3(-.35, .65, -1), close: new Vector3(.3, .6, 1),
        sweep: new Vector3(0.3, 0.8, 1), maximum: new Vector3(.3, .6, 1),
      };
      const tangent = Math.tan(camera.fov * Math.PI / 360);
      const horizontalFit = (portrait ? 13 : 36) / (tangent * Math.max(.2, size.width / size.height));
      const distance = view === 'maximum' ? controls.minDistance : view === 'close' ? 15 : Math.max(53, horizontalFit, portrait ? 36 / tangent : 0);
      controls.target.copy(center);
      camera.up.set(0, 1, 0);
      camera.position.copy(center).addScaledVector(directions[view].normalize(), distance);
      camera.lookAt(center);
      controls.update();
      camera.updateMatrixWorld();
      gl.domElement.dataset.districtQaView = view;
      if (view === 'sweep') {
        const run = { started: performance.now(), frames: [], scheduler: [] as number[], valid: document.hasFocus() && document.visibilityState === 'visible' };
        sweep.current = run;
        let previous: number | undefined;
        const scheduler = (now: number) => {
          if (sweep.current !== run) return;
          if (previous !== undefined && now - run.started > 400) run.scheduler.push(now - previous);
          previous = now;
          schedulerFrame.current = window.requestAnimationFrame(scheduler);
        };
        schedulerFrame.current = window.requestAnimationFrame(scheduler);
        window.__commercialMapRuntimeDiagnostics?.resetSamples();
        setCommercialMapRenderTimingEnabled(true);
        resetCommercialMapRenderTiming();
        useCommercialMapStore.getState().setCameraNavigating(true);
        window.dispatchEvent(new CustomEvent(`${EVENT}:report`, { detail: { status: 'running' } }));
      }
      invalidate();
    };
    window.addEventListener(EVENT, pose);
    return () => window.removeEventListener(EVENT, pose);
  }, [camera, controls, gl, invalidate, scene, size]);
  useFrame((_state, delta) => {
    const district = scene.getObjectByName('lateral-residential-district');
    if (district && hidden.current) district.visible = false;
    const run = sweep.current;
    if (!run || !controls) return;
    const elapsed = performance.now() - run.started;
    run.valid &&= document.hasFocus() && document.visibilityState === 'visible' && !gl.getContext().isContextLost();
    if (run.observed && elapsed > 400) run.frames.push(delta * 1000); // omit the initial demand-idle delta even if the first frame is delayed
    run.observed = true;
    const phase = Math.min(1, elapsed / 6000);
    const angle = -0.55 + phase * 1.1;
    const radius = Math.max(48, 45 / Math.max(.4, size.width / size.height)) + Math.sin(phase * Math.PI * 2) * 10;
    camera.position.set(-17 + Math.sin(angle) * radius, 32, 35.5 + Math.cos(angle) * radius);
    camera.lookAt(controls.target);
    if (elapsed < 6000) invalidate();
    else run.finished = true;
  });
  // The environment owns presentation at priority 1. Sample immediately after
  // that draw, before ending navigation can switch the compositor back on.
  useFrame(() => {
    if (captureRequested.current) {
      captureRequested.current = false;
      const store = useCommercialMapStore.getState();
      window.dispatchEvent(new CustomEvent(`${EVENT}:report`, { detail: {
        status: 'snapshot', districtVisible: !hidden.current, night: store.nightModeActive,
        reduced: store.reducedGraphics, view: gl.domElement.dataset.districtQaView,
        health: JSON.parse(gl.domElement.dataset.commercialMapRenderHealth ?? '{}'),
        renderer: window.__commercialMapRuntimeDiagnostics?.capture(),
        camera: JSON.parse(gl.domElement.dataset.commercialMapCameraDiagnostics ?? '{}'),
      } }));
    }
    const run = sweep.current;
    if (run?.finished && controls) {
      const sorted = [...run.frames].sort((a, b) => a - b);
      const mean = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length);
      window.dispatchEvent(new CustomEvent(`${EVENT}:report`, { detail: {
        status: run.valid ? 'complete' : 'invalid-foreground', districtVisible: !hidden.current,
        frames: sorted.length, averageMs: Number(mean.toFixed(2)), fps: Number((1000 / mean).toFixed(1)),
        p95Ms: Number((sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0).toFixed(2)),
        p99Ms: Number((sorted[Math.ceil(sorted.length * 0.99) - 1] ?? 0).toFixed(2)),
        schedulerFrames: run.scheduler.length,
        schedulerAverageMs: Number((run.scheduler.reduce((sum, value) => sum + value, 0) / Math.max(1, run.scheduler.length)).toFixed(2)),
        viewport: [size.width, size.height], renderer: window.__commercialMapRuntimeDiagnostics?.capture(),
        timing: readCommercialMapRenderTiming(gl.domElement),
        contextLost: gl.getContext().isContextLost(),
      } }));
      sweep.current = null;
      useCommercialMapStore.getState().setCameraNavigating(false);
      controls.update();
    }
  }, 2);
  return null;
}
