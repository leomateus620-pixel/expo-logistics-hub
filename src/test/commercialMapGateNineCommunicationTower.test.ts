import { describe, expect, it } from 'vitest';
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { createExporural2028Preview } from '@/features/commercial-map/data/exporuralReference2028';
import { COMMERCIAL_MAP_TREES } from '@/features/commercial-map/data/commercialTrees';
import { GATE_NINE_COMMUNICATION_TOWER as spec, GATE_NINE_LIGHTNING } from '@/features/commercial-map/data/gateNineCommunicationTower';
import { buildGateNineCommunicationTowerGeometry, buildGateNineCommunicationTowerPlan, buildGateNineLightningGeometry } from '@/features/commercial-map/utils/gateNineCommunicationTower';
import { advanceGateNineLightning, createGateNineLightningState, gateNineLightningPaths } from '@/features/commercial-map/utils/gateNineLightning';
import { buildVisitWorld } from '@/features/commercial-map/visit/VisitWorld';

describe('Gate 9 communication mast is independent presentation', () => {
  for (const [revision, data] of [['2026', OFFICIAL_REFERENCE_DATA], ['2028', createExporural2028Preview()]] as const) {
    it(`fits beside the existing tanks in ${revision}, preserving roads, parcels and trunks`, () => {
      const before = JSON.stringify(data.entities);
      const plan = buildGateNineCommunicationTowerPlan(data.entities)!;
      expect(plan).not.toBeNull();
      const tanks = data.entities.find(e => e.publicIdentifier === 'RES-A9')!;
      expect(plan.ownerEntityId).toBe(tanks.id);
      expect(plan.position[0]).toBeLessThan(Math.min(...tanks.geometry.coordinates[0].map(p => p[0])));
      const footprint: MultiPolygon = [[plan.footprint.map(p => [p[0], p[1]])]];
      for (const entity of data.entities.filter(e => ['ROAD', 'PAVILION', 'BUILDING', 'SELLABLE_LOT', 'INTERNAL_STAND'].includes(e.classification))) {
        expect(polygonClipping.intersection(footprint, [entity.geometry.coordinates]), entity.publicIdentifier).toEqual([]);
      }
      expect(polygonClipping.intersection(footprint, [tanks.geometry.coordinates])).toEqual([]);
      const half = (plan.footprint[1][0] - plan.footprint[0][0]) / 2;
      for (const tree of COMMERCIAL_MAP_TREES.filter(t => t.isVisible)) {
        const distance = Math.hypot(Math.max(0, Math.abs(tree.position[0] - plan.position[0]) - half),
          Math.max(0, Math.abs(tree.position[1] - plan.position[2]) - half));
        expect(distance, tree.id).toBeGreaterThan(tree.trunkRadius + .025);
      }
      expect(JSON.stringify(data.entities)).toBe(before);
      expect(spec.measuredHeight).toBeNull();
      expect(spec.contributesToCommercialMetrics).toBe(false);
    });
  }

  it('renders nothing without active tanks or a free foundation site', () => {
    const tanks = OFFICIAL_REFERENCE_DATA.entities.find(e => e.publicIdentifier === 'RES-A9')!;
    expect(buildGateNineCommunicationTowerPlan([])).toBeNull();
    expect(buildGateNineCommunicationTowerPlan([{ ...tanks, isArchived: true }])).toBeNull();
    expect(buildGateNineCommunicationTowerPlan([{ ...tanks, geometry: { ...tanks.geometry, coordinates: [[[NaN, 0], [0, 1], [1, 0]]] } }])).toBeNull();
    const blocker = { ...tanks, id: 'tower-test-blocker', publicIdentifier: 'TEST-BUILDING', classification: 'BUILDING' as const,
      geometry: { ...tanks.geometry, coordinates: [[[-100, -100], [100, -100], [100, 100], [-100, 100], [-100, -100]]] as [number, number][][] } };
    expect(buildGateNineCommunicationTowerPlan([tanks, blocker])).toBeNull();
  });

  it('keeps every physical tower part inside the collision footprint and embeds all four feet in the authored floor', () => {
    const entities = createExporural2028Preview().entities;
    const plan = buildGateNineCommunicationTowerPlan(entities)!;
    const world = buildVisitWorld({ entities, trees: [], includeContext: true });
    const [x, y, z] = plan.position;
    const floor = world.ground.heightAt(x, z);
    const parts = buildGateNineCommunicationTowerGeometry();
    try {
      const half = (plan.footprint[1][0] - plan.footprint[0][0]) / 2;
      for (const part of parts) {
        const bounds = part.geometry.boundingBox!;
        expect(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x), Math.abs(bounds.min.z), Math.abs(bounds.max.z))).toBeLessThan(half);
        expect(bounds.max.y + y).toBeLessThanOrEqual(plan.maxHeight + 1e-5);
      }
      const foot = parts.find(part => part.key === 'concrete')!.geometry.boundingBox!;
      expect(foot.min.y + y).toBeLessThan(floor - .02);
      expect(foot.max.y + y).toBeGreaterThan(floor);
      const collider = world.collisions.colliders.find(c => c.id === spec.presentationId)!;
      if (collider.kind !== 'polygon') throw new Error('The mast requires its physical polygon collider.');
      expect(collider.polygon).toEqual(plan.footprint);
      expect(collider.minY).toBeLessThan(floor);
      expect(collider.maxY).toBe(plan.maxHeight);
      expect(world.collisions.isFree({ x, y: floor, z })).toBe(false);
      const withoutContext = buildVisitWorld({ entities: [entities.find(e => e.publicIdentifier === 'RES-A9')!], trees: [], includeContext: false });
      expect(withoutContext.collisions.colliders.some(c => c.id === spec.presentationId)).toBe(false);
    } finally { parts.forEach(part => part.geometry.dispose()); }
  }, 30_000);

  it('uses one cloud-to-tip channel with attached side branches and bounded geometry', () => {
    const paths = gateNineLightningPaths(spec.height);
    expect(paths).toHaveLength(7);
    expect(paths[0][0][1]).toBe(GATE_NINE_LIGHTNING.cloudHeight);
    expect(paths[0].at(-1)).toEqual([0, spec.height, 0]);
    for (const branch of paths.slice(1)) expect(paths[0]).toContainEqual(branch[0]);
    for (let i = 1; i < paths[0].length; i++) expect(paths[0][i][1]).toBeLessThan(paths[0][i - 1][1]);
    const geometry = buildGateNineLightningGeometry();
    try {
      expect(geometry).toHaveLength(3);
      for (const layer of geometry) {
        expect(layer.getAttribute('position').count).toBeLessThan(9000);
        expect(Array.from(layer.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      }
    } finally { geometry.forEach(g => g.dispose()); }
  });
});

