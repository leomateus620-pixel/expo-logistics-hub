import polygonClipping from 'polygon-clipping';
import { OFFICIAL_2026_CARTOGRAPHIC_LOT_GAP } from '../data/officialReference2026';
import type { Coordinate, MapEntity } from '../types';
import { lotPresentationTop } from '../utils/externalLotPresentation';
import { isSelfIntersecting, polygonAreaMapUnits, withoutClosingPoint } from '../utils/geometry';
import { lotPointClearance, safeLotAnchor } from '../utils/soldLotPresentation';
import { localRoadLabelAngle, orientationFootprint } from '../utils/territorialOrientation';

export interface PublicSoldCompanyGroupInput {
  key: string;
  tradeName: string | null;
  entityIds: readonly string[];
}

type ComponentRings = Coordinate[][];
type Edge = { start: Coordinate; end: Coordinate };
type SourcePolygon = {
  rings: ComponentRings;
  area: number;
  elevation: number;
  anchor: Coordinate;
  edges: Edge[];
};
type ParcelSource = { entity: MapEntity; polygon: SourcePolygon };
type FitCandidate = { anchor: Coordinate; angle: number; edges: Edge[] };

export interface PublicSoldCompanyComponent {
  rings: ComponentRings;
  area: number;
  elevation: number;
  hasCartographicSeams: boolean;
  fitCandidates: readonly FitCandidate[];
  members: readonly SourcePolygon[];
}

export interface PublicSoldCompanyGeometry extends PublicSoldCompanyGroupInput {
  components: readonly PublicSoldCompanyComponent[];
  /** Pairs of XYZ points for the union boundary, including cadastral holes. */
  contourPositions: readonly number[];
}

export interface PublicCompanyFootprint {
  footprint: Coordinate[];
  anchor: Coordinate;
  angle: number;
  width: number;
  height: number;
  elevation: number;
  componentIndex: number;
}

// Keep the thin decoration above the existing selection lift and turf shoulder.
const CONTOUR_OFFSET = .072;
const LABEL_OFFSET = .082;
// Absorb only projection rounding, several orders smaller than the inset itself.
const SEAM_EPSILON = 1e-7;
const sourcePolygons = new WeakMap<MapEntity['geometry'], SourcePolygon | null>();

function edgesOf(rings: ComponentRings): Edge[] {
  return rings.flatMap(ring => ring.map((start, index) => ({ start, end: ring[(index + 1) % ring.length] })));
}

function boundsOf(ring: Coordinate[]) {
  const xs = ring.map(point => point[0]);
  const zs = ring.map(point => point[1]);
  return { minX: Math.min(...xs), minZ: Math.min(...zs), maxX: Math.max(...xs), maxZ: Math.max(...zs) };
}

function sourcePolygon(entity: MapEntity): SourcePolygon | null {
  if (sourcePolygons.has(entity.geometry)) return sourcePolygons.get(entity.geometry) ?? null;
  const elevation = lotPresentationTop(entity);
  const rings = entity.geometry.coordinates.map(ring => withoutClosingPoint(ring).filter((point, index, points) =>
    !index || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1]));
  const valid = Number.isFinite(elevation) && rings.length && rings.every(ring => ring.length >= 3
    && ring.every(point => point.length === 2 && point.every(Number.isFinite)) && !isSelfIntersecting(ring));
  const area = valid ? polygonAreaMapUnits({ coordinates: rings }) : 0;
  const anchor = area > 0 ? safeLotAnchor(rings) : null;
  const polygon = anchor ? { rings, area, elevation, anchor: anchor.point, edges: edgesOf(rings) } : null;
  sourcePolygons.set(entity.geometry, polygon);
  return polygon;
}

type ParcelBounds = ReturnType<typeof boundsOf>;

