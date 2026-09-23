import { describe, expect, it, vi } from 'vitest';
import { VisitCollisionSystem } from '../features/commercial-map/visit/VisitCollisionSystem';
import { VisitGroundingSystem, visitGroundSurface } from '../features/commercial-map/visit/VisitGroundingSystem';
import { buildVisitWorld, defaultVisitSpawn, visitBoxPolygon, visitCircleCollider, visitPolygonCollider, type VisitWorld } from '../features/commercial-map/visit/VisitWorld';
import type { VisitCollider } from '../features/commercial-map/visit/visitTypes';
import { OFFICIAL_REFERENCE_DATA } from '../features/commercial-map/data/officialReference2026';
import { selectCommercialTreesForScene } from '../features/commercial-map/utils/treeLayer';
import { VisitCartController } from '../features/commercial-map/visit/vehicles/VisitCartController';
import { auditVisitCartFallback } from '../features/commercial-map/visit/vehicles/VisitCartModel';
import { VisitCharacterController } from '../features/commercial-map/visit/VisitCharacterController';
import { visitInput } from '../features/commercial-map/visit/VisitInputManager';
import { useVisitStore } from '../features/commercial-map/visit/useVisitStore';
import { VisitHelicopterController } from '../features/commercial-map/visit/vehicles/VisitHelicopterController';
import { auditVisitHelicopterFallback } from '../features/commercial-map/visit/vehicles/VisitHelicopterModel';
import { resolveVisitHelicopterArrival } from '../features/commercial-map/visit/vehicles/VisitHelicopterArrival';
import { VisitLandingResolver } from '../features/commercial-map/visit/vehicles/VisitLandingResolver';
import { resolveVisitCartSpawn, resolveVisitVehicleExit, VISIT_CART_RADIUS } from '../features/commercial-map/visit/vehicles/VisitVehiclePlacement';
import { VisitVehicleManager } from '../features/commercial-map/visit/vehicles/VisitVehicleManager';

const bounds = { minX: -8, maxX: 8, minZ: -8, maxZ: 8 };
function makeWorld(colliders: VisitCollider[] = []): VisitWorld {
  const collisions = new VisitCollisionSystem(colliders, bounds);
  const ground = new VisitGroundingSystem([], 0);
  return {
    bounds, maxHeight: Math.max(1, ...colliders.map(collider => collider.maxY)), ground, collisions,
    move: (position, dx, dz, radius, height) => collisions.move(position, dx, dz, radius, height, ground.heightAt, ground.supportAt),
    resolveSpawn: preferred => ({ ...preferred, y: 0 }),
    cameraProbe: (from, to, radius) => collisions.cameraProbe(from, to, radius),
    occluded: (from, to) => collisions.occluded(from, to),
  };
}

