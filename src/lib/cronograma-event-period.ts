import type { CronogramaEvent } from '@/components/cronograma-eventos/types';

const DAY_MS = 86_400_000;

const shortFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  timeZone: 'America/Sao_Paulo',
});

const longFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
});

export interface EventPeriod {
  /** Canonical first day (YYYY-MM-DD) or null when the event has no date yet. */
  start: string | null;
  /** Canonical last day, always >= start when both exist. */
  end: string | null;
  /** Calendar days covered by the event (1 for single-day, 0 when undated). */
  days: number;
  isMultiDay: boolean;
  startTime?: string;
  endTime?: string;
}

function toDate(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function isDateKey(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

type PeriodInput = Pick<CronogramaEvent, 'date' | 'endDate'> &
  Partial<Pick<CronogramaEvent, 'startTime' | 'endTime'>>;

/** Single source of truth for the temporal interval of one canonical event. */
export function getEventPeriod(event: PeriodInput): EventPeriod {
  const start = isDateKey(event.date) ? event.date : null;
  const rawEnd = isDateKey(event.endDate) ? event.endDate : null;
  const end = start ? (rawEnd && rawEnd > start ? rawEnd : start) : rawEnd;
  const days = start && end
    ? Math.max(1, Math.round((toDate(end).getTime() - toDate(start).getTime()) / DAY_MS) + 1)
    : start
      ? 1
      : 0;
  return {
    start,
    end,
    days,
    isMultiDay: Boolean(start && end && end > start),
    startTime: event.startTime || undefined,
    endTime: event.endTime || undefined,
  };
}

/**
 * Interval overlap: the event matches when any of its days falls inside the
 * requested range. Open bounds (null) mean "unbounded" on that side.
 */
export function eventOverlapsRange(
  event: PeriodInput,
  rangeStart: string | null | undefined,
  rangeEnd: string | null | undefined,
): boolean {
  const { start, end } = getEventPeriod(event);
  if (!start || !end) return false;
  if (rangeStart && end < rangeStart) return false;
  if (rangeEnd && start > rangeEnd) return false;
  return true;
}

/** True when the event covers the given day (YYYY-MM-DD). */
export function eventCoversDay(event: PeriodInput, dayKey: string): boolean {
  return eventOverlapsRange(event, dayKey, dayKey);
}

/** True when the event covers any day of the given 1-12 month, any year. */
export function eventCoversMonthNumber(event: PeriodInput, month: number): boolean {
  const { start, end } = getEventPeriod(event);
  if (!start || !end) return false;
  let cursor = start.slice(0, 7);
  const last = end.slice(0, 7);
  // Multi-day events rarely span more than a handful of months.
  while (cursor <= last) {
    if (Number(cursor.slice(5, 7)) === month) return true;
    const year = Number(cursor.slice(0, 4));
    const monthIndex = Number(cursor.slice(5, 7));
    cursor = monthIndex === 12
      ? `${year + 1}-01`
      : `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  }
  return false;
}

function short(key: string) {
  return shortFormatter.format(toDate(key)).replace('.', '').toLocaleUpperCase('pt-BR');
}

function long(key: string) {
  return longFormatter.format(toDate(key));
}

export function formatEventPeriodShort(event: PeriodInput): string {
  const period = getEventPeriod(event);
  if (!period.start) return 'Sem data';
  if (!period.isMultiDay || !period.end) return short(period.start);
  return `${short(period.start)} → ${short(period.end)}`;
}

/** Human sentence used in the event detail views. */
export function formatEventPeriod(event: PeriodInput): string {
  const period = getEventPeriod(event);
  if (!period.start) return 'Data a definir';
  const startLabel = `${long(period.start)}${period.startTime ? ` · ${period.startTime}` : ''}`;
  if (!period.isMultiDay || !period.end) {
    return period.endTime ? `${startLabel} às ${period.endTime}` : startLabel;
  }
  const endLabel = `${long(period.end)}${period.endTime ? ` · ${period.endTime}` : ''}`;
  return `${startLabel} até ${endLabel}`;
}

export function formatEventDurationLabel(event: PeriodInput): string | null {
  const period = getEventPeriod(event);
  if (!period.isMultiDay) return null;
  return `${period.days} dias`;
}
