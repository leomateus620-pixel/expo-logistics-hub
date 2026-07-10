import type { Coordinate, GeometryValidationResult, MapCalibration, PolygonGeometry } from '../types';

const EPSILON = 1e-8;

export function withoutClosingPoint(ring: Coordinate[]): Coordinate[] {
  if (ring.length > 1) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (Math.abs(first[0] - last[0]) < EPSILON && Math.abs(first[1] - last[1]) < EPSILON) {
      return ring.slice(0, -1);
    }
  }
  return [...ring];
}

export function closeRing(ring: Coordinate[]): Coordinate[] {
  const points = withoutClosingPoint(ring);
  if (points.length === 0) return [];
  return [...points, [...points[0]] as Coordinate];
}

export function polygonAreaMapUnits(geometry: Pick<PolygonGeometry, 'coordinates'>): number {
  const ringArea = (ring: Coordinate[]) => {
    const points = withoutClosingPoint(ring);
    if (points.length < 3) return 0;
    return Math.abs(points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0)) / 2;
  };

  const [outer, ...holes] = geometry.coordinates;
  return Math.max(0, ringArea(outer ?? []) - holes.reduce((sum, hole) => sum + ringArea(hole), 0));
}

export function calibratedAreaSqm(areaMapUnits: number, calibration: MapCalibration | null): number | null {
  if (!calibration || calibration.status !== 'VALIDATED' || !calibration.mapUnitsPerMeter || calibration.mapUnitsPerMeter <= 0) {
    return null;
  }
  return areaMapUnits / (calibration.mapUnitsPerMeter ** 2);
}

export function calibrationScale(pointA: Coordinate, pointB: Coordinate, knownDistanceMeters: number): number | null {
  if (!Number.isFinite(knownDistanceMeters) || knownDistanceMeters <= 0) return null;
  const mapDistance = Math.hypot(pointB[0] - pointA[0], pointB[1] - pointA[1]);
  if (mapDistance <= EPSILON) return null;
  return mapDistance / knownDistanceMeters;
}

function orientation(a: Coordinate, b: Coordinate, c: Coordinate): number {
  return (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
}

function pointOnSegment(a: Coordinate, b: Coordinate, c: Coordinate): boolean {
  return b[0] <= Math.max(a[0], c[0]) + EPSILON && b[0] + EPSILON >= Math.min(a[0], c[0])
    && b[1] <= Math.max(a[1], c[1]) + EPSILON && b[1] + EPSILON >= Math.min(a[1], c[1]);
}

export function segmentsIntersect(a: Coordinate, b: Coordinate, c: Coordinate, d: Coordinate): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if ((o1 > EPSILON && o2 < -EPSILON || o1 < -EPSILON && o2 > EPSILON)
    && (o3 > EPSILON && o4 < -EPSILON || o3 < -EPSILON && o4 > EPSILON)) return true;
  if (Math.abs(o1) <= EPSILON && pointOnSegment(a, c, b)) return true;
  if (Math.abs(o2) <= EPSILON && pointOnSegment(a, d, b)) return true;
  if (Math.abs(o3) <= EPSILON && pointOnSegment(c, a, d)) return true;
  if (Math.abs(o4) <= EPSILON && pointOnSegment(c, b, d)) return true;
  return false;
}

