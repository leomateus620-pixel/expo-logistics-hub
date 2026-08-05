import { describe, expect, it } from 'vitest';

import type { CronogramaEvent } from '@/components/cronograma-eventos/types';
import {
  buildDayBuckets,
  buildEventVolumeModel,
  getBusiestDates,
  getEventReferenceDate,
  groupEventsByDay,
  groupEventsByMonth,
  isEligibleForEventVolume,
  isValidRange,
  resolvePresetRange,
  suggestGranularity,
} from '@/lib/cronograma-event-volume';

function event(
  id: string,
  date: string | null,
  overrides: Partial<CronogramaEvent> = {},
): CronogramaEvent {
  return {
    id,
    title: `Evento ${id}`,
    summary: '',
    date,
    year: date ? Number(date.slice(0, 4)) : 2026,
    category: 'governanca',
    status: 'planned',
    priority: 'medium',
    kind: 'event',
    ...overrides,
  };
}

const RANGE_2026 = { from: '2026-01-01', to: '2026-12-31' };

describe('elegibilidade e referência temporal', () => {
  it('exclui cancelados e datas inválidas, mantendo os demais status', () => {
    expect(isEligibleForEventVolume(event('a', '2026-08-18'))).toBe(true);
    expect(isEligibleForEventVolume(event('b', '2026-08-18', { status: 'cancelled' }))).toBe(false);
    expect(isEligibleForEventVolume(event('c', null, { status: 'undated' }))).toBe(false);
    expect(isEligibleForEventVolume(event('d', '2026-02-30'))).toBe(false);
    expect(isEligibleForEventVolume(event('e', '2026-08-18', { status: 'overdue' }))).toBe(true);
    expect(getEventReferenceDate(event('f', '2026-08-18T12:00:00Z'))).toBe('2026-08-18');
  });

  it('agrupa por mês e por dia contando cada evento uma única vez', () => {
    const events = [
      event('1', '2026-08-18'),
      event('2', '2026-08-18'),
      event('3', '2026-09-02', { endDate: '2026-09-06' }),
      event('4', null),
      event('5', '2026-08-01', { status: 'cancelled' }),
    ];

    expect(groupEventsByMonth(events).get('2026-08')?.length).toBe(2);
    expect(groupEventsByDay(events).get('2026-08-18')?.length).toBe(2);
    expect(groupEventsByDay(events).get('2026-09-04')).toBeUndefined();
  });
});

