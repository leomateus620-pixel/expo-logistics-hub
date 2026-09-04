import { describe, expect, it } from 'vitest';
import {
  NON_PERMANENT_REMOVED_IDENTIFIERS_2026,
  OFFICIAL_RENDERED_ENTITIES,
} from '@/features/commercial-map/data/officialReference2026';

const REMOVED = new Set(NON_PERMANENT_REMOVED_IDENTIFIERS_2026);

const PERMANENT_SAMPLE = [
  'B11', 'B12', 'B19', 'B28', 'B29', 'B37', 'B41', 'B42-01',
  'C5', 'C6', 'C7', 'C8', 'D1', 'D2', 'D3', 'J',
  'PAVILHAO-09', 'PISTA-CAMPEIRA', 'TEST-DRIVE', 'AREA-MOTORHOME',
  'PORTICO-NACOES', 'EST-EXP-VIS', 'EST-VIS',
];

describe('limpeza estrutural dos blocos não permanentes', () => {
  it('remove exatamente 45 identificadores (26 sanitários + 19 estruturas)', () => {
    const restrooms = NON_PERMANENT_REMOVED_IDENTIFIERS_2026.filter((id) => id.startsWith('E-'));
    expect(restrooms).toHaveLength(26);
    expect(NON_PERMANENT_REMOVED_IDENTIFIERS_2026).toHaveLength(45);
    expect(new Set(NON_PERMANENT_REMOVED_IDENTIFIERS_2026).size).toBe(45);
  });

  it('cobre cada bloco citado no pedido por identificador oficial', () => {
    [
      'B14', 'B15', 'B16', 'B17', 'B18', 'B21', 'B23', 'B24', 'B25', 'B26', 'B27',
      'B30', 'B31', 'B32', 'B33', 'B34', 'B39', 'B40', 'B42-02',
      'E-01', 'E-02', 'E-05', 'E-09', 'E-10', 'E-11', 'E-12', 'E-13', 'E-15',
    ].forEach((identifier) => expect(REMOVED.has(identifier)).toBe(true));
  });

  it('não deixa nenhuma entidade removida na referência renderizada', () => {
    const remaining = OFFICIAL_RENDERED_ENTITIES.filter((entity) => REMOVED.has(entity.publicIdentifier));
    expect(remaining).toEqual([]);
  });

  it('não sobra nenhum sanitário no inventário oficial', () => {
    const restrooms = OFFICIAL_RENDERED_ENTITIES.filter((entity) => (
      entity.classification === 'RESTROOM' || entity.classification === 'CHEMICAL_RESTROOM'
    ));
    expect(restrooms).toEqual([]);
  });

  it('preserva integralmente a infraestrutura permanente', () => {
    const identifiers = new Set(OFFICIAL_RENDERED_ENTITIES.map((entity) => entity.publicIdentifier));
    PERMANENT_SAMPLE.forEach((identifier) => expect(identifiers.has(identifier)).toBe(true));
  });

  it('mantém ruas, quadras, lotes e pavilhões intocados', () => {
    const count = (predicate: (classification: string) => boolean) => (
      OFFICIAL_RENDERED_ENTITIES.filter((entity) => predicate(entity.classification)).length
    );
    expect(count((c) => c === 'ROAD')).toBe(29);
    expect(count((c) => c === 'PEDESTRIAN_PATH')).toBe(1);
    expect(count((c) => c === 'QUADRA')).toBe(21);
    expect(count((c) => c === 'SELLABLE_LOT')).toBe(262);
    expect(count((c) => c === 'PAVILION')).toBe(12);
    expect(count((c) => c === 'GATE')).toBe(11);
  });
});
