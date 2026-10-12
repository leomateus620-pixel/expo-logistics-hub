import { describe, expect, it } from 'vitest';
import { COMMERCIAL_MAP_TREES, type CommercialMapTree } from '@/features/commercial-map/data/commercialTrees';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { withGateFourDistrictPresentationEntities } from '@/features/commercial-map/data/gateFourDistrict';
import { REAR_PARKING_GROUND_SUPPORTS } from '@/features/commercial-map/data/rearParking';
import { PAVILION12_FRONT_TREE_GROUND_SUPPORT, withPavilion12TreeGroundSupport } from '@/features/commercial-map/data/pavilion12FrontTrees';
import { projectedCommercialMapShadowDirection } from '@/features/commercial-map/data/commercialMapEnvironment';
import { presentCommercialMapData } from '@/features/commercial-map/utils/presentCommercialMapData';
import { SPATIAL_EPSILON } from '@/features/commercial-map/utils/spatialSurface';
import { commercialTreeGroundElevationAtPosition, commercialTreeShadowElevationAtPosition, createCommercialTreeSurfaceResolver } from '@/features/commercial-map/utils/treeLayer';
import type { Coordinate, MapEntity } from '@/features/commercial-map/types';

const tree = (overrides: Partial<CommercialMapTree> = {}): CommercialMapTree => ({
  ...COMMERCIAL_MAP_TREES[0], relatedLotId: null, surfaceEntityIdentifier: null,
  position: [0, 0], placement: 'OUTSIDE_COMMERCIAL_LOT', ...overrides,
});
const surface = (id: string, ring: Coordinate[], elevation: number, overrides: Partial<MapEntity> = {}): MapEntity => ({
  ...OFFICIAL_REFERENCE_DATA.entities.find(entity => entity.classification === 'SELLABLE_LOT')!,
  id, publicIdentifier: id, classification: 'SELLABLE_LOT', metadata: {},
  geometry: { ...OFFICIAL_REFERENCE_DATA.entities[0].geometry, coordinates: [ring], elevation, extrusionHeight: 0.1 },
  ...overrides,
});
const rectangle = (minX: number, minZ: number, maxX: number, maxZ: number): Coordinate[] => [
  [minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ], [minX, minZ],
];
function assertEquivalent(entities: readonly MapEntity[], candidate: CommercialMapTree, points: readonly Coordinate[]) {
  const resolver = createCommercialTreeSurfaceResolver(entities);
  for (const point of points) {
    expect(resolver.groundElevationAtPosition(candidate, point)).toBe(commercialTreeGroundElevationAtPosition(candidate, point, entities));
    expect(resolver.shadowElevationAtPosition(candidate, point)).toBe(commercialTreeShadowElevationAtPosition(candidate, point, entities));
  }
  expect(resolver.groundElevation(candidate)).toBe(commercialTreeGroundElevationAtPosition(candidate, candidate.position, entities));
}

