const percentage = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Presentation only: callers supply the matching canonical snapshot fields. */
export function buildDashboardCommercialProgress({ total, saleOpen, sold }: {
  total: number;
  saleOpen: number;
  sold: number;
}): { percentage: number | null; saleOpenWidth: number; soldWidth: number; inconsistent: boolean } {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(saleOpen) || !Number.isFinite(sold)) {
    return { percentage: null, saleOpenWidth: 0, soldWidth: 0, inconsistent: false };
  }
  const commercialized = saleOpen + sold;
  const rawPercentage = commercialized / total * 100;
  const positiveOpen = Math.max(0, saleOpen);
  const positiveSold = Math.max(0, sold);
  // Bound the visual track together so both statuses keep their proportion.
  const visualBase = Math.max(total, positiveOpen + positiveSold);
  return {
    percentage: rawPercentage,
    saleOpenWidth: positiveOpen / visualBase * 100,
    soldWidth: positiveSold / visualBase * 100,
    inconsistent: saleOpen < 0 || sold < 0 || commercialized > total,
  };
}

/** One decimal, without claiming completion (or consistency) through rounding. */
export function formatDashboardCommercialProgress(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const visible = value < 100 && value > 99.9 ? 99.9
    : value > 100 && value < 100.1 ? 100.1
      : value < 0 && value > -0.1 ? -0.1 : value;
  return `${percentage.format(visible)}%`;
}
