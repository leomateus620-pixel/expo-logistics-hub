import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, FileText, Loader2, MapPinned, Paperclip, Search, ShieldAlert, X } from 'lucide-react';
import type { CommercialMapData } from '../../types';
import { paymentMethodLabel, SALES_PAYMENT_METHODS, SALES_PAYMENT_METHOD_LABELS } from '../../sales/salesTypes';
import { getContractSignedUrl } from '../../services/commercialMapService';
import { formatDashboardCurrency } from '../commercialDashboardFormatters';
import {
  describeSalesError, fetchSaleOrderDetail, fetchSaleOrdersPage, SALE_ORDERS_PAGE_SIZE, uniqueContracts,
  type SaleContract, type SaleOrderDetail, type SaleOrderSummary,
} from './salesOrdersService';
import { useSalesOrdersUiStore } from './useSalesOrdersUiStore';
import { AttachOrderContractDialog } from './AttachOrderContractDialog';

export interface CommercialSalesOrdersSectionProps {
  projectId: string;
  orgId: string | null;
  canManageSales: boolean;
  canManageContracts: boolean;
  data: Pick<CommercialMapData, 'entities' | 'lots'>;
  scrollContainer: () => HTMLElement | null;
  onViewSale: (record: SaleOrderSummary, lotIds: string[]) => void;
}

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const fmtDate = (value: string | null | undefined) => (value ? dateFmt.format(new Date(value.length === 10 ? `${value}T12:00:00-03:00` : value)) : '—');
const fmtArea = (value: number | null) => (value === null ? '—' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²`);

const ITEM_STATE_LABEL: Record<string, string> = {
  PENDING_SIGNATURE: 'Aguardando assinatura', SIGNED: 'Assinatura confirmada',
  CANCELLED: 'Cancelado', LEGACY_UNVERIFIED: 'Legado sem comprovação',
};

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

function documentSummary(record: SaleOrderSummary): string {
  if (record.documentCount === null) return 'Documentos restritos';
  if (record.documentCount === 0) return 'Sem arquivo anexado';
  return record.documentCount === 1 ? '1 documento' : `${record.documentCount} documentos`;
}

export function CommercialSalesOrdersSection(props: CommercialSalesOrdersSectionProps) {
  const { projectId, canManageSales } = props;
  const { filters, page, expandedRecordId, setFilters, resetFilters, setPage, setExpanded, consumeOrigin } = useSalesOrdersUiStore();
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const listRef = useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey: ['commercial-sale-orders', projectId, filters, page],
    queryFn: () => fetchSaleOrdersPage(projectId, filters, page),
    enabled: canManageSales && Boolean(projectId),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: (count, error) => !describeSalesError(error).includes('permissão') && count < 2,
  });

  // Retorno do mapa: restaura rolagem e foco no controle de origem.
  const restored = useRef(false);
  useLayoutEffect(() => {
    if (restored.current || !query.data) return;
    restored.current = true;
    const origin = consumeOrigin();
    if (!origin.recordId) return;
    const container = props.scrollContainer();
    if (container) container.scrollTop = origin.scrollTop;
    window.requestAnimationFrame(() => listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-view-sale="${CSS.escape(origin.recordId!)}"]`)
      ?.focus({ preventScroll: true }));
  }, [consumeOrigin, props, query.data]);

  if (!canManageSales) {
    return <section className="cso-section" aria-labelledby="cso-title">
      <h2 id="cso-title" className="cso-title">Vendas e contratos</h2>
      <p className="cso-state"><ShieldAlert aria-hidden="true" />Acesso restrito: consultar vendas exige a permissão de gestão de vendas.</p>
    </section>;
  }

  const submitSearch = (event: FormEvent) => { event.preventDefault(); setFilters({ search: searchDraft }); };
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / SALE_ORDERS_PAGE_SIZE));
  const errorText = query.error ? describeSalesError(query.error) : null;
  const restricted = errorText?.includes('permissão');

  return <section className="cso-section" aria-labelledby="cso-title">
    <header className="cso-header">
      <div>
        <h2 id="cso-title" className="cso-title">Vendas e contratos</h2>
        <p className="cso-sub">Um registro por pedido · valores negociados gravados, não receita recebida</p>
      </div>
      {query.isFetching && <Loader2 className="is-spinning" aria-label="Atualizando" />}
    </header>
    <form className="cso-filters" onSubmit={submitSearch} role="search">
      <div className="cso-search">
        <input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Expositor, referência, contrato ou espaço" aria-label="Pesquisar vendas" />
        <button type="submit" aria-label="Pesquisar"><Search aria-hidden="true" /></button>
      </div>
      <select aria-label="Situação" value={filters.status} onChange={(e) => setFilters({ status: e.target.value as typeof filters.status })}>
        <option value="">Todas as situações</option>
        <option value="PENDING">Aguardando assinatura</option>
        <option value="PARTIAL">Parcialmente assinada</option>
        <option value="SIGNED">Assinatura confirmada</option>
        <option value="CANCELLED_PARTIAL">Com cancelamento</option>
        <option value="LEGACY">Legado</option>
      </select>
      <select aria-label="Documento" value={filters.hasDocument} onChange={(e) => setFilters({ hasDocument: e.target.value as typeof filters.hasDocument })}>
        <option value="">Com ou sem documento</option>
        <option value="yes">Com arquivo anexado</option>
        <option value="no">Sem arquivo anexado</option>
      </select>
      <select aria-label="Forma de pagamento" value={filters.paymentMethod} onChange={(e) => setFilters({ paymentMethod: e.target.value })}>
        <option value="">Todas as formas</option>
        {SALES_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{SALES_PAYMENT_METHOD_LABELS[m]}</option>)}
      </select>
      <label className="cso-date">De<input type="date" value={filters.from} onChange={(e) => setFilters({ from: e.target.value })} /></label>
      <label className="cso-date">Até<input type="date" value={filters.to} onChange={(e) => setFilters({ to: e.target.value })} /></label>
      <button type="button" className="cso-link" onClick={() => { setSearchDraft(''); resetFilters(); }}>Limpar</button>
    </form>

    <div ref={listRef} className="cso-list" aria-busy={query.isLoading}>
      {query.isLoading && <p className="cso-state"><Loader2 className="is-spinning" aria-hidden="true" />Carregando vendas…</p>}
      {errorText && <p className="cso-state is-error" role="alert"><ShieldAlert aria-hidden="true" />{restricted ? 'Acesso restrito às vendas desta organização.' : errorText}
        {!restricted && <button type="button" className="cso-link" onClick={() => query.refetch()}>Tentar novamente</button>}</p>}
      {!query.isLoading && !errorText && query.data?.rows.length === 0 && <p className="cso-state">Nenhuma venda encontrada com esses critérios.</p>}
      {query.data?.rows.map((record) => <SaleRow key={record.recordId} record={record} {...props}
        expanded={expandedRecordId === record.recordId}
        onToggle={() => setExpanded(expandedRecordId === record.recordId ? null : record.recordId)} />)}
    </div>
    {total > SALE_ORDERS_PAGE_SIZE && <nav className="cso-pager" aria-label="Páginas de vendas">
      <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
      <span>Página {page + 1} de {pages} · {total} registros</span>
      <button type="button" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Próxima</button>
    </nav>}
  </section>;
}

