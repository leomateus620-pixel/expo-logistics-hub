import context from './territoryContext.generated.json';
import { MAP_REFERENCE_HEIGHT, MAP_REFERENCE_WIDTH } from '../constants';

export type AccessJunctionPoint = readonly [number, number];
const point = (value: readonly number[]): AccessJunctionPoint => [value[0], value[1]];
const ringWays = new Set(['833033189', '949273418']);
const transferredWays = new Set([...ringWays, '833033190', '833033191', '891242797', '891242798']);
const roads = context.roads.filter(road => transferredWays.has(road.sourceWay ?? ''));
const ring = roads.filter(road => ringWays.has(road.sourceWay ?? '')).flatMap(road => road.points);
// The former [1110,4185] is OSM node [-48.8727,26.4] ON the ring, not its centre.
// Fit only this already registered closed ring, never a camera-space offset.
const center: AccessJunctionPoint = [
  (Math.min(...ring.map(p => p[0])) + Math.max(...ring.map(p => p[0]))) / 2,
  (Math.min(...ring.map(p => p[1])) + Math.max(...ring.map(p => p[1]))) / 2,
];
const centerlineRadius = ring.reduce((sum, p) => sum + Math.hypot(p[0] - center[0], p[1] - center[1]), 0) / ring.length;
const west = context.roads.find(road => road.sourceWay === '447054088')!;
const westStart = west.points.findIndex(p => p[0] === -64.7718 && p[1] === 19.2403);
const sourceApproaches = roads.filter(road => !ringWays.has(road.sourceWay ?? ''));
const westEntry = roads.find(road => road.sourceWay === '891242797')!.points;
const westExit = roads.find(road => road.sourceWay === '833033191')!.points;
const avenueJoin = point(west.points.at(-2)!);

export const ACCESS_JUNCTION = Object.freeze({
  revision: '2026.9-access-junction-registered.3',
  classification: 'PROTECTED_INFRASTRUCTURE' as const,
  evidence: 'IMG_0956.jpeg and registered OSM ring; widths and circle fit remain visual estimates, not survey',
  elevation: 0.034,
  center,
  centerlineRadius,
  outerRadius: centerlineRadius + 0.76,
  islandRadius: centerlineRadius - 0.76,
  registeredRing: ring.map(point),
  replacedTerritoryIds: roads.map(road => road.id),
  westRoadId: west.id,
  westSeam: point(west.points[westStart]),
  approaches: [
    { id: 'tuparendi-west-seam', points: west.points.slice(westStart).map(point), width: west.width },
    ...sourceApproaches.map(road => ({ id: road.id, points: road.points.map(point), width: road.width })),
    // Endpoints belong to the existing ring node and the Benvenuto axis.
    { id: 'benvenuto-roundabout-mouth', points: [[-48.8727, 26.4], [-47.65, 26.65], [-46.1673, 26.7273]] as AccessJunctionPoint[], width: 2.1 },
  ],
  // The two existing split approaches enclose the long west divider seen in
  // IMG_0956. Their union leaves it empty; do not invent displaced triangles.
  westDividerControls: [point(westEntry[0]), point(westEntry.at(-1)!), point(westExit[0])],
  gate1AvenueJoin: avenueJoin,
  unionRoadIds: ['gate-1-local-access', 'gate-1-roundabout-tupareendi-link', 'gate-1-apron',
    'benvenuto-four-lane-axis', 'gate-3-arrival'] as readonly string[],
});

/** Ownership transfer only: OSM provenance and every unaffected through vertex stay intact. */
export function retainedTerritoryAccessRoad<T extends { id: string; points: readonly AccessJunctionPoint[] }>(road: T): T[] {
  if (ACCESS_JUNCTION.replacedTerritoryIds.includes(road.id)) return [];
  if (road.id === ACCESS_JUNCTION.westRoadId) return [{ ...road, points: road.points.slice(0, westStart + 1) }];
  return [road];
}

/** The official crop transform, shared by the source plan, without importing its data graph. */
export function accessWorldToSource([x, z]: AccessJunctionPoint): AccessJunctionPoint {
  return [(x + MAP_REFERENCE_WIDTH / 2) * 5500 / MAP_REFERENCE_WIDTH + 600,
    (z + MAP_REFERENCE_HEIGHT / 2) * 4150 / MAP_REFERENCE_HEIGHT + 900];
}

/** Cubic segment with fixed endpoints and endpoint tangents; no per-frame curve work. */
export function sampleAccessCurve(a: AccessJunctionPoint, b: AccessJunctionPoint,
  c: AccessJunctionPoint, d: AccessJunctionPoint, segments = 12): AccessJunctionPoint[] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const t = index / segments, s = 1 - t;
    return [s ** 3 * a[0] + 3 * s ** 2 * t * b[0] + 3 * s * t ** 2 * c[0] + t ** 3 * d[0],
      s ** 3 * a[1] + 3 * s ** 2 * t * b[1] + 3 * s * t ** 2 * c[1] + t ** 3 * d[1]];
  });
}
