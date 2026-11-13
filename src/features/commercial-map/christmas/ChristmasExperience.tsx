import { useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Group, MathUtils, Vector3 } from 'three';
import type { MapEntity } from '../types';
import type { CommercialMapTree } from '../data/commercialTrees';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import {
  COMMERCIAL_MAP_ANIMATION,
  COMMERCIAL_MAP_PRESENTATION_EVENT,
  commercialMapFrameActivity,
  isCommercialMapPresentationVisible,
  requestCommercialMapAnimationFrame,
} from '../utils/frameActivity';
import { compileCommercialMapPrograms } from '../utils/sceneShaderWarmup';
import { CHRISTMAS_FLIGHT_MS, createChristmasClock } from './christmasClock';
import {
  CHRISTMAS_CAMERA_FOV,
  CHRISTMAS_MODEL_SCALE,
  resolveChristmasFlight,
  sampleChristmasCamera,
  sampleChristmasFlight,
} from './christmasFlight';
import { createChristmasModel } from './christmasModel';
import { useChristmasSession } from './christmasSession';
import { createChristmasTrail } from './christmasTrail';
import { christmasCameraFrame } from './useChristmasCameraLease';

const ENTRY_CAMERA_MS = 420;

function prepare(entities: readonly MapEntity[], trees: readonly CommercialMapTree[], reduced: boolean) {
  const flight = resolveChristmasFlight(entities, trees);
  if (!flight) throw new Error('Corredor de Natal indisponível.');
  const model = createChristmasModel(reduced);
  const trail = createChristmasTrail(reduced);
  model.root.scale.setScalar(CHRISTMAS_MODEL_SCALE);
  const group = new Group();
  group.name = 'Fenasoja Christmas flight';
  group.add(model.root, trail.points);
  return { flight, model, trail, group };
}

export default function ChristmasExperience({
  id,
  entities,
  trees,
  reduced,
  night,
}: {
  id: number;
  entities: readonly MapEntity[];
  trees: readonly CommercialMapTree[];
  reduced: boolean;
  night: boolean;
}) {
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const camera = useThree(state => state.camera);
  const invalidate = useThree(state => state.invalidate);
  const runtime = useRef<ReturnType<typeof prepare> | null>(null);
  const clock = useRef(createChristmasClock());
  const shadersReady = useRef(false);
  const preparedAt = useRef<number | null>(null);
  const lead = useRef(new Vector3());
  const direction = useRef(new Vector3());
  const options = useRef({ entities, trees, reduced });
  const liveNight = useRef(night);
  liveNight.current = night;

  useLayoutEffect(() => {
    const current = useChristmasSession.getState();
    if (current.id !== id || current.phase !== 'preparing') return;
    const visible = () => !document.hidden && isCommercialMapPresentationVisible(gl);
    const onVisibility = () => {
      clock.current.setVisible(visible(), performance.now());
      if (visible()) invalidate();
    };
    const preparation = new AbortController();
    let resources: ReturnType<typeof prepare> | undefined;
    try {
      const { entities, trees, reduced } = options.current;
      resources = prepare(entities, trees, reduced);
      // Warm just the optional model against the existing scene's lights.
      void compileCommercialMapPrograms(gl, resources.group, camera, scene, preparation.signal).then(() => {
        if (preparation.signal.aborted) return;
        shadersReady.current = true;
        invalidate();
      }, () => {
        if (!preparation.signal.aborted) useChristmasSession.getState().greet(id);
      });
      resources.group.visible = false;
      scene.add(resources.group);
      runtime.current = resources;
    } catch {
      resources?.model.dispose();
      resources?.trail.dispose();
      current.greet(id);
      return;
    }
    const unsubscribe = useChristmasSession.subscribe((state) => {
      if (state.id === id && (state.phase === 'preparing' || state.phase === 'flying')) return;
      resources.group.visible = false;
      preparation.abort();
      invalidate();
    });
    document.addEventListener('visibilitychange', onVisibility);
    gl.domElement.addEventListener(COMMERCIAL_MAP_PRESENTATION_EVENT, onVisibility);
    invalidate();
    return () => {
      unsubscribe();
      preparation.abort();
      shadersReady.current = false;
      runtime.current = null;
      scene.remove(resources.group);
      resources.model.dispose();
      resources.trail.dispose();
      document.removeEventListener('visibilitychange', onVisibility);
      gl.domElement.removeEventListener(COMMERCIAL_MAP_PRESENTATION_EVENT, onVisibility);
      invalidate();
    };
  }, [camera, gl, id, invalidate, scene]);

  useFrame(({ size }) => {
    const current = useChristmasSession.getState();
    const data = runtime.current;
    if (!data || current.id !== id || (current.phase !== 'preparing' && current.phase !== 'flying')
      || document.hidden || !isCommercialMapPresentationVisible(gl)) return;
    if (!shadersReady.current) return;
    const lighting = commercialMapFrameActivity(gl).nightBlend;
    const night = liveNight.current || useCommercialMapStore.getState().nightModeActive;
    if (preparedAt.current === null && Math.abs(lighting - Number(night)) > 0.002) {
      requestCommercialMapAnimationFrame(gl, invalidate, COMMERCIAL_MAP_ANIMATION.christmas);
      return;
    }
    const now = performance.now();
    try {
      preparedAt.current ??= now;
      const blend = MathUtils.smoothstep(now - preparedAt.current, 0, ENTRY_CAMERA_MS);
      const elapsed = blend === 1 ? clock.current.frame(now) : 0;
      if (elapsed >= CHRISTMAS_FLIGHT_MS) {
        data.group.visible = false;
        current.greet(id, true);
        return;
      }
      const seconds = elapsed / 1000;
      sampleChristmasCamera(data.flight, seconds, size.width / Math.max(1, size.height),
        christmasCameraFrame.position, christmasCameraFrame.target);
      Object.assign(christmasCameraFrame, { ready: true, blend, fov: CHRISTMAS_CAMERA_FOV });
      if (blend === 1) {
        const { model, flight, trail } = data;
        const ahead = lead.current;
        const tangent = direction.current;
        sampleChristmasFlight(flight, seconds, model.root.position);
        sampleChristmasFlight(flight, seconds + 0.03, ahead);
        sampleChristmasFlight(flight, seconds - 0.03, tangent);
        tangent.subVectors(ahead, tangent);
        const heading = -Math.atan2(tangent.z, tangent.x);
        const pitch = Math.atan2(tangent.y, Math.hypot(tangent.x, tangent.z));
        model.root.rotation.set(0.085 * Math.sin(seconds * 1.62), heading, pitch, 'YXZ');
        model.update(seconds, night);
        trail.update(flight, seconds, model.root, night, size.height * gl.getPixelRatio() * 1.36);
        data.group.visible = true;
        current.fly(id);
      }
      requestCommercialMapAnimationFrame(gl, invalidate, COMMERCIAL_MAP_ANIMATION.christmas);
    } catch {
      data.group.visible = false;
      current.greet(id);
    }
  }, -2);

  return null;
}