function SaleRow({ record, expanded, onToggle, onViewSale, scrollContainer, ...rest }: CommercialSalesOrdersSectionProps & {
  record: SaleOrderSummary; expanded: boolean; onToggle: () => void;
}) {
  const detailId = `cso-detail-${record.recordId}`;
  const hasCancellation = record.cancelledCount > 0;
  return <article className={`cso-row ${expanded ? 'is-expanded' : ''}`}>
    <div className="cso-row-main">
      <button type="button" className="cso-toggle" aria-expanded={expanded} aria-controls={detailId} onClick={onToggle}>
        <ChevronDown aria-hidden="true" />
        <span className="cso-name">{record.displayName}
          {record.buyerTradeName && record.buyerName && record.buyerTradeName.trim() !== record.buyerName.trim()
            && <small>{record.buyerName}</small>}
        </span>
      </button>
      <dl className="cso-facts">
        <div><dt>Referência</dt><dd>{record.reference}{record.kind === 'LEGACY' && <em className="cso-chip">Legado</em>}</dd></div>
        <div><dt>Data</dt><dd>{fmtDate(record.createdAt)}</dd></div>
        <div><dt>Espaços</dt><dd>{record.activeCount}{hasCancellation ? ` (+${record.cancelledCount} canc.)` : ''}</dd></div>
        <div><dt>Valor negociado</dt><dd title="Total gravado no pedido; não é receita recebida">{formatDashboardCurrency(record.negotiatedTotal)}</dd></div>
        <div><dt>Pagamento</dt><dd>{record.kind === 'LEGACY' ? '—' : paymentMethodLabel(record.paymentMethod)}{record.installmentCount && record.installmentCount > 1 ? ` · ${record.installmentCount}x` : ''}</dd></div>
      </dl>
      <div className="cso-badges">
        <span className="cso-chip">Pedido registrado</span>
        <span className={`cso-chip ${record.signedCount > 0 && record.pendingCount === 0 ? 'is-ok' : 'is-wait'}`}>{signatureSummary(record)}</span>
        <span className={`cso-chip ${record.documentCount ? 'is-ok' : ''}`}><FileText aria-hidden="true" />{documentSummary(record)}</span>
        {record.kind === 'ORDER' && <span className={`cso-chip ${record.paidInstallments > 0 ? 'is-ok' : ''}`}>
          {record.paidInstallments > 0 ? `${record.paidInstallments} parcela(s) recebida(s)` : 'Nenhum pagamento registrado'}</span>}
      </div>
      <button type="button" className="cso-view" data-view-sale={record.recordId}
        disabled={record.lotIds.length === 0}
        onClick={() => {
          useSalesOrdersUiStore.getState().rememberOrigin(record.recordId, scrollContainer()?.scrollTop ?? 0);
          onViewSale(record, record.lotIds);
        }}>
        <MapPinned aria-hidden="true" />Ver lotes no mapa
      </button>
    </div>
    {expanded && <div id={detailId} className="cso-detail"><SaleDetail record={record} {...rest} onViewSale={onViewSale} scrollContainer={scrollContainer} /></div>}
  </article>;
}

