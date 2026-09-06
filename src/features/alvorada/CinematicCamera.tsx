import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AlvoradaQualityProfile } from './capabilities';
import { useAlvoradaTimeline } from './TimelineContext';
import { ALVORADA_PHASES, smoothRange } from './timeline';
import { sampleOrbitalCamera, SANTA_ROSA_ATMOSPHERIC_HANDOFF } from './orbitalCamera';

interface CinematicCameraProps {
  quality: AlvoradaQualityProfile;
}

function cinematicCurve(points: THREE.Vector3[]) {
  return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.52);
}

const SANTA_ROSA_ATMOSPHERIC_CUT = SANTA_ROSA_ATMOSPHERIC_HANDOFF;

/**
 * The authored camera preserves the Brazil -> Rio Grande do Sul -> Santa Rosa
 * travel and changes coordinate frames inside the opaque atmospheric corridor.
 * It then approaches the dawn brand
 * frame without stretching the global map into fictitious local detail.
 */
export function CinematicCamera({ quality }: CinematicCameraProps) {
  const timeline = useAlvoradaTimeline();
  const { camera } = useThree();
  const paths = useMemo(() => {
    return {
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

    if (elapsed < SANTA_ROSA_ATMOSPHERIC_CUT) {
      fov = sampleOrbitalCamera(elapsed, quality.mobile, position, lookAt);
      bank = Math.sin(smoothRange(elapsed, 0, SANTA_ROSA_ATMOSPHERIC_CUT) * Math.PI) * -0.008;
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
