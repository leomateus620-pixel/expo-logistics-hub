import type { SalesInstallment, SalesInstallmentDraft } from './salesTypes';
import { splitCents, toCents } from './salesMoney';

/** Primeiro vencimento padrão do boleto parcelado (dia 5, a partir de dezembro/2026). */
export const DEFAULT_INSTALLMENT_START = '2026-12-05';

export function addMonthsIso(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  const base = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(day, lastDay));
  return base.toISOString().slice(0, 10);
}

/** Sequência mensal de calendário (não 30 dias): 05/12/2026, 05/01/2027, 05/02/2027… */
export function monthlyDueDates(count: number, start = DEFAULT_INSTALLMENT_START): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => addMonthsIso(start, index));
}

export function buildDraftSchedule(totalCents: number, dueDates: string[]): SalesInstallmentDraft[] {
  const amounts = splitCents(totalCents, dueDates.length);
  return dueDates.map((dueDate, index) => ({ dueDate, amountCents: amounts[index] }));
}

/** Redistribui valores mantendo as datas (inclusive personalizadas). */
export function redistribute(totalCents: number, drafts: SalesInstallmentDraft[]): SalesInstallmentDraft[] {
  return buildDraftSchedule(totalCents, drafts.map((item) => item.dueDate));
}

export function draftsToInstallments(drafts: SalesInstallmentDraft[]): SalesInstallment[] {
  return drafts.map((item, index) => ({ number: index + 1, dueDate: item.dueDate, amount: item.amountCents / 100 }));
}

export function draftsSumCents(drafts: SalesInstallmentDraft[]): number {
  return drafts.reduce((sum, item) => sum + item.amountCents, 0);
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function formatIsoDateBr(value: string): string {
  return isValidIsoDate(value) ? value.split('-').reverse().join('/') : '—';
}

/** Compatibilidade: cronograma legado a partir de datas (centavos na última parcela). */
export function buildInstallmentScheduleFromDates(total: number, dueDates: string[]): SalesInstallment[] {
  if (!Number.isFinite(total) || total <= 0 || dueDates.length === 0) return [];
  return draftsToInstallments(buildDraftSchedule(toCents(total), dueDates));
}

export function installmentsSum(installments: SalesInstallment[]): number {
  return installments.reduce((sum, item) => sum + toCents(item.amount), 0) / 100;
}

/** Compatibilidade: cronograma mensal a partir do primeiro vencimento. */
export function buildInstallmentSchedule(total: number, count: number, firstDueDate: string): SalesInstallment[] {
  if (!Number.isFinite(total) || total <= 0) return [];
  const n = Math.max(1, Math.min(36, Math.floor(count)));
  return buildInstallmentScheduleFromDates(total, monthlyDueDates(n, firstDueDate));
}
