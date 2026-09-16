import { create } from 'zustand';
import type { SalesSelectionEntry, SalesStage } from './salesTypes';

interface SalesState {
  salesModeActive: boolean;
  stage: SalesStage;
  /** Ordem de inclusão preservada; chave = lotId (nunca duplica). */
  selection: SalesSelectionEntry[];
  /** Conjunto vendável decidido pelo servidor (view commercial_sale_eligibility). */
  eligibleLotIds: ReadonlySet<string> | null;
  checkoutOpen: boolean;
  openSalesMode: () => void;
  closeSalesMode: () => void;
  toggleSalesMode: () => void;
  setStage: (stage: SalesStage) => void;
  toggleLot: (entry: SalesSelectionEntry) => void;
  addLot: (entry: SalesSelectionEntry) => void;
  removeLot: (lotId: string) => void;
  clearSelection: () => void;
  setEligibleLotIds: (ids: ReadonlySet<string> | null) => void;
  setCheckoutOpen: (open: boolean) => void;
  isSelected: (lotId: string) => boolean;
}

export const useSalesStore = create<SalesState>((set, get) => ({
  salesModeActive: false,
  stage: 'RENOVACAO',
  selection: [],
  eligibleLotIds: null,
  checkoutOpen: false,
  openSalesMode: () => set({ salesModeActive: true }),
  closeSalesMode: () => set({ salesModeActive: false, selection: [], checkoutOpen: false }),
  toggleSalesMode: () => (get().salesModeActive ? get().closeSalesMode() : get().openSalesMode()),
  // Trocar de etapa nunca perde a seleção: apenas os valores são recalculados.
  setStage: (stage) => set({ stage }),
  toggleLot: (entry) => set((state) => (
    state.selection.some((item) => item.lotId === entry.lotId)
      ? { selection: state.selection.filter((item) => item.lotId !== entry.lotId) }
      : { selection: [...state.selection, entry] }
  )),
  addLot: (entry) => set((state) => (
    state.selection.some((item) => item.lotId === entry.lotId)
      ? state
      : { selection: [...state.selection, entry] }
  )),
  removeLot: (lotId) => set((state) => ({ selection: state.selection.filter((item) => item.lotId !== lotId) })),
  clearSelection: () => set({ selection: [] }),
  setEligibleLotIds: (eligibleLotIds) => set({ eligibleLotIds }),
  setCheckoutOpen: (checkoutOpen) => set({ checkoutOpen }),
  isSelected: (lotId) => get().selection.some((item) => item.lotId === lotId),
}));

export function useSalesSelectionCount() {
  return useSalesStore((state) => state.selection.length);
}

/** Ids selecionados para realce no canvas, sem recriar Set a cada render. */
export function useSalesSelectedLotIds(): ReadonlySet<string> {
  return useSalesStore((state) => selectedIdsCache(state.selection));
}

let cacheSource: SalesSelectionEntry[] | null = null;
let cacheValue: ReadonlySet<string> = new Set();

function selectedIdsCache(selection: SalesSelectionEntry[]): ReadonlySet<string> {
  if (cacheSource !== selection) {
    cacheSource = selection;
    cacheValue = new Set(selection.map((item) => item.lotId));
  }
  return cacheValue;
}
