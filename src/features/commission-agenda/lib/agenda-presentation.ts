/**
 * Pure presentation helpers for the unit Agenda. They work exclusively on
 * ViewModels and never touch persistence, so they are safe to reuse once the
 * backend phase supplies real data.
 */
import type {
  AgendaDashboardViewModel,
  AgendaEventViewModel,
  AgendaFilterState,
  AgendaMonthFilter,
  AgendaSecondaryFilters,
  AgendaStatusFilter,
  EventStatus,
  PersonSummary,
} from '../types';

export const MONTH_SHORT_LABELS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'] as const;

export const MONTH_LONG_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const;

const WEEKDAY_LABELS = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado',
] as const;

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  requested: 'Solicitado',
  confirmed: 'Confirmado',
  draft: 'Rascunho',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  rescheduled: 'Reagendado',
};

export const AGENDA_STATUS_FILTER_LABELS: Record<AgendaStatusFilter, string> = {
  all: 'Todos',
  upcoming: 'Próximos',
  today: 'Hoje',
  completed: 'Concluídos',
};

export const DEFAULT_SECONDARY_FILTERS: AgendaSecondaryFilters = {
  status: 'all',
  personId: 'all',
  location: 'all',
  period: 'all',
};

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 12);
}

export function getDateParts(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return {
    year,
    month,
    day,
    monthShort: MONTH_SHORT_LABELS[(month ?? 1) - 1],
    monthLong: MONTH_LONG_LABELS[(month ?? 1) - 1],
    weekday: WEEKDAY_LABELS[parseDateKey(key).getDay()],
  };
}

/** `22 SET` */
export function formatDayMonth(key: string): string {
  const { day, monthShort } = getDateParts(key);
  return `${String(day).padStart(2, '0')} ${monthShort}`;
}

/** `22/09/2026` */
export function formatNumericDate(key: string): string {
  const { day, month, year } = getDateParts(key);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

/** `Terça-feira · 22 SET` */
export function formatDayHeading(key: string): string {
  const { weekday } = getDateParts(key);
  return `${weekday} · ${formatDayMonth(key)}`;
}

/** `22 de setembro de 2026` */
export function formatLongDate(key: string): string {
  const { day, monthLong, year } = getDateParts(key);
  return `${day} de ${monthLong.toLocaleLowerCase('pt-BR')} de ${year}`;
}

/** `Setembro 2026` */
export function formatMonthHeading(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return `${MONTH_LONG_LABELS[(month ?? 1) - 1]} ${year}`;
}

export function formatTimeRange(start?: string | null, end?: string | null): string | null {
  if (!start) return null;
  return end ? `${start} → ${end}` : start;
}

/** Computes `2h30` from `HH:mm` boundaries when no explicit duration exists. */
export function computeDuration(start?: string | null, end?: string | null): string | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some((value) => Number.isNaN(value))) return null;
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}min`;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, '0')}`;
}

export function getEventDuration(event: AgendaEventViewModel): string | null {
  return event.duration ?? computeDuration(event.startTime, event.endTime);
}

