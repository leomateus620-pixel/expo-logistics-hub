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

    const brazilEnd = rioGrandeDoSul.clone().multiplyScalar(7.85)
      .addScaledVector(stateTangent, 0.48)
      .add(new THREE.Vector3(0, 0.28, 0));
    const brazilPosition = new THREE.CatmullRomCurve3([
      brazil.clone().multiplyScalar(11.6).addScaledVector(brazilTangent, 2.15).add(new THREE.Vector3(0, 1.05, 0)),
      brazil.clone().multiplyScalar(9.7).addScaledVector(brazilTangent, 1.18).add(new THREE.Vector3(0, 0.65, 0)),
      brazil.clone().multiplyScalar(8.55).addScaledVector(brazilTangent, 0.52),
      brazilEnd,
    ], false, 'catmullrom', 0.52);
    const statePosition = new THREE.CatmullRomCurve3([
      brazilEnd,
      rioGrandeDoSul.clone().multiplyScalar(6.72).addScaledVector(stateTangent, 0.24),
      santaRosa.clone().multiplyScalar(5.45).addScaledVector(stateTangent, 0.12),
      santaRosa.clone().multiplyScalar(4.31),
    ], false, 'catmullrom', 0.52);

    const brazilLook = new THREE.CatmullRomCurve3([
      brazil.clone().multiplyScalar(0.75),
      brazil.clone().multiplyScalar(1.55),
      rioGrandeDoSul.clone().multiplyScalar(2.45),
    ]);
    const stateLook = new THREE.CatmullRomCurve3([
      rioGrandeDoSul.clone().multiplyScalar(2.45),
      rioGrandeDoSul.clone().multiplyScalar(3.25),
      santaRosa.clone().multiplyScalar(3.96),
    ]);

    const cityArrivalPosition = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.2, 32, 34),
      new THREE.Vector3(0.62, 27.5, 23),
      new THREE.Vector3(-0.18, 22.4, 13),
      new THREE.Vector3(0.06, 18.2, 7.5),
    ], false, 'catmullrom', 0.52);
    const cityArrivalLook = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.4, -5),
      new THREE.Vector3(0, 2.7, -12),
      new THREE.Vector3(0, 5.4, -22),
    ]);
    const skyPosition = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.06, 18.2, 7.5),
      new THREE.Vector3(0.12, 18.7, 5.6),
      new THREE.Vector3(0, 19.2, 3.4),
      new THREE.Vector3(0, 18.4, 5.2),
    ], false, 'catmullrom', 0.52);
    const skyLook = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 5.4, -22),
      new THREE.Vector3(0, 8.8, -25),
      new THREE.Vector3(0, 17.2, -31),
    ]);

    return {
      brazilLook,
      brazilPosition,
      cityArrivalLook,
      cityArrivalPosition,
      skyLook,
      skyPosition,
      stateLook,
      statePosition,
    };
  }, []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const elapsed = timeline.current.elapsed;
    let bank = 0;
    let fov = quality.mobile ? 51 : 43;

    if (elapsed < 2) {
      const progress = smoothRange(elapsed, 0, 2);
      paths.brazilPosition.getPointAt(progress, position);
      paths.brazilLook.getPointAt(progress, lookAt);
      fov = THREE.MathUtils.lerp(quality.mobile ? 53 : 45, quality.mobile ? 47 : 38, progress);
      bank = Math.sin(progress * Math.PI) * -0.026;
    } else if (elapsed < 4.54) {
      const progress = smoothRange(elapsed, 2, 4.54);
      paths.statePosition.getPointAt(progress, position);
      paths.stateLook.getPointAt(progress, lookAt);
      fov = THREE.MathUtils.lerp(quality.mobile ? 47 : 38, quality.mobile ? 58 : 51, progress);
      bank = Math.sin(progress * Math.PI) * 0.018;
    } else if (elapsed < 5.64) {
      const progress = smoothRange(elapsed, 4.54, 5.64);
      paths.cityArrivalPosition.getPointAt(progress, position);
      paths.cityArrivalLook.getPointAt(progress, lookAt);
      if (quality.mobile) position.z += THREE.MathUtils.lerp(4.6, 5.2, progress);
      fov = THREE.MathUtils.lerp(quality.mobile ? 58 : 53, quality.mobile ? 55 : 47, progress);
      bank = Math.sin(progress * Math.PI) * -0.008;
    } else {
      const progress = smoothRange(elapsed, 5.64, 8.25);
      paths.skyPosition.getPointAt(progress, position);
      paths.skyLook.getPointAt(progress, lookAt);
      if (quality.mobile) position.z += THREE.MathUtils.lerp(5.2, 5.5, progress);
      fov = THREE.MathUtils.lerp(quality.mobile ? 55 : 47, quality.mobile ? 54 : 42, progress);
      bank = Math.sin(progress * Math.PI) * 0.004;
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
