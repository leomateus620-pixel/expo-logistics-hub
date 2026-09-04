import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_REFERENCE_DATA,
  OFFICIAL_RENDERED_ENTITIES,
} from '@/features/commercial-map/data/officialReference2026';
import { COMMERCIAL_MAP_TREES } from '@/features/commercial-map/data/commercialTrees';
import {
  FENASOJA_RESTAURANT_LAYOUT,
  createFenasojaRestaurantLayout,
  fenasojaRestaurantVisualHeight,
  unifyFenasojaRestaurantEntities,
  withUnifiedFenasojaRestaurant,
} from '@/features/commercial-map/utils/fenasojaRestaurant';
import {
  RESTAURANT_FRONTAGE_LAYOUT,
  buildRestaurantFrontagePlan,
  frontageBounds,
  restaurantFrontageFacesWalkway,
} from '@/features/commercial-map/utils/restaurantFrontage';
import {
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
  strategicLandmarkVisualHeight,
} from '@/features/commercial-map/utils/landmarks';
import { presentCommercialMapData } from '@/features/commercial-map/hooks/useCommercialMap';
import { buildEntityExplorerIndex, filterAndSortEntityExplorerItems } from '@/features/commercial-map/utils/entityExplorer';
import type { MapEntity } from '@/features/commercial-map/types';

const byIdentifier = (entities: readonly MapEntity[], identifier: string) => (
  entities.find((entity) => entity.publicIdentifier === identifier)
);

