import type { VisitWorld } from '../VisitWorld';
import type { VisitCollider, VisitVector3 } from '../visitTypes';
import { VisitLandingResolver, VISIT_HELICOPTER_CLEARANCE_RADIUS, VISIT_HELICOPTER_VOLUMES, type VisitLandingSpot } from './VisitLandingResolver';
import { visitVehicleSweep } from './VisitVehicleCollision';

export interface VisitHelicopterArrivalPath {
  /** Offscreen airborne origin. Interpolate start → approach → landing. */
  start: VisitVector3;
  approach: VisitVector3;
  landing: VisitLandingSpot;
}

/** Certifies the entire approach and vertical descent against the same volumes
 * used for piloted flight. No renderer raycast or second world is involved. */
export function resolveVisitHelicopterArrival(world: VisitWorld, visitor: VisitVector3, resolver: VisitLandingResolver, visitorYaw = 0): VisitHelicopterArrivalPath | null {
  const candidates: VisitCollider[] = [];
  let path: VisitHelicopterArrivalPath | null = null;
  const certify = (landing: VisitLandingSpot) => {
    const highY = Math.max(world.maxHeight + 1.1, landing.y + 2.6);
    const approach = { x: landing.x, y: highY, z: landing.z };
    const safeMargin = VISIT_HELICOPTER_CLEARANCE_RADIUS + 0.12;
    for (let i = 0; i < 8; i++) {
      const angle = visitorYaw + Math.PI * 0.75 + i * Math.PI / 4;
      const start = {
        x: Math.max(world.bounds.minX + safeMargin, Math.min(world.bounds.maxX - safeMargin, landing.x + Math.cos(angle) * 6)),
        y: highY,
        z: Math.max(world.bounds.minZ + safeMargin, Math.min(world.bounds.maxZ - safeMargin, landing.z + Math.sin(angle) * 6)),
      };
      if (Math.hypot(start.x - approach.x, start.z - approach.z) < 2) continue;
      if (visitVehicleSweep(world, start, approach, VISIT_HELICOPTER_VOLUMES, candidates) < 1) continue;
      if (visitVehicleSweep(world, approach, landing, VISIT_HELICOPTER_VOLUMES, candidates) < 1) continue;
      path = { start, approach, landing };
      return true;
    }
    return false;
  };
  // Keep the landing in the visitor's view when a certified corridor exists.
  // Search the full circle only when the forward area is obstructed.
  const forwardX = Math.sin(visitorYaw), forwardZ = -Math.cos(visitorYaw);
  resolver.findNear(visitor, 1.35, 4, landing => {
    const dx = landing.x - visitor.x, dz = landing.z - visitor.z;
    return (dx * forwardX + dz * forwardZ) / Math.hypot(dx, dz) >= .5 && certify(landing);
  });
  if (!path) resolver.findNear(visitor, 0.85, 4, certify);
  return path;
}
