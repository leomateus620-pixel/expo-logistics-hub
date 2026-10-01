import type { CommercialLot, Coordinate, MapEntity } from '../types';
import { COMMERCIAL_MAP_SEGMENTS, buildCommercialMapSegmentIndex, type CommercialMapSegmentId } from '../data/commercialMapSegments';
import { normalizeMapEntityMetadata } from './mapMetadata';
import { lotPointClearance, safeLotAnchor } from './soldLotPresentation';
import { distanceToSegment, entitySurfaceElevation, pointInPolygon } from './spatialSurface';

export type OrientationItem = {
  id: string; name: string; kind: 'segment' | 'block' | 'road';
  segmentId?: CommercialMapSegmentId; anchor: Coordinate; elevation: number;
  edge: [Coordinate, Coordinate]; outline?: readonly Coordinate[][];
  clearance: number;
};

export const TERRITORY_SYMBOLS: Record<CommercialMapSegmentId, { glyph: string; short: string; pattern: string }> = {
  exporural: { glyph: '◇', short: 'Exporural', pattern: 'none' },
  'industria-comercio-servicos': { glyph: '▤', short: 'ICS', pattern: '8 4' },
  'espaco-automovel': { glyph: '○', short: 'Automóvel', pattern: '2 4' },
};

const finiteRing = (ring: readonly Coordinate[]) => ring.length >= 3 && ring.every(p => p.length === 2 && p.every(Number.isFinite));
const largestEdge = (ring: readonly Coordinate[]): [Coordinate, Coordinate] => {
  let best: [Coordinate, Coordinate] = [ring[0], ring[1]], length = 0;
  ring.forEach((p, index) => {
    const next = ring[(index + 1) % ring.length];
    const distance = Math.hypot(next[0] - p[0], next[1] - p[1]);
    if (distance > length) { best = [p, next]; length = distance; }
  });
  return best;
};

/** Pure cadastral preparation: no inferred segment, screen projection or per-frame union. */
export function prepareTerritorialOrientation(entities: readonly MapEntity[], lots: readonly CommercialLot[],
  roadEntities: readonly MapEntity[] = entities): OrientationItem[] {
  const segmentIndex = buildCommercialMapSegmentIndex(entities, lots);
  const blocks = entities.filter(entity => !entity.isArchived && entity.classification === 'QUADRA'
    && /^QUADRA-[A-Z0-9]+$/.test(entity.publicIdentifier) && entity.geometry.coordinates.every(finiteRing));
  const items: OrientationItem[] = [];
  const accepted = new Set<string>();
  for (const entity of blocks) {
    const segment = segmentIndex.get(entity.id);
    const code = entity.publicIdentifier.slice(7);
    // Labels use only confirmed, unambiguous membership and cadastral quadras.
    if (!segment || !segment.membership.blockCodes.includes(code) || accepted.has(code)) continue;
    const rings = entity.geometry.coordinates;
    const saved = entity.metadata.labelAnchor;
    const preferred: Coordinate | null = Array.isArray(saved) && saved.length === 2 && saved.every(v => typeof v === 'number' && Number.isFinite(v))
      ? [saved[0], saved[1]] : null;
    const safe = safeLotAnchor(rings);
    const anchor = preferred && lotPointClearance(preferred, rings) > 0 ? preferred : safe?.point;
    if (!anchor) continue;
    accepted.add(code);
    items.push({ id: entity.id, name: `Quadra ${code}`, kind: 'block', segmentId: segment.id, anchor,
      elevation: entity.geometry.elevation + .08, edge: largestEdge(rings[0]), outline: rings,
      clearance: lotPointClearance(anchor, rings) });
  }
  for (const segment of COMMERCIAL_MAP_SEGMENTS) {
    const members = items.filter(item => item.segmentId === segment.id);
    if (!members.length) continue;
    // Use one actual cadastral block as a stable representative, never a hull.
    const representative = members.reduce((best, item) => item.clearance > best.clearance ? item : best);
    items.push({ ...representative, id: `segment:${segment.id}`, name: TERRITORY_SYMBOLS[segment.id].short,
      kind: 'segment' });
  }
  const roadNames = new Set<string>();
  for (const entity of roadEntities) {
    if (entity.isArchived || !['ROAD', 'PEDESTRIAN_PATH'].includes(entity.classification)
      || !entity.geometry.coordinates.every(finiteRing)) continue;
    const name = normalizeMapEntityMetadata(entity).street?.trim();
    if (!name) continue;
    const rings = entity.geometry.coordinates;
    const saved = entity.metadata.labelAnchor;
    const preferred: Coordinate | null = Array.isArray(saved) && saved.length === 2 && saved.every(v => typeof v === 'number' && Number.isFinite(v))
      ? [saved[0], saved[1]] : null;
    const safe = safeLotAnchor(rings);
    const anchor = preferred && lotPointClearance(preferred, rings) > 0 ? preferred : safe?.point;
    if (!anchor) continue;
    const normalizedName = name.toLocaleLowerCase('pt-BR');
    const roadItem: OrientationItem = { id: `road:${entity.id}`, name, kind: 'road', anchor,
      elevation: entity.geometry.elevation + .08, edge: largestEdge(rings[0]), outline: rings,
      clearance: lotPointClearance(anchor, rings) };
    const existingIndex = items.findIndex(item => item.kind === 'road' && item.name.toLocaleLowerCase('pt-BR') === normalizedName);
    if (existingIndex < 0) { roadNames.add(normalizedName); items.push(roadItem); }
    else if (roadItem.clearance > items[existingIndex].clearance) items[existingIndex] = roadItem;
  }
  return items;
}

