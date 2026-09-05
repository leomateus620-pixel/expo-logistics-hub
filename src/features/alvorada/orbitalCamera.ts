import * as THREE from 'three';
import { SANTA_ROSA_COORDINATES } from './geo';
import { smoothRange } from './timeline';

export const SANTA_ROSA_ATMOSPHERIC_HANDOFF = 5.15;
/** A single eased spherical trajectory cannot cut corners through the globe. */
export function sampleOrbitalCamera(
  elapsed: number,
  mobile: boolean,
  position: THREE.Vector3,
  target: THREE.Vector3,
) {
  const progress = smoothRange(elapsed, 0, SANTA_ROSA_ATMOSPHERIC_HANDOFF);
  const latitude = THREE.MathUtils.lerp(14, SANTA_ROSA_COORDINATES.latitude, progress);
  const longitude = THREE.MathUtils.lerp(-82, SANTA_ROSA_COORDINATES.longitude, progress);
  const phi = THREE.MathUtils.degToRad(90 - latitude);
  const theta = THREE.MathUtils.degToRad(longitude + 180);
  // Write into the caller's vectors; the frame loop allocates no temporary geometry.
  target.set(-Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
  const distance = THREE.MathUtils.lerp(mobile ? 23.6 : 14.8, mobile ? 6.8 : 5.55, progress);
  position.copy(target).multiplyScalar(distance);
  target.multiplyScalar(THREE.MathUtils.lerp(0, 3.7, progress));
  return THREE.MathUtils.lerp(mobile ? 52 : 46, mobile ? 50 : 46, progress);
}
