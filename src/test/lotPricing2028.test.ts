import { describe, expect, it } from 'vitest';
import {
  UNPRICED_PAVILION_LABEL,
  computeLotTotal,
  formatAreaSqmLabel,
  formatBrl,
  formatPricePerSqm,
  isPricingAvailable,
  isPricingExcluded,
  stageTotal,
  type LotPricing2028,
} from '@/features/commercial-map/utils/lotPricing2028';

const baseLot: LotPricing2028 = {
  lotId: 'lot-1',
  publicIdentifier: 'D-01',
  pavilion: null,
  block: 'D',
  lotNumber: 1,
  cornerConfirmed: true,
  cornerStatus: 'CORNER_CONFIRMED',
  officialAreaSqm: 208.2,
  areaValidationStatus: 'VALIDATED',
  renovacaoPricePerSqm: 55,
  renovacaoTotal: 11451,
  renovacaoRuleLabel: 'Indústria/Comércio/Serviços - Quadra D (esquina)',
  segundaPricePerSqm: 61,
  segundaTotal: 12700.2,
  segundaRuleLabel: 'Indústria/Comércio/Serviços - Quadra D (esquina)',
  resolutionStatus: 'OK',
};

describe('computeLotTotal — matemática decimal exata', () => {
  it('multiplica área por preço sem erro de ponto flutuante', () => {
    expect(computeLotTotal(5, 50)).toBe(250);
    expect(computeLotTotal(3, 776)).toBe(2328);
    expect(computeLotTotal(3.5, 665)).toBe(2327.5);
    expect(computeLotTotal(14.7, 776)).toBe(11407.2);
    expect(computeLotTotal(24, 854)).toBe(20496);
    expect(computeLotTotal(208.2, 55)).toBe(11451);
    expect(computeLotTotal(207.38, 61)).toBe(12650.18);
    expect(computeLotTotal(575.85, 24.2)).toBe(13935.57);
    expect(computeLotTotal(467.13, 11)).toBe(5138.43);
    expect(computeLotTotal(190.98, 42)).toBe(8021.16);
  });

  it('nunca devolve zero ou valor inventado para dados ausentes', () => {
    expect(computeLotTotal(null, 50)).toBeNull();
    expect(computeLotTotal(5, null)).toBeNull();
    expect(computeLotTotal(0, 50)).toBeNull();
    expect(computeLotTotal(-1, 50)).toBeNull();
    expect(computeLotTotal(5, -1)).toBeNull();
    expect(computeLotTotal(Number.NaN, 50)).toBeNull();
  });

  it('não acumula resíduo em valores repetidos', () => {
    const total = computeLotTotal(3, 795);
    expect(total).toBe(2385);
    expect(String(total)).not.toContain('99999');
  });
});

describe('formatação pt-BR', () => {
  it('formata moeda e preço por m²', () => {
    expect(formatBrl(18900)).toBe('R$\u00a018.900,00');
    expect(formatPricePerSqm(42)).toBe('R$\u00a042,00 / m²');
    expect(formatBrl(null)).toBeNull();
  });

  it('formata área com duas casas', () => {
    expect(formatAreaSqmLabel(450)).toBe('450,00 m²');
    expect(formatAreaSqmLabel(3)).toBe('3,00 m²');
    expect(formatAreaSqmLabel(null)).toBeNull();
  });
});

describe('Pavilhão 7 e pendências', () => {
  it('lote excluído não recebe valor e exibe rótulo institucional', () => {
    const excluded: LotPricing2028 = {
      ...baseLot,
      lotId: 'lot-p7',
      publicIdentifier: 'B10-M001',
      pavilion: 'P7',
      block: null,
      officialAreaSqm: 2.5,
      renovacaoPricePerSqm: null,
      renovacaoTotal: null,
      renovacaoRuleLabel: null,
      segundaPricePerSqm: null,
      segundaTotal: null,
      segundaRuleLabel: null,
      resolutionStatus: 'EXCLUIDO',
    };
    expect(isPricingExcluded(excluded)).toBe(true);
    expect(isPricingAvailable(excluded)).toBe(false);
    expect(stageTotal(excluded, 'RENOVACAO')).toBeNull();
    expect(stageTotal(excluded, 'SEGUNDA_ETAPA')).toBeNull();
    expect(formatBrl(stageTotal(excluded, 'RENOVACAO')) ?? UNPRICED_PAVILION_LABEL).toBe('Ainda não definido');
  });

  it('regra ausente ou ambígua não vira preço', () => {
    expect(isPricingAvailable({ ...baseLot, resolutionStatus: 'SEM_REGRA', renovacaoTotal: null })).toBe(false);
    expect(isPricingAvailable({ ...baseLot, resolutionStatus: 'REGRA_AMBIGUA' })).toBe(false);
    expect(isPricingAvailable({ ...baseLot, resolutionStatus: 'SEM_AREA', officialAreaSqm: null })).toBe(false);
  });

  it('lote elegível mantém as duas etapas disponíveis', () => {
    expect(isPricingAvailable(baseLot)).toBe(true);
    expect(stageTotal(baseLot, 'RENOVACAO')).toBe(11451);
    expect(stageTotal(baseLot, 'SEGUNDA_ETAPA')).toBe(12700.2);
  });
});
