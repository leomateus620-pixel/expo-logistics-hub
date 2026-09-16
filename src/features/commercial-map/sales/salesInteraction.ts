import type { CommercialLot } from '../types';
import { isSellableLot, toSalesEntry } from './salesEntry';
import { useSalesStore } from './useSalesSelection';

/**
 * Despachante único do clique em modo Vendas. Retorna `true` quando o clique
 * foi consumido pelo carrinho — nesse caso o mapa NÃO deve selecionar a
 * entidade nem abrir o painel de detalhes padrão.
 */
export function dispatchSalesLotClick(
  lot: CommercialLot | null | undefined,
  context?: string | null,
): boolean {
  const state = useSalesStore.getState();
  if (!state.salesModeActive) return false;
  if (!isSellableLot(lot, state.eligibleLotIds)) return true;
  state.toggleLot(toSalesEntry(lot as CommercialLot, context));
  return true;
}

export function isSalesModeActive(): boolean {
  return useSalesStore.getState().salesModeActive;
}
