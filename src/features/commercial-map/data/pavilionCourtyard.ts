import polygonClipping, { type MultiPolygon, type Ring } from 'polygon-clipping';
import { OFFICIAL_REFERENCE_ENTITIES } from './officialReference2026';
import { PARK_ACCESS_SPATIAL_PLAN, type ParkAccessPoint, type ParkAccessPolygon } from './parkAccessSpatialPlan';

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
const sidewalks = PARK_ACCESS_SPATIAL_PLAN.sidewalkSurfaces.filter(s => s.id.startsWith('benvenuto-')).map(s =>
  [[s.polygon, ...(s.holes ?? [])].map(r => r.map(p => [p[0], p[1]]))] as MultiPolygon);
const p1 = bounds(footprint('B1'));
const p14 = bounds(footprint('B2'));
const p12 = bounds(footprint('B3'));
const p3 = bounds(footprint('B6'));
const clinic = bounds(footprint('B23'));
const mercosul = bounds(footprint('ALAMEDA-MERCOSUL'));
const argentina = bounds(footprint('RUA-ARGENTINA'));
const trail = PARK_ACCESS_SPATIAL_PLAN.woodlandPath;
const gap = p14.minZ - p1.maxZ;
// Annex 3 establishes sidewalk / street / B14, not surveyed widths.
// Relative proportions are confined to the existing official gap.
const sidewalkEdgeZ = p1.maxZ + gap * 0.26;
const cornerX = p1.maxX + gap * 0.55;
// Annex 5 explicitly asks for a continuous paved frontage. B33/B34 are
// removed temporary booths (see NON_PERMANENT_REMOVED_IDENTIFIERS_2026),
// not visible buildings. Only their historical green presentation masks are
// excepted here; their source records and every pavilion footprint stay intact.
const retiredFrontageMasks = ['B33', 'B34'] as const;
const protectedPolygons = OFFICIAL_REFERENCE_ENTITIES
  .filter(entity => !['ROAD', 'PEDESTRIAN_PATH', 'LANDSCAPE', 'PARKING'].includes(entity.classification))
  .filter(entity => !retiredFrontageMasks.includes(entity.publicIdentifier as 'B33'))
  .filter(entity => {
    const b = bounds(entity.geometry.coordinates[0]);
    return b.maxX >= p1.minX && b.minX <= p3.maxX
      && b.maxZ >= p1.maxZ - gap && b.minZ <= p12.maxZ;
  })
  .map(entity => polygon(entity.geometry.coordinates[0]));
const roadPolygons = OFFICIAL_REFERENCE_ENTITIES
  .filter(entity => ['ROAD', 'PEDESTRIAN_PATH'].includes(entity.classification))
  .map(entity => polygon(entity.geometry.coordinates[0]));
const road = polygonClipping.difference(polygonClipping.union(
  [rectangle(p1.minX, sidewalkEdgeZ, p12.minX, p14.minZ)],
  [rectangle(mercosul.minX, mercosul.maxZ, mercosul.maxX, p12.minZ)],
), ...protectedPolygons, ...roadPolygons);
const courtyardCenter: ParkAccessPoint = [
  (p14.maxX + p12.minX) / 2, (p14.minZ + clinic.minZ) / 2,
];
const treePositionB1: ParkAccessPoint = [p1.maxX + gap * 0.28, p1.maxZ - gap * 0.6];
const root = (center: ParkAccessPoint, radius: number): Ring =>
  Array.from({ length: 17 }, (_, i) => [
    center[0] + Math.cos(i / 16 * Math.PI * 2) * radius,
    center[1] + Math.sin(i / 16 * Math.PI * 2) * radius,
  ]);
