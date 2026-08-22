import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AlvoradaQualityProfile } from './capabilities';
import { latitudeLongitudeToVector3, SANTA_ROSA_COORDINATES, tangentAt } from './geo';
import { useAlvoradaTimeline } from './TimelineContext';
import { ALVORADA_PHASES, smoothRange } from './timeline';

interface CinematicCameraProps {
  quality: AlvoradaQualityProfile;
}

function cinematicCurve(points: THREE.Vector3[]) {
  return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.52);
}

const SANTA_ROSA_ATMOSPHERIC_CUT = 5.15;

/**
 * The authored camera preserves the Brazil -> Rio Grande do Sul -> Santa Rosa
 * travel and then cuts, behind the cloud corridor, directly to the dawn brand
 * frame. There is intentionally no local city-flight path.
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
      dawnPosition: cinematicCurve([
        brazil.clone().multiplyScalar(11.8).addScaledVector(brazilTangent, 2.25).add(new THREE.Vector3(0, 1.12, 0)),
        brazil.clone().multiplyScalar(9.75).addScaledVector(brazilTangent, 1.18).add(new THREE.Vector3(0, 0.62, 0)),
        brazil.clone().multiplyScalar(8.55).addScaledVector(brazilTangent, 0.52),
        brazilEnd,
      ]),
      dawnLook: cinematicCurve([
        brazil.clone().multiplyScalar(0.72),
        brazil.clone().multiplyScalar(1.52),
        rioGrandeDoSul.clone().multiplyScalar(2.42),
      ]),
      territoryPosition: cinematicCurve([
        brazilEnd,
        rioGrandeDoSul.clone().multiplyScalar(6.68).addScaledVector(stateTangent, 0.24),
        santaRosa.clone().multiplyScalar(5.46).addScaledVector(stateTangent, 0.11),
        stateEnd,
      ]),
      territoryLook: cinematicCurve([
        rioGrandeDoSul.clone().multiplyScalar(2.42),
        rioGrandeDoSul.clone().multiplyScalar(3.22),
        santaRosa.clone().multiplyScalar(3.98),
      ]),
      santaRosaPosition: cinematicCurve([
        stateEnd,
        santaRosa.clone().multiplyScalar(4.30).addScaledVector(stateTangent, 0.022),
        santaRosa.clone().multiplyScalar(4.26).addScaledVector(stateTangent, 0.01),
      ]),
      santaRosaLook: cinematicCurve([
        santaRosa.clone().multiplyScalar(3.98),
        santaRosa.clone().multiplyScalar(4.005),
        santaRosa.clone().multiplyScalar(4.02),
      ]),
      brandApproachPosition: cinematicCurve([
        new THREE.Vector3(7.5, 34, 52),
        new THREE.Vector3(5.2, 25, 40),
        new THREE.Vector3(2.4, 14.5, 25),
        new THREE.Vector3(0, 7.9, 11),
      ]),
      brandApproachLook: cinematicCurve([
        new THREE.Vector3(-4, 0.4, -2),
        new THREE.Vector3(-1.2, 6.6, -17),
        new THREE.Vector3(0, 17.2, -33),
      ]),
      brandHoldPosition: cinematicCurve([
        new THREE.Vector3(0, 7.9, 11),
        new THREE.Vector3(0.06, 7.96, 11.12),
        new THREE.Vector3(0.12, 8, 11.22),
      ]),
      brandHoldLook: cinematicCurve([
        new THREE.Vector3(0, 17.2, -33),
        new THREE.Vector3(0, 17.35, -33),
        new THREE.Vector3(0, 17.45, -33),
      ]),
      orgTransitionPosition: cinematicCurve([
        new THREE.Vector3(0.12, 8, 11.22),
        new THREE.Vector3(0.18, 8.12, 12),
        new THREE.Vector3(0.24, 8.28, 13.4),
      ]),
      orgTransitionLook: cinematicCurve([
        new THREE.Vector3(0, 17.45, -33),
        new THREE.Vector3(0, 17.55, -33),
        new THREE.Vector3(0, 17.65, -33),
      ]),
    };
  }, []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const lookAt = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const elapsed = timeline.current.elapsed;
    let bank = 0;
    let fov = quality.mobile ? 48 : 44;

    if (elapsed < ALVORADA_PHASES.dawn.end) {
      const progress = smoothRange(
        elapsed,
        ALVORADA_PHASES.dawn.start,
        ALVORADA_PHASES.dawn.end,
      );
      paths.dawnPosition.getPointAt(progress, position);
      paths.dawnLook.getPointAt(progress, lookAt);
      fov = THREE.MathUtils.lerp(quality.mobile ? 52 : 46, quality.mobile ? 46 : 39, progress);
      bank = Math.sin(progress * Math.PI) * -0.022;
    } else if (elapsed < ALVORADA_PHASES.territory.end) {
      const progress = smoothRange(
        elapsed,
        ALVORADA_PHASES.territory.start,
        ALVORADA_PHASES.territory.end,
      );
      paths.territoryPosition.getPointAt(progress, position);
      paths.territoryLook.getPointAt(progress, lookAt);
      fov = THREE.MathUtils.lerp(quality.mobile ? 46 : 39, quality.mobile ? 50 : 46, progress);
      bank = Math.sin(progress * Math.PI) * 0.014;
    } else if (elapsed < SANTA_ROSA_ATMOSPHERIC_CUT) {
      const progress = smoothRange(
        elapsed,
        ALVORADA_PHASES['santa-rosa'].start,
        SANTA_ROSA_ATMOSPHERIC_CUT,
      );
      paths.santaRosaPosition.getPointAt(progress, position);
      paths.santaRosaLook.getPointAt(progress, lookAt);
      fov = quality.mobile ? 50 : 46;
      bank = Math.sin(progress * Math.PI) * 0.004;
    } else if (elapsed < ALVORADA_PHASES['brand-reveal'].end) {
      const progress = smoothRange(
        elapsed,
        SANTA_ROSA_ATMOSPHERIC_CUT,
        ALVORADA_PHASES['brand-reveal'].end,
      );
      paths.brandApproachPosition.getPointAt(progress, position);
      paths.brandApproachLook.getPointAt(progress, lookAt);
      if (quality.mobile) {
        position.y += THREE.MathUtils.lerp(1.2, 0, progress);
        position.z += THREE.MathUtils.lerp(2.6, 2.8, progress);
      }
      fov = THREE.MathUtils.lerp(quality.mobile ? 50 : 46, quality.mobile ? 48 : 44, progress);
      bank = Math.sin(progress * Math.PI) * -0.004;
    } else if (elapsed < ALVORADA_PHASES['org-transition'].start) {
      const progress = smoothRange(
        elapsed,
        ALVORADA_PHASES['brand-hold'].start,
        ALVORADA_PHASES['brand-hold'].end,
      );
      paths.brandHoldPosition.getPointAt(progress, position);
      paths.brandHoldLook.getPointAt(progress, lookAt);
      if (quality.mobile) position.z += 2.8;
      fov = quality.mobile ? 48 : 44;
    } else {
      const progress = smoothRange(
        elapsed,
        ALVORADA_PHASES['org-transition'].start,
        ALVORADA_PHASES['org-transition'].end,
      );
      paths.orgTransitionPosition.getPointAt(progress, position);
      paths.orgTransitionLook.getPointAt(progress, lookAt);
      if (quality.mobile) position.z += 2.8;
      fov = THREE.MathUtils.lerp(quality.mobile ? 48 : 44, quality.mobile ? 51 : 47, progress);
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