describe('Restaurante unificado (C2 + C3) diante da Calçada do Arvoredo', () => {
  const officialC2 = byIdentifier(OFFICIAL_RENDERED_ENTITIES, 'C2')!;
  const officialC3 = byIdentifier(OFFICIAL_RENDERED_ENTITIES, 'C3')!;
  const unification = unifyFenasojaRestaurantEntities(OFFICIAL_RENDERED_ENTITIES);
  const restaurant = byIdentifier(unification.entities, 'C2')!;

  it('mantém o cadastro oficial com dois códigos de legenda e unifica apenas a apresentação', () => {
    expect(officialC2.name).toBe('Restaurante Central');
    expect(officialC3.name).toBe('Pizzaria');
    expect(unification.unified).toBe(true);
    expect(unification.absorbedEntityId).toBe(officialC3.id);
    expect(byIdentifier(unification.entities, 'C3')).toBeUndefined();
    expect(unification.entities).toHaveLength(OFFICIAL_RENDERED_ENTITIES.length - 1);
    expect(restaurant.id).toBe(officialC2.id);
    expect(restaurant.name).toBe('Restaurante');
    expect(restaurant.classification).toBe('RESTAURANT');
    expect(restaurant.metadata.aliases).toEqual(expect.arrayContaining(['Restaurante Central', 'Pizzaria']));
    expect(restaurant.metadata.restaurantPresentation).toMatchObject({
      unifiedIdentifiers: ['C2', 'C3'],
      absorbedEntityId: officialC3.id,
      cadastralRowsUnchanged: true,
    });
  });

  it('ocupa exatamente a união dos dois footprints anteriores', () => {
    const c2 = frontageBounds(officialC2)!;
    const c3 = frontageBounds(officialC3)!;
    const merged = frontageBounds(restaurant)!;
    expect(merged.minX).toBeCloseTo(Math.min(c2.minX, c3.minX), 9);
    expect(merged.maxX).toBeCloseTo(Math.max(c2.maxX, c3.maxX), 9);
    expect(merged.minZ).toBeCloseTo(Math.min(c2.minZ, c3.minZ), 9);
    expect(merged.maxZ).toBeCloseTo(Math.max(c2.maxZ, c3.maxZ), 9);
    expect(restaurant.geometry.coordinates).toHaveLength(1);
    expect(restaurant.geometry.coordinates[0]).toHaveLength(4);
    const bounds = strategicLandmarkBounds(restaurant);
    // Long axis follows world Z: 285 PDF points against 180 across.
    expect(bounds.depth).toBeGreaterThan(bounds.width * 1.4);
  });

  it('não altera Pavilhão 1, Pavilhão 14, Rua Brasil nem qualquer outra entidade', () => {
    const untouched = ['B1', 'B2', 'RUA-BRASIL', 'CALCADA-ARVOREDO', 'ALAMEDA-MERCOSUL', 'G', 'E-19', 'E-20'];
    untouched.forEach((identifier) => {
      expect(byIdentifier(unification.entities, identifier)).toBe(byIdentifier(OFFICIAL_RENDERED_ENTITIES, identifier));
    });
    const changed = unification.entities.filter((entity, index) => (
      entity !== OFFICIAL_RENDERED_ENTITIES.filter((candidate) => candidate.id !== officialC3.id)[index]
    ));
    expect(changed.map((entity) => entity.publicIdentifier)).toEqual(['C2']);
  });

  it('é idempotente e tolera bases já unificadas ou sem a Pizzaria', () => {
    const twice = unifyFenasojaRestaurantEntities(unification.entities);
    expect(twice.unified).toBe(false);
    expect(twice.entities.map((entity) => entity.id)).toEqual(unification.entities.map((entity) => entity.id));
    expect(byIdentifier(twice.entities, 'C2')!.name).toBe('Restaurante');

    const withoutPizzaria = unifyFenasojaRestaurantEntities(
      OFFICIAL_RENDERED_ENTITIES.filter((entity) => entity.id !== officialC3.id),
    );
    expect(withoutPizzaria.unified).toBe(false);
    expect(byIdentifier(withoutPizzaria.entities, 'C2')!.geometry).toBe(officialC2.geometry);
    expect(byIdentifier(withoutPizzaria.entities, 'C2')!.name).toBe('Restaurante');
  });

  it('não funde retângulos afastados ou desalinhados, nem entidades que não são restaurantes', () => {
    const shifted = (dx: number, dz: number): MapEntity => ({
      ...officialC3,
      geometry: {
        ...officialC3.geometry,
        coordinates: [officialC3.geometry.coordinates[0].map(([x, z]) => [x + dx, z + dz] as [number, number])],
      },
    });
    [shifted(0, 0.6), shifted(1.2, 0), shifted(5, 0)].forEach((displaced) => {
      const result = unifyFenasojaRestaurantEntities([officialC2, displaced]);
      expect(result.unified).toBe(false);
      expect(result.entities).toHaveLength(2);
      expect(byIdentifier(result.entities, 'C2')!.geometry).toBe(officialC2.geometry);
    });
    const misclassified: MapEntity = { ...officialC3, classification: 'BUILDING' };
    const result = unifyFenasojaRestaurantEntities([officialC2, misclassified]);
    expect(result.unified).toBe(false);
    expect(result.entities).toHaveLength(2);
  });

  it('entra no pipeline de apresentação compartilhado pelo banco e pela referência oficial', () => {
    const presented = presentCommercialMapData(OFFICIAL_REFERENCE_DATA);
    const entity = byIdentifier(presented.entities, 'C2')!;
    expect(byIdentifier(presented.entities, 'C3')).toBeUndefined();
    expect(entity.name).toBe('Restaurante');
    expect(entity.segmentId).toBe(byIdentifier(OFFICIAL_REFERENCE_DATA.entities, 'C2')!.segmentId);
    expect(presented.lots).toBe(OFFICIAL_REFERENCE_DATA.lots);

    const index = buildEntityExplorerIndex(presented.entities, presented.lots);
    const restaurantMatches = (query: string) => filterAndSortEntityExplorerItems(index, {
      query,
      statusFilters: [],
      classificationFilters: [],
      locationFilter: null,
      verificationFilters: [],
      sortOrder: 'name',
    }).filter((item) => item.entity.classification === 'RESTAURANT' && item.entity.publicIdentifier === 'C2');
    expect(restaurantMatches('Restaurante')).toHaveLength(1);
    expect(restaurantMatches('Pizzaria')).toHaveLength(1);
    expect(restaurantMatches('Restaurante Central')).toHaveLength(1);
    expect(index.filter((item) => item.entity.name === 'Pizzaria')).toHaveLength(0);
  });

  it('orienta a frente para a Calçada do Arvoredo e mantém a altura de um salão térreo', () => {
    const walkway = byIdentifier(unification.entities, 'CALCADA-ARVOREDO')!;
    expect(restaurantFrontageFacesWalkway(restaurant, walkway)).toBe(true);
    expect(strategicLandmarkFacingRadians(restaurant)).toBeCloseTo(Math.PI / 2);
    const restaurantBounds = frontageBounds(restaurant)!;
    const walkwayBounds = frontageBounds(walkway)!;
    expect(walkwayBounds.minX).toBeGreaterThan(restaurantBounds.maxX);
    expect(walkwayBounds.minX - restaurantBounds.maxX).toBeLessThan(0.8);

    const height = strategicLandmarkVisualHeight(restaurant)!;
    expect(height).toBeGreaterThan(restaurant.geometry.extrusionHeight);
    expect(height).toBeLessThanOrEqual(FENASOJA_RESTAURANT_LAYOUT.maximumVisualHeight);
    expect(fenasojaRestaurantVisualHeight(strategicLandmarkBounds(officialC2))).toBeGreaterThan(officialC2.geometry.extrusionHeight);
  });

  it('modela um único volume alongado com telhado cinza, entrada frontal e quatro pilares', () => {
    const bounds = strategicLandmarkBounds(restaurant);
    // The +Z front is rotated onto world +X, so the model width is the world-Z extent.
    const layout = createFenasojaRestaurantLayout({ width: bounds.depth, depth: bounds.width }, strategicLandmarkVisualHeight(restaurant)!);
    expect(layout.width).toBeGreaterThan(layout.depth);
    expect(layout.pillarXs).toHaveLength(4);
    expect(layout.pillarXs.map((x) => -x).reverse()).toEqual(layout.pillarXs.map((x) => expect.closeTo(x, 9)));
    expect(Math.max(...layout.pillarXs.map(Math.abs)) + layout.pillarSize / 2).toBeLessThanOrEqual(layout.canopyWidth / 2);
    expect(layout.pillarZ).toBeGreaterThan(layout.bodyFrontZ);
    expect(layout.canopyFrontZ).toBeLessThan(layout.terraceFrontZ);
    expect(layout.canopyFrontHeight).toBeLessThan(layout.canopyRearHeight);
    expect(layout.doorWidth).toBeGreaterThan(0);
    expect(layout.groundElevation + layout.ridgeHeight).toBeLessThanOrEqual(layout.height);
    expect(layout.bodyBackZ).toBeGreaterThanOrEqual(-layout.slabDepth / 2);
    expect(layout.serviceCenterZ - layout.serviceDepth / 2).toBeGreaterThanOrEqual(-layout.slabDepth / 2);

    const roof = FENASOJA_RESTAURANT_LAYOUT.palette.roof;
    const [r, g, b] = [1, 3, 5].map((offset) => parseInt(roof.slice(offset, offset + 2), 16));
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(12);
  });
});

