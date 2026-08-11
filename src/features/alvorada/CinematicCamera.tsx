import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AlvoradaQualityProfile } from './capabilities';
import { latitudeLongitudeToVector3, SANTA_ROSA_COORDINATES, tangentAt } from './geo';
import { useAlvoradaTimeline } from './TimelineContext';
import { smoothRange } from './timeline';

interface CinematicCameraProps {
  quality: AlvoradaQualityProfile;
}

function cinematicCurve(points: THREE.Vector3[]) {
  return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.52);
}

/**
 * Position and look-at travel on independent splines. The orbital and local
 * frames meet inside the spatial cloud corridor, with the same projected FOV
 * and almost no screen-space velocity at the hand-off.
 */
export function CinematicCamera({ quality }: CinematicCameraProps) {
  const timeline = useAlvoradaTimeline();
  const { camera } = useThree();
  const paths = useMemo(() => {
    const brazil = latitudeLongitudeToVector3(-13.8, -51.8, 1).normalize();
    const rioGrandeDoSul = latitudeLongitudeToVector3(-30.05, -53.1, 1).normalize();
    const santaRosa = latitudeLongitudeToVector3(
      SANTA_ROSA_COORDINATES.latitude,
      SANTA_ROSA_COORDINATES.longitude,
      1,
    ).normalize();
    const brazilTangent = tangentAt(brazil);
    const stateTangent = tangentAt(rioGrandeDoSul);

    const brazilEnd = rioGrandeDoSul.clone().multiplyScalar(7.78)
      .addScaledVector(stateTangent, 0.46)
      .add(new THREE.Vector3(0, 0.24, 0));
    const stateEnd = santaRosa.clone().multiplyScalar(4.34)
      .addScaledVector(stateTangent, 0.035);

    return {
      orbitalPosition: cinematicCurve([
        brazil.clone().multiplyScalar(11.8).addScaledVector(brazilTangent, 2.25).add(new THREE.Vector3(0, 1.12, 0)),
        brazil.clone().multiplyScalar(9.75).addScaledVector(brazilTangent, 1.18).add(new THREE.Vector3(0, 0.62, 0)),
        brazil.clone().multiplyScalar(8.55).addScaledVector(brazilTangent, 0.52),
        brazilEnd,
      ]),
      orbitalLook: cinematicCurve([
        brazil.clone().multiplyScalar(0.72),
        brazil.clone().multiplyScalar(1.52),
        rioGrandeDoSul.clone().multiplyScalar(2.42),
      ]),
      statePosition: cinematicCurve([
        brazilEnd,
        rioGrandeDoSul.clone().multiplyScalar(6.68).addScaledVector(stateTangent, 0.24),
        santaRosa.clone().multiplyScalar(5.46).addScaledVector(stateTangent, 0.11),
        stateEnd,
      ]),
      stateLook: cinematicCurve([
        rioGrandeDoSul.clone().multiplyScalar(2.42),
        rioGrandeDoSul.clone().multiplyScalar(3.22),
        santaRosa.clone().multiplyScalar(3.98),
      ]),
      stabilizationPosition: cinematicCurve([
        stateEnd,
        santaRosa.clone().multiplyScalar(4.30).addScaledVector(stateTangent, 0.022),
        santaRosa.clone().multiplyScalar(4.26).addScaledVector(stateTangent, 0.01),
      ]),
      stabilizationLook: cinematicCurve([
        santaRosa.clone().multiplyScalar(3.98),
        santaRosa.clone().multiplyScalar(4.005),
        santaRosa.clone().multiplyScalar(4.02),
      ]),
      localDescentPosition: cinematicCurve([
        new THREE.Vector3(9, 42, 58),
        new THREE.Vector3(6, 27, 40),
        new THREE.Vector3(3.8, 14, 27),
        new THREE.Vector3(2.4, 7.3, 18.5),
      ]),
      localDescentLook: cinematicCurve([
        new THREE.Vector3(-4, 0.4, -2),
        new THREE.Vector3(-1, 0.85, -5),
        new THREE.Vector3(0.4, 1.15, -8),
      ]),
      cityPosition: cinematicCurve([
        new THREE.Vector3(2.4, 7.3, 18.5),
        new THREE.Vector3(1.2, 6.4, 14),
        new THREE.Vector3(-0.8, 5.6, 9),
        new THREE.Vector3(-2.4, 4.9, 4),
      ]),
      cityLook: cinematicCurve([
        new THREE.Vector3(0.4, 1.15, -8),
        new THREE.Vector3(0.55, 0.95, -12),
        new THREE.Vector3(0.2, 1.05, -17),
      ]),
      skyPosition: cinematicCurve([
        new THREE.Vector3(-2.4, 4.9, 4),
        new THREE.Vector3(-1.4, 6, 7),
        new THREE.Vector3(-0.35, 6.35, 7.4),
        new THREE.Vector3(0, 7.9, 11),
      ]),
      skyLook: cinematicCurve([
        new THREE.Vector3(0.2, 1.05, -17),
        new THREE.Vector3(0.1, 5.8, -30),
        new THREE.Vector3(0, 10.1, -32),
        new THREE.Vector3(0, 12.2, -33),
      ]),
      finalPosition: cinematicCurve([
        new THREE.Vector3(0, 7.9, 11),
        new THREE.Vector3(0.1, 8.0, 11.15),
        new THREE.Vector3(0.22, 8.05, 11.3),
      ]),
      finalLook: cinematicCurve([
        new THREE.Vector3(0, 12.2, -33),
        new THREE.Vector3(0, 12.35, -33),
        new THREE.Vector3(0, 12.4, -33),
      ]),
    };
  }, []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const elapsed = timeline.current.elapsed;
    let bank = 0;
    let fov = quality.mobile ? 48 : 44;

    if (elapsed < 2) {
      const progress = smoothRange(elapsed, 0, 2);
      paths.orbitalPosition.getPointAt(progress, position);
      paths.orbitalLook.getPointAt(progress, lookAt);
      fov = THREE.MathUtils.lerp(quality.mobile ? 52 : 46, quality.mobile ? 46 : 39, progress);
      bank = Math.sin(progress * Math.PI) * -0.022;
    } else if (elapsed < 4) {
      const progress = smoothRange(elapsed, 2, 4);
      paths.statePosition.getPointAt(progress, position);
      paths.stateLook.getPointAt(progress, lookAt);
      fov = THREE.MathUtils.lerp(quality.mobile ? 46 : 39, quality.mobile ? 50 : 46, progress);
      bank = Math.sin(progress * Math.PI) * 0.014;
    } else if (elapsed < 4.5) {
      const progress = smoothRange(elapsed, 4, 4.5);
      paths.stabilizationPosition.getPointAt(progress, position);
      paths.stabilizationLook.getPointAt(progress, lookAt);
      fov = quality.mobile ? 50 : 46;
      bank = Math.sin(progress * Math.PI) * 0.004;
    } else if (elapsed < 6) {
      const progress = smoothRange(elapsed, 4.5, 6);
      paths.localDescentPosition.getPointAt(progress, position);
      paths.localDescentLook.getPointAt(progress, lookAt);
      if (quality.mobile) {
        position.y += THREE.MathUtils.lerp(1.35, 0.55, progress);
        position.z += THREE.MathUtils.lerp(2.8, 1.8, progress);
      }
      fov = THREE.MathUtils.lerp(quality.mobile ? 50 : 46, quality.mobile ? 47 : 43, progress);
      bank = Math.sin(progress * Math.PI) * -0.006;
    } else if (elapsed < 7.5) {
      const progress = smoothRange(elapsed, 6, 7.5);
      paths.cityPosition.getPointAt(progress, position);
      paths.cityLook.getPointAt(progress, lookAt);
      if (quality.mobile) position.z += THREE.MathUtils.lerp(1.8, 1.05, progress);
      fov = THREE.MathUtils.lerp(quality.mobile ? 47 : 43, quality.mobile ? 44 : 40, progress);
      bank = Math.sin(progress * Math.PI) * -0.003;
    } else if (elapsed < 9) {
      const progress = smoothRange(elapsed, 7.5, 9);
      paths.skyPosition.getPointAt(progress, position);
      paths.skyLook.getPointAt(progress, lookAt);
      if (quality.mobile) position.z += THREE.MathUtils.lerp(1.05, 2.8, progress);
      fov = THREE.MathUtils.lerp(quality.mobile ? 44 : 40, quality.mobile ? 48 : 44, progress);
      bank = Math.sin(progress * Math.PI) * 0.002;
    } else {
      const progress = smoothRange(elapsed, 9, 10.5);
      paths.finalPosition.getPointAt(progress, position);
      paths.finalLook.getPointAt(progress, lookAt);
      if (quality.mobile) position.z += 2.8;
      fov = quality.mobile ? 48 : 44;
    }

    camera.position.copy(position);
    camera.lookAt(lookAt);
    camera.rotateZ(bank);
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    if (Math.abs(perspectiveCamera.fov - fov) > 0.01) {
      perspectiveCamera.fov = fov;
      perspectiveCamera.updateProjectionMatrix();
    }
  }, -1);

  return null;
}
