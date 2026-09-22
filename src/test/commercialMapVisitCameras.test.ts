import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { VisitCameras, VisitCameraFlight } from '@/features/commercial-map/visit/VisitCameras';
import { VisitCharacterController, VISIT_BODY } from '@/features/commercial-map/visit/VisitCharacterController';
import { VisitCollisionSystem } from '@/features/commercial-map/visit/VisitCollisionSystem';
import { VisitGroundingSystem } from '@/features/commercial-map/visit/VisitGroundingSystem';
import { visitCameraFrame } from '@/features/commercial-map/visit/visitRuntime';
import type { VisitCollider } from '@/features/commercial-map/visit/visitTypes';
import type { VisitWorld } from '@/features/commercial-map/visit/VisitWorld';

const wall: VisitCollider = {
  id: 'thin-camera-wall', kind: 'polygon', minX: -2, maxX: 2, minZ: .35, maxZ: .37,
  minY: 0, maxY: 1,
  polygon: [[-2,.35],[2,.35],[2,.37],[-2,.37]],
};
function worldWith(colliders: VisitCollider[] = []): VisitWorld {
  const bounds = { minX: -10, minZ: -10, maxX: 10, maxZ: 10 };
  const collisions = new VisitCollisionSystem(colliders, bounds);
  const ground = new VisitGroundingSystem([], 0);
  return {
    bounds, collisions, ground, maxHeight: 1,
    move: (p, dx, dz, radius, height) => collisions.move(p, dx, dz, radius, height, ground.heightAt),
    cameraProbe: (from, to, radius) => collisions.cameraProbe(from, to, radius),
    occluded: (from, to, ignore) => collisions.occluded(from, to, ignore),
    resolveSpawn: (p) => ({ ...p, y: 0 }),
  };
}

