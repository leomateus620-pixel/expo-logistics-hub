import type { CronogramaSubeventAction, CronogramaSubeventBudgetItem } from '@/components/cronograma-eventos/types';

function timeToMinutes(value?: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Stable sort by start time; actions without a time keep their relative order at the end. */
export function sortActionsByTime(actions: CronogramaSubeventAction[]): CronogramaSubeventAction[] {
  return actions
    .map((action, index) => ({ action, index, minutes: timeToMinutes(action.startTime) }))
    .sort((a, b) => {
      if (a.minutes === null && b.minutes === null) return a.index - b.index;
      if (a.minutes === null) return 1;
      if (b.minutes === null) return -1;
      return a.minutes - b.minutes || a.index - b.index;
    })
    .map(({ action }, position) => ({ ...action, sortOrder: position }));
}

export function budgetTotal(items: CronogramaSubeventBudgetItem[] | undefined): number {
  return Math.round((items ?? []).reduce((sum, item) => sum + (Number.isFinite(item.amount) && item.amount > 0 ? item.amount : 0), 0) * 100) / 100;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function formatBRL(value: number): string {
  return brl.format(value || 0);
}

/** Parses digits typed in a currency mask ("120050" -> 1200.50). */
export function parseCurrencyDigits(input: string): number {
  const digits = input.replace(/\D/g, '').slice(0, 13);
  return digits ? Number(digits) / 100 : 0;
}

export function formatCurrencyInput(value: number): string {
  if (!value) return '';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}
