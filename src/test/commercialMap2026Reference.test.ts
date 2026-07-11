import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_2026_SOURCE_MANIFEST,
  OFFICIAL_REFERENCE_DATA,
  OFFICIAL_REFERENCE_REVISION,
} from '@/features/commercial-map/data/officialReference2026';
import type { MapEntity } from '@/features/commercial-map/types';
import { normalizeMapEntityMetadata } from '@/features/commercial-map/utils/mapMetadata';

const expectedLots: Record<string, number[]> = {
  S: Array.from({ length: 36 }, (_, index) => index + 1),
  R: Array.from({ length: 59 }, (_, index) => index + 1),
  V: Array.from({ length: 6 }, (_, index) => index + 1),
  Q: Array.from({ length: 6 }, (_, index) => index + 1),
  U: Array.from({ length: 12 }, (_, index) => index + 1),
  P: Array.from({ length: 14 }, (_, index) => index + 1),
  M: Array.from({ length: 16 }, (_, index) => index + 1),
  G: [1, 2, 5, 6, 7, 8],
  T: Array.from({ length: 12 }, (_, index) => index + 1),
  O: Array.from({ length: 14 }, (_, index) => index + 1),
  L: Array.from({ length: 16 }, (_, index) => index + 1),
  F: Array.from({ length: 8 }, (_, index) => index + 1),
  J: Array.from({ length: 16 }, (_, index) => index + 1),
  E: Array.from({ length: 13 }, (_, index) => index + 1),
  I: Array.from({ length: 16 }, (_, index) => index + 1),
  D: Array.from({ length: 12 }, (_, index) => index + 1),
};

