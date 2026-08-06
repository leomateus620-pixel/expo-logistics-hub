import type {
  CronogramaEvent,
  CronogramaStatus,
} from '@/components/cronograma-eventos/types';
import {
  formatWeekday,
  getMonthLabel,
  parseDate,
} from '@/components/cronograma-eventos/dateUtils';
import { isValidDateKey, toDateKey, type VolumeRange } from './cronograma-event-volume';

export type TimeDemandPreset = 'week' | 'month' | '6m' | '12m' | 'custom';

export interface TimeDemandFilters {
  commission?: string | null;
  category?: string | null;
  status?: CronogramaStatus | null;
}

export interface TimeDemandStatusSlice {
  status: CronogramaStatus;
  label: string;
  count: number;
}

export interface TimeDemandSlot {
  /** Início do intervalo (HH:MM). Também é a chave estável. */
  key: string;
  label: string;
  /** Rótulo completo do intervalo, ex: 18:30–18:59. */
  fullLabel: string;
  minutes: number;
  total: number;
  share: number;
  statuses: TimeDemandStatusSlice[];
  commissions: string[];
  topWeekday: { label: string; count: number } | null;
  topMonth: { key: string; label: string; count: number } | null;
  eventIds: string[];
}

export interface TimeDemandTopSlot extends TimeDemandSlot {
  rank: number;
}

export interface TimeDemandInsight {
  id: string;
  text: string;
  eventIds: string[];
  label: string;
}

export interface TimeDemandCoverage {
  withTime: number;
  eligible: number;
  missingIds: string[];
}

export interface TimeDemandModel {
  range: VolumeRange;
  preset: TimeDemandPreset;
  slots: TimeDemandSlot[];
  totalEvents: number;
  peakKey: string | null;
  topSlots: TimeDemandTopSlot[];
  insights: TimeDemandInsight[];
  coverage: TimeDemandCoverage;
  summary: string;
}

const STATUS_LABELS: Record<CronogramaStatus, string> = {
  planned: 'Planejado',
  confirmed: 'Confirmado',
  in_definition: 'Em definição',
  in_progress: 'Em andamento',
  blocked: 'Bloqueado',
  completed: 'Concluído',
  overdue: 'Atrasado',
  cancelled: 'Cancelado',
  rescheduled: 'Reprogramado',
  undated: 'Sem data',
};

/** Janela operacional: 07:30 até 20:00, em intervalos de 30 minutos. */
export const DAY_START_MINUTES = 7 * 60 + 30;
export const DAY_END_MINUTES = 20 * 60;
const SLOT_SIZE = 30;

export function minutesToLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${`${hour}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}`;
}

export function buildTimeSlotKeys(): string[] {
  const keys: string[] = [];
  for (let minutes = DAY_START_MINUTES; minutes <= DAY_END_MINUTES; minutes += SLOT_SIZE) {
    keys.push(minutesToLabel(minutes));
  }
  return keys;
}

export function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * Converte o horário de início em um intervalo de 30 minutos.
 * Horários fora da janela são agrupados nas pontas (antes de 07:30 → 07:30, após 20:00 → 20:00).
 */
export function resolveSlotKey(value: string | null | undefined): string | null {
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return null;
  const floored = Math.floor(minutes / SLOT_SIZE) * SLOT_SIZE;
  const clamped = Math.min(Math.max(floored, DAY_START_MINUTES), DAY_END_MINUTES);
  return minutesToLabel(clamped);
}

export function isEligibleForTimeDemand(
  event: Pick<CronogramaEvent, 'date' | 'status'>,
): boolean {
  if (event.status === 'cancelled') return false;
  return isValidDateKey(event.date);
}

export function hasUsableTime(event: Pick<CronogramaEvent, 'startTime'>): boolean {
  return parseTimeToMinutes(event.startTime) !== null;
}

function commissionNameOf(event: CronogramaEvent): string | null {
  const primary = event.commissionsRel?.find((link) => link.isPrimary)?.commissionName;
  return primary ?? event.commissionsRel?.[0]?.commissionName ?? event.commission ?? null;
}

function rankCounts(counts: Map<string, number>): { key: string; count: number }[] {
  return Array.from(counts.entries())
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count }));
}

/** Semana operacional de segunda a domingo. */
export function resolveTimeDemandRange(
  preset: Exclude<TimeDemandPreset, 'custom'>,
  todayKey: string,
): VolumeRange {
  const [year, month, day] = todayKey.slice(0, 10).split('-').map(Number);
  if (preset === 'week') {
    const base = new Date(year, month - 1, day);
    const offset = (base.getDay() + 6) % 7;
    const start = new Date(year, month - 1, day - offset);
    const end = new Date(year, month - 1, day - offset + 6);
    return { from: toDateKey(start), to: toDateKey(end) };
  }
  if (preset === 'month') {
    return {
      from: toDateKey(new Date(year, month - 1, 1)),
      to: toDateKey(new Date(year, month, 0)),
    };
  }
  if (preset === '12m') {
    return { from: toDateKey(new Date(year, 0, 1)), to: toDateKey(new Date(year, 12, 0)) };
  }
  // 6 meses: mês anterior, mês atual e os quatro seguintes.
  const startMonthIndex = month - 2;
  return {
    from: toDateKey(new Date(year, startMonthIndex, 1)),
    to: toDateKey(new Date(year, startMonthIndex + 6, 0)),
  };
}

