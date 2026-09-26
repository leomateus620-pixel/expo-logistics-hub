import type { CommercialLot, MapEntity } from '../types';
import type { SalesSelectionEntry } from './salesTypes';
import { resolveLotIdentity } from '../utils/lotIdentity';

/**
 * Elegibilidade comercial é decidida no servidor pela view
 * `commercial_sale_eligibility` (área oficial, preço 2028 resolvido,
 * sem venda/reserva/negociação/contrato e bloqueio apenas técnico).
 * O cliente só espelha esse conjunto; nunca inventa regra de status.
 */
export function isSellableLot(
  lot: CommercialLot | null | undefined,
  eligibleLotIds?: ReadonlySet<string> | null,
): boolean {
  // A map refresh can precede the eligibility refresh after another sale.
  if (!lot || lot.status === 'SOLD' || lot.id.startsWith('reference:') || lot.archivedAt) return false;
  if (!eligibleLotIds) return false;
  return eligibleLotIds.has(lot.id);
}

export function toSalesEntry(lot: CommercialLot, context?: string | null, entity?: MapEntity | null, pavilion?: MapEntity | null): SalesSelectionEntry {
  const identity = resolveLotIdentity(lot, entity, pavilion);
  return {
    lotId: lot.id,
    publicIdentifier: lot.publicIdentifier,
    displayName: lot.displayName || lot.publicIdentifier,
    context: context ?? identity.area ?? identity.location,
    title: identity.title,
    location: identity.location,
    area: identity.area,
  };
}
