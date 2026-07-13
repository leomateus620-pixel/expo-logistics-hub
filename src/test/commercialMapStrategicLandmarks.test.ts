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
    .filter((entity) => ['B12', 'C5', 'C6', 'C8', 'C2', 'F', 'PORTICO-NACOES'].includes(entity.publicIdentifier))
    .map((entity) => [entity.publicIdentifier, entity]),
);

describe('marcos arquitetônicos estratégicos', () => {
  it('resolve os assets pelo identificador público sem depender do id persistido', () => {
    const persistedHeadquarters = { ...targets.B12, id: 'db:uuid:sede' };
    const persistedPolish = { ...targets.C5, id: 'db:uuid:polonesa' };
    const persistedItalian = { ...targets.C6, id: 'db:uuid:italiana' };
    const persistedPortico = { ...targets['PORTICO-NACOES'], id: 'db:uuid:portico' };
    const persistedEtnia = { ...targets.C8, id: 'db:uuid:etnia' };
    const persistedRestaurant = { ...targets.C2, id: 'db:uuid:restaurante' };
    const persistedArena = { ...targets.F, id: 'db:uuid:arena' };
    expect(resolveStrategicLandmarkKind(persistedHeadquarters)).toBe('fenasoja-headquarters');
    expect(resolveStrategicLandmarkKind(persistedPolish)).toBe('polish-pavilion');
    expect(resolveStrategicLandmarkKind(persistedItalian)).toBe('italian-pavilion');
    expect(resolveStrategicLandmarkKind(persistedPortico)).toBe('nations-portico');
    expect(resolveStrategicLandmarkKind(persistedEtnia)).toBe('german-pavilion');
    expect(resolveStrategicLandmarkKind(persistedRestaurant)).toBe('fenasoja-restaurant');
    expect(resolveStrategicLandmarkKind(persistedArena)).toBe('sicredi-arena');
    expect(resolveStrategicLandmarkKind({ publicIdentifier: 'B1' })).toBeNull();
    expect(strategicLandmarkFacingRadians(persistedHeadquarters)).toBe(0);
    expect(strategicLandmarkFacingRadians(persistedPolish)).toBeCloseTo(Math.PI / 2);
    expect(strategicLandmarkFacingRadians(persistedItalian)).toBeCloseTo(-Math.PI / 2);
    expect(strategicLandmarkFacingRadians(persistedPortico)).toBe(0);
    expect(strategicLandmarkFacingRadians(persistedEtnia)).toBeCloseTo(Math.PI / 2);
    expect(strategicLandmarkFacingRadians(persistedRestaurant)).toBe(Math.PI);
    expect(strategicLandmarkFacingRadians(persistedArena)).toBeCloseTo(-Math.PI / 2);
    expect(strategicLandmarkFocusDirection(persistedHeadquarters)?.[2]).toBeGreaterThan(0);
    expect(strategicLandmarkFocusDirection(persistedPolish)?.[0]).toBeGreaterThan(0);
    expect(strategicLandmarkFocusDirection(persistedItalian)?.[0]).toBeLessThan(0);
    expect(strategicLandmarkFocusDirection(persistedPortico)?.[2]).toBeGreaterThan(0);
    expect(strategicLandmarkFocusDirection(persistedEtnia)?.[0]).toBeGreaterThan(0);
    expect(strategicLandmarkFocusDirection(persistedRestaurant)?.[2]).toBeLessThan(0);
    expect(strategicLandmarkFocusDirection(persistedArena)?.[0]).toBeLessThan(0);
  });

  it('preserva os footprints oficiais enquanto calcula silhuetas mais altas', () => {
    const headquartersBounds = strategicLandmarkBounds(targets.B12);
    const polishBounds = strategicLandmarkBounds(targets.C5);
    const italianBounds = strategicLandmarkBounds(targets.C6);
    const porticoBounds = strategicLandmarkBounds(targets['PORTICO-NACOES']);
    const etniaBounds = strategicLandmarkBounds(targets.C8);
    const restaurantBounds = strategicLandmarkBounds(targets.C2);
    const arenaBounds = strategicLandmarkBounds(targets.F);
    expect(headquartersBounds.width).toBeCloseTo(2.9455, 4);
    expect(headquartersBounds.depth).toBeCloseTo(2.2691, 4);
    expect(polishBounds.width).toBeCloseTo(2.5745, 4);
    expect(polishBounds.depth).toBeCloseTo(2.5309, 4);
    expect(italianBounds.width).toBeCloseTo(2.5745, 4);
    expect(italianBounds.depth).toBeCloseTo(2.5309, 4);
    expect(porticoBounds.width).toBeCloseTo(2.7927, 4);
    expect(porticoBounds.depth).toBeCloseTo(1.0473, 4);
    expect(etniaBounds.width).toBeCloseTo(2.5745, 4);
    expect(etniaBounds.depth).toBeCloseTo(2.5309, 4);
    expect(restaurantBounds.width).toBeCloseTo(3.9273, 4);
    expect(restaurantBounds.depth).toBeCloseTo(3.2727, 4);
    expect(arenaBounds.width).toBeCloseTo(10.5818, 4);
    expect(arenaBounds.depth).toBeCloseTo(9.6, 4);

    [targets.B12, targets.C5, targets.C6, targets.C8, targets.C2, targets.F, targets['PORTICO-NACOES']].forEach((entity) => {
      const before = JSON.stringify(entity);
      expect(strategicLandmarkVisualHeight(entity)).toBeGreaterThan(entity.geometry.extrusionHeight);
      expect(JSON.stringify(entity)).toBe(before);
    });
  });

  it('mantém os nomes oficiais e acrescenta aliases arquitetônicos à busca', () => {
    expect(strategicLandmarkSearchAliases(targets.B12)).toContain('Fenasoja Headquarters');
    expect(strategicLandmarkSearchAliases(targets.C5)).toContain('Casa Polonesa');
    expect(strategicLandmarkSearchAliases(targets.C6)).toContain('Etnia Italiana');
    expect(strategicLandmarkSearchAliases(targets['PORTICO-NACOES'])).toContain('Portal das Nações');
    expect(strategicLandmarkSearchAliases(targets.C8)).toContain('Etnia Alemã');
    expect(strategicLandmarkSearchAliases(targets.C2)).toContain('Restaurante Fenasoja');
    expect(strategicLandmarkSearchAliases(targets.F)).toContain('Arena Sicredi Icatu');

    const items = buildEntityExplorerIndex(
      [targets.B12, targets.C5, targets.C6, targets.C8, targets.C2, targets.F, targets['PORTICO-NACOES']],
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

    const headquartersResult = filterAndSortEntityExplorerItems(items, {
      query: 'Fenasoja Headquarters',
      statusFilters: [],
      classificationFilters: [],
      locationFilter: null,
      verificationFilters: [],
      sortOrder: 'relevance',
    });
    expect(headquartersResult.map((item) => item.entity.publicIdentifier)).toEqual(['B12']);
    expect(targets.B12.id).toBe('reference:2026:b12');
  });
});
