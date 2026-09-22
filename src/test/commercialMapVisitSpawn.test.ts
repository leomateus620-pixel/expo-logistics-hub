import { beforeAll, describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { withUnifiedFenasojaRestaurant } from '@/features/commercial-map/utils/fenasojaRestaurant';
import { selectCommercialTreesForScene } from '@/features/commercial-map/utils/treeLayer';
import { buildVisitWorld, type VisitWorld } from '@/features/commercial-map/visit/VisitWorld';
import { resolveVisitDeepLink, resolveVisitSpawn, VISIT_SPAWN_POINTS, visitSpawnEntity } from '@/features/commercial-map/visit/VisitSpawnManager';

const data = withUnifiedFenasojaRestaurant(OFFICIAL_REFERENCE_DATA);
const externalEntity = data.entities.find(entity => entity.publicIdentifier === 'Q-R-02')!;
const externalLot = data.lots.find(lot => lot.entityId === externalEntity.id)!;
let world: VisitWorld;
beforeAll(() => { world = buildVisitWorld({ entities: data.entities, trees: selectCommercialTreesForScene(data.entities, data.lots) }); });

describe('Verified visit spawn registry', () => {
  it('distinguishes the restaurant from Lactalis and uses the commercial Exporural region', () => {
    expect(VISIT_SPAWN_POINTS.restaurant).toBe('C2');
    expect(visitSpawnEntity('restaurant', data.entities)?.name).toBe('Restaurante');
    expect(VISIT_SPAWN_POINTS.stage).toBe('B13');
    expect(visitSpawnEntity('stage', data.entities)?.name).toContain('Lactalis');
    expect(visitSpawnEntity('exporural', data.entities)?.publicIdentifier).toBe('Q-R-02');
    expect(visitSpawnEntity('ics', data.entities)?.publicIdentifier).toBe('QUADRA-E');
  });

  it.each(Object.keys(VISIT_SPAWN_POINTS))('resolves %s to a canonical, grounded, unobstructed arrival', spawnId => {
    const target = visitSpawnEntity(spawnId, data.entities);
    expect(target).not.toBeNull();
    expect(target?.isArchived).toBe(false);
    const spawn = resolveVisitSpawn({ spawnId }, data.entities, world);
    expect(Number.isFinite(spawn.yaw)).toBe(true);
    expect(world.collisions.isFree(spawn.position)).toBe(true);
    expect(spawn.position.y).toBeCloseTo(world.ground.heightAt(spawn.position.x, spawn.position.z), 9);
    expect(world.cameraProbe({ ...spawn.position, y: world.maxHeight + 1 }, { ...spawn.position, y: spawn.position.y + .24 }, .035)).toBeGreaterThanOrEqual(.999);
    expect(spawn.position.x).toBeGreaterThan(world.bounds.minX);
    expect(spawn.position.x).toBeLessThan(world.bounds.maxX);
    expect(spawn.position.z).toBeGreaterThan(world.bounds.minZ);
    expect(spawn.position.z).toBeLessThan(world.bounds.maxZ);
  });

  it('rejects foreign, missing and prototype registry names instead of falling back outside scope', () => {
    expect(visitSpawnEntity('restaurant', [externalEntity])).toBeNull();
    expect(visitSpawnEntity('constructor', data.entities)).toBeNull();
    expect(() => resolveVisitSpawn({ spawnId: 'restaurant' }, [externalEntity], world)).toThrow('mapa autorizado');
    expect(() => resolveVisitSpawn({ entityId: 'foreign' }, [externalEntity], world)).toThrow('mapa autorizado');
    expect(() => resolveVisitSpawn({}, [], world)).toThrow('área externa');
  });
});

describe('Authorized visit deep links', () => {
  it('matches lot identity only within both authorized entity and lot snapshots', () => {
    const query = new URLSearchParams({ mode: 'visit', lot: externalLot.id });
    expect(resolveVisitDeepLink(query, [externalEntity], [externalLot])).toEqual({ entityId: externalEntity.id });
    expect(resolveVisitDeepLink(query, [], [externalLot])).toBeNull();
    expect(resolveVisitDeepLink(query, [externalEntity], [])).toBeNull();
    expect(resolveVisitDeepLink(new URLSearchParams({ mode: 'sales', lot: externalLot.id }), [externalEntity], [externalLot])).toBeNull();
  });

  it('does not admit archived lots/entities or enter internal stands through a deep link', () => {
    const query = new URLSearchParams({ mode: 'visit', lot: externalLot.id });
    expect(resolveVisitDeepLink(query, [{ ...externalEntity, isArchived: true }], [externalLot])).toBeNull();
    expect(resolveVisitDeepLink(query, [externalEntity], [{ ...externalLot, archivedAt: '2026-01-01T00:00:00Z' }])).toBeNull();
    expect(resolveVisitDeepLink(query, [{ ...externalEntity, classification: 'INTERNAL_STAND' }], [externalLot])).toBeNull();
    expect(() => resolveVisitSpawn({ entityId: externalEntity.id }, [{ ...externalEntity, classification: 'INTERNAL_STAND' }], world)).toThrow('entrada explícita');
  });

  it('starts inside a restricted snapshot when the main entrance is outside the authorized scope', () => {
    const request = resolveVisitDeepLink(new URLSearchParams({ mode: 'visit' }), [externalEntity], [externalLot]);
    expect(request).toEqual({});
    const localWorld = buildVisitWorld({ entities: [externalEntity], trees: [], includeContext: false });
    const spawn = resolveVisitSpawn(request!, [externalEntity], localWorld);
    expect(localWorld.collisions.isFree(spawn.position)).toBe(true);
    const points = externalEntity.geometry.coordinates[0];
    expect(spawn.position.x).toBeGreaterThanOrEqual(Math.min(...points.map(point => point[0])) - 1);
    expect(spawn.position.x).toBeLessThanOrEqual(Math.max(...points.map(point => point[0])) + 1);
    expect(spawn.position.z).toBeGreaterThanOrEqual(Math.min(...points.map(point => point[1])) - 1);
    expect(spawn.position.z).toBeLessThanOrEqual(Math.max(...points.map(point => point[1])) + 1);
    expect(resolveVisitDeepLink(new URLSearchParams({ mode: 'visit' }), [], [])).toBeNull();
  });
});
