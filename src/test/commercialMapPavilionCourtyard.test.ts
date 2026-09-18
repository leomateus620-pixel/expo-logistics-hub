import { describe, expect, it } from 'vitest';
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import * as THREE from 'three';
import { PAVILION_COURTYARD } from '@/features/commercial-map/data/pavilionCourtyard';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import { PARK_ACCESS_SPATIAL_PLAN } from '@/features/commercial-map/data/parkAccessSpatialPlan';
import { resolveParkAccessEnvironmentPresentation } from '@/features/commercial-map/data/parkAccessEnvironment';
import { pointInPolygon } from '@/features/commercial-map/utils/spatialSurface';

const polygon = (rings: readonly (readonly (readonly [number, number])[])[]): MultiPolygon =>
  [rings.map(ring => ring.map(p => [p[0], p[1]]))];
const contains = (point: readonly [number, number]) => PAVILION_COURTYARD.hardscape.some(rings =>
  pointInPolygon(point, rings[0]) && !rings.slice(1).some(hole => pointInPolygon(point, hole)));

describe('pavement between Pavilions 1, 14 and 12', () => {
  it('registers the continuation to the existing woodland cap and one connected court', () => {
    const trail = PARK_ACCESS_SPATIAL_PLAN.woodlandPath;
    expect(PAVILION_COURTYARD.pathEnd).toEqual(trail.centerline.at(-1));
    expect(PAVILION_COURTYARD.hardscape).toHaveLength(1);
    const edge = PAVILION_COURTYARD.hardscape[0][0];
    const matchingVertices = edge.filter(p => trail.surfacePolygon.some(t => Math.hypot(p[0] - t[0], p[1] - t[1]) < 1e-6));
    expect(matchingVertices.length).toBeGreaterThan(0);
    expect(polygonClipping.intersection(PAVILION_COURTYARD.hardscape, polygon([trail.surfacePolygon]))).toEqual([]);
    expect(contains([PAVILION_COURTYARD.pathEnd[0] + 1, PAVILION_COURTYARD.walkwayZ])).toBe(true);
    expect(contains([PAVILION_COURTYARD.treePosition[0], PAVILION_COURTYARD.walkwayZ])).toBe(true);
  });

  it('preserves pavilion, emergency-service and road footprints without asphalt overlap', () => {
    expect(PAVILION_COURTYARD.anchorIdentifiers).toEqual(['B1', 'B2', 'B3', 'B23']);
    const protectedEntities = OFFICIAL_REFERENCE_ENTITIES.filter(e =>
      PAVILION_COURTYARD.anchorIdentifiers.includes(e.publicIdentifier as 'B1') || e.classification === 'ROAD');
    for (const entity of protectedEntities) {
      expect(polygonClipping.intersection(PAVILION_COURTYARD.hardscape,
        polygon(entity.geometry.coordinates)), entity.publicIdentifier).toEqual([]);
    }
    expect(PAVILION_COURTYARD.officialMeasurements).toBe(false);
  });

  it('leaves an actual root opening and adds exactly one tree in the existing batch at both qualities', () => {
    expect(contains(PAVILION_COURTYARD.treePosition)).toBe(false);
    expect(PAVILION_COURTYARD.hardscape[0]).toHaveLength(2);
    for (const reduced of [false, true]) {
      const presentation = resolveParkAccessEnvironmentPresentation(reduced);
      const trees = presentation.ambientTrees.filter(p => p.sourceZoneId === 'pavilions-14-12-courtyard-tree');
      expect(trees).toHaveLength(1);
      expect(trees[0].position).toEqual(PAVILION_COURTYARD.treePosition);
      expect(presentation.diagnostics.primaryDrawCalls).toBe(4);
      expect(presentation.diagnostics.shadowDrawCalls).toBe(0);
      const concrete = presentation.environmentalSurfaces.filter(p => p.kind === 'PAVILION_CONCRETE');
      expect(concrete.length).toBe(PAVILION_COURTYARD.hardscape.length);
      for (const ground of presentation.environmentalSurfaces.filter(p => p.kind !== 'PAVILION_CONCRETE')) {
        expect(polygonClipping.intersection(polygon([ground.polygon, ...ground.holes]),
          PAVILION_COURTYARD.hardscape), ground.id).toEqual([]);
      }
    }
  });

  it('keeps the additional concrete geometry below sixty triangles', () => {
    let triangles = 0;
    for (const rings of PAVILION_COURTYARD.hardscape) {
      const shape = new THREE.Shape(rings[0].map(p => new THREE.Vector2(p[0], -p[1])));
      shape.holes = rings.slice(1).map(ring => new THREE.Path(ring.map(p => new THREE.Vector2(p[0], -p[1]))));
      const geometry = new THREE.ShapeGeometry(shape);
      triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3;
      geometry.dispose();
    }
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThanOrEqual(60);
  });
});
