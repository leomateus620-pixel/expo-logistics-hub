import type { CommercialLot } from '../types';
import type { SalesSelectionEntry } from './salesTypes';

export const SELLABLE_STATUSES = ['AVAILABLE', 'RESERVED', 'IN_NEGOTIATION'] as const;

export function isSellableLot(lot: CommercialLot | null | undefined): boolean {
  return Boolean(
    lot
    && !lot.id.startsWith('reference:')
    && !lot.archivedAt
    && (SELLABLE_STATUSES as readonly string[]).includes(lot.status),
  );
}

export function toSalesEntry(lot: CommercialLot, context?: string | null): SalesSelectionEntry {
  return {
    lotId: lot.id,
    publicIdentifier: lot.publicIdentifier,
    displayName: lot.displayName || lot.publicIdentifier,
    context: context ?? lot.block ?? null,
  };
}