export type ScreenBox = { left: number; right: number; top: number; bottom: number };
type ScreenPoint = readonly [number, number];

function segmentsCross(a: ScreenPoint, b: ScreenPoint, c: ScreenPoint, d: ScreenPoint) {
  const cross = (p: ScreenPoint, q: ScreenPoint, r: ScreenPoint) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const abC = cross(a, b, c), abD = cross(a, b, d);
  const cdA = cross(c, d, a), cdB = cross(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

/** Compatibility wrapper for axis-aligned footprints; the renderer uses the
 * oriented world footprint below, including concave turns and holes. */
export function roadLabelFits(box: ScreenBox, road: readonly ScreenPoint[][],
  obstacles: readonly (readonly ScreenPoint[][])[] = []) {
  const corners: ScreenPoint[] = [
    [box.left, box.top], [box.right, box.top], [box.right, box.bottom], [box.left, box.bottom],
  ];
  return orientationFootprintFits(corners, road, obstacles);
}

export type WorldOrientationLabel = OrientationItem & {
  angle: number; width: number; height: number; footprint: Coordinate[];
  /** Real cadastral span controls density, without changing text dimensions. */
  referenceSpan: number;
};

/** Text has an immutable size and basis on the terrain, independent of camera. */
export function orientationFootprint(anchor: Coordinate, width: number, height: number, angle: number): Coordinate[] {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map<Coordinate>(([x, z]) => [
    anchor[0] + x * width * .5 * c - z * height * .5 * s,
    anchor[1] + x * width * .5 * s + z * height * .5 * c,
  ]);
}

/** Test the actual rotated rectangle, not its axis-aligned bounding box. */
export function orientationFootprintFits(footprint: readonly ScreenPoint[], surface: readonly (readonly ScreenPoint[])[],
  obstacles: readonly (readonly (readonly ScreenPoint[])[])[] = []) {
  const outer = surface[0];
  if (!outer || outer.length < 3 || footprint.length !== 4) return false;
  const crosses = (ring: readonly ScreenPoint[]) => ring.some((p, i) => footprint.some((corner, j) =>
    segmentsCross(p, ring[(i + 1) % ring.length], corner, footprint[(j + 1) % footprint.length])));
  const covered = (rings: readonly (readonly ScreenPoint[])[]) => rings.some(crosses)
    || rings.some(ring => ring.some(p => pointInPolygon(p, footprint)))
    || footprint.some(p => pointInPolygon(p, rings[0] ?? []) && !rings.slice(1).some(hole => pointInPolygon(p, hole)));
  return footprint.every(p => pointInPolygon(p, outer) && !surface.slice(1).some(hole => pointInPolygon(p, hole)))
    && !surface.some(crosses)
    && !surface.slice(1).some(hole => hole.some(p => pointInPolygon(p, footprint)))
    && !obstacles.some(covered);
}

function stableAxis(start: Coordinate, end: Coordinate) {
  let x = end[0] - start[0], z = end[1] - start[1];
  if (x < -1e-8 || Math.abs(x) < 1e-8 && z > 0) { x = -x; z = -z; }
  return Math.atan2(z, x);
}

/** Distance to the first boundary along an axis, including holes and turns. */
function corridorSpan(anchor: Coordinate, angle: number, rings: readonly Coordinate[][]) {
  const dx = Math.cos(angle), dz = Math.sin(angle);
  let before = -Infinity, after = Infinity;
  for (const ring of rings) ring.forEach((a, index) => {
    const b = ring[(index + 1) % ring.length], ex = b[0] - a[0], ez = b[1] - a[1];
    const determinant = dx * ez - dz * ex;
    if (Math.abs(determinant) < 1e-8) return;
    const ax = a[0] - anchor[0], az = a[1] - anchor[1];
    const t = (ax * ez - az * ex) / determinant;
    const u = (ax * dz - az * dx) / determinant;
    if (u < 0 || u > 1) return;
    if (t < 0) before = Math.max(before, t);
    else after = Math.min(after, t);
  });
  return Number.isFinite(before) && Number.isFinite(after) ? after - before : 0;
}

/** Nearby road boundaries define the local tangent. A distant longest edge
 * cannot dictate the direction of a different bend near the text anchor. */
export function localRoadLabelAngle(anchor: Coordinate, rings: readonly Coordinate[][]) {
  const edges = (rings[0] ?? []).map((a, i, ring) => ({
    distance: distanceToSegment(anchor, a, ring[(i + 1) % ring.length]),
    angle: stableAxis(a, ring[(i + 1) % ring.length]),
  }));
  const nearest = Math.min(...edges.map(edge => edge.distance));
  const local = edges.filter(edge => edge.distance <= nearest * 1.7 + .025);
  return local.reduce((best, edge) => {
    const score = corridorSpan(anchor, edge.angle, rings) / (1 + edge.distance / Math.max(.025, nearest) * .15);
    return score > best.score ? { score, angle: edge.angle } : best;
  }, { score: -1, angle: 0 }).angle;
}

function bounds(ring: readonly Coordinate[]) {
  return { minX: Math.min(...ring.map(p => p[0])), maxX: Math.max(...ring.map(p => p[0])),
    minZ: Math.min(...ring.map(p => p[1])), maxZ: Math.max(...ring.map(p => p[1])) };
}

const NON_OBSTACLES = new Set(['ROAD', 'PEDESTRIAN_PATH', 'QUADRA', 'GREEN_AREA', 'PARKING', 'WATER', 'TREE']);

/** Layout/fit only runs when authorized inventory or atlas text metrics change.
 * Ratios come from the shared atlas once, never from browser layout in motion. */
export function layoutTerritorialOrientation(items: readonly OrientationItem[], entities: readonly MapEntity[],
  aspectRatios: ReadonlyMap<string, number>): WorldOrientationLabel[] {
  const inventory = entities.filter(entity => !entity.isArchived && entity.geometry.coordinates.length > 0
    && entity.geometry.coordinates.every(finiteRing))
    .map(entity => ({ entity, box: bounds(entity.geometry.coordinates[0]) }));
  const output: WorldOrientationLabel[] = [];
  for (const item of items) {
    const rings = item.outline;
    if (!rings?.length || !rings.every(finiteRing)) continue;
    const box = bounds(rings[0]);
    const nearby = inventory.filter(({ box: other }) => other.minX < box.maxX && other.maxX > box.minX
      && other.minZ < box.maxZ && other.maxZ > box.minZ).map(({ entity }) => entity);
    const obstacleEntities = nearby.filter(entity => entity.metadata.renderMode !== 'outline' && !NON_OBSTACLES.has(entity.classification)
      && (item.kind === 'road' || !['SELLABLE_LOT', 'INTERNAL_STAND'].includes(entity.classification)));
    const obstacles = obstacleEntities.map(entity => entity.geometry.coordinates);
    const anchors: Coordinate[] = [item.anchor];
    // Bounded candidates avoid another polygon subdivision/search per label.
    // Narrow corridors and courtyards can need a point away from the polylabel.
    for (const x of [.25, .5, .75]) for (const z of [.25, .5, .75]) {
      const point: Coordinate = [box.minX + (box.maxX - box.minX) * x, box.minZ + (box.maxZ - box.minZ) * z];
      if (lotPointClearance(point, rings, obstacles.map(outline => outline[0])) > .02) anchors.push(point);
    }
    const ratio = aspectRatios.get(item.id) ?? item.name.length * .48;
    const preferredHeight = item.kind === 'road' ? .82 : item.kind === 'block' ? 2.05 : 2.35;
    let placement: { anchor: Coordinate; angle: number; height: number; footprint: Coordinate[] } | null = null;
    for (const anchor of anchors) {
      const angle = item.kind === 'road' ? localRoadLabelAngle(anchor, rings) : stableAxis(...item.edge);
      let low = 0, high = preferredHeight;
      for (let step = 0; step < 12; step++) {
        const height = (low + high) / 2;
        if (orientationFootprintFits(orientationFootprint(anchor, height * ratio, height, angle), rings, obstacles)) low = height;
        else high = height;
      }
      if (!placement || low > placement.height + .001) {
        placement = { anchor, angle, height: low, footprint: orientationFootprint(anchor, low * ratio, low, angle) };
      }
      if (low >= preferredHeight * .998) break;
    }
    if (!placement || placement.height < (item.kind === 'road' ? .18 : .35)) continue;
    const surfaceEntities = nearby.filter(entity => ['SELLABLE_LOT', 'INTERNAL_STAND', 'QUADRA'].includes(entity.classification));
    const elevation = item.kind === 'road' ? item.elevation : Math.max(item.elevation,
      // Canonical cart/selection/hover lifts are <= .09. Keep the immutable
      // plane just above that surface so interaction cannot clip a name.
      ...surfaceEntities.map(entity => entitySurfaceElevation(entity)
        + (entity.classification === 'QUADRA' ? .025 : .115)));
    output.push({ ...item, ...placement, width: placement.height * ratio, elevation,
      referenceSpan: Math.hypot(item.edge[1][0] - item.edge[0][0], item.edge[1][1] - item.edge[0][1]) });
  }
  return output;
}

export function orientationBoxFits(box: ScreenBox, occupied: readonly ScreenBox[], margin = 6) {
  return !occupied.some(other => box.left < other.right + margin && box.right > other.left - margin
    && box.top < other.bottom + margin && box.bottom > other.top - margin);
}
/** Two thresholds prevent a label flickering at the zoom boundary. */
export function orientationLevel(span: number, previous: 'far' | 'medium' | 'near' = 'far') {
  if (previous === 'far') return span > 40 ? 'medium' : 'far';
  if (previous === 'near') return span < 105 ? 'medium' : 'near';
  if (span > 130) return 'near';
  if (span < 28) return 'far';
  return 'medium';
}
