import type { SalesInstallment } from './salesTypes';

function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

export function addMonthsIso(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  const base = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(day, lastDay));
  return base.toISOString().slice(0, 10);
}

export function buildInstallmentScheduleFromDates(total: number, dueDates: string[]): SalesInstallment[] {
  if (!Number.isFinite(total) || total <= 0 || dueDates.length === 0) return [];
  const totalCents = toCents(total);
  const baseCents = Math.floor(totalCents / dueDates.length);
  const remainder = totalCents - baseCents * dueDates.length;
  return dueDates.map((dueDate, index) => ({
    number: index + 1,
    dueDate,
    amount: (index === dueDates.length - 1 ? baseCents + remainder : baseCents) / 100,
  }));
}

/**
 * Cronograma mensal a partir do primeiro vencimento.
 * A diferença de centavos é ajustada numa única parcela (a última),
 * garantindo Σ parcelas === valor total, exatamente.
 */
export function buildInstallmentSchedule(
  total: number,
  count: number,
  firstDueDate: string,
): SalesInstallment[] {
  if (!Number.isFinite(total) || total <= 0) return [];
  const installments = Math.max(1, Math.min(36, Math.floor(count)));
  return buildInstallmentScheduleFromDates(
    total,
    Array.from({ length: installments }, (_, index) => addMonthsIso(firstDueDate, index)),
  );
}

export function installmentsSum(installments: SalesInstallment[]): number {
  return installments.reduce((sum, item) => sum + toCents(item.amount), 0) / 100;
}
