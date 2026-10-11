import { useEffect, useRef, useState, type FormEvent } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { paymentMethodLabel, SALES_PAYMENT_METHODS, SALES_PAYMENT_METHOD_LABELS } from '../../sales/salesTypes';
import type { SaleOrdersFilters } from './salesOrdersService';
import { useSalesOrdersUiStore } from './useSalesOrdersUiStore';
import { fmtSaleDate } from './salesOrdersPresentation';

const STATUS_FILTER_LABELS = {
  PENDING: 'Aguardando assinatura', PARTIAL: 'Parcialmente assinada', SIGNED: 'Assinatura confirmada',
  CANCELLED_PARTIAL: 'Com cancelamento', LEGACY: 'Legado',
};
const FILTER_REMOVE_LABELS: Record<keyof SaleOrdersFilters, string> = {
  search: 'Remover busca', status: 'Remover filtro de situação', hasDocument: 'Remover filtro de documento',
  paymentMethod: 'Remover filtro de pagamento', from: 'Remover data inicial', to: 'Remover data final',
};

function saleFilterLabel(key: keyof SaleOrdersFilters, value: string) {
  if (key === 'status') return STATUS_FILTER_LABELS[value as keyof typeof STATUS_FILTER_LABELS];
  if (key === 'hasDocument') return value === 'yes' ? 'Com arquivo anexado' : 'Sem arquivo anexado';
  if (key === 'paymentMethod') return paymentMethodLabel(value);
  if (key === 'from' || key === 'to') return `${key === 'from' ? 'De' : 'Até'} ${fmtSaleDate(value)}`;
  return `Busca: ${value}`;
}

export function SalesOrdersFilters() {
  const { filters, filtersOpen, searchOpen, setFiltersOpen, setSearchOpen, setFilters, resetFilters } = useSalesOrdersUiStore(useShallow((state) => ({
    filters: state.filters, filtersOpen: state.filtersOpen, searchOpen: state.searchOpen,
    setFiltersOpen: state.setFiltersOpen, setSearchOpen: state.setSearchOpen,
    setFilters: state.setFilters, resetFilters: state.resetFilters,
  })));
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { setSearchDraft(filters.search); }, [filters.search]);
  const activeFilters = (Object.entries(filters) as [keyof SaleOrdersFilters, string][]).filter(([, value]) => value);
  const advancedCount = activeFilters.filter(([key]) => key !== 'search').length;
  const submitSearch = (event: FormEvent) => { event.preventDefault(); setFilters({ search: searchDraft }); };
  const clear = () => { setSearchDraft(''); resetFilters(); };

  return <div className="cso-filter-bar" ref={rootRef}>
    <div className="cso-filter-controls">
      <button type="button" className="cso-filter-toggle" ref={searchTriggerRef} aria-expanded={searchOpen} aria-controls="cso-search-form" onClick={() => {
        setSearchOpen(!searchOpen);
        if (!searchOpen) window.requestAnimationFrame(() => searchRef.current?.focus());
      }}><Search aria-hidden="true" />Buscar{filters.search && <span className="cso-filter-dot" aria-label="Busca aplicada" />}</button>
      <Popover.Root open={filtersOpen} onOpenChange={setFiltersOpen}>
        <Popover.Trigger asChild><button type="button" className="cso-filter-toggle"><SlidersHorizontal aria-hidden="true" />Filtrar{advancedCount > 0 && <span className="cso-filter-count">{advancedCount}</span>}</button></Popover.Trigger>
        <Popover.Portal container={rootRef.current}>
          <Popover.Content className="cso-filter-popover" align="start" sideOffset={8} aria-label="Filtros de vendas" data-commercial-map-escape-priority="true">
            <header><strong>Filtrar vendas</strong><Popover.Close asChild><button type="button" className="cso-icon-button" aria-label="Fechar filtros"><X aria-hidden="true" /></button></Popover.Close></header>
            <div className="cso-filter-fields">
              <label>Situação<select aria-label="Situação" value={filters.status} onChange={(e) => setFilters({ status: e.target.value as typeof filters.status })}>
                <option value="">Todas as situações</option>
                {Object.entries(STATUS_FILTER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>
              <label>Documentos<select aria-label="Documento" value={filters.hasDocument} onChange={(e) => setFilters({ hasDocument: e.target.value as typeof filters.hasDocument })}>
                <option value="">Com ou sem documento</option><option value="yes">Com arquivo anexado</option><option value="no">Sem arquivo anexado</option>
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
            <footer><button type="button" className="cso-link" onClick={clear}>Limpar filtros</button><Popover.Close asChild><button type="button" className="cso-view">Ver resultados</button></Popover.Close></footer>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {activeFilters.length > 0 && <span className="cso-filter-summary">{activeFilters.length} {activeFilters.length === 1 ? 'critério aplicado' : 'critérios aplicados'}</span>}
    </div>
    {searchOpen && <form id="cso-search-form" className="cso-search" onSubmit={submitSearch} role="search" onKeyDown={(e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setSearchOpen(false); searchTriggerRef.current?.focus(); }
    }}>
      <input ref={searchRef} value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} placeholder="Expositor, referência, contrato ou espaço" aria-label="Pesquisar vendas" />
      <button type="submit" aria-label="Pesquisar"><Search aria-hidden="true" /></button>
    </form>}
    {activeFilters.length > 0 && <div className="cso-active-filters" aria-label="Filtros ativos">
      {activeFilters.map(([key, value]) => <button type="button" key={key} aria-label={`${FILTER_REMOVE_LABELS[key]}: ${saleFilterLabel(key, value)}`}
        onClick={() => { setFilters({ [key]: '' }); if (key === 'search') setSearchDraft(''); }}>
        {saleFilterLabel(key, value)}<X aria-hidden="true" />
      </button>)}
      <button type="button" className="cso-clear-filters" onClick={clear}>Limpar filtros</button>
    </div>}
  </div>;
}
