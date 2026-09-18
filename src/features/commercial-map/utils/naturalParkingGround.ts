import { ShapeUtils, Vector2 } from 'three';
import { COMMERCIAL_MAP_GROUND_ELEVATION } from '../constants';
import { REAR_TERRAIN_PATCHES, sourcePolygonToLocal } from '../data/rearParkEnvironment';
import { TERRITORY_PATCHES } from '../data/territorialEnvironment';
import { clipContextPolygon } from '../data/commercialMapSpatialBounds';
import { rearRoadTerrainElevationAt } from './rearRoadNetwork';
import { pointInPolygon } from './spatialSurface';

type Point = readonly [number, number];
type Vertex = readonly [number, number, number];
let receiverTriangles: readonly (readonly Vertex[])[] | undefined;

/** Interpolate the same coarse triangle plane that RearParkEnvironment renders,
 * rather than sampling a smooth formula at a point inside a coarse triangle.
 * The cache contains numbers only, with no GPU resource or second ground mesh.
 */
function naturalGroundTriangles() {
  return receiverTriangles ??= REAR_TERRAIN_PATCHES.flatMap(patch => {
    const ring = clipContextPolygon(sourcePolygonToLocal(patch.sourcePolygon));
    const vertices: Vertex[] = ring.map(([x, z]) => [x, patch.baseElevation + rearRoadTerrainElevationAt(x, z), z]);
    return ShapeUtils.triangulateShape(ring.map(([x, z]) => new Vector2(x, z)), [])
      .map(indices => indices.map(index => vertices[index]));
  });
}

export function naturalParkingGroundElevationAt([x, z]: Point) {
  let elevation = COMMERCIAL_MAP_GROUND_ELEVATION;
  for (const [a, b, c] of naturalGroundTriangles()) {
    const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(denominator) < 1e-10) continue;
    const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / denominator;
    const v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / denominator;
    const w = 1 - u - v;
    if (u >= -1e-7 && v >= -1e-7 && w >= -1e-7) elevation = Math.max(elevation, u * a[1] + v * b[1] + w * c[1]);
  }
  // Territory patches are flat at the same authored height as their renderer.
  // Tree/grass sites have already been excluded from roads by their owners.
  for (const patch of TERRITORY_PATCHES) {
    if (patch.kind !== 'water' && pointInPolygon([x, z], patch.ring)) elevation = Math.max(elevation, 0.015);
  }
  return elevation;
}