describe('períodos e granularidade', () => {
  it('inclui o mês anterior nos presets e o ano-calendário em 1 ano', () => {
    expect(resolvePresetRange('3m', '2026-08-05')).toEqual({ from: '2026-07-01', to: '2026-09-30' });
    expect(resolvePresetRange('6m', '2026-08-05')).toEqual({ from: '2026-07-01', to: '2026-12-31' });
    expect(resolvePresetRange('12m', '2026-12-31')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('atravessa a virada de ano nos presets', () => {
    expect(resolvePresetRange('3m', '2027-01-15')).toEqual({ from: '2026-12-01', to: '2027-02-28' });
    expect(resolvePresetRange('6m', '2026-12-10')).toEqual({ from: '2026-11-01', to: '2027-04-30' });
  });


  it('bloqueia intervalos inválidos e sugere a granularidade adequada', () => {
    expect(isValidRange({ from: '2026-08-10', to: '2026-08-01' })).toBe(false);
    expect(isValidRange({ from: '2026-08-01', to: '2026-08-01' })).toBe(true);
    expect(suggestGranularity({ from: '2026-08-01', to: '2026-08-20' })).toBe('day');
    expect(suggestGranularity({ from: '2026-08-01', to: '2026-11-01' })).toBe('week');
    expect(suggestGranularity({ from: '2026-01-01', to: '2026-12-31' })).toBe('month');
  });
});

describe('modelo de volume', () => {
  it('gera todos os meses do período, inclusive vazios, com variação encadeada', () => {
    const model = buildEventVolumeModel({
      events: [
        event('1', '2026-08-18'),
        event('2', '2026-08-18', { status: 'completed' }),
        event('3', '2026-09-10', { status: 'overdue' }),
        event('4', '2027-01-05'),
      ],
      range: { from: '2026-08-01', to: '2026-10-31' },
      granularity: 'month',
    });

    expect(model.buckets.map((bucket) => bucket.key)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(model.totalEvents).toBe(3);
    expect(model.buckets[0]).toMatchObject({ total: 2, completed: 1, active: 1, overdue: 0 });
    expect(model.buckets[0].busiestDay).toEqual({ date: '2026-08-18', count: 2 });
    expect(model.buckets[1].changePercent).toBe(-50);
    expect(model.buckets[2].total).toBe(0);
  });

  it('não quebra com dataset vazio', () => {
    const model = buildEventVolumeModel({ events: [], range: RANGE_2026, granularity: 'month' });
    expect(model.totalEvents).toBe(0);
    expect(model.busiestDays).toEqual([]);
    expect(model.insights).toEqual([]);
    expect(model.buckets.every((bucket) => bucket.total === 0)).toBe(true);
    expect(model.summary).toContain('Nenhum evento');
  });

  it('cobre virada de ano e granularidade semanal e diária', () => {
    const events = [event('1', '2026-12-30'), event('2', '2027-01-02')];
    const monthly = buildEventVolumeModel({
      events,
      range: { from: '2026-12-01', to: '2027-01-31' },
      granularity: 'month',
    });
    expect(monthly.buckets.map((bucket) => bucket.key)).toEqual(['2026-12', '2027-01']);

    const weekly = buildEventVolumeModel({
      events,
      range: { from: '2026-12-28', to: '2027-01-10' },
      granularity: 'week',
    });
    expect(weekly.buckets).toHaveLength(2);
    expect(weekly.buckets[0].total).toBe(2);
    expect(weekly.buckets[1].total).toBe(0);

    const daily = buildEventVolumeModel({
      events,
      range: { from: '2026-12-30', to: '2027-01-02' },
      granularity: 'day',
    });
    expect(daily.buckets).toHaveLength(4);
    expect(daily.buckets.map((bucket) => bucket.total)).toEqual([1, 0, 0, 1]);
  });

  it('marca densidade excessiva preservando as datas', () => {
    const model = buildEventVolumeModel({
      events: [],
      range: { from: '2026-01-01', to: '2026-12-31' },
      granularity: 'day',
    });
    expect(model.dense).toBe(true);
    expect(model.buckets).toHaveLength(365);
    expect(model.suggestedGranularity).toBe('month');
  });

  it('produz insights determinísticos a partir dos dados reais', () => {
    const model = buildEventVolumeModel({
      events: [
        event('1', '2026-08-18', { commission: 'Logística' }),
        event('2', '2026-08-18', { commission: 'Comunicação' }),
        event('3', '2026-08-18', { commission: 'Central' }),
        event('4', '2026-09-01'),
      ],
      range: { from: '2026-08-01', to: '2026-09-30' },
      granularity: 'month',
    });

    expect(model.insights.length).toBeGreaterThan(0);
    expect(model.insights[0].text).toContain('75%');
    expect(model.insights[1].text).toContain('3 eventos');
    expect(model.insights[2].text).toContain('3 comissões');
  });
});

describe('dias com maior concentração', () => {
  it('ordena por volume e desempata pela data mais antiga', () => {
    const days = getBusiestDates([
      event('1', '2026-09-10'),
      event('2', '2026-09-10'),
      event('3', '2026-08-05'),
      event('4', '2026-08-05'),
      event('5', '2026-07-01'),
    ]);

    expect(days.map((day) => day.date)).toEqual(['2026-08-05', '2026-09-10', '2026-07-01']);
    expect(days[0].rank).toBe(1);
    expect(days[0].count).toBe(2);
  });
});

describe('detalhamento diário', () => {
  it.each([
    ['2027-02', 28],
    ['2028-02', 29],
    ['2026-09', 30],
    ['2026-08', 31],
  ])('gera todos os dias de %s', (monthKey, expected) => {
    const days = buildDayBuckets([event('1', `${monthKey}-05`)], monthKey);
    expect(days).toHaveLength(expected);
    expect(days.at(-1)?.day).toBe(expected);
    expect(days.filter((day) => day.total === 0)).toHaveLength(expected - 1);
  });

  it('detalha status e comissões do dia', () => {
    const days = buildDayBuckets(
      [
        event('1', '2026-08-18', { status: 'completed', commission: 'Logística' }),
        event('2', '2026-08-18', { status: 'overdue', commission: 'Logística' }),
        event('3', '2026-08-18', { commission: 'Central' }),
      ],
      '2026-08',
    );
    const day = days.find((item) => item.day === 18)!;
    expect(day.total).toBe(3);
    expect(day.completed).toBe(1);
    expect(day.overdue).toBe(1);
    expect(day.active).toBe(1);
    expect(day.commissions).toEqual(['Logística', 'Central']);
    expect(day.statuses.reduce((sum, slice) => sum + slice.count, 0)).toBe(3);
  });
});
