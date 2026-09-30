import type { BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clipPlanarSurfaceGeometry, type PlanarSurfaceCut } from './planarSurfaceGeometry';
import { UBIRETAMA_PRESENTATION_HANDOFF } from './ubiretamaRoadPresentation';

const boundaryZ = UBIRETAMA_PRESENTATION_HANDOFF[1];
const north: PlanarSurfaceCut = {
  minX: -10000, maxX: 10000, minZ: -10000, maxZ: boundaryZ,
  polygon: [[-10000, -10000], [10000, -10000], [10000, boundaryZ], [-10000, boundaryZ]],
};
const south: PlanarSurfaceCut = {
  minX: -10000, maxX: 10000, minZ: boundaryZ, maxZ: 10000,
  polygon: [[-10000, boundaryZ], [10000, boundaryZ], [10000, 10000], [-10000, 10000]],
};

/** Keep original southern terrain AND grading, including the seam blend across the boundary. */
export function integrateUbiretamaGroundPresentation(
  geometry: BufferGeometry,
  legacy: (geometry: BufferGeometry) => BufferGeometry,
  presented: (geometry: BufferGeometry) => BufferGeometry,
) {
  if (!geometry.getAttribute('position')?.count) return geometry;
  geometry.computeBoundingBox();
  if (geometry.boundingBox!.min.z >= boundaryZ) return legacy(geometry);
  if (geometry.boundingBox!.max.z <= boundaryZ) return presented(geometry);
  const originalSouth = legacy(geometry.clone());
  presented(geometry);
  // Split after each full adapter has applied its own grading. Clipping only
  // the cut polygons would introduce a new cap and alter the southern seam.
  clipPlanarSurfaceGeometry(originalSouth, [north]);
  clipPlanarSurfaceGeometry(geometry, [south]);
  const merged = mergeGeometries([geometry, originalSouth]);
  if (merged) {
    geometry.copy(merged);
    merged.dispose();
  }
  originalSouth.dispose();
  return geometry;
}
