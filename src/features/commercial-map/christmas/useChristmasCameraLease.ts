import { useLayoutEffect, useRef, type RefObject } from 'react';
import { MathUtils, PerspectiveCamera, Quaternion, Vector3, type Camera, type WebGLRenderer } from 'three';
import type { OrbitControls } from 'three-stdlib';
import { stopCommercialMapOrbitMotion } from '../utils/cameraTransition';
import { applyContextualCameraViewOffset, readContextualCameraViewOffset } from '../utils/contextualViewport';
import {
  COMMERCIAL_MAP_ANIMATION,
  isCommercialMapPresentationVisible,
  requestCommercialMapAnimationFrame,
} from '../utils/frameActivity';
import { registerChristmasCamera, useChristmasSession } from './christmasSession';

export const christmasCameraFrame = {
  id: 0,
  ready: false,
  blend: 0,
  fov: 40,
  position: new Vector3(),
  target: new Vector3(),
};

type Pose = { position: Vector3; quaternion: Quaternion; target: Vector3; fov: number };
type Snapshot = Pose & {
  id: number;
  controls: OrbitControls;
  enabled: boolean;
  enableDamping: boolean;
  up: Vector3;
  near: number;
  far: number;
  zoom: number;
  view: PerspectiveCamera['view'];
};
type Return = Pose & { started: number };

function readPose(camera: PerspectiveCamera, controls: OrbitControls): Pose {
  return {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    target: controls.target.clone(),
    fov: camera.fov,
  };
}

/** The lazy scene publishes poses. CameraRig alone applies them and releases
 * the same controls it captured, including on context loss or interrupted return. */
export function useChristmasCameraLease(
  eligible: boolean,
  camera: Camera,
  controlsRef: RefObject<OrbitControls>,
  renderer: WebGLRenderer,
  invalidate: () => void,
  canAcquire: () => boolean,
) {
  const saved = useRef<Snapshot | null>(null);
  const returning = useRef<Return | null>(null);
  const lastRestore = useRef(Number.NEGATIVE_INFINITY);
  const desiredCamera = useRef(new PerspectiveCamera());
  const canAcquireRef = useRef(canAcquire);
  canAcquireRef.current = canAcquire;

  function restore(id: number) {
    const snapshot = saved.current;
    if (snapshot?.id !== id || !(camera instanceof PerspectiveCamera)) return;
    saved.current = null;
    returning.current = null;
    christmasCameraFrame.ready = false;
    stopCommercialMapOrbitMotion(camera, snapshot.controls);
    camera.position.copy(snapshot.position);
    camera.quaternion.copy(snapshot.quaternion);
    camera.up.copy(snapshot.up);
    Object.assign(camera, { fov: snapshot.fov, near: snapshot.near, far: snapshot.far, zoom: snapshot.zoom });
    const width = renderer.domElement.clientWidth;
    const height = renderer.domElement.clientHeight;
    camera.view = snapshot.view;
    if (camera.view?.enabled && width > 0 && height > 0
      && (width !== camera.view.fullWidth || height !== camera.view.fullHeight)) {
      applyContextualCameraViewOffset(camera, width, height, readContextualCameraViewOffset(camera));
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    snapshot.controls.target.copy(snapshot.target);
    snapshot.controls.enabled = snapshot.enabled;
    snapshot.controls.enableDamping = snapshot.enableDamping;
    lastRestore.current = performance.now();
    invalidate();
  }

  useLayoutEffect(() => {
    if (!eligible || !(camera instanceof PerspectiveCamera)) return;
    const unregister = registerChristmasCamera({
      acquire(id) {
        const controls = controlsRef.current;
        if (!controls?.enabled || !canAcquireRef.current() || renderer.getContext().isContextLost()
          || !isCommercialMapPresentationVisible(renderer)) return false;
        saved.current = {
          ...readPose(camera, controls),
          id,
          controls,
          enabled: controls.enabled,
          enableDamping: controls.enableDamping,
          up: camera.up.clone(),
          near: camera.near,
          far: camera.far,
          zoom: camera.zoom,
          view: camera.view ? { ...camera.view } : null,
        };
        christmasCameraFrame.id = id;
        christmasCameraFrame.ready = false;
        stopCommercialMapOrbitMotion(camera, controls);
        controls.enabled = false;
        controls.enableDamping = false;
        invalidate();
        return true;
      },
      release(id, animate) {
        if (saved.current?.id !== id) return false;
        if (!animate || !christmasCameraFrame.ready || document.hidden
          || renderer.getContext().isContextLost() || !isCommercialMapPresentationVisible(renderer)) {
          restore(id);
          return false;
        }
        returning.current = { ...readPose(camera, saved.current.controls), started: performance.now() };
        invalidate();
        return true;
      },
    });
    const lost = () => {
      const state = useChristmasSession.getState();
      state.greet(state.id);
      restore(state.id);
      state.finishReturn(state.id);
    };
    renderer.domElement.addEventListener('webglcontextlost', lost);
    return () => {
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      unregister();
    };
  }, [eligible, camera, controlsRef, renderer, invalidate]); // restore reads stable values and refs.

  return {
    lastRestore,
    apply() {
      const snapshot = saved.current;
      if (!snapshot || !(camera instanceof PerspectiveCamera)) return false;
      const controls = snapshot.controls;
      controls.enabled = false;
      const returningPose = returning.current;
      if (returningPose) {
        const t = MathUtils.smoothstep(performance.now() - returningPose.started, 0, 480);
        if (t === 1) {
          restore(snapshot.id);
          useChristmasSession.getState().finishReturn(snapshot.id);
          return true;
        }
        camera.position.lerpVectors(returningPose.position, snapshot.position, t);
        camera.quaternion.slerpQuaternions(returningPose.quaternion, snapshot.quaternion, t);
        controls.target.lerpVectors(returningPose.target, snapshot.target, t);
        camera.fov = MathUtils.lerp(returningPose.fov, snapshot.fov, t);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        if (!document.hidden) requestCommercialMapAnimationFrame(renderer, invalidate, COMMERCIAL_MAP_ANIMATION.christmas);
        return true;
      }

      const frame = christmasCameraFrame;
      if (!frame.ready || frame.id !== snapshot.id) return true;
      const desired = desiredCamera.current;
      desired.position.copy(frame.position);
      desired.lookAt(frame.target);
      camera.up.set(0, 1, 0);
      camera.position.lerpVectors(snapshot.position, frame.position, frame.blend);
      camera.quaternion.slerpQuaternions(snapshot.quaternion, desired.quaternion, frame.blend);
      controls.target.lerpVectors(snapshot.target, frame.target, frame.blend);
      camera.fov = MathUtils.lerp(snapshot.fov, frame.fov, frame.blend);
      camera.zoom = MathUtils.lerp(snapshot.zoom, 1, frame.blend);
      camera.near = MathUtils.lerp(snapshot.near, Math.min(snapshot.near, 0.25), frame.blend);
      if (camera.view?.enabled) {
        camera.view.offsetX = (snapshot.view?.offsetX ?? 0) * (1 - frame.blend);
        camera.view.offsetY = (snapshot.view?.offsetY ?? 0) * (1 - frame.blend);
        if (frame.blend === 1) camera.clearViewOffset();
      }
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      return true;
    },
  };
}