function bounds(entity: MapEntity) {
  const ring = entity.geometry.coordinates[0];
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

describe('referência cartográfica oficial Fenasoja 2026', () => {
  it('mantém manifesto reproduzível e exclui a lista lateral de compradores', () => {
    expect(OFFICIAL_REFERENCE_REVISION).toBe('2026.1');
    expect(OFFICIAL_2026_SOURCE_MANIFEST.parkCropPdf.x + OFFICIAL_2026_SOURCE_MANIFEST.parkCropPdf.width)
      .toBeLessThan(OFFICIAL_2026_SOURCE_MANIFEST.buyerListExcludedFromX);
    expect(OFFICIAL_REFERENCE_DATA.project.referenceRevision).toBe(OFFICIAL_REFERENCE_REVISION);
  });

  it('representa o conjunto oficial de quadras sem inventar H ou K', () => {
    const quadras = OFFICIAL_REFERENCE_DATA.entities
      .filter((entity) => entity.classification === 'QUADRA')
      .map((entity) => String(entity.metadata.block))
      .sort();
    expect(quadras).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I', 'J', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'X']);
  });

  it('preserva exatamente as 262 numerações visíveis por quadra', () => {
    const lotsByBlock = new Map<string, number[]>();
    OFFICIAL_REFERENCE_DATA.lots.forEach((lot) => {
      const list = lotsByBlock.get(lot.block!) ?? [];
      list.push(Number(lot.lotNumber));
      lotsByBlock.set(lot.block!, list);
      expect(lot.displayName).toBe(`Lote ${lot.lotNumber}`);
      expect(lot.currentBuyer).toBeNull();
      expect(lot.activeContractNumber).toBeNull();
    });

    expect(OFFICIAL_REFERENCE_DATA.lots).toHaveLength(262);
    expect(Object.fromEntries([...lotsByBlock].map(([block, values]) => [block, values.sort((a, b) => a - b)])))
      .toEqual(expectedLots);
    expect(lotsByBlock.get('G')).not.toContain(3);
    expect(lotsByBlock.get('G')).not.toContain(4);
  });

  it('não sobrepõe lotes comerciais e mantém cada unidade dentro de sua quadra', () => {
    const entitiesById = new Map(OFFICIAL_REFERENCE_DATA.entities.map((entity) => [entity.id, entity]));
    const lotEntities = OFFICIAL_REFERENCE_DATA.lots.map((lot) => entitiesById.get(lot.entityId)!);

    lotEntities.forEach((entity) => {
      const parent = entitiesById.get(entity.parentEntityId!);
      expect(parent?.classification).toBe('QUADRA');
      const childBounds = bounds(entity);
      const parentBounds = bounds(parent!);
      expect(childBounds.minX).toBeGreaterThanOrEqual(parentBounds.minX - 0.001);
      expect(childBounds.maxX).toBeLessThanOrEqual(parentBounds.maxX + 0.001);
      expect(childBounds.minY).toBeGreaterThanOrEqual(parentBounds.minY - 0.001);
      expect(childBounds.maxY).toBeLessThanOrEqual(parentBounds.maxY + 0.001);
    });

    for (let first = 0; first < lotEntities.length; first += 1) {
      const a = bounds(lotEntities[first]);
      for (let second = first + 1; second < lotEntities.length; second += 1) {
        const b = bounds(lotEntities[second]);
        const overlapWidth = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        const overlapHeight = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
        expect(overlapWidth > 0.000001 && overlapHeight > 0.000001).toBe(false);
      }
    }
  });

  it('corrige a Arena Sicredi - Icatu e remove as interpretações de lago de 2024', () => {
    const arena = OFFICIAL_REFERENCE_DATA.entities.find((entity) => entity.publicIdentifier === 'F');
    expect(arena).toMatchObject({ name: 'Arena Sicredi - Icatu', classification: 'EVENT_VENUE' });
    expect(arena?.metadata.explicitNotWater).toBe(true);
    expect(OFFICIAL_REFERENCE_DATA.entities.some((entity) => entity.classification === 'WATER')).toBe(false);
    const names = OFFICIAL_REFERENCE_DATA.entities.map((entity) => entity.name);
    ['Lago central', 'Restaurante do lago', 'Banheiros químicos — lago', 'Área PRCT', 'Pista de remates']
      .forEach((obsoleteName) => expect(names).not.toContain(obsoleteName));
  });

  it('inclui a rede viária e todas as instâncias repetidas da legenda', () => {
    const roads = new Set(OFFICIAL_REFERENCE_DATA.entities
      .filter((entity) => entity.classification === 'ROAD' || entity.classification === 'PEDESTRIAN_PATH')
      .map((entity) => entity.name));
    [
      'Rua Bruno Schwartz', 'Rua Johan Muller', 'Rua Gustavo Bessel', 'Rua Emanuel Brachmann',
      'Rua Pastor Albert Lehenbauer', 'Rua 15 de Novembro', 'Rua Ubiretama', 'Rua Buenos Aires',
      'Rua Paraguai', 'Rua Bolívia', 'Rua Chile', 'Rua Brasil', 'Rua Uruguai', 'Rua Argentina',
      'Rua Brasília', 'Rua Montevidéu', 'Alameda Mercosul', 'Calçada do Arvoredo',
      'Avenida Benvenuto de Conti', 'Avenida dos Imigrantes', 'Avenida Tuparendi', 'Rodovia RS 472',
    ].forEach((road) => expect(roads.has(road), road).toBe(true));

    const gates = OFFICIAL_REFERENCE_DATA.entities.filter((entity) => entity.classification === 'GATE');
    expect(gates.map((gate) => gate.publicIdentifier).sort()).toEqual(['A1', 'A10', 'A11', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9']);
    expect(OFFICIAL_REFERENCE_DATA.entities.filter((entity) => entity.metadata.legendCode === 'E')).toHaveLength(24);
    expect(OFFICIAL_REFERENCE_DATA.entities.filter((entity) => entity.metadata.legendCode === 'D6')).toHaveLength(3);
    expect(OFFICIAL_REFERENCE_DATA.entities.filter((entity) => entity.metadata.legendCode === 'B42')).toHaveLength(2);
  });

  it('mantém os portões sem completar descrições ausentes na legenda oficial', () => {
    const gates = new Map(OFFICIAL_REFERENCE_DATA.entities
      .filter((entity) => entity.classification === 'GATE')
      .map((entity) => [entity.publicIdentifier, entity.name]));
    expect(gates.get('A10')).toBe('Portão 10');
    expect(gates.get('A11')).toBe('Portão 11');
  });

  it('normaliza uma fonte única de metadados para rótulo, busca e geometria', () => {
    const lotByEntity = new Map(OFFICIAL_REFERENCE_DATA.lots.map((lot) => [lot.entityId, lot]));
    const normalized = OFFICIAL_REFERENCE_DATA.entities.map((entity) => normalizeMapEntityMetadata(entity, lotByEntity.get(entity.id)));
    expect(normalized.every((metadata) => metadata.stableId && metadata.officialDisplayName && metadata.geometryReference)).toBe(true);
    expect(normalized.every((metadata) => metadata.labelAnchor.every(Number.isFinite))).toBe(true);
    expect(normalized.every((metadata) => metadata.searchKeywords.length > 0)).toBe(true);

    const restaurant = normalized.find((metadata) => metadata.structureCode === 'C2');
    expect(restaurant).toMatchObject({
      officialDisplayName: 'Restaurante Central',
      entityType: 'RESTAURANT',
      preferredLabelVisibility: 'medium',
    });
    expect(restaurant?.searchKeywords).toEqual(expect.arrayContaining(['Restaurante Central', 'C2']));

    const lotS36 = normalized.find((metadata) => metadata.block === 'S' && metadata.lotNumber === '36');
    expect(lotS36).toMatchObject({ preferredLabelVisibility: 'near', commercialStatus: 'BLOCKED' });
    expect(lotS36?.searchKeywords).toEqual(expect.arrayContaining(['Quadra S', 'Lote 36']));
  });

  it('usa identificadores compostos únicos e não associa ocupantes aos lotes', () => {
    const entityIdentifiers = OFFICIAL_REFERENCE_DATA.entities.map((entity) => entity.publicIdentifier);
    const lotIdentifiers = OFFICIAL_REFERENCE_DATA.lots.map((lot) => lot.publicIdentifier);
    expect(new Set(entityIdentifiers).size).toBe(entityIdentifiers.length);
    expect(new Set(lotIdentifiers).size).toBe(lotIdentifiers.length);
    expect(OFFICIAL_REFERENCE_DATA.lots.every((lot) => /^Q-[A-Z]-\d{2}$/.test(lot.publicIdentifier))).toBe(true);
    expect(OFFICIAL_REFERENCE_DATA.entities
      .filter((entity) => entity.classification === 'SELLABLE_LOT')
      .every((entity) => entity.metadata.buyerDataImported === false)).toBe(true);
  });
});
