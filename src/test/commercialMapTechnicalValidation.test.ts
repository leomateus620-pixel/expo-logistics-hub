import { beforeEach, describe, expect, it } from 'vitest';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import type {
  CommercialLot,
  MapEntity,
  PolygonGeometry,
} from '@/features/commercial-map/types';
import { scopeCommercialMapData } from '@/features/commercial-map/utils/areaScope';
import {
  buildTechnicalValidationReport,
  canUseTechnicalValidationOverlay,
} from '@/features/commercial-map/utils/technicalValidation';

function polygon(points: Array<[number, number]>): PolygonGeometry {
  return {
    id: null,
    type: 'Polygon',
    coordinates: [[...points, points[0]]],
    elevation: 0,
    extrusionHeight: 0.18,
    rotation: 0,
    geometryVersion: 1,
    calibrationVersion: 1,
  };
}

const baseLot = OFFICIAL_REFERENCE_DATA.lots.find((lot) => lot.publicIdentifier === 'Q-R-01')!;
const baseEntity = OFFICIAL_REFERENCE_DATA.entities.find((entity) => entity.id === baseLot.entityId)!;

function entity(id: string, geometry: PolygonGeometry): MapEntity {
  return {
    ...baseEntity,
    id,
    publicIdentifier: id,
    geometry,
  };
}

function lot(id: string): CommercialLot {
  return {
    ...baseLot,
    id: `lot-${id}`,
    entityId: id,
    publicIdentifier: id,
    officialAreaSqm: 50,
    calculatedAreaSqm: 50.004,
  };
}

describe('overlay técnico da Exporural', () => {
  beforeEach(() => {
    useCommercialMapStore.setState({ technicalValidationVisible: false });
  });

  it('fica desligado por padrão e só é disponibilizado para admin na Exporural', () => {
    expect(useCommercialMapStore.getState().technicalValidationVisible).toBe(false);
    expect(canUseTechnicalValidationOverlay('exporural', { isMapAdmin: true })).toBe(true);
    expect(canUseTechnicalValidationOverlay('exporural', { isMapAdmin: false })).toBe(false);
    expect(canUseTechnicalValidationOverlay('park', { isMapAdmin: true })).toBe(false);
  });

  it('aceita divisas compartilhadas e detecta somente sobreposição interior', () => {
    const first = entity('Q-R-A', polygon([[0, 0], [5, 0], [5, 10], [0, 10]]));
    const adjacent = entity('Q-R-B', polygon([[5, 0], [10, 0], [10, 10], [5, 10]]));
    const overlapping = entity('Q-R-C', polygon([[4, 2], [8, 2], [8, 8], [4, 8]]));
    const report = buildTechnicalValidationReport(
      [first, adjacent, overlapping],
      [lot(first.id), lot(adjacent.id), lot(overlapping.id)],
    );

    expect(report.find((entry) => entry.entity.id === first.id)?.overlappingCodes).toEqual(['Q-R-C']);
    expect(report.find((entry) => entry.entity.id === adjacent.id)?.overlappingCodes).toEqual(['Q-R-C']);
    expect(report.find((entry) => entry.entity.id === overlapping.id)?.overlappingCodes).toEqual(['Q-R-A', 'Q-R-B']);
    expect(report.every((entry) => entry.differenceSqm === 0)).toBe(true);
  });

  it('marca auto-interseção como inválida com precedência sobre outros alertas', () => {
    const invalid = entity('Q-R-X', polygon([[0, 0], [10, 10], [0, 10], [10, 0]]));
    const [entry] = buildTechnicalValidationReport([invalid], [lot(invalid.id)]);

    expect(entry.valid).toBe(false);
    expect(entry.selfIntersecting).toBe(true);
    expect(entry.severity).toBe('invalid');
    expect(entry.errors.some((error) => error.includes('auto-interseção'))).toBe(true);
  });

  it('audita as 95 unidades oficiais da vista isolada sem falso positivo topológico', () => {
    const scoped = scopeCommercialMapData(
      {
        entities: OFFICIAL_REFERENCE_DATA.entities,
        lots: OFFICIAL_REFERENCE_DATA.lots,
      },
      'exporural',
    );
    const report = buildTechnicalValidationReport(scoped.entities, scoped.lots);
    const lotEntries = report.filter((entry) => entry.lot);

    expect(lotEntries).toHaveLength(95);
    expect(lotEntries.filter((entry) => entry.severity !== 'valid')).toEqual([]);
    expect(lotEntries.every((entry) => entry.officialAreaSqm != null)).toBe(true);
    expect(lotEntries.every((entry) => entry.calculatedAreaSqm != null)).toBe(true);
  });
});
