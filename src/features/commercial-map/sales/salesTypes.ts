import type { LotPricingStage } from '../utils/lotPricing2028';

export type SalesStage = LotPricingStage;

/** Métodos aceitos em novas vendas. */
export const SALES_PAYMENT_METHODS = ['PIX', 'BOLETO_AVISTA', 'BOLETO_PARCELADO'] as const;
export type SalesPaymentMethod = (typeof SALES_PAYMENT_METHODS)[number];

export const SALES_PAYMENT_METHOD_LABELS: Record<SalesPaymentMethod, string> = {
  PIX: 'PIX',
  BOLETO_AVISTA: 'Boleto à vista',
  BOLETO_PARCELADO: 'Boleto parcelado',
};

/** Rótulos para leitura de vendas antigas (inclui métodos não mais oferecidos). */
const LEGACY_METHOD_LABELS: Record<string, string> = {
  ...SALES_PAYMENT_METHOD_LABELS,
  BOLETO: 'Boleto',
  TRANSFERENCIA: 'Transferência',
  CARTAO: 'Cartão',
  OUTRO: 'Outro',
};

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return '—';
  return LEGACY_METHOD_LABELS[method] ?? method;
}

export const SALES_STAGE_LABELS: Record<SalesStage, string> = {
  RENOVACAO: 'Renovação',
  SEGUNDA_ETAPA: '2ª Etapa',
};

export const MAX_INSTALLMENTS = 36;

/** Identificação mínima guardada ao clicar num espaço. O preço vem sempre do servidor. */
export interface SalesSelectionEntry {
  lotId: string;
  publicIdentifier: string;
  displayName: string;
  /** Contexto de origem: pavilhão (módulo interno) ou quadra externa. */
  context: string | null;
}

export interface SalesBuyerDraft {
  buyerName: string;
  documentNumber: string;
  phone: string;
  email: string;
  notes: string;
}

export interface SalesFeesDraft {
  adminCents: number;
  ppciCents: number;
  cleaningCents: number;
}

export interface SalesInstallmentDraft {
  dueDate: string;
  amountCents: number;
}

export interface SalesPaymentDraft {
  paymentMethod: SalesPaymentMethod;
  /** Quantidade digitada (aplicada só ao clicar em "Aplicar parcelas"). */
  countInput: string;
  installments: SalesInstallmentDraft[];
  /** true quando algum valor foi editado à mão — não recalcular sozinho. */
  manualAmounts: boolean;
}

export interface SalesInstallment {
  number: number;
  dueDate: string;
  amount: number;
}

export interface SalesOrderPayload {
  idempotencyKey: string;
  stage: SalesStage;
  lotIds: string[];
  buyer: SalesBuyerDraft;
  exhibitorId: string | null;
  paymentMethod: SalesPaymentMethod;
  fees: SalesFeesDraft;
  installments: SalesInstallment[];
  expectedTotal: number;
}

export function feesTotalCents(fees: SalesFeesDraft): number {
  return fees.adminCents + fees.ppciCents + fees.cleaningCents;
}
