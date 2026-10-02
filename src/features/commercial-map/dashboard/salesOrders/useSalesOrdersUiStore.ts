import { create } from 'zustand';
import { EMPTY_SALE_FILTERS, type SaleOrdersFilters } from './salesOrdersService';

/** Contexto da lista que sobrevive ao fechamento da dashboard (ida ao mapa e volta). */
interface SalesOrdersUiState {
  filters: SaleOrdersFilters;
  page: number;
  expandedRecordId: string | null;
  filtersOpen: boolean;
  scrollTop: number;
  originRecordId: string | null;
  setFilters: (patch: Partial<SaleOrdersFilters>) => void;
  resetFilters: () => void;
  setPage: (page: number) => void;
  setExpanded: (recordId: string | null) => void;
  setFiltersOpen: (open: boolean) => void;
  rememberOrigin: (recordId: string, scrollTop: number) => void;
  consumeOrigin: () => { recordId: string | null; scrollTop: number };
}

export const useSalesOrdersUiStore = create<SalesOrdersUiState>((set, get) => ({
  filters: EMPTY_SALE_FILTERS,
  page: 0,
  expandedRecordId: null,
  filtersOpen: false,
  scrollTop: 0,
  originRecordId: null,
  setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch }, page: 0 })),
  resetFilters: () => set({ filters: EMPTY_SALE_FILTERS, page: 0 }),
  setPage: (page) => set({ page: Math.max(0, page) }),
  setExpanded: (expandedRecordId) => set({ expandedRecordId }),
  setFiltersOpen: (filtersOpen) => set({ filtersOpen }),
  rememberOrigin: (originRecordId, scrollTop) => set({ originRecordId, scrollTop }),
  consumeOrigin: () => {
    const { originRecordId, scrollTop } = get();
    set({ originRecordId: null });
    return { recordId: originRecordId, scrollTop };
  },
}));
