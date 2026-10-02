import { create } from 'zustand';

/**
 * Inspeção de uma venda inteira no mapa. Independente do carrinho de vendas:
 * não altera seleção comercial, disponibilidade nem dados.
 */
export interface SaleInspectionContext {
  recordId: string;
  reference: string;
  displayName: string;
  lotIds: string[];
}

interface SaleInspectionState {
  context: SaleInspectionContext | null;
  lotIdSet: ReadonlySet<string>;
  /** Entidades externas (lotes + pavilhões) a enquadrar na visão geral; vazio = sem enquadramento. */
  frameEntityIds: ReadonlySet<string>;
  frameSequence: number;
  start: (context: SaleInspectionContext) => void;
  frame: (entityIds: readonly string[]) => void;
  clear: () => void;
}

const EMPTY: ReadonlySet<string> = new Set();

export const useSaleInspectionStore = create<SaleInspectionState>((set) => ({
  context: null,
  lotIdSet: EMPTY,
  frameEntityIds: EMPTY,
  frameSequence: 0,
  start: (context) => set({ context, lotIdSet: new Set(context.lotIds), frameEntityIds: EMPTY }),
  frame: (entityIds) => set((state) => ({ frameEntityIds: new Set(entityIds), frameSequence: state.frameSequence + 1 })),
  clear: () => set({ context: null, lotIdSet: EMPTY, frameEntityIds: EMPTY }),
}));
