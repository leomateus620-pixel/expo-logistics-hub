import { MAP_REFERENCE_HEIGHT, MAP_REFERENCE_WIDTH } from '../constants';

export type SpatialPoint = readonly [number, number];
export interface SpatialBounds { minX: number; maxX: number; minZ: number; maxZ: number }
export type SpatialClassification = 'CORE' | 'NEAR_CONTEXT' | 'PROTECTED_INFRASTRUCTURE' | 'REMOVABLE_FAR_CONTEXT';

export function expandSpatialBounds(bounds: SpatialBounds, margin: number): SpatialBounds {
  return { minX: bounds.minX - margin, maxX: bounds.maxX + margin, minZ: bounds.minZ - margin, maxZ: bounds.maxZ + margin };
}

// Official crop plus the surveyed-in-project parking/access support envelopes.
// These are model coordinates (0.15 units/metre), not a cadastral survey.
// The 2-unit seam contains A5 (x=61.57), rear parking (z=-46.04) and the
// complete authored lateral district (z=45.32). No core generator is clipped.
const coreBounds = Object.freeze(expandSpatialBounds({
  minX: -MAP_REFERENCE_WIDTH / 2, maxX: MAP_REFERENCE_WIDTH / 2,
  minZ: -MAP_REFERENCE_HEIGHT / 2, maxZ: MAP_REFERENCE_HEIGHT / 2,
}, 2));
const safeContextMargin = 15; // 100 estimated metres, measured in world space.

export const COMMERCIAL_MAP_SPATIAL_BOUNDS = Object.freeze({
  coreBounds,
  safeContextMargin,
  nearContextBounds: Object.freeze(expandSpatialBounds(coreBounds, safeContextMargin)),
  // Source extraction envelope, only used to document the retained through axes.
  farContextBounds: Object.freeze({ minX: -175, maxX: 230, minZ: -225, maxZ: 240 }),
  protectedRoads: Object.freeze([
    // Full BR-472 / ERS-344 axes, Tuparendi and the source's major collectors.
    'osm-38993601-0', 'osm-40144091-0', 'osm-50074637-0', 'osm-203230187-0',
    'osm-334317743-0', 'osm-334317744-0', 'osm-334317745-0', 'osm-334317748-0',
    'osm-334416401-0', 'osm-334416402-0', 'osm-334416403-0', 'osm-334416404-0',
    'osm-334416405-0', 'osm-334416407-0', 'osm-393430941-0', 'osm-431693361-0',
    'osm-445415962-0', 'osm-447054086-0', 'osm-447054088-0', 'osm-585996136-0',
    'osm-585996210-0', 'osm-585996212-0', 'osm-833033189-0', 'osm-833033190-0',
    'osm-833033191-0', 'osm-891240280-0', 'osm-891242797-0', 'osm-891242798-0',
    'osm-949273418-0', 'osm-1236980174-0', 'osm-1414654006-0', 'osm-1414654007-0',
    'osm-1414654008-0',
    // Junction ramps are not all tagged highway in the OSM source.
    'osm-50074635-0', 'osm-50074636-0', 'osm-334317746-0', 'osm-334317747-0',
    // Direct northern entry and the corrected A5 branch/park mouth.
    'osm-321026944-0', 'osm-569781512-0', 'osm-951983188-0', 'arena-br472-access',
  ] as readonly string[]),
  protectedLandmarks: Object.freeze([
    'F', 'D3', 'D1', 'C1', 'C2', 'C4', 'B12', 'B13',
    'lateral-residential-district', 'rear-parking', 'park-access', 'nations-district',
  ] as readonly string[]),
  protectedEntrances: Object.freeze(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'] as readonly string[]),
});
const protectedRoads = new Set(COMMERCIAL_MAP_SPATIAL_BOUNDS.protectedRoads);

export function spatialBoundsContain(bounds: SpatialBounds, [x, z]: SpatialPoint, radius = 0) {
  return Number.isFinite(x) && Number.isFinite(z)
    && x + radius >= bounds.minX && x - radius <= bounds.maxX
    && z + radius >= bounds.minZ && z - radius <= bounds.maxZ;
}

export function classifyCommercialMapPoint(point: SpatialPoint, radius = 0, protectedInfrastructure = false): SpatialClassification {
  if (spatialBoundsContain(coreBounds, point, radius)) return 'CORE';
  if (spatialBoundsContain(COMMERCIAL_MAP_SPATIAL_BOUNDS.nearContextBounds, point, radius)) return 'NEAR_CONTEXT';
  return protectedInfrastructure ? 'PROTECTED_INFRASTRUCTURE' : 'REMOVABLE_FAR_CONTEXT';
}

export const retainCommercialMapContext = (point: SpatialPoint, radius = 0) =>
  classifyCommercialMapPoint(point, radius) !== 'REMOVABLE_FAR_CONTEXT';

export function isProtectedCommercialMapRoad(road: { id: string; evidence?: string }) {
  return protectedRoads.has(road.id) || road.evidence === 'project-continuation';
}

/** Liang-Barsky also retains crossings with both vertices outside the box. */
export function clipSpatialSegment(a: SpatialPoint, b: SpatialPoint, bounds: SpatialBounds): [SpatialPoint, SpatialPoint] | null {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  let start = 0, end = 1;
  const planes = [[-dx, a[0] - bounds.minX], [dx, bounds.maxX - a[0]], [-dz, a[1] - bounds.minZ], [dz, bounds.maxZ - a[1]]];
  for (const [p, q] of planes) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) start = Math.max(start, t); else end = Math.min(end, t);
    if (start > end) return null;
  }
  return [start === 0 ? a : [a[0] + start * dx, a[1] + start * dz], end === 1 ? b : [a[0] + end * dx, a[1] + end * dz]];
}

