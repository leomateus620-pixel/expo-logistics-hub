import { useLayoutEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, MapPinned, Paperclip, Pencil, ShieldAlert, Wallet } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { paymentMethodLabel } from '../../sales/salesTypes';
import { formatDashboardCurrency } from '../commercialDashboardFormatters';
import type { CommercialSalesOrdersSectionProps } from './CommercialSalesOrdersSection';
import { AttachOrderContractDialog } from './AttachOrderContractDialog';
import { ReviseSaleOrderDialog } from './ReviseSaleOrderDialog';
import { SaleOrderContract } from './SaleOrderContracts';
import { SaleOrderHistory } from './SaleOrderHistory';
import { describeSalesError, fetchSaleOrderDetail, uniqueContracts, type SaleContract, type SaleOrderSummary } from './salesOrdersService';
import { documentSummary, fmtSaleArea, fmtSaleDate, receiptSummary, saleDetailSummary, saleName, saleStateLabel, signatureSummary } from './salesOrdersPresentation';
import { useSalesOrdersUiStore, type SalesOrdersDetailTab, type SalesOrdersRecordIdentity } from './useSalesOrdersUiStore';

const ITEM_STATE_LABEL: Record<string, string> = {
  PENDING_SIGNATURE: 'Aguardando assinatura', SIGNED: 'Assinatura confirmada',
  CANCELLED: 'Cancelado', LEGACY_UNVERIFIED: 'Legado sem comprovação',
};
const INSTALLMENTS_PER_PAGE = 8;
const moneyValue = (value: unknown) => value == null || value === '' ? null : Number(value);

