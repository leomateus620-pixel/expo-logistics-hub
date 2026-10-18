const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  timeZone: 'America/Sao_Paulo',
});

const longDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
});

// Event dates are calendar keys (YYYY-MM-DD) with no time zone. Anchoring them at
// UTC noon and formatting in UTC keeps day, month and weekday identical for any
// viewer time zone.
const calendarWeekdayShortFormatter = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  timeZone: 'UTC',
});

const calendarWeekdayLongFormatter = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  timeZone: 'UTC',
});

const calendarMonthShortFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'short',
  timeZone: 'UTC',
});

const calendarLongDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const monthFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  timeZone: 'America/Sao_Paulo',
});

export function parseDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

export function formatShortDate(date: string | null): string {
  if (!date) return 'Sem data';
  return dateFormatter.format(parseDate(date)).replace('.', '');
}

export function formatLongDate(date: string | null): string {
  if (!date) return 'Data a definir';
  return longDateFormatter.format(parseDate(date));
}

export function formatShortDateRange(date: string | null, endDate?: string | null): string {
  if (!date) return 'Sem data';
  if (!endDate || endDate === date) return formatShortDate(date);
  return `${formatShortDate(date)} a ${formatShortDate(endDate)}`;
}

export function formatLongDateRange(date: string | null, endDate?: string | null): string {
  if (!date) return 'Data a definir';
  if (!endDate || endDate === date) return formatLongDate(date);
  return `${formatLongDate(date)} a ${formatLongDate(endDate)}`;
}

function toCalendarDate(date: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return null;
  const value = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return Number.isNaN(value.getTime()) ? null : value;
}

function stripAbbreviationDot(label: string): string {
  return label.replace(/\./g, '').trim();
}

function capitalize(label: string): string {
  return label.charAt(0).toLocaleUpperCase('pt-BR') + label.slice(1);
}

export interface CalendarDateParts {
  iso: string;
  day: string;
  /** Ex.: "OUT" */
  monthShort: string;
  /** Ex.: "Seg", "Sáb" */
  weekdayShort: string;
  /** Ex.: "segunda-feira" */
  weekdayLong: string;
  weekdayIndex: number;
  isWeekend: boolean;
}

export function getCalendarDateParts(date: string | null | undefined): CalendarDateParts | null {
  if (!date) return null;
  const value = toCalendarDate(date);
  if (!value) return null;
  const weekdayIndex = value.getUTCDay();
  return {
    iso: value.toISOString().slice(0, 10),
    day: String(value.getUTCDate()).padStart(2, '0'),
    monthShort: stripAbbreviationDot(calendarMonthShortFormatter.format(value)).toLocaleUpperCase('pt-BR'),
    weekdayShort: capitalize(stripAbbreviationDot(calendarWeekdayShortFormatter.format(value))),
    weekdayLong: calendarWeekdayLongFormatter.format(value),
    weekdayIndex,
    isWeekend: weekdayIndex === 0 || weekdayIndex === 6,
  };
}

export function formatWeekdayShort(date: string | null | undefined): string | null {
  return getCalendarDateParts(date)?.weekdayShort ?? null;
}

export function formatWeekday(date: string | null): string {
  const parts = getCalendarDateParts(date);
  return parts ? parts.weekdayShort.toLocaleLowerCase('pt-BR') : 'pendente';
}

export function formatLongDateWithWeekday(date: string | null): string {
  const value = date ? toCalendarDate(date) : null;
  return value ? calendarLongDateFormatter.format(value) : 'Data a definir';
}

export function getMonthLabel(monthIndex: number): string {
  const label = monthFormatter.format(new Date(2028, monthIndex, 1, 12));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function dateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getDateParts(date: string | null): { year: number; month: number; day: number } | null {
  if (!date) return null;
  const [year, month, day] = date.split('-').map(Number);
  return { year, month: month - 1, day };
}

export function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function getMonthStartOffset(year: number, monthIndex: number): number {
  return new Date(year, monthIndex, 1).getDay();
}

export function compareEventDates(a: { date: string | null; startTime?: string }, b: { date: string | null; startTime?: string }) {
  if (!a.date && !b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  return `${a.date}-${a.startTime || '99:99'}`.localeCompare(`${b.date}-${b.startTime || '99:99'}`);
}

export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const target = parseDate(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - base) / 86400000);
}
