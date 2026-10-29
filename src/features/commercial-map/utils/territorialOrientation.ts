import type { CommercialLot, Coordinate, MapEntity } from '../types';
import { COMMERCIAL_MAP_SEGMENTS, buildCommercialMapSegmentIndex, type CommercialMapSegmentId } from '../data/commercialMapSegments';
import { normalizeMapEntityMetadata } from './mapMetadata';
import { lotPointClearance, safeLotAnchor } from './soldLotPresentation';
import { distanceToSegment, entitySurfaceElevation, pointInPolygon } from './spatialSurface';
import { isExporuralLongitudinalPassage } from './exporuralPassage';

export type OrientationItem = {
  id: string; name: string; kind: 'segment' | 'block' | 'road';
  segmentId?: CommercialMapSegmentId; anchor: Coordinate; elevation: number;
  edge: [Coordinate, Coordinate]; outline?: readonly Coordinate[][];
  clearance: number;
  subdued?: boolean;
  canonicalRoadId?: string;
  /** Derived label region; never written back to a quadra or parcel. */
  exteriorBlock?: { side: 'above' | 'below'; minX: number; maxX: number; boundaryZ: number;
    lotOutlines: readonly (readonly Coordinate[][])[] };
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

// These are cadastral fragments of the same named road, not name matching.
// Unrelated roads with equal display names deliberately keep separate identities.
const ROAD_LABEL_OWNERS: Readonly<Record<string, string>> = {
  'RUA-URUGUAI-LESTE': 'RUA-URUGUAI',
  'RUA-ARGENTINA-LESTE': 'RUA-ARGENTINA',
  'RUA-MONTEVIDEU-SUL': 'RUA-MONTEVIDEU',
  'RUA-MONTEVIDEU-COZINHA': 'RUA-MONTEVIDEU',
  'EXPORURAL-PASSAGEM-LESTE-01': 'EXPORURAL-PASSAGEM-LONGITUDINAL',
  'EXPORURAL-PASSAGEM-LESTE-02': 'EXPORURAL-PASSAGEM-LONGITUDINAL',
  'EXPORURAL-PASSAGEM-INTERNA-01': 'EXPORURAL-PASSAGEM-LONGITUDINAL',
};

// Spatially equivalent cadastral runs. Membership is explicit; every actual
// anchor/fraction is still fitted from the authorized polygons and obstacles.
// In particular, frontage avenues cannot fragment the Chile/Brasil/Uruguai run
// merely because their UUID sorts before a shorter street.
const ROAD_ALIGNMENT_GROUPS = new Map([
  ...['RUA-PARAGUAI', 'RUA-BOLIVIA', 'RUA-CHILE', 'RUA-BRASIL', 'RUA-URUGUAI', 'RUA-ARGENTINA']
    .map(id => [id, 'commercial-core-horizontal'] as const),
  ...['ALAMEDA-MERCOSUL', 'RUA-MONTEVIDEU', 'RUA-BRASILIA']
    .map(id => [id, 'commercial-core-vertical'] as const),
  ...['RUA-BUENOS-AIRES', 'RUA-INTERNA-OESTE', 'RUA-INTERNA-QUADRA-T']
    .map(id => [id, 'automotive-vertical'] as const),
  ...['RUA-BRUNO-SCHWARTZ', 'RUA-JOHAN-MULLER', 'RUA-GUSTAVO-BESSEL', 'RUA-EMANUEL-BRACHMANN']
    .map(id => [id, 'exporural-horizontal'] as const),
  ...['RUA-PASTOR-ALBERT-LEHENBAUER', 'RUA-15-NOVEMBRO']
    .map(id => [id, 'exporural-vertical'] as const),
]);

export function canonicalTerritorialRoadId(entity: MapEntity) {
  const identifier = typeof entity.metadata.canonicalRoadIdentifier === 'string'
    ? entity.metadata.canonicalRoadIdentifier : entity.publicIdentifier;
  return ROAD_LABEL_OWNERS[identifier] ?? identifier;
}

/** Pure cadastral preparation: no inferred segment, screen projection or per-frame union. */
export function prepareTerritorialOrientation(entities: readonly MapEntity[], lots: readonly CommercialLot[],
  roadEntities: readonly MapEntity[] = entities): OrientationItem[] {
  const segmentIndex = buildCommercialMapSegmentIndex(entities, lots);
  const blocks = entities.filter(entity => !entity.isArchived && entity.classification === 'QUADRA'
    && /^QUADRA-[A-Z0-9]+$/.test(entity.publicIdentifier) && entity.geometry.coordinates.every(finiteRing));
  const items: OrientationItem[] = [];
  const accepted = new Set<string>();
  const exporuralLots = entities.filter(entity => !entity.isArchived && entity.classification === 'SELLABLE_LOT'
    && segmentIndex.get(entity.id)?.id === 'exporural' && entity.geometry.coordinates.length > 0 && entity.geometry.coordinates.every(finiteRing));
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
    const blockLots = exporuralLots.filter(lot => lot.parentEntityId === entity.id
      || normalizeMapEntityMetadata(lot).block === code);
    const blockPoints = blockLots.flatMap(lot => lot.geometry.coordinates[0]);
    const ruralPoints = exporuralLots.flatMap(lot => lot.geometry.coordinates[0]);
    const exteriorBlock = segment.id === 'exporural' && ['R', 'S'].includes(code) && blockPoints.length
      ? { side: code === 'S' ? 'above' as const : 'below' as const,
        minX: Math.min(...blockPoints.map(p => p[0])), maxX: Math.max(...blockPoints.map(p => p[0])),
        boundaryZ: code === 'S' ? Math.min(...ruralPoints.map(p => p[1])) : Math.max(...ruralPoints.map(p => p[1])),
        lotOutlines: exporuralLots.map(lot => lot.geometry.coordinates) }
      : undefined;
    items.push({ id: entity.id, name: `Quadra ${code}`, kind: 'block', segmentId: segment.id, anchor,
      elevation: entity.geometry.elevation + .08, edge: largestEdge(rings[0]), outline: rings,
      clearance: lotPointClearance(anchor, rings), exteriorBlock });
  }
  for (const segment of COMMERCIAL_MAP_SEGMENTS) {
    const members = items.filter(item => item.segmentId === segment.id);
    if (!members.length) continue;
    // Use one actual cadastral block as a stable representative, never a hull.
    const representative = members.reduce((best, item) => item.clearance > best.clearance ? item : best);
    items.push({ ...representative, exteriorBlock: undefined, id: `segment:${segment.id}`, name: TERRITORY_SYMBOLS[segment.id].short,
      kind: 'segment' });
  }
  const roadOwners = new Map(roadEntities.map(entity => [entity.publicIdentifier, entity]));
  const chosenRoadSource = new Map<string, MapEntity>();
  for (const entity of roadEntities) {
    if (entity.isArchived || !['ROAD', 'PEDESTRIAN_PATH'].includes(entity.classification)
      || entity.metadata.suppressTerritorialLabel === true
      || entity.publicIdentifier === 'RUA-UBIRETAMA-LATERAL-R55'
      || (entity.metadata.nameConfirmed === false && !isExporuralLongitudinalPassage(entity))
      || !entity.geometry.coordinates.every(finiteRing)) continue;
    const passage = isExporuralLongitudinalPassage(entity);
    const canonicalRoadId = canonicalTerritorialRoadId(entity);
    const nameOwner = roadOwners.get(canonicalRoadId) ?? entity;
    const name = passage ? 'Passagem' : normalizeMapEntityMetadata(nameOwner).street?.trim();
    if (!name) continue;
    const rings = entity.geometry.coordinates;
    const saved = entity.metadata.labelAnchor;
    const preferred: Coordinate | null = Array.isArray(saved) && saved.length === 2 && saved.every(v => typeof v === 'number' && Number.isFinite(v))
      ? [saved[0], saved[1]] : null;
    const safe = safeLotAnchor(rings);
    const anchor = preferred && lotPointClearance(preferred, rings) > 0 ? preferred : safe?.point;
    if (!anchor) continue;
    const roadItem: OrientationItem = { id: `road:${entity.id}`, name, kind: 'road', anchor, subdued: passage, canonicalRoadId,
      elevation: entity.geometry.elevation + .08, edge: largestEdge(rings[0]), outline: rings,
      clearance: lotPointClearance(anchor, rings) };
    const existingIndex = items.findIndex(item => item.kind === 'road' && item.canonicalRoadId === canonicalRoadId);
    const previousSource = chosenRoadSource.get(canonicalRoadId);
    const preferSource = previousSource && (entity.publicIdentifier === canonicalRoadId && previousSource.publicIdentifier !== canonicalRoadId
      || (entity.publicIdentifier === canonicalRoadId) === (previousSource.publicIdentifier === canonicalRoadId)
        && entity.id.localeCompare(previousSource.id) < 0);
    if (existingIndex < 0) { items.push(roadItem); chosenRoadSource.set(canonicalRoadId, entity); }
    else if (roadItem.clearance > items[existingIndex].clearance + 1e-6
      || Math.abs(roadItem.clearance - items[existingIndex].clearance) <= 1e-6 && preferSource) {
      items[existingIndex] = roadItem; chosenRoadSource.set(canonicalRoadId, entity);
    }
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
  /** Visible glyph + keyline bounds, excluding transparent atlas padding. */
  inkFootprint?: Coordinate[];
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
  return fitFootprint(footprint, surface, obstacles);
}

type FootprintFit = typeof orientationFootprintFits;
type ObstacleBoundsCache = WeakMap<readonly (readonly ScreenPoint[])[], ReturnType<typeof bounds>>;

function fitFootprint(footprint: readonly ScreenPoint[], surface: readonly (readonly ScreenPoint[])[],
  obstacles: readonly (readonly (readonly ScreenPoint[])[])[], boundsCache?: ObstacleBoundsCache) {
  const outer = surface[0];
  if (!outer || outer.length < 3 || footprint.length !== 4) return false;
  const footprintBounds = bounds(footprint);
  const crosses = (ring: readonly ScreenPoint[]) => ring.some((p, i) => footprint.some((corner, j) =>
    segmentsCross(p, ring[(i + 1) % ring.length], corner, footprint[(j + 1) % footprint.length])));
  const covered = (rings: readonly (readonly ScreenPoint[])[]) => {
    let box = boundsCache?.get(rings);
    if (!box) {
      box = bounds(rings.flat());
      boundsCache?.set(rings, box);
    }
    // The exact tests are unchanged. A disjoint AABB cannot intersect or
    // contain the glyph; inclusive edges retain the existing contact rules.
    return boundsOverlap(footprintBounds, box) && (rings.some(crosses)
      || rings.some(ring => ring.some(p => pointInPolygon(p, footprint)))
      || footprint.some(p => pointInPolygon(p, rings[0] ?? []) && !rings.slice(1).some(hole => pointInPolygon(p, hole))));
  };
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

function bounds(ring: readonly ScreenPoint[]) {
  return { minX: Math.min(...ring.map(p => p[0])), maxX: Math.max(...ring.map(p => p[0])),
    minZ: Math.min(...ring.map(p => p[1])), maxZ: Math.max(...ring.map(p => p[1])) };
}
const boundsOverlap = (a: ReturnType<typeof bounds>, b: ReturnType<typeof bounds>) =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;

const NON_OBSTACLES = new Set(['ROAD', 'PEDESTRIAN_PATH', 'QUADRA', 'GREEN_AREA', 'PARKING', 'WATER', 'TREE']);

export type TerritorialObstacle = readonly Coordinate[][];
export type OrientationInkBounds = { left: number; right: number; top: number; bottom: number };
const NO_PRESENTATION_OBSTACLES: readonly TerritorialObstacle[] = [];

/** Shared-axis references come from intersecting road spans, not camera/screen
 * coordinates. Curves and diagonals keep their existing local-tangent layout. */
function roadAlignmentReferences(items: readonly OrientationItem[], aspectRatios: ReadonlyMap<string, number>,
  obstacles: readonly { rings: TerritorialObstacle; box: ReturnType<typeof bounds>; canonicalRoadId?: string }[],
  inkBounds: ReadonlyMap<string, OrientationInkBounds>, fits: FootprintFit) {
  const groups: { key: string | undefined; axis: 0 | 1; low: number; high: number; cross: number; members: OrientationItem[] }[] = [];
  const roads = items.filter(item => item.kind === 'road' && !item.subdued && item.outline?.[0]?.length)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const item of roads) {
    const angle = localRoadLabelAngle(item.anchor, item.outline!);
    const axis = Math.abs(Math.sin(angle)) < .12 ? 0 : Math.abs(Math.cos(angle)) < .12 ? 1 : null;
    if (axis === null) continue;
    const box = bounds(item.outline![0]);
    const low = axis === 0 ? box.minX : box.minZ, high = axis === 0 ? box.maxX : box.maxZ;
    const cross = axis === 0 ? (box.minZ + box.maxZ) / 2 : (box.minX + box.maxX) / 2;
    const key = ROAD_ALIGNMENT_GROUPS.get(item.canonicalRoadId ?? '');
    const group = groups.find(group => group.axis === axis && group.key === key
      && Math.min(group.high, high) - Math.max(group.low, low) > Math.min(group.high - group.low, high - low) * .25
      && (key || Math.abs(group.cross - cross) < Math.min(group.high - group.low, high - low) * .75));
    if (group) {
      group.low = Math.max(group.low, low); group.high = Math.min(group.high, high);
      group.members.push(item);
    } else groups.push({ key, axis, low, high, cross, members: [item] });
  }
  return new Map(groups.flatMap(group => {
    const center = (group.low + group.high) / 2;
    const candidates = Array.from({ length: 49 }, (_, i) => group.low + (group.high - group.low) * i / 48)
      .sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
    const members = group.members.map(item => {
      const box = bounds(item.outline![0]);
      const nearby = obstacles.filter(obstacle => obstacle.canonicalRoadId !== item.canonicalRoadId && boundsOverlap(box, obstacle.box))
        .map(obstacle => obstacle.rings);
      const height = Math.min(.82, (group.axis === 0 ? box.maxZ - box.minZ : box.maxX - box.minX) * .998);
      return { item, box, height, nearby, ratio: aspectRatios.get(item.id) ?? item.name.length * .48 };
    });
    let position = center, fraction = .5, bestScore = -1;
    for (const value of candidates) {
      for (const lane of [.5, .3, .7, .2, .8]) {
        const score = members.reduce((count, { item, box, height, nearby, ratio }) => {
          const across = group.axis === 0 ? box.minZ + (box.maxZ - box.minZ) * lane : box.minX + (box.maxX - box.minX) * lane;
          const anchor: Coordinate = group.axis === 0 ? [value, across] : [across, value];
          const angle = localRoadLabelAngle(anchor, item.outline!);
          return count + Number(fits(textInkFootprint(anchor, height * ratio, height, angle, inkBounds.get(item.id)), item.outline!, nearby));
        }, 0);
        if (score > bestScore) { bestScore = score; position = value; fraction = lane; }
        if (score === members.length) break;
      }
      if (bestScore === members.length) break;
    }
    return group.members.map(item => [item.id, { axis: group.axis, position, fraction }] as const);
  }));
}

function textInkFootprint(anchor: Coordinate, width: number, height: number, angle: number,
  ink?: OrientationInkBounds) {
  if (!ink) return orientationFootprint(anchor, width, height, angle);
  const x = width * ((ink.left + ink.right) / 2 - .5), z = height * ((ink.top + ink.bottom) / 2 - .5);
  return orientationFootprint([anchor[0] + x * Math.cos(angle) - z * Math.sin(angle),
    anchor[1] + x * Math.sin(angle) + z * Math.cos(angle)], width * (ink.right - ink.left), height * (ink.bottom - ink.top), angle);
}

/** Use this for canopies/scene footprints supplied by the mounted scene. It
 * deliberately imports no global inventory, especially on the public path. */
export function territorialTreeObstacles(trees: readonly { position: readonly [number, number]; canopyRadius: number }[]): TerritorialObstacle[] {
  return trees.map(tree => [Array.from({ length: 12 }, (_, i): Coordinate => [
    tree.position[0] + Math.cos(i * Math.PI / 6) * tree.canopyRadius * 1.04,
    tree.position[1] + Math.sin(i * Math.PI / 6) * tree.canopyRadius * 1.04,
  ])]);
}

/** The southern tail at the far right of R must not push a centered name onto
 * the Arena plaza. Intersect the real edges with the text's X band first. */
function localBlockBoundary(region: NonNullable<OrientationItem['exteriorBlock']>, minX: number, maxX: number) {
  const values: number[] = [];
  for (const rings of region.lotOutlines) rings[0].forEach((a, i, ring) => {
    const b = ring[(i + 1) % ring.length];
    if (Math.max(a[0], b[0]) < minX || Math.min(a[0], b[0]) > maxX) return;
    if (a[0] >= minX && a[0] <= maxX) values.push(a[1]);
    if (Math.abs(b[0] - a[0]) < 1e-9) return;
    for (const x of [minX, maxX]) {
      const t = (x - a[0]) / (b[0] - a[0]);
      if (t >= 0 && t <= 1) values.push(a[1] + t * (b[1] - a[1]));
    }
  });
  return values.length ? region.side === 'above' ? Math.min(...values) : Math.max(...values) : region.boundaryZ;
}

function exteriorBlockPlacement(item: OrientationItem, ratio: number, height: number,
  obstacles: readonly TerritorialObstacle[], fits: FootprintFit, ink = { left: 0, right: 1, top: 0, bottom: 1 }) {
  const region = item.exteriorBlock!;
  const angle = stableAxis(...item.edge), width = height * ratio;
  const inkWidth = width * (ink.right - ink.left), inkHeight = height * (ink.bottom - ink.top);
  const halfZ = (Math.abs(Math.sin(angle)) * inkWidth + Math.abs(Math.cos(angle)) * inkHeight) / 2;
  const halfX = (Math.abs(Math.cos(angle)) * inkWidth + Math.abs(Math.sin(angle)) * inkHeight) / 2;
  const offsetX = width * ((ink.left + ink.right) / 2 - .5), offsetZ = height * ((ink.top + ink.bottom) / 2 - .5);
  const centerX = (region.minX + region.maxX) / 2;
  const direction = region.side === 'above' ? -1 : 1;
  const gap = height * .04;
  const indexedObstacles = obstacles.map(rings => ({ rings, box: bounds(rings[0]) }));
  // World-fixed candidates: prefer the closest row and the block's center.
  // Search beyond roads/parking rather than treating them as empty terrain.
  for (let row = 0; row <= 16; row++) {
    for (const offset of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
      const x = centerX + offset * Math.max(0, region.maxX - region.minX - 2 * halfX) / 8;
      if (x - halfX < region.minX || x + halfX > region.maxX) continue;
      const boundaryZ = localBlockBoundary(region, x - halfX - gap, x + halfX + gap);
      const z = boundaryZ + direction * (halfZ + gap + row * height * .5);
      const inkAnchor: Coordinate = [x, z];
      const anchor: Coordinate = [x - Math.cos(angle) * offsetX + Math.sin(angle) * offsetZ,
        z - Math.sin(angle) * offsetX - Math.cos(angle) * offsetZ];
      const footprint = orientationFootprint(anchor, width, height, angle);
      const inkFootprint = orientationFootprint(inkAnchor, inkWidth, inkHeight, angle);
      const box = bounds(inkFootprint);
      const regionSurface: Coordinate[][] = [[[box.minX - gap, box.minZ - gap], [box.maxX + gap, box.minZ - gap],
        [box.maxX + gap, box.maxZ + gap], [box.minX - gap, box.maxZ + gap]]];
      // Include the outline/keyline and a proportional separation in the fit.
      const padded = orientationFootprint(inkAnchor, inkWidth + gap, inkHeight + gap, angle);
      const paddedBounds = bounds(padded);
      const nearby = indexedObstacles.filter(obstacle => boundsOverlap(paddedBounds, obstacle.box)).map(obstacle => obstacle.rings);
      if (fits(padded, regionSurface, nearby)) return { anchor, angle, height, footprint, inkFootprint };
    }
  }
  return null;
}

/** Layout/fit only runs when authorized inventory or atlas text metrics change.
 * Ratios come from the shared atlas once, never from browser layout in motion. */
export function layoutTerritorialOrientation(items: readonly OrientationItem[], entities: readonly MapEntity[],
  aspectRatios: ReadonlyMap<string, number>, presentationObstacles: readonly TerritorialObstacle[] = NO_PRESENTATION_OBSTACLES,
  exteriorBlockObstacles: readonly TerritorialObstacle[] = NO_PRESENTATION_OBSTACLES,
  inkBounds: ReadonlyMap<string, OrientationInkBounds> = new Map()): WorldOrientationLabel[] {
  // Only this immutable layout invocation owns the cache. No stale polygon
  // bounds survive an inventory update, and no work is added to render frames.
  const boundsCache: ObstacleBoundsCache = new WeakMap();
  const fits: FootprintFit = (footprint, surface, obstacles = []) => fitFootprint(footprint, surface, obstacles, boundsCache);
  const inventory = entities.filter(entity => !entity.isArchived && entity.geometry.coordinates.length > 0
    && entity.geometry.coordinates.every(finiteRing))
    .map(entity => ({ entity, box: bounds(entity.geometry.coordinates[0]) }));
  const output: WorldOrientationLabel[] = [];
  const externalObstacles = inventory.filter(({ entity }) => entity.metadata.renderMode !== 'outline'
    && !['QUADRA', 'GREEN_AREA'].includes(entity.classification)).map(({ entity }) => entity.geometry.coordinates);
  const extraObstacles = presentationObstacles.filter(rings => rings.length && rings.every(finiteRing));
  const extraObstacleInventory = extraObstacles.map(rings => ({ rings, box: bounds(rings[0]) }));
  const extraExteriorObstacles = exteriorBlockObstacles.filter(rings => rings.length && rings.every(finiteRing));
  const alignments = roadAlignmentReferences(items, aspectRatios, [
    ...inventory.filter(({ entity }) => entity.metadata.renderMode !== 'outline'
      && (!NON_OBSTACLES.has(entity.classification) || ['ROAD', 'PEDESTRIAN_PATH'].includes(entity.classification)))
      .map(({ entity, box }) => ({ rings: entity.geometry.coordinates, box,
        canonicalRoadId: ['ROAD', 'PEDESTRIAN_PATH'].includes(entity.classification) ? canonicalTerritorialRoadId(entity) : undefined })),
    ...extraObstacleInventory,
  ], inkBounds, fits);
  for (const item of items) {
    const rings = item.outline;
    if (!rings?.length || !rings.every(finiteRing)) continue;
    const box = bounds(rings[0]);
    const nearby = inventory.filter(({ box: other }) => other.minX < box.maxX && other.maxX > box.minX
      && other.minZ < box.maxZ && other.maxZ > box.minZ).map(({ entity }) => entity);
    const obstacleEntities = nearby.filter(entity => entity.metadata.renderMode !== 'outline' && !NON_OBSTACLES.has(entity.classification)
      && (item.kind === 'road' || !['SELLABLE_LOT', 'INTERNAL_STAND'].includes(entity.classification)));
    const crossingRoads = item.kind === 'road' ? nearby.filter(entity => ['ROAD', 'PEDESTRIAN_PATH'].includes(entity.classification)
      && canonicalTerritorialRoadId(entity) !== item.canonicalRoadId).map(entity => entity.geometry.coordinates) : [];
    const obstacles = [...obstacleEntities.map(entity => entity.geometry.coordinates), ...crossingRoads,
      ...extraObstacleInventory.filter(obstacle => boundsOverlap(box, obstacle.box)).map(obstacle => obstacle.rings),
      ...output.filter(label => label.kind === item.kind).map(label => [label.inkFootprint ?? label.footprint])];
    const alignment = alignments.get(item.id);
    const anchors: Coordinate[] = [];
    if (alignment) {
      const low = alignment.axis === 0 ? box.minX : box.minZ, high = alignment.axis === 0 ? box.maxX : box.maxZ;
      const across = alignment.axis === 0 ? box.minZ + (box.maxZ - box.minZ) * alignment.fraction
        : box.minX + (box.maxX - box.minX) * alignment.fraction;
      // Closest legal point to the common reference, always on this road.
      const points = Array.from({ length: 49 }, (_, i) => low + (high - low) * i / 48);
      points.unshift(alignment.position);
      points.sort((a, b) => Math.abs(a - alignment.position) - Math.abs(b - alignment.position));
      for (const value of points) anchors.push(alignment.axis === 0 ? [value, across] : [across, value]);
    }
    anchors.push(item.anchor);
    function* candidateAnchors() {
      yield* anchors;
      // Preserve candidate order, but defer these clearance searches until a
      // label actually needs a fallback. Most roads fit the common reference.
      const obstacleOutlines = obstacles.map(outline => outline[0]);
      for (const x of [.25, .5, .75]) for (const z of [.25, .5, .75]) {
        const point: Coordinate = [box.minX + (box.maxX - box.minX) * x, box.minZ + (box.maxZ - box.minZ) * z];
        if (lotPointClearance(point, rings, obstacleOutlines) > .02) yield point;
      }
    }
    const ratio = aspectRatios.get(item.id) ?? item.name.length * .48;
    // Ink fitting changes positioning, never inflates a narrow street's font.
    const roadSpan = item.kind === 'road' ? corridorSpan(item.anchor, localRoadLabelAngle(item.anchor, rings) + Math.PI / 2, rings) : Infinity;
    const preferredHeight = item.subdued ? .14 : item.kind === 'road' ? Math.min(.82, roadSpan * .998) : item.kind === 'block' ? 2.05 : 2.35;
    let placement: { anchor: Coordinate; angle: number; height: number; footprint: Coordinate[]; inkFootprint?: Coordinate[] } | null = item.exteriorBlock ? exteriorBlockPlacement(item, ratio, preferredHeight,
      [...externalObstacles, ...extraObstacles, ...extraExteriorObstacles,
        ...output.filter(label => label.kind === 'block').map(label => [label.inkFootprint ?? label.footprint])], fits, inkBounds.get(item.id)) : null;
    for (const anchor of item.exteriorBlock ? [] : candidateAnchors()) {
      const angle = item.kind === 'road' ? localRoadLabelAngle(anchor, rings) : stableAxis(...item.edge);
      let low = 0, high = preferredHeight;
      for (let step = 0; step < 12; step++) {
        const height = (low + high) / 2;
        const ink = item.kind === 'road' ? inkBounds.get(item.id) : undefined;
        if (fits(textInkFootprint(anchor, height * ratio, height, angle, ink), rings, obstacles)) low = height;
        else high = height;
      }
      if (!placement || low > placement.height + .001) {
        placement = { anchor, angle, height: low, footprint: orientationFootprint(anchor, low * ratio, low, angle),
          inkFootprint: item.kind === 'road' ? textInkFootprint(anchor, low * ratio, low, angle, inkBounds.get(item.id)) : undefined };
      }
      if (low >= preferredHeight * .998) break;
    }
    if (!placement || placement.height < (item.subdued ? .10 : item.kind === 'road' ? .18 : .35)) continue;
    const surfaceEntities = nearby.filter(entity => ['SELLABLE_LOT', 'INTERNAL_STAND', 'QUADRA'].includes(entity.classification));
    const elevation = item.kind === 'road' || item.exteriorBlock ? item.elevation : Math.max(item.elevation,
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
