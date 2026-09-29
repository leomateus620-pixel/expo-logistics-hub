import { describe, expect, it } from 'vitest';
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import * as THREE from 'three';
import { PAVILION_COURTYARD } from '@/features/commercial-map/data/pavilionCourtyard';
import { OFFICIAL_REFERENCE_ENTITIES, officialPdfPointToLocal } from '@/features/commercial-map/data/officialReference2026';
import { PARK_ACCESS_SPATIAL_PLAN } from '@/features/commercial-map/data/parkAccessSpatialPlan';
import { resolveParkAccessEnvironmentPresentation } from '@/features/commercial-map/data/parkAccessEnvironment';
import { PARK_ACCESS_INFRASTRUCTURE_INPUT } from '@/features/commercial-map/utils/parkAccessSpatialPlanAdapter';
import { buildParkAccessRenderModel, disposeParkAccessRenderModel } from '@/features/commercial-map/utils/parkAccessInfrastructure';
import { pointInPolygon } from '@/features/commercial-map/utils/spatialSurface';
import { buildVisitWorld } from '@/features/commercial-map/visit/VisitWorld';

const polygon = (rings: readonly (readonly (readonly [number, number])[])[]): MultiPolygon =>
  [rings.map(ring => ring.map(p => [p[0], p[1]]))];
const contains = (multi: MultiPolygon, point: readonly [number, number]) => multi.some(rings =>
  pointInPolygon(point, rings[0]) && !rings.slice(1).some(hole => pointInPolygon(point, hole)));
const point = officialPdfPointToLocal;

