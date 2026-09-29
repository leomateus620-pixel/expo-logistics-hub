import { describe, it, expect } from 'vitest';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { COMMERCIAL_MAP_TREES } from '@/features/commercial-map/data/commercialTrees';
import { PARK_ACCESS_INFRASTRUCTURE_INPUT } from '@/features/commercial-map/utils/parkAccessSpatialPlanAdapter';
import { createFenasojaRestaurantLayout, unifyFenasojaRestaurantEntities } from '@/features/commercial-map/utils/fenasojaRestaurant';
import { strategicLandmarkBounds, strategicLandmarkVisualHeight } from '@/features/commercial-map/utils/landmarks';
import { buildRestaurantFrontagePlan, RESTAURANT_FRONTAGE_LAYOUT } from '@/features/commercial-map/utils/restaurantFrontage';
import { buildVisitWorld } from '@/features/commercial-map/visit/VisitWorld';

describe('physical access to restaurant, tree pits and A2', () => {
  const entities = unifyFenasojaRestaurantEntities(OFFICIAL_REFERENCE_DATA.entities).entities;
  it('supports actual pit soil and keeps trunks out of the street', () => {
    const plan = buildRestaurantFrontagePlan({ entities, trees: COMMERCIAL_MAP_TREES });
    const world = buildVisitWorld({ entities: entities.filter(e => e.publicIdentifier === 'CALCADA-ARVOREDO' || e.publicIdentifier === 'C2'),
      trees: COMMERCIAL_MAP_TREES, includeContext: false });
    expect(plan.treePits).toHaveLength(12);
    for (const [x,z] of plan.treePits) {
      expect(world.ground.heightAt(x,z)).toBeCloseTo(RESTAURANT_FRONTAGE_LAYOUT.treePit.soilElevation, 4);
      expect(world.collisions.isFree({x,y: .03,z})).toBe(false);
    }
    for (const tree of COMMERCIAL_MAP_TREES.filter(t => t.previousSourcePosition && t.area !== 'PAVILIONS_1_14_GROVE')) {
      expect(tree.sourcePosition[0] < 2782 || tree.sourcePosition[0] > 2828).toBe(true);
    }
  });
  it('allows the restaurant porch while keeping the hall and pillars solid', () => {
    const restaurant = entities.find(e => e.publicIdentifier === 'C2')!;
    const b = strategicLandmarkBounds(restaurant);
    const l = createFenasojaRestaurantLayout({width:b.depth,depth:b.width}, strategicLandmarkVisualHeight(restaurant)!);
    const world = buildVisitWorld({entities:[restaurant],trees:[],includeContext:false});
    const p = {x:b.centerX+(l.bodyFrontZ+l.pillarZ)/2,y:0,z:b.centerZ};
    p.y=world.ground.heightAt(p.x,p.z);
    expect(p.y).toBeCloseTo(restaurant.geometry.elevation+l.groundElevation+l.slabHeight,5);
    expect(world.collisions.isFree(p)).toBe(true);
    expect(world.collisions.isFree({x:b.centerX+l.bodyCenterZ,y:p.y,z:b.centerZ})).toBe(false);
    expect(world.collisions.isFree({x:b.centerX+l.pillarZ,y:p.y,z:b.centerZ-l.pillarXs[0]})).toBe(false);
  });
  it('walks through both A2 passages and blocks the service core', () => {
    const gate=PARK_ACCESS_INFRASTRUCTURE_INPUT.gates.find(g=>g.key==='gate2')!;
    const world=buildVisitWorld({entities:[],trees:[],includeContext:true});
    for(const side of [-1,1]) {
      const x=gate.anchor[0]+side*gate.width*.365,z=gate.anchor[1]+gate.depth*.75;
      const pose={x,y:world.ground.heightAt(x,z),z};
      world.move(pose,0,-gate.depth*1.5);
      expect(pose.z).toBeCloseTo(gate.anchor[1]-gate.depth*.75,3);
    }
    expect(world.collisions.isFree({x:gate.anchor[0],y:.055,z:gate.anchor[1]-gate.depth*.42})).toBe(false);
  });
});
