import { useLayoutEffect, useRef, type RefObject } from 'react';
import { PerspectiveCamera, Quaternion, Vector3, type Camera } from 'three';
import type { OrbitControls } from 'three-stdlib';
import { registerSoyHarvestBeforeStart, useSoyHarvestStore } from './useSoyHarvestStore';
import { soyHarvestCameraFrame } from './SoyHarvestCamera';
import { stopCommercialMapOrbitMotion } from '../utils/cameraTransition';

const fields = ['enabled','enableDamping','enablePan','enableRotate','enableZoom','zoomToCursor',
  'minDistance','maxDistance','minPolarAngle','maxPolarAngle','minAzimuthAngle','maxAzimuthAngle'] as const;
type Snapshot = {
  position: Vector3; quaternion: Quaternion; up: Vector3; target: Vector3;
  fov: number; near: number; far: number; zoom: number; view: PerspectiveCamera['view'];
  controls: Record<string, number | boolean>;
};

/** Only CameraRig calls apply. The lazy agricultural scene publishes numeric poses. */
export function useSoyHarvestCameraLease(camera: Camera, controlsRef: RefObject<OrbitControls>, invalidate: () => void) {
  const enabled = useSoyHarvestStore(s => s.enabled);
  const restoring = useSoyHarvestStore(s => s.status === 'restoring');
  const saved = useRef<Snapshot | null>(null);
  const restoredAt = useRef(0);
  const returnFlight = useRef<{ started: number; position: Vector3; target: Vector3; quaternion: Quaternion; fov: number } | null>(null);
  const capture = () => {
    const controls = controlsRef.current;
    if (saved.current || !(camera instanceof PerspectiveCamera) || !controls) return;
    const controlValues: Record<string, number | boolean> = {};
    for (const field of fields) controlValues[field] = controls[field];
    saved.current = { position: camera.position.clone(), quaternion: camera.quaternion.clone(), up: camera.up.clone(),
      target: controls.target.clone(), fov: camera.fov, near: camera.near, far: camera.far,
      zoom: camera.zoom, view: camera.view ? {...camera.view} : null, controls: controlValues };
    Object.assign(soyHarvestCameraFrame.initial.position, camera.position);
    Object.assign(soyHarvestCameraFrame.initial.target, controls.target);
    Object.assign(soyHarvestCameraFrame.initial, { fov: camera.fov, near: camera.near, far: camera.far, captured: true });
    soyHarvestCameraFrame.ready = false;
    stopCommercialMapOrbitMotion(camera, controls);
    controls.enabled = false;
  };
  const restore = () => {
    const snapshot = saved.current, controls = controlsRef.current;
    if (snapshot && camera instanceof PerspectiveCamera && controls) {
      stopCommercialMapOrbitMotion(camera, controls);
      camera.position.copy(snapshot.position); camera.quaternion.copy(snapshot.quaternion); camera.up.copy(snapshot.up);
      Object.assign(camera, { fov: snapshot.fov, near: snapshot.near, far: snapshot.far, zoom: snapshot.zoom, view: snapshot.view });
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      controls.target.copy(snapshot.target); Object.assign(controls, snapshot.controls);
    }
    saved.current = null; returnFlight.current = null; restoredAt.current = performance.now();
    soyHarvestCameraFrame.ready = false; soyHarvestCameraFrame.initial.captured = false;
    useSoyHarvestStore.getState().finishRestore(); invalidate();
  };
  const restoreRef = useRef(restore); restoreRef.current = restore;
  useLayoutEffect(() => {
    const unregister = registerSoyHarvestBeforeStart(capture);
    const unsubscribe = useSoyHarvestStore.subscribe((state, previous) => {
      // Fallback for externally restored state; explicit starts capture before
      // any subscriber can reconcile another React root's controls or dock.
      if (state.enabled && !previous.enabled) capture();
      if (state.enabled !== previous.enabled || state.status !== previous.status) invalidate();
    });
    return () => { unregister(); unsubscribe(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, controlsRef, invalidate]);
  useLayoutEffect(() => {
    if (enabled) { capture(); returnFlight.current = null; invalidate(); }
    else if (saved.current) {
      const controls = controlsRef.current;
      if (useSoyHarvestStore.getState().reducedMotion || useSoyHarvestStore.getState().status === 'error'
        || !controls || !(camera instanceof PerspectiveCamera)) restore();
      else {
        returnFlight.current = { started: performance.now(), position: camera.position.clone(),
          target: controls.target.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov };
        invalidate();
      }
    } else if (restoring) useSoyHarvestStore.getState().finishRestore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, restoring, camera, controlsRef, invalidate]);
  useLayoutEffect(() => () => { if (saved.current) restoreRef.current(); }, []);
  return { enabled: enabled || restoring, restoredAt,
    apply() {
      const controls = controlsRef.current;
      if (!(camera instanceof PerspectiveCamera) || !controls) return false;
      const flight = returnFlight.current, snapshot = saved.current;
      if (flight && snapshot) {
        controls.enabled = false;
        const t = Math.min(1, Math.max(0, (performance.now() - flight.started) / 650));
        const smooth = t * t * (3 - 2 * t);
        camera.position.lerpVectors(flight.position, snapshot.position, smooth);
        controls.target.lerpVectors(flight.target, snapshot.target, smooth);
        camera.quaternion.slerpQuaternions(flight.quaternion, snapshot.quaternion, smooth);
        camera.fov = flight.fov + (snapshot.fov-flight.fov)*smooth;
        camera.updateProjectionMatrix(); camera.updateMatrixWorld();
        if (t === 1) restore(); else invalidate();
        return true;
      }
      if (!useSoyHarvestStore.getState().enabled) return false;
      capture(); controls.enabled = false;
      const pose = soyHarvestCameraFrame;
      if (!pose.ready) return true;
      camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      camera.up.set(0,1,0); camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
      controls.target.set(pose.target.x, pose.target.y, pose.target.z);
      if (camera.fov !== pose.fov || camera.near !== pose.near || camera.far !== pose.far || camera.view?.enabled || camera.zoom !== 1) {
        camera.fov=pose.fov; camera.near=pose.near; camera.far=pose.far; camera.zoom=1;
        camera.clearViewOffset(); camera.updateProjectionMatrix();
      }
      camera.updateMatrixWorld(); return true;
    },
  };
}
