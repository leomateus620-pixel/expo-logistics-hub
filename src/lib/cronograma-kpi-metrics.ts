import type { CronogramaEvent } from '@/components/cronograma-eventos/types';
import {
  getEventDeadline,
  isCompletedEvent,
  isActiveEvent,
  isOperationallyEligible,
  isOverdueEvent,
} from '@/lib/cronograma-dashboard-selectors';
import { commissionKeysOf, UNASSIGNED_KEY } from '@/lib/cronograma-commission-distribution';
import { getTodayKey } from '@/lib/cronograma-timeline';

export interface RankedEntry {
  key: string;
  label: string;
  count: number;
  eventIds: string[];
}

export interface PersonEntry extends RankedEntry {
  userId: string | null;
  next: { id: string; title: string; date: string; startTime?: string } | null;
}

export interface ProgressBlock {
  percentage: number | null;
  completed: number;
  total: number;
  completedIds: string[];
  eligibleIds: string[];
}

export interface BusyDay {
  dateKey: string;
  count: number;
  eventIds: string[];
}

export interface AgendaKpiMetrics {
  todayKey: string;
  monthKey: string;
  monthLabel: string;
  progress: { global: ProgressBlock; currentMonth: ProgressBlock };
  events: {
    completed: { total: number; inMonth: number; ids: string[]; monthIds: string[] };
    overdue: { total: number; ids: string[]; oldestDays: number | null };
  };
  people: { mostAssigned: PersonEntry[] };
  calendar: {
    currentWeekCount: number;
    weekRangeLabel: string;
    weekEventIds: string[];
    busiestDaysCurrentMonth: BusyDay[];
  };
  commissions: { topCurrentMonth: RankedEntry[] };
  locations: { topCurrentMonth: RankedEntry[] };
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('pt-BR');
}

function dateFromKey(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function keyFromDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Semana calendário segunda → domingo, ancorada na data local do módulo. */
export function getWeekBounds(todayKey: string) {
  const today = dateFromKey(todayKey);
  const dow = today.getUTCDay(); // 0 = domingo
  const backToMonday = dow === 0 ? 6 : dow - 1;
  const start = new Date(today.getTime() - backToMonday * 86400000);
  const end = new Date(start.getTime() + 6 * 86400000);
  return { start: keyFromDate(start), end: keyFromDate(end) };
}

const SHORT_MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' });
const LONG_MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });

function shortMonth(key: string) {
  return SHORT_MONTH.format(dateFromKey(key)).replace('.', '').toLocaleUpperCase('pt-BR');
}

export function formatWeekRange(start: string, end: string) {
  const startDay = start.slice(8, 10);
  const endDay = end.slice(8, 10);
  const startMonth = shortMonth(start);
  const endMonth = shortMonth(end);
  return startMonth === endMonth
    ? `${startDay}–${endDay} ${endMonth}`
    : `${startDay} ${startMonth} – ${endDay} ${endMonth}`;
}

export function formatDayLabel(dateKey: string) {
  return `${dateKey.slice(8, 10)} ${shortMonth(dateKey)}`;
}

/** Intervalo de datas do evento (início → fim), limitado a chaves válidas. */
function eventDays(event: CronogramaEvent): string[] {
  const start = event.date;
  if (!start) return [];
  const end = event.endDate && event.endDate >= start ? event.endDate : start;
  const days: string[] = [];
  let cursor = dateFromKey(start);
  const last = dateFromKey(end);
  let guard = 0;
  while (cursor.getTime() <= last.getTime() && guard < 400) {
    days.push(keyFromDate(cursor));
    cursor = new Date(cursor.getTime() + 86400000);
    guard += 1;
  }
  return days;
}

function toProgress(all: CronogramaEvent[]): ProgressBlock {
  const completed = all.filter(isCompletedEvent);
  return {
    percentage: all.length ? Math.round((completed.length / all.length) * 100) : null,
    completed: completed.length,
    total: all.length,
    completedIds: completed.map((event) => event.id),
    eligibleIds: all.map((event) => event.id),
  };
}

function rank(map: Map<string, RankedEntry>, limit: number) {
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
    .slice(0, limit);
}

function peopleOf(event: CronogramaEvent) {
  const links = event.responsiblesRel ?? [];
  const output: { key: string; userId: string | null; label: string }[] = [];
  const seen = new Set<string>();
  links.forEach((link) => {
    const label = link.name?.trim();
    if (!label) return;
    const key = link.userId?.trim() || `name:${normalizeText(label)}`;
    if (seen.has(key)) return;
    seen.add(key);
    output.push({ key, userId: link.userId?.trim() || null, label });
  });
  if (output.length === 0 && event.owner?.trim()) {
    const label = event.owner.trim();
    output.push({ key: `name:${normalizeText(label)}`, userId: null, label });
  }
  return output;
}

