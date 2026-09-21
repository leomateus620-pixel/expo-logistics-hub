import sourceLots from '../data/electricalSourceLots.json';
import type { CommercialElectricalNode } from '../data/electricalInfrastructure';
import { complexWorldPolygon, FENASOJA_COMPLEX_REVISION } from '../data/fenasojaComplexReconstruction';
import type { Coordinate, MapEntity } from '../types';
import { PARK_ACCESS_SPATIAL_PLAN } from '../data/parkAccessSpatialPlan';
import { buildRearRoadCorridorFootprints, type RearRoadCorridorFootprint } from './rearRoadNetwork';
import { closestPointOnSegment, distanceToPolygon, pointInPolygon } from './spatialSurface';

// Source cells are extracted from the black CAD contours of the pole PDF.
// They describe ownership, never replacement lot geometry or surveyed offsets.
export const ELECTRICAL_SOURCE_LOTS: Readonly<Record<string, string>> = sourceLots;
const ROAD_MARGIN = 0.025;
const STRUCTURE_MARGIN = 0.045; // clearance outside the shaft radius, in map units
const EPSILON = 0.0001;
type Point = readonly [number, number];

interface Constraint {
  id: string;
  polygon: readonly Point[];
  margin: number;
  road: boolean;
  bounds: readonly [number, number, number, number];
}

const bounds = (p: readonly Point[]): Constraint['bounds'] => [
  Math.min(...p.map(v => v[0])), Math.min(...p.map(v => v[1])),
  Math.max(...p.map(v => v[0])), Math.max(...p.map(v => v[1])),
];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const near = (p: Coordinate, c: Constraint, r: number) => p[0] >= c.bounds[0] - r
  && p[0] <= c.bounds[2] + r && p[1] >= c.bounds[1] - r && p[1] <= c.bounds[3] + r;

const SOLID_CLASSES = new Set(['PAVILION', 'BUILDING', 'RESTAURANT', 'FOOD_AREA', 'RESTROOM',
  'CHEMICAL_RESTROOM', 'GATE', 'ADMINISTRATION', 'SECURITY', 'EMERGENCY', 'SERVICE',
  'ATTRACTION', 'EVENT_VENUE', 'LIVESTOCK_AREA', 'RESTRICTED_AREA', 'LANDMARK']);
// Entity collections are immutable scene snapshots. Weak keys release a closed
// scene; unlike a global ID cache, changed snapshots cannot inherit stale masks.
const constraintsByScene = new WeakMap<readonly MapEntity[], Map<boolean, readonly Constraint[]>>();

export function buildElectricalPoleConstraints(
  entities: readonly MapEntity[], rearRoadsActive: boolean,
  rearFootprints?: readonly RearRoadCorridorFootprint[],
) {
  const cached = constraintsByScene.get(entities)?.get(rearRoadsActive);
  if (cached) return cached;
  const fullAccess = entities.some(e => e.publicIdentifier === 'A6');
  const constraints: Constraint[] = [];
  const add = (id: string, polygon: readonly Point[], road: boolean) => {
    if (polygon.length >= 3) constraints.push({ id, polygon, bounds: bounds(polygon), road, margin: road ? ROAD_MARGIN : STRUCTURE_MARGIN });
  };
  entities.forEach(e => {
    if (e.classification === 'ROAD') add(e.publicIdentifier, e.geometry.coordinates[0], true);
    else if (SOLID_CLASSES.has(e.classification) && e.geometry.extrusionHeight >= 0.3) add(e.publicIdentifier, e.geometry.coordinates[0], false);
  });
  if (fullAccess) {
    PARK_ACCESS_SPATIAL_PLAN.roadSurfaces.forEach(s => add(s.id, s.polygon, true));
    PARK_ACCESS_SPATIAL_PLAN.roundabouts.forEach(s => add(s.id, Array.from({ length: 28 }, (_, i) => [
      s.center[0] + Math.cos(i * Math.PI / 14) * s.outerRadius,
      s.center[1] + Math.sin(i * Math.PI / 14) * s.outerRadius,
    ]), true));
  }
  if (rearRoadsActive) (rearFootprints ?? buildRearRoadCorridorFootprints(undefined, { includeShoulders: true }))
    .forEach(s => add(s.roadId, s.polygon, true));
  for (const [id, building] of [['B12', 'headquarters'], ['B13', 'stage']] as const) {
    if (entities.some(e => e.publicIdentifier === id && e.metadata?.reconstructionRevision === FENASOJA_COMPLEX_REVISION)) {
      const polygon = complexWorldPolygon(building, 'roofProjection');
      constraints.push({ id: `${id}:roof`, polygon, bounds: bounds(polygon), margin: 0.24, road: false });
    }
  }
  const modes = constraintsByScene.get(entities) ?? new Map<boolean, readonly Constraint[]>();
  modes.set(rearRoadsActive, constraints);
  constraintsByScene.set(entities, modes);
  return constraints;
}

