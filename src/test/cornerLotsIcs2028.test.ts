import { describe, expect, it } from 'vitest';
import {
  computeLotTotal,
  isPricingAvailable,
  stageTotal,
  type LotPricing2028,
} from '@/features/commercial-map/utils/lotPricing2028';

/**
 * Lotes de esquina oficiais (Indústria, Comércio e Serviços — Quadras D e E).
 * Regra oficial 2028 de esquina: Renovação R$ 55,00/m², 2ª Etapa R$ 61,00/m².
 */
const CORNER_RENOVACAO_PRICE = 55;
const CORNER_SEGUNDA_PRICE = 61;

const CORNER_LOTS = [
  { id: 'Q-E-13', block: 'E', area: 165.88, renovacao: 9123.4, segunda: 10118.68 },
  { id: 'Q-E-11', block: 'E', area: 179.49, renovacao: 9871.95, segunda: 10948.89 },
  { id: 'Q-D-12', block: 'D', area: 248.99, renovacao: 13694.45, segunda: 15188.39 },
  { id: 'Q-D-11', block: 'D', area: 263.74, renovacao: 14505.7, segunda: 16088.14 },
] as const;

function pricingFor(lot: (typeof CORNER_LOTS)[number]): LotPricing2028 {
  return {
    lotId: lot.id,
    publicIdentifier: lot.id,
    pavilion: null,
    block: lot.block,
    lotNumber: Number(lot.id.split('-')[2]),
    cornerConfirmed: true,
    cornerStatus: 'CORNER_CONFIRMED',
    officialAreaSqm: lot.area,
    areaValidationStatus: 'VALIDATED',
    renovacaoPricePerSqm: CORNER_RENOVACAO_PRICE,
    renovacaoTotal: computeLotTotal(lot.area, CORNER_RENOVACAO_PRICE),
    renovacaoRuleLabel: `Indústria/Comércio/Serviços - Quadra ${lot.block} (esquina)`,
    segundaPricePerSqm: CORNER_SEGUNDA_PRICE,
    segundaTotal: computeLotTotal(lot.area, CORNER_SEGUNDA_PRICE),
    segundaRuleLabel: `Indústria/Comércio/Serviços - Quadra ${lot.block} (esquina)`,
    resolutionStatus: 'OK',
  };
}

describe('Lotes de esquina ICS 2028 — Q-E-13, Q-E-11, Q-D-12, Q-D-11', () => {
  it.each(CORNER_LOTS)('$id usa a regra de esquina nas duas etapas', (lot) => {
    const pricing = pricingFor(lot);
    expect(pricing.cornerConfirmed).toBe(true);
    expect(pricing.resolutionStatus).toBe('OK');
    expect(isPricingAvailable(pricing)).toBe(true);
    expect(pricing.renovacaoPricePerSqm).toBe(CORNER_RENOVACAO_PRICE);
    expect(pricing.segundaPricePerSqm).toBe(CORNER_SEGUNDA_PRICE);
    expect(stageTotal(pricing, 'RENOVACAO')).toBe(lot.renovacao);
    expect(stageTotal(pricing, 'SEGUNDA_ETAPA')).toBe(lot.segunda);
  });

  it('mantém as metragens oficiais inalteradas', () => {
    expect(CORNER_LOTS.map((lot) => lot.area)).toEqual([165.88, 179.49, 248.99, 263.74]);
  });

  it('lote vizinho normal continua na regra de quadra (42 / 46)', () => {
    expect(computeLotTotal(263.74, 42)).toBe(11077.08);
    expect(computeLotTotal(263.74, 46)).toBe(12132.04);
  });
});
