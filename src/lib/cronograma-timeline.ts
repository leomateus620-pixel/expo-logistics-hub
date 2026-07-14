import type {
  CronogramaEvent,
  CronogramaFilters,
  CronogramaStatus,
} from '@/components/cronograma-eventos/types';

const DAY_MS = 86_400_000;
export const CRONOGRAMA_TIME_ZONE = 'America/Sao_Paulo';

function normalizeSearch(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function toUtcDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function fromUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getTodayKey(reference = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CRONOGRAMA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(reference);
}

export function addDays(dateKey: string, amount: number) {
  const date = toUtcDate(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return fromUtcDate(date);
}

export function differenceInCalendarDays(dateKey: string, baseKey: string) {
  return Math.round((toUtcDate(dateKey).getTime() - toUtcDate(baseKey).getTime()) / DAY_MS);
}

export function deriveOperationalStatus(
  event: Pick<CronogramaEvent, 'date' | 'status'>,
  todayKey = getTodayKey(),
): CronogramaStatus {
  if (event.status === 'completed' || event.status === 'cancelled' || event.status === 'rescheduled') {
    return event.status;
  }
  if (!event.date) return 'undated';
  if (event.status === 'in_progress' || event.status === 'blocked' || event.status === 'in_definition') {
    return event.status;
  }
  if (event.date < todayKey) return 'overdue';
  return event.status;
}

export function monthKeyFromDate(date: string) {
  return date.slice(0, 7);
}

export function getInitialTimelineMonth(events: CronogramaEvent[], todayKey = getTodayKey()) {
  const dated = events
    .filter((event): event is CronogramaEvent & { date: string } => Boolean(event.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const currentMonth = todayKey.slice(0, 7);
  if (dated.some((event) => monthKeyFromDate(event.date) === currentMonth)) return currentMonth;
  return dated.find((event) => event.date >= todayKey)?.date.slice(0, 7)
    ?? dated.at(-1)?.date.slice(0, 7)
    ?? currentMonth;
}

export function groupTimelineByMonth(events: CronogramaEvent[]) {
  const grouped = new Map<string, CronogramaEvent[]>();
  events
    .filter((event): event is CronogramaEvent & { date: string } => Boolean(event.date))
    .sort((a, b) => `${a.date}-${a.startTime ?? '99:99'}`.localeCompare(`${b.date}-${b.startTime ?? '99:99'}`))
    .forEach((event) => {
      const key = monthKeyFromDate(event.date);
      const month = grouped.get(key) ?? [];
      month.push(event);
      grouped.set(key, month);
    });
  return grouped;
}

export function getSubeventProgress(event: Pick<CronogramaEvent, 'subevents'>) {
  const actionable = (event.subevents ?? []).filter((subevent) => subevent.status !== 'cancelled');
  const completed = actionable.filter((subevent) => subevent.status === 'completed').length;
  return {
    completed,
    total: actionable.length,
    percent: actionable.length ? Math.round((completed / actionable.length) * 100) : 0,
  };
}

export function getMonthOperationalSummary(events: CronogramaEvent[]) {
  const completed = events.filter((event) => event.status === 'completed').length;
  const overdue = events.filter((event) => event.status === 'overdue').length;
  const pending = events.filter((event) => !['completed', 'cancelled', 'rescheduled'].includes(event.status)).length;
  return {
    total: events.length,
    completed,
    overdue,
    pending,
    nearestDate: events.find((event) => event.date)?.date ?? null,
  };
}

export function getCountdownLabel(date: string | null, todayKey = getTodayKey()) {
  if (!date) return 'Data a definir';
  const days = differenceInCalendarDays(date, todayKey);
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Amanhã';
  if (days > 1) return `Em ${days} dias`;
  return `${Math.abs(days)} dias atrás`;
}

export function getTimelineSnapshot(events: CronogramaEvent[], todayKey = getTodayKey()) {
  const dated = events.filter((event): event is CronogramaEvent & { date: string } => Boolean(event.date));
  const active = dated.filter((event) => !['cancelled', 'rescheduled'].includes(event.status));
  const completed = active.filter((event) => event.status === 'completed').length;
  const upcoming = active
    .filter((event) => event.date >= todayKey && !['completed', 'cancelled'].includes(event.status))
    .sort((a, b) => a.date.localeCompare(b.date));
  const edition = [...events]
    .filter((event) => event.date && /fenasoja 2028/i.test(event.title) && (event.isMain || event.isOfficial))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0] ?? null;

  return {
    nextAction: upcoming[0] ?? null,
    nextOfficialAction: upcoming.find((event) => event.isOfficial || event.isMain) ?? upcoming[0] ?? null,
    edition,
    overdue: events.filter((event) => event.status === 'overdue').length,
    undated: events.filter((event) => !event.date).length,
    missingOwner: events.filter((event) => !event.owner).length,
    completed,
    actionable: active.length,
    progress: active.length ? Math.round((completed / active.length) * 100) : 0,
  };
}

function startOfWeek(todayKey: string) {
  const date = toUtcDate(todayKey);
  const day = date.getUTCDay();
  const distanceToMonday = day === 0 ? -6 : 1 - day;
  return addDays(todayKey, distanceToMonday);
}

export function filterTimelineEvents(
  events: CronogramaEvent[],
  filters: CronogramaFilters,
  todayKey = getTodayKey(),
) {
  const query = normalizeSearch(filters.query.trim());
  const weekStart = startOfWeek(todayKey);
  const weekEnd = addDays(weekStart, 6);
  const next30 = addDays(todayKey, 30);

  return events.filter((event) => {
    if (query) {
      const haystack = normalizeSearch([
        event.title,
        event.summary,
        event.location,
        event.owner,
        event.commission,
        event.pendingReason,
        event.decisionNeeded,
        event.sourceSheet,
      ].filter(Boolean).join(' '));
      if (!haystack.includes(query)) return false;
    }
    if (filters.year !== 'all' && event.year !== filters.year) return false;
    if (filters.month !== 'all' && (!event.date || Number(event.date.slice(5, 7)) !== filters.month)) return false;
    if (filters.category !== 'all' && event.category !== filters.category) return false;
    if (filters.status !== 'all' && event.status !== filters.status) return false;
    if (filters.priority !== 'all' && event.priority !== filters.priority) return false;
    if (filters.commission !== 'all' && event.commission !== filters.commission) return false;
    if (filters.owner !== 'all' && event.owner !== filters.owner) return false;
    if (filters.officialOnly && !event.isOfficial && !event.isMain) return false;
    if (filters.missingOwner && event.owner) return false;
    if (filters.fromDate && (!event.date || event.date < filters.fromDate)) return false;
    if (filters.toDate && (!event.date || event.date > filters.toDate)) return false;

    if (filters.period === 'today' && event.date !== todayKey) return false;
    if (filters.period === 'week' && (!event.date || event.date < weekStart || event.date > weekEnd)) return false;
    if (filters.period === '30days' && (!event.date || event.date < todayKey || event.date > next30)) return false;
    if (
      filters.period === 'upcoming'
      && (!event.date || event.date < todayKey || ['completed', 'cancelled', 'rescheduled'].includes(event.status))
    ) return false;
    if (filters.period === 'overdue' && event.status !== 'overdue') return false;
    if (filters.period === 'undated' && event.date) return false;
    return true;
  });
}