export function buildAgendaKpiMetrics(
  input: CronogramaEvent[],
  todayKeyInput?: string,
): AgendaKpiMetrics {
  const todayKey = todayKeyInput ?? getTodayKey();
  const monthKey = todayKey.slice(0, 7);
  const eligible = input.filter(isOperationallyEligible);
  const active = eligible.filter(isActiveEvent);
  const inMonth = eligible.filter((event) => eventDays(event).some((day) => day.startsWith(monthKey)));

  const completed = eligible.filter(isCompletedEvent);
  const completedMonth = inMonth.filter(isCompletedEvent);
  const overdue = active.filter((event) => isOverdueEvent(event, todayKey));
  const oldestOverdue = overdue.reduce<number | null>((worst, event) => {
    const deadline = getEventDeadline(event);
    if (!deadline) return worst;
    const days = Math.round((dateFromKey(todayKey).getTime() - dateFromKey(deadline).getTime()) / 86400000);
    return worst === null || days > worst ? days : worst;
  }, null);

  // Pessoas com mais eventos (por ID quando existir) + próximo evento futuro.
  const peopleMap = new Map<string, PersonEntry>();
  const futureByPerson = new Map<string, CronogramaEvent[]>();
  eligible.forEach((event) => {
    peopleOf(event).forEach((person) => {
      const entry = peopleMap.get(person.key) ?? {
        key: person.key,
        userId: person.userId,
        label: person.label,
        count: 0,
        eventIds: [],
        next: null,
      };
      entry.count += 1;
      entry.eventIds.push(event.id);
      if (!entry.userId && person.userId) entry.userId = person.userId;
      peopleMap.set(person.key, entry);

      const deadline = event.date;
      if (!isCompletedEvent(event) && deadline && deadline >= todayKey) {
        const bucket = futureByPerson.get(person.key) ?? [];
        bucket.push(event);
        futureByPerson.set(person.key, bucket);
      }
    });
  });
  const mostAssigned = Array.from(peopleMap.values())
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'))
    .slice(0, 3)
    .map((entry) => {
      const upcoming = (futureByPerson.get(entry.key) ?? [])
        .slice()
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')
          || (a.startTime ?? '').localeCompare(b.startTime ?? ''))[0];
      return {
        ...entry,
        next: upcoming && upcoming.date
          ? { id: upcoming.id, title: upcoming.title, date: upcoming.date, startTime: upcoming.startTime }
          : null,
      };
    });

  // Semana calendário (segunda → domingo).
  const week = getWeekBounds(todayKey);
  const weekEvents = eligible.filter((event) =>
    eventDays(event).some((day) => day >= week.start && day <= week.end));

  // Dias com maior concentração no mês atual.
  const dayMap = new Map<string, BusyDay>();
  eligible.forEach((event) => {
    eventDays(event).forEach((day) => {
      if (!day.startsWith(monthKey)) return;
      const entry = dayMap.get(day) ?? { dateKey: day, count: 0, eventIds: [] };
      entry.count += 1;
      entry.eventIds.push(event.id);
      dayMap.set(day, entry);
    });
  });
  const busiestDays = Array.from(dayMap.values())
    .sort((a, b) => b.count - a.count || a.dateKey.localeCompare(b.dateKey))
    .slice(0, 5);

  // Comissões reais do mês (mesma regra do gráfico de distribuição).
  const commissionMap = new Map<string, RankedEntry>();
  const locationMap = new Map<string, RankedEntry>();
  inMonth.forEach((event) => {
    commissionKeysOf(event).forEach(({ key, label }) => {
      if (!key || key === UNASSIGNED_KEY) return;
      const entry = commissionMap.get(key) ?? { key, label, count: 0, eventIds: [] };
      entry.count += 1;
      entry.eventIds.push(event.id);
      commissionMap.set(key, entry);
    });
    const location = event.location?.trim();
    if (location) {
      const key = normalizeText(location);
      const entry = locationMap.get(key) ?? { key, label: location, count: 0, eventIds: [] };
      entry.count += 1;
      entry.eventIds.push(event.id);
      locationMap.set(key, entry);
    }
  });

  return {
    todayKey,
    monthKey,
    monthLabel: LONG_MONTH.format(dateFromKey(`${monthKey}-01`)).toLocaleUpperCase('pt-BR'),
    progress: { global: toProgress(eligible), currentMonth: toProgress(inMonth) },
    events: {
      completed: {
        total: completed.length,
        inMonth: completedMonth.length,
        ids: completed.map((event) => event.id),
        monthIds: completedMonth.map((event) => event.id),
      },
      overdue: {
        total: overdue.length,
        ids: overdue.map((event) => event.id),
        oldestDays: oldestOverdue,
      },
    },
    people: { mostAssigned },
    calendar: {
      currentWeekCount: weekEvents.length,
      weekRangeLabel: formatWeekRange(week.start, week.end),
      weekEventIds: weekEvents.map((event) => event.id),
      busiestDaysCurrentMonth: busiestDays,
    },
    commissions: { topCurrentMonth: rank(commissionMap, 5) },
    locations: { topCurrentMonth: rank(locationMap, 5) },
  };
}
