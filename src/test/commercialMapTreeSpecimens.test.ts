import { describe, expect, it } from 'vitest';
import replay from '../../scripts/exporural/official-2026-10-20/replay-data.json';
import { COMMERCIAL_MAP_TREES } from '@/features/commercial-map/data/commercialTrees';
import { ARVOREDO_LEANING_TREE_ID, commercialTreeSpecimenLimbColliders, partitionCommercialTreeSpecimens } from '@/features/commercial-map/data/commercialTreeSpecimens';
import { EXPORURAL_SCENE_CORRECTIONS } from '@/features/commercial-map/data/exporuralSceneCorrections';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import type { MapEntity } from '@/features/commercial-map/types';
import { createCommercialTreeSpecimenGeometry } from '@/features/commercial-map/utils/commercialTreeSpecimenGeometry';
import { unifyFenasojaRestaurantEntities } from '@/features/commercial-map/utils/fenasojaRestaurant';
import { buildRestaurantFrontagePlan, RESTAURANT_FRONTAGE_LAYOUT } from '@/features/commercial-map/utils/restaurantFrontage';
import { distanceToEntity } from '@/features/commercial-map/utils/spatialSurface';
import { createCommercialTreeSurfaceResolver, selectCommercialTreesForScene } from '@/features/commercial-map/utils/treeLayer';
import { buildVisitWorld } from '@/features/commercial-map/visit/VisitWorld';

const ruralReference = EXPORURAL_SCENE_CORRECTIONS.tree;
const { specimens, instances } = partitionCommercialTreeSpecimens(COMMERCIAL_MAP_TREES);
const rural = specimens.find(({ tree }) => tree.id === ruralReference.id)!;
const leaning = specimens.find(({ tree }) => tree.id === ARVOREDO_LEANING_TREE_ID)!;

describe('Exemplares fotográficos do Mapa Comercial', () => {
  it('separa somente os dois exemplares do lote de instâncias, com uma representação por ID', () => {
    expect(specimens.map(({ tree }) => tree.id)).toEqual([ruralReference.id, ARVOREDO_LEANING_TREE_ID]);
    expect(instances.some((tree) => specimens.some((specimen) => specimen.tree.id === tree.id))).toBe(false);
    expect([...instances, ...specimens.map(({ tree }) => tree)].map((tree) => tree.id).sort())
      .toEqual(COMMERCIAL_MAP_TREES.map((tree) => tree.id).sort());
    const r01 = (replay.after.entities as unknown as MapEntity[]).find((entity) => entity.id === ruralReference.lotEntityId)!;
    expect(partitionCommercialTreeSpecimens(selectCommercialTreesForScene([r01], [])).specimens)
      .toEqual([rural]);
    expect(partitionCommercialTreeSpecimens(selectCommercialTreesForScene([], [])).specimens).toHaveLength(0);
  });

  it('preserva a âncora de Q-R-01 e sustenta a copa larga sobre o terreno e longe do poste', () => {
    const entities = replay.after.entities as unknown as MapEntity[];
    const r01 = entities.find((entity) => entity.id === ruralReference.lotEntityId)!;
    const street = entities.find((entity) => entity.publicIdentifier === ruralReference.streetIdentifier)!;
    const { tree, profile } = rural;
    expect(tree.position).toEqual([8.625689, -18.94]);
    expect(tree.relatedLotId).toBe('Q-R-01');
    expect(distanceToEntity(tree.position, street)).toBeGreaterThan(.5);
    expect(createCommercialTreeSurfaceResolver(entities).groundElevation(tree)).toBeCloseTo(.134);
    const raised = { ...r01, geometry: { ...r01.geometry, elevation: .2 } };
    expect(createCommercialTreeSurfaceResolver([raised, street]).groundElevation(tree)).toBeCloseTo(.334);

    const { bark, foliage } = createCommercialTreeSpecimenGeometry(profile, 'near');
    try {
      const bounds = foliage.boundingBox!;
      expect(bounds.max.x - bounds.min.x).toBeGreaterThan(ruralReference.envelopeRadius * 2.6);
      expect(bounds.min.y).toBeGreaterThan(.85);
      expect(tree.position[0] + bounds.min.x).toBeGreaterThan(7.23);
      expect(tree.position[1] + bounds.min.z).toBeGreaterThan(ruralReference.alignmentMarkerPosition[1] + .3);
      expect(bark.boundingBox!.min.y).toBeLessThan(0);
      expect(bark.boundingBox!.max.y).toBeGreaterThan(bounds.min.y);
    } finally {
      bark.dispose();
      foliage.dispose();
    }
  });

  it('mantém o pé inclinado no canteiro e preserva passagem fora do tronco no Modo Visita', () => {
    const entities = unifyFenasojaRestaurantEntities(OFFICIAL_REFERENCE_DATA.entities).entities;
    const plan = buildRestaurantFrontagePlan({ entities, trees: COMMERCIAL_MAP_TREES });
    const { tree, profile } = leaning;
    expect(tree.position).toEqual([-12.96, 7.8982]);
    expect(plan.treePits).toContainEqual(tree.position);
    const [x, z] = tree.position;
    const world = buildVisitWorld({ entities: entities.filter(entity => ['C2', 'CALCADA-ARVOREDO'].includes(entity.publicIdentifier)),
      trees: [tree], includeContext: false });
    expect(world.ground.heightAt(x, z)).toBeCloseTo(RESTAURANT_FRONTAGE_LAYOUT.treePit.soilElevation);
    const [{ radius: foot }, ...limbs] = commercialTreeSpecimenLimbColliders(profile);
    expect(foot).toBeLessThan(RESTAURANT_FRONTAGE_LAYOUT.treePit.size / 2);
    expect(limbs.some((part) => part.x < -.20 && part.z > .32 && part.bottom < .16)).toBe(true);
    expect(world.collisions.isFree({ x, y: world.ground.heightAt(x, z), z })).toBe(false);
    expect(world.collisions.isFree({ x: x - .27, y: .039, z: z + .39 })).toBe(false);
    expect(world.collisions.isFree({ x: x + .25, y: .039, z: z + .39 })).toBe(true);
  });

  it('reduz triângulos por distância e mantém o tronco e a silhueta nos três níveis', () => {
    for (const { profile } of specimens) {
      const levels = (['near', 'mid', 'far'] as const).map(tier => createCommercialTreeSpecimenGeometry(profile, tier));
      try {
        const wood = levels.map(level => level.bark.getIndex()!.count);
        const foliage = levels.map(level => level.foliage.getAttribute('position').count);
        expect(wood[0]).toBeGreaterThan(wood[1] * 2);
        expect(wood[1]).toBeGreaterThan(wood[2] * 2);
        expect(foliage[0]).toBeGreaterThan(foliage[1] * 2);
        expect(foliage[1]).toBeGreaterThan(foliage[2] * 2);
        for (const level of levels) {
          expect(level.bark.boundingBox!.min.y).toBeLessThan(0);
          expect(level.foliage.boundingBox!.max.distanceTo(levels[0].foliage.boundingBox!.max)).toBeLessThan(.2);
        }
      } finally {
        for (const { bark, foliage: leaves } of levels) {
          bark.dispose();
          leaves.dispose();
        }
      }
    }
  });
});
