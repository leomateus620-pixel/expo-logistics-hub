import { supabase } from '@/integrations/supabase/client';
import { validateContractFile } from '../../utils/contracts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type SaleRecordKind = 'ORDER' | 'LEGACY';
export type SaleItemContractState = 'PENDING_SIGNATURE' | 'SIGNED' | 'CANCELLED' | 'LEGACY_UNVERIFIED';

export interface SaleOrderSummary {
  recordId: string;
  kind: SaleRecordKind;
  orderId: string | null;
  saleId: string | null;
  reference: string;
  createdAt: string;
  status: string;
  buyerName: string;
  buyerTradeName: string | null;
  displayName: string;
  negotiatedTotal: number | null;
  spacesSubtotal: number | null;
  feesTotal: number | null;
  paymentMethod: string | null;
  installmentCount: number | null;
  itemCount: number;
  activeCount: number;
  signedCount: number;
  pendingCount: number;
  cancelledCount: number;
  legacyCount: number;
  activeItemsTotal: number | null;
  lotIds: string[];
  /** null quando o usuário não pode consultar contratos. */
  documentCount: number | null;
  paidInstallments: number;
}

export interface SaleOrdersFilters {
  search: string;
  status: '' | 'PENDING' | 'PARTIAL' | 'SIGNED' | 'CANCELLED_PARTIAL' | 'LEGACY';
  hasDocument: '' | 'yes' | 'no';
  paymentMethod: string;
  from: string;
  to: string;
}

export const EMPTY_SALE_FILTERS: SaleOrdersFilters = { search: '', status: '', hasDocument: '', paymentMethod: '', from: '', to: '' };
export const SALE_ORDERS_PAGE_SIZE = 20;

export interface SaleOrdersPage {
  total: number;
  rows: SaleOrderSummary[];
  documentsAccessible: boolean;
}

const num = (value: unknown): number | null => (value === null || value === undefined || value === '' ? null : Number(value));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapSummaryRow(row: any, documentsAccessible: boolean): SaleOrderSummary {
  return {
    recordId: row.record_id,
    kind: row.kind,
    orderId: row.order_id ?? null,
    saleId: row.sale_id ?? null,
    reference: row.reference,
    createdAt: row.created_at,
    status: row.status,
    buyerName: row.buyer_name ?? '',
    buyerTradeName: row.buyer_trade_name ?? null,
    displayName: row.display_name || row.buyer_name || '—',
    negotiatedTotal: num(row.negotiated_total),
    spacesSubtotal: num(row.spaces_subtotal),
    feesTotal: num(row.fees_total),
    paymentMethod: row.payment_method ?? null,
    installmentCount: num(row.installment_count),
    itemCount: Number(row.item_count ?? 0),
    activeCount: Number(row.active_count ?? 0),
    signedCount: Number(row.signed_count ?? 0),
    pendingCount: Number(row.pending_count ?? 0),
    cancelledCount: Number(row.cancelled_count ?? 0),
    legacyCount: Number(row.legacy_count ?? 0),
    activeItemsTotal: num(row.active_items_total),
    lotIds: (row.lot_ids ?? []).filter(Boolean),
    documentCount: documentsAccessible ? Number(row.document_count ?? 0) : null,
    paidInstallments: Number(row.paid_installments ?? 0),
  };
}

export async function fetchSaleOrdersPage(projectId: string, filters: SaleOrdersFilters, page: number): Promise<SaleOrdersPage> {
  const { data, error } = await db.rpc('list_commercial_sale_orders', {
    p_project_id: projectId,
    p_search: filters.search.trim() || null,
    p_status: filters.status || null,
    p_has_document: filters.hasDocument === '' ? null : filters.hasDocument === 'yes',
    p_payment_method: filters.paymentMethod || null,
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_limit: SALE_ORDERS_PAGE_SIZE,
    p_offset: page * SALE_ORDERS_PAGE_SIZE,
  });
  if (error) throw error;
  const documentsAccessible = Boolean(data?.documentsAccessible);
  return {
    total: Number(data?.total ?? 0),
    rows: (data?.rows ?? []).map((row: unknown) => mapSummaryRow(row, documentsAccessible)),
    documentsAccessible,
  };
}

export interface SaleOrderItemDetail {
  itemId: string | null;
  lotId: string;
  entityId: string | null;
  publicIdentifier: string;
  lotNumber: string | null;
  displayName: string | null;
  areaSnapshot: number | null;
  itemTotal: number | null;
  pricingStage?: string | null;
  contractState: SaleItemContractState;
  signedAt?: string | null;
  cancelledAt?: string | null;
  lotStatus: string;
}

