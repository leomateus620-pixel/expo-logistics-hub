/** X/Z presentation coordinates. Source plans retain their own pixel frame. */
export type ParkingPoint = readonly [number, number];
export type ParkingPolygon = readonly ParkingPoint[];
export interface ParkingBounds { minX: number; maxX: number; minZ: number; maxZ: number }
export const PARKING_SPATIAL_EPSILON = 1e-6;

export function openParkingPolygon(polygon: ParkingPolygon): ParkingPolygon {
  const points = polygon.filter((point, i) => i === 0
    || Math.hypot(point[0] - polygon[i - 1][0], point[1] - polygon[i - 1][1]) > PARKING_SPATIAL_EPSILON);
  if (points.length > 1 && Math.hypot(points[0][0] - points[points.length - 1][0],
    points[0][1] - points[points.length - 1][1]) <= PARKING_SPATIAL_EPSILON) return points.slice(0, -1);
  return points;
}

export function parkingPolygonArea(polygon: ParkingPolygon) {
  return Math.abs(polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0)) / 2;
}

export function parkingBounds(points: ParkingPolygon, padding = 0): ParkingBounds {
  if (!points.length) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  return {
    minX: Math.min(...points.map((point) => point[0])) - padding,
    maxX: Math.max(...points.map((point) => point[0])) + padding,
    minZ: Math.min(...points.map((point) => point[1])) - padding,
    maxZ: Math.max(...points.map((point) => point[1])) + padding,
  };
}

export function parkingBoundsCenter(bounds: ParkingBounds): ParkingPoint {
  return [(bounds.minX + bounds.maxX) / 2, (bounds.minZ + bounds.maxZ) / 2];
}

export function parkingBoundsPolygon(bounds: ParkingBounds): ParkingPolygon {
  return [[bounds.minX, bounds.minZ], [bounds.maxX, bounds.minZ],
    [bounds.maxX, bounds.maxZ], [bounds.minX, bounds.maxZ]];
}

/** Offset a measured circulation centerline; miter limit prevents corner spikes. */
export function parkingCorridorPolygon(points: ParkingPolygon, width: number): ParkingPolygon {
  const line = openParkingPolygon(points);
  if (line.length < 2 || width <= 0) return [];
  const offset = (index: number, side: number): ParkingPoint => {
    const previous = line[Math.max(0, index - 1)];
    const point = line[index];
    const next = line[Math.min(line.length - 1, index + 1)];
    const normal = (a: ParkingPoint, b: ParkingPoint): ParkingPoint => {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
    };
    const before = normal(index === 0 ? point : previous, index === 0 ? next : point);
    const after = normal(index === line.length - 1 ? previous : point, index === line.length - 1 ? point : next);
    const length = Math.hypot(before[0] + after[0], before[1] + after[1]) || 1;
    const nx = (before[0] + after[0]) / length;
    const nz = (before[1] + after[1]) / length;
    const distance = Math.min(width * 0.8, width / (2 * Math.max(0.3, nx * after[0] + nz * after[1])));
    return [point[0] + nx * distance * side, point[1] + nz * distance * side];
  };
  return [...line.map((_, i) => offset(i, 1)), ...line.map((_, i) => offset(i, -1)).reverse()];
}

/** Inclusive at the boundary, so shared stall separators have deterministic hits. */
export function parkingContainsPoint(point: ParkingPoint, polygon: ParkingPolygon, epsilon = PARKING_SPATIAL_EPSILON) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[j];
    const b = polygon[i];
    if (parkingPointSegmentDistance(point, a, b) <= epsilon) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function parkingPointSegmentDistance(point: ParkingPoint, a: ParkingPoint, b: ParkingPoint) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / lengthSquared));
  return Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dz);
}

export function parkingDistanceToPolygon(point: ParkingPoint, polygon: ParkingPolygon) {
  if (parkingContainsPoint(point, polygon)) return 0;
  return Math.min(...polygon.map((a, i) => parkingPointSegmentDistance(point, a, polygon[(i + 1) % polygon.length])));
}

/** Hull is for selection/soil envelopes only; it never replaces individual traced stalls. */
export function parkingConvexHull(points: ParkingPolygon): ParkingPolygon {
  const sorted = [...new Map(points.map((p) => [`${p[0]},${p[1]}`, p])).values()]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length <= 2) return sorted;
  const cross = (a: ParkingPoint, b: ParkingPoint, c: ParkingPoint) => (
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  );
  const lower: ParkingPoint[] = [];
  const upper: ParkingPoint[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Uniform spatial hash: picking visits nearby cells, not every stall in the park. */
export function createParkingSpatialIndex<T extends { id: string; polygon: ParkingPolygon }>(
  items: readonly T[],
  cellSize = 1.5,
) {
  const cells = new Map<string, T[]>();
  for (const item of items) {
    const bounds = parkingBounds(item.polygon, PARKING_SPATIAL_EPSILON);
    for (let x = Math.floor(bounds.minX / cellSize); x <= Math.floor(bounds.maxX / cellSize); x += 1) {
      for (let z = Math.floor(bounds.minZ / cellSize); z <= Math.floor(bounds.maxZ / cellSize); z += 1) {
        const key = `${x}:${z}`;
        const cell = cells.get(key) ?? [];
        cell.push(item);
        cells.set(key, cell);
      }
    }
  }
  return {
    cellCount: cells.size,
    candidates(point: ParkingPoint) {
      const nearby = cells.get(`${Math.floor(point[0] / cellSize)}:${Math.floor(point[1] / cellSize)}`) ?? [];
      return nearby.filter((item) => parkingContainsPoint(point, item.polygon));
    },
    pick(point: ParkingPoint) {
      const nearby = cells.get(`${Math.floor(point[0] / cellSize)}:${Math.floor(point[1] / cellSize)}`) ?? [];
      return nearby.find((item) => parkingContainsPoint(point, item.polygon)) ?? null;
    },
  };
}
