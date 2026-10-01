import type { CommercialLotOfficialPricing2028, CommercialLotSale } from '../types';
import type { LotPricingResolution } from './lotPricing2028';

export interface PersistedLotSaleRow {
  id: string;
  lot_id: string;
  status: string;
  negotiated_value: number | string | null;
}

export interface OfficialLotPricing2028Row {
  lot_id: string;
  entity_id: string;
  renovacao_total: number | string | null;
  segunda_total: number | string | null;
  renovacao_is_manual: boolean | null;
  segunda_is_manual: boolean | null;
  resolution_status: string | null;
}

const RESOLUTIONS: readonly LotPricingResolution[] = ['OK', 'SEM_AREA', 'SEM_REGRA', 'REGRA_AMBIGUA', 'EXCLUIDO'];
const SALE_STATUSES: readonly CommercialLotSale['status'][] = ['OPEN', 'CONFIRMED', 'REVERTED'];

/** Normalize persisted numeric values; missing and invalid amounts never become zero. */
function persistedAmount(value: number | string | null | undefined): number | null {
  if (value == null || (typeof value === 'string' && !value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : null;
}

export function normalizeLotSales(lotId: string, rows: readonly PersistedLotSaleRow[] | null | undefined): CommercialLotSale[] {
  const sales = new Map<string, Map<CommercialLotSale['status'], CommercialLotSale>>();
  const conflictingIds = new Set<string>();
  for (const row of rows ?? []) {
    if (!row.id || row.lot_id !== lotId || !SALE_STATUSES.includes(row.status as CommercialLotSale['status'])) continue;
    const sale: CommercialLotSale = {
      id: row.id, lotId, status: row.status as CommercialLotSale['status'], negotiatedValue: persistedAmount(row.negotiated_value),
    };
    const observed = sales.get(sale.id) ?? new Map<CommercialLotSale['status'], CommercialLotSale>();
    const existing = observed.get(sale.status);
    if ((observed.size > 0 && !existing) || (existing && existing.negotiatedValue !== sale.negotiatedValue)) conflictingIds.add(sale.id);
    observed.set(sale.status, sale);
    sales.set(sale.id, observed);
  }
  // Retain every observed status of a conflicting identity, with no usable amount.
  // Dropping it could turn another active sale into an apparently unique value.
  return [...sales.entries()].flatMap(([id, observed]) => [...observed.values()].map((sale) =>
    conflictingIds.has(id) ? { ...sale, negotiatedValue: null } : sale));
}

export function normalizeOfficialLotPricing2028(
  lotId: string,
  entityId: string,
  rows: OfficialLotPricing2028Row | readonly OfficialLotPricing2028Row[] | null | undefined,
): CommercialLotOfficialPricing2028 | null {
  const candidates: readonly OfficialLotPricing2028Row[] = rows == null ? [] : Array.isArray(rows) ? rows : [rows as OfficialLotPricing2028Row];
  const matching = candidates.filter((row) => row.lot_id === lotId && row.entity_id === entityId);
  if (!matching.length) return null;
  const normalized = matching.map((row): CommercialLotOfficialPricing2028 | null => {
    if (!RESOLUTIONS.includes(row.resolution_status as LotPricingResolution)) return null;
    return {
      lotId, entityId,
      renovacaoTotal: persistedAmount(row.renovacao_total), segundaTotal: persistedAmount(row.segunda_total),
      renovacaoIsManual: row.renovacao_is_manual === true, segundaIsManual: row.segunda_is_manual === true,
      resolutionStatus: row.resolution_status as LotPricingResolution,
    };
  });
  const first = normalized[0];
  // Rule ties may repeat the same totals in the view; conflicting rows remain pending.
  return first && normalized.every((pricing) => JSON.stringify(pricing) === JSON.stringify(first)) ? first : null;
}
