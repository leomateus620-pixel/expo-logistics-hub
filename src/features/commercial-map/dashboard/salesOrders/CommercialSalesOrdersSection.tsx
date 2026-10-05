import { useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, FileText, Loader2, MapPinned, Paperclip, Pencil, Search, ShieldAlert, SlidersHorizontal, X } from 'lucide-react';
import type { CommercialMapData } from '../../types';
import { paymentMethodLabel, SALES_PAYMENT_METHODS, SALES_PAYMENT_METHOD_LABELS } from '../../sales/salesTypes';
import { getContractSignedUrl } from '../../services/commercialMapService';
import { formatDashboardCurrency } from '../commercialDashboardFormatters';
import {
  describeSalesError, fetchSaleOrderDetail, fetchSaleOrderRevisions, fetchSaleOrdersPage, SALE_ORDERS_PAGE_SIZE, uniqueContracts,
  type SaleContract, type SaleOrderDetail, type SaleOrderSummary, type SaleOrdersFilters,
} from './salesOrdersService';
import { useSalesOrdersUiStore } from './useSalesOrdersUiStore';
import { AttachOrderContractDialog } from './AttachOrderContractDialog';
import { ReviseSaleOrderDialog } from './ReviseSaleOrderDialog';

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

const STATUS_FILTER_LABELS = {
  PENDING: 'Aguardando assinatura', PARTIAL: 'Parcialmente assinada', SIGNED: 'Assinatura confirmada',
  CANCELLED_PARTIAL: 'Com cancelamento', LEGACY: 'Legado',
};
const FILTER_REMOVE_LABELS: Record<keyof SaleOrdersFilters, string> = {
  search: 'Remover busca', status: 'Remover filtro de situação', hasDocument: 'Remover filtro de documento',
  paymentMethod: 'Remover filtro de pagamento', from: 'Remover data inicial', to: 'Remover data final',
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
  const { filters, page, expandedRecordId, filtersOpen, setFiltersOpen, setFilters, resetFilters, setPage, setExpanded, consumeOrigin } = useSalesOrdersUiStore();
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
  const activeFilters = (Object.entries(filters) as [keyof SaleOrdersFilters, string][]).filter(([, value]) => value);
  const filterLabel = (key: keyof SaleOrdersFilters, value: string) => {
    if (key === 'status') return STATUS_FILTER_LABELS[value as keyof typeof STATUS_FILTER_LABELS];
    if (key === 'hasDocument') return value === 'yes' ? 'Com arquivo anexado' : 'Sem arquivo anexado';
    if (key === 'paymentMethod') return paymentMethodLabel(value);
    if (key === 'from' || key === 'to') return `${key === 'from' ? 'De' : 'Até'} ${fmtDate(value)}`;
    return `Busca: ${value}`;
  };

  return <section className="cso-section" aria-labelledby="cso-title">
    <header className="cso-header">
      <h2 id="cso-title" className="cso-title">Vendas e contratos</h2>
      <span className="cso-result-count" role="status">
        {query.isFetching && <Loader2 className="is-spinning" aria-label="Atualizando" />}
        {query.data && !errorText && <><strong>{total}</strong> {total === 1 ? 'registro' : 'registros'}</>}
      </span>
    </header>
    <form className="cso-filters" onSubmit={submitSearch} role="search">
      <div className="cso-search">
        <input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Expositor, referência, contrato ou espaço" aria-label="Pesquisar vendas" />
        <button type="submit" aria-label="Pesquisar"><Search aria-hidden="true" /></button>
      </div>
      <button type="button" className="cso-filter-toggle" aria-expanded={filtersOpen} aria-controls="cso-filter-fields" onClick={() => setFiltersOpen(!filtersOpen)}>
        <SlidersHorizontal aria-hidden="true" />Filtros{activeFilters.length > 0 && <span>{activeFilters.length}</span>}
      </button>
      <div id="cso-filter-fields" className={`cso-filter-fields ${filtersOpen ? 'is-open' : ''}`}>
      <label>Situação<select aria-label="Situação" value={filters.status} onChange={(e) => setFilters({ status: e.target.value as typeof filters.status })}>
        <option value="">Todas as situações</option>
        {Object.entries(STATUS_FILTER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Documentos<select aria-label="Documento" value={filters.hasDocument} onChange={(e) => setFilters({ hasDocument: e.target.value as typeof filters.hasDocument })}>
        <option value="">Com ou sem documento</option>
        <option value="yes">Com arquivo anexado</option>
        <option value="no">Sem arquivo anexado</option>
      </select></label>
      <label>Pagamento<select aria-label="Forma de pagamento" value={filters.paymentMethod} onChange={(e) => setFilters({ paymentMethod: e.target.value })}>
        <option value="">Todas as formas</option>
        {SALES_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{SALES_PAYMENT_METHOD_LABELS[m]}</option>)}
      </select></label>
      <div className="cso-dates">
        <label>De<input type="date" value={filters.from} onChange={(e) => setFilters({ from: e.target.value })} /></label>
        <label>Até<input type="date" value={filters.to} onChange={(e) => setFilters({ to: e.target.value })} /></label>
      </div>
      </div>
    </form>
    {activeFilters.length > 0 && <div className="cso-active-filters" aria-label="Filtros ativos">
      {activeFilters.map(([key, value]) => <button type="button" key={key} aria-label={`${FILTER_REMOVE_LABELS[key]}: ${filterLabel(key, value)}`}
        onClick={() => { setFilters({ [key]: '' }); if (key === 'search') setSearchDraft(''); }}>
        {filterLabel(key, value)}<X aria-hidden="true" />
      </button>)}
      <button type="button" className="cso-clear-filters" onClick={() => { setSearchDraft(''); resetFilters(); }}>Limpar filtros</button>
    </div>}
    <div className="cso-list-caption"><span>Pedidos e registros legados</span><span>Valores negociados · não representam recebimentos</span></div>

    <div ref={listRef} className="cso-list" aria-busy={query.isFetching}>
      {query.isLoading && <p className="cso-state" role="status"><Loader2 className="is-spinning" aria-hidden="true" />Carregando vendas…</p>}
      {errorText && <p className="cso-state is-error" role="alert"><ShieldAlert aria-hidden="true" />{restricted ? 'Acesso restrito às vendas desta organização.' : errorText}
        {!restricted && <button type="button" className="cso-link" onClick={() => query.refetch()}>Tentar novamente</button>}</p>}
      {!query.isLoading && !errorText && query.data?.rows.length === 0 && <div className="cso-state cso-empty" role="status">
        <Search aria-hidden="true" /><div><strong>Nenhuma venda encontrada</strong><p>{activeFilters.length ? 'Ajuste a busca ou remova os filtros para ver mais registros.' : 'Os pedidos registrados aparecerão aqui.'}</p></div>
        {activeFilters.length > 0 && <button type="button" className="cso-link" onClick={() => { setSearchDraft(''); resetFilters(); }}>Limpar filtros</button>}
      </div>}
      {!errorText && query.data?.rows.map((record) => <SaleRow key={record.recordId} record={record} {...props}
        expanded={expandedRecordId === record.recordId}
        onToggle={() => setExpanded(expandedRecordId === record.recordId ? null : record.recordId)} />)}
    </div>
    {!errorText && total > SALE_ORDERS_PAGE_SIZE && <nav className="cso-pager" aria-label="Páginas de vendas">
      <span>Página <strong>{page + 1}</strong> de {pages}</span>
      <div><button type="button" disabled={page === 0 || query.isPlaceholderData} onClick={() => setPage(page - 1)}>Anterior</button>
      <button type="button" disabled={page + 1 >= pages || query.isPlaceholderData} onClick={() => setPage(page + 1)}>Próxima</button></div>
    </nav>}
  </section>;
}

function SaleRow({ record, expanded, onToggle, onViewSale, scrollContainer, ...rest }: CommercialSalesOrdersSectionProps & {
  record: SaleOrderSummary; expanded: boolean; onToggle: () => void;
}) {
  const detailId = `cso-detail-${record.recordId}`;
  const hasCancellation = record.cancelledCount > 0;
  const name = record.buyerTradeName?.trim() || record.displayName;
  const [editRequested, setEditRequested] = useState(false);
  const canEdit = rest.canManageSales && record.kind === 'ORDER' && record.activeCount > 0;
  return <article className={`cso-row ${expanded ? 'is-expanded' : ''}`}>
    <div className="cso-row-main">
      <button type="button" className="cso-toggle" aria-label={`Detalhes de ${name} · ${record.reference}`} aria-expanded={expanded} aria-controls={detailId} onClick={onToggle}>
        <ChevronDown aria-hidden="true" />
        <span className="cso-identity"><span className="cso-name">{name}</span>
          <span className="cso-reference"><strong>{record.reference}</strong><span>{fmtDate(record.createdAt)}</span>{record.kind === 'LEGACY' && <span>Legado</span>}</span>
        </span>
      </button>
      <dl className="cso-facts">
        <div><dt>Espaços ativos</dt><dd>{record.activeCount}<span>{hasCancellation ? ` · ${record.cancelledCount} cancelado(s)` : ''}</span></dd></div>
        <div><dt>Pagamento</dt><dd>{record.kind === 'LEGACY' ? '—' : paymentMethodLabel(record.paymentMethod)}{record.installmentCount && record.installmentCount > 1 ? ` · ${record.installmentCount}x` : ''}</dd></div>
      </dl>
      <div className="cso-value"><span>Valor negociado</span><strong>{formatDashboardCurrency(record.negotiatedTotal)}</strong></div>
      <div className="cso-statusline">
        <span className="cso-registered"><Check aria-hidden="true" />{record.kind === 'LEGACY' ? 'Registro legado' : 'Pedido registrado'}</span>
        {record.kind !== 'LEGACY' && <span className={`cso-signature ${record.pendingCount > 0 ? 'is-wait' : ''}`}>{signatureSummary(record)}</span>}
        <span><FileText aria-hidden="true" />{documentSummary(record)}</span>
        {record.kind === 'ORDER' && <span>{record.paidInstallments > 0
          ? `${record.paidInstallments}${record.installmentCount ? ` de ${record.installmentCount}` : ''} parcela(s) recebida(s)` : 'Sem recebimento registrado'}</span>}
      </div>
      <button type="button" className="cso-view" data-view-sale={record.recordId}
        disabled={record.lotIds.length === 0}
        onClick={() => {
          useSalesOrdersUiStore.getState().rememberOrigin(record.recordId, scrollContainer()?.scrollTop ?? 0);
          onViewSale(record, record.lotIds);
        }}>
        <MapPinned aria-hidden="true" />Ver lotes no mapa
      </button>
      {canEdit && <button type="button" className="cso-view cso-edit-lots" aria-label={`Editar lotes de ${name}`} title="Editar lotes da venda"
        onClick={() => { setEditRequested(true); if (!expanded) onToggle(); }}>
        <Pencil aria-hidden="true" />Editar lotes
      </button>}
    </div>
    {expanded && <div id={detailId} className="cso-detail"><SaleDetail record={record} {...rest} editRequested={editRequested} onEditHandled={() => setEditRequested(false)} onViewSale={onViewSale} scrollContainer={scrollContainer} /></div>}
  </article>;
}

function SaleDetail({ record, data, orgId, canManageContracts, canManageSales, editRequested, onEditHandled }: CommercialSalesOrdersSectionProps & { record: SaleOrderSummary; editRequested?: boolean; onEditHandled?: () => void }) {
  const queryClient = useQueryClient();
  const [reviseOpen, setReviseOpen] = useState(false);
  useLayoutEffect(() => { if (editRequested) { setReviseOpen(true); onEditHandled?.(); } }, [editRequested, onEditHandled]);
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
    const label = item ? (item.displayName || item.publicIdentifier) : (lotIndex.get(lotId)?.displayName ?? 'Espaço');
    return `${label} · ${locationOf(lotId)}`;
  };
  const activeItems = d.items.filter((i) => i.contractState !== 'CANCELLED');
  const activeSubtotal = activeItems.reduce((sum, i) => sum + (i.itemTotal ?? 0), 0);
  const hasCancelled = activeItems.length !== d.items.length;
  const contracts = d.contracts ? uniqueContracts(d.contracts) : null;
  const groupedItems = new Map<string, typeof d.items>();
  d.items.forEach((item) => {
    const location = locationOf(item.lotId);
    const group = groupedItems.get(location) ?? [];
    group.push(item);
    groupedItems.set(location, group);
  });

  return <div className="cso-detail-grid">
    <section className="cso-block cso-span">
      <div className="cso-block-head">
        <h3>Espaços <span className="cso-count">{d.items.length}</span></h3>
        {canManageSales && h.kind === 'ORDER' && h.orderId && activeItems.length > 0 && <button type="button" className="cso-view cso-edit-lots" onClick={() => setReviseOpen(true)}>
          <Pencil aria-hidden="true" />Editar lotes</button>}
      </div>
      {Array.from(groupedItems, ([location, items]) => <div className="cso-space-group" key={location}>
      <h4>{location}<span>{items.length} {items.length === 1 ? 'espaço' : 'espaços'}</span></h4>
      <ul className="cso-items">
        {items.map((item) => <li key={item.itemId ?? item.lotId} className={item.contractState === 'CANCELLED' ? 'is-cancelled' : ''}>
          <span className="cso-strong">{item.displayName || item.publicIdentifier}</span>
          <span className="cso-item-area" aria-label={`Área: ${fmtArea(item.areaSnapshot)}`}>{fmtArea(item.areaSnapshot)}</span>
          <span className="cso-item-value" aria-label={`Valor registrado: ${formatDashboardCurrency(item.itemTotal)}`}>{formatDashboardCurrency(item.itemTotal)}</span>
          <span className={`cso-item-state ${item.contractState === 'PENDING_SIGNATURE' ? 'is-wait' : ''}`}>{ITEM_STATE_LABEL[item.contractState] ?? item.contractState}</span>
        </li>)}
      </ul>
      </div>)}
    </section>

    <section className="cso-block">
      <h3>Valores e taxas</h3>
      {h.kind === 'ORDER' ? <dl className="cso-kv">
        <div><dt>Subtotal original dos espaços</dt><dd>{formatDashboardCurrency(h.spacesSubtotal == null ? null : Number(h.spacesSubtotal))}</dd></div>
        <div><dt>Taxa administrativa</dt><dd>{formatDashboardCurrency(Number(h.feeAdmin ?? 0))}</dd></div>
        <div><dt>PPCI</dt><dd>{formatDashboardCurrency(Number(h.feePpci ?? 0))}</dd></div>
        <div><dt>Limpeza / licença</dt><dd>{formatDashboardCurrency(Number(h.feeCleaning ?? 0))}</dd></div>
        <div className="is-total"><dt>Total registrado</dt><dd>{formatDashboardCurrency(h.negotiatedTotal == null ? null : Number(h.negotiatedTotal))}</dd></div>
        {hasCancelled && <div><dt>Subtotal dos espaços ativos</dt><dd>{formatDashboardCurrency(activeSubtotal)}</dd></div>}
      </dl> : <dl className="cso-kv">
        <div className="is-total"><dt>Valor negociado (legado)</dt><dd>{formatDashboardCurrency(h.negotiatedTotal == null ? null : Number(h.negotiatedTotal))}</dd></div>
        <div><dt>Data da venda</dt><dd>{fmtDate(h.saleDate)}</dd></div>
      </dl>}
      {hasCancelled && <p className="cso-note">Espaços cancelados ficam no histórico; use “Editar lotes” para trocar ou retirar espaços com recálculo.</p>}
    </section>

    <section className="cso-block">
      <h3>Parcelas e recebimentos</h3>
      {h.kind === 'ORDER' ? <>
        <p className="cso-payment-method">{paymentMethodLabel(h.paymentMethod)} · {d.installments.length} parcela(s)</p>
        {d.installments.length > 0 && <div className="cso-installments-head" aria-hidden="true"><span>Nº</span><span>Vencimento</span><span>Valor</span><span>Situação</span></div>}
        <ol className="cso-installments">
          {d.installments.map((n) => <li key={n.number}>
            <span>{n.number}ª</span><span>{fmtDate(n.dueDate)}</span><span>{formatDashboardCurrency(n.amount)}</span>
            <span className={`cso-payment-state ${n.paidAt || n.paymentStatus === 'PAID' ? 'is-paid' : ''}`}>{n.paidAt || n.paymentStatus === 'PAID' ? 'Recebida' : 'Pendente'}</span>
          </li>)}
        </ol>
        {d.installments.length === 0 && <p className="cso-note">Nenhuma parcela registrada neste pedido.</p>}
      </> : <p>Situação registrada: {h.paymentStatus ?? '—'} (venda legada sem parcelas)</p>}
    </section>

    <section className="cso-block cso-span">
      <div className="cso-block-head">
        <h3>Contratos {contracts && <span className="cso-count">{contracts.length}</span>}</h3>
        {canManageContracts && h.kind === 'ORDER' && orgId && <button type="button" className="cso-view" onClick={() => setAttachOpen({ contract: null })}>
          <Paperclip aria-hidden="true" />Anexar contrato</button>}
      </div>
      {contracts === null ? <p className="cso-state"><ShieldAlert aria-hidden="true" />Consulta de documentos restrita ao seu perfil.</p>
        : contracts.length === 0 ? <p className="cso-state">Sem arquivo anexado.</p>
          : <ul className="cso-docs">{contracts.map((c) => <ContractRow key={c.contractId} contract={c} labelOf={labelOf}
            canReplace={canManageContracts && c.scope === 'ORDER_ITEMS'} onReplace={() => setAttachOpen({ contract: c })} />)}</ul>}
      <p className="cso-note">Arquivo anexado não comprova assinatura ou recebimento.</p>
    </section>

    {h.kind === 'ORDER' && h.orderId && canManageSales && <SaleRevisions orderId={h.orderId} />}

    <details className="cso-exhibitor cso-span">
      <summary>Dados do expositor e da venda<ChevronDown aria-hidden="true" /></summary>
      <dl className="cso-exhibitor-data">
        <div><dt>Expositor</dt><dd>{h.buyerTradeName?.trim() || h.buyerName || '—'}</dd></div>
        {h.buyerTradeName?.trim() && <div><dt>Razão social</dt><dd>{h.buyerName || '—'}</dd></div>}
        {h.documentNumber && <div><dt>Documento</dt><dd>{h.documentNumber}</dd></div>}
        {h.email && <div><dt>E-mail</dt><dd>{h.email}</dd></div>}
        {h.phone && <div><dt>Telefone</dt><dd>{h.phone}</dd></div>}
        <div><dt>Referência</dt><dd>{record.reference}</dd></div>
        <div><dt>Data do registro</dt><dd>{fmtDate(record.createdAt)}</dd></div>
      </dl>
    </details>

    {reviseOpen && h.orderId && <ReviseSaleOrderDialog
      orderId={h.orderId}
      detail={d}
      lots={data.lots}
      locationOf={locationOf}
      onClose={() => setReviseOpen(false)}
      onSaved={async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['commercial-sale-order-detail'] }),
          queryClient.invalidateQueries({ queryKey: ['commercial-sale-orders'] }),
          queryClient.invalidateQueries({ queryKey: ['commercial-map'] }),
        ]);
      }}
    />}
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
    <FileText className="cso-doc-icon" aria-hidden="true" />
    <div className="cso-doc-body">
      <h4>{active?.originalName || (contract.contractNumber ? `Contrato ${contract.contractNumber}` : 'Contrato sem número')}</h4>
      <p className="cso-doc-meta">
        <span>{contract.contractNumber ? `Contrato ${contract.contractNumber}` : 'Sem número'}</span>
        <span>{contract.scope === 'ORDER_ITEMS' ? 'Documento da venda' : 'Documento do lote'}</span>
        {active && <><strong>Versão {active.version}</strong><span>{fmtDate(active.uploadedAt)}</span></>}
      </p>
      <div className="cso-doc-coverage"><span>Abrangência · {contract.lotIds.length} {contract.lotIds.length === 1 ? 'espaço' : 'espaços'}</span>
        {contract.lotIds.length > 0 ? <ul>{contract.lotIds.map((lotId) => <li key={lotId}>{labelOf(lotId)}</li>)}</ul> : <p>—</p>}
      </div>
      {!active && <p>Sem arquivo anexado</p>}
      {contract.versions.length > 1 && <details><summary>Histórico ({contract.versions.length} versões)</summary>
        <ul>{contract.versions.map((v) => <li key={v.id}><button type="button" className="cso-link" disabled={opening} onClick={() => open(v.storagePath)}>v{v.version} · {v.originalName}</button><span>{fmtDate(v.uploadedAt)}{v.id === active?.id ? ' · Atual' : ''}</span></li>)}</ul>
      </details>}
      {error && <p className="cso-note is-error" role="alert">{error}</p>}
    </div>
    <div className="cso-doc-actions">
      {active && <button type="button" className="cso-secondary" disabled={opening} onClick={() => open(active.storagePath)}>{opening ? 'Abrindo…' : 'Abrir contrato'}</button>}
      {canReplace && <button type="button" className="cso-link" onClick={onReplace}>Nova versão</button>}
    </div>
  </li>;
}


function SaleRevisions({ orderId }: { orderId: string }) {
  const q = useQuery({ queryKey: ['commercial-sale-order-revisions', orderId], queryFn: () => fetchSaleOrderRevisions(orderId), staleTime: 30_000 });
  const revisions = q.data?.revisions ?? [];
  if (q.isLoading || revisions.length === 0) return null;
  const lots = (v?: string[]) => (v ?? []).map((x) => x.replace(/^B5-M0*/, '')).join(', ');
  return <section className="cso-block cso-span">
    <h3>Alterações da venda <span className="cso-count">{revisions.length}</span></h3>
    <ul className="cso-revisions">{revisions.map((r) => <li key={r.id}>
      <strong>{r.reason}</strong>
      <span>Espaços: {lots(r.before.lots)} → {lots(r.after.lots)}</span>
      <span>Total: {formatDashboardCurrency(Number(r.before.negotiated_total ?? 0))} → {formatDashboardCurrency(Number(r.after.negotiated_total ?? 0))}</span>
      <small>{[r.actorName, new Date(r.createdAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })].filter(Boolean).join(' · ')}</small>
    </li>)}</ul>
  </section>;
}
