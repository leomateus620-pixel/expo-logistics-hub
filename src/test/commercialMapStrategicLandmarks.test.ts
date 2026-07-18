import { describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_ENTITIES } from '@/features/commercial-map/data/officialReference2026';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
  strategicLandmarkFocusDirection,
  strategicLandmarkSearchAliases,
  strategicLandmarkSupportsInterior,
  strategicLandmarkVisualHeight,
} from '@/features/commercial-map/utils/landmarks';
import {
  buildEntityExplorerIndex,
  filterAndSortEntityExplorerItems,
} from '@/features/commercial-map/utils/entityExplorer';

const targetIdentifiers = [
  'B11',
  'B12',
  'B9',
  'B41',
  'C5',
  'C6',
  'C8',
  'C2',
  'F',
  'PORTICO-NACOES',
  'RUA-BRASILIA',
  'RUA-ARGENTINA',
];

const targets = Object.fromEntries(
  OFFICIAL_REFERENCE_ENTITIES
    .filter((entity) => targetIdentifiers.includes(entity.publicIdentifier))
    .map((entity) => [entity.publicIdentifier, entity]),
);

describe('marcos arquitetônicos estratégicos', () => {
  it('resolve os assets pelo identificador público sem depender do id persistido', () => {
    const persistedAdministrativeCenter = { ...targets.B11, id: 'db:uuid:centro-administrativo' };
    const persistedHeadquarters = { ...targets.B12, id: 'db:uuid:sede' };
    const persistedLivestockPavilion = { ...targets.B9, id: 'db:uuid:pecuaria' };
    const persistedPolish = { ...targets.C5, id: 'db:uuid:polonesa' };
    const persistedItalian = { ...targets.C6, id: 'db:uuid:italiana' };
    const persistedPortico = { ...targets['PORTICO-NACOES'], id: 'db:uuid:portico' };
    const persistedEtnia = { ...targets.C8, id: 'db:uuid:etnia' };
    const persistedRestaurant = { ...targets.C2, id: 'db:uuid:restaurante' };
    const persistedArena = { ...targets.F, id: 'db:uuid:arena' };

    expect(resolveStrategicLandmarkKind(persistedAdministrativeCenter)).toBe('administrative-center');
    expect(resolveStrategicLandmarkKind(persistedHeadquarters)).toBe('fenasoja-headquarters');
    expect(resolveStrategicLandmarkKind(persistedLivestockPavilion)).toBe('livestock-pavilion');
    expect(resolveStrategicLandmarkKind(persistedPolish)).toBe('polish-pavilion');
    expect(resolveStrategicLandmarkKind(persistedItalian)).toBe('italian-pavilion');
    expect(resolveStrategicLandmarkKind(persistedPortico)).toBe('nations-portico');
    expect(resolveStrategicLandmarkKind(persistedEtnia)).toBe('german-pavilion');
    expect(resolveStrategicLandmarkKind(persistedRestaurant)).toBe('fenasoja-restaurant');
    expect(resolveStrategicLandmarkKind(persistedArena)).toBe('sicredi-arena');
    expect(resolveStrategicLandmarkKind(targets.B41)).toBeNull();
    expect(resolveStrategicLandmarkKind({ publicIdentifier: 'B1' })).toBeNull();

    expect(strategicLandmarkFacingRadians(persistedAdministrativeCenter)).toBeCloseTo(Math.PI / 2);
    expect(strategicLandmarkFacingRadians(persistedHeadquarters)).toBeCloseTo(-Math.PI / 18);
    expect(strategicLandmarkFacingRadians(persistedLivestockPavilion)).toBe(0);
    expect(strategicLandmarkFacingRadians(persistedPolish)).toBeCloseTo(Math.PI / 2);
    expect(strategicLandmarkFacingRadians(persistedItalian)).toBeCloseTo(-Math.PI / 2);
    expect(strategicLandmarkFacingRadians(persistedPortico)).toBe(0);
    expect(strategicLandmarkFacingRadians(persistedEtnia)).toBeCloseTo(Math.PI / 2);
    expect(strategicLandmarkFacingRadians(persistedRestaurant)).toBe(Math.PI);
    expect(strategicLandmarkFacingRadians(persistedArena)).toBeCloseTo(-Math.PI / 2);

    expect(strategicLandmarkFocusDirection(persistedAdministrativeCenter)?.[0]).toBeGreaterThan(0);
    expect(strategicLandmarkFocusDirection(persistedHeadquarters)?.[0]).toBeLessThan(0);
    expect(strategicLandmarkFocusDirection(persistedHeadquarters)?.[2]).toBeGreaterThan(0);
    expect(strategicLandmarkFocusDirection(persistedLivestockPavilion)?.[2]).toBeGreaterThan(0);
    expect(strategicLandmarkFocusDirection(persistedPolish)?.[0]).toBeGreaterThan(0);
    expect(strategicLandmarkFocusDirection(persistedItalian)?.[0]).toBeLessThan(0);
    expect(strategicLandmarkFocusDirection(persistedPortico)?.[2]).toBeGreaterThan(0);
    expect(strategicLandmarkFocusDirection(persistedEtnia)?.[0]).toBeGreaterThan(0);
    expect(strategicLandmarkFocusDirection(persistedRestaurant)?.[2]).toBeLessThan(0);
    expect(strategicLandmarkFocusDirection(persistedArena)?.[0]).toBeLessThan(0);
  });

  it('preserva os footprints oficiais enquanto calcula silhuetas mais altas', () => {
    const administrativeBounds = strategicLandmarkBounds(targets.B11);
    const headquartersBounds = strategicLandmarkBounds(targets.B12);
    const livestockBounds = strategicLandmarkBounds(targets.B9);
    const meetingRoomBounds = strategicLandmarkBounds(targets.B41);
    const polishBounds = strategicLandmarkBounds(targets.C5);
    const italianBounds = strategicLandmarkBounds(targets.C6);
    const porticoBounds = strategicLandmarkBounds(targets['PORTICO-NACOES']);
    const etniaBounds = strategicLandmarkBounds(targets.C8);
    const restaurantBounds = strategicLandmarkBounds(targets.C2);
    const arenaBounds = strategicLandmarkBounds(targets.F);

    expect(administrativeBounds.width).toBeCloseTo(2.7273, 4);
    expect(administrativeBounds.depth).toBeCloseTo(6.5455, 4);
    expect(headquartersBounds.width).toBeCloseTo(2.9455, 4);
    expect(headquartersBounds.depth).toBeCloseTo(2.2691, 4);
    expect(livestockBounds.width).toBeCloseTo(18.7636, 4);
    expect(livestockBounds.depth).toBeCloseTo(2.9018, 4);
    expect(meetingRoomBounds.width).toBeCloseTo(1.6145, 4);
    expect(meetingRoomBounds.depth).toBeCloseTo(1.44, 4);
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

    [targets.B11, targets.B12, targets.B9, targets.C5, targets.C6, targets.C8, targets.C2, targets.F, targets['PORTICO-NACOES']]
      .forEach((entity) => {
        const before = JSON.stringify(entity);
        expect(strategicLandmarkVisualHeight(entity)).toBeGreaterThan(entity.geometry.extrusionHeight);
        expect(JSON.stringify(entity)).toBe(before);
      });

    expect(strategicLandmarkVisualHeight(targets.B41)).toBeNull();
  });

  it('mantém B11, B12 e B41 em suas relações oficiais com as ruas', () => {
    const administrativeBounds = strategicLandmarkBounds(targets.B11);
    const headquartersBounds = strategicLandmarkBounds(targets.B12);
    const meetingRoomBounds = strategicLandmarkBounds(targets.B41);
    const brasiliaBounds = strategicLandmarkBounds(targets['RUA-BRASILIA']);
    const argentinaBounds = strategicLandmarkBounds(targets['RUA-ARGENTINA']);

    expect(administrativeBounds.maxX).toBeLessThan(brasiliaBounds.minX);
    expect(headquartersBounds.minX).toBeGreaterThan(brasiliaBounds.maxX);
    expect(headquartersBounds.centerZ).toBeLessThan(argentinaBounds.centerZ);
    expect(headquartersBounds.maxZ).toBeGreaterThan(argentinaBounds.minZ);
    expect(meetingRoomBounds.maxX).toBeLessThan(administrativeBounds.minX);

    expect(targets.B11.id).toBe('reference:2026:b11');
    expect(targets.B12.id).toBe('reference:2026:b12');
    expect(targets.B41.id).toBe('reference:2026:b41');
  });

  it('mantém os nomes oficiais e acrescenta aliases arquitetônicos à busca', () => {
    expect(strategicLandmarkSearchAliases(targets.B11)).toContain('Centro Administrativo Fenasoja');
    expect(strategicLandmarkSearchAliases(targets.B12)).toContain('Fenasoja Headquarters');
    expect(strategicLandmarkSearchAliases(targets.B9)).toContain('Pavilhões de Pecuária');
    expect(strategicLandmarkSearchAliases(targets.C5)).toContain('Casa Polonesa');
    expect(strategicLandmarkSearchAliases(targets.C6)).toContain('Etnia Italiana');
    expect(strategicLandmarkSearchAliases(targets['PORTICO-NACOES'])).toContain('Portal das Nações');
    expect(strategicLandmarkSearchAliases(targets.C8)).toContain('Etnia Alemã');
    expect(strategicLandmarkSearchAliases(targets.C2)).toContain('Restaurante Fenasoja');
    expect(strategicLandmarkSearchAliases(targets.F)).toContain('Arena Sicredi Icatu');

    const items = buildEntityExplorerIndex(
      [targets.B11, targets.B12, targets.B9, targets.B41, targets.C5, targets.C6, targets.C8, targets.C2, targets.F, targets['PORTICO-NACOES']],
      [],
    );

    const administrativeResult = filterAndSortEntityExplorerItems(items, {
      query: 'Centro Administrativo Fenasoja',
      statusFilters: [],
      classificationFilters: [],
      locationFilter: null,
      verificationFilters: [],
      sortOrder: 'relevance',
    });
    expect(administrativeResult.map((item) => item.entity.publicIdentifier)).toEqual(['B11']);

    const headquartersResult = filterAndSortEntityExplorerItems(items, {
      query: 'Fenasoja Headquarters',
      statusFilters: [],
      classificationFilters: [],
      locationFilter: null,
      verificationFilters: [],
      sortOrder: 'relevance',
    });
    expect(headquartersResult.map((item) => item.entity.publicIdentifier)).toEqual(['B12']);

    const livestockResult = filterAndSortEntityExplorerItems(items, {
      query: 'Pavilhões de Pecuária',
      statusFilters: [],
      classificationFilters: [],
      locationFilter: null,
      verificationFilters: [],
      sortOrder: 'relevance',
    });
    expect(livestockResult.map((item) => item.entity.publicIdentifier)).toEqual(['B9']);

    const meetingRoomResult = filterAndSortEntityExplorerItems(items, {
      query: 'Sala de Reuniões Fenasoja',
      statusFilters: [],
      classificationFilters: [],
      locationFilter: null,
      verificationFilters: [],
      sortOrder: 'relevance',
    });
    expect(meetingRoomResult.map((item) => item.entity.publicIdentifier)).toEqual(['B41']);
    expect(targets.C2.name).toBe('Restaurante Central');
  });

  it('limita a inspeção interna aos marcos que possuem uma cena vinculada', () => {
    expect(strategicLandmarkSupportsInterior(targets.B9)).toBe(true);
    expect(strategicLandmarkSupportsInterior(targets.B12)).toBe(true);
    expect(strategicLandmarkSupportsInterior(targets.B11)).toBe(false);
    expect(strategicLandmarkSupportsInterior(targets.C5)).toBe(false);
  });
});
