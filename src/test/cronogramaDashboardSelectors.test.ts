import { describe, expect, it } from 'vitest';
import type { CronogramaEvent } from '@/components/cronograma-eventos/types';
import {
  buildCronogramaDashboardModel,
  calculateReadinessIndex,
  deduplicateDashboardLogs,
  getEventDeadline,
  isCompletionLog,
  isDateChangeLog,
  isOverdueEvent,
  type CronogramaDashboardLog,
} from '@/lib/cronograma-dashboard-selectors';
import { filterTimelineEvents } from '@/lib/cronograma-timeline';

const completeQuality = {
  date: true,
  responsible: true,
  commission: true,
  location: true,
  description: true,
  priority: true,
  status: true,
  updatedAt: true,
};

function event(
  id: string,
  overrides: Partial<CronogramaEvent> = {},
): CronogramaEvent {
  return {
    id,
    title: `Evento ${id}`,
    summary: 'Descrição operacional auditável.',
    date: '2026-08-10',
    endDate: '2026-08-10',
    year: 2026,
    category: 'governanca',
    status: 'planned',
    priority: 'medium',
    kind: 'event',
    location: 'Parque de Exposições',
    owner: 'Responsável principal',
    commission: 'Comissão Central',
    updatedAt: '2026-07-20T12:00:00Z',
    dataQuality: { ...completeQuality },
    ...overrides,
  };
}

function log(
  id: string,
  eventId: string,
  overrides: Partial<CronogramaDashboardLog> = {},
): CronogramaDashboardLog {
  return {
    id,
    eventId,
    entityType: 'event',
    entityId: eventId,
    action: 'updated',
    previousValue: {},
    newValue: {},
    userId: 'user-1',
    userLabel: 'Gestora da comissão',
    createdAt: '2026-07-20T12:00:00Z',
    ...overrides,
  };
}

