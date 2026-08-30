import * as THREE from 'three';
import { GENERATED_REAR_ROAD_SEGMENTS } from '../data/rearParkRoadNetwork';
import { buildRearRoadCorridorFootprints, rearRoadTerrainElevationAt } from './rearRoadNetwork';
import { clipPlanarSurfaceGeometry, type PlanarSurfaceCut } from './planarSurfaceGeometry';

interface RoadGroundCut extends PlanarSurfaceCut { shoulderElevation: number }

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
      minX: Math.min(...polygon.map(([x]) => x)),
      maxX: Math.max(...polygon.map(([x]) => x)),
      minZ: Math.min(...polygon.map(([, z]) => z)),
      maxZ: Math.max(...polygon.map(([, z]) => z)),
      shoulderElevation: GENERATED_REAR_ROAD_SEGMENTS[roadIndex].elevationOffset - 0.006,
    };
  });
});

/** Cut existing terrain/walkways and grade only the narrow shoulder seam. */
export function integrateGroundGeometryWithRearRoads(geometry: THREE.BufferGeometry) {
  return clipPlanarSurfaceGeometry(geometry, ROAD_GROUND_CUTS, (cut, x, z) => (
    (cut as RoadGroundCut).shoulderElevation + rearRoadTerrainElevationAt(x, z) - 0.0005
  ));
}