describe('pavement between Pavilions 1, 14 and 12', () => {
  it('replaces the single concrete plate with an asphalt street connected to Alameda Mercosul', () => {
    expect(PAVILION_COURTYARD.pathEnd).toEqual(PARK_ACCESS_SPATIAL_PLAN.woodlandPath.centerline.at(-1));
    expect(PAVILION_COURTYARD.road).toHaveLength(1);
    expect(PAVILION_COURTYARD.roadIdentifier).not.toBe('RUA-ARGENTINA');
    for (const source of [[2430, 3800], [2550, 3800], [2710, 3800], [2800, 3800]] as const) {
      expect(contains(PAVILION_COURTYARD.road, point(source)), source.join(',')).toBe(true);
      expect(contains(PAVILION_COURTYARD.hardscape, point(source))).toBe(false);
    }
    const seam = PAVILION_COURTYARD.road[0][0].filter(p => Math.abs(p[1] - point([2800, 3780])[1]) < 1e-6);
    expect(seam.length).toBeGreaterThanOrEqual(2);
    expect(contains(PAVILION_COURTYARD.hardscape, point([2500, 3768]))).toBe(true);
    expect(polygonClipping.intersection(PAVILION_COURTYARD.road, PAVILION_COURTYARD.hardscape)).toEqual([]);
  });

  it('preserves official footprints and provides concrete at all four inner and avenue facades', () => {
    const protectedEntities = OFFICIAL_REFERENCE_ENTITIES.filter(e =>
      (PAVILION_COURTYARD.anchorIdentifiers.includes(e.publicIdentifier as 'B1') || e.classification === 'ROAD')
      && !PAVILION_COURTYARD.retiredFrontageMasks.includes(e.publicIdentifier as 'B33'));
    for (const entity of protectedEntities) {
      for (const surface of [PAVILION_COURTYARD.road, PAVILION_COURTYARD.hardscape]) {
        expect(polygonClipping.intersection(surface, polygon(entity.geometry.coordinates)), entity.publicIdentifier).toEqual([]);
      }
    }
    for (const source of [[2700, 4000], [2750, 4130], [2835, 3810], [2997, 3810], [3060, 3810], [3210, 3784], [3360, 3784], [3550, 3783]] as const) {
      expect(contains(PAVILION_COURTYARD.hardscape, point(source)), source.join(',')).toBe(true);
    }
    for (const source of [[3000, 4095], [3210, 4108], [3360, 4065], [3550, 4105]] as const) {
      expect(PARK_ACCESS_INFRASTRUCTURE_INPUT.sidewalkSurfaces.some(s =>
        contains(polygon([s.polygon, ...(s.holes ?? [])]), point(source))), source.join(',')).toBe(true);
    }
    expect(PAVILION_COURTYARD.officialMeasurements).toBe(false);
  });

  it('has one infrastructure owner, no natural-ground overlap and two actual root openings', () => {
    for (const reduced of [false, true]) {
      const presentation = resolveParkAccessEnvironmentPresentation(reduced);
      expect(presentation.environmentalSurfaces.some(p => p.kind === 'PAVILION_CONCRETE')).toBe(false);
      for (const tree of PAVILION_COURTYARD.trees) {
        expect(contains(PAVILION_COURTYARD.hardscape, tree.position)).toBe(false);
        expect(contains(PAVILION_COURTYARD.road, tree.position)).toBe(false);
        expect(presentation.ambientTrees.filter(p => p.sourceZoneId === tree.sourceZoneId)).toHaveLength(1);
      }
      expect(presentation.diagnostics.primaryDrawCalls).toBe(4);
      expect(presentation.diagnostics.shadowDrawCalls).toBe(0);
      for (const ground of [...presentation.environmentalSurfaces, ...presentation.trailSurfaces]) {
        expect(polygonClipping.intersection(polygon([ground.polygon, ...ground.holes]),
          PAVILION_COURTYARD.occupied), ground.id).toEqual([]);
      }
    }
    const sidewalks = PARK_ACCESS_INFRASTRUCTURE_INPUT.sidewalkSurfaces;
    for (const road of PARK_ACCESS_INFRASTRUCTURE_INPUT.roadSurfaces.filter(s =>
      s.id.startsWith('pavilions-') || s.id === 'benvenuto-four-lane-axis')) {
      for (const walk of sidewalks) {
        expect(polygonClipping.intersection(polygon([road.polygon, ...(road.holes ?? [])]),
          polygon([walk.polygon, ...(walk.holes ?? [])])), road.id + '/' + walk.id).toEqual([]);
      }
    }
  });

  it('keeps the expanded concrete below eighty triangles and uses existing geometry batches', () => {
    let triangles = 0;
    for (const rings of PAVILION_COURTYARD.hardscape) {
      const shape = new THREE.Shape(rings[0].map(p => new THREE.Vector2(p[0], -p[1])));
      shape.holes = rings.slice(1).map(ring => new THREE.Path(ring.map(p => new THREE.Vector2(p[0], -p[1]))));
      const geometry = new THREE.ShapeGeometry(shape);
      triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
      geometry.dispose();
    }
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThanOrEqual(80);
    const model = buildParkAccessRenderModel(PARK_ACCESS_INFRASTRUCTURE_INPUT);
    try { expect(model.diagnostics.withinBudget).toBe(true); }
    finally { disposeParkAccessRenderModel(model); }
  });

  it('walks the street and sidewalks, collides with B1 and preserves the tree root opening', () => {
    const entities = OFFICIAL_REFERENCE_ENTITIES.filter(e => e.publicIdentifier.startsWith('B') || e.classification === 'ROAD');
    const world = buildVisitWorld({ entities, trees: [], includeContext: true });
    const start = point([2440, 3800]), end = point([2720, 3800]);
    const pose = { x: start[0], y: world.ground.heightAt(...start), z: start[1] };
    world.move(pose, end[0] - start[0], end[1] - start[1]);
    expect(pose.x).toBeCloseTo(end[0], 3);
    expect(pose.z).toBeCloseTo(end[1], 3);
    expect(pose.y).toBeCloseTo(PAVILION_COURTYARD.roadElevation, 3);
    const walk = point([2500, 3768]);
    expect(world.ground.heightAt(...walk)).toBeCloseTo(PAVILION_COURTYARD.elevation, 3);
    const toward = { x: walk[0], y: world.ground.heightAt(...walk), z: walk[1] };
    world.move(toward, 0, -1);
    expect(toward.z).toBeGreaterThan(point([2500, 3759])[1]);
    const tree = PAVILION_COURTYARD.trees[1];
    expect(world.ground.heightAt(...tree.position)).toBeLessThan(PAVILION_COURTYARD.elevation);
    expect(world.collisions.isFree({ x: tree.position[0], y: 0.035, z: tree.position[1] })).toBe(false);
  });
});