function gridRectangle({ entity, polygon }: ParcelSource): ParcelBounds | null {
  if (!entity.parentEntityId || entity.metadata?.cartographicAreaOnly !== true || polygon.rings.length !== 1) return null;
  const ring = polygon.rings[0];
  if (ring.length !== 4) return null;
  const bounds = boundsOf(ring);
  const { minX, minZ, maxX, maxZ } = bounds;
  return ring.every(([x, z]) => (x === minX || x === maxX) && (z === minZ || z === maxZ)) ? bounds : null;
}

function closeFacingSides(a: ParcelBounds, b: ParcelBounds, nextA: ParcelBounds, nextB: ParcelBounds,
  min: keyof ParcelBounds, max: keyof ParcelBounds, transverseMin: keyof ParcelBounds, transverseMax: keyof ParcelBounds, gap: number) {
  if (Math.abs(a[transverseMin] - b[transverseMin]) > SEAM_EPSILON || Math.abs(a[transverseMax] - b[transverseMax]) > SEAM_EPSILON) return;
  if (Math.abs(b[min] - a[max] - gap) <= SEAM_EPSILON) {
    nextA[max] = nextB[min] = (a[max] + b[min]) / 2;
  } else if (Math.abs(a[min] - b[max] - gap) <= SEAM_EPSILON) {
    nextB[max] = nextA[min] = (b[max] + a[min]) / 2;
  }
}

/** Undo only the documented grid inset between two co-owned, fully facing
 * sides. All comparisons use the original parcels, so extensions never make
 * a new neighbor eligible. Keep the corrected rings local to the decoration. */
function closeCartographicSeams(sources: readonly ParcelSource[]): SourcePolygon[] {
  const rectangles = sources.flatMap((source, index) => {
    const bounds = gridRectangle(source);
    return bounds ? [{ index, entity: source.entity, bounds, expanded: { ...bounds } }] : [];
  });
  for (const [index, a] of rectangles.entries()) {
    for (let next = index + 1; next < rectangles.length; next++) {
      const b = rectangles[next];
      if (a.entity.parentEntityId !== b.entity.parentEntityId || a.entity.projectId !== b.entity.projectId) continue;
      closeFacingSides(a.bounds, b.bounds, a.expanded, b.expanded, 'minX', 'maxX', 'minZ', 'maxZ', OFFICIAL_2026_CARTOGRAPHIC_LOT_GAP.x);
      closeFacingSides(a.bounds, b.bounds, a.expanded, b.expanded, 'minZ', 'maxZ', 'minX', 'maxX', OFFICIAL_2026_CARTOGRAPHIC_LOT_GAP.z);
    }
  }
  const polygons = sources.map(source => source.polygon);
  for (const { index, bounds, expanded } of rectangles) {
    const { minX, minZ, maxX, maxZ } = expanded;
    if (minX === bounds.minX && minZ === bounds.minZ && maxX === bounds.maxX && maxZ === bounds.maxZ) continue;
    const rings: ComponentRings = [[[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]]];
    polygons[index] = { ...polygons[index], rings, area: (maxX - minX) * (maxZ - minZ), edges: edgesOf(rings) };
  }
  return polygons;
}

function localPoint(point: Coordinate, center: Coordinate, cos: number, sin: number): Coordinate {
  const x = point[0] - center[0];
  const z = point[1] - center[1];
  return [x * cos + z * sin, -x * sin + z * cos];
}

function localEdges(edges: readonly Edge[], center: Coordinate, angle: number): Edge[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return edges.map(({ start, end }) => ({ start: localPoint(start, center, cos, sin), end: localPoint(end, center, cos, sin) }));
}

/** An inclusive slab test catches tangencies, including a hole entirely inside the text box. */
function edgeEntersBox({ start, end }: Edge, halfWidth: number, halfHeight: number) {
  let enter = 0, leave = 1;
  for (let axis = 0; axis < 2; axis++) {
    const half = axis === 0 ? halfWidth : halfHeight;
    const coordinate = start[axis], delta = end[axis] - coordinate;
    if (delta === 0) {
      if (Math.abs(coordinate) > half) return false;
      continue;
    }
    const first = (-half - coordinate) / delta, last = (half - coordinate) / delta;
    enter = Math.max(enter, Math.min(first, last));
    leave = Math.min(leave, Math.max(first, last));
    if (enter > leave) return false;
  }
  return true;
}

