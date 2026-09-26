import type { LotPricing2028 } from '../utils/lotPricing2028';
import { stageTotal } from '../utils/lotPricing2028';
import type { SalesSelectionEntry, SalesStage } from './salesTypes';

export interface SalesCartLine {
  entry: SalesSelectionEntry;
  pricing: LotPricing2028 | null;
  areaSqm: number | null;
  pricePerSqm: number | null;
  total: number | null;
  /** Etapa sem preço oficial: impede somente o fechamento nesta etapa. */
  unpriced: boolean;
  pendingReason: string | null;
}

export interface SalesCartSummary {
  lines: SalesCartLine[];
  areaTotal: number;
  valueTotal: number;
  blockingCount: number;
  ready: boolean;
}

function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

export function buildCartLine(
  entry: SalesSelectionEntry,
  pricing: LotPricing2028 | null,
  stage: SalesStage,
): SalesCartLine {
  if (!pricing) {
    return {
      entry, pricing: null, areaSqm: null, pricePerSqm: null, total: null,
      unpriced: true, pendingReason: 'Sem correspondência na tabela oficial 2028',
    };
  }
  if (pricing.resolutionStatus === 'EXCLUIDO') {
    return {
      entry, pricing, areaSqm: pricing.officialAreaSqm, pricePerSqm: null, total: null,
      unpriced: true, pendingReason: 'Valor ainda não definido',
    };
  }
  const pricePerSqm = stage === 'RENOVACAO' ? pricing.renovacaoPricePerSqm : pricing.segundaPricePerSqm;
  const total = stageTotal(pricing, stage);
  if (pricePerSqm == null || total == null) {
    return {
      entry, pricing, areaSqm: pricing.officialAreaSqm, pricePerSqm: null, total: null,
      unpriced: true, pendingReason: pricing.resolutionStatus === 'REGRA_AMBIGUA' ? 'Pendente de conferência' : 'Valor ainda não definido',
    };
  }
  if (pricing.resolutionStatus !== 'OK' && pricing.resolutionStatus !== 'SEM_REGRA') {
    return {
      entry, pricing, areaSqm: pricing.officialAreaSqm, pricePerSqm, total: null,
      unpriced: true, pendingReason: 'Pendente de conferência',
    };
  }
  return {
    entry, pricing, areaSqm: pricing.officialAreaSqm, pricePerSqm, total,
    unpriced: false, pendingReason: null,
  };
}

/**
 * Soma item a item — nunca área total × um único preço/m², porque os lotes
 * selecionados podem cair em regras diferentes (esquina, faixa, pavilhão).
 */
export function summarizeCart(
  entries: SalesSelectionEntry[],
  pricingByLot: Map<string, LotPricing2028>,
  stage: SalesStage,
): SalesCartSummary {
  const lines = entries.map((entry) => buildCartLine(entry, pricingByLot.get(entry.lotId) ?? null, stage));
  const areaCents = lines.reduce((sum, line) => sum + (line.areaSqm == null ? 0 : toCents(line.areaSqm)), 0);
  const valueCents = lines.reduce((sum, line) => sum + (line.total == null ? 0 : toCents(line.total)), 0);
  const blockingCount = lines.filter((line) => line.unpriced).length;
  return {
    lines,
    areaTotal: areaCents / 100,
    valueTotal: valueCents / 100,
    blockingCount,
    ready: lines.length > 0 && blockingCount === 0,
  };
}
