import type { CronogramaEvent } from '@/lib/cronograma-eventos';

export const CRONOGRAMA_TIME_ZONE = 'America/Sao_Paulo';

/** Weekly window used by the personal summary. Centralized so institutional
 *  weekend events can be included later by flipping `includeWeekend`. */
export interface WeeklyWindowOptions {
  includeWeekend?: boolean;
  todayKey?: string;
}

export interface WeeklyWindow {
  startKey: string;
  endKey: string;
  todayKey: string;
  /** 1 = Monday … 7 = Sunday, for the reference day. */
  weekday: number;
  isLastBusinessDay: boolean;
}

export interface WeeklySummaryEntry {
  id: string;
  identity: string;
  title: string;
  dateKey: string;
  weekdayLabel: string;
  startTime: string | null;
  durationMinutes: number | null;
  contextLabel: string | null;
}

export interface WeeklySummaryDay {
  dateKey: string;
  weekdayLabel: string;
  entries: WeeklySummaryEntry[];
}

export interface WeeklySummary {
  window: WeeklyWindow;
  eventCount: number;
  totalMinutes: number;
  daysWithEvents: number;
  eventsWithoutDuration: number;
  days: WeeklySummaryDay[];
  eventIds: string[];
}

const WEEKDAY_LABELS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

export function getTodayKeyInSaoPaulo(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: CRONOGRAMA_TIME_ZONE });
}

function keyToUtcDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0));
}

function shiftKey(dateKey: string, days: number): string {
  const base = keyToUtcDate(dateKey);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** ISO weekday: 1 (Monday) … 7 (Sunday). */
export function getIsoWeekday(dateKey: string): number {
  const day = keyToUtcDate(dateKey).getUTCDay();
  return day === 0 ? 7 : day;
}

export function getWeekdayLabel(dateKey: string): string {
  return WEEKDAY_LABELS[keyToUtcDate(dateKey).getUTCDay()] ?? '';
}

export function resolveWeeklyWindow(options: WeeklyWindowOptions = {}): WeeklyWindow {
  const todayKey = options.todayKey ?? getTodayKeyInSaoPaulo();
  const weekday = getIsoWeekday(todayKey);
  const startKey = shiftKey(todayKey, -(weekday - 1));
  const lastDayOffset = options.includeWeekend ? 6 : 4;
  const endKey = shiftKey(startKey, lastDayOffset);
  return {
    startKey,
    endKey,
    todayKey,
    weekday,
    isLastBusinessDay: weekday >= lastDayOffset + 1,
  };
}

function normalizeName(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export interface WeeklyViewer {
  userId?: string | null;
  displayName?: string | null;
}

/** An event belongs to the viewer when they are a relational responsible
 *  (by user id or name) or the textual responsible of the record. */
export function isEventLinkedToViewer(event: CronogramaEvent, viewer: WeeklyViewer): boolean {
  const viewerId = viewer.userId ?? null;
  const viewerName = normalizeName(viewer.displayName);

  const relational = event.responsiblesRel ?? [];
  const matchedRelational = relational.some((link) => {
    if (viewerId && link.userId && link.userId === viewerId) return true;
    if (viewerName && normalizeName(link.name) === viewerName) return true;
    return false;
  });
  if (matchedRelational) return true;

  return Boolean(viewerName) && normalizeName(event.responsibleName) === viewerName;
}

function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Returns the event duration in minutes, or null when it cannot be trusted. */
export function computeEventDurationMinutes(event: Pick<CronogramaEvent, 'startTime' | 'endTime'>): number | null {
  const start = parseTimeToMinutes(event.startTime);
  const end = parseTimeToMinutes(event.endTime);
  if (start === null || end === null) return null;
  let duration = end - start;
  // Events crossing midnight roll over to the next day instead of going negative.
  if (duration <= 0) duration += 24 * 60;
  if (duration <= 0 || duration > 24 * 60) return null;
  return duration;
}

export function formatDurationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}min`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h${String(rest).padStart(2, '0')}`;
}

export function buildWeeklySummary(
  events: CronogramaEvent[],
  viewer: WeeklyViewer,
  options: WeeklyWindowOptions = {},
): WeeklySummary {
  const window = resolveWeeklyWindow(options);
  const seen = new Set<string>();
  const entries: WeeklySummaryEntry[] = [];

  events.forEach((event) => {
    const identity = event.id || event.sourceKey;
    if (!identity || seen.has(identity)) return;
    if (event.status === 'cancelado') return;
    if (!event.hasExactDate || !event.startDate) return;
    if (event.startDate < window.startKey || event.startDate > window.endKey) return;
    if (!isEventLinkedToViewer(event, viewer)) return;

    seen.add(identity);
    entries.push({
      id: event.id,
      identity: event.sourceKey || event.id,
      title: event.title,
      dateKey: event.startDate,
      weekdayLabel: getWeekdayLabel(event.startDate),
      startTime: event.startTime ?? event.time ?? null,
      durationMinutes: computeEventDurationMinutes(event),
      contextLabel: event.commissionName?.trim() || null,
    });
  });

  entries.sort((left, right) => (
    left.dateKey.localeCompare(right.dateKey)
    || (left.startTime ?? '99:99').localeCompare(right.startTime ?? '99:99')
    || left.title.localeCompare(right.title, 'pt-BR')
  ));

  const days: WeeklySummaryDay[] = [];
  entries.forEach((entry) => {
    const bucket = days.find((day) => day.dateKey === entry.dateKey);
    if (bucket) bucket.entries.push(entry);
    else days.push({ dateKey: entry.dateKey, weekdayLabel: entry.weekdayLabel, entries: [entry] });
  });

  return {
    window,
    eventCount: entries.length,
    totalMinutes: entries.reduce((total, entry) => total + (entry.durationMinutes ?? 0), 0),
    daysWithEvents: days.length,
    eventsWithoutDuration: entries.filter((entry) => entry.durationMinutes === null).length,
    days,
    eventIds: entries.map((entry) => entry.id).filter(Boolean),
  };
}

export interface CollapsedLabelParts {
  prefix: string;
  summary: string;
}

/** Splits the collapsed label so the header can emphasize the numbers. */
export function buildCollapsedParts(summary: WeeklySummary): CollapsedLabelParts {
  const prefix = summary.window.isLastBusinessDay ? 'Esta semana' : 'Semana atual';
  if (summary.eventCount === 0) return { prefix, summary: 'nenhum evento' };

  const eventsLabel = `${summary.eventCount} ${summary.eventCount === 1 ? 'evento' : 'eventos'}`;
  if (summary.totalMinutes === 0) return { prefix, summary: `${eventsLabel} · duração não informada` };

  const durationLabel = formatDurationLabel(summary.totalMinutes);
  return {
    prefix,
    summary: summary.eventsWithoutDuration > 0
      ? `${eventsLabel} · ${durationLabel} contabilizadas`
      : `${eventsLabel} · ${durationLabel} de agenda`,
  };
}

export function buildCollapsedLabel(summary: WeeklySummary): string {
  const parts = buildCollapsedParts(summary);
  return `${parts.prefix} · ${parts.summary}`;
}

