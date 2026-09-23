import { supabase } from '@/integrations/supabase/client';
import type { LotPricing2028, LotPricingResolution } from '../utils/lotPricing2028';
import type { SalesOrderPayload } from './salesTypes';

const PRICING_COLUMNS = 'lot_id,public_identifier,pavilion,block,lot_num,corner_status,corner_confirmed,official_area_sqm,area_validation_status,renovacao_price_per_sqm,renovacao_total,renovacao_rule_label,segunda_price_per_sqm,segunda_total,segunda_rule_label,resolution_status';

const numeric = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

type PricingRow = Record<string, unknown>;

function mapRow(row: PricingRow): LotPricing2028 {
  return {
    lotId: String(row.lot_id),
    publicIdentifier: (row.public_identifier as string) ?? null,
    pavilion: (row.pavilion as string) ?? null,
    block: (row.block as string) ?? null,
    lotNumber: numeric(row.lot_num),
    cornerConfirmed: Boolean(row.corner_confirmed),
    cornerStatus: (row.corner_status as string) ?? null,
    officialAreaSqm: numeric(row.official_area_sqm),
    areaValidationStatus: (row.area_validation_status as string) ?? null,
    renovacaoPricePerSqm: numeric(row.renovacao_price_per_sqm),
    renovacaoTotal: numeric(row.renovacao_total),
    renovacaoRuleLabel: (row.renovacao_rule_label as string) ?? null,
    segundaPricePerSqm: numeric(row.segunda_price_per_sqm),
    segundaTotal: numeric(row.segunda_total),
    segundaRuleLabel: (row.segunda_rule_label as string) ?? null,
    resolutionStatus: ((row.resolution_status as string) ?? 'SEM_REGRA') as LotPricingResolution,
  };
}

/** Leitura em lote dos valores oficiais das duas etapas para o carrinho. */
export async function fetchSalesPricing(lotIds: string[]): Promise<LotPricing2028[]> {
  if (lotIds.length === 0) return [];
  const { data, error } = await supabase
    .from('commercial_lot_pricing_2028')
    .select(PRICING_COLUMNS)
    .in('lot_id', lotIds);
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as PricingRow));
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ERROR_MESSAGES: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/MAP_PERMISSION_DENIED/, () => 'Você não tem permissão para registrar vendas neste mapa.'],
  [/LOT_NOT_SELLABLE:(.+)/, (match) => `O espaço ${match[1]} não está mais disponível para venda.`],
  [/LOT_WITHOUT_OFFICIAL_PRICE:(.+)/, (match) => `O espaço ${match[1]} ainda não tem valor oficial definido.`],
  [/LOT_UNAVAILABLE_OR_MISSING/, () => 'Um dos espaços selecionados deixou de existir ou foi arquivado. Nenhuma venda foi registrada.'],
  [/TOTAL_MISMATCH/, () => 'Os valores mudaram desde a seleção. Confira o resumo e tente novamente.'],
  [/INSTALLMENTS_MISMATCH/, () => 'A soma das parcelas não fecha com o valor total.'],
  [/LOT_PROJECT_MISMATCH/, () => 'Os espaços selecionados pertencem a projetos diferentes.'],
  [/BUYER_REQUIRED/, () => 'Informe o nome do expositor.'],
  [/AUTH_REQUIRED/, () => 'Sessão expirada. Entre novamente para concluir a venda.'],
];

const KIND_FALLBACK: Record<SalesErrorKind, string> = {
  BUSINESS: 'Não foi possível concluir a venda. Nenhum espaço foi alterado.',
  AUTH: 'Sessão expirada ou sem permissão para registrar vendas. Entre novamente e tente de novo.',
  SCHEMA: 'Erro interno ao gravar a venda. Nenhum espaço foi alterado. Avise a equipe técnica com o código da falha.',
  NETWORK: 'A conexão falhou antes da resposta do servidor. Não é possível confirmar se a venda foi registrada — tente novamente sem alterar a seleção.',
  UNKNOWN: 'Não foi possível concluir a venda. Nenhum espaço foi alterado.',
};

export function describeSalesError(message: string, kind: SalesErrorKind = 'UNKNOWN'): string {
  for (const [pattern, format] of ERROR_MESSAGES) {
    const match = message.match(pattern);
    if (match) return format(match);
  }
  return KIND_FALLBACK[kind];
}

type PostgrestLikeError = {
  message?: string;
  code?: string | null;
  details?: unknown;
  hint?: unknown;
  status?: number | null;
};

function buildSalesError(raw: PostgrestLikeError, payload: SalesOrderPayload): SalesOrderError {
  const message = raw.message ?? 'Erro desconhecido';
  const code = raw.code ?? null;
  const kind = classifySalesError(message, code);
  const diagnostics = {
    operation: 'register_commercial_sale_order' as const,
    kind,
    correlationId: payload.idempotencyKey,
    code,
    details: sanitizeDiagnosticText(raw.details),
    hint: sanitizeDiagnosticText(raw.hint),
    rawMessage: sanitizeDiagnosticText(message),
    httpStatus: typeof raw.status === 'number' ? raw.status : null,
    stage: payload.stage,
    lotCount: payload.lotIds.length,
  };
  logSalesFailure(diagnostics);
  return new SalesOrderError(describeSalesError(message, kind), diagnostics);
}

/** Uma única transação no servidor: ou vende todos os espaços, ou nenhum. */
export async function registerSaleOrder(payload: SalesOrderPayload): Promise<string> {
  const { data, error } = await supabase.rpc('register_commercial_sale_order', {
    p_idempotency_key: payload.idempotencyKey,
    p_stage: payload.stage,
    p_lot_ids: payload.lotIds,
    p_buyer_name: payload.buyer.buyerName,
    p_document_number: payload.buyer.documentNumber,
    p_phone: payload.buyer.phone,
    p_email: payload.buyer.email,
    p_payment_type: payload.payment.paymentType,
    p_installment_count: payload.payment.installmentCount,
    p_payment_method: payload.payment.paymentMethod,
    p_first_due_date: payload.payment.firstDueDate || null,
    p_installments: payload.installments.map((item) => ({
      number: item.number,
      due_date: item.dueDate,
      amount: item.amount,
    })),
    p_expected_total: payload.expectedTotal,
    p_notes: payload.buyer.notes,
  });
  if (error) throw new Error(describeSalesError(error.message));
  return data as string;
}
