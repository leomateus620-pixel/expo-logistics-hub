import type { CommercialLot } from '../types';
import type { SalesSelectionEntry } from './salesTypes';

/**
 * Elegibilidade comercial é decidida no servidor pela view
 * `commercial_sale_eligibility` (área oficial, preço 2028 resolvido, Pavilhão 7
 * fora, sem venda/reserva/negociação/contrato e bloqueio apenas técnico).
 * O cliente só espelha esse conjunto; nunca inventa regra de status.
 */
export function isSellableLot(
  lot: CommercialLot | null | undefined,
  eligibleLotIds?: ReadonlySet<string> | null,
): boolean {
  if (!lot || lot.id.startsWith('reference:') || lot.archivedAt) return false;
  if (!eligibleLotIds) return false;
  return eligibleLotIds.has(lot.id);
}

export function toSalesEntry(lot: CommercialLot, context?: string | null): SalesSelectionEntry {
  return {
    lotId: lot.id,
    publicIdentifier: lot.publicIdentifier,
    displayName: lot.displayName || lot.publicIdentifier,
    context: context ?? lot.block ?? null,
  };
}
