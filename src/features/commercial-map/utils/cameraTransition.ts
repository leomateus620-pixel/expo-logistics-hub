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
