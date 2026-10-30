import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import { PAVILION_COURTYARD } from '@/features/commercial-map/data/pavilionCourtyard';
import { PAVILION_CONNECTED_COMPLEX } from '@/features/commercial-map/data/pavilionConnectedComplex';
import { buildPavilionConnectedComplex } from '@/features/commercial-map/utils/pavilionConnectedComplex';
import { createPavilionJoinGeometry } from '@/features/commercial-map/components/canvas/pavilions/PavilionConnectedComplex';
import { createPavilionGroundInterfaces, pavilionGroundRectPolygon, pavilionGroundRampHeight } from '@/features/commercial-map/utils/pavilionGroundInterfaces';
import { commercialPavilionModelBounds, createCommercialPavilionLayout, resolveCommercialPavilionDefinition } from '@/features/commercial-map/utils/commercialPavilions';
import { pavilionArchitectureEaveY } from '@/features/commercial-map/utils/pavilionArchitectureLayout';
import { strategicLandmarkBounds, strategicLandmarkFacingRadians, strategicLandmarkVisualHeight } from '@/features/commercial-map/utils/landmarks';
import { buildVisitWorld } from '@/features/commercial-map/visit/VisitWorld';
import type { MapEntity } from '@/features/commercial-map/types';

const source = OFFICIAL_REFERENCE_ENTITIES.filter(entity => ['B1', 'B3', 'B4', 'B5', 'B6'].includes(entity.publicIdentifier));
const persisted = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/validation/pavilion-architecture-2026/persisted-footprints.json'), 'utf8')).rows;
const entities: MapEntity[] = source.map(entity => {
  const row = persisted.find((row: { public_identifier: string }) => row.public_identifier === entity.publicIdentifier);
  return { ...entity, geometry: { ...entity.geometry, coordinates: row.geometry.coordinates, elevation: Number(row.elevation), extrusionHeight: Number(row.extrusion_height) } };
});
const layoutFor = (entity: MapEntity) => createCommercialPavilionLayout(commercialPavilionModelBounds(strategicLandmarkBounds(entity), strategicLandmarkFacingRadians(entity)), resolveCommercialPavilionDefinition(entity)!, strategicLandmarkVisualHeight(entity) ?? undefined);
const shape = (ring: readonly (readonly [number, number])[]): MultiPolygon => [[ring.map(point => [point[0], point[1]])]];