export function SaleOrderDetail({ record, data, orgId, canManageContracts, canManageSales, onViewSale, scrollContainer, onReady }: CommercialSalesOrdersSectionProps & {
  record: SaleOrderSummary | SalesOrdersRecordIdentity; onReady: () => void;
}) {
  const queryClient = useQueryClient();
  const { detailTab, setDetailTab } = useSalesOrdersUiStore();
  const [reviseOpen, setReviseOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState<{ contract: SaleContract | null } | null>(null);
  const [installmentPage, setInstallmentPage] = useState(0);
  const detail = useQuery({
    queryKey: ['commercial-sale-order-detail', record.recordId],
    queryFn: () => fetchSaleOrderDetail(record),
    staleTime: 30_000,
  });
  // Só restaura a origem quando a aba e os controles do detalhe já existem no DOM.
  useLayoutEffect(() => { if (detail.data && !detail.error) onReady(); }, [detail.data, detail.error, detailTab, onReady]);
  const lotIndex = useMemo(() => new Map(data.lots.map((lot) => [lot.id, lot])), [data.lots]);
  const entityIndex = useMemo(() => new Map(data.entities.map((entity) => [entity.id, entity])), [data.entities]);
  const locationOf = (lotId: string) => {
    const lot = lotIndex.get(lotId);
    const entity = lot ? entityIndex.get(lot.entityId) : undefined;
    if (!lot || !entity) return 'Fora do inventário carregado';
    const parent = entity.parentEntityId ? entityIndex.get(entity.parentEntityId) : null;
    if (parent) return parent.name || parent.publicIdentifier;
    return lot.block ? `Quadra ${lot.block}` : 'Área externa';
  };

  if (detail.isLoading) return <p className="cso-state" role="status"><Loader2 className="is-spinning" aria-hidden="true" />Carregando detalhes…</p>;
  if (detail.error) return <p className="cso-state is-error" role="alert">{describeSalesError(detail.error)}
    <button type="button" className="cso-link" onClick={() => detail.refetch()}>Tentar novamente</button></p>;
  if (!detail.data) return null;
  const d = detail.data;
  const h = d.header;
  const labelOf = (lotId: string) => {
    const item = d.items.find((i) => i.lotId === lotId);
    const label = item ? (item.displayName || item.publicIdentifier) : (lotIndex.get(lotId)?.displayName ?? 'Espaço');
    return `${label} · ${locationOf(lotId)}`;
  };
  const activeItems = d.items.filter((i) => i.contractState !== 'CANCELLED');
  const activeSubtotal = activeItems.some((item) => item.itemTotal === null) ? null : activeItems.reduce((sum, i) => sum + (i.itemTotal ?? 0), 0);
  const hasCancelled = activeItems.length !== d.items.length;
  const contracts = d.contracts ? uniqueContracts(d.contracts) : null;
  const groupedItems = new Map<string, typeof d.items>();
  d.items.forEach((item) => {
    const location = locationOf(item.lotId);
    const group = groupedItems.get(location) ?? [];
    group.push(item);
    groupedItems.set(location, group);
  });
  const paid = d.installments.filter((item) => item.paidAt || item.paymentStatus === 'PAID');
  const installmentPages = Math.max(1, Math.ceil(d.installments.length / INSTALLMENTS_PER_PAGE));
  const currentInstallmentPage = Math.min(installmentPage, installmentPages - 1);
  const installments = d.installments.slice(currentInstallmentPage * INSTALLMENTS_PER_PAGE, (currentInstallmentPage + 1) * INSTALLMENTS_PER_PAGE);
  const currentRecord = saleDetailSummary(record, d);

  return <div className="cso-detail" data-sale-detail={record.recordId}>
    <header className="cso-detail-summary">
      <div className="cso-detail-identity"><h3 tabIndex={-1}>{saleName(currentRecord)}</h3><div className="cso-reference"><strong>{currentRecord.reference}</strong><span>{fmtSaleDate(currentRecord.createdAt)}</span><span>{saleStateLabel(currentRecord)}</span></div>
        <p className={`cso-summary-signature ${currentRecord.pendingCount > 0 ? 'is-wait' : ''}`}>{signatureSummary(currentRecord)}</p>
      </div>
      <div className="cso-detail-summary-numbers"><div><span>Espaços ativos</span><strong>{activeItems.length}</strong></div><div className="cso-value"><span>Valor negociado</span><strong>{formatDashboardCurrency(moneyValue(h.negotiatedTotal))}</strong></div></div>
    </header>
    <Tabs className="cso-detail-tabs" value={detailTab} onValueChange={(value) => setDetailTab(value as SalesOrdersDetailTab)}>
      <TabsList className="cso-tabs-list" aria-label="Assuntos da venda">
        <TabsTrigger className="cso-tab" value="overview">Visão geral</TabsTrigger>
        <TabsTrigger className="cso-tab" value="spaces">Espaços</TabsTrigger>
        <TabsTrigger className="cso-tab" value="finance">Financeiro</TabsTrigger>
        <TabsTrigger className="cso-tab" value="contracts">Contratos</TabsTrigger>
        <TabsTrigger className="cso-tab" value="history">Histórico</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="cso-tab-content">
        <div className="cso-overview-states">
          <div><FileText aria-hidden="true" /><span>Documentação</span><strong>{documentSummary(currentRecord)}</strong></div>
          <div><Wallet aria-hidden="true" /><span>Recebimentos</span><strong>{currentRecord.kind === 'ORDER' ? receiptSummary(currentRecord) : 'Consultar registro legado'}</strong></div>
        </div>
        <section className="cso-block"><h3>Dados da venda</h3><dl className="cso-exhibitor-data">
          <div><dt>Expositor</dt><dd>{h.buyerTradeName?.trim() || h.buyerName || '—'}</dd></div>
          {h.buyerTradeName?.trim() && <div><dt>Razão social</dt><dd>{h.buyerName || '—'}</dd></div>}
          {h.documentNumber && <div><dt>Documento</dt><dd>{h.documentNumber}</dd></div>}
          {h.email && <div><dt>E-mail</dt><dd>{h.email}</dd></div>}
          {h.phone && <div><dt>Telefone</dt><dd>{h.phone}</dd></div>}
          <div><dt>Forma de pagamento</dt><dd>{h.kind === 'ORDER' ? paymentMethodLabel(h.paymentMethod) : 'Registro legado'}</dd></div>
          <div><dt>Data do registro</dt><dd>{fmtSaleDate(currentRecord.createdAt)}</dd></div>
          {hasCancelled && <div><dt>Espaços cancelados</dt><dd>{d.items.length - activeItems.length} · preservados no histórico</dd></div>}
        </dl><p className="cso-note">Valor negociado, assinatura, documento anexado e recebimento são informações independentes.</p></section>
      </TabsContent>
      <TabsContent value="spaces" className="cso-tab-content">
        <section className="cso-block">
          <div className="cso-block-head"><h3>Espaços <span className="cso-count">{d.items.length}</span></h3><div className="cso-space-actions">
            <button type="button" className="cso-secondary" data-view-sale={record.recordId} disabled={currentRecord.lotIds.length === 0} onClick={() => {
              useSalesOrdersUiStore.getState().rememberOrigin(record.recordId, scrollContainer()?.scrollTop ?? 0);
              onViewSale(currentRecord, currentRecord.lotIds);
            }}><MapPinned aria-hidden="true" />Ver lotes no mapa</button>
            {canManageSales && h.kind === 'ORDER' && h.orderId && activeItems.length > 0 && <button type="button" className="cso-view cso-edit-lots" onClick={() => setReviseOpen(true)}><Pencil aria-hidden="true" />Editar lotes</button>}
          </div></div>
          {Array.from(groupedItems, ([location, items]) => <div className="cso-space-group" key={location}>
            <h4>{location}<span>{items.length} {items.length === 1 ? 'espaço' : 'espaços'}</span></h4>
            <ul className="cso-items">{items.map((item) => <li key={item.itemId ?? item.lotId} className={item.contractState === 'CANCELLED' ? 'is-cancelled' : ''}>
              <span className="cso-strong">{item.displayName || item.publicIdentifier}</span>
              <span className="cso-item-area" aria-label={`Área: ${fmtSaleArea(item.areaSnapshot)}`}>{fmtSaleArea(item.areaSnapshot)}</span>
              <span className="cso-item-value" aria-label={`Valor registrado: ${formatDashboardCurrency(item.itemTotal)}`}>{formatDashboardCurrency(item.itemTotal)}</span>
              <span className={`cso-item-state ${item.contractState === 'PENDING_SIGNATURE' ? 'is-wait' : ''}`}>{ITEM_STATE_LABEL[item.contractState] ?? item.contractState}</span>
            </li>)}</ul>
          </div>)}
        </section>
      </TabsContent>
      <TabsContent value="finance" className="cso-tab-content">
        <div className="cso-detail-grid">
          <section className="cso-block"><h3>Valores e taxas</h3>
            {h.kind === 'ORDER' ? <dl className="cso-kv">
              <div><dt>Subtotal original dos espaços</dt><dd>{formatDashboardCurrency(moneyValue(h.spacesSubtotal))}</dd></div>
              <div><dt>Taxa administrativa</dt><dd>{formatDashboardCurrency(moneyValue(h.feeAdmin))}</dd></div>
              <div><dt>PPCI</dt><dd>{formatDashboardCurrency(moneyValue(h.feePpci))}</dd></div>
              <div><dt>Limpeza / licença</dt><dd>{formatDashboardCurrency(moneyValue(h.feeCleaning))}</dd></div>
              <div className="is-total"><dt>Total registrado</dt><dd>{formatDashboardCurrency(moneyValue(h.negotiatedTotal))}</dd></div>
              {hasCancelled && <div><dt>Subtotal dos espaços ativos</dt><dd>{formatDashboardCurrency(activeSubtotal)}</dd></div>}
            </dl> : <dl className="cso-kv"><div className="is-total"><dt>Valor negociado (legado)</dt><dd>{formatDashboardCurrency(moneyValue(h.negotiatedTotal))}</dd></div><div><dt>Data da venda</dt><dd>{fmtSaleDate(h.saleDate)}</dd></div></dl>}
            {hasCancelled && <p className="cso-note">O total original e os espaços cancelados permanecem registrados. Alterações de lotes ficam disponíveis na aba Espaços.</p>}
          </section>
          <section className="cso-block"><h3>Parcelas e recebimentos</h3>
            {h.kind === 'ORDER' ? <>
              <dl className="cso-receipts"><div><dt>Recebido em parcelas</dt><dd>{formatDashboardCurrency(paid.reduce((sum, item) => sum + item.amount, 0))}</dd></div><div><dt>Parcelas recebidas</dt><dd>{paid.length} de {d.installments.length}</dd></div></dl>
              <p className="cso-payment-method">{paymentMethodLabel(h.paymentMethod)} · {d.installments.length} parcela(s)</p>
              {d.installments.length > 0 && <div className="cso-installments-head" aria-hidden="true"><span>Nº</span><span>Vencimento</span><span>Valor</span><span>Situação</span></div>}
              <ol className="cso-installments" start={currentInstallmentPage * INSTALLMENTS_PER_PAGE + 1}>{installments.map((item) => <li key={item.number}>
                <span>{item.number}ª</span><span>{fmtSaleDate(item.dueDate)}</span><span>{formatDashboardCurrency(item.amount)}</span>
                <span className={`cso-payment-state ${item.paidAt || item.paymentStatus === 'PAID' ? 'is-paid' : ''}`}>{item.paidAt || item.paymentStatus === 'PAID' ? 'Recebida' : 'Pendente'}{item.paidAt && <small>{fmtSaleDate(item.paidAt)}</small>}</span>
              </li>)}</ol>
              {d.installments.length === 0 && <p className="cso-note">Nenhuma parcela registrada neste pedido.</p>}
              {installmentPages > 1 && <nav className="cso-pager cso-installments-pager" aria-label="Páginas de parcelas"><span>{currentInstallmentPage * INSTALLMENTS_PER_PAGE + 1}–{Math.min((currentInstallmentPage + 1) * INSTALLMENTS_PER_PAGE, d.installments.length)} de {d.installments.length} parcelas</span><div>
                <button type="button" aria-label="Parcelas anteriores" disabled={currentInstallmentPage === 0} onClick={() => setInstallmentPage(currentInstallmentPage - 1)}>Anterior</button>
                <button type="button" aria-label="Próximas parcelas" disabled={currentInstallmentPage + 1 >= installmentPages} onClick={() => setInstallmentPage(currentInstallmentPage + 1)}>Próxima</button>
              </div></nav>}
              <p className="cso-note">Recebimentos acima consideram somente as parcelas registradas como recebidas.</p>
            </> : <p>Situação registrada: {h.paymentStatus ?? '—'} (venda legada sem parcelas)</p>}
          </section>
        </div>
      </TabsContent>
      <TabsContent value="contracts" className="cso-tab-content">
        <section className="cso-block"><div className="cso-block-head"><h3>Contratos {contracts && <span className="cso-count">{contracts.length}</span>}</h3>
          {canManageContracts && h.kind === 'ORDER' && orgId && <button type="button" className="cso-view" onClick={() => setAttachOpen({ contract: null })}><Paperclip aria-hidden="true" />Anexar contrato</button>}
        </div>
          <p className="cso-contract-signature"><span>Assinatura dos espaços</span><strong>{signatureSummary(currentRecord)}</strong></p>
          {contracts === null ? <p className="cso-state"><ShieldAlert aria-hidden="true" />Consulta de documentos restrita ao seu perfil.</p>
            : contracts.length === 0 ? <p className="cso-state">Sem arquivo anexado.</p>
              : <ul className="cso-docs">{contracts.map((contract) => <SaleOrderContract key={contract.contractId} contract={contract} labelOf={labelOf} canReplace={canManageContracts && contract.scope === 'ORDER_ITEMS'} onReplace={() => setAttachOpen({ contract })} />)}</ul>}
          <p className="cso-note">Arquivo anexado não comprova assinatura ou recebimento.</p>
        </section>
      </TabsContent>
      <TabsContent value="history" className="cso-tab-content">
        {h.kind === 'ORDER' && h.orderId && canManageSales ? <SaleOrderHistory orderId={h.orderId} /> : <p className="cso-state">Registro legado: o histórico de revisões de pedidos não se aplica a esta venda.</p>}
      </TabsContent>
    </Tabs>
    {reviseOpen && h.orderId && <ReviseSaleOrderDialog orderId={h.orderId} detail={d} lots={data.lots} entities={data.entities} locationOf={locationOf} onClose={() => setReviseOpen(false)} onSaved={async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['commercial-sale-order-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['commercial-sale-orders'] }),
        queryClient.invalidateQueries({ queryKey: ['commercial-map'] }),
      ]);
    }} />}
    {attachOpen && orgId && h.orderId && <AttachOrderContractDialog orgId={orgId} orderId={h.orderId} items={activeItems.map((item) => ({ lotId: item.lotId, label: `${item.displayName || item.publicIdentifier} · ${locationOf(item.lotId)}` }))} contract={attachOpen.contract} onClose={() => setAttachOpen(null)} onAttached={async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['commercial-sale-order-detail', record.recordId] }),
        queryClient.invalidateQueries({ queryKey: ['commercial-sale-orders'] }),
        queryClient.invalidateQueries({ queryKey: ['lot-contract-versions'] }),
      ]);
    }} />}
  </div>;
}
