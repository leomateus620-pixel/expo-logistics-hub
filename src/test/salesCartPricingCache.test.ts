import { describe, expect, it } from 'vitest';
import { summarizeCart } from '@/features/commercial-map/sales/salesPricing';
import type { LotPricing2028 } from '@/features/commercial-map/utils/lotPricing2028';

const entry = (lotId: string) => ({ lotId, publicIdentifier: lotId, displayName: lotId, context: null, title: lotId, location: null, area: null });
const price = (lotId: string): LotPricing2028 => ({
  lotId, publicIdentifier: lotId, pavilion: null, block: 'E', lotNumber: 1, cornerConfirmed: false, cornerStatus: null,
  officialAreaSqm: 100, areaValidationStatus: null, renovacaoPricePerSqm: 10, renovacaoTotal: 1000, renovacaoRuleLabel: null,
  segundaPricePerSqm: 12, segundaTotal: 1200, segundaRuleLabel: null, resolutionStatus: 'OK',
  renovacaoDefaultTotal: 1000, segundaDefaultTotal: 1200, renovacaoIsManual: false, segundaIsManual: false,
});

describe('carrinho com índice local de preços', () => {
  it('soma lotes já em cache sem esperar o servidor', () => {
    const s = summarizeCart([entry('a'), entry('b')], new Map([['a', price('a')], ['b', price('b')]]), 'RENOVACAO');
    expect(s.valueTotal).toBe(2000);
    expect(s.ready).toBe(true);
  });
  it('lote carregando não conta como sem preço', () => {
    const s = summarizeCart([entry('a'), entry('b')], new Map([['a', price('a')]]), 'RENOVACAO', new Set(['b']));
    expect(s.blockingCount).toBe(0);
    expect(s.pendingCount).toBe(1);
    expect(s.ready).toBe(false);
    expect(s.valueTotal).toBe(1000);
  });
  it('troca de etapa recalcula localmente', () => {
    const s = summarizeCart([entry('a')], new Map([['a', price('a')]]), 'SEGUNDA_ETAPA');
    expect(s.valueTotal).toBe(1200);
  });
});