// The captured database rows contain no buyer or commercial order information.
// They supplement, rather than replace, the runtime's already authorized data.
describe('photo-derived pavilion construction continuity', () => {
  it('closes exactly the two measured shell gaps from the current persisted footprints', () => {
    const joins = buildPavilionConnectedComplex(entities);
    expect(joins.map(join => join.identifiers)).toEqual([['B4', 'B5'], ['B5', 'B6']]);
    expect(joins[0].cadastralGap).toBeCloseTo(.24, 9);
    expect(joins[1].cadastralGap).toBeCloseTo(.3272727272, 8);
    expect(joins[0].shellGap).toBeCloseTo(.3829090909, 8);
    expect(joins[1].shellGap).toBeCloseTo(.5170909091, 8);
    expect(new Set(joins.map(join => join.owner)).size).toBe(2);
    expect(PAVILION_CONNECTED_COMPLEX.pairs.map(pair => pair.owner)).toEqual(joins.map(join => join.owner));
    for (const join of joins) {
      const west = entities.find(entity => entity.id === join.entityIds[0])!, east = entities.find(entity => entity.id === join.entityIds[1])!;
      const wl = layoutFor(west), el = layoutFor(east), wb = strategicLandmarkBounds(west), eb = strategicLandmarkBounds(east);
      expect(join.minX).toBe(wb.centerX + wl.exterior.shell.width / 2);
      expect(join.maxX).toBe(eb.centerX - el.exterior.shell.width / 2);
      expect(join.westEaveY).toBe(west.geometry.elevation + pavilionArchitectureEaveY(wl));
      expect(join.eastEaveY).toBe(east.geometry.elevation + pavilionArchitectureEaveY(el));
      const footprint = shape([[join.minX, join.minZ], [join.maxX, join.minZ], [join.maxX, join.maxZ], [join.minX, join.maxZ]]);
      for (const entity of OFFICIAL_REFERENCE_ENTITIES.filter(entity => entity.classification === 'ROAD')) {
        expect(polygonClipping.intersection(footprint, shape(entity.geometry.coordinates[0])), entity.publicIdentifier).toEqual([]);
      }
      for (const tree of PAVILION_COURTYARD.trees) expect(polygonClipping.intersection(footprint, shape(tree.rootOpening))).toEqual([]);
      const geometry = createPavilionJoinGeometry(join);
      for (const part of Object.values(geometry)) {
        part.computeBoundingBox();
        expect(part.boundingBox!.min.x).toBeCloseTo(join.minX, 5);
        expect(part.boundingBox!.max.x).toBeCloseTo(join.maxX, 5);
        // No vertical side faces coincide with either existing shell wall.
        const positions = part.getAttribute('position');
        for (let offset = 0; offset < positions.count; offset += 3) {
          const xs = [0, 1, 2].map(index => positions.getX(offset + index));
          expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0);
        }
        part.dispose();
      }
    }
  });

  it('never fills missing, archived, distant or differently oriented neighbors', () => {
    expect(buildPavilionConnectedComplex(entities.filter(entity => entity.publicIdentifier === 'B5'))).toEqual([]);
    expect(buildPavilionConnectedComplex(entities.map(entity => entity.publicIdentifier === 'B5' ? { ...entity, isArchived: true } : entity))).toEqual([]);
    const moved = entities.map(entity => entity.publicIdentifier === 'B5' ? { ...entity, geometry: { ...entity.geometry, coordinates: entity.geometry.coordinates.map(ring => ring.map(([x, z]) => [x + 10, z] as [number, number])) } } : entity);
    expect(buildPavilionConnectedComplex(moved)).toEqual([]);
    expect(buildPavilionConnectedComplex(entities.filter(entity => entity.publicIdentifier !== 'B4')).map(join => join.id)).toEqual(['p13-p3']);
  });

  it('has closed simple visit blockers for the two seams without introducing commercial ownership', () => {
    const world = buildVisitWorld({ entities, trees: [], includeContext: false });
    for (const join of buildPavilionConnectedComplex(entities)) {
      expect(world.collisions.colliders.filter(collider => collider.id === join.owner)).toHaveLength(1);
      expect(world.collisions.isFree({ x: (join.minX + join.maxX) / 2, y: join.floorY, z: (join.minZ + join.maxZ) / 2 })).toBe(false);
    }
  });
});

describe('Pavilion 3 ground interface', () => {
  const entity = entities.find(entity => entity.publicIdentifier === 'B6')!;
  const layout = layoutFor(entity), plan = createPavilionGroundInterfaces(layout);
  it('keeps both gate thresholds at the existing floor and steps clear of the ramp', () => {
    const landing = plan.landings.find(part => part.id === 'p3:gate-landing')!;
    expect(landing.topY).toBe(layout.interior.floorY);
    const width = layout.exterior.shell.width;
    for (const [center, span] of [[.04, .19], [.27, .17]]) {
      expect(landing.minX).toBeLessThanOrEqual((center - span / 2) * width + 1e-9);
      expect(landing.maxX).toBeGreaterThanOrEqual((center + span / 2) * width - 1e-9);
    }
    for (const step of plan.steps) for (const ramp of plan.ramps) expect(polygonClipping.intersection(shape(pavilionGroundRectPolygon(step)), shape(pavilionGroundRectPolygon(ramp)))).toEqual([]);
    expect(plan.rails.every(rail => rail.from[2] > layout.exterior.shell.frontZ)).toBe(true);
    for (const part of [...plan.landings, ...plan.steps, ...plan.ramps]) {
      expect(part.minX).toBeGreaterThanOrEqual(-layout.width / 2);
      expect(part.maxX).toBeLessThanOrEqual(layout.width / 2);
      expect(part.maxZ).toBeLessThanOrEqual(layout.depth / 2);
      expect(part.minZ).toBeGreaterThan(layout.exterior.shell.frontZ - .013);
    }
    for (const other of entities.filter(entity => entity.publicIdentifier !== 'B6')) expect(createPavilionGroundInterfaces(layoutFor(other)).ramps).toEqual([]);
  });

  it('uses the same numerical ramp plane and retains the closed shell in visit mode', () => {
    const world = buildVisitWorld({ entities: [entity], trees: [], includeContext: false });
    const bounds = strategicLandmarkBounds(entity), yaw = strategicLandmarkFacingRadians(entity), c = Math.cos(yaw), s = Math.sin(yaw);
    const ramp = plan.ramps[0], z = (ramp.minZ + ramp.maxZ) / 2;
    for (const t of [.05, .2, .5, .8, .95]) {
      const x = ramp.minX + (ramp.maxX - ramp.minX) * t;
      const wx = bounds.centerX + x * c + z * s, wz = bounds.centerZ - x * s + z * c;
      expect(world.ground.heightAt(wx, wz)).toBeCloseTo(pavilionGroundRampHeight(ramp, x), 10);
      expect(world.collisions.isFree({ x: wx, y: world.ground.heightAt(wx, wz), z: wz })).toBe(true);
    }
    expect(world.collisions.isFree({ x: bounds.centerX, y: plan.floorY, z: bounds.centerZ })).toBe(false);
    const supports = world.ground.surfaces.filter(surface => surface.id.startsWith('p3:'));
    expect(supports).toHaveLength(plan.landings.length + plan.steps.length + plan.ramps.length);
  });
});