export function isSelfIntersecting(ring: Coordinate[]): boolean {
  const points = withoutClosingPoint(ring);
  if (points.length < 4) return false;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    for (let j = i + 1; j < points.length; j += 1) {
      const adjacent = j === i || j === (i + 1) % points.length || (j + 1) % points.length === i;
      if (adjacent) continue;
      const c = points[j];
      const d = points[(j + 1) % points.length];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

export function validateGeometry(geometry: PolygonGeometry): GeometryValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const outer = geometry.coordinates?.[0] ?? [];
  const points = withoutClosingPoint(outer);
  if (geometry.type !== 'Polygon') errors.push('A geometria precisa ser um polígono.');
  if (points.length < 3) errors.push('O polígono precisa ter pelo menos três vértices.');
  if (points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) errors.push('Há coordenadas inválidas.');
  if (isSelfIntersecting(outer)) errors.push('O polígono possui auto-interseção.');
  if (geometry.extrusionHeight < 0 || geometry.elevation < 0) errors.push('Elevação e altura não podem ser negativas.');

  const areaMapUnits = polygonAreaMapUnits(geometry);
  if (areaMapUnits <= EPSILON) errors.push('O polígono não possui área válida.');
  if (!geometry.calibrationVersion) warnings.push('Geometria não calibrada: a área calculada não é uma medida oficial.');
  return { valid: errors.length === 0, errors, warnings, areaMapUnits };
}

export function geometryCentroid(geometry: Pick<PolygonGeometry, 'coordinates'>): Coordinate {
  const points = withoutClosingPoint(geometry.coordinates[0] ?? []);
  if (points.length === 0) return [0, 0];
  const total = points.reduce<Coordinate>((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0]);
  return [total[0] / points.length, total[1] / points.length];
}

export function translateGeometry(geometry: PolygonGeometry, dx: number, dy: number): PolygonGeometry {
  return {
    ...geometry,
    coordinates: geometry.coordinates.map((ring) => ring.map(([x, y]) => [x + dx, y + dy] as Coordinate)),
  };
}

export function updateVertex(geometry: PolygonGeometry, vertexIndex: number, coordinate: Coordinate): PolygonGeometry {
  const points = withoutClosingPoint(geometry.coordinates[0] ?? []);
  if (!points[vertexIndex]) return geometry;
  points[vertexIndex] = coordinate;
  return { ...geometry, coordinates: [closeRing(points), ...geometry.coordinates.slice(1)] };
}

export function addVertex(geometry: PolygonGeometry, afterIndex: number, coordinate: Coordinate): PolygonGeometry {
  const points = withoutClosingPoint(geometry.coordinates[0] ?? []);
  points.splice(afterIndex + 1, 0, coordinate);
  return { ...geometry, coordinates: [closeRing(points), ...geometry.coordinates.slice(1)] };
}

export function removeVertex(geometry: PolygonGeometry, vertexIndex: number): PolygonGeometry {
  const points = withoutClosingPoint(geometry.coordinates[0] ?? []);
  if (points.length <= 3) return geometry;
  points.splice(vertexIndex, 1);
  return { ...geometry, coordinates: [closeRing(points), ...geometry.coordinates.slice(1)] };
}

export function nearestSegmentIndex(ring: Coordinate[], coordinate: Coordinate): number {
  const points = withoutClosingPoint(ring);
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const dx = next[0] - point[0];
    const dy = next[1] - point[1];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((coordinate[0] - point[0]) * dx + (coordinate[1] - point[1]) * dy) / lengthSquared));
    const px = point[0] + t * dx;
    const py = point[1] + t * dy;
    const distance = Math.hypot(coordinate[0] - px, coordinate[1] - py);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

export function calculateAskingPrice(params: {
  pricingMode: string;
  fixedTotal?: number | null;
  pricePerSqm?: number | null;
  officialAreaSqm?: number | null;
  areaValidationStatus?: string | null;
}): { value: number | null; warning: string | null } {
  if (params.pricingMode === 'FIXED_TOTAL') {
    if (params.fixedTotal === null || params.fixedTotal === undefined || !Number.isFinite(params.fixedTotal) || params.fixedTotal < 0) {
      return { value: null, warning: 'Informe um valor total válido para disponibilizar o lote.' };
    }
    return { value: params.fixedTotal, warning: null };
  }
  if (params.pricingMode !== 'PRICE_PER_SQUARE_METER') return { value: null, warning: null };
  if (params.areaValidationStatus !== 'VALIDATED' || !params.officialAreaSqm || params.officialAreaSqm <= 0) {
    return { value: null, warning: 'Valide a área oficial antes de calcular o preço por metro quadrado.' };
  }
  if (params.pricePerSqm === null || params.pricePerSqm === undefined || !Number.isFinite(params.pricePerSqm) || params.pricePerSqm < 0) {
    return { value: null, warning: 'Informe um preço por metro quadrado válido.' };
  }
  return { value: params.officialAreaSqm * params.pricePerSqm, warning: null };
}

export function canTransitionLotStatus(from: string, to: string): boolean {
  if (from === to) return true;
  const transitions: Record<string, string[]> = {
    AVAILABLE: ['RESERVED', 'IN_NEGOTIATION', 'BLOCKED', 'UNAVAILABLE'],
    RESERVED: ['AVAILABLE', 'IN_NEGOTIATION', 'SOLD', 'BLOCKED'],
    IN_NEGOTIATION: ['AVAILABLE', 'RESERVED', 'SOLD', 'BLOCKED'],
    SOLD: [],
    BLOCKED: ['AVAILABLE', 'UNAVAILABLE'],
    UNAVAILABLE: ['AVAILABLE', 'BLOCKED'],
  };
  return transitions[from]?.includes(to) ?? false;
}

function signedLineDistance(point: Coordinate, lineA: Coordinate, lineB: Coordinate) {
  return (lineB[0] - lineA[0]) * (point[1] - lineA[1]) - (lineB[1] - lineA[1]) * (point[0] - lineA[0]);
}

