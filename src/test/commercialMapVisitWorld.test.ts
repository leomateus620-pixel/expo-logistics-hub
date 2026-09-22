import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildVisitWorld, defaultVisitSpawn, visitBoxPolygon, visitCircleCollider } from '../features/commercial-map/visit/VisitWorld';
import { VisitCollisionSystem } from '../features/commercial-map/visit/VisitCollisionSystem';
import { VisitGroundingSystem, visitArenaTerrainHeight, visitGroundSurface } from '../features/commercial-map/visit/VisitGroundingSystem';
import { OFFICIAL_REFERENCE_DATA } from '../features/commercial-map/data/officialReference2026';
import { selectCommercialTreesForScene } from '../features/commercial-map/utils/treeLayer';
import { resolveStrategicLandmarkKind } from '../features/commercial-map/utils/landmarks';
import { NATIONS_DISTRICT_LAYOUT } from '../features/commercial-map/data/nationsDistrict';
import { ARENA_FRONT_LAYOUT, sourceBoundsToLocal } from '../features/commercial-map/data/parkEnvironment';
import { arenaTerrainElevation } from '../features/commercial-map/data/arenaTerrain';
import { VISIT_CHARACTER_HEIGHT, VISIT_CHARACTER_RADIUS } from '../features/commercial-map/visit/visitTypes';
import { buildRearTreeInstances } from '../features/commercial-map/data/rearParkEnvironment';
import { treeIntersectsGeneratedRearRoadCorridor } from '../features/commercial-map/utils/rearRoadTreeClearance';
import { buildElectricalSceneLayout, selectCommercialElectricalInfrastructureForScene } from '../features/commercial-map/utils/electricalInfrastructure';

const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
const entities = OFFICIAL_REFERENCE_DATA.entities;
const trees = selectCommercialTreesForScene(entities, OFFICIAL_REFERENCE_DATA.lots);
const electrical = selectCommercialElectricalInfrastructureForScene(entities, OFFICIAL_REFERENCE_DATA.lots);
const electricalPlacements = buildElectricalSceneLayout(electrical.nodes, electrical.connections, entities, true).placements;
const buildCanonicalWorld = () => buildVisitWorld({ entities, trees, electricalPlacements });

