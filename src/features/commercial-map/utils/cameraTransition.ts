import { Matrix4, Quaternion, Spherical, Vector3, type Camera } from 'three';
import type { OrbitControls } from 'three-stdlib';

export interface CommercialMapControlAngles {
  minPolarAngle: number;
  maxPolarAngle: number;
  minAzimuthAngle: number;
  maxAzimuthAngle: number;
}

const ORIGIN = new Vector3();
const ANGLE_EPSILON = 1e-7;

/**
 * Slerping two level views can introduce temporary roll. Keep the interpolated
 * look direction, but use the same up vector as OrbitControls so its first
 * update after cancellation never removes a visible roll in one frame.
 */
export function stabilizeCameraTransitionUp(
  quaternion: Quaternion,
  up: Vector3,
  direction: Vector3,
  matrix: Matrix4,
) {
  direction.set(0, 0, 1).applyQuaternion(quaternion);
  matrix.lookAt(direction, ORIGIN, up);
  quaternion.setFromRotationMatrix(matrix);
}

export function expandCommercialMapControlAngles(
  desired: CommercialMapControlAngles,
  phi: number,
  theta: number,
): CommercialMapControlAngles {
  return {
    minPolarAngle: Math.max(0, Math.min(desired.minPolarAngle, phi - ANGLE_EPSILON)),
    maxPolarAngle: Math.min(Math.PI, Math.max(desired.maxPolarAngle, phi + ANGLE_EPSILON)),
    // Stay in the canonical interval: OrbitControls wraps a finite bound that
    // exceeds +/-PI and would otherwise turn an expanded range into a clamp.
    minAzimuthAngle: Number.isFinite(desired.minAzimuthAngle)
      ? Math.max(-Math.PI, Math.min(desired.minAzimuthAngle, theta - ANGLE_EPSILON))
      : desired.minAzimuthAngle,
    maxAzimuthAngle: Number.isFinite(desired.maxAzimuthAngle)
      ? Math.min(Math.PI, Math.max(desired.maxAzimuthAngle, theta + ANGLE_EPSILON))
      : desired.maxAzimuthAngle,
  };
}

/** Yield the current visible pose to controls before they process the gesture. */
export function prepareOrbitControlsForTransitionHandoff(
  camera: Camera,
  controls: OrbitControls,
  desiredAngles: CommercialMapControlAngles,
  minDistance: number,
  maxDistance: number,
  scratch: { direction: Vector3; spherical: Spherical },
) {
  const distance = camera.position.distanceTo(controls.target);
  scratch.direction.set(0, 0, -1).applyQuaternion(camera.quaternion);
  controls.target.copy(camera.position).addScaledVector(scratch.direction, distance);
  scratch.spherical.setFromVector3(scratch.direction.subVectors(camera.position, controls.target));
  const angles = expandCommercialMapControlAngles(
    desiredAngles,
    scratch.spherical.phi,
    scratch.spherical.theta,
  );
  const limits = {
    minDistance: Math.min(minDistance, distance),
    maxDistance: Math.max(maxDistance, distance),
  };
  // React applies props after the native event. A wheel can update controls in
  // this same event, so the safe envelope must also be applied imperatively.
  Object.assign(controls, angles, limits);
  return { angles, limits };
}

/** Clear residual pan/orbit damping without applying it to the visible pose. */
export function stopCommercialMapOrbitMotion(camera: Camera, controls: OrbitControls) {
  const position = camera.position.clone();
  const quaternion = camera.quaternion.clone();
  const target = controls.target.clone();
  const enableDamping = controls.enableDamping;
  const autoRotate = controls.autoRotate;
  try {
    controls.enableDamping = false;
    controls.autoRotate = false;
    controls.update();
  } finally {
    camera.position.copy(position);
    camera.quaternion.copy(quaternion);
    controls.target.copy(target);
    controls.enableDamping = enableDamping;
    controls.autoRotate = autoRotate;
  }
}

export type CommercialMapNavigationCancellation = 'pointercancel' | 'blur' | 'hidden' | 'context-lost';

/**
 * A lost pointerup must not leave OrbitControls' private touch list or the map's
 * gesture gate active. Send the normal pointercancel path before releasing the
 * application lock; do not recreate controls or reset their camera/target.
 */
export function registerCommercialMapNavigationCancellation({
  canvas,
  controlsElement,
  onCancel,
}: {
  canvas: HTMLCanvasElement;
  controlsElement: HTMLElement;
  onCancel: (reason: CommercialMapNavigationCancellation) => void;
}) {
  const owner = canvas.ownerDocument;
  const view = owner.defaultView;
  const activePointers = new Map<number, string>();
  let cancelling = false;
  let disposed = false;

  const cancel = (reason: CommercialMapNavigationCancellation) => {
    if (cancelling || disposed) return;
    cancelling = true;
    const pointers = [...activePointers];
    activePointers.clear();
    try {
      for (const [pointerId, pointerType] of pointers) {
        canvas.dispatchEvent(new PointerEvent('pointercancel', { pointerId, pointerType, bubbles: true }));
      }
      onCancel(reason);
    } finally {
      cancelling = false;
    }
  };
  const trackPointer = (event: PointerEvent) => activePointers.set(event.pointerId, event.pointerType);
  const finishPointer = (event: PointerEvent) => activePointers.delete(event.pointerId);
  const cancelPointer = (event: PointerEvent) => {
    activePointers.delete(event.pointerId);
    cancel('pointercancel');
  };
  const cancelBlur = () => cancel('blur');
  const cancelHidden = () => { if (owner.hidden) cancel('hidden'); };
  const cancelContext = () => cancel('context-lost');

  controlsElement.addEventListener('pointerdown', trackPointer, true);
  controlsElement.addEventListener('pointercancel', cancelPointer);
  owner.addEventListener('pointerup', finishPointer, true);
  owner.addEventListener('visibilitychange', cancelHidden);
  view?.addEventListener('blur', cancelBlur);
  canvas.addEventListener('webglcontextlost', cancelContext);
  return () => {
    if (disposed) return;
    disposed = true;
    activePointers.clear();
    controlsElement.removeEventListener('pointerdown', trackPointer, true);
    controlsElement.removeEventListener('pointercancel', cancelPointer);
    owner.removeEventListener('pointerup', finishPointer, true);
    owner.removeEventListener('visibilitychange', cancelHidden);
    view?.removeEventListener('blur', cancelBlur);
    canvas.removeEventListener('webglcontextlost', cancelContext);
  };
}
