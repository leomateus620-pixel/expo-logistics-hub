import * as THREE from 'three';
import polygonClipping from 'polygon-clipping';
import { GENERATED_REAR_ROAD_SEGMENTS } from '../data/rearParkRoadNetwork';
import { buildRearRoadCorridorFootprints, rearRoadTerrainElevationAt } from './rearRoadNetwork';
import { clipPlanarSurfaceGeometry, type PlanarSurfaceCut } from './planarSurfaceGeometry';
import { integrateGroundWithTerritory } from './territorialRoadGeometry';
import { UBIRETAMA_PRESENTATION_MASK, isUbiretamaPresentationSegment, type UbiretamaRoadPresentation } from './ubiretamaRoadPresentation';
import { integrateUbiretamaGroundPresentation } from './ubiretamaGroundBoundary';

interface RoadGroundCut extends PlanarSurfaceCut { shoulderElevation: number; segmentId: string }

/** Exact offset ribbons shared with the renderer; evaluated once, never per frame. */
const ROAD_GROUND_CUTS: readonly RoadGroundCut[] = buildRearRoadCorridorFootprints(
  GENERATED_REAR_ROAD_SEGMENTS, { samplesPerWorldUnit: 5 },
).flatMap((footprint, roadIndex) => {
  const count = footprint.centerline.length;
  return footprint.centerline.slice(1).map((_, index) => {
    const polygon = [
      footprint.polygon[index], footprint.polygon[index + 1],
      footprint.polygon[count * 2 - index - 2], footprint.polygon[count * 2 - index - 1],
    ];
    return {
      polygon,
      segmentId: footprint.segmentId,
      minX: Math.min(...polygon.map(([x]) => x)),
      maxX: Math.max(...polygon.map(([x]) => x)),
      minZ: Math.min(...polygon.map(([, z]) => z)),
      maxZ: Math.max(...polygon.map(([, z]) => z)),
      shoulderElevation: GENERATED_REAR_ROAD_SEGMENTS[roadIndex].elevationOffset - 0.006,
    };
  });
});

const PRESENTED_REAR_CUTS = new WeakMap<UbiretamaRoadPresentation, readonly RoadGroundCut[]>();
function presentedRearCuts(presentation?: UbiretamaRoadPresentation | null) {
  if (!presentation) return ROAD_GROUND_CUTS;
  const cached = PRESENTED_REAR_CUTS.get(presentation);
  if (cached) return cached;
  const cuts = ROAD_GROUND_CUTS.flatMap(cut => {
    if (!isUbiretamaPresentationSegment(cut.segmentId)) return [cut];
    return polygonClipping.difference([[cut.polygon.map(p => [p[0], p[1]])]], UBIRETAMA_PRESENTATION_MASK)
      .map(rings => {
        const polygon = rings[0];
        return { ...cut, polygon, minX: Math.min(...polygon.map(p => p[0])), maxX: Math.max(...polygon.map(p => p[0])),
          minZ: Math.min(...polygon.map(p => p[1])), maxZ: Math.max(...polygon.map(p => p[1])) };
      });
  });
  PRESENTED_REAR_CUTS.set(presentation, cuts);
  return cuts;
}

/** Cut existing terrain/walkways and grade only the narrow shoulder seam. */
export function integrateGroundGeometryWithRearRoads(geometry: THREE.BufferGeometry, presentation?: UbiretamaRoadPresentation | null) {
  const apply = (target: THREE.BufferGeometry, plan?: UbiretamaRoadPresentation | null) => integrateGroundWithTerritory(
    clipPlanarSurfaceGeometry(target, presentedRearCuts(plan), (cut, x, z) => (
      (cut as RoadGroundCut).shoulderElevation + rearRoadTerrainElevationAt(x, z) - 0.0005
    )), plan,
  );
  return presentation ? integrateUbiretamaGroundPresentation(geometry, target => apply(target), target => apply(target, presentation)) : apply(geometry);
}
