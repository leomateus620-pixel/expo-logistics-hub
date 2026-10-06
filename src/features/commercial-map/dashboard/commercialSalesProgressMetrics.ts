import type { DashboardAggregate } from './commercialDashboardTypes';

export interface CommercialSalesProgressData {
  confirmed: number;
  open: number;
  combined: number;
  available: boolean;
  partial: boolean;
}

/** Same cent-based totals as the financial matrix; unavailable amounts never become estimated sales. */
export function commercialSalesProgress(aggregate: DashboardAggregate): CommercialSalesProgressData {
  const totalCents = Math.round(aggregate.totalKnownValue * 100);
  const confirmedCents = Math.round(aggregate.soldValue * 100);
  const openCents = Math.round(aggregate.saleOpenValue * 100);
  const partial = aggregate.knownValueLots < aggregate.commercialLots;
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    return { confirmed: 0, open: 0, combined: 0, available: false, partial };
  }
  const confirmed = Math.min(100, Math.max(0, confirmedCents / totalCents * 100));
  const combined = Math.min(100, Math.max(confirmed, (confirmedCents + Math.max(0, openCents)) / totalCents * 100));
  return { confirmed, open: combined - confirmed, combined, available: true, partial };
}