function SaleDetail({ record, data, orgId, canManageContracts }: CommercialSalesOrdersSectionProps & { record: SaleOrderSummary }) {
  const queryClient = useQueryClient();
  const [attachOpen, setAttachOpen] = useState<{ contract: SaleContract | null } | null>(null);
  const detail = useQuery({
    queryKey: ['commercial-sale-order-detail', record.recordId],
    queryFn: () => fetchSaleOrderDetail(record),
    staleTime: 30_000,
  });
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

  if (detail.isLoading) return <p className="cso-state"><Loader2 className="is-spinning" aria-hidden="true" />Carregando detalhes…</p>;
  if (detail.error) return <p className="cso-state is-error" role="alert">{describeSalesError(detail.error)}
    <button type="button" className="cso-link" onClick={() => detail.refetch()}>Tentar novamente</button></p>;
  const d = detail.data as SaleOrderDetail;
  const h = d.header;
  const labelOf = (lotId: string) => {
    const item = d.items.find((i) => i.lotId === lotId);
    return item ? (item.displayName || item.publicIdentifier) : (lotIndex.get(lotId)?.displayName ?? 'Espaço');
  };
  const activeItems = d.items.filter((i) => i.contractState !== 'CANCELLED');
  const activeSubtotal = activeItems.reduce((sum, i) => sum + (i.itemTotal ?? 0), 0);
  const hasCancelled = activeItems.length !== d.items.length;
  const contracts = d.contracts ? uniqueContracts(d.contracts) : null;

  return <div className="cso-detail-grid">
    <section className="cso-block">
      <h3>Expositor</h3>
      <p className="cso-strong">{h.buyerTradeName?.trim() || h.buyerName}</p>
      {h.buyerTradeName?.trim() && <p>Razão social: {h.buyerName}</p>}
      {h.documentNumber && <p>Documento: {h.documentNumber}</p>}
      {h.email && <p>{h.email}</p>}
      {h.phone && <p>{h.phone}</p>}
    </section>

    <section className="cso-block cso-span">
      <h3>Espaços ({d.items.length})</h3>
      <ul className="cso-items">
        {d.items.map((item) => <li key={item.itemId ?? item.lotId} className={item.contractState === 'CANCELLED' ? 'is-cancelled' : ''}>
          <span className="cso-strong">{item.displayName || item.publicIdentifier}</span>
          <span>{locationOf(item.lotId)}</span>
          <span>{fmtArea(item.areaSnapshot)}</span>
          <span>{formatDashboardCurrency(item.itemTotal)}</span>
          <span className={`cso-chip ${item.contractState === 'SIGNED' ? 'is-ok' : item.contractState === 'PENDING_SIGNATURE' ? 'is-wait' : ''}`}>{ITEM_STATE_LABEL[item.contractState] ?? item.contractState}</span>
        </li>)}
      </ul>
    </section>

    <section className="cso-block">
      <h3>Condições comerciais</h3>
      {h.kind === 'ORDER' ? <dl className="cso-kv">
        <div><dt>Subtotal dos espaços</dt><dd>{formatDashboardCurrency(h.spacesSubtotal === null ? null : Number(h.spacesSubtotal))}</dd></div>
        <div><dt>Taxa administrativa</dt><dd>{formatDashboardCurrency(Number(h.feeAdmin ?? 0))}</dd></div>
        <div><dt>PPCI</dt><dd>{formatDashboardCurrency(Number(h.feePpci ?? 0))}</dd></div>
        <div><dt>Limpeza / licença</dt><dd>{formatDashboardCurrency(Number(h.feeCleaning ?? 0))}</dd></div>
        <div className="is-total"><dt>Total gravado do pedido</dt><dd>{formatDashboardCurrency(Number(h.negotiatedTotal))}</dd></div>
        {hasCancelled && <div><dt>Subtotal dos espaços ativos</dt><dd>{formatDashboardCurrency(activeSubtotal)}</dd></div>}
      </dl> : <dl className="cso-kv">
        <div className="is-total"><dt>Valor negociado (legado)</dt><dd>{formatDashboardCurrency(Number(h.negotiatedTotal))}</dd></div>
        <div><dt>Data da venda</dt><dd>{fmtDate(h.saleDate)}</dd></div>
      </dl>}
      {hasCancelled && <p className="cso-note">Total original preservado; parcelas e taxas não são recalculadas automaticamente.</p>}
    </section>

    <section className="cso-block">
      <h3>Pagamento</h3>
      {h.kind === 'ORDER' ? <>
        <p>{paymentMethodLabel(h.paymentMethod)} · {d.installments.length} parcela(s)</p>
        <ol className="cso-installments">
          {d.installments.map((n) => <li key={n.number}>
            <span>{n.number}ª</span><span>{fmtDate(n.dueDate)}</span><span>{formatDashboardCurrency(n.amount)}</span>
            <span className={`cso-chip ${n.paidAt || n.paymentStatus === 'PAID' ? 'is-ok' : ''}`}>{n.paidAt || n.paymentStatus === 'PAID' ? 'Recebida' : 'Pendente'}</span>
          </li>)}
        </ol>
      </> : <p>Situação registrada: {h.paymentStatus ?? '—'} (venda legada sem parcelas)</p>}
    </section>

    <section className="cso-block cso-span">
      <div className="cso-block-head">
        <h3>Contratos e documentos</h3>
        {canManageContracts && h.kind === 'ORDER' && orgId && <button type="button" className="cso-view" onClick={() => setAttachOpen({ contract: null })}>
          <Paperclip aria-hidden="true" />Anexar contrato</button>}
      </div>
      {contracts === null ? <p className="cso-state"><ShieldAlert aria-hidden="true" />Consulta de documentos restrita ao seu perfil.</p>
        : contracts.length === 0 ? <p className="cso-state">Sem arquivo anexado.</p>
          : <ul className="cso-docs">{contracts.map((c) => <ContractRow key={c.contractId} contract={c} labelOf={labelOf}
            canReplace={canManageContracts && c.scope === 'ORDER_ITEMS'} onReplace={() => setAttachOpen({ contract: c })} />)}</ul>}
      <p className="cso-note">Anexar um arquivo não confirma assinatura, pagamento nem venda.</p>
    </section>

    {attachOpen && orgId && h.orderId && <AttachOrderContractDialog
      orgId={orgId}
      orderId={h.orderId}
      items={activeItems.map((i) => ({ lotId: i.lotId, label: `${i.displayName || i.publicIdentifier} · ${locationOf(i.lotId)}` }))}
      contract={attachOpen.contract}
      onClose={() => setAttachOpen(null)}
      onAttached={async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['commercial-sale-order-detail', record.recordId] }),
          queryClient.invalidateQueries({ queryKey: ['commercial-sale-orders'] }),
          queryClient.invalidateQueries({ queryKey: ['lot-contract-versions'] }),
        ]);
      }}
    />}
  </div>;
}

