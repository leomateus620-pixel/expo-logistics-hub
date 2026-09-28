import { supabase } from '@/integrations/supabase/client';
import type { LotPricing2028, LotPricingResolution } from '../utils/lotPricing2028';
import type { SalesOrderPayload } from './salesTypes';
import {
  SalesOrderError,
  classifySalesError,
  logSalesFailure,
  sanitizeDiagnosticText,
  type SalesErrorKind,
} from './salesErrors';

const PRICING_COLUMNS = 'lot_id,public_identifier,pavilion,block,lot_num,corner_status,corner_confirmed,official_area_sqm,area_validation_status,renovacao_price_per_sqm,renovacao_total,renovacao_rule_label,segunda_price_per_sqm,segunda_total,segunda_rule_label,resolution_status,renovacao_default_total,segunda_default_total,renovacao_is_manual,segunda_is_manual';

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
    renovacaoDefaultTotal: numeric(row.renovacao_default_total as never),
    segundaDefaultTotal: numeric(row.segunda_default_total as never),
    renovacaoIsManual: Boolean(row.renovacao_is_manual),
    segundaIsManual: Boolean(row.segunda_is_manual),
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
  [/INSTALLMENT_COUNT_INVALID/, () => 'A quantidade de parcelas não combina com a forma de pagamento.'],
  [/INVALID_FEE/, () => 'As taxas não podem ser negativas.'],
  [/INVALID_PAYMENT_METHOD/, () => 'Escolha PIX, Boleto à vista ou Boleto parcelado.'],
  [/INSTALLMENT_(AMOUNT|DATE)_INVALID/, () => 'Confira valores e datas das parcelas.'],
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('register_commercial_sale_order', {
    p_idempotency_key: payload.idempotencyKey,
    p_stage: payload.stage,
    p_lot_ids: payload.lotIds,
    p_buyer_name: payload.buyer.buyerName,
    p_document_number: payload.buyer.documentNumber,
    p_phone: payload.buyer.phone,
    p_email: payload.buyer.email,
    p_payment_type: payload.paymentMethod === 'BOLETO_PARCELADO' ? 'INSTALLMENTS' : 'CASH',
    p_installment_count: payload.installments.length,
    p_payment_method: payload.paymentMethod,
    p_first_due_date: payload.installments[0]?.dueDate || null,
    p_installments: payload.installments.map((item) => ({
      number: item.number,
      due_date: item.dueDate,
      amount: item.amount,
    })),
    p_expected_total: payload.expectedTotal,
    p_notes: payload.buyer.notes,
    p_exhibitor_id: payload.exhibitorId,
    p_fee_admin: payload.fees.adminCents / 100,
    p_fee_ppci: payload.fees.ppciCents / 100,
    p_fee_cleaning_license: payload.fees.cleaningCents / 100,
  });
  if (error) throw buildSalesError(error as PostgrestLikeError, payload);
  // Retorno nulo/inválido nunca é tratado como sucesso.
  if (typeof data !== 'string' || !UUID_PATTERN.test(data)) {
    throw buildSalesError({ message: 'INVALID_ORDER_ID_RETURNED', code: null }, payload);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Venda em aberto: confirmação de assinatura e cancelamento
// ---------------------------------------------------------------------------

export interface OpenSaleItem {
  itemId: string;
  orderId: string;
  lotId: string;
  publicIdentifier: string;
  itemTotal: number | null;
  pricingStage: string | null;
}

export interface OpenSaleOrder {
  orderId: string;
  buyerName: string;
  stage: string | null;
  createdAt: string | null;
  negotiatedTotal: number | null;
  items: OpenSaleItem[];
}

/** Itens ainda aguardando assinatura do pedido que envolve o lote. */
export async function fetchLotOpenSaleOrder(lotId: string): Promise<OpenSaleOrder | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('lot_sale_order_items')
    .select('id,order_id,lot_id,public_identifier,item_total,pricing_stage,lot_sale_orders!inner(id,buyer_name,stage,created_at,negotiated_total,status)')
    .eq('lot_id', lotId)
    .eq('contract_state', 'PENDING_SIGNATURE')
    .eq('lot_sale_orders.status', 'CONFIRMED')
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  const order = row.lot_sale_orders;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: siblings, error: siblingsError } = await (supabase as any)
    .from('lot_sale_order_items')
    .select('id,order_id,lot_id,public_identifier,item_total,pricing_stage')
    .eq('order_id', order.id)
    .eq('contract_state', 'PENDING_SIGNATURE')
    .order('public_identifier');
  if (siblingsError) throw siblingsError;
  return {
    orderId: order.id,
    buyerName: order.buyer_name,
    stage: order.stage,
    createdAt: order.created_at,
    negotiatedTotal: order.negotiated_total === null || order.negotiated_total === undefined ? null : Number(order.negotiated_total),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (siblings ?? []).map((item: any) => ({
      itemId: item.id,
      orderId: item.order_id,
      lotId: item.lot_id,
      publicIdentifier: item.public_identifier,
      itemTotal: item.item_total === null || item.item_total === undefined ? null : Number(item.item_total),
      pricingStage: item.pricing_stage,
    })),
  };
}

const CONTRACT_ERROR_MESSAGES: Array<[RegExp, string]> = [
  [/MAP_PERMISSION_DENIED/, 'Você não tem permissão para confirmar ou cancelar vendas neste mapa.'],
  [/ORDER_NOT_FOUND/, 'O pedido não foi encontrado. Atualize o mapa e tente novamente.'],
  [/ORDER_NOT_ACTIVE/, 'Este pedido não está mais ativo. Atualize o mapa para ver a situação atual.'],
  [/ITEM_NOT_PENDING:(.+)/, 'O item $1 não está mais aguardando assinatura. Atualize o mapa.'],
  [/LOT_NOT_SALE_OPEN:(.+)/, 'O espaço $1 não está mais com venda em aberto. Atualize o mapa.'],
  [/ITEM_NOT_IN_ORDER/, 'Um dos itens não pertence a este pedido.'],
  [/AUTH_REQUIRED/, 'Sessão expirada. Entre novamente para continuar.'],
];

function describeContractError(message: string): string {
  for (const [pattern, text] of CONTRACT_ERROR_MESSAGES) {
    const match = message.match(pattern);
    if (match) return text.replace('$1', match[1] ?? '');
  }
  return 'Não foi possível concluir a operação. Nenhum espaço foi alterado — atualize o mapa e tente novamente.';
}

/** Confirma a assinatura do contrato de um ou vários itens do mesmo pedido. */
export async function confirmSaleOrderItems(orderId: string, itemIds: string[]): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)('confirm_sale_order_items', { p_order_id: orderId, p_item_ids: itemIds });
  if (error) throw new Error(describeContractError(error.message ?? ''));
}

/** Cancela itens ainda em aberto; cada lote volta a Disponível. */
export async function cancelSaleOrderItems(orderId: string, itemIds: string[], reason?: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)('cancel_sale_order_items', { p_order_id: orderId, p_item_ids: itemIds, p_reason: reason ?? null });
  if (error) throw new Error(describeContractError(error.message ?? ''));
}
