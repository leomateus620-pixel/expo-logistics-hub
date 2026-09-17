import { Component, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type ErrorInfo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { commercialMapDiagnosticsEnabled, getCommercialMapBootSnapshot, markCommercialMapStage } from '../../utils/performanceDiagnostics';
import { retainHydrologyPreparationOwner } from '../../utils/hydrologyPreparationResource';
import { createSceneHydrationQueue, qualifiesCommercialMapReady, type SceneHydrationTask } from '../../utils/progressiveSceneBoot';
import { COMMERCIAL_MAP_PREPARING_EVENT } from '../../utils/renderingHealth';
import { readLatestCommercialMapRenderHealth } from '../../utils/renderingHealth';
import { isCommercialSceneCompiling, prepareCommercialSceneLayer } from '../../utils/sceneShaderWarmup';

const queues = new WeakMap<HTMLCanvasElement, ReturnType<typeof createSceneHydrationQueue>>();
const lastInteraction = new WeakMap<HTMLCanvasElement, number>();
const revealedMaterials = new WeakSet<THREE.Material>();

function requestHydrationSlot(callback: () => void) {
  let idle = 0;
  const timer = window.setTimeout(() => {
    if ('requestIdleCallback' in window) {
      idle = window.requestIdleCallback(callback, { timeout: 600 });
    } else callback();
  }, 80);
  return () => {
    window.clearTimeout(timer);
    if (idle) window.cancelIdleCallback(idle);
  };
}

function queueFor(canvas: HTMLCanvasElement) {
  let queue = queues.get(canvas);
  if (!queue) {
    queue = createSceneHydrationQueue({
      request: requestHydrationSlot,
      canRun: () => !document.hidden && readLatestCommercialMapRenderHealth(canvas)?.status !== 'context-lost'
        && !useCommercialMapStore.getState().cameraNavigating
        && !canvas.dataset.commercialMapPreparing
        && performance.now() - (lastInteraction.get(canvas) ?? 0) > 350,
      onComplete: () => {
        canvas.dataset.commercialMapHydration = 'complete';
        markCommercialMapStage('secondary-hydration-complete');
      },
    });
    queues.set(canvas, queue);
  }
  return queue;
}

/** Allows engine preparation to use the same serialized, navigation-aware queue. */
// eslint-disable-next-line react-refresh/only-export-components
export function scheduleCommercialMapSceneTask(canvas: HTMLCanvasElement, task: SceneHydrationTask) {
  return queueFor(canvas).add(task);
}

/** Only engine-only / opt-in layers remain deferred. All default visible
 * structures and vegetation are committed and compiled before this barrier. */
export function CommercialMapInteractiveBoot() {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const controls = useThree((state) => state.controls);
  const timing = useRef({ last: 0, responsive: 0, ready: false });
  useEffect(() => {
    const canvas = gl.domElement;
    const releaseHydrologyOwner = retainHydrologyPreparationOwner(canvas);
    const reset = () => {
      timing.current = { last: 0, responsive: 0, ready: false };
      canvas.dataset.commercialMapReady = 'false';
      canvas.dataset.commercialMapInteractive = 'false';
      invalidate();
    };
    canvas.addEventListener('webglcontextlost', reset);
    canvas.addEventListener(COMMERCIAL_MAP_PREPARING_EVENT, reset);
    let responseMeasured = false;
    const onInput = () => {
      lastInteraction.set(canvas, performance.now());
      if (!timing.current.ready || responseMeasured) return;
      responseMeasured = true;
      const startedAt = performance.now();
      markCommercialMapStage('controls-input');
      requestAnimationFrame(() => markCommercialMapStage('controls-responsive', performance.now() - startedAt));
    };
    canvas.addEventListener('pointerdown', onInput, { passive: true });
    canvas.addEventListener('pointermove', onInput, { passive: true });
    canvas.addEventListener('wheel', onInput, { passive: true });
    markCommercialMapStage('first-frame-requested');
    invalidate();
    return () => {
      canvas.removeEventListener('pointerdown', onInput);
      canvas.removeEventListener('pointermove', onInput);
      canvas.removeEventListener('wheel', onInput);
      canvas.removeEventListener('webglcontextlost', reset);
      canvas.removeEventListener(COMMERCIAL_MAP_PREPARING_EVENT, reset);
      queues.get(canvas)?.dispose();
      queues.delete(canvas);
      lastInteraction.delete(canvas);
      releaseHydrologyOwner();
    };
  }, [gl, invalidate]);
  useFrame(() => {
    const frame = timing.current;
    if (frame.ready) return;
    const now = performance.now();
    const interval = frame.last ? now - frame.last : 0;
    frame.last = now;
    frame.responsive = interval > 0 && interval <= 100 ? frame.responsive + 1 : 0;
    const health = readLatestCommercialMapRenderHealth(gl.domElement);
    if (qualifiesCommercialMapReady({
      essentialPrepared: gl.domElement.dataset.commercialMapEssentialReady === 'true',
      presentedFrames: health?.presentedFrames ?? 0,
      consecutiveResponsiveFrames: frame.responsive,
      preparing: isCommercialSceneCompiling(gl) || Boolean(gl.domElement.dataset.commercialMapPreparing)
        || health?.status === 'failed' || health?.status === 'context-lost',
      controlsInstalled: Boolean(controls),
      frameIntervalMs: interval,
    })) {
      frame.ready = true;
      gl.domElement.dataset.commercialMapInteractive = 'true';
      gl.domElement.dataset.commercialMapReady = 'true';
      markCommercialMapStage('commercial-map-ready');
      markCommercialMapStage('first-interactive');
      queueFor(gl.domElement).start();
    } else invalidate();
  }, -0.5);
  return null;
}

/** Attach the reveal once, before first compilation. Shared materials already
 * visible elsewhere stay unchanged. Geometry, picking and final opacity persist. */
function attachLayerReveal(group: THREE.Group, scene: THREE.Scene, blend: THREE.IUniform<number>) {
  const candidates = new Set<THREE.Material>();
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => candidates.add(material));
  });
  const outside = new Set<THREE.Material>();
  const visit = (object: THREE.Object3D) => {
    if (object === group) return;
    const mesh = object as THREE.Mesh;
    if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => outside.add(material));
    object.children.forEach(visit);
  };
  visit(scene);
  candidates.forEach((material) => {
    if (outside.has(material) || revealedMaterials.has(material) || material instanceof THREE.ShaderMaterial) return;
    const previousCompile = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey.bind(material);
    material.onBeforeCompile = function (shader, renderer) {
      previousCompile.call(this, shader, renderer);
      shader.uniforms.uSceneHydrationBlend = blend;
      shader.fragmentShader = 'uniform float uSceneHydrationBlend;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (uSceneHydrationBlend < 1.0) {
          float hydrationNoise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (hydrationNoise > uSceneHydrationBlend) discard;
        }`);
    };
    material.customProgramCacheKey = () => `${previousKey()}:progressive-reveal-v1`;
    material.needsUpdate = true;
    revealedMaterials.add(material);
  });
}

export function PreparedSceneLayer({ id, children, complete, waitForMilestone }: {
  id: string; children: ReactNode; complete: () => void; waitForMilestone?: string;
}) {
  const group = useRef<THREE.Group>(null);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const blend = useRef({ value: 0 });
  const prepared = useRef(false);
  const completed = useRef(false);
  const finish = useRef(complete);
  finish.current = complete;
  const task = useRef<{ complete: () => void; released: boolean }>({ complete: () => finish.current(), released: false });
  useLayoutEffect(() => {
    const layer = group.current;
    if (!layer) return;
    let active = true;
    let generation = 0;
    let controller: AbortController | undefined;
    let cancelRestoreTask: (() => void) | undefined;
    attachLayerReveal(layer, scene, blend.current);
    const prepare = () => {
      const current = ++generation;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const startedAt = performance.now();
      prepared.current = false;
      completed.current = false;
      blend.current.value = 0;
      layer.visible = false;
      markCommercialMapStage(`hydrate:${id}:mounted`);
      void prepareCommercialSceneLayer(gl, layer, scene, camera, signal).then(() => {
        if (!active || signal.aborted || current !== generation) return;
        prepared.current = true;
        layer.visible = true;
        gl.shadowMap.needsUpdate = true;
        invalidate();
      }, () => {
        if (!active || signal.aborted || current !== generation) return;
        // Shader errors happen outside React. Never submit the failed group
        // through the global frame owner; release unrelated queued work.
        markCommercialMapStage(`hydrate:${id}:compile`, performance.now() - startedAt, true);
        completed.current = true;
        layer.visible = false;
        releasePreparedTask(task.current);
        invalidate();
      });
    };
    const onLost = () => {
      generation += 1;
      controller?.abort();
      cancelRestoreTask?.();
      cancelRestoreTask = undefined;
      prepared.current = false;
      completed.current = true;
      layer.visible = false;
      releasePreparedTask(task.current);
    };
    const onRestored = () => {
      if (!active) return;
      cancelRestoreTask?.();
      cancelRestoreTask = scheduleCommercialMapSceneTask(gl.domElement, {
        id: `restore:${id}`, priority: 15,
        run: (done) => {
          if (!active) { done(); return; }
          task.current = { complete: done, released: false };
          prepare();
        },
      });
    };
    gl.domElement.addEventListener('webglcontextlost', onLost);
    gl.domElement.addEventListener('webglcontextrestored', onRestored);
    prepare();
    return () => {
      active = false;
      generation += 1;
      controller?.abort();
      cancelRestoreTask?.();
      gl.domElement.removeEventListener('webglcontextlost', onLost);
      gl.domElement.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [camera, gl, id, invalidate, scene]);
  useFrame((_, delta) => {
    if (!prepared.current || completed.current) return;
    blend.current.value = Math.min(1, blend.current.value + Math.min(delta, 0.05) / 0.65);
    if (blend.current.value === 1) {
      if (waitForMilestone && getCommercialMapBootSnapshot().marks[waitForMilestone] === undefined) {
        invalidate();
        return;
      }
      completed.current = true;
      markCommercialMapStage(`hydrate:${id}:end`);
      releasePreparedTask(task.current);
    } else invalidate();
  });
  return <group ref={group} name={`progressive-${id}`} visible={false}>{children}</group>;
}

function releasePreparedTask(task: { complete: () => void; released: boolean }) {
  if (task.released) return;
  task.released = true;
  task.complete();
}

/** Suspense handles downloading; failed optional downloads/rendering must not
 * escape to the already interactive Canvas or strand the remaining queue. */
export class DeferredSceneErrorBoundary extends Component<{
  id: string; children: ReactNode; onFailure: () => void;
}, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    markCommercialMapStage(`hydrate:${this.props.id}:failed`, undefined, true);
    if (commercialMapDiagnosticsEnabled) console.warn('[CommercialMap] optional layer unavailable', this.props.id, error, info);
    this.props.onFailure();
  }
  render() { return this.state.failed ? null : this.props.children; }
}

/** State is local to this boundary: admitting a layer never rerenders the world. */
export function DeferredSceneLayer({ id, priority, children, waitForMilestone }: {
  id: string;
  priority: number;
  children: ReactNode;
  waitForMilestone?: string;
}) {
  const canvas = useThree((state) => state.gl.domElement);
  const [admitted, setAdmitted] = useState(false);
  const complete = useRef<() => void>(() => undefined);
  useEffect(() => queueFor(canvas).add({
    id,
    priority,
    run: (done) => {
      markCommercialMapStage(`hydrate:${id}:start`);
      complete.current = done;
      setAdmitted(true);
    },
  }), [canvas, id, priority]);
  return admitted ? <DeferredSceneErrorBoundary id={id} onFailure={() => complete.current()}>
    <Suspense fallback={null}>
      <PreparedSceneLayer id={id} complete={() => complete.current()} waitForMilestone={waitForMilestone}>{children}</PreparedSceneLayer>
    </Suspense>
  </DeferredSceneErrorBoundary> : null;
}