describe('one lightning burst three seconds after every Rain activation', () => {
  it('delays exactly three seconds and keeps three distinct return strokes inside a 1.2 second burst', () => {
    const state = createGateNineLightningState();
    expect(advanceGateNineLightning(state, true, 100).phase).toBe('waiting');
    expect(advanceGateNineLightning(state, true, 3099).energy).toBe(0);
    expect(state.strikes).toBe(0);
    expect(advanceGateNineLightning(state, true, 3122).energy).toBeGreaterThan(.99);
    const firstValley = advanceGateNineLightning(state, true, 3370).energy;
    expect(advanceGateNineLightning(state, true, 3392).energy).toBeGreaterThan(firstValley * 8);
    const secondValley = advanceGateNineLightning(state, true, 3730).energy;
    expect(advanceGateNineLightning(state, true, 3768).energy).toBeGreaterThan(secondValley * 8);
    expect(advanceGateNineLightning(state, true, 4300)).toMatchObject({ phase: 'complete', energy: 0, needsFrame: false });
    expect(advanceGateNineLightning(state, true, 90_000).phase).toBe('complete');
    expect(state.strikes).toBe(1);
  });

  it('cancels before the strike and during the flash, then restarts the full delay on the next activation', () => {
    const state = createGateNineLightningState();
    advanceGateNineLightning(state, true, 0);
    expect(advanceGateNineLightning(state, false, 2000)).toMatchObject({ phase: 'idle', energy: 0, leader: 0, needsFrame: false });
    advanceGateNineLightning(state, true, 2100);
    expect(advanceGateNineLightning(state, true, 5099).phase).toBe('waiting');
    expect(advanceGateNineLightning(state, true, 5122).phase).toBe('strike');
    expect(advanceGateNineLightning(state, false, 5140).energy).toBe(0);
    advanceGateNineLightning(state, true, 6000);
    expect(advanceGateNineLightning(state, true, 8999).phase).toBe('waiting');
    expect(advanceGateNineLightning(state, true, 9022).energy).toBeGreaterThan(.99);
    expect(state.activations).toBe(3);
    expect(state.strikes).toBe(2);
  });

  it('honors the requested complete event with reduced motion, without repeated strikes while Rain remains on', () => {
    const normal = createGateNineLightningState(), reduced = createGateNineLightningState();
    for (let activation = 0; activation < 3; activation++) {
      const start = activation * 10_000;
      advanceGateNineLightning(normal, false, start); advanceGateNineLightning(reduced, false, start, true);
      for (const t of [0, 2999, 3000, 3022, 3100, 3292, 3668, 4199, 4200, 9000]) {
        expect(advanceGateNineLightning(reduced, true, start + t, true)).toEqual(advanceGateNineLightning(normal, true, start + t));
      }
    }
    expect(normal.strikes).toBe(3);
    expect(reduced.strikes).toBe(3);
  });
});
