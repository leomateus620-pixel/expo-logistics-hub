import { describe, expect, it } from 'vitest';
import { VisitCollisionSystem } from '../features/commercial-map/visit/VisitCollisionSystem';
import { VisitGroundingSystem, buildVisitGroundSurfaces, visitGroundSurface } from '../features/commercial-map/visit/VisitGroundingSystem';
import { VisitSpatialIndex } from '../features/commercial-map/visit/VisitSpatialIndex';
import { buildVisitWorld, defaultVisitSpawn, visitBoxPolygon, visitCircleCollider, visitPolygonCollider } from '../features/commercial-map/visit/VisitWorld';
import type { MapEntity } from '../features/commercial-map/types';
import { OFFICIAL_REFERENCE_DATA } from '../features/commercial-map/data/officialReference2026';
import { selectCommercialTreesForScene } from '../features/commercial-map/utils/treeLayer';
import { naturalParkingGroundElevationAt } from '../features/commercial-map/utils/naturalParkingGround';
import { COMMERCIAL_MAP_SPATIAL_BOUNDS } from '../features/commercial-map/data/commercialMapSpatialBounds';
import { FENASOJA_COMPLEX, complexLocalToWorld } from '../features/commercial-map/data/fenasojaComplexReconstruction';
import { TERRITORY_PATCHES } from '../features/commercial-map/data/territorialEnvironment';

const bounds = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
const wall = (id = 'wall', x = 0, z = 0, width = 0.005, depth = 4) => visitPolygonCollider(id, visitBoxPolygon(x, z, width, depth), 0, 1);
const entity = (classification: MapEntity['classification'], id = classification): MapEntity => ({
  id, projectId: 'test', layerId: 'test', parentEntityId: null, publicIdentifier: id, name: id,
  description: null, classification, verificationStatus: 'VERIFIED', isSellable: classification === 'SELLABLE_LOT', isArchived: false,
  metadata: {}, geometry: { id: `${id}:geometry`, type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]], elevation: 0, extrusionHeight: classification === 'BUILDING' ? 1 : 0.025, rotation: 0, geometryVersion: 1, calibrationVersion: null },
});

describe('Visit spatial collision', () => {
  it('sweeps a fast capsule through a thin wall without tunneling at any frame delta', () => {
    for (const distance of [0.2, 2, 20]) {
      const physics = new VisitCollisionSystem([wall()], bounds);
      const position = { x: -0.1, y: 0, z: 0 };
      expect(physics.move(position, distance, 0)).toBe(position);
      expect(position.x).toBeLessThanOrEqual(-0.0474);
      expect(position.x).toBeGreaterThan(-0.049);
    }
  });
  it('slides along walls and releases a corner when moving away', () => {
    const physics = new VisitCollisionSystem([wall(), wall('cross', -2, 2, 4, 0.005)], bounds);
    const position = { x: -0.1, y: 0, z: 0 };
    physics.move(position, 1, 1);
    expect(position.x).toBeLessThan(-0.047);
    expect(position.z).toBeCloseTo(1, 3);
    physics.move(position, -0.5, -0.2);
    expect(position.x).toBeLessThan(-0.5);
  });
  it('depenetrates a bad spawn and keeps a natural circle around trunks', () => {
    const physics = new VisitCollisionSystem([visitCircleCollider('tree', 0, 0, 0.08, 0, 2)], bounds);
    const inside = { x: 0, y: 0, z: 0 };
    physics.move(inside, 0, 0);
    expect(Math.hypot(inside.x, inside.z)).toBeGreaterThan(0.125);
    const beside = { x: -0.8, y: 0, z: 0.14 };
    physics.move(beside, 1.6, 0);
    expect(beside.x).toBeCloseTo(0.8, 3);
  });
  it('uses full body height, allows overhead portals, and stops against low walls', () => {
    const overhead = visitPolygonCollider('roof', visitBoxPolygon(0, 0, 4, 4), 0.6, 0.8);
    const physics = new VisitCollisionSystem([overhead], bounds);
    const position = { x: -3, y: 0.03, z: 0 };
    physics.move(position, 6, 0);
    expect(position.x).toBeCloseTo(3, 3);
    const lowWall = new VisitCollisionSystem([visitPolygonCollider('wall', visitBoxPolygon(0, 0, 0.01, 4), 0, 0.2)], bounds);
    position.x = -1;
    lowWall.move(position, 2, 0);
    expect(position.x).toBeLessThan(0);
  });
  it('stops the chase camera at a wall and clips vertical roof entry', () => {
    const physics = new VisitCollisionSystem([wall()], bounds);
    const fraction = physics.cameraProbe({ x: -1, y: 0.2, z: 0 }, { x: 1, y: 0.2, z: 0 });
    expect(fraction).toBeGreaterThan(0.48); expect(fraction).toBeLessThan(0.49);
    expect(physics.cameraProbe({ x: -1, y: 2, z: 0 }, { x: 1, y: 2, z: 0 })).toBe(1);
    expect(physics.cameraProbe({ x: 0, y: 2, z: 0 }, { x: 0, y: 0.2, z: 0 })).toBeCloseTo((2 - 1.025) / 1.8, 3);
    expect(physics.occluded({ x: -1, y: 0.2, z: 0 }, { x: 1, y: 0.2, z: 0 }, 'wall')).toBe(false);
  });
  it('cannot escape technical bounds even with a large movement', () => {
    const physics = new VisitCollisionSystem([], bounds);
    const position = { x: 19, y: 0, z: 19 };
    physics.move(position, 100, 100);
    expect(position.x).toBeCloseTo(19.955, 5); expect(position.z).toBeCloseTo(19.955, 5);
  });
  it('queries only nearby objects and deduplicates objects crossing grid cells', () => {
    const objects = Array.from({ length: 1000 }, (_, i) => wall(`${i}`, i * 5, 0));
    const index = new VisitSpatialIndex(objects), output: typeof objects = [];
    index.query(-1, -3, 1, 3, output);
    expect(output.map(item => item.id)).toEqual(['0']);
    expect(index.query(-1, -3, 1, 3, output)).toBe(output);
  });
});

