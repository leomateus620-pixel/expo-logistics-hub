import type {
  CronogramaEvent,
  CronogramaStatus,
} from '@/components/cronograma-eventos/types';
import {
  formatLongDate,
  formatWeekday,
  getMonthLabel,
  parseDate,
} from '@/components/cronograma-eventos/dateUtils';

export type VolumePeriodPreset = '3m' | '6m' | '12m' | 'custom';
export type VolumeGranularity = 'day' | 'week' | 'month';

export interface VolumeRange {
  /** ISO date (yyyy-mm-dd) inclusive. */
  from: string;
  /** ISO date (yyyy-mm-dd) inclusive. */
  to: string;
}

export interface VolumeStatusSlice {
  status: CronogramaStatus;
  label: string;
  count: number;
}

export interface VolumeBucket {
  key: string;
  label: string;
  fullLabel: string;
  total: number;
  completed: number;
  active: number;
  overdue: number;
  eventIds: string[];
  /** Percentage variation against the previous bucket, null when unavailable. */
  changePercent: number | null;
  /** Only for month buckets: the busiest day inside the month. */
  busiestDay: { date: string; count: number } | null;
  /** Range covered by the bucket (used by weekly granularity). */
  range: VolumeRange;
}

export interface VolumeDayBucket {
  /** ISO date. */
  date: string;
  day: number;
  label: string;
  fullLabel: string;
  weekday: string;
  total: number;
  completed: number;
  active: number;
  overdue: number;
  statuses: VolumeStatusSlice[];
  commissions: string[];
  eventIds: string[];
}

export interface VolumeBusiestDay {
  rank: number;
  date: string;
  fullLabel: string;
  weekday: string;
  count: number;
  commission: string | null;
  eventIds: string[];
}

export interface VolumeInsight {
  id: string;
  text: string;
  eventIds: string[];
  label: string;
}

export interface EventVolumeModel {
  granularity: VolumeGranularity;
  suggestedGranularity: VolumeGranularity;
  range: VolumeRange;
  buckets: VolumeBucket[];
  totalEvents: number;
  busiestDays: VolumeBusiestDay[];
  insights: VolumeInsight[];
  /** True when the requested configuration produces too many bars to read. */
  dense: boolean;
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

const MAX_READABLE_BARS = 62;

export function isValidDateKey(value: string | null | undefined): value is string {
  if (!value) return false;
  const key = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [year, month, day] = key.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month - 1);
}

/** Normalized start date used as the single temporal reference of an event. */
export function getEventReferenceDate(
  event: Pick<CronogramaEvent, 'date'>,
): string | null {
  return isValidDateKey(event.date) ? event.date!.slice(0, 10) : null;
}

export function isEligibleForEventVolume(
  event: Pick<CronogramaEvent, 'date' | 'status'>,
): boolean {
  if (event.status === 'cancelled') return false;
  return getEventReferenceDate(event) !== null;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function monthShortLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return `${getMonthLabel(month - 1).slice(0, 3)}/${`${year}`.slice(2)}`;
}

function monthFullLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return `${getMonthLabel(month - 1)} de ${year}`;
}

function isCompleted(event: Pick<CronogramaEvent, 'status'>) {
  return event.status === 'completed';
}

function isOverdue(event: Pick<CronogramaEvent, 'status'>) {
  return event.status === 'overdue';
}

function commissionNameOf(event: CronogramaEvent): string | null {
  const primary = event.commissionsRel?.find((link) => link.isPrimary)?.commissionName;
  return primary ?? event.commissionsRel?.[0]?.commissionName ?? event.commission ?? null;
}

export function groupEventsByMonth(events: CronogramaEvent[]): Map<string, CronogramaEvent[]> {
  const map = new Map<string, CronogramaEvent[]>();
  for (const event of events) {
    if (!isEligibleForEventVolume(event)) continue;
    const key = monthKeyOf(getEventReferenceDate(event)!);
    const bucket = map.get(key);
    if (bucket) bucket.push(event);
    else map.set(key, [event]);
  }
  return map;
}