describe('Pavilion 1 continuous concrete frontage', () => {
  const entity = entities.find(entity => entity.publicIdentifier === 'B1')!;
  const layout = layoutFor(entity), bounds = strategicLandmarkBounds(entity);
  const plan = createPavilionGroundInterfaces(layout), threshold = plan.landings[0];
  const yaw = strategicLandmarkFacingRadians(entity), c = Math.cos(yaw), s = Math.sin(yaw);
  const transform = ([x, z]: readonly [number, number]): readonly [number, number] => [bounds.centerX + x * c + z * s, bounds.centerZ - x * s + z * c];
  const thresholdPolygon = shape(pavilionGroundRectPolygon(threshold).map(transform));
  const contains = (multi: MultiPolygon, [x, z]: readonly [number, number]) => multi.some(rings => {
    const inside = (ring: number[][]) => {
      let hit = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
      }
      return hit;
    };
    return inside(rings[0]) && !rings.slice(1).some(inside);
  });

  it('joins the existing wall inset to the full apron with separate adjacent floor owners', () => {
    expect(plan.landings).toHaveLength(1);
    expect(threshold.id).toBe('p1:front-apron-threshold');
    expect(threshold.topY).toBe(PAVILION_COURTYARD.elevation);
    expect(threshold.minZ).toBe(layout.exterior.shell.frontZ);
    expect(threshold.maxZ).toBe(layout.depth / 2);
    expect(polygonClipping.intersection(thresholdPolygon, PAVILION_COURTYARD.hardscape)).toEqual([]);
    const apron = PAVILION_COURTYARD.pavilion1FrontApron;
    const concrete = polygonClipping.union(thresholdPolygon, PAVILION_COURTYARD.hardscape);
    const pit = shape(PAVILION_COURTYARD.trees[1].rootOpening);
    // Sample the entire photographed front and several rays toward the apron
    // edge, including the narrow strip previously left green by the wall inset.
    for (const zRatio of [.05, .2, .4, .6, .8, .95]) {
      const z = bounds.minZ + bounds.depth * zRatio;
      for (const x of [bounds.centerX + layout.exterior.shell.frontZ + .001, bounds.maxX - .001, bounds.maxX + .001, apron.maxX - .01]) {
        if (contains(pit, [x, z])) continue;
        expect(contains(concrete, [x, z]), `${x},${z}`).toBe(true);
      }
    }
  });

  it('keeps the root opening, roads, commercial modules and numerical support intact', () => {
    for (const tree of PAVILION_COURTYARD.trees) {
      expect(polygonClipping.intersection(PAVILION_COURTYARD.hardscape, shape(tree.rootOpening))).toEqual([]);
      expect(polygonClipping.intersection(thresholdPolygon, shape(tree.rootOpening))).toEqual([]);
    }
    for (const protectedEntity of OFFICIAL_REFERENCE_ENTITIES.filter(candidate => candidate.classification === 'ROAD' || candidate.parentEntityId === entity.id)) {
      expect(polygonClipping.intersection(thresholdPolygon, shape(protectedEntity.geometry.coordinates[0])), protectedEntity.publicIdentifier).toEqual([]);
    }
    const world = buildVisitWorld({ entities: [entity], trees: [], includeContext: true });
    const sampleZ = bounds.minZ + bounds.depth * .18;
    for (const x of [bounds.maxX - .001, bounds.maxX + .001, PAVILION_COURTYARD.pavilion1FrontApron.maxX - .01]) {
      expect(world.ground.heightAt(x, sampleZ)).toBeCloseTo(PAVILION_COURTYARD.elevation, 10);
    }
    expect(world.ground.heightAt(...PAVILION_COURTYARD.trees[1].position)).toBeLessThan(PAVILION_COURTYARD.elevation);
  });
});