export function formatRangeLabel(range: VolumeRange): string {
  const short = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
  return `${short(range.from)} a ${short(range.to)}`;
}

export function matchesTimeDemandFilters(
  event: CronogramaEvent,
  filters: TimeDemandFilters | undefined,
): boolean {
  if (!filters) return true;
  if (filters.commission && commissionNameOf(event) !== filters.commission) return false;
  if (filters.category && event.category !== filters.category) return false;
  if (filters.status && event.status !== filters.status) return false;
  return true;
}

export interface BuildTimeDemandOptions {
  events: CronogramaEvent[];
  range: VolumeRange;
  preset: TimeDemandPreset;
  filters?: TimeDemandFilters;
}

export function buildTimeDemandModel({
  events,
  range,
  preset,
  filters,
}: BuildTimeDemandOptions): TimeDemandModel {
  const inRange = events.filter((event) => {
    if (!isEligibleForTimeDemand(event)) return false;
    const date = event.date!.slice(0, 10);
    if (date < range.from || date > range.to) return false;
    return matchesTimeDemandFilters(event, filters);
  });

  const timed = inRange.filter(hasUsableTime);
  const missingIds = inRange.filter((event) => !hasUsableTime(event)).map((event) => event.id);

  const grouped = new Map<string, CronogramaEvent[]>();
  for (const event of timed) {
    const key = resolveSlotKey(event.startTime)!;
    const bucket = grouped.get(key);
    if (bucket) bucket.push(event);
    else grouped.set(key, [event]);
  }

  const totalEvents = timed.length;

  const slots: TimeDemandSlot[] = buildTimeSlotKeys().map((key) => {
    const slotEvents = grouped.get(key) ?? [];
    const statusCounts = new Map<CronogramaStatus, number>();
    const commissionCounts = new Map<string, number>();
    const weekdayCounts = new Map<string, number>();
    const monthCounts = new Map<string, number>();

    for (const event of slotEvents) {
      statusCounts.set(event.status, (statusCounts.get(event.status) ?? 0) + 1);
      const commission = commissionNameOf(event);
      if (commission) commissionCounts.set(commission, (commissionCounts.get(commission) ?? 0) + 1);
      const date = event.date!.slice(0, 10);
      const weekday = formatWeekday(date);
      weekdayCounts.set(weekday, (weekdayCounts.get(weekday) ?? 0) + 1);
      const monthKey = date.slice(0, 7);
      monthCounts.set(monthKey, (monthCounts.get(monthKey) ?? 0) + 1);
    }

    const topWeekday = rankCounts(weekdayCounts)[0] ?? null;
    const topMonth = rankCounts(monthCounts)[0] ?? null;
    const [hour, minute] = key.split(':').map(Number);
    const minutes = hour * 60 + minute;

    return {
      key,
      label: key,
      fullLabel: `${key}–${minutesToLabel(minutes + SLOT_SIZE - 1)}`,
      minutes,
      total: slotEvents.length,
      share: totalEvents > 0 ? Math.round((slotEvents.length / totalEvents) * 100) : 0,
      statuses: Array.from(statusCounts.entries())
        .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
        .map(([status, count]) => ({ status, label: STATUS_LABELS[status], count })),
      commissions: rankCounts(commissionCounts).slice(0, 2).map((item) => item.key),
      topWeekday: topWeekday ? { label: topWeekday.key, count: topWeekday.count } : null,
      topMonth: topMonth
        ? {
          key: topMonth.key,
          label: `${getMonthLabel(Number(topMonth.key.slice(5, 7)) - 1)}/${topMonth.key.slice(2, 4)}`,
          count: topMonth.count,
        }
        : null,
      eventIds: slotEvents.map((event) => event.id),
    };
  });

  const ranked = [...slots]
    .filter((slot) => slot.total > 0)
    // Empate resolvido pelo horário mais cedo.
    .sort((a, b) => (b.total - a.total) || (a.minutes - b.minutes));

  const topSlots: TimeDemandTopSlot[] = ranked
    .slice(0, 5)
    .map((slot, index) => ({ ...slot, rank: index + 1 }));

  return {
    range,
    preset,
    slots,
    totalEvents,
    peakKey: ranked[0]?.key ?? null,
    topSlots,
    insights: buildTimeDemandInsights(slots, ranked, totalEvents, preset),
    coverage: { withTime: totalEvents, eligible: inRange.length, missingIds },
    summary: buildTimeDemandSummary(slots, totalEvents),
  };
}

function buildTimeDemandSummary(slots: TimeDemandSlot[], totalEvents: number): string {
  if (totalEvents === 0) return 'Nenhum evento com horário definido no período selecionado.';
  const detail = slots
    .filter((slot) => slot.total > 0)
    .map((slot) => `${slot.label}: ${slot.total}`)
    .join('; ');
  return `${totalEvents} eventos com horário no período, agrupados em intervalos de 30 minutos. ${detail}.`;
}

