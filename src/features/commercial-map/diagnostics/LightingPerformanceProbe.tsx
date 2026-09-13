import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { DirectionalLight, Material, Object3D, Vector3 } from 'three';
import { commercialMapDiagnosticsEnabled } from '../utils/performanceDiagnostics';
import { useCommercialMapStore } from '../state/useCommercialMapStore';

export interface LightingSample {
  at: number; deltaMs: number; visible: boolean; focused: boolean; position: number[]; quaternion: number[];
  target: number[]; projection: number[]; width: number; height: number; dpr: number;
  sunVisible: boolean; sunIntensity: number; sunPosition: number[]; shadowVersion: number;
  sunrise: string; night: boolean; navigating: boolean; programs: number;
  calls: number; geometries: number; textures: number;
  triangles: number; rain: boolean; hydrology: boolean;
}
export interface EnvironmentSnapshot {
  at: number; position: number[]; quaternion: number[]; target: number[]; projection: number[];
  materials: number; materialIds: string[]; objects: number; threeListeners: number;
  listenerCoverage: 'Three scene objects and OrbitControls; DOM listeners require browser debugger';
  geometries: number; textures: number; programs: number; calls: number; triangles: number;
  width: number; height: number; dpr: number; sceneId: string; cameraId: string;
}
declare global {
  interface Window {
    __commercialMapLightingTrace?: { until: number; samples: LightingSample[] };
    __commercialMapEnvironmentTrace?: { until: number; samples: LightingSample[]; forceFrames: boolean };
    __commercialMapEnvironmentSnapshot?: EnvironmentSnapshot;
  }
}

/** Opt-in bounded trace; no scene mutation, commercial data, or unbounded frame history. */
export function LightingPerformanceProbe() {
  const gl = useThree((state) => state.gl);
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (!commercialMapDiagnosticsEnabled) return;
    const start = () => { window.__commercialMapLightingTrace = { until: performance.now() + 12_000, samples: [] }; };
    const snapshot = () => {
      const { camera, scene, controls } = get();
      const materialIds = new Set<string>();
      let objects = 0;
      let threeListeners = 0;
      const countListeners = (object: object | undefined) => {
        const listeners = (object as { _listeners?: Record<string, unknown[]> } | undefined)?._listeners;
        if (listeners) for (const entries of Object.values(listeners)) threeListeners += entries.length;
      };
      scene.traverse((object: Object3D & { material?: Material | Material[] }) => {
        objects += 1;
        countListeners(object);
        if (Array.isArray(object.material)) object.material.forEach((material) => materialIds.add(material.uuid));
        else if (object.material) materialIds.add(object.material.uuid);
      });
      countListeners(controls);
      window.__commercialMapEnvironmentSnapshot = {
        at: performance.now(), position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
        target: (controls as unknown as { target?: Vector3 })?.target?.toArray() ?? [],
        projection: camera.projectionMatrix.toArray(),
        materials: materialIds.size, materialIds: [...materialIds].sort(), objects, threeListeners,
        listenerCoverage: 'Three scene objects and OrbitControls; DOM listeners require browser debugger',
        geometries: gl.info.memory.geometries, textures: gl.info.memory.textures,
        programs: gl.info.programs?.length ?? 0, calls: gl.info.render.calls, triangles: gl.info.render.triangles,
        width: gl.domElement.width, height: gl.domElement.height, dpr: gl.getPixelRatio(),
        sceneId: scene.uuid, cameraId: camera.uuid,
      };
    };
    const environmentTrace = (event: Event) => {
      const duration = (event as CustomEvent<{ durationMs?: number }>).detail?.durationMs ?? 2500;
      window.__commercialMapEnvironmentTrace = {
        until: performance.now() + Math.min(30_000, Math.max(500, duration)), samples: [], forceFrames: true,
      };
      snapshot();
      invalidate();
    };
    gl.domElement.addEventListener('commercial-map-trace-lighting', start);
    gl.domElement.addEventListener('commercial-map-snapshot-environment', snapshot);
    gl.domElement.addEventListener('commercial-map-trace-environment', environmentTrace);
    return () => {
      gl.domElement.removeEventListener('commercial-map-trace-lighting', start);
      gl.domElement.removeEventListener('commercial-map-snapshot-environment', snapshot);
      gl.domElement.removeEventListener('commercial-map-trace-environment', environmentTrace);
      delete window.__commercialMapEnvironmentTrace;
    };
  }, [get, gl, invalidate]);
  useFrame(({ camera, scene, controls }, delta) => {
    const now = performance.now();
    const lightingTrace = window.__commercialMapLightingTrace;
    const environmentTrace = window.__commercialMapEnvironmentTrace;
    const trace = lightingTrace && now <= lightingTrace.until && lightingTrace.samples.length < 1200 ? lightingTrace : null;
    const environment = environmentTrace && now <= environmentTrace.until && environmentTrace.samples.length < 1800 ? environmentTrace : null;
    if (!trace && !environment) return;
    const light = scene.getObjectByName('CommercialMapAuthoritativeSunLight') as DirectionalLight | undefined;
    if (!light) return;
    const state = useCommercialMapStore.getState();
    const sample: LightingSample = {
      at: performance.now(), deltaMs: delta * 1000, visible: !document.hidden, focused: document.hasFocus(),
      position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
      target: (controls as unknown as { target?: Vector3 })?.target?.toArray() ?? [],
      projection: camera.projectionMatrix.toArray(), width: gl.domElement.width, height: gl.domElement.height,
      dpr: gl.getPixelRatio(), sunVisible: light.visible, sunIntensity: light.intensity,
      sunPosition: light.position.toArray(), shadowVersion: light.shadow.map?.texture.version ?? -1,
      sunrise: state.sunrisePhase, night: state.nightModeActive, navigating: state.cameraNavigating,
      programs: gl.info.programs?.length ?? 0, calls: gl.info.render.calls,
      geometries: gl.info.memory.geometries, textures: gl.info.memory.textures,
      triangles: gl.info.render.triangles, rain: state.rainModeActive, hydrology: state.hydrologicalModeActive,
    };
    trace?.samples.push(sample);
    environment?.samples.push(sample);
    // Explicit QA sampling only: measures continuous submitted frame cost and
    // records that fact, rather than mistaking demand-render idle for a stall.
    if (environment?.forceFrames) invalidate();
  }, 2);
  return null;
}
