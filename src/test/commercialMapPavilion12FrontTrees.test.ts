import { describe, expect, it } from 'vitest';
import { COMMERCIAL_MAP_TREES, COMMERCIAL_TREE_COUNTS_BY_QUADRA } from '../features/commercial-map/data/commercialTrees';
import { OFFICIAL_REFERENCE_DATA, officialPdfPointToLocal } from '../features/commercial-map/data/officialReference2026';
import { PAVILION_COURTYARD } from '../features/commercial-map/data/pavilionCourtyard';
import {
  PAVILION12_FRONT_TREE_CORRECTIONS,
  PAVILION12_FRONT_TREE_GROUND_SUPPORT,
  PAVILION12_FRONT_TREE_SURFACE_IDENTIFIER,
  isPavilion12FrontTreeId,
  pavilion12TreeSupportContainsPoint,
  withPavilion12TreeGroundSupport,
} from '../features/commercial-map/data/pavilion12FrontTrees';
import { selectParkAccessCompatibleTreesForPresentation } from '../features/commercial-map/data/parkAccessEnvironment';
import { distanceToPolygon, pointInPolygon } from '../features/commercial-map/utils/spatialSurface';
import { commercialTreeGroundElevation, commercialTreeShadowElevationAtPosition } from '../features/commercial-map/utils/treeLayer';
import { COMMERCIAL_PAVILION_DEFINITIONS, createCommercialPavilionLayout } from '../features/commercial-map/utils/commercialPavilions';
import { isInternalParkVegetationPoint, INTERNAL_TREE_TRUNK_RADIUS_FACTOR } from '../features/commercial-map/utils/internalTreeVisuals';
import { commercialTreePresentationProfile, resolveCommercialTreeLodInstanceCounts } from '../features/commercial-map/components/canvas/CommercialTreeLayer';
import { buildVisitWorld } from '../features/commercial-map/visit/VisitWorld';
import { selectRearRoadCompatibleTreesForPresentation } from '../features/commercial-map/utils/rearRoadTreeClearance';
import { arenaVegetationAllowed } from '../features/commercial-map/data/arenaCanonicalLayout';
import type { MapEntity } from '../features/commercial-map/types';

const entities = OFFICIAL_REFERENCE_DATA.entities;
const trees = COMMERCIAL_MAP_TREES.filter(tree => isPavilion12FrontTreeId(tree.id));
const supportedEntities = withPavilion12TreeGroundSupport(entities, true);
const pavilion = entities.find(entity => entity.publicIdentifier === 'B3')!;
const road = entities.find(entity => entity.publicIdentifier === 'RUA-ARGENTINA')!;
const requested = [
  { id: 'tree-i-13', previous: [3060, 3728], destination: [2940, 3800] },
  { id: 'tree-i-14', previous: [3120, 3738], destination: [2970, 3800] },
  { id: 'tree-i-15', previous: [3175, 3727], destination: [3000, 3800] },
] as const;

