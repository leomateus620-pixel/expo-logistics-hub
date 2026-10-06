import { uniqueContracts, type SaleOrderDetail, type SaleOrderSummary } from './salesOrdersService';
import type { SalesOrdersRecordIdentity } from './useSalesOrdersUiStore';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
export const fmtSaleDate = (value: string | null | undefined) => (value ? dateFmt.format(new Date(value.length === 10 ? `${value}T12:00:00-03:00` : value)) : '—');
export const fmtSaleArea = (value: number | null) => (value === null ? '—' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²`);
export const saleName = (record: SaleOrderSummary) => record.buyerTradeName?.trim() || record.displayName;

export function signatureSummary(record: Pick<SaleOrderSummary, 'kind' | 'signedCount' | 'pendingCount' | 'cancelledCount' | 'legacyCount' | 'itemCount'>): string {
  if (record.kind === 'LEGACY') return 'Registro legado';
  const parts: string[] = [];
  const signable = record.itemCount - record.cancelledCount;
  if (record.signedCount > 0 && record.pendingCount > 0) parts.push(`${record.signedCount} de ${signable} assinados`);
  else if (record.signedCount > 0) parts.push('Assinatura confirmada');
  else if (record.pendingCount > 0) parts.push('Aguardando assinatura');
  if (record.legacyCount > 0) parts.push(`${record.legacyCount} legado(s)`);
  if (record.cancelledCount > 0) parts.push(`${record.cancelledCount} cancelado(s)`);
  return parts.join(' · ') || '—';
}

export function documentSummary(record: SaleOrderSummary): string {
  if (record.documentCount === null) return 'Documentos restritos';
  if (record.documentCount === 0) return 'Sem arquivo anexado';
  return record.documentCount === 1 ? '1 documento' : `${record.documentCount} documentos`;
}

export function saleStateLabel(record: SaleOrderSummary): string {
  if (record.kind === 'LEGACY') return 'Legado';
  const labels: Record<string, string> = { OPEN: 'Venda em aberto', CONFIRMED: 'Venda confirmada', CANCELLED: 'Venda cancelada' };
  return labels[record.status] ?? record.status;
}

export function receiptSummary(record: SaleOrderSummary): string {
  return record.paidInstallments > 0
    ? `${record.paidInstallments}${record.installmentCount ? ` de ${record.installmentCount}` : ''} parcela(s) recebida(s)`
    : 'Sem recebimento registrado';
}

/** Reconstrói a apresentação do detalhe a partir da resposta já existente, sem guardar valores na store. */
export function saleDetailSummary(identity: SalesOrdersRecordIdentity, detail: SaleOrderDetail): SaleOrderSummary {
  const h = detail.header;
  const value = (input: unknown) => input == null || input === '' ? null : Number(input);
  const active = detail.items.filter((item) => item.contractState !== 'CANCELLED');
  return {
    recordId: identity.recordId, orderId: h.orderId ?? identity.orderId, saleId: h.saleId ?? identity.saleId,
    kind: h.kind === 'LEGACY' ? 'LEGACY' : 'ORDER', reference: h.reference || '—', createdAt: h.createdAt || '',
    status: h.status || '—', buyerName: h.buyerName || '', buyerTradeName: h.buyerTradeName ?? null,
    displayName: h.buyerTradeName?.trim() || h.buyerName || '—', negotiatedTotal: value(h.negotiatedTotal), spacesSubtotal: value(h.spacesSubtotal),
    feesTotal: value(h.feesTotal), paymentMethod: h.paymentMethod ?? null,
    installmentCount: value(h.installmentCount), itemCount: detail.items.length, activeCount: active.length,
    signedCount: detail.items.filter((item) => item.contractState === 'SIGNED').length,
    pendingCount: detail.items.filter((item) => item.contractState === 'PENDING_SIGNATURE').length,
    cancelledCount: detail.items.filter((item) => item.contractState === 'CANCELLED').length,
    legacyCount: detail.items.filter((item) => item.contractState === 'LEGACY_UNVERIFIED').length,
    activeItemsTotal: active.some((item) => item.itemTotal === null) ? null : active.reduce((sum, item) => sum + (item.itemTotal ?? 0), 0),
    lotIds: active.map((item) => item.lotId),
    documentCount: detail.documentsAccessible && detail.contracts ? uniqueContracts(detail.contracts).filter((contract) => contract.versions.some((version) => !version.supersededAt)).length : null,
    paidInstallments: detail.installments.filter((item) => item.paidAt || item.paymentStatus === 'PAID').length,
  };
}
