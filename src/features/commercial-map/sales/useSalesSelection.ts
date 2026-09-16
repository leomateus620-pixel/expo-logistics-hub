import { create } from 'zustand';
import type { SalesSelectionEntry, SalesStage } from './salesTypes';

interface SalesState {
  salesModeActive: boolean;
  stage: SalesStage;
  /** Ordem de inclusão preservada; chave = lotId (nunca duplica). */
  selection: SalesSelectionEntry[];
  checkoutOpen: boolean;
  openSalesMode: () => void;
  closeSalesMode: () => void;
  toggleSalesMode: () => void;
  setStage: (stage: SalesStage) => void;
  toggleLot: (entry: SalesSelectionEntry) => void;
  addLot: (entry: SalesSelectionEntry) => void;
  removeLot: (lotId: string) => void;
  clearSelection: () => void;
  setCheckoutOpen: (open: boolean) => void;
  isSelected: (lotId: string) => boolean;
}

export const useSalesStore = create<SalesState>((set, get) => ({
  salesModeActive: false,
  stage: 'RENOVACAO',
  selection: [],
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
  setCheckoutOpen: (checkoutOpen) => set({ checkoutOpen }),
  isSelected: (lotId) => get().selection.some((item) => item.lotId === lotId),
}));

export function useSalesSelectionCount() {
  return useSalesStore((state) => state.selection.length);
}
