import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_DATA } from '../features/commercial-map/data/officialReference2026';
import { buildVisitWorld } from '../features/commercial-map/visit/VisitWorld';
import { buildVisitGroundSurfaces, VisitGroundingSystem, visitGeometryGroundSurface, visitTerrainOccluded, visitTerrainCameraFraction } from '../features/commercial-map/visit/VisitGroundingSystem';
import { buildExporuralLandscape, EXPORURAL_WELL } from '../features/commercial-map/utils/exporuralLandscape';
import { buildElectricalSceneLayout, selectCommercialElectricalInfrastructureForScene } from '../features/commercial-map/utils/electricalInfrastructure';
import { createGastronomicAlamedaLayout, fitRotatedStructureBounds } from '../features/commercial-map/utils/fenasojaReferenceStructures';
import { strategicLandmarkBounds, strategicLandmarkFacingRadians, strategicLandmarkVisualHeight } from '../features/commercial-map/utils/landmarks';
import { SOY_RESTROOM_PRESENTATION } from '../features/commercial-map/utils/soyGateArchitecture';

const { entities, lots } = OFFICIAL_REFERENCE_DATA;

describe('Visit adapters for current canonical architecture', () => {
  it('occludes a POI behind a terrain crest while preserving a clear view above the bank', () => {
    let calls = 0;
    const ground = { heightAt: (x: number) => { calls++; return x > .35 && x < .65 ? .32 : 0; } };
    expect(visitTerrainOccluded(ground, { x: 0, y: .24, z: 0 }, { x: 1, y: .1, z: 0 })).toBe(true);
    expect(calls).toBeLessThanOrEqual(13);
    expect(visitTerrainOccluded(ground, { x: 0, y: .6, z: 0 }, { x: 1, y: .5, z: 0 })).toBe(false);
    expect(visitTerrainOccluded({ heightAt: () => 0 }, { x: 0, y: .24, z: 0 }, { x: 1, y: .04, z: 0 })).toBe(false);
  });

  it('retracts a 0.66-unit camera boom before a crest even when both endpoints are clear', () => {
    let calls = 0;
    const ground = { maximumHeight: .35, heightAt: (x: number) => { calls++; return x >= .28 && x <= .42 ? .35 : 0; } };
    const from = { x: 0, y: .24, z: 0 }, to = { x: .66, y: .3, z: 0 };
    expect(ground.heightAt(from.x)).toBe(0); expect(ground.heightAt(to.x)).toBe(0); calls = 0;
    const fraction = visitTerrainCameraFraction(ground, from, to, .035);
    expect(fraction).toBeLessThan(.28 / .66);
    expect(fraction).toBeGreaterThan(.28 / .66 - .0002);
    expect(calls).toBeLessThanOrEqual(24);
    // Preserve a nearer architectural hit and skip sampling wholly aerial rays.
    expect(visitTerrainCameraFraction(ground, from, to, .035, .2)).toBe(.2);
    calls = 0;
    expect(visitTerrainCameraFraction(ground, { ...from, y: .5 }, { ...to, y: .6 }, .035)).toBe(1);
    expect(calls).toBe(0);
    // An unknown height function cannot receive that optimization.
    expect(visitTerrainCameraFraction({ heightAt: ground.heightAt }, from, to, .035)).toBeLessThan(1);
  });

  it('supports the exact Exporural bank/terrace triangles without exposing dense facets to park broad phase', () => {
    const model = buildExporuralLandscape(entities);
    const ground = new VisitGroundingSystem(buildVisitGroundSurfaces(entities, false));
    expect(Number.isFinite(ground.maximumHeight)).toBe(true);
    expect(ground.surfaces.filter(s => s.id.startsWith('exporural:'))).toHaveLength(3);
    for (const key of ['borders', 'slopes', 'terrace'] as const) {
      const geometry = model[key]!;
      const surface = visitGeometryGroundSurface(`reference:${key}`, geometry)!;
      const support = new VisitGroundingSystem([surface], -Infinity);
      const p = geometry.getAttribute('position'), indices = geometry.index;
      const count = indices?.count ?? p.count;
      for (let i = 0; i + 2 < count; i += Math.max(3, Math.floor(count / 90 / 3) * 3)) {
        const a = indices ? indices.getX(i) : i, b = indices ? indices.getX(i + 1) : i + 1, c = indices ? indices.getX(i + 2) : i + 2;
        const x = (p.getX(a) + p.getX(b) + p.getX(c)) / 3, z = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
        const y = (p.getY(a) + p.getY(b) + p.getY(c)) / 3;
        expect(support.heightAt(x, z)).toBeCloseTo(y, 6);
        expect(ground.heightAt(x, z)).toBeGreaterThanOrEqual(y - .000001);
        expect(ground.index.lastCandidateCount).toBeLessThan(25);
      }
      geometry.dispose();
    }
  }, 15000);

  it('blocks only the fenced well footprint inside the otherwise traversable Q-R-02 lot', () => {
    const r2 = entities.find(e => e.publicIdentifier === 'Q-R-02')!;
    const world = buildVisitWorld({ entities: [r2], trees: [], includeContext: false });
    expect(world.collisions.colliders.some(c => c.id === r2.id)).toBe(false);
    const [x, z] = EXPORURAL_WELL.position, y = r2.geometry.elevation + r2.geometry.extrusionHeight;
    expect(world.collisions.isFree({ x, y, z })).toBe(false);
    const around = { x: x + .5, y, z };
    expect(world.collisions.isFree(around)).toBe(true);
    world.move(around, -1, 0);
    expect(around.x).toBeGreaterThan(x + .33);
  });

  it('uses the rendered electrical placements rather than original source anchors', () => {
    const inventory = selectCommercialElectricalInfrastructureForScene(entities, lots);
    const placements = buildElectricalSceneLayout(inventory.nodes, inventory.connections, entities, true).placements;
    const world = buildVisitWorld({ entities: [], trees: [], electricalPlacements: placements, includeContext: false });
    const byId = new Map(world.collisions.colliders.map(c => [c.id, c]));
    expect(placements.length).toBeGreaterThan(400);
    for (const placement of placements) {
      const collider = byId.get(placement.node.id)!;
      expect(collider).toBeDefined();
      if (placement.node.type === 'POLE') {
        expect(collider.kind).toBe('circle');
        if (collider.kind !== 'circle') continue;
        expect([collider.x, collider.z]).toEqual(placement.renderPosition);
        expect(collider.radius).toBe(placement.node.radius);
        expect(collider.minY).toBe(placement.groundElevation);
      }
    }
  }, 15000);

  it('retains Alameda stair/porch access while blocking its actual walls, columns and rails', () => {
    const d1 = entities.find(e => e.publicIdentifier === 'D1')!;
    const b = strategicLandmarkBounds(d1), yaw = strategicLandmarkFacingRadians(d1);
    const layout = createGastronomicAlamedaLayout(fitRotatedStructureBounds(b, yaw), strategicLandmarkVisualHeight(d1)!);
    const world = buildVisitWorld({ entities: [d1], trees: [], includeContext: false });
    const point = (x: number, z: number) => ({ x: b.centerX + x * Math.cos(yaw) + z * Math.sin(yaw), y: d1.geometry.elevation + layout.platform.topY, z: b.centerZ - x * Math.sin(yaw) + z * Math.cos(yaw) });
    const facade = point(0, layout.building.centerZ);
    expect(world.collisions.isFree(facade)).toBe(false);
    const porch = point(0, (layout.building.frontZ + layout.platform.frontZ - .18) / 2);
    expect(world.collisions.isFree(porch)).toBe(true);
    const stair = point(0, layout.access.frontZ - layout.access.stepDepth / 2);
    stair.y = world.ground.heightAt(stair.x, stair.z);
    expect(stair.y).toBeCloseTo(d1.geometry.elevation + layout.access.stepRise, 8);
    world.move(stair, -Math.sin(yaw) * layout.access.stairRun * .8, -Math.cos(yaw) * layout.access.stairRun * .8);
    expect(stair.y).toBeGreaterThan(d1.geometry.elevation + layout.access.stepRise * 3);
    const pier = point(-layout.building.width / 2, layout.platform.frontZ - .18);
    expect(world.collisions.isFree(pier)).toBe(false);
    expect(world.cameraProbe(porch, { ...porch, y: porch.y + 3 })).toBeLessThan(1);
    expect(world.collisions.colliders.filter(c => c.id.startsWith(`${d1.id}:flagpole:`))).toHaveLength(layout.flagpoles.count);
  });

  it('inherits the revised E-07 presentation height and rotated physical footprint', () => {
    const entity = entities.find(e => e.publicIdentifier === 'E-07')!;
    const world = buildVisitWorld({ entities: [entity], trees: [], includeContext: false });
    const collider = world.collisions.colliders.find(c => c.id === entity.id)!;
    expect(collider.maxY).toBeCloseTo(entity.geometry.elevation + SOY_RESTROOM_PRESENTATION.visualHeight, 8);
    expect(collider.maxX - collider.minX).toBeCloseTo(1.8, 8);
    expect(collider.maxZ - collider.minZ).toBeCloseTo(1.3, 8);
  });
});