export function groupEventsByDay(events: CronogramaEvent[]): Map<string, CronogramaEvent[]> {
  const map = new Map<string, CronogramaEvent[]>();
  for (const event of events) {
    if (!isEligibleForEventVolume(event)) continue;
    const key = getEventReferenceDate(event)!;
    const bucket = map.get(key);
    if (bucket) bucket.push(event);
    else map.set(key, [event]);
  }
  return map;
}

export function getBusiestDates(
  events: CronogramaEvent[],
  limit = 3,
): VolumeBusiestDay[] {
  const byDay = groupEventsByDay(events);
  return Array.from(byDay.entries())
    .sort((a, b) => (b[1].length - a[1].length) || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([date, dayEvents], index) => ({
      rank: index + 1,
      date,
      fullLabel: formatLongDate(date),
      weekday: formatWeekday(date),
      count: dayEvents.length,
      commission: leadingCommission(dayEvents),
      eventIds: dayEvents.map((event) => event.id),
    }));
}

function leadingCommission(events: CronogramaEvent[]): string | null {
  const counts = new Map<string, number>();
  for (const event of events) {
    const name = commissionNameOf(event);
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort(
    (a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]),
  );
  return sorted[0]?.[0] ?? null;
}

function distinctCommissions(events: CronogramaEvent[]): string[] {
  const counts = new Map<string, number>();
  for (const event of events) {
    const name = commissionNameOf(event);
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

function statusSlices(events: CronogramaEvent[]): VolumeStatusSlice[] {
  const counts = new Map<CronogramaStatus, number>();
  for (const event of events) {
    counts.set(event.status, (counts.get(event.status) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({ status, label: STATUS_LABELS[status], count }));
}

/**
 * Janela operacional dos presets, a partir do mês corrente normalizado:
 * - `3m`: mês anterior, mês atual e próximo mês;
 * - `6m`: mês anterior, mês atual e os quatro meses seguintes;
 * - `12m`: janeiro a dezembro do ano corrente.
 * Todos os meses da janela aparecem, inclusive os sem eventos.
 */
export function resolvePresetRange(preset: Exclude<VolumePeriodPreset, 'custom'>, todayKey: string): VolumeRange {
  const [year, month] = todayKey.slice(0, 7).split('-').map(Number);
  if (preset === '12m') {
    return { from: toDateKey(new Date(year, 0, 1)), to: toDateKey(new Date(year, 12, 0)) };
  }
  const months = preset === '3m' ? 3 : 6;
  // O mês anterior sempre entra na janela para preservar a leitura do que acabou de ocorrer.
  const startMonthIndex = month - 2;
  const start = new Date(year, startMonthIndex, 1);
  const end = new Date(year, startMonthIndex + months, 0);
  return { from: toDateKey(start), to: toDateKey(end) };
}


export function isValidRange(range: VolumeRange): boolean {
  return (
    isValidDateKey(range.from)
    && isValidDateKey(range.to)
    && range.from <= range.to
  );
}

export function rangeDayCount(range: VolumeRange): number {
  const from = parseDate(range.from);
  const to = parseDate(range.to);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

export function suggestGranularity(range: VolumeRange): VolumeGranularity {
  const days = rangeDayCount(range);
  if (days <= 45) return 'day';
  if (days <= 180) return 'week';
  return 'month';
}

function bucketRanges(range: VolumeRange, granularity: VolumeGranularity): VolumeRange[] {
  const buckets: VolumeRange[] = [];
  if (granularity === 'month') {
    const [fromYear, fromMonth] = range.from.split('-').map(Number);
    const cursor = new Date(fromYear, fromMonth - 1, 1);
    while (toDateKey(cursor) <= range.to) {
      const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      buckets.push({ from: toDateKey(cursor), to: toDateKey(last) });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return buckets;
  }
  const step = granularity === 'week' ? 7 : 1;
  const cursor = parseDate(range.from);
  const end = parseDate(range.to);
  while (cursor.getTime() <= end.getTime()) {
    const start = new Date(cursor);
    const stop = new Date(cursor);
    stop.setDate(stop.getDate() + step - 1);
    if (stop.getTime() > end.getTime()) stop.setTime(end.getTime());
    buckets.push({ from: toDateKey(start), to: toDateKey(stop) });
    cursor.setDate(cursor.getDate() + step);
  }
  return buckets;
}

function labelForBucket(bucket: VolumeRange, granularity: VolumeGranularity) {
  if (granularity === 'month') {
    return {
      label: monthShortLabel(monthKeyOf(bucket.from)),
      fullLabel: monthFullLabel(monthKeyOf(bucket.from)),
      key: monthKeyOf(bucket.from),
    };
  }
  if (granularity === 'week') {
    const [, fromMonth, fromDay] = bucket.from.split('-');
    const [, toMonth, toDay] = bucket.to.split('-');
    return {
      label: `${fromDay}/${fromMonth}`,
      fullLabel: `Semana de ${fromDay}/${fromMonth} a ${toDay}/${toMonth}`,
      key: bucket.from,
    };
  }
  const [, month, day] = bucket.from.split('-');
  return {
    label: `${day}/${month}`,
    fullLabel: formatLongDate(bucket.from),
    key: bucket.from,
  };
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export interface BuildEventVolumeOptions {
  events: CronogramaEvent[];
  range: VolumeRange;
  granularity: VolumeGranularity;
}

export function buildEventVolumeModel({
  events,
  range,
  granularity,
}: BuildEventVolumeOptions): EventVolumeModel {
  const eligible = events.filter(isEligibleForEventVolume);
  const inRange = eligible.filter((event) => {
    const date = getEventReferenceDate(event)!;
    return date >= range.from && date <= range.to;
  });

  const byDay = groupEventsByDay(inRange);
  const ranges = bucketRanges(range, granularity);
  const dense = ranges.length > MAX_READABLE_BARS;
  const suggested = suggestGranularity(range);

  const buckets: VolumeBucket[] = ranges.map((bucketRange) => {
    const bucketEvents: CronogramaEvent[] = [];
    for (const [date, dayEvents] of byDay) {
      if (date >= bucketRange.from && date <= bucketRange.to) bucketEvents.push(...dayEvents);
    }
    const { key, label, fullLabel } = labelForBucket(bucketRange, granularity);
    const busiest = Array.from(byDay.entries())
      .filter(([date]) => date >= bucketRange.from && date <= bucketRange.to)
      .sort((a, b) => (b[1].length - a[1].length) || a[0].localeCompare(b[0]))[0];

    return {
      key,
      label,
      fullLabel,
      total: bucketEvents.length,
      completed: bucketEvents.filter(isCompleted).length,
      overdue: bucketEvents.filter(isOverdue).length,
      active: bucketEvents.filter((event) => !isCompleted(event) && !isOverdue(event)).length,
      eventIds: bucketEvents.map((event) => event.id),
      changePercent: null,
      busiestDay: busiest ? { date: busiest[0], count: busiest[1].length } : null,
      range: bucketRange,
    };
  });

  for (let index = 1; index < buckets.length; index += 1) {
    buckets[index].changePercent = percentChange(buckets[index].total, buckets[index - 1].total);
  }

  const busiestDays = getBusiestDates(inRange, 3);
  // Total sempre derivado das barras visíveis, garantindo igualdade com o gráfico.
  const totalEvents = buckets.reduce((sum, bucket) => sum + bucket.total, 0);


  return {
    granularity,
    suggestedGranularity: suggested,
    range,
    buckets,
    totalEvents,
    busiestDays,
    insights: buildInsights(buckets, busiestDays, byDay, totalEvents, granularity),
    dense,
    summary: buildSummary(buckets, totalEvents, granularity),
  };
}

function buildSummary(
  buckets: VolumeBucket[],
  totalEvents: number,
  granularity: VolumeGranularity,
): string {
  if (totalEvents === 0) return 'Nenhum evento datado no período selecionado.';
  const unit = granularity === 'month' ? 'mês' : granularity === 'week' ? 'semana' : 'dia';
  const detail = buckets
    .filter((bucket) => bucket.total > 0)
    .map((bucket) => `${bucket.fullLabel}: ${bucket.total}`)
    .join('; ');
  return `${totalEvents} eventos no período, agrupados por ${unit}. ${detail}.`;
}

export function buildDayBuckets(
  events: CronogramaEvent[],
  monthKey: string,
): VolumeDayBucket[] {
  const [year, month] = monthKey.split('-').map(Number);
  const total = daysInMonth(year, month - 1);
  const byDay = groupEventsByDay(events);
  const days: VolumeDayBucket[] = [];
  for (let day = 1; day <= total; day += 1) {
    const date = `${monthKey}-${`${day}`.padStart(2, '0')}`;
    const dayEvents = byDay.get(date) ?? [];
    days.push({
      date,
      day,
      label: `${day}`.padStart(2, '0'),
      fullLabel: formatLongDate(date),
      weekday: formatWeekday(date),
      total: dayEvents.length,
      completed: dayEvents.filter(isCompleted).length,
      overdue: dayEvents.filter(isOverdue).length,
      active: dayEvents.filter((event) => !isCompleted(event) && !isOverdue(event)).length,
      statuses: statusSlices(dayEvents),
      commissions: distinctCommissions(dayEvents).slice(0, 3),
      eventIds: dayEvents.map((event) => event.id),
    });
  }
  return days;
}

function buildInsights(
  buckets: VolumeBucket[],
  busiestDays: VolumeBusiestDay[],
  byDay: Map<string, CronogramaEvent[]>,
  totalEvents: number,
  granularity: VolumeGranularity,
): VolumeInsight[] {
  const insights: VolumeInsight[] = [];
  if (totalEvents === 0) return insights;

  const ranked = [...buckets].sort((a, b) => (b.total - a.total) || a.key.localeCompare(b.key));
  const top = ranked[0];
  if (top && top.total > 0) {
    const share = Math.round((top.total / totalEvents) * 100);
    const unit = granularity === 'month' ? 'dos eventos do período' : 'do período';
    insights.push({
      id: 'concentration',
      text: `${top.fullLabel} concentra ${share}% ${unit}, com ${top.total} eventos.`,
      eventIds: top.eventIds,
      label: top.fullLabel,
    });
  }

  const busiest = busiestDays[0];
  if (busiest) {
    insights.push({
      id: 'busiest-day',
      text: `${busiest.fullLabel} é o dia com maior carga, com ${busiest.count} ${busiest.count === 1 ? 'evento' : 'eventos'}.`,
      eventIds: busiest.eventIds,
      label: busiest.fullLabel,
    });
    const commissions = distinctCommissions(byDay.get(busiest.date) ?? []);
    if (commissions.length > 1) {
      insights.push({
        id: 'busiest-commissions',
        text: `${commissions.length} comissões possuem eventos no dia mais movimentado.`,
        eventIds: busiest.eventIds,
        label: busiest.fullLabel,
      });
    }
  }

  if (insights.length < 3) {
    const withData = buckets.filter((bucket) => bucket.total > 0);
    const last = withData.at(-1);
    if (last && last.changePercent !== null && last.changePercent !== 0) {
      const direction = last.changePercent > 0 ? 'aumentou' : 'reduziu';
      insights.push({
        id: 'variation',
        text: `O volume ${direction} ${Math.abs(last.changePercent)}% em ${last.fullLabel} frente ao período anterior.`,
        eventIds: last.eventIds,
        label: last.fullLabel,
      });
    }
  }

  return insights.slice(0, 3);
}
