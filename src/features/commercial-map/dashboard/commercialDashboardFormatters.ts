import { formatBrl } from '../utils/lotPricing2028';

const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compactDecimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const percentage = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export function formatDashboardCurrency(value: number | null, compact = false): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (compact && Math.abs(value) >= 1_000_000) return `R$ ${compactDecimal.format(value / 1_000_000)} mi`;
  if (compact && Math.abs(value) >= 1_000) return `R$ ${compactDecimal.format(value / 1_000)} mil`;
  return formatBrl(value) ?? '—';
}

export function formatDashboardArea(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : `${decimal.format(value)} m²`;
}

/** Do not present missing official areas as an observed 0 m². */
export function formatDashboardAreaWithCoverage(
  value: number,
  statusLotCount: number,
  pendingAreaCount: number,
  inventoryLotCount: number,
): string {
  if (inventoryLotCount === 0) return '—';
  if (statusLotCount > 0 && pendingAreaCount === statusLotCount) return 'Área pendente';
  return formatDashboardArea(value);
}

export function formatDashboardPercentage(value: number | null): string {
  return value === null || !Number.isFinite(value) ? '—' : `${percentage.format(value)}%`;
}

export function formatDashboardInteger(value: number): string {
  return Number.isFinite(value) ? integer.format(value) : '—';
}
