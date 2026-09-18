import polygonClipping, { type MultiPolygon, type Ring } from 'polygon-clipping';
import { OFFICIAL_REFERENCE_ENTITIES } from './officialReference2026';
import { PARK_ACCESS_SPATIAL_PLAN, type ParkAccessPoint, type ParkAccessPolygon } from './parkAccessSpatialPlan';

/** IMG_0967: relative hardscape/tree registration against B1/B2/B3. The image
 * is not an orthophoto: all dimensions remain visual estimates. Building and
 * emergency-service footprints are read-only constraints, including B23. */
const footprint = (id: string) => {
  const entity = OFFICIAL_REFERENCE_ENTITIES.find(candidate => candidate.publicIdentifier === id);
  if (!entity) throw new Error(`Missing courtyard anchor ${id}`);
  return entity.geometry.coordinates[0];
};
const bounds = (ring: ParkAccessPolygon) => ({
  minX: Math.min(...ring.map(p => p[0])), maxX: Math.max(...ring.map(p => p[0])),
  minZ: Math.min(...ring.map(p => p[1])), maxZ: Math.max(...ring.map(p => p[1])),
});
const rectangle = (minX: number, minZ: number, maxX: number, maxZ: number): Ring =>
  [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ], [minX, minZ]];
const polygon = (ring: ParkAccessPolygon): MultiPolygon => [[ring.map(p => [p[0], p[1]])]];
const p1 = bounds(footprint('B1'));
const p14 = bounds(footprint('B2'));
const p12 = bounds(footprint('B3'));
const clinic = bounds(footprint('B23'));
const trail = PARK_ACCESS_SPATIAL_PLAN.woodlandPath;
const pathEnd = trail.centerline[trail.centerline.length - 1];
const gap = p14.minZ - p1.maxZ;
const walkwayZ = (p1.maxZ + p14.minZ) / 2;
const walkwayHalfWidth = gap * 0.37;
const capIndex = trail.centerline.length - 1;
const capA = trail.surfacePolygon[capIndex];
const capB = trail.surfacePolygon[capIndex + 1];
const capNorth = capA[1] < capB[1] ? capA : capB;
const capSouth = capA[1] < capB[1] ? capB : capA;
const connector: Ring = [
  [...capNorth],
  [p14.minX + gap * 0.5, walkwayZ - walkwayHalfWidth],
  [p12.minX, walkwayZ - walkwayHalfWidth],
  [p12.minX, walkwayZ + walkwayHalfWidth],
  [p14.minX + gap * 0.5, walkwayZ + walkwayHalfWidth],
  [...capSouth], [...capNorth],
];
const courtyardCenter: ParkAccessPoint = [
  (p14.maxX + p12.minX) / 2,
  (p14.minZ + clinic.minZ) / 2,
];
const rootRadius = (p12.minX - p14.maxX) * 0.11;
const rootOpening: Ring = Array.from({ length: 17 }, (_, index) => {
  const angle = index / 16 * Math.PI * 2;
  return [courtyardCenter[0] + Math.cos(angle) * rootRadius,
    courtyardCenter[1] + Math.sin(angle) * rootRadius];
});
const protectedPolygons = ['B1', 'B2', 'B3', 'B23'].map(id => polygon(footprint(id)));
const roadPolygons = OFFICIAL_REFERENCE_ENTITIES
  .filter(entity => entity.classification === 'ROAD')
  .map(entity => polygon(entity.geometry.coordinates[0]));
// A single union joins the woodland cap, the B1/B2 gap and the B2/B3 court.
// Existing trail takes precedence at the seam, so no brown path remains below
// a new concrete plane; B23 remains an explicit notch, never paved over.
const requested = polygonClipping.union(
  [connector],
  [rectangle(p14.maxX, walkwayZ, p12.minX, Math.max(p14.maxZ, p12.maxZ))],
);
const hardscape = polygonClipping.difference(requested,
  ...protectedPolygons, ...roadPolygons, polygon(trail.surfacePolygon), [[rootOpening]]);

export const PAVILION_COURTYARD = Object.freeze({
  revision: '2026.9-pavilions-1-14-12-courtyard.1',
  evidence: ['IMG_0967.jpeg', 'IMG_0971.jpeg', 'IMG_0972.jpeg', 'IMG_0973.jpeg'] as const,
  anchorIdentifiers: ['B1', 'B2', 'B3', 'B23'] as const,
  protectedPolygons,
  officialMeasurements: false,
  pathEnd,
  walkwayZ,
  treePosition: courtyardCenter,
  rootOpening,
  rootRadius,
  hardscape,
  elevation: 0.044,
  // Same existing ambient-tree batch, one broad mature crown. This is a visual
  // tree placement, not an invented official inventory identifier/species.
  treeScale: [1.85, 1.12, 1.85] as const,
});

/** Cut complete polygons, including holes and disconnected pieces. Adding a
 * crossing ring to Shape.holes would be invalid and could leave grass strips. */
export function clipPavilionCourtyardSurface<Surface extends {
  id: string; polygon: ParkAccessPolygon; holes: readonly ParkAccessPolygon[];
}>(surface: Surface): Surface[] {
  const original: MultiPolygon = [[surface.polygon, ...surface.holes]
    .map(ring => ring.map(p => [p[0], p[1]]))];
  if (!polygonClipping.intersection(original, hardscape).length) return [surface];
  return polygonClipping.difference(original, hardscape).map((rings, index) => ({
    ...surface, id: index ? `${surface.id}:courtyard-cut-${index}` : surface.id,
    polygon: rings[0], holes: rings.slice(1),
  }));
}