describe('câmeras da visita e corpo físico', () => {
  it('primeira pessoa mantém altura humana sem balanço, posição e orientação do personagem', () => {
    const character = new VisitCharacterController({ x: 2, y: .04, z: 3 });
    character.yaw = .3; character.pitch = -.2;
    const camera = new VisitCameras();
    const world = worldWith();
    for (let i = 0; i < 120; i++) camera.update(character, world, 'first', 1 / 60);
    expect(camera.position.toArray()).toEqual([2, .04 + VISIT_BODY.eye, 3]);
    expect(camera.direction.length()).toBeCloseTo(1, 10);
    expect(character.position).toEqual({ x: 2, y: .04, z: 3 });
    expect(character.yaw).toBe(.3);
    expect(character.pitch).toBe(-.2);
  });

  it('aproxima imediatamente antes da parede fina e retorna progressivamente ao afastamento', () => {
    const character = new VisitCharacterController({ x: 0, y: 0, z: 0 });
    character.pitch = 0;
    const camera = new VisitCameras();
    const blocked = worldWith([wall]);
    for (let i = 0; i < 120; i++) camera.update(character, blocked, 'third', 1 / 60);
    expect(camera.position.z).toBeGreaterThan(.2);
    expect(camera.position.z).toBeLessThanOrEqual(wall.minZ - .035);
    expect(blocked.cameraProbe(camera.eye, camera.position, .035)).toBe(1);
    const previous = camera.position.z;
    const open = worldWith();
    camera.update(character, open, 'third', 1 / 60);
    expect(camera.position.z).toBeGreaterThan(previous);
    expect(camera.position.z).toBeLessThan(.66);
    for (let i = 0; i < 120; i++) camera.update(character, open, 'third', 1 / 60);
    expect(camera.position.z).toBeCloseTo(.66, 5);
  });

  it('alternar 20 vezes mantém personagem e direção, incluindo olhar vertical', () => {
    const character = new VisitCharacterController({ x: 0, y: 0, z: 0 });
    character.yaw = -.7; character.pitch = 1.1;
    const camera = new VisitCameras(), world = worldWith();
    let previous: Vector3 | null = null;
    for (let cycle = 0; cycle < 20; cycle++) for (const mode of ['first', 'third'] as const) {
      for (let i = 0; i < 120; i++) {
        camera.update(character, world, mode, 1 / 60);
        if (previous) expect(camera.position.distanceTo(previous)).toBeLessThan(.2);
        previous = camera.position.clone();
        expect(camera.position.y).toBeGreaterThanOrEqual(.039);
        expect(world.cameraProbe(camera.eye, camera.position, .035)).toBe(1);
      }
      expect(camera.direction.x).toBeCloseTo(Math.sin(-.7) * Math.cos(1.1), 10);
      expect(character.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(character.yaw).toBe(-.7);
    }
  });

  it('faz travessia da transição acima da arquitetura e termina exatamente no alvo', () => {
    const flight = new VisitCameraFlight();
    const from = { x: 10, y: 2, z: 10 }, to = { x: -10, y: .243, z: -10 };
    const world = worldWith(); world.maxHeight = 4;
    expect(flight.start(from, { x: 0, y: 0, z: 0 }, to, { x: -10, y: .243, z: -11 }, world, 38, 65)).toBe(true);
    let completed = false;
    for (let i = 0; i < 160; i++) {
      completed = flight.step(1 / 60);
      const p = visitCameraFrame.position;
      if (p.x < 9.9 && p.x > -9.9) expect(p.y).toBeGreaterThanOrEqual(4.8);
      expect([p.x, p.y, p.z, visitCameraFrame.fov].every(Number.isFinite)).toBe(true);
    }
    expect(completed).toBe(true);
    expect(visitCameraFrame.position.x).toBeCloseTo(to.x, 12);
    expect(visitCameraFrame.position.y).toBeCloseTo(to.y, 12);
    expect(visitCameraFrame.position.z).toBeCloseTo(to.z, 12);
    expect(visitCameraFrame.fov).toBe(65);
  });

  it('sai lateralmente debaixo de uma cobertura com pilar antes de subir', () => {
    const roof: VisitCollider = { id: 'roof', kind: 'polygon', polygon: [[-1,-1],[1,-1],[1,1],[-1,1]], minX: -1, maxX: 1, minZ: -1, maxZ: 1, minY: .6, maxY: .8 };
    const pier: VisitCollider = { id: 'pier', kind: 'polygon', polygon: [[.45,-.2],[.55,-.2],[.55,.2],[.45,.2]], minX: .45, maxX: .55, minZ: -.2, maxZ: .2, minY: 0, maxY: .6 };
    const world = worldWith([roof, pier]), from = { x: 0, y: .243, z: 0 }, to = { x: 4, y: 3, z: 0 };
    const flight = new VisitCameraFlight();
    expect(world.cameraProbe(from, { ...from, y: 3 }, .035)).toBeLessThan(1);
    expect(flight.start(from, { ...from, z: -1 }, to, { x: 0, y: 0, z: 0 }, world, 65, 38)).toBe(true);
    let previous = { ...from }, completed = false;
    for (let i = 0; i < 240 && !completed; i++) {
      completed = flight.step(1 / 60);
      expect(world.cameraProbe(previous, visitCameraFrame.position, .035)).toBe(1);
      previous = { ...visitCameraFrame.position };
    }
    expect(completed).toBe(true);
    expect(visitCameraFrame.position).toEqual(to);
  });

  it('certifica chegada deslocada em terceira pessoa abaixo da copa, independente do spawn', () => {
    const crown: VisitCollider = { id: 'tree:crown', kind: 'circle', x: .66, z: 0, radius: .3, minX: .36, maxX: .96, minZ: -.3, maxZ: .3, minY: .65, maxY: 1.3, cameraOnly: true };
    const world = worldWith([crown]); world.maxHeight = 1.3;
    const from = { x: -3, y: 3, z: 1 }, to = { x: .66, y: .36, z: 0 };
    expect(world.cameraProbe({ x: 0, y: 3, z: 0 }, { x: 0, y: .243, z: 0 }, .035)).toBe(1);
    expect(world.cameraProbe({ ...to, y: 3 }, to, .035)).toBeLessThan(1);
    const flight = new VisitCameraFlight();
    expect(flight.start(from, { x: 0, y: 0, z: 0 }, to, { x: 0, y: .243, z: 0 }, world, 38, 65)).toBe(true);
    let previous = { ...from }, completed = false;
    for (let i = 0; i < 240 && !completed; i++) {
      completed = flight.step(i % 3 ? 1 / 60 : .05);
      expect(world.cameraProbe(previous, visitCameraFrame.position, .035)).toBe(1);
      previous = { ...visitCameraFrame.position };
    }
    expect(completed).toBe(true);
    expect(visitCameraFrame.position).toEqual(to);
  });

  it('recusa partida dentro de copa ou sala fechada sem publicar teleporte', () => {
    const crown: VisitCollider = { id: 'tree:crown', kind: 'circle', x: 0, z: 0, radius: .5, minX: -.5, maxX: .5, minZ: -.5, maxZ: .5, minY: .1, maxY: 1.3, cameraOnly: true };
    const world = worldWith([crown]); world.maxHeight = 1.3;
    const from = { x: 0, y: .243, z: 0 }, to = { x: 3, y: 3, z: 1 };
    Object.assign(visitCameraFrame.position, from);
    const flight = new VisitCameraFlight();
    expect(flight.start(from, { ...from, z: -1 }, to, { x: 0, y: 0, z: 0 }, world, 65, 38)).toBe(false);
    expect(flight.step(.05)).toBe(false);
    expect(visitCameraFrame.position).toEqual(from);
    // Destination validation has the same requirement: no automatic final snap.
    expect(flight.start(to, from, from, to, world, 38, 65)).toBe(false);
    expect(visitCameraFrame.position).toEqual(from);
  });
});
