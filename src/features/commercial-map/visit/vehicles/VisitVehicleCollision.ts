import { visitPointInRing } from '../VisitSpatialIndex';
import type { VisitWorld } from '../VisitWorld';
import type { VisitCollider, VisitVector3 } from '../visitTypes';

/** A horizontal swept disc with a deliberately independent vertical interval.
 * A rotor must not inherit its 4 m horizontal radius as a 4 m vertical radius. */
export interface VisitVehicleVolume { radius: number; bottom: number; top: number }

const EPSILON = 1e-9;

function circleFraction(x: number, z: number, dx: number, dz: number, cx: number, cz: number, radius: number) {
  const ox = x - cx, oz = z - cz;
  const distanceSquared = ox * ox + oz * oz;
  if (distanceSquared < radius * radius) return 0;
  const a = dx * dx + dz * dz;
  if (a < EPSILON) return 1;
  const b = ox * dx + oz * dz;
  if (b >= 0) return 1;
  const discriminant = b * b - a * (distanceSquared - radius * radius);
  if (discriminant < 0) return 1;
  const t = (-b - Math.sqrt(discriminant)) / a;
  return t >= -EPSILON && t <= 1 ? Math.max(0, t) : 1;
}

function polygonFraction(collider: Extract<VisitCollider, { kind: 'polygon' }>, x: number, z: number, dx: number, dz: number, radius: number) {
  if (visitPointInRing(x, z, collider.polygon)) return 0;
  let first = 1;
  for (let i = 0; i < collider.polygon.length; i++) {
    const a = collider.polygon[i], b = collider.polygon[(i + 1) % collider.polygon.length];
    const ex = b[0] - a[0], ez = b[1] - a[1], length = Math.hypot(ex, ez);
    if (length < EPSILON) continue;
    const nx = -ez / length, nz = ex / length;
    const distance = (x - a[0]) * nx + (z - a[1]) * nz;
    const projection = ((x - a[0]) * ex + (z - a[1]) * ez) / (length * length);
    if (projection >= 0 && projection <= 1 && Math.abs(distance) < radius) return 0;
    const speed = dx * nx + dz * nz;
    if (Math.abs(speed) > EPSILON) {
      const target = speed < 0 ? radius : -radius;
      const t = (target - distance) / speed;
      if (t >= 0 && t < first) {
        const along = ((x + dx * t - a[0]) * ex + (z + dz * t - a[1]) * ez) / (length * length);
        if (along >= 0 && along <= 1) first = t;
      }
    }
    first = Math.min(first, circleFraction(x, z, dx, dz, a[0], a[1], radius));
  }
  return first;
}

function colliderFraction(collider: VisitCollider, x: number, z: number, dx: number, dz: number, radius: number) {
  return collider.kind === 'circle'
    ? circleFraction(x, z, dx, dz, collider.x, collider.z, radius + collider.radius)
    : polygonFraction(collider, x, z, dx, dz, radius);
}

/** Reuses VisitWorld's broad phase, including foliage that is camera-only for walkers.
 * Returns the first safe fraction of a proposed 3D movement; no allocations on
 * the hot path when the caller supplies its reusable candidates array. */
export function visitVehicleSweep(world: VisitWorld, from: VisitVector3, to: VisitVector3, volumes: readonly VisitVehicleVolume[], candidates: VisitCollider[], margin = 0.0005) {
  let radius = 0;
  for (const volume of volumes) radius = Math.max(radius, volume.radius);
  const bounds = world.bounds;
  let first = 1;
  if (to.x - radius < bounds.minX || to.x + radius > bounds.maxX || to.z - radius < bounds.minZ || to.z + radius > bounds.maxZ) {
    const minX = bounds.minX + radius, maxX = bounds.maxX - radius, minZ = bounds.minZ + radius, maxZ = bounds.maxZ - radius;
    let fraction = 1;
    for (const [start, end, min, max] of [[from.x, to.x, minX, maxX], [from.z, to.z, minZ, maxZ]]) {
      if (start < min || start > max) return 0;
      if (end < min) fraction = Math.min(fraction, (min - start) / (end - start));
      if (end > max) fraction = Math.min(fraction, (max - start) / (end - start));
    }
    first = fraction;
  }
  const dx = to.x - from.x, dz = to.z - from.z;
  world.collisions.index.query(Math.min(from.x, to.x) - radius, Math.min(from.z, to.z) - radius,
    Math.max(from.x, to.x) + radius, Math.max(from.z, to.z) + radius, candidates);
  for (const collider of candidates) {
    for (const volume of volumes) {
      const low = Math.min(from.y, to.y) + volume.bottom;
      const high = Math.max(from.y, to.y) + volume.top;
      if (collider.maxY <= low || collider.minY >= high) continue;
      const fraction = colliderFraction(collider, from.x, from.z, dx, dz, volume.radius);
      if (fraction < first) first = fraction;
    }
  }
  return first < 1 ? Math.max(0, first - margin / Math.max(Math.hypot(dx, dz, to.y - from.y), margin)) : 1;
}

export function visitVehicleVolumeFree(world: VisitWorld, position: VisitVector3, volumes: readonly VisitVehicleVolume[], candidates: VisitCollider[]) {
  return visitVehicleSweep(world, position, position, volumes, candidates) === 1;
}
