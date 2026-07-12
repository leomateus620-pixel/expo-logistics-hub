import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
  strategicLandmarkFocusDirection,
  strategicLandmarkSearchAliases,
  strategicLandmarkVisualHeight,
} from '@/features/commercial-map/utils/landmarks';
import {
  buildEntityExplorerIndex,
  filterAndSortEntityExplorerItems,
} from '@/features/commercial-map/utils/entityExplorer';

const targets = Object.fromEntries(
  OFFICIAL_REFERENCE_ENTITIES
    .filter((entity) => ['C8', 'C2', 'F'].includes(entity.publicIdentifier))
    .map((entity) => [entity.publicIdentifier, entity]),
);

describe('marcos arquitetônicos estratégicos', () => {
  it('resolve os assets pelo identificador público sem depender do id persistido', () => {
    const persistedEtnia = { ...targets.C8, id: 'db:uuid:etnia' };
    const persistedRestaurant = { ...targets.C2, id: 'db:uuid:restaurante' };
    const persistedArena = { ...targets.F, id: 'db:uuid:arena' };
    expect(resolveStrategicLandmarkKind(persistedEtnia)).toBe('german-pavilion');
    expect(resolveStrategicLandmarkKind(persistedRestaurant)).toBe('fenasoja-restaurant');
    expect(resolveStrategicLandmarkKind(persistedArena)).toBe('sicredi-arena');
    expect(resolveStrategicLandmarkKind({ publicIdentifier: 'B1' })).toBeNull();
    expect(strategicLandmarkFacingRadians(persistedRestaurant)).toBe(Math.PI);
    expect(strategicLandmarkFocusDirection(persistedRestaurant)?.[2]).toBeLessThan(0);
    expect(strategicLandmarkFocusDirection(persistedArena)?.[2]).toBeGreaterThan(0);
  });

  it('preserva os footprints oficiais enquanto calcula silhuetas mais altas', () => {
    const etniaBounds = strategicLandmarkBounds(targets.C8);
    const restaurantBounds = strategicLandmarkBounds(targets.C2);
    const arenaBounds = strategicLandmarkBounds(targets.F);
    expect(etniaBounds.width).toBeCloseTo(2.5745, 4);
    expect(etniaBounds.depth).toBeCloseTo(2.5309, 4);
    expect(restaurantBounds.width).toBeCloseTo(3.9273, 4);
    expect(restaurantBounds.depth).toBeCloseTo(3.2727, 4);
    expect(arenaBounds.width).toBeCloseTo(10.5818, 4);
    expect(arenaBounds.depth).toBeCloseTo(9.6, 4);

    [targets.C8, targets.C2, targets.F].forEach((entity) => {
      const before = JSON.stringify(entity);
      expect(strategicLandmarkVisualHeight(entity)).toBeGreaterThan(entity.geometry.extrusionHeight);
      expect(JSON.stringify(entity)).toBe(before);
    });
  });

  it('mantém os nomes oficiais e acrescenta aliases arquitetônicos à busca', () => {
    expect(strategicLandmarkSearchAliases(targets.C8)).toContain('Etnia Alemã');
    expect(strategicLandmarkSearchAliases(targets.C2)).toContain('Restaurante Fenasoja');
    expect(strategicLandmarkSearchAliases(targets.F)).toContain('Arena Sicredi Icatu');

    const items = buildEntityExplorerIndex(
      [targets.C8, targets.C2, targets.F],
      [],
    );
    const result = filterAndSortEntityExplorerItems(items, {
      query: 'Restaurante Fenasoja',
      statusFilters: [],
      classificationFilters: [],
      locationFilter: null,
      verificationFilters: [],
      sortOrder: 'relevance',
    });

    expect(result.map((item) => item.entity.publicIdentifier)).toEqual(['C2']);
    expect(targets.C2.name).toBe('Restaurante Central');
  });
});