describe('three requested trees on the Pavilion 12 concrete frontage', () => {
  it('relocates the exact three canonical IDs with provenance and no commercial association', () => {
    expect(COMMERCIAL_MAP_TREES).toHaveLength(274);
    expect(COMMERCIAL_TREE_COUNTS_BY_QUADRA.I).toBe(15);
    expect(trees.map(tree => tree.id)).toEqual(requested.map(record => record.id));
    for (const record of requested) {
      const tree = trees.find(item => item.id === record.id)!;
      expect(tree.previousSourcePosition).toEqual(record.previous);
      expect(tree.sourcePosition).toEqual(record.destination);
      expect(tree.position).toEqual(officialPdfPointToLocal(record.destination).map(value => Number(value.toFixed(4))));
      expect(tree).toMatchObject({
        area: 'I', quadra: 'I', relatedLotId: null, placement: 'SIDEWALK_EDGE',
        surfaceEntityIdentifier: PAVILION12_FRONT_TREE_SURFACE_IDENTIFIER,
        isVisible: true, isSellable: false, contributesToCommercialMetrics: false,
        verificationStatus: 'FIELD_REVIEW_RECOMMENDED',
      });
      expect(tree.notes).toContain('estimada');
      expect(tree.sourceReference).toContain('anexos 3 e 4');
    }
  });

  it('places all trunk envelopes inside existing concrete with at least .2 clearance from road and building', () => {
    for (const tree of trees) {
      expect(pavilion12TreeSupportContainsPoint(tree.position), tree.id).toBe(true);
      expect(PAVILION_COURTYARD.hardscape.some(rings => pointInPolygon(tree.position, rings[0])
        && !rings.slice(1).some(hole => pointInPolygon(tree.position, hole))), tree.id).toBe(true);
      const conservativeTrunkRadius = tree.trunkRadius * 1.1;
      for (const obstacle of entities.filter(entity => entity.classification === 'ROAD' || entity.classification === 'PAVILION')) {
        expect(pointInPolygon(tree.position, obstacle.geometry.coordinates[0]), `${tree.id}/${obstacle.publicIdentifier}`).toBe(false);
        expect(distanceToPolygon(tree.position, obstacle.geometry.coordinates[0]) - conservativeTrunkRadius,
          `${tree.id}/${obstacle.publicIdentifier}`).toBeGreaterThanOrEqual(.2);
      }
    }
    expect(trees[1].position[0] - trees[0].position[0]).toBeCloseTo(trees[2].position[0] - trees[1].position[0], 3);
  });

  it('keeps both facade entry corridors open, rather than shifting the third tree into Pavilion 8', () => {
    const xs = pavilion.geometry.coordinates[0].map(point => point[0]);
    const zs = pavilion.geometry.coordinates[0].map(point => point[1]);
    const width = Math.max(...xs) - Math.min(...xs), depth = Math.max(...zs) - Math.min(...zs);
    const centerX = (Math.max(...xs) + Math.min(...xs)) / 2;
    const layout = createCommercialPavilionLayout({ width, depth }, COMMERCIAL_PAVILION_DEFINITIONS.B3);
    expect(layout.exterior.facade.entrances).toHaveLength(2);
    for (const entrance of layout.exterior.facade.entrances) {
      // B3 faces PI: pavilion-local X reverses in world coordinates.
      const entranceX = centerX - entrance.centerX;
      for (const tree of trees) {
        expect(Math.abs(tree.position[0] - entranceX) - entrance.width / 2 - tree.trunkRadius * 1.1,
          `${tree.id}/${entrance.id}`).toBeGreaterThanOrEqual(.2);
      }
    }
  });

  it('retains these trees in presentation without authorizing other trunks on concrete or asphalt', () => {
    expect(selectParkAccessCompatibleTreesForPresentation(trees)).toEqual(trees);
    expect(selectRearRoadCompatibleTreesForPresentation(selectParkAccessCompatibleTreesForPresentation(trees))
      .filter(tree => arenaVegetationAllowed(tree.position, tree.canopyRadius))).toEqual(trees);
    const unrelatedOnConcrete = { ...trees[0], id: 'tree-i-12' };
    const requestedOnAsphalt = { ...trees[0], position: officialPdfPointToLocal([2800, 3800]) };
    const anonymousOnConcrete = { position: trees[0].position, canopyRadius: trees[0].canopyRadius };
    expect(selectParkAccessCompatibleTreesForPresentation([unrelatedOnConcrete, requestedOnAsphalt, anonymousOnConcrete])).toEqual([]);
  });

  it('adds only a reversible presentation support and preserves hidden-concrete fallback', () => {
    expect(withPavilion12TreeGroundSupport(entities, false)).toBe(entities);
    expect(supportedEntities).toHaveLength(entities.length + 1);
    expect(supportedEntities.slice(0, -1)).toEqual(entities);
    expect(supportedEntities.at(-1)).toBe(PAVILION12_FRONT_TREE_GROUND_SUPPORT);
    expect(withPavilion12TreeGroundSupport(supportedEntities, true)).toBe(supportedEntities);
    expect(withPavilion12TreeGroundSupport(supportedEntities, false)).toEqual(entities);
    expect(PAVILION12_FRONT_TREE_GROUND_SUPPORT.metadata.presentationOnly).toBe(true);
    for (const tree of trees) {
      expect(commercialTreeGroundElevation(tree, supportedEntities)).toBeCloseTo(PAVILION_COURTYARD.elevation + .004, 6);
      expect(commercialTreeGroundElevation(tree, entities)).toBeCloseTo(.036, 6);
      expect(commercialTreeGroundElevation(tree, [])).toBeCloseTo(.03, 6);
    }
    const unrelated = { ...trees[0], id: 'tree-i-12' };
    expect(commercialTreeGroundElevation(unrelated, supportedEntities)).toBe(commercialTreeGroundElevation(unrelated, entities));
  });

  it('grounds each shadow receiver independently, respecting holes and the asphalt outside concrete', () => {
    const tree = trees[1];
    expect(commercialTreeShadowElevationAtPosition(tree, tree.position, supportedEntities)).toBeCloseTo(.08, 6);
    const asphalt = officialPdfPointToLocal([2970, 3770]);
    expect(pointInPolygon(asphalt, road.geometry.coordinates[0])).toBe(true);
    expect(commercialTreeShadowElevationAtPosition(tree, asphalt, supportedEntities)).toBeCloseTo(.044, 6);
    const [x, z] = tree.position;
    const supportWithHole: MapEntity = {
      ...PAVILION12_FRONT_TREE_GROUND_SUPPORT,
      geometry: { ...PAVILION12_FRONT_TREE_GROUND_SUPPORT.geometry,
        coordinates: [PAVILION12_FRONT_TREE_GROUND_SUPPORT.geometry.coordinates[0],
          [[x - .06, z - .06], [x + .06, z - .06], [x + .06, z + .06], [x - .06, z + .06], [x - .06, z - .06]]],
      },
    };
    const holedEntities = [...entities, supportWithHole];
    expect(pavilion12TreeSupportContainsPoint(tree.position, supportWithHole)).toBe(false);
    expect(commercialTreeGroundElevation(tree, holedEntities)).toBe(commercialTreeGroundElevation(tree, entities));
    expect(commercialTreeShadowElevationAtPosition(tree, tree.position, holedEntities))
      .toBe(commercialTreeShadowElevationAtPosition(tree, tree.position, entities));
  });

  it('preserves internal foliage, contact policy and all three trunks at every LOD', () => {
    for (const tree of trees) {
      expect(isInternalParkVegetationPoint(tree.position)).toBe(true);
      expect(commercialTreePresentationProfile(tree).contactPatchVisible).toBe(false);
    }
    for (const reduced of [false, true]) for (const tier of ['near', 'mid', 'far'] as const) {
      const counts = resolveCommercialTreeLodInstanceCounts({ near: 3, mid: 3, far: 3 }, tier, 7, reduced);
      expect(counts.trees).toBe(3);
      expect(counts.trunks).toBe(3);
      expect(counts.crowns).toBeGreaterThanOrEqual(3);
    }
  });

  it('moves visit colliders to the same canonical positions and concrete level, clearing the former road points', () => {
    const world = buildVisitWorld({ entities, trees, includeContext: true });
    const withoutConcrete = buildVisitWorld({ entities, trees, includeContext: false, pavilion12ConcretePresent: false });
    for (const tree of trees) {
      const collider = world.collisions.colliders.find(item => item.id === tree.id)!;
      expect(collider).toMatchObject({ kind: 'circle', x: tree.position[0], z: tree.position[1] });
      expect(collider.minY).toBeCloseTo(.072, 6);
      if (collider.kind === 'circle') expect(collider.radius).toBeCloseTo(tree.trunkRadius * INTERNAL_TREE_TRUNK_RADIUS_FACTOR, 6);
      expect(world.ground.heightAt(...tree.position)).toBeCloseTo(.068, 6);
      expect(world.collisions.isFree({ x: tree.position[0], y: .068, z: tree.position[1] })).toBe(false);
      const old = officialPdfPointToLocal(PAVILION12_FRONT_TREE_CORRECTIONS[tree.id as keyof typeof PAVILION12_FRONT_TREE_CORRECTIONS].previousSourcePosition);
      expect(world.collisions.isFree({ x: old[0], y: world.ground.heightAt(...old), z: old[1] }), tree.id).toBe(true);
      expect(withoutConcrete.collisions.colliders.find(item => item.id === tree.id)?.minY).toBeCloseTo(.036, 6);
    }
    expect(world.collisions.colliders.filter(item => isPavilion12FrontTreeId(item.id))).toHaveLength(3);
    expect(world.collisions.colliders.filter(item => trees.some(tree => item.id === `${tree.id}:crown`))).toHaveLength(3);
  }, 15000);

  it('supports an isolated B3 visit without importing the general park context or neighboring pavilion sidewalks', () => {
    const isolatedEntities = [pavilion, road];
    const world = buildVisitWorld({ entities: isolatedEntities, trees });
    const withoutTrees = buildVisitWorld({ entities: isolatedEntities, trees: [] });
    for (const tree of trees) {
      expect(world.ground.heightAt(...tree.position)).toBeCloseTo(.068, 6);
      expect(world.collisions.colliders.find(item => item.id === tree.id)?.minY).toBeCloseTo(.072, 6);
    }
    expect(world.ground.surfaces.map(surface => surface.id)).toEqual([
      ...withoutTrees.ground.surfaces.map(surface => surface.id), PAVILION12_FRONT_TREE_GROUND_SUPPORT.id,
    ]);
    expect(world.collisions.colliders.filter(item => !trees.some(tree => item.id === tree.id || item.id === `${tree.id}:crown`)))
      .toEqual(withoutTrees.collisions.colliders);
    const neighboringFrontage = officialPdfPointToLocal([3360, 3784]);
    expect(pavilion12TreeSupportContainsPoint(neighboringFrontage)).toBe(false);
    expect(world.ground.heightAt(...neighboringFrontage)).toBe(withoutTrees.ground.heightAt(...neighboringFrontage));
  });
});
