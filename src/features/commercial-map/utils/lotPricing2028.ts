/**
 * Motor oficial de precificação 2028 — utilidades puras.
 *
 * Regra fundamental: TOTAL = ÁREA OFICIAL × PREÇO/m².
 * A multiplicação é feita em centavos inteiros para eliminar erro de ponto
 * flutuante (5,00 × 50,00 deve ser exatamente 250,00).
 */

export type LotPricingStage = 'RENOVACAO' | 'SEGUNDA_ETAPA';

export type LotPricingResolution =
  | 'OK'
  | 'SEM_AREA'
  | 'SEM_REGRA'
  | 'REGRA_AMBIGUA'
  | 'EXCLUIDO';

export interface LotPricing2028 {
  lotId: string;
  publicIdentifier: string | null;
  pavilion: string | null;
  block: string | null;
  lotNumber: number | null;
  cornerConfirmed: boolean;
  cornerStatus: string | null;
  officialAreaSqm: number | null;
  areaValidationStatus: string | null;
  renovacaoPricePerSqm: number | null;
  renovacaoTotal: number | null;
  renovacaoRuleLabel: string | null;
  segundaPricePerSqm: number | null;
  segundaTotal: number | null;
  segundaRuleLabel: string | null;
  resolutionStatus: LotPricingResolution;
  /** Valor calculado pela regra oficial (referência quando há override). */
  renovacaoDefaultTotal?: number | null;
  segundaDefaultTotal?: number | null;
  renovacaoIsManual?: boolean;
  segundaIsManual?: boolean;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const AREA_FORMATTER = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Arredonda para centavos exatos, evitando 249,999999 / 250,000001. */
function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

/**
 * TOTAL = área × preço/m², com matemática decimal exata em centavos.
 * Retorna null quando a área ou o preço não são utilizáveis — nunca zero.
 */
export function computeLotTotal(
  officialAreaSqm: number | null | undefined,
  pricePerSqm: number | null | undefined,
): number | null {
  if (officialAreaSqm == null || pricePerSqm == null) return null;
  if (!Number.isFinite(officialAreaSqm) || !Number.isFinite(pricePerSqm)) return null;
  if (officialAreaSqm <= 0 || pricePerSqm < 0) return null;
  const areaCents = toCents(officialAreaSqm);
  const priceCents = toCents(pricePerSqm);
  return Math.round((areaCents * priceCents) / 100) / 100;
}

export function formatBrl(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return CURRENCY_FORMATTER.format(value);
}

export function formatPricePerSqm(value: number | null | undefined): string | null {
  const formatted = formatBrl(value);
  return formatted === null ? null : `${formatted} / m²`;
}

export function formatAreaSqmLabel(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${AREA_FORMATTER.format(value)} m²`;
}

/** Pavilhão 7 (bloco interno B10) permanece sem preço oficial definido. */
export const UNPRICED_PAVILION_LABEL = 'Ainda não definido';

export function isPricingExcluded(pricing: Pick<LotPricing2028, 'resolutionStatus'> | null | undefined): boolean {
  return pricing?.resolutionStatus === 'EXCLUIDO';
}

export function isPricingAvailable(pricing: LotPricing2028 | null | undefined): boolean {
  return Boolean(
    pricing
    && pricing.resolutionStatus === 'OK'
    && pricing.renovacaoTotal != null
    && pricing.segundaTotal != null,
  );
}

export function stageTotal(pricing: LotPricing2028, stage: LotPricingStage): number | null {
  return stage === 'RENOVACAO' ? pricing.renovacaoTotal : pricing.segundaTotal;
}

/** Converte texto monetário pt-BR ("5.850,00", "R$ 0,00") em número; null se inválido. */
export function parseBrlInput(raw: string): number | null {
  const cleaned = raw.replace(/[R$\s\u00a0]/g, '').replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 && value <= 100_000_000 ? value : null;
}

/** Máscara monetária: dígitos digitados viram centavos ("585000" → "5.850,00"). */
export function maskBrlInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 11);
  if (!digits) return '';
  const cents = Number(digits);
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

/** Preço/m² derivado de um total manual e da área oficial válida. */
export function derivePricePerSqm(total: number | null, areaSqm: number | null | undefined): number | null {
  if (total == null || areaSqm == null || !Number.isFinite(areaSqm) || areaSqm <= 0) return null;
  return Math.round((total / areaSqm + Number.EPSILON) * 100) / 100;
}
