import type { VisitWorld } from '../VisitWorld';
import { VISIT_CHARACTER_HEIGHT, VISIT_CHARACTER_RADIUS, type VisitVector3 } from '../visitTypes';

export const VISIT_CART_RADIUS = 0.28;
export const VISIT_CART_HEIGHT = 0.31;

function cartSurfaceSafe(world: VisitWorld, x: number, z: number, y: number) {
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const sample = world.ground.heightAt(x + Math.cos(angle) * VISIT_CART_RADIUS, z + Math.sin(angle) * VISIT_CART_RADIUS);
    if (Math.abs(sample - y) > 0.065) return false;
  }
  return true;
}

/** Vehicle appears beside the walker only where its full footprint fits. */
export function resolveVisitCartSpawn(world: VisitWorld, visitor: VisitVector3, yaw: number): VisitVector3 | null {
  const rightX = Math.cos(yaw), rightZ = Math.sin(yaw);
  const forwardX = Math.sin(yaw), forwardZ = -Math.cos(yaw);
  const candidate = { x: 0, y: 0, z: 0 };
  for (let ring = 0; ring < 7; ring++) {
    const distance = 0.55 + ring * 0.28;
    for (const side of [1, -1]) for (const fore of [0.2, -0.2, 0.5]) {
      candidate.x = visitor.x + rightX * distance * side + forwardX * fore;
      candidate.z = visitor.z + rightZ * distance * side + forwardZ * fore;
      candidate.y = world.ground.supportAt(candidate.x, candidate.z, VISIT_CART_RADIUS).height;
      if (Math.abs(candidate.y - visitor.y) > 0.15) continue;
      if (!cartSurfaceSafe(world, candidate.x, candidate.z, candidate.y)) continue;
      if (world.collisions.isFree(candidate, VISIT_CART_RADIUS, VISIT_CART_HEIGHT)) return { ...candidate };
    }
  }
  return null;
}

/** Keeps the walking capsule beside the stopped vehicle and on reachable grade. */
export function resolveVisitVehicleExit(world: VisitWorld, vehicle: VisitVector3, yaw: number, vehicleRadius: number): VisitVector3 | null {
  const preferred = yaw + Math.PI / 2;
  const candidate = { x: 0, y: 0, z: 0 };
  for (const distance of [vehicleRadius + 0.22, vehicleRadius + 0.36, vehicleRadius + 0.5]) {
    for (const offset of [0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4]) {
      const angle = preferred + offset;
      candidate.x = vehicle.x + Math.cos(angle) * distance;
      candidate.z = vehicle.z + Math.sin(angle) * distance;
      candidate.y = world.ground.supportAt(candidate.x, candidate.z, VISIT_CHARACTER_RADIUS).height;
      if (Math.abs(candidate.y - vehicle.y) > 0.15) continue;
      if (world.collisions.isFree(candidate, VISIT_CHARACTER_RADIUS, VISIT_CHARACTER_HEIGHT)) return { ...candidate };
    }
  }
  return null;
}