function clipRingByLine(ring: Coordinate[], lineA: Coordinate, lineB: Coordinate, keepPositive: boolean): Coordinate[] {
  const points = withoutClosingPoint(ring);
  const result: Coordinate[] = [];
  const inside = (distance: number) => keepPositive ? distance >= -EPSILON : distance <= EPSILON;
  points.forEach((current, index) => {
    const next = points[(index + 1) % points.length];
    const currentDistance = signedLineDistance(current, lineA, lineB);
    const nextDistance = signedLineDistance(next, lineA, lineB);
    const currentInside = inside(currentDistance);
    const nextInside = inside(nextDistance);
    if (currentInside) result.push(current);
    if (currentInside !== nextInside) {
      const denominator = currentDistance - nextDistance;
      if (Math.abs(denominator) > EPSILON) {
        const t = currentDistance / denominator;
        result.push([
          current[0] + (next[0] - current[0]) * t,
          current[1] + (next[1] - current[1]) * t,
        ]);
      }
    }
  });
  return closeRing(result);
}

/** Splits a simple polygon with an infinite cutting line for preview/validation. */
export function splitPolygonByLine(geometry: PolygonGeometry, lineA: Coordinate, lineB: Coordinate): [PolygonGeometry, PolygonGeometry] | null {
  if (Math.hypot(lineB[0] - lineA[0], lineB[1] - lineA[1]) <= EPSILON) return null;
  const positive = clipRingByLine(geometry.coordinates[0], lineA, lineB, true);
  const negative = clipRingByLine(geometry.coordinates[0], lineA, lineB, false);
  if (withoutClosingPoint(positive).length < 3 || withoutClosingPoint(negative).length < 3) return null;
  const first = { ...geometry, id: null, coordinates: [positive], geometryVersion: 1 };
  const second = { ...geometry, id: null, coordinates: [negative], geometryVersion: 1 };
  if (!validateGeometry(first).valid || !validateGeometry(second).valid) return null;
  return [first, second];
}

export function polygonsShareBoundary(first: PolygonGeometry, second: PolygonGeometry): boolean {
  const a = withoutClosingPoint(first.coordinates[0] ?? []);
  const b = withoutClosingPoint(second.coordinates[0] ?? []);
  const same = (p: Coordinate, q: Coordinate) => Math.abs(p[0] - q[0]) <= EPSILON && Math.abs(p[1] - q[1]) <= EPSILON;
  for (let i = 0; i < a.length; i += 1) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j += 1) {
      const b1 = b[j];
      const b2 = b[(j + 1) % b.length];
      if ((same(a1, b2) && same(a2, b1)) || (same(a1, b1) && same(a2, b2))) return true;
    }
  }
  return false;
}

function coordinatesEqual(first: Coordinate, second: Coordinate): boolean {
  return Math.abs(first[0] - second[0]) <= EPSILON && Math.abs(first[1] - second[1]) <= EPSILON;
}

/**
 * Merges two simple polygons that share one or more complete boundary segments.
 * The server repeats this validation with PostGIS before persisting the result.
 */
export function mergeAdjacentPolygons(first: PolygonGeometry, second: PolygonGeometry): PolygonGeometry | null {
  if (!polygonsShareBoundary(first, second)) return null;

  type Edge = { start: Coordinate; end: Coordinate };
  const boundary: Edge[] = [];
  const addEdges = (ring: Coordinate[]) => {
    const points = withoutClosingPoint(ring);
    points.forEach((start, index) => {
      const end = points[(index + 1) % points.length];
      const reverseIndex = boundary.findIndex((edge) => coordinatesEqual(edge.start, end) && coordinatesEqual(edge.end, start));
      if (reverseIndex >= 0) boundary.splice(reverseIndex, 1);
      else boundary.push({ start, end });
    });
  };
  addEdges(first.coordinates[0] ?? []);
  addEdges(second.coordinates[0] ?? []);
  if (boundary.length < 3) return null;

  const remaining = [...boundary];
  const ordered: Coordinate[] = [remaining[0].start, remaining[0].end];
  remaining.shift();
  while (remaining.length) {
    const current = ordered.at(-1)!;
    const nextIndex = remaining.findIndex((edge) => coordinatesEqual(edge.start, current));
    if (nextIndex < 0) return null;
    const [next] = remaining.splice(nextIndex, 1);
    ordered.push(next.end);
  }
  if (!coordinatesEqual(ordered.at(-1)!, ordered[0])) return null;

  const merged: PolygonGeometry = {
    ...first,
    id: null,
    coordinates: [closeRing(ordered)],
    geometryVersion: 1,
    calibrationVersion: first.calibrationVersion === second.calibrationVersion ? first.calibrationVersion : null,
  };
  if (!validateGeometry(merged).valid) return null;
  const sourceArea = polygonAreaMapUnits(first) + polygonAreaMapUnits(second);
  if (Math.abs(polygonAreaMapUnits(merged) - sourceArea) > EPSILON) return null;
  return merged;
}
