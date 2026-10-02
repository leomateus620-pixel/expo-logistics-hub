import { supabase } from '@/integrations/supabase/client';
import { normalizeTradeName } from '../utils/buyerDisplayName';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface SaleIdentity {
  saleId: string;
  status: 'OPEN' | 'CONFIRMED';
  buyerName: string;
  tradeName: string | null;
  documentNumber: string;
  phone: string;
  email: string;
  orderId: string | null;
  exhibitorId: string | null;
  affectedSpaces: string[];
}

export interface SaleIdentityDraft {
  buyerName: string;
  tradeName: string;
  documentNumber: string;
  phone: string;
  email: string;
}

/** Lê do servidor a venda vigente (aberta ou confirmada) do lote e os espaços do mesmo pedido. */
export async function fetchSaleIdentity(lotId: string): Promise<SaleIdentity | null> {
  const { data: sales, error } = await db.from('lot_sales')
    .select('id,status,buyer_name,buyer_trade_name,document_number,created_at')
    .eq('lot_id', lotId).in('status', ['OPEN', 'CONFIRMED'])
    .order('created_at', { ascending: false }).limit(1);
  if (error) throw error;
  const sale = sales?.[0];
  if (!sale) return null;
  const { data: item, error: itemError } = await db.from('lot_sale_order_items')
    .select('order_id').eq('sale_id', sale.id).limit(1).maybeSingle();
  if (itemError) throw itemError;
  let order: Record<string, string | null> | null = null;
  let affected: string[] = [];
  if (item?.order_id) {
    const [orderResult, itemsResult] = await Promise.all([
      db.from('lot_sale_orders').select('id,phone,email,exhibitor_id').eq('id', item.order_id).maybeSingle(),
      db.from('lot_sale_order_items').select('public_identifier,lot_sales!inner(status),commercial_lots(display_name)')
        .eq('order_id', item.order_id).in('lot_sales.status', ['OPEN', 'CONFIRMED']),
    ]);
    if (orderResult.error) throw orderResult.error;
    if (itemsResult.error) throw itemsResult.error;
    order = orderResult.data;
    affected = (itemsResult.data ?? []).map((row: { public_identifier: string; commercial_lots?: { display_name?: string } | null }) =>
      row.commercial_lots?.display_name || row.public_identifier);
  }
  return {
    saleId: sale.id,
    status: sale.status,
    buyerName: sale.buyer_name ?? '',
    tradeName: normalizeTradeName(sale.buyer_trade_name),
    documentNumber: sale.document_number ?? '',
    phone: order?.phone ?? '',
    email: order?.email ?? '',
    orderId: order?.id ?? null,
    exhibitorId: order?.exhibitor_id ?? null,
    affectedSpaces: affected,
  };
}

const MESSAGES: Array<[RegExp, string]> = [
  [/MAP_PERMISSION_DENIED/, 'Você não tem permissão para editar vendas neste mapa.'],
  [/SALE_EDIT_CONFLICT/, 'A venda foi alterada por outra pessoa (confirmação, cancelamento ou edição). Reabra a ficha e tente novamente.'],
  [/SALE_NOT_EDITABLE/, 'Esta venda foi cancelada ou revertida e não pode ser editada.'],
  [/SALE_NOT_FOUND/, 'Venda não encontrada.'],
  [/BUYER_REQUIRED/, 'Informe o nome / razão social.'],
  [/AUTH_REQUIRED/, 'Sessão expirada. Entre novamente.'],
];

export class SaleIdentityError extends Error {
  constructor(message: string, readonly uncertain: boolean) { super(message); }
}

export async function updateSaleIdentity(params: {
  identity: SaleIdentity; draft: SaleIdentityDraft; updateExhibitor: boolean; requestId: string;
}) {
  const { data, error } = await db.rpc('update_sale_exhibitor_identity', {
    p_lot_sale_id: params.identity.saleId,
    p_expected_status: params.identity.status,
    p_expected_buyer_name: params.identity.buyerName,
    p_buyer_name: params.draft.buyerName.trim(),
    p_buyer_trade_name: normalizeTradeName(params.draft.tradeName),
    p_document: params.draft.documentNumber.trim(),
    p_phone: params.draft.phone.trim(),
    p_email: params.draft.email.trim(),
    p_update_exhibitor: params.updateExhibitor,
    p_request_id: params.requestId,
  });
  if (error) {
    const raw = String(error.message ?? '');
    const known = MESSAGES.find(([pattern]) => pattern.test(raw));
    if (known) throw new SaleIdentityError(known[1], false);
    const uncertain = !error.code || /fetch|network|timeout/i.test(raw);
    throw new SaleIdentityError(uncertain
      ? 'A conexão falhou antes da resposta. Tente salvar novamente — a mesma alteração não será duplicada.'
      : 'Não foi possível salvar. Nenhum dado foi alterado.', uncertain);
  }
  if (!data || !Array.isArray(data.sale_ids)) throw new SaleIdentityError('Resposta do servidor não confirmada. Tente salvar novamente.', true);
  return data as { sale_ids: string[]; lot_ids: string[]; exhibitor_updated: boolean };
}
