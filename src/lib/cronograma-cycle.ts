import type { CronogramaEvent } from '@/components/cronograma-eventos/types';

export const CRONOGRAMA_CYCLE_YEARS = [2026, 2027, 2028] as const;

export type CronogramaCycleYear = (typeof CRONOGRAMA_CYCLE_YEARS)[number];

export interface CronogramaCycleStage {
  year: CronogramaCycleYear;
  stage: string;
  kicker: string;
  description: string;
}

export const CRONOGRAMA_CYCLE: readonly CronogramaCycleStage[] = [
  {
    year: 2026,
    stage: 'Estruturação',
    kicker: 'Fundação do ciclo',
    description: 'Governança, referências e primeiras definições constroem a base do planejamento institucional.',
  },
  {
    year: 2027,
    stage: 'Consolidação',
    kicker: 'Integração operacional',
    description: 'Comissões, contratos e entregas convergem em uma cadência compartilhada.',
  },
  {
    year: 2028,
    stage: 'Realização',
    kicker: 'Reta final',
    description: 'Decisões críticas e operação desembocam na realização da Fenasoja.',
  },
] as const;

const cycleByYear = new Map(CRONOGRAMA_CYCLE.map((stage) => [stage.year, stage]));

export interface CronogramaYearSummary extends CronogramaCycleStage {
  total: number;
  filtered: number;
  datedTotal: number;
  datedFiltered: number;
  undatedTotal: number;
  undatedFiltered: number;
  available: boolean;
  hasMatches: boolean;
}

export function isCronogramaCycleYear(value: unknown): value is CronogramaCycleYear {
  const year = typeof value === 'string' && value.trim() ? Number(value) : value;
  return CRONOGRAMA_CYCLE_YEARS.includes(year as CronogramaCycleYear);
}

export function getCronogramaCycleStage(year: number): CronogramaCycleStage {
  return cycleByYear.get(year as CronogramaCycleYear) ?? CRONOGRAMA_CYCLE.at(-1)!;
}

export function getCurrentCycleYear(todayKey: string): CronogramaCycleYear | null {
  const year = Number(todayKey.slice(0, 4));
  return isCronogramaCycleYear(year) ? year : null;
}

export function getClosestCycleYear(todayKey: string): CronogramaCycleYear {
  const year = Number(todayKey.slice(0, 4));
  if (year <= CRONOGRAMA_CYCLE_YEARS[0]) return CRONOGRAMA_CYCLE_YEARS[0];
  if (year >= CRONOGRAMA_CYCLE_YEARS.at(-1)!) return CRONOGRAMA_CYCLE_YEARS.at(-1)!;
  return isCronogramaCycleYear(year) ? year : CRONOGRAMA_CYCLE_YEARS[0];
}

export function isCycleMonthKey(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
  return isCronogramaCycleYear(Number(value.slice(0, 4)));
}

export function buildCronogramaYearSummaries(
  allEvents: CronogramaEvent[],
  filteredEvents: CronogramaEvent[],
): CronogramaYearSummary[] {
  const totals = new Map<CronogramaCycleYear, { total: number; dated: number }>();
  const filtered = new Map<CronogramaCycleYear, { total: number; dated: number }>();

  CRONOGRAMA_CYCLE_YEARS.forEach((year) => {
    totals.set(year, { total: 0, dated: 0 });
    filtered.set(year, { total: 0, dated: 0 });
  });

  allEvents.forEach((event) => {
    if (!isCronogramaCycleYear(event.year)) return;
    const value = totals.get(event.year)!;
    value.total += 1;
    if (event.date) value.dated += 1;
  });

  filteredEvents.forEach((event) => {
    if (!isCronogramaCycleYear(event.year)) return;
    const value = filtered.get(event.year)!;
    value.total += 1;
    if (event.date) value.dated += 1;
  });

  return CRONOGRAMA_CYCLE.map((stage) => {
    const total = totals.get(stage.year)!;
    const matching = filtered.get(stage.year)!;
    return {
      ...stage,
      total: total.total,
      filtered: matching.total,
      datedTotal: total.dated,
      datedFiltered: matching.dated,
      undatedTotal: total.total - total.dated,
      undatedFiltered: matching.total - matching.dated,
      available: total.total > 0,
      hasMatches: matching.total > 0,
    };
  });
}

export function getFirstRelevantMonthForYear(
  events: CronogramaEvent[],
  year: CronogramaCycleYear,
  todayKey: string,
): string | null {
  const months = Array.from(new Set(
    events
      .filter((event): event is CronogramaEvent & { date: string } => event.year === year && Boolean(event.date))
      .map((event) => event.date.slice(0, 7)),
  )).sort();

  if (!months.length) return null;

  const todayMonth = todayKey.slice(0, 7);
  const currentYear = Number(todayKey.slice(0, 4));
  if (year === currentYear) {
    if (months.includes(todayMonth)) return todayMonth;
    return months.find((month) => month >= todayMonth) ?? months.at(-1)!;
  }

  return year < currentYear ? months.at(-1)! : months[0];
}