describe('Visit vehicle kinematics and placement', () => {
  it('keeps both authored fallbacks within the GLB replacement budgets', () => {
    const cart = auditVisitCartFallback(), helicopter = auditVisitHelicopterFallback();
    expect(cart.triangles).toBeLessThan(20_000);
    expect(cart.drawCalls).toBeLessThanOrEqual(28);
    expect(cart.textures).toBe(1);
    expect(helicopter.triangles).toBeLessThan(32_000);
    expect(helicopter.drawCalls).toBeLessThanOrEqual(32);
    expect(helicopter.textures).toBe(1);
  });
  it('accelerates, steers, brakes and reverses a cart with signed wheel distance', () => {
    const world = makeWorld();
    const cart = new VisitCartController({ x: 0, y: 0, z: 0 });
    for (let i = 0; i < 90; i++) cart.step(1 / 60, { forward: 1, steer: 0 }, world);
    expect(cart.speed).toBeGreaterThan(0.5);
    expect(cart.position.z).toBeLessThan(-0.5);
    const forwardDistance = cart.distance;
    for (let i = 0; i < 60; i++) cart.step(1 / 60, { forward: 1, steer: 1 }, world);
    expect(cart.steering).toBeGreaterThan(0.4);
    expect(cart.yaw).toBeGreaterThan(0.2);
    for (let i = 0; i < 90; i++) cart.step(1 / 60, { forward: 0, steer: 0, brake: true }, world);
    expect(cart.speed).toBe(0);
    for (let i = 0; i < 75; i++) cart.step(1 / 60, { forward: -1, steer: 0 }, world);
    expect(cart.speed).toBeLessThan(-0.2);
    expect(cart.distance).toBeLessThan(forwardDistance + 1);
  });

  it('requires the full cart footprint for spawn and blocks trees while preserving a safe side exit', () => {
    const tree = visitCircleCollider('tree', 0, -0.8, 0.08, 0, 2);
    const world = makeWorld([tree]);
    const visitor = { x: 0, y: 0, z: 0 };
    const spawn = resolveVisitCartSpawn(world, visitor, 0);
    expect(spawn).not.toBeNull();
    expect(world.collisions.isFree(spawn!, VISIT_CART_RADIUS, 0.31)).toBe(true);
    const cart = new VisitCartController({ x: 0, y: 0, z: 0 }, 0);
    for (let i = 0; i < 120; i++) cart.step(1 / 60, { forward: 1, steer: 0 }, world);
    expect(cart.position.z).toBeGreaterThan(-0.8 + 0.08 + VISIT_CART_RADIUS - 0.02);
    const exit = resolveVisitVehicleExit(world, cart.position, cart.yaw, VISIT_CART_RADIUS);
    expect(exit).not.toBeNull();
    expect(world.collisions.isFree(exit!)).toBe(true);
  });

  it('treats a raised cadastral slab as a cart barrier', () => {
    const world = makeWorld();
    world.ground = new VisitGroundingSystem([visitGroundSurface('raised-lot', visitBoxPolygon(0, -1, 1, 1), 0.16)], 0);
    world.move = (position, dx, dz, radius, height) => world.collisions.move(position, dx, dz, radius, height, world.ground.heightAt, world.ground.supportAt);
    const cart = new VisitCartController({ x: 0, y: 0, z: 0 });
    for (let i = 0; i < 180; i++) cart.step(1 / 60, { forward: 1, steer: 0 }, world);
    expect(cart.position.z).toBeGreaterThan(-0.5);
    expect(cart.position.y).toBe(0);
    expect(cart.blocked).toBe(true);
  });

  it('accepts broad flat roof tops and rejects unsupported edges or rotor obstacles', () => {
    const roof = visitPolygonCollider('pavilion', visitBoxPolygon(2, 0, 2, 2), 0, 1.2);
    const tree = visitCircleCollider('tree', -0.48, 0, 0.12, 0, 1.5);
    const world = makeWorld([roof, tree]);
    const landing = new VisitLandingResolver(world);
    expect(landing.resolve(2, 0, 3)?.kind).toBe('roof');
    expect(landing.resolve(2, 0, 3)?.y).toBe(1.2);
    expect(landing.resolve(2.85, 0, 3)?.kind).not.toBe('roof');
    expect(landing.resolve(0, 0, 3)).toBeNull();
    const heli = new VisitHelicopterController({ x: 2, y: 2.2, z: 0 });
    heli.flightState = 'flying';
    expect(heli.requestLanding(landing)).toBe(true);
    for (let i = 0; i < 500 && !heli.canExit; i++) heli.step(1 / 60, { forward: 0, strafe: 0, yaw: 0, vertical: 0 }, world, landing);
    expect(heli.flightState).toBe('landed');
    expect(heli.position.y).toBeCloseTo(1.2, 3);
  });

  it('certifies a summon path, then takes off, hovers and lands progressively', () => {
    const world = makeWorld();
    const resolver = new VisitLandingResolver(world);
    const arrival = resolveVisitHelicopterArrival(world, { x: 0, y: 0, z: 0 }, resolver);
    expect(arrival).not.toBeNull();
    expect(arrival!.start.y).toBeGreaterThan(arrival!.landing.y + 2);
    expect(arrival!.landing.z).toBeLessThan(-0.6);
    const heli = new VisitHelicopterController(arrival!.landing);
    expect(heli.beginTakeoff()).toBe(true);
    for (let i = 0; i < 130; i++) heli.step(1 / 60, { forward: 0, strafe: 0, yaw: 0, vertical: 1 }, world, resolver);
    expect(heli.flightState).toBe('flying');
    const beforeHover = heli.position.y;
    for (let i = 0; i < 120; i++) heli.step(1 / 60, { forward: 0, strafe: 0, yaw: 0, vertical: 0 }, world, resolver);
    expect(Math.abs(heli.position.y - beforeHover)).toBeLessThan(0.3);
    expect(heli.requestLanding(resolver)).toBe(true);
    for (let i = 0; i < 600 && heli.flightState !== 'landed'; i++) heli.step(1 / 60, { forward: 0, strafe: 0, yaw: 0, vertical: 0 }, world, resolver);
    expect(heli.flightState).toBe('landed');
    expect(heli.position.y).toBeCloseTo(0, 3);
    expect(heli.canExit).toBe(true);
    expect(heli.mainRotorAngle).not.toBe(0);
  });

  it('sweeps the helicopter rotor against elevated structures and slows at world edges', () => {
    const wall = visitPolygonCollider('wall', visitBoxPolygon(0, 0, 0.02, 5), 0, 2);
    const world = makeWorld([wall]);
    const resolver = new VisitLandingResolver(world);
    const heli = new VisitHelicopterController({ x: -2, y: 0.6, z: 0 });
    heli.flightState = 'flying';
    for (let i = 0; i < 300; i++) heli.step(1 / 60, { forward: 0, strafe: 1, yaw: 0, vertical: 0 }, world, resolver);
    expect(heli.position.x).toBeLessThan(-0.58);
    expect(heli.blocked).toBe(true);
    const edgeHeli = new VisitHelicopterController({ x: 5.5, y: 1, z: 0 });
    edgeHeli.flightState = 'flying';
    for (let i = 0; i < 300; i++) edgeHeli.step(1 / 60, { forward: 0, strafe: 1, yaw: 0, vertical: 0 }, world, resolver);
    expect(edgeHeli.position.x).toBeLessThanOrEqual(bounds.maxX - 0.68);
  });

  it('finds an actual summon corridor beside the canonical gate-one visit spawn', () => {
    const entities = OFFICIAL_REFERENCE_DATA.entities;
    const world = buildVisitWorld({ entities, trees: selectCommercialTreesForScene(entities, OFFICIAL_REFERENCE_DATA.lots) });
    const visitor = world.resolveSpawn(defaultVisitSpawn());
    expect(resolveVisitCartSpawn(world, visitor, 0)).not.toBeNull();
    const landing = new VisitLandingResolver(world);
    const arrival = resolveVisitHelicopterArrival(world, visitor, landing);
    expect(arrival).not.toBeNull();
    expect(arrival?.landing.kind).toBe('ground');
    expect(Math.hypot(arrival!.landing.x - visitor.x, arrival!.landing.z - visitor.z)).toBeLessThanOrEqual(4.01);
  }, 20000);

  it('runs cart and helicopter phase transitions in one VisitVehicleManager session', () => {
    useVisitStore.setState({ enabled: true, phase: 'active', mobilityMode: 'walk', mobilityPhase: 'walk', canBoardHelicopter: false, vehicleNotice: null });
    visitInput.reset(); visitInput.enabled = true;
    const world = makeWorld();
    const character = new VisitCharacterController({ x: 0, y: 0, z: 0 });
    const manager = new VisitVehicleManager(world, character);
    const ready = { cart: true, helicopter: true };
    useVisitStore.getState().requestCart();
    manager.step(1 / 60, visitInput, ready);
    expect(useVisitStore.getState().mobilityPhase).toBe('cart-driving');
    visitInput.forward = 1;
    for (let i = 0; i < 80; i++) manager.step(1 / 60, visitInput, ready);
    expect(manager.cart?.distance).toBeGreaterThan(0.2);
    expect(character.position).toEqual(manager.cart?.position);
    visitInput.forward = 0;
    useVisitStore.getState().exitVehicle();
    manager.step(1 / 60, visitInput, ready);
    expect(useVisitStore.getState().mobilityPhase).toBe('walk');
    expect(world.collisions.isFree(character.position)).toBe(true);

    useVisitStore.getState().requestHelicopter();
    manager.step(1 / 60, visitInput, ready);
    expect(useVisitStore.getState().mobilityPhase).toBe('helicopter-arriving');
    for (let i = 0; i < 900 && useVisitStore.getState().mobilityPhase !== 'helicopter-landed'; i++) manager.step(1 / 60, visitInput, ready);
    expect(useVisitStore.getState().mobilityPhase).toBe('helicopter-landed');
    expect(Math.abs(character.yaw)).toBeGreaterThan(0.1);
    expect(manager.helicopter?.mainRotorAngle).not.toBe(0);
    character.position.x = manager.helicopter!.position.x + 0.4;
    character.position.y = manager.helicopter!.position.y;
    character.position.z = manager.helicopter!.position.z;
    for (let i = 0; i < 8; i++) manager.step(1 / 60, visitInput, ready);
    expect(useVisitStore.getState().canBoardHelicopter).toBe(true);
    useVisitStore.getState().enterHelicopter();
    for (let i = 0; i < 20; i++) manager.step(1 / 60, visitInput, ready);
    expect(useVisitStore.getState().mobilityPhase).toBe('helicopter-grounded');
    visitInput.vertical = 1;
    for (let i = 0; i < 150; i++) manager.step(1 / 60, visitInput, ready);
    expect(useVisitStore.getState().mobilityPhase).toBe('helicopter-flying');
    visitInput.vertical = 0;
    useVisitStore.getState().requestHelicopterLanding();
    for (let i = 0; i < 600 && useVisitStore.getState().mobilityPhase === 'helicopter-landing'; i++) manager.step(1 / 60, visitInput, ready);
    expect(useVisitStore.getState().mobilityPhase).toBe('helicopter-grounded');
    useVisitStore.getState().exitVehicle();
    manager.step(1 / 60, visitInput, ready);
    expect(useVisitStore.getState().mobilityPhase).toBe('walk');
    expect(world.collisions.isFree(character.position)).toBe(true);
    visitInput.reset(); visitInput.enabled = false;
    useVisitStore.setState({ enabled: false, mobilityMode: 'walk', mobilityPhase: 'walk' });
  });

  it('keeps controller trajectories identical for both reduced-motion preferences', () => {
    const simulate = (reduced: boolean) => {
      vi.stubGlobal('matchMedia', () => ({ matches: reduced, media: '(prefers-reduced-motion: reduce)', addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      const world = makeWorld();
      const landing = new VisitLandingResolver(world);
      const cart = new VisitCartController({ x: 0, y: 0, z: 0 });
      const heli = new VisitHelicopterController({ x: 0, y: 0, z: 0 });
      heli.beginTakeoff();
      for (let i = 0; i < 180; i++) {
        cart.step(1 / 60, { forward: 1, steer: 0.5 }, world);
        heli.step(1 / 60, { forward: 0.5, strafe: 0.25, yaw: 0.3, vertical: 0.5 }, world, landing);
      }
      return { cart: { ...cart.position, yaw: cart.yaw, speed: cart.speed, distance: cart.distance },
        helicopter: { ...heli.position, yaw: heli.yaw, pitch: heli.pitch, roll: heli.roll,
          mainRotorAngle: heli.mainRotorAngle, tailRotorAngle: heli.tailRotorAngle } };
    };
    try { expect(simulate(true)).toEqual(simulate(false)); }
    finally { vi.unstubAllGlobals(); }
  });
});