describe('seletores executivos do cronograma', () => {
  it('normaliza o prazo e calcula atraso sem depender do status visual', () => {
    const invalidRange = event('range', {
      date: '2026-08-10',
      endDate: '2026-08-01',
      status: 'in_progress',
    });
    const overdue = event('overdue', {
      date: '2026-06-10',
      endDate: '2026-06-12',
      status: 'in_progress',
    });

    expect(getEventDeadline(invalidRange)).toBe('2026-08-10');
    expect(isOverdueEvent(overdue, '2026-07-31')).toBe(true);
    expect(isOverdueEvent({ ...overdue, status: 'completed' }, '2026-07-31')).toBe(false);
  });

  it('aplica a fórmula auditável e renormaliza o componente sem timestamp', () => {
    const events = [
      event('completed', {
        status: 'completed',
        priority: 'critical',
        date: '2026-06-01',
        endDate: '2026-06-01',
      }),
      event('on-time', {
        status: 'in_progress',
        date: '2026-08-01',
        endDate: '2026-08-01',
      }),
      event('late-critical', {
        status: 'in_progress',
        priority: 'critical',
        date: '2026-06-20',
        endDate: '2026-06-20',
        owner: undefined,
        dataQuality: { ...completeQuality, responsible: false },
      }),
      event('undated', {
        status: 'undated',
        date: null,
        endDate: null,
        owner: undefined,
        updatedAt: null,
        dataQuality: {
          ...completeQuality,
          date: false,
          responsible: false,
          updatedAt: false,
        },
      }),
    ];

    const readiness = calculateReadinessIndex(events, '2026-07-31');
    const byKey = Object.fromEntries(
      readiness.components.map((component) => [component.key, component]),
    );

    expect(readiness.score).toBe(42);
    expect(readiness.classification).toBe('Crítico');
    expect(readiness.availableWeight).toBeCloseTo(0.95);
    expect(byKey.completion.score).toBe(0.25);
    expect(byKey.schedule.score).toBe(0.5);
    expect(byKey.criticalControl.score).toBe(0.5);
    expect(byKey.responsibleCompleteness.score).toBeCloseTo(1 / 3);
    expect(byKey.dateCompleteness.score).toBe(0.75);
    expect(byKey.recentUpdates.available).toBe(false);
  });

  it('usa presença da fonte para qualidade, sem aceitar fallbacks visuais', () => {
    const fallbackRich = event('fallback-rich', {
      owner: 'Texto de fallback',
      commission: 'Comissão sintetizada',
      summary: 'Resumo sintetizado',
      location: 'Local herdado',
      dataQuality: {
        ...completeQuality,
        responsible: false,
        commission: false,
        description: false,
        location: false,
      },
    });

    const model = buildCronogramaDashboardModel(
      [fallbackRich],
      [],
      { todayKey: '2026-07-31', logStatus: 'empty' },
    );

    expect(model.kpis.missingResponsible.value).toBe(1);
    expect(model.dataQuality.percentage).toBe(43);
    expect(
      model.dataQuality.breakdown.find((item) => item.key === 'responsible'),
    ).toMatchObject({ missing: 1, eventIds: ['fallback-rich'] });
    expect(model.dataQuality.incompleteEventIds).toEqual(['fallback-rich']);
  });

  it('posiciona conclusões pelo histórico real e identifica o fallback estimado', () => {
    const real = event('real', {
      status: 'completed',
      date: '2026-01-10',
      endDate: '2026-01-10',
      updatedAt: '2026-03-21T14:00:00Z',
    });
    const estimated = event('estimated', {
      status: 'completed',
      date: '2026-01-20',
      endDate: '2026-01-20',
      updatedAt: '2026-02-05T14:00:00Z',
    });
    const completionLog = log('completion', 'real', {
      previousValue: { status: 'in_progress' },
      newValue: { status: 'completed' },
      createdAt: '2026-03-12T13:30:00Z',
    });

    const model = buildCronogramaDashboardModel(
      [real, estimated],
      [completionLog],
      { todayKey: '2026-07-31', logStatus: 'ready' },
    );
    const january = model.plannedCompleted.series.find((point) => point.month === '2026-01');
    const february = model.plannedCompleted.series.find((point) => point.month === '2026-02');
    const march = model.plannedCompleted.series.find((point) => point.month === '2026-03');

    expect(january).toMatchObject({ planned: 2, completed: 0, deviation: -2 });
    expect(february).toMatchObject({ planned: 2, completed: 1, deviation: -1 });
    expect(march).toMatchObject({ planned: 2, completed: 2, deviation: 0 });
    expect(model.plannedCompleted.actualCompletionCount).toBe(1);
    expect(model.plannedCompleted.estimatedCompletionCount).toBe(1);
  });

  it('detecta mudanças reais, ignora subeventos nas métricas do evento e consolida duplicatas legadas', () => {
    const mainDateChange = log('main-date', 'event-a', {
      previousValue: { start_date: '2026-05-01', end_date: '2026-05-01' },
      newValue: { start_date: '2026-05-10', end_date: '2026-05-10' },
    });
    const subeventRpc = log('sub-rpc', 'event-a', {
      entityType: 'subevent',
      entityId: 'sub-1',
      action: 'updated',
      previousValue: { start_date: '2026-06-01' },
      newValue: { start_date: '2026-06-02' },
      createdAt: '2026-07-20T12:00:00.125Z',
    });
    const subeventTrigger = log('sub-trigger', 'event-a', {
      entityType: 'event',
      entityId: 'sub-1',
      action: 'subevent_updated',
      previousValue: { start_date: '2026-06-01' },
      newValue: { start_date: '2026-06-02' },
      createdAt: '2026-07-20T12:00:00.900Z',
    });

    expect(isDateChangeLog(mainDateChange)).toBe(true);
    expect(isDateChangeLog(subeventRpc)).toBe(false);
    expect(isCompletionLog({
      ...subeventRpc,
      previousValue: { status: 'in_progress' },
      newValue: { status: 'completed' },
    })).toBe(false);
    expect(deduplicateDashboardLogs([subeventTrigger, subeventRpc])).toHaveLength(1);

    const model = buildCronogramaDashboardModel(
      [event('event-a')],
      [mainDateChange, subeventRpc, subeventTrigger],
      { todayKey: '2026-07-31', logStatus: 'ready' },
    );
    expect(model.activity.series[0].dateChanges).toBe(1);
    expect(model.activity.overall.topReprogrammed[0]).toMatchObject({
      reprogramments: 1,
      originalDate: '2026-05-01',
    });
  });

  it('atribui cada evento somente à comissão primária e expõe participações adicionais', () => {
    const shared = event('shared', {
      commission: 'Comissão A',
      commissionsRel: [
        {
          commissionId: 'a',
          commissionName: 'Comissão A',
          commissionSlug: 'comissao-a',
          isPrimary: true,
        },
        {
          commissionId: 'b',
          commissionName: 'Comissão B',
          commissionSlug: 'comissao-b',
          isPrimary: false,
        },
      ],
    });
    const model = buildCronogramaDashboardModel(
      [shared],
      [],
      { todayKey: '2026-07-31', logStatus: 'empty' },
    );

    expect(model.commissions).toHaveLength(1);
    expect(model.commissions[0]).toMatchObject({
      name: 'Comissão A',
      total: 1,
      participatingCommissions: ['Comissão B'],
    });
    expect(
      Object.values(model.commissions[0].segments)
        .reduce((total, segment) => total + segment.count, 0),
    ).toBe(1);
  });

  it('exclui subeventos cancelados do progresso dos grandes eventos', () => {
    const major = event('major', {
      isMain: true,
      priority: 'critical',
      subevents: [
        { id: 'done', title: 'Concluído', status: 'completed', date: '2026-07-01' },
        { id: 'open', title: 'Pendente', status: 'planned', date: '2026-08-01' },
        { id: 'cancelled', title: 'Cancelado', status: 'cancelled', date: '2026-06-01' },
      ],
    });
    const model = buildCronogramaDashboardModel(
      [major],
      [],
      { todayKey: '2026-07-31', logStatus: 'empty' },
    );

    expect(model.majorEvents[0]).toMatchObject({
      completedSubevents: 1,
      totalSubevents: 2,
      progressPercentage: 50,
      overdueSubevents: 0,
      nextSubevent: 'Pendente',
    });
  });

  it('preserva as coleções de entrada durante todos os cálculos', () => {
    const events = [
      event('one'),
      event('two', { status: 'cancelled' }),
    ];
    const logs = [log('one-log', 'one')];
    const eventsSnapshot = structuredClone(events);
    const logsSnapshot = structuredClone(logs);

    buildCronogramaDashboardModel(
      events,
      logs,
      { todayKey: '2026-07-31', logStatus: 'ready' },
    );

    expect(events).toEqual(eventsSnapshot);
    expect(logs).toEqual(logsSnapshot);
  });

  it('aplica o recorte exato do drill-down antes dos demais filtros', () => {
    const selected = event('selected', {
      date: '2026-06-01',
      endDate: '2026-06-01',
      status: 'in_progress',
    });
    const unrelated = event('unrelated', {
      date: '2026-06-01',
      endDate: '2026-06-01',
      status: 'in_progress',
    });

    const filtered = filterTimelineEvents(
      [selected, unrelated],
      {
        query: '',
        year: 'all',
        month: 'all',
        category: 'all',
        status: 'all',
        priority: 'all',
        period: 'overdue',
        commission: 'all',
        owner: 'all',
        officialOnly: false,
        missingOwner: false,
        fromDate: '',
        toDate: '',
        scopeEventIds: ['selected'],
        scopeLabel: 'Eventos atrasados',
      },
      '2026-07-31',
    );

    expect(filtered.map(({ id }) => id)).toEqual(['selected']);
  });
});
