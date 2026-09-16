import type { SalesInstallment } from './salesTypes';

function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

function addMonthsIso(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  const base = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(day, lastDay));
  return base.toISOString().slice(0, 10);
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
  const installments = Math.max(1, Math.floor(count));
  const totalCents = toCents(total);
  const baseCents = Math.floor(totalCents / installments);
  const remainder = totalCents - baseCents * installments;

  return Array.from({ length: installments }, (_, index) => {
    const isLast = index === installments - 1;
    const cents = isLast ? baseCents + remainder : baseCents;
    return {
      number: index + 1,
      dueDate: addMonthsIso(firstDueDate, index),
      amount: cents / 100,
    } satisfies SalesInstallment;
  });
}

export function installmentsSum(installments: SalesInstallment[]): number {
  return installments.reduce((sum, item) => sum + toCents(item.amount), 0) / 100;
}