const rootRadius = (p12.minX - p14.maxX) * 0.11;
const rootOpening = root(courtyardCenter, rootRadius);
const b1RootRadius = gap * 0.17;
const b1RootOpening = root(treePositionB1, b1RootRadius);
const requested = polygonClipping.union(
  [rectangle(p1.minX, p1.maxZ, cornerX, sidewalkEdgeZ)],
  [rectangle(p1.maxX, treePositionB1[1] - b1RootRadius * 1.6, cornerX, sidewalkEdgeZ)],
  [rectangle(p14.maxX, p14.minZ, p12.minX, Math.max(p14.maxZ, p12.maxZ))],
  // Annex 5: inner frontage up to actual facades; B4/B6 have narrow thresholds.
  [rectangle(p12.minX, argentina.maxZ, p3.maxX, p12.minZ)],
);
const hardscape = polygonClipping.difference(requested,
  ...protectedPolygons, ...roadPolygons, road, polygon(trail.surfacePolygon),
  ...sidewalks,
  [[rootOpening]], [[b1RootOpening]]);
const occupied = polygonClipping.union(road, hardscape,
  ...sidewalks, polygon(PARK_ACCESS_SPATIAL_PLAN.roadSurfaces.find(s => s.id === 'benvenuto-four-lane-axis')!.polygon));
const trees = [
  { sourceZoneId: 'pavilions-14-12-courtyard-tree', position: courtyardCenter, radius: rootRadius,
    rootOpening, rotation: 0.35, scale: [1.85, 1.12, 1.85] as const },
  { sourceZoneId: 'pavilion-1-sidewalk-tree', position: treePositionB1, radius: b1RootRadius,
    rootOpening: b1RootOpening, rotation: 0.62, scale: [1.2, 1.05, 1.2] as const },
];

export const PAVILION_COURTYARD = Object.freeze({
  revision: '2026.9-benvenuto-pavilion-surfaces.2',
  evidence: ['fdc85e65-5dc2-43b4-a0a8-970c6908e1c3.jpg', '7db5c4bb-32aa-4f1d-93c4-a3a9ae5fdce5.jpg',
    'c4037d48-20fa-4a38-8292-042506f51f75.jpg'] as const,
  anchorIdentifiers: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B23', 'B34', 'B41', 'ALAMEDA-MERCOSUL'] as const,
  protectedPolygons, officialMeasurements: false,
  retiredFrontageMasks,
  // Presentation-only access. The cadastral RUA-ARGENTINA remains untouched.
  roadIdentifier: 'pavilions-1-14-access', road, occupied,
  pathEnd: trail.centerline[trail.centerline.length - 1],
  walkwayZ: (p1.maxZ + sidewalkEdgeZ) / 2,
  streetCenterline: [[p1.minX, (sidewalkEdgeZ + p14.minZ) / 2],
    [p14.maxX, (sidewalkEdgeZ + p14.minZ) / 2],
    [(mercosul.minX + mercosul.maxX) / 2, mercosul.maxZ]] as readonly ParkAccessPoint[],
  treePosition: courtyardCenter, rootOpening, rootRadius, trees,
  hardscape, elevation: 0.068, roadElevation: 0.044, treeScale: trees[0].scale,
  curbCenterlines: [
    // On the sidewalk side; building thresholds and junction mouths stay open.
    [[p1.minX, sidewalkEdgeZ - 0.0375], [cornerX, sidewalkEdgeZ - 0.0375]],
  ] as readonly (readonly ParkAccessPoint[])[],
});

/** Boolean cuts retain holes and disconnected pieces instead of overlays. */
export function clipPavilionCourtyardSurface<Surface extends {
  id: string; polygon: ParkAccessPolygon; holes: readonly ParkAccessPolygon[];
}>(surface: Surface): Surface[] {
  const original: MultiPolygon = [[surface.polygon, ...surface.holes]
    .map(ring => ring.map(p => [p[0], p[1]]))];
  if (!polygonClipping.intersection(original, occupied).length) return [surface];
  return polygonClipping.difference(original, occupied).map((rings, index) => ({
    ...surface, id: index ? `${surface.id}:courtyard-cut-${index}` : surface.id,
    polygon: rings[0], holes: rings.slice(1),
  }));
}