export interface SaleContractVersion {
  id: string; version: number; storagePath: string; originalName: string; mimeType: string;
  fileSize: number; uploadedAt: string; supersededAt: string | null;
}

export interface SaleContract {
  contractId: string;
  scope: 'LOT' | 'ORDER_ITEMS';
  contractNumber: string | null;
  activeVersion: number;
  createdAt: string;
  lotIds: string[];
  versions: SaleContractVersion[];
}

export interface SaleOrderDetail {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  header: Record<string, any>;
  items: SaleOrderItemDetail[];
  installments: { number: number; dueDate: string; amount: number; paymentStatus: string; paidAt: string | null }[];
  /** null = sem permissão para consultar documentos (não significa ausência). */
  contracts: SaleContract[] | null;
  documentsAccessible: boolean;
}

export async function fetchSaleOrderDetail(record: Pick<SaleOrderSummary, 'orderId' | 'saleId'>): Promise<SaleOrderDetail> {
  const { data, error } = await db.rpc('get_commercial_sale_order_detail', {
    p_order_id: record.orderId, p_sale_id: record.orderId ? null : record.saleId,
  });
  if (error) throw error;
  return {
    header: data?.header ?? {},
    items: (data?.items ?? []).map((item: SaleOrderItemDetail) => ({
      ...item,
      areaSnapshot: num(item.areaSnapshot),
      itemTotal: num(item.itemTotal),
    })),
    installments: (data?.installments ?? []).map((row: { amount: unknown }) => ({ ...row, amount: Number(row.amount) })),
    contracts: data?.documentsAccessible ? (data?.contracts ?? []).map((c: SaleContract) => ({
      ...c,
      lotIds: (c.lotIds ?? []).filter(Boolean),
      versions: (c.versions ?? []).map((v) => ({ ...v, fileSize: Number(v.fileSize) })),
    })) : null,
    documentsAccessible: Boolean(data?.documentsAccessible),
  };
}

/** Documentos compartilhados aparecem uma vez; contratos por lote também, deduplicados por ID. */
export function uniqueContracts(contracts: readonly SaleContract[]): SaleContract[] {
  const seen = new Map<string, SaleContract>();
  contracts.forEach((contract) => { if (!seen.has(contract.contractId)) seen.set(contract.contractId, contract); });
  return Array.from(seen.values());
}

export async function attachOrderContract(params: {
  orgId: string; orderId: string; lotIds: string[]; file: File; contractNumber?: string; contractId?: string | null;
  onProgress?: (phase: 'upload' | 'register' | 'done') => void;
}) {
  const validationError = validateContractFile(params.file);
  if (validationError) throw new Error(validationError);
  if (params.lotIds.length === 0) throw new Error('Selecione ao menos um espaço.');
  const extension = params.file.name.split('.').pop()?.toLowerCase() || 'pdf';
  const objectPath = `${params.orgId}/orders/${params.orderId}/${crypto.randomUUID()}.${extension}`;
  params.onProgress?.('upload');
  const { error: uploadError } = await supabase.storage.from('map-contracts').upload(objectPath, params.file, {
    cacheControl: '3600', contentType: params.file.type, upsert: false,
  });
  if (uploadError) throw uploadError;
  params.onProgress?.('register');
  const { data, error } = await db.rpc('attach_order_contract', {
    p_order_id: params.orderId,
    p_lot_ids: params.lotIds,
    p_storage_path: objectPath,
    p_original_name: params.file.name,
    p_mime_type: params.file.type,
    p_file_size: params.file.size,
    p_contract_number: params.contractNumber?.trim() || null,
    p_contract_id: params.contractId ?? null,
  });
  if (error) {
    await supabase.storage.from('map-contracts').remove([objectPath]).catch(() => undefined);
    throw error;
  }
  params.onProgress?.('done');
  return data as { contractId: string; version: number; versionId: string };
}

export function describeSalesError(error: unknown): string {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
  if (message.includes('MAP_PERMISSION_DENIED') || message.includes('row-level security')) return 'Você não tem permissão para esta ação.';
  if (message.includes('ITEM_NOT_IN_ORDER')) return 'Algum espaço selecionado não pertence a esta venda.';
  if (message.includes('CONTRACT_OBJECT_NOT_FOUND')) return 'O arquivo não foi confirmado no armazenamento. Tente novamente.';
  if (message.includes('INVALID_CONTRACT_FILE')) return 'Envie um PDF ou DOCX de até 15 MB.';
  if (message.includes('ORDER_NOT_FOUND')) return 'Venda não encontrada.';
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) return 'Falha de conexão. Verifique a internet e tente novamente.';
  return message || 'Não foi possível concluir a operação.';
}
