import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_LOT_AREA_BLOCKS,
  EXTERNAL_LOT_AREA_BLOCK_SUBTOTALS,
  EXTERNAL_LOT_AREA_SOURCE,
  EXTERNAL_LOT_AREA_TOTAL_SQM,
  EXTERNAL_LOT_OFFICIAL_AREAS,
  getExternalLotOfficialArea,
  getExternalLotOfficialAreaByIdentifier,
} from '@/features/commercial-map/data/externalLotOfficialAreas';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';

const round2 = (value: number) => Math.round(value * 100) / 100;

describe('metragens oficiais dos lotes externos', () => {
  it('mantém 169 registros únicos com duas casas decimais', () => {
    expect(EXTERNAL_LOT_OFFICIAL_AREAS).toHaveLength(169);
    const identifiers = EXTERNAL_LOT_OFFICIAL_AREAS.map((lot) => lot.publicIdentifier);
    expect(new Set(identifiers).size).toBe(identifiers.length);
    EXTERNAL_LOT_OFFICIAL_AREAS.forEach((lot) => {
      expect(lot.publicIdentifier).toBe(`Q-${lot.block}-${String(lot.lotNumber).padStart(2, '0')}`);
      expect(lot.officialAreaSqm).toBe(round2(lot.officialAreaSqm));
      expect(lot.officialAreaSqm).toBeGreaterThan(0);
    });
  });

  it('confere subtotais por quadra e o total documental de 33.733,77 m²', () => {
    const subtotals = new Map<string, number>();
    EXTERNAL_LOT_OFFICIAL_AREAS.forEach((lot) => {
      subtotals.set(lot.block, round2((subtotals.get(lot.block) ?? 0) + lot.officialAreaSqm));
    });
    EXTERNAL_LOT_AREA_BLOCKS.forEach((block) => {
      expect(subtotals.get(block)).toBe(EXTERNAL_LOT_AREA_BLOCK_SUBTOTALS[block]);
    });
    expect(round2([...subtotals.values()].reduce((total, value) => total + value, 0)))
      .toBe(EXTERNAL_LOT_AREA_TOTAL_SQM);
    expect(EXTERNAL_LOT_AREA_TOTAL_SQM).toBe(33733.77);
  });

  it('resolve casos de risco pela combinação de quadra e número', () => {
    expect(getExternalLotOfficialArea('Q', 1)?.officialAreaSqm).toBe(283.00);
    expect(getExternalLotOfficialArea('V', 6)?.officialAreaSqm).toBe(240.65);
    expect(getExternalLotOfficialArea('T', 11)?.officialAreaSqm).toBe(244.51);
    expect(getExternalLotOfficialArea('U', 12)?.officialAreaSqm).toBe(244.51);
    expect(getExternalLotOfficialAreaByIdentifier('Q-D-11')?.officialAreaSqm).toBe(263.74);
    expect(getExternalLotOfficialAreaByIdentifier('Q-E-13')?.officialAreaSqm).toBe(165.88);
    expect(getExternalLotOfficialAreaByIdentifier('Q-R-01')).toBeUndefined();
  });

  it('aplica a área documental na referência oficial sem tocar Exporural nem pavilhões', () => {
    const entitiesById = new Map(OFFICIAL_REFERENCE_DATA.entities.map((entity) => [entity.id, entity]));
    const externalLots = OFFICIAL_REFERENCE_DATA.lots.filter(
      (lot) => lot.block !== null && (EXTERNAL_LOT_AREA_BLOCKS as readonly string[]).includes(lot.block),
    );

    // 167 cadastrados: Q-G-03 e Q-G-04 seguem fora por conflito com a via interna.
    expect(externalLots).toHaveLength(167);
    externalLots.forEach((lot) => {
      const reference = getExternalLotOfficialAreaByIdentifier(lot.publicIdentifier)!;
      expect(lot.officialAreaSqm).toBe(reference.officialAreaSqm);
      expect(lot.calculatedAreaSqm).toBeNull();
      expect(lot.areaValidationStatus).toBe('VALIDATED');
      const entity = entitiesById.get(lot.entityId)!;
      expect(entity.metadata.areaSource).toBe(EXTERNAL_LOT_AREA_SOURCE);
      expect(entity.metadata.cartographicAreaOnly).toBe(true);
      expect(entity.metadata.officialMeasurements).toBe(false);
    });

    // Exporural preserva a própria origem medida.
    const exporuralLots = OFFICIAL_REFERENCE_DATA.lots.filter((lot) => lot.block === 'R' || lot.block === 'S');
    expect(exporuralLots).toHaveLength(95);
    exporuralLots.forEach((lot) => {
      expect(entitiesById.get(lot.entityId)!.metadata.areaSource).toBeUndefined();
    });

    // Módulos internos dos pavilhões continuam sem área documental.
    OFFICIAL_REFERENCE_DATA.lots
      .filter((lot) => entitiesById.get(lot.entityId)?.classification === 'INTERNAL_STAND')
      .forEach((lot) => {
        expect(lot.officialAreaSqm).toBeNull();
        expect(lot.areaValidationStatus).toBe('UNVALIDATED');
      });
  });

  it('documenta Q-G-03 e Q-G-04 sem cadastrá-los enquanto a via interna ocupa a coluna', () => {
    ['Q-G-03', 'Q-G-04'].forEach((identifier) => {
      expect(getExternalLotOfficialAreaByIdentifier(identifier)?.officialAreaSqm).toBe(168.00);
      expect(OFFICIAL_REFERENCE_DATA.lots.find((item) => item.publicIdentifier === identifier)).toBeUndefined();
    });
    expect(OFFICIAL_REFERENCE_DATA.entities.some((entity) => entity.publicIdentifier === 'RUA-INTERNA-QUADRA-G')).toBe(true);
    expect(OFFICIAL_REFERENCE_DATA.entities.find((entity) => entity.publicIdentifier === 'B40')).toBeUndefined();
  });
});