export function getInitials(name: string): string {
  const parts = name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter((part) => part.length > 2 || /^[A-ZÀ-Ú]/.test(part));
  const first = parts[0]?.[0] ?? name[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toLocaleUpperCase('pt-BR');
}

export function isCompletedLike(event: AgendaEventViewModel, todayKey: string): boolean {
  if (event.status === 'completed') return true;
  if (event.status === 'cancelled') return false;
  const last = event.endDate ?? event.date;
  return last < todayKey;
}

export function sortByChronology(events: AgendaEventViewModel[]): AgendaEventViewModel[] {
  return [...events].sort((a, b) => {
    const dateOrder = a.date.localeCompare(b.date);
    if (dateOrder !== 0) return dateOrder;
    return (a.startTime ?? '').localeCompare(b.startTime ?? '');
  });
}

export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function matchesSearch(event: AgendaEventViewModel, term: string): boolean {
  if (!term) return true;
  const haystack = normalizeSearch([
    event.title,
    event.location ?? '',
    event.description ?? '',
    ...(event.people ?? []).map((person) => person.name),
    ...(event.units ?? []).map((unit) => unit.name),
  ].join(' '));
  return haystack.includes(term);
}

function matchesStatusFilter(event: AgendaEventViewModel, status: AgendaStatusFilter, todayKey: string): boolean {
  switch (status) {
    case 'upcoming':
      return event.date >= todayKey && !isCompletedLike(event, todayKey) && event.status !== 'cancelled';
    case 'today':
      return event.date <= todayKey && (event.endDate ?? event.date) >= todayKey;
    case 'completed':
      return isCompletedLike(event, todayKey);
    default:
      return true;
  }
}

function matchesSecondary(event: AgendaEventViewModel, secondary: AgendaSecondaryFilters, todayKey: string): boolean {
  if (secondary.status !== 'all' && event.status !== secondary.status) return false;
  if (secondary.personId !== 'all' && !(event.people ?? []).some((person) => person.id === secondary.personId)) return false;
  if (secondary.location !== 'all' && normalizeSearch(event.location ?? '') !== normalizeSearch(secondary.location)) return false;
  if (secondary.period !== 'all') {
    const start = parseDateKey(todayKey);
    const end = new Date(start);
    const days = secondary.period === 'week' ? 7 : secondary.period === '30days' ? 30 : 90;
    end.setDate(end.getDate() + days);
    const endKey = toDateKey(end);
    if (event.date < todayKey || event.date > endKey) return false;
  }
  return true;
}

export function filterEvents(
  events: AgendaEventViewModel[],
  filters: AgendaFilterState,
  todayKey: string,
): AgendaEventViewModel[] {
  const term = normalizeSearch(filters.search);
  return sortByChronology(events).filter((event) => {
    const { year, month } = getDateParts(event.date);
    if (year !== filters.year) return false;
    if (filters.month !== 'all' && month !== filters.month) return false;
    if (!matchesStatusFilter(event, filters.status, todayKey)) return false;
    if (!matchesSecondary(event, filters.secondary, todayKey)) return false;
    return matchesSearch(event, term);
  });
}

export function countActiveSecondaryFilters(secondary: AgendaSecondaryFilters): number {
  return Object.entries(secondary).filter(([, value]) => value !== 'all').length;
}

export interface AgendaDayGroup {
  dateKey: string;
  events: AgendaEventViewModel[];
}

export interface AgendaMonthGroup {
  monthKey: string;
  label: string;
  total: number;
  days: AgendaDayGroup[];
}

export function groupEventsByMonth(events: AgendaEventViewModel[]): AgendaMonthGroup[] {
  const months = new Map<string, Map<string, AgendaEventViewModel[]>>();
  for (const event of sortByChronology(events)) {
    const monthKey = event.date.slice(0, 7);
    const byDay = months.get(monthKey) ?? new Map<string, AgendaEventViewModel[]>();
    const dayEvents = byDay.get(event.date) ?? [];
    dayEvents.push(event);
    byDay.set(event.date, dayEvents);
    months.set(monthKey, byDay);
  }
  return Array.from(months.entries()).map(([monthKey, byDay]) => {
    const days = Array.from(byDay.entries()).map(([dateKey, dayEvents]) => ({ dateKey, events: dayEvents }));
    return {
      monthKey,
      label: formatMonthHeading(monthKey),
      total: days.reduce((sum, day) => sum + day.events.length, 0),
      days,
    };
  });
}

/** Events per month for the selected year (drives month selector counts). */
export function countEventsByMonth(events: AgendaEventViewModel[], year: number): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const event of events) {
    const parts = getDateParts(event.date);
    if (parts.year !== year) continue;
    counts[parts.month] = (counts[parts.month] ?? 0) + 1;
  }
  return counts;
}

export function getAvailableYears(events: AgendaEventViewModel[], fallbackYear: number): number[] {
  const years = new Set<number>([fallbackYear]);
  for (const event of events) years.add(getDateParts(event.date).year);
  return Array.from(years).sort((a, b) => a - b);
}

export function getNextEvent(events: AgendaEventViewModel[], todayKey: string): AgendaEventViewModel | undefined {
  return sortByChronology(events).find(
    (event) => event.date >= todayKey && event.status !== 'cancelled' && event.status !== 'completed',
  );
}

/** Derives the compact operational dashboard from the event list. */
export function buildDashboard(
  events: AgendaEventViewModel[],
  documentsCount: number,
  todayKey: string,
): AgendaDashboardViewModel {
  const currentMonth = todayKey.slice(0, 7);
  const people = new Set<string>();
  for (const event of events) for (const person of event.people ?? []) people.add(person.id);
  const next = getNextEvent(events, todayKey);
  return {
    nextEvent: next ? { id: next.id, title: next.title, date: next.date, startTime: next.startTime } : null,
    inMonth: events.filter((event) => event.date.startsWith(currentMonth)).length,
    upcoming: events.filter((event) => event.date >= todayKey && !isCompletedLike(event, todayKey) && event.status !== 'cancelled').length,
    completed: events.filter((event) => isCompletedLike(event, todayKey)).length,
    documents: documentsCount,
    peopleInvolved: people.size,
  };
}

export function collectPeople(events: AgendaEventViewModel[]): PersonSummary[] {
  const map = new Map<string, PersonSummary>();
  for (const event of events) for (const person of event.people ?? []) if (!map.has(person.id)) map.set(person.id, person);
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function collectLocations(events: AgendaEventViewModel[]): string[] {
  const set = new Set<string>();
  for (const event of events) if (event.location) set.add(event.location);
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function createDefaultFilters(year: number): AgendaFilterState {
  return {
    search: '',
    year,
    month: 'all',
    status: 'all',
    view: 'timeline',
    secondary: { ...DEFAULT_SECONDARY_FILTERS },
  };
}

export function isMonthFilter(value: unknown): value is AgendaMonthFilter {
  return value === 'all' || (typeof value === 'number' && value >= 1 && value <= 12);
}