describe('scene-owned commercial tree receiver preparation', () => {
  it('preserves every canonical trunk and displaced shadow across current presentation snapshots', () => {
    const presented = presentCommercialMapData(OFFICIAL_REFERENCE_DATA);
    const snapshots = [OFFICIAL_REFERENCE_DATA.entities,
      withPavilion12TreeGroundSupport([...presented.entities, ...REAR_PARKING_GROUND_SUPPORTS], true),
      withGateFourDistrictPresentationEntities(presented.entities)];
    const direction = projectedCommercialMapShadowDirection();
    for (const entities of snapshots) {
      const resolver = createCommercialTreeSurfaceResolver(entities);
      for (const candidate of COMMERCIAL_MAP_TREES) {
        const shadowPoint: Coordinate = [candidate.position[0] + direction[0] * candidate.canopyRadius * 0.55,
          candidate.position[1] + direction[1] * candidate.canopyRadius * 0.55];
        expect(resolver.groundElevation(candidate), candidate.id).toBe(commercialTreeGroundElevationAtPosition(candidate, candidate.position, entities));
        expect(resolver.shadowElevationAtPosition(candidate, shadowPoint), candidate.id).toBe(commercialTreeShadowElevationAtPosition(candidate, shadowPoint, entities));
      }
    }
  });

  it('keeps boundary epsilon and concave polygons authoritative after bounds rejection', () => {
    const concave: Coordinate[] = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4], [0, 0]];
    assertEquivalent([surface('concave', concave, 2)], tree(), [
      [2, 2], [0, 0], [4, 0.5], [4 + SPATIAL_EPSILON * 0.8, 0.5],
      [4 + SPATIAL_EPSILON * 1.2, 0.5], [1 + SPATIAL_EPSILON * 0.8, 2],
    ]);
  });

  it('preserves containing priority, stable order, and duplicate anchor first-match behavior', () => {
    const first = surface('duplicate', rectangle(-1, -1, 1, 1), 1);
    const second = surface('duplicate', rectangle(-1, -1, 1, 1), 3);
    const road = surface('road', rectangle(-1, -1, 1, 1), 5, { classification: 'ROAD' });
    const resolver = createCommercialTreeSurfaceResolver([first, second]);
    expect(resolver.groundElevation(tree())).toBeCloseTo(1.104, 12);
    expect(createCommercialTreeSurfaceResolver([second, first]).groundElevation(tree())).toBeCloseTo(3.104, 12);
    assertEquivalent([first, second, road], tree({ placement: 'STREET_EDGE' }), [[0, 0]]);
    const farAnchor = surface('anchor', rectangle(20, 20, 21, 21), 2);
    const closeAnchor = surface('anchor', rectangle(1, -1, 2, 1), 4);
    assertEquivalent([farAnchor, closeAnchor], tree({ surfaceEntityIdentifier: 'anchor', canopyRadius: 2 }), [[0, 0]]);
    expect(createCommercialTreeSurfaceResolver([farAnchor, closeAnchor]).groundElevation(tree({ surfaceEntityIdentifier: 'anchor', canopyRadius: 2 }))).toBe(0.036);
  });

  it('considers epsilon-distance priority ties and retains nearest fallback order', () => {
    const left = surface('left', rectangle(-2, -1, -1, 1), 1);
    const right = surface('right', rectangle(1 + SPATIAL_EPSILON * 0.8, -1, 2, 1), 4, { classification: 'PEDESTRIAN_PATH' });
    const candidate = tree({ placement: 'SIDEWALK_EDGE' });
    assertEquivalent([left, right], candidate, [[0, 0], [0, 5], [-20, 5]]);
    // The slightly more distant sidewalk still wins the existing epsilon tie.
    expect(createCommercialTreeSurfaceResolver([left, right]).groundElevation(candidate)).toBeCloseTo(4.084, 12);
    assertEquivalent([left, surface('right-lot', rectangle(1, -1, 2, 1), 4)], tree({ placement: 'INSIDE_LOT' }), [[0, 0]]);
  });

  it('retains Pavilion 12 support holes and resolves the displaced receiver independently', () => {
    const support: MapEntity = { ...PAVILION12_FRONT_TREE_GROUND_SUPPORT,
      geometry: { ...PAVILION12_FRONT_TREE_GROUND_SUPPORT.geometry, coordinates: [rectangle(-3, -3, 3, 3), rectangle(-1, -1, 1, 1)] } };
    const road = surface('underlying-road', rectangle(-3, -3, 3, 3), 4, { classification: 'ROAD' });
    const candidate = tree({ id: 'tree-i-13', placement: 'SIDEWALK_EDGE', position: [2, 0] });
    const resolver = createCommercialTreeSurfaceResolver([support, road]);
    assertEquivalent([support, road], candidate, [[2, 0], [0, 0], [1, 0], [10, 10]]);
    expect(resolver.groundElevation(candidate)).toBeLessThan(1);
    expect(resolver.shadowElevationAtPosition(candidate, [0, 0])).toBeGreaterThan(4);
  });

  it('rebuilds independently for changed geometry and scopes without retaining a previous receiver', () => {
    const original = surface('changing', rectangle(-1, -1, 1, 1), 1);
    const moved = { ...original, geometry: { ...original.geometry, coordinates: [rectangle(20, 20, 21, 21)] } };
    const candidate = tree();
    const originalResolver = createCommercialTreeSurfaceResolver([original]);
    expect(originalResolver.groundElevation(candidate)).toBeCloseTo(1.104, 12);
    expect(createCommercialTreeSurfaceResolver([moved]).groundElevation(candidate)).toBe(0.036);
    expect(createCommercialTreeSurfaceResolver([]).groundElevation(candidate)).toBe(0.036);
    expect(originalResolver.groundElevation(candidate)).toBeCloseTo(1.104, 12);
    assertEquivalent([surface('empty', [], 10), original], tree({ placement: 'INSIDE_LOT' }), [[0, 0], [10, 10]]);
  });

  it('falls back to the original polygon rules for non-finite bounds and points', () => {
    const invalid = surface('unbounded', [[1, -1], [Number.POSITIVE_INFINITY, -1], [Number.POSITIVE_INFINITY, 1], [1, 1]], 2);
    const unknown = surface('unknown', [[Number.NaN, 0], [1, 0], [1, 1]], 4);
    const finite = surface('finite', rectangle(-2, -2, 2, 2), 1);
    for (const placement of ['OUTSIDE_COMMERCIAL_LOT', 'INSIDE_LOT'] as const) {
      assertEquivalent([invalid, unknown, finite], tree({ placement }), [[0, 0], [-10, 0], [10, 0], [Number.NaN, 0], [Number.POSITIVE_INFINITY, 0]]);
    }
  });
});