function componentCandidates(rings: ComponentRings, members: readonly SourcePolygon[]): FitCandidate[] {
  const edges = edgesOf(rings);
  const { minX, minZ, maxX, maxZ } = boundsOf(rings[0]);
  const center: Coordinate = [(minX + maxX) / 2, (minZ + maxZ) / 2];
  const safeAnchor = safeLotAnchor(rings);
  const anchors: Coordinate[] = [];
  const candidates = [
    center,
    ...(safeAnchor ? [safeAnchor.point] : []),
    ...members.slice(0, 4).map(member => member.anchor),
    ...[.25, .5, .75].flatMap(x => [.25, .5, .75].map<Coordinate>(z => [minX + (maxX - minX) * x, minZ + (maxZ - minZ) * z])),
  ];
  for (const point of candidates) {
    if (!anchors.some(existing => Math.hypot(existing[0] - point[0], existing[1] - point[1]) < .02)
      && lotPointClearance(point, rings) > 0) anchors.push(point);
  }
  return anchors.flatMap(point => {
    const alignment = localRoadLabelAngle(point, rings);
    const angles = [0, alignment, alignment + Math.PI / 2];
    return angles.filter((angle, index) => !angles.slice(0, index).some(earlier => Math.abs(Math.sin(angle - earlier)) < .04))
      .map(angle => ({ anchor: point, angle, edges: localEdges(edges, point, angle) }));
  });
}

function pushContour(positions: number[], rings: ComponentRings, members: readonly SourcePolygon[], elevation: number) {
  for (const { start, end } of edgesOf(rings)) {
    const put = (a: Coordinate, b: Coordinate, top: number) => positions.push(a[0], top + CONTOUR_OFFSET, a[1], b[0], top + CONTOUR_OFFSET, b[1]);
    // A union can coalesce collinear parcel edges at different heights. Split
    // that boundary at original endpoints and keep each segment on its lot.
    if (members.every(member => member.elevation === elevation)) {
      put(start, end, elevation);
      continue;
    }
    const dx = end[0] - start[0], dz = end[1] - start[1];
    const length = Math.hypot(dx, dz);
    const spans = members.flatMap(member => member.edges.flatMap(edge => {
      const distance = (point: Coordinate) => ((point[0] - start[0]) * dz - (point[1] - start[1]) * dx) / length;
      if (Math.abs(distance(edge.start)) > 1e-7 || Math.abs(distance(edge.end)) > 1e-7) return [];
      const project = (point: Coordinate) => ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / (length * length);
      const a = project(edge.start), b = project(edge.end);
      const from = Math.max(0, Math.min(a, b)), to = Math.min(1, Math.max(a, b));
      return from < to ? [{ from, to, elevation: member.elevation }] : [];
    }));
    const breaks = [...new Set([0, 1, ...spans.flatMap(span => [span.from, span.to])])].sort((a, b) => a - b);
    const point = (t: number): Coordinate => [start[0] + dx * t, start[1] + dz * t];
    for (let index = 1; index < breaks.length; index++) {
      const from = breaks[index - 1], to = breaks[index], middle = (from + to) / 2;
      const owners = spans.filter(span => span.from <= middle && span.to >= middle);
      put(point(from), point(to), owners.length ? Math.max(...owners.map(owner => owner.elevation)) : elevation);
    }
  }
}

/** Identity and scope arrive from the authorized inventory. Geometry only
 * determines which cadastral edges are still exposed and where text can fit. */
