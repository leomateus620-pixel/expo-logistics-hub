import type { CommercialLot, CommercialStatus, MapEntity } from '../types';
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
  entity?: MapEntity | null,
): boolean {
  const state = useSalesStore.getState();
  if (!state.salesModeActive) return false;
  if (!isSellableLot(lot, state.eligibleLotIds)) return true;
  state.toggleLot(toSalesEntry(lot as CommercialLot, context, entity));
  return true;
}

export function isSalesModeActive(): boolean {
  return useSalesStore.getState().salesModeActive;
}

export interface SalesModuleClickTarget {
  status?: CommercialStatus | null;
  lotId: string | null;
  publicIdentifier: string | null;
  displayName?: string | null;
  context?: string | null;
  number?: string | null;
  area?: string | null;
  location?: string | null;
}

/**
 * Clique de módulo interno do pavilhão em modo Vendas: alterna diretamente no
 * carrinho, sem passar pelo card do módulo.
 */
export function dispatchSalesModuleClick(target: SalesModuleClickTarget | null | undefined): boolean {
  const state = useSalesStore.getState();
  if (!state.salesModeActive) return false;
  const lotId = target?.lotId ?? null;
  if (!lotId || target?.status === 'SOLD' || !state.eligibleLotIds?.has(lotId)) return true;
  const publicIdentifier = target?.publicIdentifier ?? lotId;
  state.toggleLot({
    lotId,
    publicIdentifier,
    displayName: target?.displayName || publicIdentifier,
    context: target?.context ?? null,
    title: target?.number ? `Módulo ${target.number}` : target?.displayName || publicIdentifier,
    location: target?.location ?? null,
    area: target?.area ?? null,
  });
  return true;
}