/** Separate fragments avoid inventing a chord when a street leaves/re-enters. */
export function clipContextRoad<T extends { id: string; points: readonly SpatialPoint[]; evidence?: string }>(road: T): T[] {
  if (isProtectedCommercialMapRoad(road)) return [road];
  const bounds = COMMERCIAL_MAP_SPATIAL_BOUNDS.nearContextBounds;
  if (road.points.every(p => spatialBoundsContain(bounds, p))) return [road];
  const fragments: SpatialPoint[][] = [];
  let active: SpatialPoint[] | null = null;
  for (let i = 1; i < road.points.length; i++) {
    const segment = clipSpatialSegment(road.points[i - 1], road.points[i], bounds);
    if (!segment || Math.hypot(segment[1][0] - segment[0][0], segment[1][1] - segment[0][1]) < 1e-7) { active = null; continue; }
    const last = active?.at(-1);
    if (!last || Math.hypot(last[0] - segment[0][0], last[1] - segment[0][1]) > 1e-7) {
      active = [segment[0]];
      fragments.push(active);
    }
    active!.push(segment[1]);
    if (!spatialBoundsContain(bounds, road.points[i])) active = null;
  }
  return fragments.map((points, i) => ({ ...road, id: i === 0 ? road.id : `${road.id}:near-${i}`, points }));
}

export function clipContextPolygon(ring: readonly SpatialPoint[]): SpatialPoint[] {
  const bounds = COMMERCIAL_MAP_SPATIAL_BOUNDS.nearContextBounds;
  let output = [...ring];
  for (const [axis, edge, sign] of [[0, bounds.minX, 1], [0, bounds.maxX, -1], [1, bounds.minZ, 1], [1, bounds.maxZ, -1]]) {
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[(i + input.length - 1) % input.length], b = input[i];
      const ai = (a[axis] - edge) * sign >= 0, bi = (b[axis] - edge) * sign >= 0;
      if (ai !== bi) {
        const t = (edge - a[axis]) / (b[axis] - a[axis]);
        output.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
      if (bi) output.push(b);
    }
  }
  return output;
}

/** Core, parking and adjacent authored structures; never the road endpoints. */
export function commercialMapNavigationExtent(park: SpatialBounds & { maxHeight: number }) {
  const near = COMMERCIAL_MAP_SPATIAL_BOUNDS.nearContextBounds;
  const minX = Math.min(park.minX, near.minX), maxX = Math.max(park.maxX, near.maxX);
  const minZ = Math.min(park.minZ, near.minZ), maxZ = Math.max(park.maxZ, near.maxZ);
  const width = maxX - minX, depth = maxZ - minZ;
  return { minX, maxX, minZ, maxZ, width, depth, centerX: (minX + maxX) / 2, centerZ: (minZ + maxZ) / 2,
    maxHeight: park.maxHeight, diagonal: Math.hypot(width, depth) };
}
