import type { LotPricingStage } from '../utils/lotPricing2028';

export type SalesStage = LotPricingStage;

export type SalesPaymentType = 'CASH' | 'INSTALLMENTS';

export const SALES_PAYMENT_METHODS = ['PIX', 'BOLETO', 'TRANSFERENCIA', 'CARTAO', 'OUTRO'] as const;
export type SalesPaymentMethod = (typeof SALES_PAYMENT_METHODS)[number];

export const SALES_PAYMENT_METHOD_LABELS: Record<SalesPaymentMethod, string> = {
  PIX: 'PIX',
  BOLETO: 'Boleto',
  TRANSFERENCIA: 'Transferência',
  CARTAO: 'Cartão',
  OUTRO: 'Outro',
};

export const SALES_STAGE_LABELS: Record<SalesStage, string> = {
  RENOVACAO: 'Renovação',
  SEGUNDA_ETAPA: '2ª Etapa',
};

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

export interface SalesPaymentDraft {
  paymentType: SalesPaymentType;
  installmentCount: number;
  paymentMethod: SalesPaymentMethod;
  firstDueDate: string;
  dueDates: string[];
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
  payment: SalesPaymentDraft;
  installments: SalesInstallment[];
  expectedTotal: number;
}
