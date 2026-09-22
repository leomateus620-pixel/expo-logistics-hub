import { useLayoutEffect, useRef, type RefObject } from 'react';
import { PerspectiveCamera, type Camera } from 'three';
import type { OrbitControls } from 'three-stdlib';
import { useVisitStore } from './useVisitStore';
import { visitCameraFrame } from './visitRuntime';
import { stopCommercialMapOrbitMotion } from '../utils/cameraTransition';

const controlFields = ['enabled','enableDamping','enablePan','enableRotate','enableZoom','zoomToCursor',
  'minDistance','maxDistance','minPolarAngle','maxPolarAngle','minAzimuthAngle','maxAzimuthAngle'] as const;
/** Ownership lives in CameraRig; the lazy controller only publishes numeric poses. */
export function useVisitCameraLease(camera: Camera, controlsRef: RefObject<OrbitControls>, invalidate: () => void) {
  const enabled = useVisitStore(s => s.enabled);
  const snapshot = useRef<null | {
    position: number[]; quaternion: number[]; up: number[]; target: number[];
    fov: number; near: number; far: number; zoom: number; view: PerspectiveCamera['view'];
    controls: Record<string, boolean | number>;
  }>(null);
  const restoredAt = useRef(0);
  const capture = () => {
    const controls = controlsRef.current;
    if (snapshot.current || !(camera instanceof PerspectiveCamera) || !controls) return;
    const values: Record<string, boolean | number> = {};
    for (const key of controlFields) values[key] = controls[key];
    // A cancelled aerial transition may have temporarily locked this instance.
    values.enabled = true;
    snapshot.current = { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), up: camera.up.toArray(),
      target: controls.target.toArray(), fov: camera.fov, near: camera.near, far: camera.far, zoom: camera.zoom,
      view: camera.view ? { ...camera.view } : null, controls: values };
    Object.assign(visitCameraFrame.initial.position, camera.position);
    Object.assign(visitCameraFrame.initial.target, controls.target);
    Object.assign(visitCameraFrame.initial, { fov: camera.fov, near: camera.near, far: camera.far, captured: true });
    visitCameraFrame.ready = false; visitCameraFrame.restored = false;
    stopCommercialMapOrbitMotion(camera, controls);
    controls.enabled = false;
  };
  useLayoutEffect(() => useVisitStore.subscribe((state, previous) => {
    if (state.enabled && !previous.enabled) capture();
  // Capture synchronously before React applies disabled OrbitControls props.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [camera, controlsRef]);
  useLayoutEffect(() => {
    if (enabled) { capture(); invalidate(); return; }
    const saved = snapshot.current, controls = controlsRef.current;
    if (!saved || !(camera instanceof PerspectiveCamera) || !controls) return;
    stopCommercialMapOrbitMotion(camera, controls);
    camera.position.fromArray(saved.position); camera.quaternion.fromArray(saved.quaternion); camera.up.fromArray(saved.up);
    Object.assign(camera, { fov: saved.fov, near: saved.near, far: saved.far, zoom: saved.zoom, view: saved.view });
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(); controls.target.fromArray(saved.target);
    Object.assign(controls, saved.controls);
    restoredAt.current = performance.now();
    snapshot.current = null; visitCameraFrame.ready = false; visitCameraFrame.initial.captured = false;
    invalidate();
  // Capture only at an ownership boundary, not on each published pose.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, camera, controlsRef, invalidate]);
  return {
    enabled, restoredAt,
    apply(interior: boolean) {
      if (!enabled || interior) return false;
      capture();
      const controls = controlsRef.current;
      if (controls) controls.enabled = false;
      if (!(camera instanceof PerspectiveCamera) || !visitCameraFrame.ready) return true;
      const pose = visitCameraFrame;
      camera.position.set(pose.position.x,pose.position.y,pose.position.z);
      camera.up.set(0,1,0); camera.lookAt(pose.target.x,pose.target.y,pose.target.z);
      if (controls) controls.target.set(pose.target.x,pose.target.y,pose.target.z);
      if (camera.fov !== pose.fov || camera.near !== pose.near || camera.far !== pose.far || camera.view?.enabled || camera.zoom !== 1) {
        camera.fov = pose.fov; camera.near = pose.near; camera.far = pose.far; camera.zoom = 1;
        camera.clearViewOffset(); camera.updateProjectionMatrix();
      }
      camera.updateMatrixWorld(); return true;
    },
  };
}
