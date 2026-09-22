import type { VisitBounds } from './visitTypes';

/** Immutable uniform grid. Queries reuse the caller's array and a stamp table. */
export class VisitSpatialIndex<T extends VisitBounds> {
  readonly items: readonly T[];
  private readonly cells = new Map<number, number[]>();
  private readonly stamps: Uint32Array;
  private stamp = 0;
  readonly cellSize: number;
  lastCandidateCount = 0;

  constructor(items: readonly T[], cellSize = 2) {
    this.items = items;
    this.cellSize = cellSize;
    this.stamps = new Uint32Array(items.length);
    items.forEach((item, index) => {
      for (let x = Math.floor(item.minX / cellSize); x <= Math.floor(item.maxX / cellSize); x++) {
        for (let z = Math.floor(item.minZ / cellSize); z <= Math.floor(item.maxZ / cellSize); z++) {
          const key = this.key(x, z);
          const cell = this.cells.get(key);
          if (cell) cell.push(index); else this.cells.set(key, [index]);
        }
      }
    });
  }

  private key(x: number, z: number) { return (x + 32768) * 65536 + z + 32768; }

  query(minX: number, minZ: number, maxX: number, maxZ: number, output: T[]) {
    output.length = 0;
    this.stamp = (this.stamp + 1) >>> 0;
    if (this.stamp === 0) { this.stamps.fill(0); this.stamp = 1; }
    const stamp = this.stamp;
    for (let x = Math.floor(minX / this.cellSize); x <= Math.floor(maxX / this.cellSize); x++) {
      for (let z = Math.floor(minZ / this.cellSize); z <= Math.floor(maxZ / this.cellSize); z++) {
        const cell = this.cells.get(this.key(x, z));
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          const index = cell[i];
          if (this.stamps[index] === stamp) continue;
          this.stamps[index] = stamp;
          const item = this.items[index];
          if (item.minX <= maxX && item.maxX >= minX && item.minZ <= maxZ && item.maxZ >= minZ) output.push(item);
        }
      }
    }
    this.lastCandidateCount = output.length;
    return output;
  }
}

export function visitRingBounds(polygon: readonly (readonly [number, number])[]): VisitBounds {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of polygon) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  return { minX, maxX, minZ, maxZ };
}

/** Allocation-free boundary-inclusive polygon query used by ground and physics. */
export function visitPointInRing(x: number, z: number, ring: readonly (readonly [number, number])[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / lengthSq)) : 0;
    if ((x - a[0] - dx * t) ** 2 + (z - a[1] - dz * t) ** 2 < 1e-16) return true;
    if ((a[1] > z) !== (b[1] > z) && x < dx * (z - a[1]) / dz + a[0]) inside = !inside;
  }
  return inside;
}