export function preparePublicSoldCompanyGeometry(groups: readonly PublicSoldCompanyGroupInput[], entities: readonly MapEntity[]): PublicSoldCompanyGeometry[] {
  if (!groups.length) return [];
  const byId = new Map(entities.map(entity => [entity.id, entity]));
  return groups.flatMap(group => {
    const sources = [...new Set(group.entityIds)].sort().flatMap(id => {
      const entity = byId.get(id);
      const polygon = entity && sourcePolygon(entity);
      return entity && polygon ? [{ entity, polygon }] : [];
    });
    if (!sources.length) return [];
    const polygons = closeCartographicSeams(sources);
    const adjustedPolygons = new Set(polygons.filter((polygon, index) => polygon !== sources[index].polygon));
    let boundary: ComponentRings[];
    try {
      const [first, ...rest] = polygons.map(polygon => polygon.rings);
      boundary = polygonClipping.union(first, ...rest);
    } catch {
      // Leave the ordinary parcel presentation in place after a clipping failure.
      return [];
    }
    if (!boundary.length) return [];
    const contourPositions: number[] = [];
    const components: PublicSoldCompanyComponent[] = boundary.map(closedRings => {
      const rings = closedRings.map(withoutClosingPoint);
      const members = polygons.filter(polygon => lotPointClearance(polygon.anchor, rings) > 0)
        .sort((a, b) => b.area - a.area);
      const elevation = Math.max(...(members.length ? members : polygons).map(polygon => polygon.elevation));
      pushContour(contourPositions, rings, members, elevation);
      return { rings, members, elevation, area: polygonAreaMapUnits({ coordinates: rings }),
        hasCartographicSeams: members.some(member => adjustedPolygons.has(member)),
        fitCandidates: group.tradeName ? componentCandidates(rings, members) : [] };
    }).sort((a, b) => b.area - a.area);
    return [{ ...group, entityIds: sources.map(source => source.entity.id), components, contourPositions }];
  });
}

/** Choose one internal box whose padding also fits; the center alone cannot
 * prove containment in a concavity. All work is independent of camera pose. */
export function fitPublicCompanyFootprint(group: PublicSoldCompanyGeometry, aspectRatio: number): PublicCompanyFootprint | null {
  if (!group.tradeName || !Number.isFinite(aspectRatio) || aspectRatio <= 0) return null;
  let result: PublicCompanyFootprint | null = null;
  let bestScore = 0;
  for (const [componentIndex, component] of group.components.entries()) {
    const preferredHeight = Math.min(5.5, Math.sqrt(component.area) * .56);
    const margin = Math.min(.22, preferredHeight * .12);
    const turnedWeight = component.hasCartographicSeams ? .65 : .78;
    for (const candidate of component.fitCandidates) {
      const fits = (height: number) => !candidate.edges.some(edge => edgeEntersBox(edge, height * aspectRatio / 2 + margin, height / 2 + margin));
      let lower = 0, upper = preferredHeight;
      if (fits(upper)) lower = upper;
      else for (let step = 0; step < 12; step++) {
        const height = (lower + upper) / 2;
        if (fits(height)) lower = height;
        else upper = height;
      }
      const { anchor, angle } = candidate;
      // World X is preferable for label orientation when the loss in type
      // size is small. A narrow parcel still uses its fitting long axis.
      const score = lower * (turnedWeight + (1 - turnedWeight) * Math.abs(Math.cos(angle)));
      if (lower < .05 || score <= bestScore + .001) continue;
      bestScore = score;
      const width = lower * aspectRatio;
      const footprint = orientationFootprint(anchor, width, lower, angle);
      const supportingLots = component.members.filter(member => lotPointClearance(anchor, member.rings) >= 0
        || localEdges(member.edges, anchor, angle).some(edge => edgeEntersBox(edge, width / 2, lower / 2)));
      const top = supportingLots.length ? Math.max(...supportingLots.map(member => member.elevation)) : component.elevation;
      result = { footprint, anchor, angle, width, height: lower, elevation: top + LABEL_OFFSET, componentIndex };
    }
  }
  return result;
}