function ContractRow({ contract, labelOf, canReplace, onReplace }: {
  contract: SaleContract; labelOf: (lotId: string) => string; canReplace: boolean; onReplace: () => void;
}) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = contract.versions.find((v) => !v.supersededAt) ?? contract.versions[0];
  const open = async (path: string) => {
    setOpening(true); setError(null);
    // URL temporária gerada a cada abertura: nunca reutiliza um link expirado.
    const win = window.open('', '_blank', 'noopener');
    try {
      const url = await getContractSignedUrl(path);
      if (win) win.location.href = url; else window.location.assign(url);
    } catch (e) { win?.close(); setError(describeSalesError(e)); } finally { setOpening(false); }
  };
  return <li className="cso-doc">
    <div>
      <p className="cso-strong">{contract.contractNumber ? `Contrato ${contract.contractNumber}` : 'Contrato sem número'}
        <em className="cso-chip">{contract.scope === 'ORDER_ITEMS' ? 'Documento da venda' : 'Documento do lote'}</em></p>
      <p>Abrange: {contract.lotIds.map(labelOf).join(', ') || '—'}</p>
      {active ? <p>v{active.version} · {active.originalName} · {fmtDate(active.uploadedAt)}</p> : <p>Sem arquivo anexado</p>}
      {contract.versions.length > 1 && <details><summary>Histórico ({contract.versions.length} versões)</summary>
        <ul>{contract.versions.map((v) => <li key={v.id}><button type="button" className="cso-link" onClick={() => open(v.storagePath)}>v{v.version} · {v.originalName}</button> · {fmtDate(v.uploadedAt)}</li>)}</ul>
      </details>}
      {error && <p className="cso-note is-error" role="alert">{error}</p>}
    </div>
    <div className="cso-doc-actions">
      {active && <button type="button" className="cso-link" disabled={opening} onClick={() => open(active.storagePath)}>{opening ? 'Abrindo…' : 'Abrir'}</button>}
      {canReplace && <button type="button" className="cso-link" onClick={onReplace}>Nova versão</button>}
    </div>
  </li>;
}

export { X };