export function resolveElectricalPoleClearance(
  node: CommercialElectricalNode,
  preferred: Coordinate,
  entitiesByIdentifier: ReadonlyMap<string, MapEntity>,
  constraints: readonly Constraint[],
) {
  const sourceLotIdentifier = ELECTRICAL_SOURCE_LOTS[node.sourceMarkerId] ?? null;
  const host = sourceLotIdentifier ? entitiesByIdentifier.get(sourceLotIdentifier)
    : [...entitiesByIdentifier.values()].find(e => e.classification === 'SELLABLE_LOT' && pointInPolygon(node.position, e.geometry.coordinates[0]));
  const hostPolygon = host?.geometry.coordinates[0];
  const origin = node.position;
  const local = constraints.filter(c => near(origin, c, 3.5));
  const blockedBy = (p: Coordinate) => local.filter(c => near(p, c, c.margin + node.radius)
    && distanceToPolygon(p, c.polygon) < c.margin + node.radius - EPSILON / 2);
  const insideHost = (p: Coordinate) => !hostPolygon || (pointInPolygon(p, hostPolygon)
    && hostPolygon.every((a, i) => distance(p, closestPointOnSegment(p, a, hostPolygon[(i + 1) % hostPolygon.length])) >= node.radius + ROAD_MARGIN - EPSILON / 2));
  // Overlapping representations of the same junction are one occupied surface.
  // If the registered anchor is already on asphalt, use the source parcel (when
  // identified), otherwise the closest free verge of the complete road union.
  const originOnRoad = local.some(c => c.road && pointInPolygon(origin, c.polygon));
  const roadSides = originOnRoad ? [] : local.filter(c => c.road);
  const sameRoadSide = (p: Coordinate) => !roadSides.some(c => {
    // A correction must not cross a road that was outside the PDF anchor.
    // Proper segment intersection also catches narrow/diagonal road ribbons.
    const dx = p[0] - origin[0], dz = p[1] - origin[1];
    return c.polygon.some((a, i) => {
      const b = c.polygon[(i + 1) % c.polygon.length];
      const ex = b[0] - a[0], ez = b[1] - a[1], determinant = dx * ez - dz * ex;
      if (Math.abs(determinant) < 1e-10) return false;
      const ax = a[0] - origin[0], az = a[1] - origin[1];
      const t = (ax * ez - az * ex) / determinant;
      const u = (ax * dz - az * dx) / determinant;
      return t > EPSILON && t < 1 - EPSILON && u >= 0 && u <= 1;
    });
  });
  const valid = (p: Coordinate) => insideHost(p) && !local.some(c => near(p, c, c.margin + node.radius)
    && distanceToPolygon(p, c.polygon) < c.margin + node.radius - EPSILON / 2) && sameRoadSide(p);
  const sourceConflicts = blockedBy(preferred).map(c => c.id);
  if (valid(preferred)) return { position: preferred, sourceLotIdentifier, conflicts: sourceConflicts, resolved: true };
  if (valid(origin)) return { position: origin, sourceLotIdentifier, conflicts: sourceConflicts, resolved: true };

  const candidates: Coordinate[] = [];
  const offsetEdges: Array<readonly [Coordinate, Coordinate]> = [];
  // Test both edge normals against the complete union, including adjacent roads
  // and buildings. A facade-only projection can otherwise land in its neighbour.
  const addBoundary = (polygon: readonly Point[], margin: number) => polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const length = distance(a, b);
    if (length < EPSILON) return;
    const q = closestPointOnSegment(origin, a, b);
    if (distance(q, origin) > 3 + margin) return;
    const nx = -(b[1] - a[1]) / length, nz = (b[0] - a[0]) / length;
    for (const side of [-1, 1]) {
      candidates.push([q[0] + side * nx * margin, q[1] + side * nz * margin]);
      offsetEdges.push([
        [a[0] + side * nx * margin - (b[0] - a[0]) / length * margin, a[1] + side * nz * margin - (b[1] - a[1]) / length * margin],
        [b[0] + side * nx * margin + (b[0] - a[0]) / length * margin, b[1] + side * nz * margin + (b[1] - a[1]) / length * margin],
      ]);
    }
    // Round corner candidates cover oblique/concave parcels without a bbox snap.
    for (let k = 0; distance(a, origin) < 3 + margin && k < 16; k++) {
      const angle = k * Math.PI / 8;
      candidates.push([a[0] + Math.cos(angle) * margin, a[1] + Math.sin(angle) * margin]);
    }
  });
  if (hostPolygon) addBoundary(hostPolygon, node.radius + ROAD_MARGIN + EPSILON);
  local.forEach(c => addBoundary(c.polygon, node.radius + c.margin + EPSILON));
  // The closest point at a compound corner is an intersection of offset edges.
  // Solve it directly instead of scanning thousands of radial samples per pole.
  offsetEdges.forEach(([a, b], i) => offsetEdges.slice(i + 1).forEach(([c, d]) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], ex = d[0] - c[0], ez = d[1] - c[1];
    const det = dx * ez - dz * ex;
    if (Math.abs(det) < 1e-10) return;
    const ax = c[0] - a[0], az = c[1] - a[1];
    const t = (ax * ez - az * ex) / det, u = (ax * dz - az * dx) / det;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) candidates.push([a[0] + dx * t, a[1] + dz * t]);
  }));
  candidates.sort((a, b) => distance(a, origin) - distance(b, origin) || a[0] - b[0] || a[1] - b[1]);
  let selected = candidates.find(p => distance(p, origin) <= 3 && valid(p));
  // Intersections of expanded polygons can leave only a narrow verge. Search
  // locally, bounded and deterministic; never jump across the park silently.
  const limit = selected ? 0 : 3;
  for (let r = 0.025; r < limit; r += 0.025) {
    let found: Coordinate | undefined;
    for (let k = 0; k < 96; k++) {
      const angle = k * Math.PI / 48;
      const p: Coordinate = [origin[0] + Math.cos(angle) * r, origin[1] + Math.sin(angle) * r];
      if (valid(p)) { found = p; break; }
    }
    if (found) { selected = found; break; }
  }
  return { position: selected ?? origin, sourceLotIdentifier, conflicts: sourceConflicts, resolved: !!selected };
}
