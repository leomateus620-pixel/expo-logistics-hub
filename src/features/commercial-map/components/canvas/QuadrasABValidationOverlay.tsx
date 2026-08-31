import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { COMMERCIAL_MAP_TREES } from '../../data/commercialTrees';
import { QUADRAS_AB_SPATIAL_REFERENCE } from '../../data/quadrasABEnvironment';
import { officialPdfPointToLocal } from '../../data/officialReference2026';
import {
  LACTALIS_STAGE_LAYOUT,
  lactalisStageAudienceApronPolygon,
} from '../../utils/lactalisStage';
import { buildQuadrasABEnvironmentPlan } from '../../utils/quadrasABEnvironment';

const NO_RAYCAST = () => undefined;
const OVERLAY_Y = 0.16;

function closed(polygon: readonly (readonly [number, number])[]) {
  return polygon.length > 0 ? [...polygon, polygon[0]] : polygon;
}

function lineSegmentsGeometry(polylines: readonly (readonly (readonly [number, number])[])[]) {
  const positions: number[] = [];
  polylines.forEach((polyline) => {
    for (let index = 0; index < polyline.length - 1; index += 1) {
      const [fromX, fromZ] = polyline[index];
      const [toX, toZ] = polyline[index + 1];
      positions.push(fromX, OVERLAY_Y, fromZ, toX, OVERLAY_Y, toZ);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function pointsGeometry(points: readonly (readonly [number, number])[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(
    points.flatMap(([x, z]) => [x, OVERLAY_Y + 0.015, z]),
    3,
  ));
  geometry.computeBoundingSphere();
  return geometry;
}

/** Development-only overlay enabled by ?quadrasABDebug. */
export const QuadrasABValidationOverlay = memo(function QuadrasABValidationOverlay() {
  const geometries = useMemo(() => {
    const plan = buildQuadrasABEnvironmentPlan();
    const quadras = lineSegmentsGeometry([
      closed(QUADRAS_AB_SPATIAL_REFERENCE.quadraA.polygon),
      closed(QUADRAS_AB_SPATIAL_REFERENCE.quadraB.polygon),
    ]);
    const stageFootprint = lineSegmentsGeometry([
      closed(LACTALIS_STAGE_LAYOUT.sourceFootprintPolygon.map(officialPdfPointToLocal)),
      closed(lactalisStageAudienceApronPolygon()),
    ]);
    const targetVector = lineSegmentsGeometry([[
      LACTALIS_STAGE_LAYOUT.worldCenter,
      LACTALIS_STAGE_LAYOUT.targetWorldCenter,
    ]]);
    const frontTip = [
      LACTALIS_STAGE_LAYOUT.worldCenter[0] + LACTALIS_STAGE_LAYOUT.frontVector[0] * 2.15,
      LACTALIS_STAGE_LAYOUT.worldCenter[1] + LACTALIS_STAGE_LAYOUT.frontVector[1] * 2.15,
    ] as const;
    const frontVector = lineSegmentsGeometry([[
      LACTALIS_STAGE_LAYOUT.worldCenter,
      frontTip,
    ]]);
    const exclusions = lineSegmentsGeometry(plan.hardSurfaceMasks.map((mask) => closed(mask.polygon)));
    const trees = pointsGeometry(COMMERCIAL_MAP_TREES
      .filter((tree) => tree.area === 'QUADRA_A' || tree.area === 'QUADRA_B')
      .map((tree) => tree.position));
    const anchors = pointsGeometry(QUADRAS_AB_SPATIAL_REFERENCE.satelliteAnchors.map((anchor) => (
      officialPdfPointToLocal(anchor.sourcePosition)
    )));
    const target = pointsGeometry([
      LACTALIS_STAGE_LAYOUT.worldCenter,
      LACTALIS_STAGE_LAYOUT.targetWorldCenter,
    ]);
    return { quadras, stageFootprint, targetVector, frontVector, exclusions, trees, anchors, target };
  }, []);

  useEffect(() => () => {
    Object.values(geometries).forEach((geometry) => geometry.dispose());
  }, [geometries]);

  return (
    <group name="quadras-ab-validation-overlay" renderOrder={130} dispose={null}>
      <lineSegments geometry={geometries.exclusions} raycast={NO_RAYCAST} frustumCulled={false}>
        <lineBasicMaterial color="#ff4f64" transparent opacity={0.56} depthTest={false} />
      </lineSegments>
      <lineSegments geometry={geometries.quadras} raycast={NO_RAYCAST} frustumCulled={false}>
        <lineBasicMaterial color="#36e6a5" depthTest={false} />
      </lineSegments>
      <lineSegments geometry={geometries.stageFootprint} raycast={NO_RAYCAST} frustumCulled={false}>
        <lineBasicMaterial color="#ffd34d" depthTest={false} />
      </lineSegments>
      <lineSegments geometry={geometries.targetVector} raycast={NO_RAYCAST} frustumCulled={false}>
        <lineBasicMaterial color="#a879ff" transparent opacity={0.68} depthTest={false} />
      </lineSegments>
      <lineSegments geometry={geometries.frontVector} raycast={NO_RAYCAST} frustumCulled={false}>
        <lineBasicMaterial color="#35d9ff" depthTest={false} />
      </lineSegments>
      <points geometry={geometries.trees} raycast={NO_RAYCAST} frustumCulled={false}>
        <pointsMaterial color="#70ff67" size={0.2} sizeAttenuation depthTest={false} />
      </points>
      <points geometry={geometries.anchors} raycast={NO_RAYCAST} frustumCulled={false}>
        <pointsMaterial color="#ff5ed1" size={0.3} sizeAttenuation depthTest={false} />
      </points>
      <points geometry={geometries.target} raycast={NO_RAYCAST} frustumCulled={false}>
        <pointsMaterial color="#ffffff" size={0.38} sizeAttenuation depthTest={false} />
      </points>
    </group>
  );
});
