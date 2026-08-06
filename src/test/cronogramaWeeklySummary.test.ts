import { describe, expect, it } from 'vitest';
import type { CronogramaEvent } from '@/lib/cronograma-eventos';
import {
  buildCollapsedLabel,
  buildWeeklySummary,
  computeEventDurationMinutes,
  formatDurationLabel,
  isEventLinkedToViewer,
  resolveWeeklyWindow,
} from '@/lib/cronograma-weekly-summary';

const VIEWER = { userId: 'user-1', displayName: 'Fabiano Soltis' };

function makeEvent(overrides: Partial<CronogramaEvent> = {}): CronogramaEvent {
  return {
    id: overrides.id ?? 'evt-1',
    sourceKey: overrides.sourceKey ?? 'evt-1',
    title: 'Reunião da Comissão Central',
    description: null,
    category: 'Governança',
    eventType: 'reuniao',
    sourceYear: 2026,
    startDate: '2026-08-03',
    endDate: '2026-08-03',
    status: 'planejado',
    priority: 'media',
    sourceSheet: 'Supabase',
    isOfficialSeed: false,
    hasExactDate: true,
    startTime: '09:00',
    endTime: '10:30',
    responsiblesRel: [{ userId: 'user-1', name: 'Fabiano Soltis', isPrimary: true }],
    ...overrides,
  } as CronogramaEvent;
}

const WEEK = { todayKey: '2026-08-05' }; // quarta-feira

describe('janela semanal', () => {
  it('vai de segunda a sexta da semana atual', () => {
    const window = resolveWeeklyWindow(WEEK);
    expect(window.startKey).toBe('2026-08-03');
    expect(window.endKey).toBe('2026-08-07');
    expect(window.isLastBusinessDay).toBe(false);
  });

  it('inclui o fim de semana quando configurado', () => {
    expect(resolveWeeklyWindow({ ...WEEK, includeWeekend: true }).endKey).toBe('2026-08-09');
  });

  it('marca sexta-feira como fechamento da semana', () => {
    expect(resolveWeeklyWindow({ todayKey: '2026-08-07' }).isLastBusinessDay).toBe(true);
  });
});

describe('vínculo com o usuário', () => {
  it('reconhece responsável relacional por id', () => {
    expect(isEventLinkedToViewer(makeEvent(), VIEWER)).toBe(true);
  });

  it('reconhece participante pelo nome, sem acento', () => {
    const event = makeEvent({ responsiblesRel: [{ name: 'fabiano soltis' }] });
    expect(isEventLinkedToViewer(event, VIEWER)).toBe(true);
  });

  it('reconhece responsável textual', () => {
    const event = makeEvent({ responsiblesRel: [], responsibleName: 'Fabiano Soltis' });
    expect(isEventLinkedToViewer(event, VIEWER)).toBe(true);
  });

  it('ignora eventos de terceiros', () => {
    const event = makeEvent({ responsiblesRel: [{ name: 'Outra Pessoa' }], responsibleName: 'Outra Pessoa' });
    expect(isEventLinkedToViewer(event, VIEWER)).toBe(false);
  });
});

describe('duração', () => {
  it('calcula intervalo simples', () => {
    expect(computeEventDurationMinutes({ startTime: '08:00', endTime: '09:30' })).toBe(90);
  });

  it('trata virada de meia-noite sem valor negativo', () => {
    expect(computeEventDurationMinutes({ startTime: '23:00', endTime: '00:30' })).toBe(90);
  });

  it('não inventa duração sem hora final', () => {
    expect(computeEventDurationMinutes({ startTime: '08:00', endTime: null })).toBeNull();
  });

  it('formata horas e minutos', () => {
    expect(formatDurationLabel(90)).toBe('1h30');
    expect(formatDurationLabel(120)).toBe('2h');
    expect(formatDurationLabel(45)).toBe('45min');
  });
});

describe('resumo semanal', () => {
  it('agrega apenas eventos elegíveis, sem duplicar', () => {
    const summary = buildWeeklySummary(
      [
        makeEvent(),
        makeEvent({ id: 'evt-1', sourceKey: 'evt-1' }), // duplicado
        makeEvent({ id: 'evt-2', startDate: '2026-08-05', startTime: '14:00', endTime: '16:00' }),
        makeEvent({ id: 'evt-3', status: 'cancelado' }),
        makeEvent({ id: 'evt-4', startDate: '2026-08-15' }), // fora da semana
        makeEvent({ id: 'evt-5', hasExactDate: false, startDate: null }),
        makeEvent({ id: 'evt-6', responsiblesRel: [{ name: 'Outra Pessoa' }], responsibleName: null }),
      ],
      VIEWER,
      WEEK,
    );

    expect(summary.eventCount).toBe(2);
    expect(summary.totalMinutes).toBe(210);
    expect(summary.daysWithEvents).toBe(2);
    expect(summary.eventIds).toEqual(['evt-1', 'evt-2']);
    expect(summary.days[0].weekdayLabel).toBe('Segunda-feira');
  });

  it('conta evento sem duração informada', () => {
    const summary = buildWeeklySummary(
      [makeEvent({ id: 'evt-9', endTime: null })],
      VIEWER,
      WEEK,
    );
    expect(summary.eventCount).toBe(1);
    expect(summary.eventsWithoutDuration).toBe(1);
    expect(buildCollapsedLabel(summary)).toContain('duração não informada');
  });

  it('retorna vazio para usuário sem eventos', () => {
    const summary = buildWeeklySummary([], VIEWER, WEEK);
    expect(summary.eventCount).toBe(0);
    expect(buildCollapsedLabel(summary)).toBe('Semana atual · nenhum evento');
  });

  it('usa rótulo de fechamento na sexta-feira', () => {
    const summary = buildWeeklySummary([makeEvent()], VIEWER, { todayKey: '2026-08-07' });
    expect(buildCollapsedLabel(summary)).toBe('Esta semana · 1 evento · 1h30 de agenda');
  });
});
