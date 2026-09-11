import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { DirectionalLight, Vector3 } from 'three';
import { commercialMapDiagnosticsEnabled } from '../utils/performanceDiagnostics';
import { useCommercialMapStore } from '../state/useCommercialMapStore';

export interface LightingSample {
  at: number; deltaMs: number; visible: boolean; focused: boolean; position: number[]; quaternion: number[];
  target: number[]; projection: number[]; width: number; height: number; dpr: number;
  sunVisible: boolean; sunIntensity: number; sunPosition: number[]; shadowVersion: number;
  sunrise: string; night: boolean; navigating: boolean; programs: number;
  calls: number; geometries: number; textures: number;
}
declare global {
  interface Window {
    __commercialMapLightingTrace?: { until: number; samples: LightingSample[] };
  }
}

/** Opt-in bounded trace; no scene mutation, commercial data, or unbounded frame history. */
export function LightingPerformanceProbe() {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    if (!commercialMapDiagnosticsEnabled) return;
    const start = () => { window.__commercialMapLightingTrace = { until: performance.now() + 12_000, samples: [] }; };
    gl.domElement.addEventListener('commercial-map-trace-lighting', start);
    return () => { gl.domElement.removeEventListener('commercial-map-trace-lighting', start); };
  }, [gl]);
  useFrame(({ camera, scene, controls }, delta) => {
    const trace = window.__commercialMapLightingTrace;
    if (!trace || performance.now() > trace.until || trace.samples.length >= 1200) return;
    const light = scene.getObjectByName('CommercialMapAuthoritativeSunLight') as DirectionalLight | undefined;
    if (!light) return;
    const state = useCommercialMapStore.getState();
    trace.samples.push({
      at: performance.now(), deltaMs: delta * 1000, visible: !document.hidden, focused: document.hasFocus(),
      position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
      target: (controls as unknown as { target?: Vector3 })?.target?.toArray() ?? [],
      projection: camera.projectionMatrix.toArray(), width: gl.domElement.width, height: gl.domElement.height,
      dpr: gl.getPixelRatio(), sunVisible: light.visible, sunIntensity: light.intensity,
      sunPosition: light.position.toArray(), shadowVersion: light.shadow.map?.texture.version ?? -1,
      sunrise: state.sunrisePhase, night: state.nightModeActive, navigating: state.cameraNavigating,
      programs: gl.info.programs?.length ?? 0, calls: gl.info.render.calls,
      geometries: gl.info.memory.geometries, textures: gl.info.memory.textures,
    });
  }, 2);
  return null;
}
