import type { CommercialStatus, Coordinate, PolygonGeometry } from '../types';
import { distanceToSegment, pointInPolygon } from './spatialSurface';
import { STATUS_CONFIG } from '../constants';

/** The persisted status is the only source of the sold presentation. */
export function isSoldLot(status: CommercialStatus | null | undefined) {
  return status === 'SOLD';
}

export function soldLotSurfaceColor(status: CommercialStatus | null | undefined) {
  return isSoldLot(status) ? STATUS_CONFIG.SOLD.color : null;
}

export interface SoldLotSurface {
  id: string;
  status: CommercialStatus | null;
  logoUrl?: string | null;
  geometry: Pick<PolygonGeometry, 'coordinates' | 'elevation' | 'extrusionHeight'>;
  /** Optional cadastral-space anchor away from an existing central number. */
  preferredAnchor?: Coordinate;
}

export interface SoldLockPlacement {
  id: string;
  position: [number, number, number];
  scale: number;
  clearance: number;
}

/** Signed clearance respects concavity, cadastral holes and building footprints. */
export function lotPointClearance(point: Coordinate, rings: readonly Coordinate[][], obstacles: readonly Coordinate[][] = []) {
  const inside = pointInPolygon(point, rings[0] ?? [])
    && !rings.slice(1).some(ring => pointInPolygon(point, ring))
    && !obstacles.some(ring => pointInPolygon(point, ring));
  let distance = Infinity;
  for (const ring of [...rings, ...obstacles]) {
    for (let i = 0; i < ring.length; i++) distance = Math.min(distance, distanceToSegment(point, ring[i], ring[(i + 1) % ring.length]));
  }
  return (inside ? 1 : -1) * distance;
}

/** Best-first subdivision finds an interior point even when the centroid is outside.
 * The clearance circle bounds the entire marker, not just its origin. Runs only
 * when cadastral geometry changes, never in the frame loop. */
export function safeLotAnchor(rings: readonly Coordinate[][], obstacles: readonly Coordinate[][] = []) {
  const outer = rings[0];
  if (!outer || outer.length < 3 || [...rings, ...obstacles].some(ring => ring.some(p => !p.every(Number.isFinite)))) return null;
  const xs = outer.map(p => p[0]), zs = outer.map(p => p[1]);
  const minX = Math.min(...xs), minZ = Math.min(...zs);
  const width = Math.max(...xs) - minX, depth = Math.max(...zs) - minZ;
  if (width <= 0 || depth <= 0) return null;
  const tolerance = Math.min(width, depth) / 128;
  const makeCell = (x: number, z: number, half: number) => {
    const distance = lotPointClearance([x, z], rings, obstacles);
    return { x, z, half, distance, max: distance + half * Math.SQRT2 };
  };
  type Cell = ReturnType<typeof makeCell>;
  const heap: Cell[] = [];
  const push = (cell: Cell) => {
    let i = heap.length; heap.push(cell);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent].max >= cell.max) break;
      heap[i] = heap[parent]; i = parent;
    }
    heap[i] = cell;
  };
  const pop = () => {
    const first = heap[0], last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].max > heap[child].max) child++;
        if (last.max >= heap[child].max) break;
        heap[i] = heap[child]; i = child;
      }
      heap[i] = last;
    }
    return first;
  };
  let best = makeCell(minX + width / 2, minZ + depth / 2, 0);
  // Rectangles (the common cadastral case) cannot improve on this clearance.
  if (best.distance >= Math.min(width, depth) / 2 - tolerance) {
    return { point: [best.x, best.z] as Coordinate, clearance: best.distance };
  }
  push(makeCell(best.x, best.z, Math.max(width, depth) / 2));
  while (heap.length) {
    const cell = pop();
    if (cell.distance > best.distance) best = cell;
    if (cell.max - best.distance <= tolerance) continue;
    const half = cell.half / 2;
    for (const dx of [-half, half]) for (const dz of [-half, half]) push(makeCell(cell.x + dx, cell.z + dz, half));
  }
  return best.distance > 0 ? { point: [best.x, best.z] as Coordinate, clearance: best.distance } : null;
}

export function placeSoldLock(surface: SoldLotSurface, obstacles: readonly Coordinate[][] = []): SoldLockPlacement | null {
  const outer = surface.geometry.coordinates[0] ?? [];
  const minX = Math.min(...outer.map(p => p[0])), maxX = Math.max(...outer.map(p => p[0]));
  const minZ = Math.min(...outer.map(p => p[1])), maxZ = Math.max(...outer.map(p => p[1]));
  const nearby = obstacles.filter(ring => ring.length && Math.min(...ring.map(p => p[0])) < maxX
    && Math.max(...ring.map(p => p[0])) > minX && Math.min(...ring.map(p => p[1])) < maxZ && Math.max(...ring.map(p => p[1])) > minZ);
  const preferredClearance = surface.preferredAnchor
    ? lotPointClearance(surface.preferredAnchor, surface.geometry.coordinates, nearby) : 0;
  const anchor = surface.preferredAnchor && preferredClearance > 0
    ? { point: surface.preferredAnchor, clearance: preferredClearance }
    : safeLotAnchor(surface.geometry.coordinates, nearby);
  if (!anchor) return null;
  const height = Math.max(0.025, surface.geometry.extrusionHeight);
  // Includes the lot's existing bevel. No screen-space growth at distant zoom.
  const bevel = height >= 0.35 ? Math.min(0.065, height * 0.05) : 0;
  return {
    id: surface.id,
    position: [anchor.point[0], surface.geometry.elevation + height + bevel + 0.018, anchor.point[1]],
    scale: Math.min(1.2, anchor.clearance * 0.72),
    clearance: anchor.clearance,
  };
}
