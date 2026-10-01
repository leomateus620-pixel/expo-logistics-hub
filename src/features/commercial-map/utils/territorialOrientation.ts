import type { CommercialLot, Coordinate, MapEntity } from '../types';
import { COMMERCIAL_MAP_SEGMENTS, buildCommercialMapSegmentIndex, type CommercialMapSegmentId } from '../data/commercialMapSegments';
import { normalizeMapEntityMetadata } from './mapMetadata';
import { lotPointClearance, safeLotAnchor } from './soldLotPresentation';
import { pointInPolygon } from './spatialSurface';

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
      kind: 'segment', outline: undefined });
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

/** The complete horizontal label footprint must stay inside the presented road,
 * including concave turns and holes. Screen-space checks run only on changed frames. */
export function roadLabelFits(box: ScreenBox, road: readonly ScreenPoint[][],
  obstacles: readonly (readonly ScreenPoint[][])[] = []) {
  const outer = road[0];
  if (!outer || outer.length < 3) return false;
  const corners: ScreenPoint[] = [
    [box.left, box.top], [box.right, box.top], [box.right, box.bottom], [box.left, box.bottom],
  ];
  const insideBox = ([x, y]: ScreenPoint) => x > box.left && x < box.right && y > box.top && y < box.bottom;
  const intersects = (ring: readonly ScreenPoint[]) => ring.some((p, i) => {
    const next = ring[(i + 1) % ring.length];
    return insideBox(p) || corners.some((corner, j) => segmentsCross(p, next, corner, corners[(j + 1) % corners.length]));
  });
  return corners.every(p => pointInPolygon(p, outer) && !road.slice(1).some(hole => pointInPolygon(p, hole)))
    && !road.some(intersects)
    && !obstacles.some(rings => rings.some(ring => intersects(ring))
      || corners.some(p => pointInPolygon(p, rings[0] ?? []) && !rings.slice(1).some(hole => pointInPolygon(p, hole))));
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
