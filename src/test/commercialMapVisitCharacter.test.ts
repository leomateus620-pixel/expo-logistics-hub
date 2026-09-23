import { describe, expect, it } from 'vitest';
import { VisitCharacterController, VISIT_BODY, VISIT_METRES } from '@/features/commercial-map/visit/VisitCharacterController';
import { VisitCollisionSystem } from '@/features/commercial-map/visit/VisitCollisionSystem';
import { VisitGroundingSystem } from '@/features/commercial-map/visit/VisitGroundingSystem';
import type { visitInput } from '@/features/commercial-map/visit/VisitInputManager';
import type { VisitWorld } from '@/features/commercial-map/visit/VisitWorld';
import type { VisitCollider } from '@/features/commercial-map/visit/visitTypes';

const input = (): typeof visitInput => ({ forward: 0, strafe: 0, yaw: 0, vertical: 0, brake: false, lookX: 0, lookY: 0, run: false, enabled: true, reset() {} });
function worldWith(colliders: VisitCollider[] = []): VisitWorld {
  const bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
  const ground = new VisitGroundingSystem([], 0), collisions = new VisitCollisionSystem(colliders, bounds);
  return {
    bounds, ground, collisions, maxHeight: 1,
    move: (p, dx, dz, radius, height) => collisions.move(p, dx, dz, radius, height, ground.heightAt),
    cameraProbe: (a, b, r) => collisions.cameraProbe(a, b, r),
    occluded: (a, b, id) => collisions.occluded(a, b, id),
    resolveSpawn: p => ({ ...p, y: 0 }),
  };
}
const advance = (c: VisitCharacterController, controls: typeof visitInput, world: VisitWorld, frames: number) => {
  for (let i = 0; i < frames; i++) c.step(1 / 60, controls, world);
};

describe('movimento humano, input e colisões integradas', () => {
  it('mouse para direita olha para direita; pitch é limitado e deltas são consumidos uma vez', () => {
    const c = new VisitCharacterController({ x: 0, y: 0, z: 0 });
    const controls = input(); controls.lookX = 100; controls.lookY = -10000;
    c.step(1 / 60, controls, worldWith());
    expect(Math.sin(c.yaw)).toBeGreaterThan(0);
    expect(c.pitch).toBe(1.1);
    expect(controls.lookX).toBe(0); expect(controls.lookY).toBe(0);
    const yaw = c.yaw;
    c.step(1 / 60, controls, worldWith());
    expect(c.yaw).toBe(yaw);
  });

  it('acelera e desacelera suavemente sem acelerar na diagonal', () => {
    const c = new VisitCharacterController({ x: 0, y: 0, z: 0 });
    const diagonal = new VisitCharacterController({ x: 0, y: 0, z: 0 });
    const controls = input(), diagonalControls = input(), world = worldWith();
    controls.forward = 1; diagonalControls.forward = diagonalControls.strafe = 1;
    c.step(1 / 60, controls, world);
    const firstSpeed = Math.abs(c.velocityZ);
    expect(firstSpeed).toBeGreaterThan(0); expect(firstSpeed).toBeLessThan(1.45 * VISIT_METRES);
    advance(c, controls, world, 599); advance(diagonal, diagonalControls, world, 600);
    expect(c.distance).toBeCloseTo(diagonal.distance, 9);
    expect(c.distance / VISIT_METRES).toBeGreaterThan(14);
    expect(c.distance / VISIT_METRES).toBeLessThan(14.5);
    const before = Math.abs(c.velocityZ); controls.forward = 0;
    c.step(1 / 60, controls, world);
    expect(Math.abs(c.velocityZ)).toBeGreaterThan(0); expect(Math.abs(c.velocityZ)).toBeLessThan(before);
    advance(c, controls, world, 120);
    expect(c.movement).toBe('idle'); expect(c.velocityZ).toBe(0);
  });

  it('corrida respeita escala, corpo desacelera ao parar e pausa nunca produz teleporte', () => {
    const c = new VisitCharacterController({ x: 0, y: 0, z: 0 }), controls = input(), world = worldWith();
    controls.forward = 1; controls.run = true;
    advance(c, controls, world, 600);
    expect(c.distance / VISIT_METRES).toBeGreaterThan(33.5);
    expect(c.distance / VISIT_METRES).toBeLessThan(34);
    expect(c.movement).toBe('run');
    const previous = c.position.z;
    c.step(30, controls, world);
    expect(previous - c.position.z).toBeLessThanOrEqual(3.4 * VISIT_METRES * .05 + 1e-10);
    c.stop(); expect(c.velocityX).toBe(0); expect(c.velocityZ).toBe(0); expect(c.movement).toBe('idle');
  });

  it('corrida não atravessa parede fina e permite continuar lateralmente', () => {
    const wall: VisitCollider = { id: 'wall', kind: 'polygon', minX: -2, maxX: 2, minZ: -.4, maxZ: -.38,
      minY: 0, maxY: 1, polygon: [[-2,-.4],[2,-.4],[2,-.38],[-2,-.38]] };
    const world = worldWith([wall]), c = new VisitCharacterController({ x: 0, y: 0, z: 0 }), controls = input();
    controls.forward = 1; controls.run = true;
    advance(c, controls, world, 300);
    expect(c.position.z).toBeGreaterThanOrEqual(wall.maxZ + VISIT_BODY.radius);
    expect(c.movement).toBe('idle');
    controls.strafe = 1; advance(c, controls, world, 120);
    expect(c.position.x).toBeGreaterThan(.5);
    expect(world.collisions.isFree(c.position, VISIT_BODY.radius, VISIT_BODY.height)).toBe(true);
    expect(c.position.y).toBe(0);
  });
});
