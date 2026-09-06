import { describe, expect, it } from 'vitest';
import {
  LATERAL_DISTRICT_METERS_TO_WORLD,
  LATERAL_DISTRICT_ROADS,
  lateralDistrictPointToWorld,
} from '../features/commercial-map/data/lateralResidentialDistrict';
import { PARK_ACCESS_SPATIAL_PLAN } from '../features/commercial-map/data/parkAccessSpatialPlan';
import {
  LATERAL_DISTRICT_STREET_MOUTHS,
  splitLateralResidentialSidewalk,
} from '../features/commercial-map/utils/lateralResidentialStreetIntegration';
import {
  PARK_ACCESS_INFRASTRUCTURE_PROFILE,
  buildParkAccessRenderModel,
  disposeParkAccessRenderModel,
} from '../features/commercial-map/utils/parkAccessInfrastructure';
import { adaptParkAccessSpatialPlan } from '../features/commercial-map/utils/parkAccessSpatialPlanAdapter';
import { pointInPolygon } from '../features/commercial-map/utils/spatialSurface';

const original = PARK_ACCESS_SPATIAL_PLAN.sidewalkSurfaces.find((surface) => surface.id === 'benvenuto-south-sidewalk')!;
const fragments = splitLateralResidentialSidewalk(original);

function sidewalkMidpointAtX(x: number) {
  const crossings: number[] = [];
  original.polygon.slice(0, -1).forEach((from, index) => {
    const to = original.polygon[index + 1];
    if (x < Math.min(from[0], to[0]) || x > Math.max(from[0], to[0]) || from[0] === to[0]) return;
    crossings.push(from[1] + (to[1] - from[1]) * (x - from[0]) / (to[0] - from[0]));
  });
  return [x, (Math.min(...crossings) + Math.max(...crossings)) / 2] as const;
}