describe('Visit canonical world coverage', () => {
  it('maps every closed canonical building to a physics owner and never uses a lot as a blocker', () => {
    const world = buildCanonicalWorld();
    const owners = new Set(world.collisions.colliders.map(collider => collider.id));
    const solid = new Set(['PAVILION', 'BUILDING', 'RESTAURANT', 'RESTROOM', 'CHEMICAL_RESTROOM', 'ADMINISTRATION', 'SECURITY', 'EMERGENCY', 'SERVICE', 'EVENT_VENUE']);
    const missing = entities.filter(entity => !entity.isArchived && solid.has(entity.classification)
      && !['nations-square', 'amusement-park', 'campeira-track'].includes(resolveStrategicLandmarkKind(entity) ?? '')
      && !owners.has(entity.id)).map(entity => entity.publicIdentifier);
    expect(missing).toEqual([]);
    const blockedLots = entities.filter(entity => ['SELLABLE_LOT', 'INTERNAL_STAND'].includes(entity.classification) && owners.has(entity.id));
    expect(blockedLots).toEqual([]);
    const spawn = world.resolveSpawn(defaultVisitSpawn());
    expect(world.collisions.isFree(spawn)).toBe(true);
    expect(world.maxHeight).toBe(Math.max(1, ...world.collisions.colliders.map(collider => collider.maxY)));
    if (process.env.VISIT_COLLISION_AUDIT === '1') {
      const destination = resolve(process.cwd(), 'artifacts/visit-mode');
      mkdirSync(destination, { recursive: true });
      writeFileSync(resolve(destination, 'collision-source-audit.json'), JSON.stringify({
        schemaVersion: 1, generatedAt: new Date().toISOString(), source: 'official-reference',
        purpose: 'Numerical source coverage; not a browser performance or physical-device result',
        entityCount: entities.length, suppliedTreeCount: trees.length, electricalPlacementCount: electricalPlacements.length,
        colliderCount: world.collisions.colliders.length,
        physicalColliderCount: world.collisions.colliders.filter(c => !c.cameraOnly).length,
        cameraOnlyColliderCount: world.collisions.colliders.filter(c => c.cameraOnly).length,
        groundSurfaceCount: world.ground.surfaces.length,
        bounds: world.bounds, maxHeight: world.maxHeight, spawn,
        missingClosedStructures: missing, lotsIncorrectlyUsedAsBlockers: blockedLots.map(lot => lot.publicIdentifier),
        entities: entities.map(entity => ({ id: entity.id, publicIdentifier: entity.publicIdentifier,
          classification: entity.classification, closedCollider: owners.has(entity.id),
          lotTraversableByClassification: ['SELLABLE_LOT', 'INTERNAL_STAND'].includes(entity.classification),
          colliderParts: world.collisions.colliders.filter(c => c.id === entity.id || c.id.startsWith(`${entity.id}:`)).length })),
      }, null, 2));
    }
  }, 15000);

  it('keeps the source trunk inventory separate from camera-only crowns', () => {
    const world = buildCanonicalWorld();
    const byId = new Map(world.collisions.colliders.map(collider => [collider.id, collider]));
    for (const tree of trees) {
      const collider = byId.get(tree.id);
      expect(collider?.kind, tree.id).toBe('circle');
      if (collider?.kind === 'circle') expect(collider.radius, tree.id).toBe(tree.trunkRadius);
      expect(collider?.cameraOnly).not.toBe(true);
      expect(byId.get(`${tree.id}:crown`)?.cameraOnly, tree.id).toBe(true);
    }
  }, 15000);

  it('allows walking beneath a crown while retracting the camera before entering it', () => {
    const crown = { ...visitCircleCollider('crown', 0, 0, 1, 0.5, 2.5), cameraOnly: true };
    const physics = new VisitCollisionSystem([crown], bounds), position = { x: -2, y: 0, z: 0 };
    physics.move(position, 4, 0);
    expect(position.x).toBeCloseTo(2, 5);
    expect(physics.cameraProbe({ x: -2, y: 1, z: 0 }, { x: 2, y: 1, z: 0 })).toBeLessThan(0.26);
    expect(physics.cameraProbe({ x: -2, y: 0.24, z: 0 }, { x: 2, y: 0.24, z: 0 })).toBe(1);
  });

  it('blocks low authored scrub foliage while keeping normal tree crowns and road corridors free', () => {
    const world = buildCanonicalWorld();
    const byId = new Map(world.collisions.colliders.map(collider => [collider.id, collider]));
    let scrubCount = 0;
    for (const tree of buildRearTreeInstances(false)) {
      const id = `rear-tree:${tree.x}:${tree.z}`, scrub = byId.get(`${id}:scrub`);
      expect(byId.get(`${id}:crown`)?.cameraOnly).toBe(true);
      if (tree.species !== 'scrub') { expect(scrub).toBeUndefined(); continue; }
      scrubCount++;
      expect(scrub?.kind).toBe('circle');
      if (scrub?.kind !== 'circle') continue;
      expect(scrub.cameraOnly).not.toBe(true);
      expect(scrub.radius).toBe(tree.scale * .5);
      expect(scrub.minY).toBeCloseTo(tree.scale * (.92 - .5 * (.85 + tree.tint * .5)), 12);
      expect(treeIntersectsGeneratedRearRoadCorridor({ position: [tree.x, tree.z], canopyRadius: scrub.radius + VISIT_CHARACTER_RADIUS })).toBe(false);
      // Put the eye at the bush's authored lower foliage and approach its
      // actual small radius, independently of nearby buildings or terrain.
      const local = new VisitCollisionSystem([scrub], world.bounds);
      const position = { x: tree.x - scrub.radius - .2, y: scrub.minY + .01 - .243, z: tree.z };
      local.move(position, scrub.radius * 2 + .4, 0);
      expect(position.x).toBeLessThanOrEqual(tree.x - scrub.radius - VISIT_CHARACTER_RADIUS);
      expect(local.cameraProbe({ ...position, y: position.y + .243 }, { ...position, y: position.y + .243 }, .035)).toBe(1);
    }
    expect(scrubCount).toBeGreaterThan(0);
  }, 15000);

  it('steps up a 0.3 metre sidewalk with a metre-scaled capsule', () => {
    expect(VISIT_CHARACTER_RADIUS).toBe(0.3 * 0.15);
    expect(VISIT_CHARACTER_HEIGHT).toBe(1.7 * 0.15);
    const ground = new VisitGroundingSystem([
      visitGroundSurface('base', visitBoxPolygon(0, 0, 10, 10), 0),
      visitGroundSurface('sidewalk', visitBoxPolygon(1, 0, 1, 1), 0.3 * 0.15),
    ]);
    const physics = new VisitCollisionSystem([], bounds), position = { x: 0, y: 0, z: 0 };
    physics.move(position, 1, 0, undefined, undefined, ground.heightAt);
    expect(position.x).toBeCloseTo(1, 8); expect(position.y).toBe(0.045); expect(position.z).toBe(0);
  });

  it('interpolates Arena renderer vertices rather than an unrelated height field', () => {
    const b = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.terrain.sourceBounds), { segmentsX, segmentsZ } = ARENA_FRONT_LAYOUT.terrain;
    for (const u of [0, 0.25, 0.5, 0.75]) {
      const x = b.minX + Math.round(segmentsX * u) / segmentsX * b.width;
      const z = b.minZ + Math.round(segmentsZ * u) / segmentsZ * b.depth;
      expect(visitArenaTerrainHeight(x, z)).toBeCloseTo(arenaTerrainElevation(x, z), 9);
    }
  });

  it('uses the visible Nations island heights and keeps identity/commercial inputs immutable', () => {
    const before = JSON.stringify(OFFICIAL_REFERENCE_DATA);
    const world = buildCanonicalWorld();
    for (const island of NATIONS_DISTRICT_LAYOUT.islands) {
      const source = world.ground.surfaces.find(surface => surface.id === `nations:island:${island.id}:${island.insetScale}`);
      expect(source?.height).toBe(0.172);
    }
    expect(JSON.stringify(OFFICIAL_REFERENCE_DATA)).toBe(before);
  }, 15000);
});
