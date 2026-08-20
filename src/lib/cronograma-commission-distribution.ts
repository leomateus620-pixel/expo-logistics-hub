import type { CronogramaEvent } from '@/components/cronograma-eventos/types';
import type { OrgUnit } from '@/lib/org-units';
import {
  isOverdueEvent,
  isCompletedEvent,
} from '@/lib/cronograma-dashboard-selectors';
import {
  isEligibleForEventVolume,
  getEventReferenceDate,
  toDateKey,
  type VolumeRange,
} from '@/lib/cronograma-event-volume';

export type DistributionPeriodPreset = 'month' | '3m' | '6m' | '12m' | 'cycle' | 'custom';
export type DistributionStatusFilter = 'all' | 'planned' | 'completed' | 'overdue';

export const UNASSIGNED_KEY = '__sem-comissao__';

export interface CommissionSlice {
  key: string;
  name: string;
  /** 'comissao' | 'assessoria' | outros tipos do registro oficial. */
  type: string;
  responsibles: string[];
  count: number;
  percentage: number;
  color: string;
  eventIds: string[];
  /** True quando a área existe no registro oficial. */
  official: boolean;
}

export interface CommissionDistributionModel {
  slices: CommissionSlice[];
  /** Apenas fatias com pelo menos 1 evento — alimenta o donut. */
  chartSlices: CommissionSlice[];
  ranking: CommissionSlice[];
  totalEvents: number;
  totalLinks: number;
  range: VolumeRange;
}

/** Paleta determinística ancorada em azul profundo, ouro e laranja. */
const PALETTE = Array.from({ length: 12 }, (_, index) => `var(--cronograma-dist-${index + 1})`);

const NEUTRAL_COLOR = 'var(--cronograma-dist-neutral)';

export function normalizeKey(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function hashIndex(value: string, size: number): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 100_000_007;
  }
  return hash % size;
}

export function colorForKey(key: string): string {
  if (key === UNASSIGNED_KEY) return NEUTRAL_COLOR;
  return PALETTE[hashIndex(key, PALETTE.length)];
}

export function resolveDistributionRange(
  preset: Exclude<DistributionPeriodPreset, 'custom'>,
  todayKey: string,
): VolumeRange {
  const [year, month] = todayKey.slice(0, 7).split('-').map(Number);
  if (preset === 'month') {
    return {
      from: toDateKey(new Date(year, month - 1, 1)),
      to: toDateKey(new Date(year, month, 0)),
    };
  }
  if (preset === 'cycle') {
    return { from: '2026-01-01', to: '2028-12-31' };
  }
  if (preset === '12m') {
    return { from: toDateKey(new Date(year, 0, 1)), to: toDateKey(new Date(year, 12, 0)) };
  }
  const months = preset === '3m' ? 3 : 6;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month - 1 + months, 0);
  return { from: toDateKey(start), to: toDateKey(end) };
}

export function yearRange(year: number): VolumeRange {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function matchesStatusFilter(
  event: CronogramaEvent,
  filter: DistributionStatusFilter,
  todayKey: string,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'completed') return isCompletedEvent(event);
  if (filter === 'overdue') return isOverdueEvent(event, todayKey);
  // planned: ainda não concluído e não atrasado
  return !isCompletedEvent(event) && !isOverdueEvent(event, todayKey);
}

/** Chaves de comissão únicas de um evento, sem duplicidade de vínculos legados. */
export function commissionKeysOf(event: CronogramaEvent): { key: string; label: string }[] {
  const found = new Map<string, string>();
  event.commissionsRel?.forEach((link) => {
    const label = link.commissionName?.trim() || link.commissionSlug?.trim();
    if (!label) return;
    const key = normalizeKey(link.commissionSlug) || normalizeKey(label);
    if (!key || found.has(key)) return;
    found.set(key, label);
  });
  if (found.size === 0) {
    const legacy = event.commission?.trim();
    if (legacy) found.set(normalizeKey(legacy), legacy);
  }
  if (found.size === 0) return [{ key: UNASSIGNED_KEY, label: 'Sem comissão definida' }];
  return Array.from(found.entries()).map(([key, label]) => ({ key, label }));
}

export interface BuildCommissionDistributionOptions {
  events: CronogramaEvent[];
  units: OrgUnit[];
  range: VolumeRange;
  status: DistributionStatusFilter;
  /** Recorte opcional por área; vazio = todas. */
  selectedKeys?: string[];
  todayKey: string;
}

export function buildCommissionDistributionModel({
  events,
  units,
  range,
  status,
  selectedKeys = [],
  todayKey,
}: BuildCommissionDistributionOptions): CommissionDistributionModel {
  const selected = new Set(selectedKeys);

  const scoped = events.filter((event) => {
    if (!isEligibleForEventVolume(event)) return false;
    const date = getEventReferenceDate(event);
    if (!date || date < range.from || date > range.to) return false;
    return matchesStatusFilter(event, status, todayKey);
  });

  const registry = new Map<string, OrgUnit>();
  units.forEach((unit) => {
    const slugKey = normalizeKey(unit.slug);
    const nameKey = normalizeKey(unit.name);
    if (slugKey) registry.set(slugKey, unit);
    if (nameKey && !registry.has(nameKey)) registry.set(nameKey, unit);
  });

  const buckets = new Map<string, { name: string; eventIds: string[] }>();
  const distinctEvents = new Set<string>();

  scoped.forEach((event) => {
    commissionKeysOf(event).forEach(({ key, label }) => {
      const unit = registry.get(key);
      const canonicalKey = unit ? normalizeKey(unit.slug) || normalizeKey(unit.name) : key;
      if (selected.size > 0 && !selected.has(canonicalKey)) return;
      const bucket = buckets.get(canonicalKey) ?? { name: unit?.name ?? label, eventIds: [] };
      if (!bucket.eventIds.includes(event.id)) bucket.eventIds.push(event.id);
      buckets.set(canonicalKey, bucket);
      distinctEvents.add(event.id);
    });
  });

  const totalLinks = Array.from(buckets.values())
    .reduce((sum, bucket) => sum + bucket.eventIds.length, 0);

  const slices: CommissionSlice[] = [];
  const consumed = new Set<string>();

  units.forEach((unit) => {
    const key = normalizeKey(unit.slug) || normalizeKey(unit.name);
    if (!key || consumed.has(key)) return;
    if (selected.size > 0 && !selected.has(key)) return;
    consumed.add(key);
    const bucket = buckets.get(key);
    const count = bucket?.eventIds.length ?? 0;
    slices.push({
      key,
      name: unit.name,
      type: unit.type,
      responsibles: unit.responsibles
        .slice()
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .map((person) => person.displayName)
        .filter(Boolean),
      count,
      percentage: totalLinks > 0 ? (count / totalLinks) * 100 : 0,
      color: colorForKey(key),
      eventIds: bucket?.eventIds ?? [],
      official: true,
    });
  });

  buckets.forEach((bucket, key) => {
    if (consumed.has(key)) return;
    slices.push({
      key,
      name: bucket.name,
      type: key === UNASSIGNED_KEY ? 'indefinido' : 'externo',
      responsibles: [],
      count: bucket.eventIds.length,
      percentage: totalLinks > 0 ? (bucket.eventIds.length / totalLinks) * 100 : 0,
      color: colorForKey(key),
      eventIds: bucket.eventIds,
      official: false,
    });
  });

  slices.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
  const chartSlices = slices.filter((slice) => slice.count > 0);

  return {
    slices,
    chartSlices,
    ranking: chartSlices.slice(0, 3),
    totalEvents: distinctEvents.size,
    totalLinks,
    range,
  };
}