describe('residential street junctions with the existing avenue', () => {
  it('derives exactly four open mouths from the registered local streets', () => {
    expect(LATERAL_DISTRICT_STREET_MOUTHS.map(({ roadId }) => roadId)).toEqual([
      'district-campeira', 'district-musicanto', 'district-10-agosto', 'district-fenasoja',
    ]);
    for (const mouth of LATERAL_DISTRICT_STREET_MOUTHS) {
      const road = LATERAL_DISTRICT_ROADS.find(({ id }) => id === mouth.roadId)!;
      expect(road.centerline.every(([station]) => station === road.centerline[0][0])).toBe(true);
      expect((mouth.roadMinX + mouth.roadMaxX) / 2).toBeCloseTo(lateralDistrictPointToWorld(road.centerline[0])[0], 10);
      expect(mouth.roadMaxX - mouth.roadMinX).toBeCloseTo(road.width * LATERAL_DISTRICT_METERS_TO_WORLD, 10);
      expect(mouth.maxX - mouth.minX).toBeCloseTo(
        road.width * LATERAL_DISTRICT_METERS_TO_WORLD + PARK_ACCESS_INFRASTRUCTURE_PROFILE.curbWidth, 10,
      );
    }
  });

  it('removes sidewalk across every street mouth and retains the intervening sidewalk', () => {
    expect(fragments).toHaveLength(5);
    for (const mouth of LATERAL_DISTRICT_STREET_MOUTHS) {
      for (const x of [mouth.roadMinX, (mouth.roadMinX + mouth.roadMaxX) / 2, mouth.roadMaxX]) {
        const point = sidewalkMidpointAtX(x);
        expect(pointInPolygon(point, original.polygon)).toBe(true);
        expect(fragments.some((fragment) => pointInPolygon(point, fragment.polygon)), mouth.roadId).toBe(false);
      }
      for (const x of [mouth.minX - 0.1, mouth.maxX + 0.1]) {
        expect(fragments.some((fragment) => pointInPolygon(sidewalkMidpointAtX(x), fragment.polygon))).toBe(true);
      }
    }
  });

  it('preserves original endpoints, bends and elevation outside the junction cuts', () => {
    const retainedSourcePoints = original.polygon.slice(0, -1).filter(([x]) => (
      !LATERAL_DISTRICT_STREET_MOUTHS.some((mouth) => x > mouth.minX && x < mouth.maxX)
    ));
    for (const point of retainedSourcePoints) {
      expect(fragments.some((fragment) => fragment.polygon.includes(point))).toBe(true);
    }
    for (const fragment of fragments) {
      expect(fragment.elevation).toBe(original.elevation);
      expect(fragment.polygon[0]).toEqual(fragment.polygon.at(-1));
      expect(fragment.polygon.length).toBeGreaterThanOrEqual(4);
      expect(fragment.polygon.flat().every(Number.isFinite)).toBe(true);
    }
  });

  it('keeps actual rendered curb returns outside the entire carriageway width', () => {
    const model = buildParkAccessRenderModel({
      roadSurfaces: [], supportSurfaces: [], sidewalkSurfaces: fragments,
      curbSegments: [], parkingBays: [], markingSegments: [], roundabouts: [], gates: [], costeiros: null,
    });
    try {
      const positions = model.geometries.curbs!.getAttribute('position');
      for (const mouth of LATERAL_DISTRICT_STREET_MOUTHS) {
        for (let index = 0; index < positions.count; index += 1) {
          const x = positions.getX(index);
          expect(x > mouth.roadMinX + 1e-5 && x < mouth.roadMaxX - 1e-5, `${mouth.roadId}: ${x}`).toBe(false);
        }
      }
    } finally {
      disposeParkAccessRenderModel(model);
    }
  });

  it('removes only hidden downward curb faces while retaining tops and upright walls', () => {
    const model = buildParkAccessRenderModel(adaptParkAccessSpatialPlan());
    try {
      expect(model.diagnostics.surfaceTriangleCount + model.diagnostics.instancedTriangleCount).toBeLessThanOrEqual(6000);
      for (const geometry of [model.geometries.curbs!, model.geometries.roundaboutCurb!]) {
        const normals = geometry.getAttribute('normal');
        const indices = geometry.index!;
        let upward = 0;
        let upright = 0;
        for (let offset = 0; offset < indices.count; offset += 3) {
          const y = [0, 1, 2].map((vertex) => normals.getY(indices.getX(offset + vertex)));
          expect(y.every((value) => value < -0.99)).toBe(false);
          if (y.every((value) => value > 0.99)) upward += 1;
          if (y.every((value) => Math.abs(value) < 0.01)) upright += 1;
        }
        expect(upward).toBeGreaterThan(0);
        expect(upright).toBeGreaterThan(0);
      }
    } finally {
      disposeParkAccessRenderModel(model);
    }
  });

  it('does not mutate the GIS plan, avenue, other sidewalks or existing independent curb runs', () => {
    const snapshot = JSON.stringify(PARK_ACCESS_SPATIAL_PLAN);
    const input = adaptParkAccessSpatialPlan();
    expect(input.sidewalkSurfaces).toHaveLength(PARK_ACCESS_SPATIAL_PLAN.sidewalkSurfaces.length + 4);
    for (const source of PARK_ACCESS_SPATIAL_PLAN.sidewalkSurfaces.filter(({ id }) => id !== original.id)) {
      const adapted = input.sidewalkSurfaces.find(({ id }) => id === source.id)!;
      expect(adapted.polygon).toBe(source.polygon);
      expect(adapted.elevation).toBe(source.elevation);
    }
    for (const source of PARK_ACCESS_SPATIAL_PLAN.roadSurfaces) {
      expect(input.roadSurfaces.find(({ id }) => id === source.id)!.polygon).toBe(source.polygon);
    }
    const artery = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces.find(({ id }) => id === 'benvenuto-four-lane-axis')!;
    // Benvenuto has no separate curb runs to cut: its curbs come from the
    // sidewalk loops. The 20 independent runs belong to the Exporural access.
    expect(artery.curbCenterlines).toEqual([]);
    expect(input.curbSegments).toHaveLength(20);
    expect(input.curbSegments!.some(({ id }) => id.startsWith(`${artery.id}:`))).toBe(false);
    expect(JSON.stringify(PARK_ACCESS_SPATIAL_PLAN)).toBe(snapshot);
  });
});
