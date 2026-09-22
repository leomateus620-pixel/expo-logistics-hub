import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OFFICIAL_REFERENCE_DATA } from '../features/commercial-map/data/officialReference2026';
import { withUnifiedFenasojaRestaurant } from '../features/commercial-map/utils/fenasojaRestaurant';
import { buildRestaurantFrontagePlan, RESTAURANT_FRONTAGE_LAYOUT } from '../features/commercial-map/utils/restaurantFrontage';
import { buildVisitWorld, visitBoxPolygon, visitPolygonCollider } from '../features/commercial-map/visit/VisitWorld';
import { VisitGroundingSystem, visitGroundSurface } from '../features/commercial-map/visit/VisitGroundingSystem';
import { VisitCollisionSystem } from '../features/commercial-map/visit/VisitCollisionSystem';
import { VISIT_CHARACTER_RADIUS } from '../features/commercial-map/visit/visitTypes';

const entities = withUnifiedFenasojaRestaurant(OFFICIAL_REFERENCE_DATA).entities;
const world = buildVisitWorld({ entities, trees: [] });
const ics = { x: 7.549700669234649, y: -.08, z: 6.2753844668157965 };
const roadMargin = { x: 11.645069315449598, y: -.08, z: -8.690192608452394 };
const restaurant = { x: -16.31856149, y: -.08, z: 5.89025731 };

describe('Visit ground contact captured on the real route', () => {
  it('supports the circular foot at the ICS seam and walks across the actual neighbouring lot slabs', () => {
    const lot = entities.find(e => e.publicIdentifier === 'Q-E-08')!;
    expect(lot.geometry.coordinates[0][0][0] - ics.x).toBeGreaterThan(0);
    expect(lot.geometry.coordinates[0][0][0] - ics.x).toBeLessThan(.0005);
    expect(world.ground.heightAt(ics.x, ics.z)).toBe(-.08);
    expect(world.ground.supportAt(ics.x, ics.z).height).toBe(.13);
    const position = { ...ics };
    world.move(position, 0, 0);
    expect(position.y).toBe(.13);
    for (let step = 0; step < 20; step++) {
      world.move(position, -.012, 0);
      expect(position.y).toBe(.13);
    }
    expect(position.x).toBeCloseTo(ics.x - .24, 8);
    // The source slab remains transitible when approached from base ground.
    const frontZ = Math.min(...lot.geometry.coordinates[0].map(p => p[1]));
    const entering = { x: (lot.geometry.coordinates[0][0][0] + lot.geometry.coordinates[0][1][0]) / 2, y: -.08, z: frontZ - .12 };
    world.move(entering, 0, .32);
    expect(entering.z).toBeCloseTo(frontZ + .2, 8);
    expect(entering.y).toBe(.13);
  });

  it('keeps the recorded road margin at its real base and steps onto the actual asphalt and curb', () => {
    const road = entities.find(e => e.publicIdentifier === 'RUA-BOLIVIA')!;
    const roadEdge = Math.min(...road.geometry.coordinates[0].map(p => p[1]));
    expect(roadEdge - roadMargin.z).toBeCloseTo(.050192565, 8);
    expect(roadEdge - roadMargin.z).toBeGreaterThan(VISIT_CHARACTER_RADIUS);
    expect(world.ground.supportAt(roadMargin.x, roadMargin.z).height).toBe(-.08);
    const position = { ...roadMargin };
    world.move(position, 0, .16);
    expect(position.z).toBeCloseTo(roadMargin.z + .16, 8);
    expect(position.y).toBeCloseTo(.0565, 7);
    world.move(position, 0, .24);
    expect(position.y).toBeCloseTo(.032, 7);
  });

  it('supports the restaurant route lawn and every canonical frontage floor', () => {
    const frontage = buildRestaurantFrontagePlan({ entities });
    const position = { ...restaurant };
    expect(world.ground.heightAt(position.x, position.z)).toBe(RESTAURANT_FRONTAGE_LAYOUT.lawn.elevation);
    world.move(position, 0, 0);
    expect(position.y).toBe(RESTAURANT_FRONTAGE_LAYOUT.lawn.elevation);
    for (const [kind, rect, height] of [
      ['slab', frontage.slab, RESTAURANT_FRONTAGE_LAYOUT.slab.topElevation],
      ['lawn', frontage.lawn, RESTAURANT_FRONTAGE_LAYOUT.lawn.elevation],
      ['connector', frontage.connector, RESTAURANT_FRONTAGE_LAYOUT.connector.topElevation],
    ] as const) {
      expect(rect).not.toBeNull();
      const source = world.ground.surfaces.find(s => s.id === `restaurant-frontage:${kind}`)!;
      expect(source.height).toBe(height);
      expect(source.minX).toBe(rect!.minX); expect(source.maxZ).toBe(rect!.maxZ);
    }
    if (process.env.VISIT_COLLISION_AUDIT === '1') {
      const destination = resolve(process.cwd(), 'artifacts/visit-mode');
      mkdirSync(destination, { recursive: true });
      writeFileSync(resolve(destination, 'ground-contact-audit.json'), JSON.stringify({
        generatedAt: new Date().toISOString(),
        source: 'official-reference with the canonical restaurant unification',
        purpose: 'Numerical regression at captured route coordinates; visual validation remains separate',
        characterRadius: VISIT_CHARACTER_RADIUS,
        points: [ics, roadMargin, restaurant].map((point, i) => ({
          name: ['ICS seam', 'Rua Bolivia margin on Brasilia route', 'Restaurant lawn'][i],
          recordedPosition: point,
          pointHeight: world.ground.heightAt(point.x, point.z),
          footSupportHeight: world.ground.supportAt(point.x, point.z).height,
        })),
        groundSurfaceCount: world.ground.surfaces.length,
        addedVisualMeshes: 0,
      }, null, 2));
    }
  });

  it('does not bridge openings wider than the foot or extend support to empty world', () => {
    const ground = new VisitGroundingSystem([
      visitGroundSurface('deck', visitBoxPolygon(0, 0, 4, 4), .13, [visitBoxPolygon(0, 0, .4, .4)]),
    ]);
    expect(ground.supportAt(0, 0).height).toBe(-.08);
    expect(ground.supportAt(.19, 0).height).toBe(.13);
    expect(ground.supportAt(3, 0).height).toBe(-.08);
    expect(ground.supportAt(0, 0)).toBe(ground.supportAt(1, 1));
    expect(world.ground.supportAt(-70, -60).height).toBe(-.08);
  });

  it('keeps tall structural ledges and thin walls blocking with circular support enabled', () => {
    const ground = new VisitGroundingSystem([
      visitGroundSurface('ground', visitBoxPolygon(0, 0, 10, 10), 0),
      visitGroundSurface('structural-platform', visitBoxPolygon(1, 0, 1, 2), .3),
    ]);
    const bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
    const physics = new VisitCollisionSystem([], bounds);
    const position = { x: 0, y: 0, z: 0 };
    physics.move(position, 2, 0, undefined, undefined, ground.heightAt, ground.supportAt);
    expect(position.x).toBeLessThan(.5 - VISIT_CHARACTER_RADIUS);
    const wall = new VisitCollisionSystem([visitPolygonCollider('thin-wall', visitBoxPolygon(0, 0, .003, 4), 0, .2)], bounds);
    position.x = -.2;
    wall.move(position, 4, 0, undefined, undefined, ground.heightAt, ground.supportAt);
    expect(position.x).toBeLessThan(-.046);
  });
});
