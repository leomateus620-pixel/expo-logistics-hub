import { describe, expect, it } from 'vitest';
import { normalizeLotSales, normalizeOfficialLotPricing2028, type OfficialLotPricing2028Row } from '@/features/commercial-map/utils/commercialLotFinancialData';
import { resolveDashboardLotValue } from '@/features/commercial-map/dashboard/commercialDashboardAnalytics';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';

const pricing: OfficialLotPricing2028Row = {
  lot_id: 'lot', entity_id: 'entity', renovacao_total: '1000.01', segunda_total: '2000.02',
  renovacao_is_manual: true, segunda_is_manual: false, resolution_status: 'OK',
};

describe('financial fields of the shared commercial map read', () => {
  it('keeps persisted sales distinct from asking prices and preserves zero and history identities', () => {
    const rows = [
      { id: 'open', lot_id: 'lot', status: 'OPEN', negotiated_value: '500.25' },
      { id: 'zero', lot_id: 'lot', status: 'CONFIRMED', negotiated_value: 0 },
      { id: 'old', lot_id: 'lot', status: 'REVERTED', negotiated_value: '600' },
      { id: 'other', lot_id: 'another-lot', status: 'OPEN', negotiated_value: '9000' },
    ];
    const original = JSON.stringify(rows);
    expect(normalizeLotSales('lot', rows)).toEqual([
      { id: 'open', lotId: 'lot', status: 'OPEN', negotiatedValue: 500.25 },
      { id: 'zero', lotId: 'lot', status: 'CONFIRMED', negotiatedValue: 0 },
      { id: 'old', lotId: 'lot', status: 'REVERTED', negotiatedValue: 600 },
    ]);
    expect(JSON.stringify(rows)).toBe(original);
  });

  it('does not turn missing, blank, negative or invalid persisted amounts into zero', () => {
    const amounts = [null, '', ' ', '-1', 'bad', Infinity, NaN];
    expect(normalizeLotSales('lot', amounts.map((value, i) => ({ id: `sale-${i}`, lot_id: 'lot', status: 'OPEN', negotiated_value: value })))
      .map((sale) => sale.negotiatedValue)).toEqual(amounts.map(() => null));
    expect(normalizeLotSales('lot', null)).toEqual([]);
  });

  it('deduplicates identical sales without selecting a conflicting version of the same sale', () => {
    const sale = { id: 'sale', lot_id: 'lot', status: 'OPEN', negotiated_value: '500' };
    expect(normalizeLotSales('lot', [sale, { ...sale }])).toHaveLength(1);
    expect(normalizeLotSales('lot', [sale, { ...sale, negotiated_value: '600' }])).toEqual([
      { id: 'sale', lotId: 'lot', status: 'OPEN', negotiatedValue: null },
    ]);
    expect(normalizeLotSales('lot', [sale, { ...sale, status: 'CONFIRMED' }])).toEqual([
      { id: 'sale', lotId: 'lot', status: 'OPEN', negotiatedValue: null },
      { id: 'sale', lotId: 'lot', status: 'CONFIRMED', negotiatedValue: null },
    ]);
  });

  it('retains an ambiguous sale beside another active sale instead of making the clean sale uniquely priced', () => {
    const rows = [
      { id: 'clean', lot_id: 'lot', status: 'OPEN', negotiated_value: '500' },
      { id: 'conflicting', lot_id: 'lot', status: 'OPEN', negotiated_value: '600' },
      { id: 'conflicting', lot_id: 'lot', status: 'OPEN', negotiated_value: '700' },
      { id: 'conflicting', lot_id: 'lot', status: 'CONFIRMED', negotiated_value: '700' },
    ];
    const original = JSON.stringify(rows);
    const sales = normalizeLotSales('lot', rows);
    expect(sales).toEqual([
      { id: 'clean', lotId: 'lot', status: 'OPEN', negotiatedValue: 500 },
      { id: 'conflicting', lotId: 'lot', status: 'OPEN', negotiatedValue: null },
      { id: 'conflicting', lotId: 'lot', status: 'CONFIRMED', negotiatedValue: null },
    ]);
    const source = { ...OFFICIAL_REFERENCE_DATA.lots[0], id: 'lot', sales };
    expect(resolveDashboardLotValue({ ...source, status: 'SALE_OPEN' })).toBeNull();
    expect(resolveDashboardLotValue({ ...source, status: 'SOLD' })).toBeNull();
    expect(JSON.stringify(rows)).toBe(original);
  });

  it('takes official stage totals and manual flags without deriving them from geometry or price per square meter', () => {
    expect(normalizeOfficialLotPricing2028('lot', 'entity', pricing)).toEqual({
      lotId: 'lot', entityId: 'entity', renovacaoTotal: 1000.01, segundaTotal: 2000.02,
      renovacaoIsManual: true, segundaIsManual: false, resolutionStatus: 'OK',
    });
    expect(normalizeOfficialLotPricing2028('lot', 'entity', { ...pricing, renovacao_total: 0, segunda_total: null, resolution_status: 'SEM_REGRA' }))
      .toMatchObject({ renovacaoTotal: 0, segundaTotal: null, resolutionStatus: 'SEM_REGRA' });
  });

  it('keeps a valid stage when another is ambiguous and accepts equivalent duplicate view rows', () => {
    const tied = { ...pricing, renovacao_total: null, resolution_status: 'REGRA_AMBIGUA' };
    expect(normalizeOfficialLotPricing2028('lot', 'entity', [tied, { ...tied }]))
      .toMatchObject({ renovacaoTotal: null, segundaTotal: 2000.02, resolutionStatus: 'REGRA_AMBIGUA' });
    expect(normalizeOfficialLotPricing2028('lot', 'entity', [pricing, { ...pricing, segunda_total: '9999' }])).toBeNull();
  });

  it('rejects prices from another lot, successor, entity or unrecognized resolution', () => {
    expect(normalizeOfficialLotPricing2028('lot', 'entity', { ...pricing, lot_id: 'successor' })).toBeNull();
    expect(normalizeOfficialLotPricing2028('lot', 'entity', { ...pricing, entity_id: 'another-entity' })).toBeNull();
    expect(normalizeOfficialLotPricing2028('lot', 'entity', { ...pricing, resolution_status: 'UNKNOWN' })).toBeNull();
    expect(normalizeOfficialLotPricing2028('lot', 'entity', null)).toBeNull();
  });
});