describe('Visit grounded world', () => {
  it('keeps official lots traversable and buildings blocked without mutating data', () => {
    const lot = entity('SELLABLE_LOT'), building = entity('BUILDING');
    const before = JSON.stringify([lot, building]);
    const world = buildVisitWorld({ entities: [lot], trees: [], includeContext: false });
    const position = { x: -2, y: -0.08, z: 0 };
    // Approach the raised lot from its same authored road-level surface.
    position.y = 0.025;
    world.move(position, 4, 0);
    expect(position.x).toBeCloseTo(2, 3);
    const solidWorld = buildVisitWorld({ entities: [building], trees: [], includeContext: false });
    const spawn = solidWorld.resolveSpawn({ x: 0, z: 0 });
    expect(solidWorld.collisions.isFree(spawn)).toBe(true);
    expect(Math.max(Math.abs(spawn.x), Math.abs(spawn.z))).toBeGreaterThan(1.04);
    expect(JSON.stringify([lot, building])).toBe(before);
  });
  it('grounds to source planes, respects holes, and refuses tall ledges', () => {
    const ground = new VisitGroundingSystem([
      visitGroundSurface('ground', visitBoxPolygon(0, 0, 20, 20), 0),
      visitGroundSurface('step', visitBoxPolygon(1, 0, 1, 1), 0.03),
      visitGroundSurface('ledge', visitBoxPolygon(3, 0, 1, 1), 0.3),
      visitGroundSurface('hole', visitBoxPolygon(0, 3, 4, 4), 0.03, [visitBoxPolygon(0, 3, 1, 1)]),
    ]);
    const physics = new VisitCollisionSystem([], bounds), position = { x: 0, y: 0, z: 0 };
    physics.move(position, 1, 0, undefined, undefined, ground.heightAt);
    expect(position.y).toBeCloseTo(0.03, 5);
    physics.move(position, 3, 0, undefined, undefined, ground.heightAt);
    expect(position.x).toBeLessThan(2.51);
    expect(ground.heightAt(0, 3)).toBe(0);
  });
  it('builds real architectural and trunk blockers with valid entrance and free headquarters garden', () => {
    const entities = OFFICIAL_REFERENCE_DATA.entities;
    const world = buildVisitWorld({ entities, trees: selectCommercialTreesForScene(entities, OFFICIAL_REFERENCE_DATA.lots) });
    expect(world.collisions.colliders.length).toBeGreaterThan(500);
    expect(world.collisions.colliders.some(c => c.id.startsWith('gate1:pier'))).toBe(true);
    expect(world.collisions.colliders.some(c => c.id.includes('wall-east'))).toBe(true);
    expect(world.collisions.colliders.some(c => c.id.startsWith('crioulos-fence'))).toBe(true);
    const spawn = world.resolveSpawn(defaultVisitSpawn());
    expect(world.collisions.isFree(spawn)).toBe(true);
    expect(world.bounds).toEqual(COMMERCIAL_MAP_SPATIAL_BOUNDS.nearContextBounds);
    const entry = complexLocalToWorld(FENASOJA_COMPLEX.headquarters.entryPoint, 'headquarters');
    const entrySpawn = world.resolveSpawn({ x: entry[0], z: entry[1] });
    expect(Math.hypot(entrySpawn.x - entry[0], entrySpawn.z - entry[1])).toBeLessThan(0.5);
    expect(world.collisions.diagnostics.maxCandidates).toBeLessThan(world.collisions.colliders.length / 3);
  });
  it('matches the original rear terrain triangle receiver away from raised surfaces', () => {
    const terrainIds = new Set(TERRITORY_PATCHES.filter(p => p.kind !== 'water').map(p => p.id));
    const surfaces = buildVisitGroundSurfaces([], true).filter(surface => surface.id.startsWith('gate5-br472-environmental-continuity') || terrainIds.has(surface.id));
    const ground = new VisitGroundingSystem(surfaces);
    for (const surface of surfaces.filter(s => s.polygon.length === 3).slice(0, 8)) {
      const x = surface.polygon.reduce((sum, p) => sum + p[0], 0) / 3;
      const z = surface.polygon.reduce((sum, p) => sum + p[1], 0) / 3;
      expect(ground.heightAt(x, z)).toBeCloseTo(naturalParkingGroundElevationAt([x, z]), 5);
    }
  });
});
