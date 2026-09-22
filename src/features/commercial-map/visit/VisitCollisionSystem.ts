import { VisitSpatialIndex, visitPointInRing } from './VisitSpatialIndex';
import { VISIT_CHARACTER_HEIGHT, VISIT_CHARACTER_RADIUS, VISIT_MAX_STEP, type VisitBounds, type VisitCollider, type VisitGroundSupport, type VisitVector3 } from './visitTypes';

const SKIN = 0.00008;
// Authored ground is -.08 while roads reach .032. This support transition is
// separate from the .045 obstacle step allowance: low masonry still blocks.
const MAX_AUTHORED_SURFACE_RISE = 0.12;
interface Sweep { t: number; nx: number; nz: number }

/** Swept upright capsule-equivalent: circular XZ footprint and bounded body Y.
 * Thin walls are swept continuously; ground substeps only sample changing height.
 * No per-frame vectors, scene traversal, mesh raycasts, or physics engine. */
export class VisitCollisionSystem {
  readonly index: VisitSpatialIndex<VisitCollider>;
  readonly colliders: readonly VisitCollider[];
  readonly diagnostics = { moves: 0, probes: 0, maxCandidates: 0, collisions: 0 };
  private readonly candidates: VisitCollider[] = [];
  private readonly sweep: Sweep = { t: 1, nx: 0, nz: 0 };
  private readonly best: Sweep = { t: 1, nx: 0, nz: 0 };
  private readonly recovery: Sweep = { t: 0, nx: 0, nz: 0 };

  constructor(colliders: readonly VisitCollider[], readonly bounds: VisitBounds) {
    this.colliders = colliders;
    this.index = new VisitSpatialIndex(colliders);
  }

  private query(x0: number, z0: number, x1: number, z1: number, radius: number) {
    this.index.query(Math.min(x0, x1) - radius, Math.min(z0, z1) - radius, Math.max(x0, x1) + radius, Math.max(z0, z1) + radius, this.candidates);
    this.diagnostics.maxCandidates = Math.max(this.diagnostics.maxCandidates, this.candidates.length);
  }

