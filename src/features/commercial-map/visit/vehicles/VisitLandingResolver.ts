import { visitPointInRing } from '../VisitSpatialIndex';
import type { VisitWorld } from '../VisitWorld';
import type { VisitCollider, VisitPoint2, VisitPolygonCollider, VisitVector3 } from '../visitTypes';
import { visitVehicleVolumeFree, type VisitVehicleVolume } from './VisitVehicleCollision';

export const VISIT_HELICOPTER_ROTOR_RADIUS = 0.60;
export const VISIT_HELICOPTER_CLEARANCE_RADIUS = 0.72;
export const VISIT_HELICOPTER_LANDING_RADIUS = 0.33;
export const VISIT_HELICOPTER_VOLUMES: readonly VisitVehicleVolume[] = [
  { radius: 0.36, bottom: 0.055, top: 0.43 }, // cabin and skids
  { radius: VISIT_HELICOPTER_CLEARANCE_RADIUS, bottom: 0.20, top: 0.36 }, // tail boom and tail rotor sweep
  { radius: VISIT_HELICOPTER_ROTOR_RADIUS, bottom: 0.44, top: 0.48 }, // main rotor disc
];

export interface VisitLandingSpot extends VisitVector3 { surfaceId: string; kind: 'ground' | 'roof' }

function circleInsidePolygon(collider: VisitPolygonCollider, x: number, z: number, radius: number) {
  if (!visitPointInRing(x, z, collider.polygon)) return false;
  for (let i = 0; i < collider.polygon.length; i++) {
    const a = collider.polygon[i], b = collider.polygon[(i + 1) % collider.polygon.length];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared < 1e-12) return false;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / lengthSquared));
    if ((x - a[0] - t * dx) ** 2 + (z - a[1] - t * dz) ** 2 < radius * radius) return false;
  }
  return true;
}

/** Numerical landing surfaces built from the walker's canonical ground and
 * broad-phase architectural tops. Resolves only on summon/landing input. */
export class VisitLandingResolver {
  private readonly candidates: VisitCollider[] = [];
  private readonly volumeCandidates: VisitCollider[] = [];
  private readonly pose: VisitVector3 = { x: 0, y: 0, z: 0 };
  constructor(readonly world: VisitWorld) {}

  private level(x: number, z: number, y: number, roof?: VisitPolygonCollider) {
    const radius = VISIT_HELICOPTER_LANDING_RADIUS;
    const samples = 12;
    let min = y, max = y;
    for (let i = 0; i < samples; i++) {
      const angle = i * Math.PI * 2 / samples;
      const sx = x + Math.cos(angle) * radius, sz = z + Math.sin(angle) * radius;
      if (roof) {
        if (!visitPointInRing(sx, sz, roof.polygon)) return false;
        if (this.world.ground.heightAt(sx, sz) > y + 0.005) return false;
      } else {
        const h = this.world.ground.heightAt(sx, sz);
        min = Math.min(min, h); max = Math.max(max, h);
      }
    }
    return roof ? circleInsidePolygon(roof, x, z, radius) : max - min <= 0.045;
  }

  resolve(x: number, z: number, maximumHeight = Infinity, allowRoof = true): VisitLandingSpot | null {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const margin = VISIT_HELICOPTER_CLEARANCE_RADIUS + 0.08;
    if (x < this.world.bounds.minX + margin || x > this.world.bounds.maxX - margin || z < this.world.bounds.minZ + margin || z > this.world.bounds.maxZ - margin) return null;
    const ground = this.world.ground.heightAt(x, z);
    let bestY = -Infinity, bestId = '', bestKind: VisitLandingSpot['kind'] = 'ground';
    if (ground <= maximumHeight + 0.005 && this.level(x, z, ground)) {
      this.pose.x = x; this.pose.y = ground; this.pose.z = z;
      if (visitVehicleVolumeFree(this.world, this.pose, VISIT_HELICOPTER_VOLUMES, this.volumeCandidates)) {
        bestY = ground; bestId = 'ground';
      }
    }
    if (allowRoof) {
      this.world.collisions.index.query(x, z, x, z, this.candidates);
      for (const collider of this.candidates) {
        if (collider.cameraOnly || collider.kind !== 'polygon') continue;
        if (collider.maxY <= ground + 0.14 || collider.maxY > maximumHeight + 0.005 || collider.maxY <= bestY) continue;
        if (collider.maxX - collider.minX < 2 * VISIT_HELICOPTER_LANDING_RADIUS || collider.maxZ - collider.minZ < 2 * VISIT_HELICOPTER_LANDING_RADIUS) continue;
        if (!this.level(x, z, collider.maxY, collider)) continue;
        this.pose.x = x; this.pose.y = collider.maxY; this.pose.z = z;
        if (visitVehicleVolumeFree(this.world, this.pose, VISIT_HELICOPTER_VOLUMES, this.volumeCandidates)) {
          bestY = collider.maxY; bestId = collider.id; bestKind = 'roof';
        }
      }
    }
    return bestY > -Infinity ? { x, y: bestY, z, surfaceId: bestId, kind: bestKind } : null;
  }

  /** Search once on summon, with a pedestrian-height restriction for boarding. */
  findNear(visitor: VisitPoint2 & { y?: number }, minRadius = 0.85, maxRadius = 4, accept?: (spot: VisitLandingSpot) => boolean): VisitLandingSpot | null {
    const visitorY = visitor.y ?? this.world.ground.heightAt(visitor.x, visitor.z);
    for (let radius = minRadius; radius <= maxRadius + 1e-6; radius += 0.3) {
      const samples = Math.max(12, Math.ceil(Math.PI * 2 * radius / 0.35));
      for (let i = 0; i < samples; i++) {
        const angle = i * Math.PI * 2 / samples;
        const spot = this.resolve(visitor.x + Math.cos(angle) * radius, visitor.z + Math.sin(angle) * radius, visitorY + 0.15, false);
        if (spot && Math.abs(spot.y - visitorY) <= 0.15 && (!accept || accept(spot))) return spot;
      }
    }
    return null;
  }
}
