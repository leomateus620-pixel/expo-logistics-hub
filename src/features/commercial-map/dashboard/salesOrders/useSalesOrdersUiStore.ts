import { create } from 'zustand';
import { EMPTY_SALE_FILTERS, type SaleOrdersFilters, type SaleOrderSummary } from './salesOrdersService';

export type SalesOrdersDetailTab = 'overview' | 'spaces' | 'finance' | 'contracts' | 'history';
export type SalesOrdersRecordIdentity = Pick<SaleOrderSummary, 'recordId' | 'orderId' | 'saleId'>;

/** Só estado de apresentação: nenhum valor comercial é persistido nesta store. */
interface SalesOrdersUiState {
  scopeProjectId: string | null;
  area: 'overview' | 'sales';
  filters: SaleOrdersFilters;
  page: number;
  expandedRecordId: string | null;
  selectedRecordIdentity: SalesOrdersRecordIdentity | null;
  filtersOpen: boolean;
  searchOpen: boolean;
  detailTab: SalesOrdersDetailTab;
  listScrollTop: number;
  detailScrollTop: number;
  scrollTop: number;
  originRecordId: string | null;
  setFilters: (patch: Partial<SaleOrdersFilters>) => void;
  setArea: (area: 'overview' | 'sales') => void;
  resetFilters: () => void;
  setPage: (page: number) => void;
  setExpanded: (recordId: string | null) => void;
  setSelectedRecordIdentity: (record: SalesOrdersRecordIdentity) => void;
  ensureProjectScope: (projectId: string) => void;
  setFiltersOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setDetailTab: (tab: SalesOrdersDetailTab) => void;
  rememberListScroll: (scrollTop: number) => void;
  rememberDetailScroll: (scrollTop: number) => void;
  rememberOrigin: (recordId: string, scrollTop: number) => void;
  consumeOrigin: () => { recordId: string | null; scrollTop: number };
}

export const useSalesOrdersUiStore = create<SalesOrdersUiState>((set, get) => ({
  scopeProjectId: null,
  area: 'overview',
  filters: EMPTY_SALE_FILTERS,
  page: 0,
  expandedRecordId: null,
  selectedRecordIdentity: null,
  filtersOpen: false,
  searchOpen: false,
  detailTab: 'overview',
  listScrollTop: 0,
  detailScrollTop: 0,
  scrollTop: 0,
  originRecordId: null,
  setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch }, page: 0 })),
  setArea: (area) => set({ area }),
  resetFilters: () => set({ filters: EMPTY_SALE_FILTERS, page: 0 }),
  setPage: (page) => set({ page: Math.max(0, page) }),
  setExpanded: (expandedRecordId) => set((state) => ({
    expandedRecordId,
    ...(expandedRecordId && expandedRecordId !== state.expandedRecordId ? { detailTab: 'overview' as const, detailScrollTop: 0 } : {}),
  })),
  setSelectedRecordIdentity: ({ recordId, orderId, saleId }) => set({ selectedRecordIdentity: { recordId, orderId, saleId } }),
  ensureProjectScope: (scopeProjectId) => {
    const previousScope = get().scopeProjectId;
    if (previousScope === scopeProjectId) return;
    // Primeiro vínculo conserva o contexto da sessão; só uma troca conhecida limpa a interface.
    if (previousScope === null) { set({ scopeProjectId }); return; }
    set({ scopeProjectId, filters: EMPTY_SALE_FILTERS, page: 0, expandedRecordId: null,
      selectedRecordIdentity: null, filtersOpen: false, searchOpen: false, detailTab: 'overview',
      listScrollTop: 0, detailScrollTop: 0, scrollTop: 0, originRecordId: null });
  },
  setFiltersOpen: (filtersOpen) => set({ filtersOpen }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setDetailTab: (detailTab) => set({ detailTab }),
  rememberListScroll: (listScrollTop) => set({ listScrollTop }),
  rememberDetailScroll: (detailScrollTop) => set({ detailScrollTop }),
  rememberOrigin: (originRecordId, scrollTop) => set({ originRecordId, scrollTop, detailScrollTop: scrollTop, area: 'sales' }),
  consumeOrigin: () => {
    const { originRecordId, scrollTop } = get();
    set({ originRecordId: null });
    return { recordId: originRecordId, scrollTop };
  },
}));