  private penetration(collider: VisitCollider, x: number, z: number, radius: number, out: Sweep) {
    out.t = 0;
    if (collider.kind === 'circle') {
      const dx = x - collider.x, dz = z - collider.z, distance = Math.hypot(dx, dz);
      out.t = radius + collider.radius - distance;
      out.nx = distance > 1e-10 ? dx / distance : 1;
      out.nz = distance > 1e-10 ? dz / distance : 0;
      return out.t > 0;
    }
    let nearestSquared = Infinity, px = 0, pz = 0, fallbackX = 1, fallbackZ = 0;
    for (let i = 0; i < collider.polygon.length; i++) {
      const a = collider.polygon[i], b = collider.polygon[(i + 1) % collider.polygon.length];
      const ex = b[0] - a[0], ez = b[1] - a[1], lengthSquared = ex * ex + ez * ez;
      if (lengthSquared < 1e-16) continue;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / lengthSquared));
      const qx = a[0] + ex * t, qz = a[1] + ez * t, distanceSquared = (x - qx) ** 2 + (z - qz) ** 2;
      if (distanceSquared < nearestSquared) {
        nearestSquared = distanceSquared; px = qx; pz = qz;
        const len = Math.sqrt(lengthSquared); fallbackX = -ez / len; fallbackZ = ex / len;
        if (visitPointInRing(qx + fallbackX * 0.00001, qz + fallbackZ * 0.00001, collider.polygon)) { fallbackX *= -1; fallbackZ *= -1; }
      }
    }
    const inside = visitPointInRing(x, z, collider.polygon), distance = Math.sqrt(nearestSquared);
    if (!inside && distance >= radius) return false;
    out.t = inside ? radius + distance : radius - distance;
    out.nx = distance > 1e-10 ? (inside ? px - x : x - px) / distance : fallbackX;
    out.nz = distance > 1e-10 ? (inside ? pz - z : z - pz) / distance : fallbackZ;
    return true;
  }

  private circleSweep(x: number, z: number, dx: number, dz: number, cx: number, cz: number, radius: number, out: Sweep) {
    const ox = x - cx, oz = z - cz, aa = dx * dx + dz * dz;
    if (aa < 1e-18) return;
    const bb = ox * dx + oz * dz;
    if (bb >= 0) return;
    const cc = ox * ox + oz * oz - radius * radius, discriminant = bb * bb - aa * cc;
    if (discriminant < 0) return;
    const t = (-bb - Math.sqrt(discriminant)) / aa;
    if (t < -1e-8 || t >= out.t || t > 1) return;
    const nx = ox + dx * t, nz = oz + dz * t, length = Math.hypot(nx, nz);
    out.t = Math.max(0, t); out.nx = nx / length; out.nz = nz / length;
  }

  private sweepFootprint(collider: VisitCollider, x: number, z: number, dx: number, dz: number, radius: number, out: Sweep) {
    out.t = 1; out.nx = 0; out.nz = 0;
    if (collider.kind === 'circle') { this.circleSweep(x, z, dx, dz, collider.x, collider.z, radius + collider.radius, out); return; }
    for (let i = 0; i < collider.polygon.length; i++) {
      const a = collider.polygon[i], b = collider.polygon[(i + 1) % collider.polygon.length];
      const ex = b[0] - a[0], ez = b[1] - a[1], length = Math.hypot(ex, ez);
      if (length < 1e-10) continue;
      const nx = -ez / length, nz = ex / length;
      const distance = (x - a[0]) * nx + (z - a[1]) * nz, speed = dx * nx + dz * nz;
      if (Math.abs(speed) > 1e-12) {
        const side = speed < 0 ? 1 : -1;
        const t = (side * radius - distance) / speed;
        if (t >= -1e-8 && t < out.t && t <= 1) {
          const projection = ((x + dx * t - a[0]) * ex + (z + dz * t - a[1]) * ez) / (length * length);
          if (projection >= 0 && projection <= 1) { out.t = Math.max(0, t); out.nx = nx * side; out.nz = nz * side; }
        }
      }
      this.circleSweep(x, z, dx, dz, a[0], a[1], radius, out);
    }
  }

  isFree(position: VisitVector3, radius = VISIT_CHARACTER_RADIUS, height = VISIT_CHARACTER_HEIGHT) {
    if (position.x - radius < this.bounds.minX || position.x + radius > this.bounds.maxX || position.z - radius < this.bounds.minZ || position.z + radius > this.bounds.maxZ) return false;
    this.query(position.x, position.z, position.x, position.z, radius);
    for (const collider of this.candidates) {
      if (collider.cameraOnly) continue;
      if (collider.maxY <= position.y + VISIT_MAX_STEP || collider.minY >= position.y + height) continue;
      if (this.penetration(collider, position.x, position.z, radius, this.recovery)) return false;
    }
    return true;
  }

  move(position: VisitVector3, dx: number, dz: number, radius = VISIT_CHARACTER_RADIUS, height = VISIT_CHARACTER_HEIGHT, heightAt?: (x: number, z: number) => number, supportAt?: (x: number, z: number, radius: number) => VisitGroundSupport) {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z) || !Number.isFinite(dx) || !Number.isFinite(dz)) return position;
    this.diagnostics.moves++;
    // Revalidate a restored/stationary pose too, before evaluating body Y.
    // The support query owns presentation-only lot steps; obstacle steps keep
    // their original .045 limit and continuous wall sweep.
    if (supportAt) {
      const support = supportAt(position.x, position.z, radius);
      if (support.height - position.y <= support.maximumRise + .0001) position.y = support.height;
    }
    const distance = Math.hypot(dx, dz);
    // Ground samples remain bounded even for a background-tab delta. Collision
    // itself uses a continuous sweep and does not depend on frame rate.
    const steps = Math.min(512, Math.max(1, Math.ceil(distance / Math.max(radius, 0.02))));
    const sx = dx / steps, sz = dz / steps;
    for (let step = 0; step < steps; step++) {
      this.query(position.x, position.z, position.x + sx, position.z + sz, radius + SKIN);
      for (let pass = 0; pass < 5; pass++) {
        let recovered = false;
        for (const collider of this.candidates) {
          if (collider.cameraOnly) continue;
          if (collider.maxY <= position.y + VISIT_MAX_STEP || collider.minY >= position.y + height) continue;
          if (this.penetration(collider, position.x, position.z, radius, this.recovery)) {
            position.x += this.recovery.nx * (this.recovery.t + SKIN);
            position.z += this.recovery.nz * (this.recovery.t + SKIN);
            recovered = true;
          }
        }
        if (!recovered) break;
      }
      let rx = sx, rz = sz;
      for (let pass = 0; pass < 4 && Math.abs(rx) + Math.abs(rz) > 1e-10; pass++) {
        this.best.t = 1;
        for (const collider of this.candidates) {
          if (collider.cameraOnly) continue;
          if (collider.maxY <= position.y + VISIT_MAX_STEP || collider.minY >= position.y + height) continue;
          this.sweepFootprint(collider, position.x, position.z, rx, rz, radius, this.sweep);
          if (this.sweep.t < this.best.t) { this.best.t = this.sweep.t; this.best.nx = this.sweep.nx; this.best.nz = this.sweep.nz; }
        }
        const t = this.best.t < 1 ? Math.max(0, this.best.t - SKIN / Math.max(Math.hypot(rx, rz), SKIN)) : 1;
        const nx = Math.max(this.bounds.minX + radius, Math.min(this.bounds.maxX - radius, position.x + rx * t));
        const nz = Math.max(this.bounds.minZ + radius, Math.min(this.bounds.maxZ - radius, position.z + rz * t));
        const support = supportAt?.(nx, nz, radius);
        const nextY = support ? support.height : heightAt ? heightAt(nx, nz) : position.y;
        // A tall ledge is a boundary, not a teleport to a roof/platform.
        if (nextY - position.y > (support?.maximumRise ?? MAX_AUTHORED_SURFACE_RISE) + 0.0001) break;
        position.x = nx; position.z = nz; position.y = nextY;
        if (this.best.t >= 1) break;
        this.diagnostics.collisions++;
        rx *= 1 - t; rz *= 1 - t;
        const into = rx * this.best.nx + rz * this.best.nz;
        if (into < 0) { rx -= into * this.best.nx; rz -= into * this.best.nz; }
      }
    }
    return position;
  }

  /** A sphere-expanded prism sweep, including vertical entry through its roof.
   * The lower/upper Y clipping interval avoids walls occluding aerial paths. */
  cameraProbe(from: VisitVector3, to: VisitVector3, radius = 0.025, ignoreId?: string) {
    this.diagnostics.probes++;
    this.query(from.x, from.z, to.x, to.z, radius);
    let nearest = 1;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    for (const collider of this.candidates) {
      if (collider.id === ignoreId) continue;
      let start = 0, end = nearest;
      if (Math.abs(dy) < 1e-10) { if (from.y < collider.minY - radius || from.y > collider.maxY + radius) continue; }
      else {
        const a = (collider.minY - radius - from.y) / dy, b = (collider.maxY + radius - from.y) / dy;
        start = Math.max(0, Math.min(a, b)); end = Math.min(nearest, Math.max(a, b));
        if (start > end) continue;
      }
      const x = from.x + dx * start, z = from.z + dz * start;
      if (this.penetration(collider, x, z, radius, this.recovery)) { nearest = Math.min(nearest, start); continue; }
      this.sweepFootprint(collider, x, z, dx * (end - start), dz * (end - start), radius, this.sweep);
      if (this.sweep.t < 1) nearest = Math.min(nearest, start + (end - start) * this.sweep.t);
    }
    return Math.max(0, nearest - (nearest < 1 ? SKIN : 0));
  }

  occluded(from: VisitVector3, to: VisitVector3, ignoreId?: string) { return this.cameraProbe(from, to, 0.001, ignoreId) < 0.999; }
}
