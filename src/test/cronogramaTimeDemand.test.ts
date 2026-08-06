import { describe, expect, it } from 'vitest';

import type { CronogramaEvent } from '@/components/cronograma-eventos/types';
import {
  buildTimeDemandModel,
  buildTimeSlotKeys,
  resolveSlotKey,
  resolveTimeDemandRange,
} from '@/lib/cronograma-time-demand';

function event(
  id: string,
  date: string | null,
  startTime?: string,
  overrides: Partial<CronogramaEvent> = {},
): CronogramaEvent {
  return {
    id,
    title: `Evento ${id}`,
    summary: '',
    date,
    startTime,
    year: date ? Number(date.slice(0, 4)) : 2026,
    category: 'governanca',
    status: 'planned',
    priority: 'medium',
    kind: 'event',
    ...overrides,
  } as CronogramaEvent;
}

const RANGE = { from: '2026-08-01', to: '2026-08-31' };

describe('slots de 30 minutos', () => {
  it('cobre 07:30 até 20:00', () => {
    const keys = buildTimeSlotKeys();
    expect(keys[0]).toBe('07:30');
    expect(keys.at(-1)).toBe('20:00');
    expect(keys).toHaveLength(26);
  });

  it('agrupa o horário no intervalo correto e nas pontas', () => {
    expect(resolveSlotKey('08:00')).toBe('08:00');
    expect(resolveSlotKey('08:20')).toBe('08:00');
    expect(resolveSlotKey('08:30')).toBe('08:30');
    expect(resolveSlotKey('08:55')).toBe('08:30');
    expect(resolveSlotKey('07:15')).toBe('07:30');
    expect(resolveSlotKey('21:40')).toBe('20:00');
    expect(resolveSlotKey('19:00:00')).toBe('19:00');
    expect(resolveSlotKey(null)).toBeNull();
    expect(resolveSlotKey('abc')).toBeNull();
  });
});

describe('períodos', () => {
  it('resolve semana, mês, 6 meses e ano', () => {
    expect(resolveTimeDemandRange('week', '2026-08-05')).toEqual({ from: '2026-08-03', to: '2026-08-09' });
    expect(resolveTimeDemandRange('month', '2026-08-05')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(resolveTimeDemandRange('6m', '2026-08-05')).toEqual({ from: '2026-07-01', to: '2026-12-31' });
    expect(resolveTimeDemandRange('12m', '2026-08-05')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
});

describe('modelo de demanda por horário', () => {
  it('conta apenas eventos válidos com horário', () => {
    const model = buildTimeDemandModel({
      preset: 'month',
      range: RANGE,
      events: [
        event('a', '2026-08-04', '09:10'),
        event('b', '2026-08-11', '09:25'),
        event('c', '2026-08-05', '18:30'),
        event('cancelado', '2026-08-06', '09:00', { status: 'cancelled' }),
        event('sem-hora', '2026-08-07'),
        event('fora', '2026-09-10', '09:00'),
      ],
    });

    expect(model.totalEvents).toBe(3);
    expect(model.slots).toHaveLength(26);
    expect(model.slots.find((slot) => slot.key === '09:00')?.total).toBe(2);
    expect(model.peakKey).toBe('09:00');
    expect(model.coverage).toMatchObject({ withTime: 3, eligible: 4 });
    expect(model.coverage.missingIds).toEqual(['sem-hora']);
  });

  it('ordena o Top 5 por volume e desempata pelo horário mais cedo', () => {
    const model = buildTimeDemandModel({
      preset: 'month',
      range: RANGE,
      events: [
        event('1', '2026-08-04', '18:30'),
        event('2', '2026-08-05', '08:00'),
      ],
    });
    expect(model.topSlots.map((slot) => slot.key)).toEqual(['08:00', '18:30']);
    expect(model.topSlots[0].rank).toBe(1);
    expect(model.topSlots[0].share).toBe(50);
  });

  it('gera até três insights não repetidos', () => {
    const model = buildTimeDemandModel({
      preset: 'month',
      range: RANGE,
      events: [
        event('1', '2026-08-04', '18:30'),
        event('2', '2026-08-11', '18:30'),
        event('3', '2026-08-18', '18:30'),
        event('4', '2026-08-05', '09:00'),
      ],
    });
    expect(model.insights.length).toBeGreaterThan(0);
    expect(model.insights.length).toBeLessThanOrEqual(3);
    expect(model.insights[0].text).toContain('18:30');
    expect(new Set(model.insights.map((insight) => insight.id)).size).toBe(model.insights.length);
  });

  it('não quebra sem dados', () => {
    const model = buildTimeDemandModel({ preset: 'week', range: RANGE, events: [] });
    expect(model.totalEvents).toBe(0);
    expect(model.topSlots).toEqual([]);
    expect(model.insights).toEqual([]);
    expect(model.peakKey).toBeNull();
    expect(model.summary).toContain('Nenhum evento');
  });

  it('aplica filtros de comissão, categoria e status', () => {
    const events = [
      event('1', '2026-08-04', '09:00', { commission: 'Central' }),
      event('2', '2026-08-05', '09:00', { commission: 'Logística', status: 'completed' }),
    ];
    expect(buildTimeDemandModel({
      preset: 'custom', range: RANGE, events, filters: { commission: 'Central' },
    }).totalEvents).toBe(1);
    expect(buildTimeDemandModel({
      preset: 'custom', range: RANGE, events, filters: { status: 'completed' },
    }).totalEvents).toBe(1);
    expect(buildTimeDemandModel({
      preset: 'custom', range: RANGE, events, filters: { category: 'operacional' },
    }).totalEvents).toBe(0);
  });
});
