import { useCallback, useLayoutEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Search, ShieldAlert } from 'lucide-react';
import type { CommercialMapData } from '../../types';
import { describeSalesError, EMPTY_SALE_FILTERS, fetchSaleOrdersPage, SALE_ORDERS_PAGE_SIZE, type SaleOrderSummary } from './salesOrdersService';
import { useSalesOrdersUiStore } from './useSalesOrdersUiStore';
import { SaleOrderCard } from './SaleOrderCard';
import { SaleOrderDetail } from './SaleOrderDetail';
import { SalesOrdersFilters } from './SalesOrdersFilters';

export { signatureSummary } from './salesOrdersPresentation';

export interface CommercialSalesOrdersSectionProps {
  projectId: string;
  orgId: string | null;
  canManageSales: boolean;
  canManageContracts: boolean;
  data: Pick<CommercialMapData, 'entities' | 'lots'>;
  scrollContainer: () => HTMLElement | null;
  onViewSale: (record: SaleOrderSummary, lotIds: string[]) => void;
  onBack?: () => void;
}

export function CommercialSalesOrdersSection(props: CommercialSalesOrdersSectionProps) {
  const { projectId, canManageSales, scrollContainer, onBack } = props;
  const { scopeProjectId, filters: storedFilters, page: storedPage, expandedRecordId: storedExpanded,
    selectedRecordIdentity, ensureProjectScope, setSelectedRecordIdentity, setPage, setExpanded, resetFilters } = useSalesOrdersUiStore();
  // Bloqueia a identidade anterior durante o próprio render, antes que qualquer RPC de detalhe monte.
  const sameProject = scopeProjectId === null || scopeProjectId === projectId;
  const expandedRecordId = sameProject ? storedExpanded : null;
  const filters = sameProject ? storedFilters : EMPTY_SALE_FILTERS;
  const page = sameProject ? storedPage : 0;
  const sectionRef = useRef<HTMLElement>(null);
  const initialScrollRestored = useRef(false);
  const pendingCardFocus = useRef<string | null>(null);
  const pendingDetailFocus = useRef(false);
  useLayoutEffect(() => {
    if (scopeProjectId === projectId) return;
    if (scopeProjectId !== null) {
      initialScrollRestored.current = false;
      pendingCardFocus.current = null;
      pendingDetailFocus.current = false;
    }
    ensureProjectScope(projectId);
  }, [scopeProjectId, projectId, ensureProjectScope]);
  const query = useQuery({
    queryKey: ['commercial-sale-orders', projectId, filters, page],
    queryFn: () => fetchSaleOrdersPage(projectId, filters, page),
    enabled: canManageSales && Boolean(projectId) && !expandedRecordId,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === projectId ? previous : undefined,
    staleTime: 30_000,
    retry: (count, error) => !describeSalesError(error).includes('permissão') && count < 2,
  });
  const selected = query.data?.rows.find((row) => row.recordId === expandedRecordId);
  const selectedRecord = sameProject ? selected ?? (selectedRecordIdentity?.recordId === expandedRecordId ? selectedRecordIdentity : null) : null;
  const errorText = query.error ? describeSalesError(query.error) : null;
  const restricted = errorText?.includes('permissão');

  useLayoutEffect(() => {
    if (!useSalesOrdersUiStore.getState().originRecordId) sectionRef.current?.querySelector<HTMLElement>('[data-sales-workspace-heading]')?.focus({ preventScroll: true });
  }, []);

  const detailReady = useCallback(() => {
    const state = useSalesOrdersUiStore.getState();
    if (initialScrollRestored.current && !state.originRecordId && !pendingDetailFocus.current) return;
    initialScrollRestored.current = true;
    const origin = state.originRecordId ? state.consumeOrigin() : null;
    const container = scrollContainer();
    if (container) container.scrollTop = origin?.scrollTop ?? state.detailScrollTop;
    if (origin?.recordId) {
      window.requestAnimationFrame(() => sectionRef.current?.querySelector<HTMLButtonElement>(`[data-view-sale="${CSS.escape(origin.recordId!)}"]`)?.focus({ preventScroll: true }));
    } else if (pendingDetailFocus.current) {
      pendingDetailFocus.current = false;
      sectionRef.current?.querySelector<HTMLElement>('.cso-detail-summary h3')?.focus({ preventScroll: true });
    }
  }, [scrollContainer]);

  useLayoutEffect(() => {
    if (expandedRecordId || !query.data || errorText) return;
    if (initialScrollRestored.current && !pendingCardFocus.current) return;
    initialScrollRestored.current = true;
    const container = scrollContainer();
    if (container) container.scrollTop = useSalesOrdersUiStore.getState().listScrollTop;
    const focusId = pendingCardFocus.current;
    pendingCardFocus.current = null;
    if (focusId) window.requestAnimationFrame(() => sectionRef.current?.querySelector<HTMLButtonElement>(`[data-open-sale="${CSS.escape(focusId)}"]`)?.focus({ preventScroll: true }));
  }, [expandedRecordId, query.data, errorText, scrollContainer]);

  const backToList = () => {
    useSalesOrdersUiStore.getState().rememberDetailScroll(scrollContainer()?.scrollTop ?? 0);
    pendingCardFocus.current = expandedRecordId;
    setExpanded(null);
  };
  const backToOverview = () => {
    const state = useSalesOrdersUiStore.getState();
    if (expandedRecordId) state.rememberDetailScroll(scrollContainer()?.scrollTop ?? 0);
    else state.rememberListScroll(scrollContainer()?.scrollTop ?? 0);
    onBack?.();
  };
  const openRecord = (record: SaleOrderSummary) => {
    useSalesOrdersUiStore.getState().rememberListScroll(scrollContainer()?.scrollTop ?? 0);
    setSelectedRecordIdentity(record);
    pendingDetailFocus.current = true;
    setExpanded(record.recordId);
  };
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / SALE_ORDERS_PAGE_SIZE));
  const hasFilters = Object.values(filters).some(Boolean);

  return <section className="cso-section" aria-labelledby="cso-title" ref={sectionRef}>
    <header className="cso-header">
      <div className="cso-heading-group">
        {(expandedRecordId || onBack) && <button type="button" className="cso-back" aria-label={expandedRecordId ? 'Voltar às vendas' : 'Voltar à visão geral'} onClick={expandedRecordId ? backToList : backToOverview}><ArrowLeft aria-hidden="true" />{expandedRecordId ? 'Voltar às vendas' : 'Visão geral'}</button>}
        <h2 id="cso-title" className="cso-title" tabIndex={-1} data-sales-workspace-heading>Vendas e contratos</h2>
      </div>
      <span className="cso-result-count" role="status">{canManageSales && query.isFetching && <Loader2 className="is-spinning" aria-label="Atualizando" />}{canManageSales && query.data && !errorText && !expandedRecordId && <><strong>{total}</strong> {total === 1 ? 'registro' : 'registros'}</>}</span>
    </header>
    {!canManageSales ? <p className="cso-state"><ShieldAlert aria-hidden="true" />Acesso restrito: consultar vendas exige a permissão de gestão de vendas.</p>
      : <>
        {!expandedRecordId && <><SalesOrdersFilters /><div className="cso-list-caption"><span>Pedidos individuais e registros legados</span><span>Valores negociados · não representam recebimentos</span></div></>}
        {query.isLoading && <p className="cso-state" role="status"><Loader2 className="is-spinning" aria-hidden="true" />Carregando vendas…</p>}
        {errorText && <p className="cso-state is-error" role="alert"><ShieldAlert aria-hidden="true" />{restricted ? 'Acesso restrito às vendas desta organização.' : errorText}{!restricted && <button type="button" className="cso-link" onClick={() => query.refetch()}>Tentar novamente</button>}</p>}
        {!errorText && expandedRecordId && selectedRecord && <SaleOrderDetail key={selectedRecord.recordId} record={selectedRecord} {...props} onReady={detailReady} />}
        {!query.isLoading && !errorText && expandedRecordId && !selectedRecord && <p className="cso-state">Este registro não está na página atual. Volte às vendas para atualizar a seleção.</p>}
        {!expandedRecordId && !query.isLoading && !errorText && query.data?.rows.length === 0 && <div className="cso-state cso-empty" role="status"><Search aria-hidden="true" /><div><strong>Nenhuma venda encontrada</strong><p>{hasFilters ? 'Ajuste a busca ou remova os filtros para ver mais registros.' : 'Os pedidos registrados aparecerão aqui.'}</p></div>{hasFilters && <button type="button" className="cso-link" onClick={resetFilters}>Limpar filtros</button>}</div>}
        {!errorText && !expandedRecordId && <div className="cso-list" aria-busy={query.isFetching}>{query.data?.rows.map((record) => <SaleOrderCard key={record.recordId} record={record} onOpen={() => openRecord(record)} />)}</div>}
        {!errorText && !expandedRecordId && total > SALE_ORDERS_PAGE_SIZE && <nav className="cso-pager" aria-label="Páginas de vendas"><span>Página <strong>{page + 1}</strong> de {pages}</span><div>
          <button type="button" disabled={page === 0 || query.isPlaceholderData} onClick={() => { setPage(page - 1); useSalesOrdersUiStore.getState().rememberListScroll(0); const container = scrollContainer(); if (container) container.scrollTop = 0; }}>Anterior</button>
          <button type="button" disabled={page + 1 >= pages || query.isPlaceholderData} onClick={() => { setPage(page + 1); useSalesOrdersUiStore.getState().rememberListScroll(0); const container = scrollContainer(); if (container) container.scrollTop = 0; }}>Próxima</button>
        </div></nav>}
      </>}
  </section>;
}