const PERIOD_WINDOWS: { id: string; label: string; from: number; to: number }[] = [
  { id: 'manha', label: 'entre 7h e 12h', from: DAY_START_MINUTES, to: 12 * 60 - 1 },
  { id: 'tarde', label: 'entre 12h e 17h', from: 12 * 60, to: 17 * 60 - 1 },
  { id: 'noite', label: 'entre 17h e 20h', from: 17 * 60, to: DAY_END_MINUTES },
];

function buildTimeDemandInsights(
  slots: TimeDemandSlot[],
  ranked: TimeDemandSlot[],
  totalEvents: number,
  preset: TimeDemandPreset,
): TimeDemandInsight[] {
  const insights: TimeDemandInsight[] = [];
  if (totalEvents === 0) return insights;

  const peak = ranked[0];
  if (peak) {
    const scope = preset === 'week' ? 'da semana' : preset === 'month' ? 'do mês' : 'do período';
    insights.push({
      id: 'peak',
      text: `${peak.label} concentra o maior volume ${scope}, com ${peak.total} ${peak.total === 1 ? 'evento' : 'eventos'}.`,
      eventIds: peak.eventIds,
      label: `Horário ${peak.label}`,
    });
  }

  const windows = PERIOD_WINDOWS.map((window) => {
    const inside = slots.filter((slot) => slot.minutes >= window.from && slot.minutes <= window.to);
    return {
      ...window,
      total: inside.reduce((sum, slot) => sum + slot.total, 0),
      eventIds: inside.flatMap((slot) => slot.eventIds),
    };
  });
  const busiestWindow = [...windows].sort((a, b) => b.total - a.total)[0];
  if (busiestWindow && busiestWindow.total > 0) {
    const share = Math.round((busiestWindow.total / totalEvents) * 100);
    insights.push({
      id: 'window',
      text: `${share}% dos eventos estão distribuídos ${busiestWindow.label}.`,
      eventIds: busiestWindow.eventIds,
      label: `Faixa ${busiestWindow.label}`,
    });
  }

  if (insights.length < 3 && peak) {
    if ((preset === 'week' || preset === 'month') && peak.topWeekday && peak.topWeekday.count > 1) {
      insights.push({
        id: 'weekday',
        text: `${capitalize(peak.topWeekday.label)} apresenta a maior demanda no horário das ${peak.label}.`,
        eventIds: peak.eventIds,
        label: `Horário ${peak.label}`,
      });
    } else if ((preset === '6m' || preset === '12m' || preset === 'custom') && peak.topMonth) {
      insights.push({
        id: 'month',
        text: `${peak.topMonth.label} é o mês que mais alimenta o pico das ${peak.label}.`,
        eventIds: peak.eventIds,
        label: `Horário ${peak.label}`,
      });
    }
  }

  if (insights.length < 3) {
    const idle = findIdleWindow(slots);
    if (idle) {
      insights.push({
        id: 'idle',
        text: `O intervalo entre ${idle.from} e ${idle.to} apresenta baixa utilização.`,
        eventIds: [],
        label: `Intervalo ${idle.from}–${idle.to}`,
      });
    }
  }

  return insights.slice(0, 3);
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Maior sequência contígua de intervalos vazios com pelo menos 2 horas. */
function findIdleWindow(slots: TimeDemandSlot[]): { from: string; to: string } | null {
  let best: { start: number; end: number } | null = null;
  let start: number | null = null;
  slots.forEach((slot, index) => {
    if (slot.total === 0) {
      if (start === null) start = index;
      const length = index - start + 1;
      if (!best || length > best.end - best.start + 1) best = { start, end: index };
    } else {
      start = null;
    }
  });
  if (!best) return null;
  const window = best as { start: number; end: number };
  const length = window.end - window.start + 1;
  if (length < 4) return null;
  return {
    from: slots[window.start].label,
    to: minutesToLabel(slots[window.end].minutes + SLOT_SIZE),
  };
}

export function isValidTimeDemandRange(range: VolumeRange): boolean {
  return isValidDateKey(range.from) && isValidDateKey(range.to) && range.from <= range.to;
}

export function collectFilterOptions(events: CronogramaEvent[]): {
  commissions: string[];
  categories: string[];
  statuses: { value: CronogramaStatus; label: string }[];
} {
  const commissions = new Set<string>();
  const categories = new Set<string>();
  const statuses = new Set<CronogramaStatus>();
  for (const event of events) {
    if (!isEligibleForTimeDemand(event)) continue;
    const commission = commissionNameOf(event);
    if (commission) commissions.add(commission);
    if (event.category) categories.add(event.category);
    statuses.add(event.status);
  }
  return {
    commissions: Array.from(commissions).sort((a, b) => a.localeCompare(b)),
    categories: Array.from(categories).sort((a, b) => a.localeCompare(b)),
    statuses: Array.from(statuses)
      .sort((a, b) => STATUS_LABELS[a].localeCompare(STATUS_LABELS[b]))
      .map((status) => ({ value: status, label: STATUS_LABELS[status] })),
  };
}

export { parseDate };