describe('Calçada do Arvoredo refinada como frontal do Restaurante', () => {
  const entities = withUnifiedFenasojaRestaurant({ entities: [...OFFICIAL_RENDERED_ENTITIES] }).entities;
  const plan = buildRestaurantFrontagePlan({ entities, trees: COMMERCIAL_MAP_TREES });
  const walkway = frontageBounds(byIdentifier(entities, 'CALCADA-ARVOREDO')!)!;
  const restaurant = frontageBounds(byIdentifier(entities, 'C2')!)!;
  const ruaBrasil = frontageBounds(byIdentifier(entities, 'RUA-BRASIL')!)!;

  it('coloca a laje de concreto dentro da calçada oficial, preservando o meio-fio e a Rua Brasil', () => {
    expect(plan.available).toBe(true);
    const slab = plan.slab!;
    expect(slab.minX).toBeGreaterThan(walkway.minX);
    expect(slab.maxX).toBeLessThan(walkway.maxX);
    expect(slab.maxZ).toBeLessThan(walkway.maxZ);
    expect(slab.minZ).toBeGreaterThanOrEqual(ruaBrasil.maxZ + RESTAURANT_FRONTAGE_LAYOUT.roadClearance - 1e-9);
    expect(plan.diagnostics.clippedByRoadIds).toContain(byIdentifier(entities, 'RUA-BRASIL')!.id);
    expect(RESTAURANT_FRONTAGE_LAYOUT.slab.topElevation).toBeLessThan(0.0405);
    expect(plan.joints.length).toBeGreaterThan(6);
  });

  it('liga a entrada do restaurante à calçada e abre a cerca viva no eixo do acesso', () => {
    const connector = plan.connector!;
    expect(connector.minX).toBeLessThan(restaurant.maxX);
    expect(connector.maxX).toBeCloseTo(walkway.minX, 9);
    const centerZ = (connector.minZ + connector.maxZ) / 2;
    expect(centerZ).toBeCloseTo((restaurant.minZ + restaurant.maxZ) / 2, 9);
    expect(plan.hedges.length).toBeGreaterThan(2);
    plan.hedges.forEach((hedge) => {
      const start = hedge.center[1] - hedge.size[1] / 2;
      const end = hedge.center[1] + hedge.size[1] / 2;
      expect(end < connector.minZ || start > connector.maxZ).toBe(true);
      expect(hedge.center[0]).toBeLessThan(walkway.minX);
      expect(hedge.center[0] + hedge.size[0] / 2).toBeLessThan(walkway.minX);
    });
    expect(RESTAURANT_FRONTAGE_LAYOUT.connector.topElevation).toBeLessThan(
      FENASOJA_RESTAURANT_LAYOUT.groundElevation + 0.0165,
    );
  });

  it('mantém a identidade arborizada com canteiros das árvores existentes e arbustos dentro da laje', () => {
    const slab = plan.slab!;
    expect(plan.treePits.length).toBeGreaterThanOrEqual(3);
    plan.treePits.forEach(([x, z]) => {
      expect(x).toBeGreaterThan(slab.minX - RESTAURANT_FRONTAGE_LAYOUT.treePit.slabTolerance);
      expect(x).toBeLessThan(slab.maxX + RESTAURANT_FRONTAGE_LAYOUT.treePit.slabTolerance);
      expect(z).toBeGreaterThan(slab.minZ);
      expect(z).toBeLessThan(slab.maxZ);
    });
    expect(plan.shrubs.length).toBeGreaterThan(3);
    plan.shrubs.forEach((shrub) => {
      expect(shrub.position[0]).toBeLessThan(slab.maxX);
      expect(shrub.position[0]).toBeGreaterThan(slab.minX);
      COMMERCIAL_MAP_TREES.forEach((tree) => {
        expect(Math.hypot(tree.position[0] - shrub.position[0], tree.position[1] - shrub.position[1]))
          .toBeGreaterThan(RESTAURANT_FRONTAGE_LAYOUT.shrub.treeClearance * 0.8);
      });
    });
    expect(plan.lawn!.maxX).toBeCloseTo(walkway.minX, 9);
    expect(plan.lawn!.minZ).toBeGreaterThan(ruaBrasil.maxZ);
  });

  it('é determinístico, fica dentro do orçamento de desenho e desaparece sem os donos oficiais', () => {
    expect(plan.diagnostics.withinRenderBudget).toBe(true);
    expect(buildRestaurantFrontagePlan({ entities, trees: COMMERCIAL_MAP_TREES })).toEqual(plan);
    const withoutWalkway = entities.filter((entity) => entity.publicIdentifier !== 'CALCADA-ARVOREDO');
    expect(buildRestaurantFrontagePlan({ entities: withoutWalkway }).available).toBe(false);
    const withoutRestaurant = entities.filter((entity) => entity.publicIdentifier !== 'C2');
    expect(buildRestaurantFrontagePlan({ entities: withoutRestaurant }).available).toBe(false);
  });
});
