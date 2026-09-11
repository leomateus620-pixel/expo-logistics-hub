import { describe, expect, it } from 'vitest';
import {
  buildDashboard,
  computeDuration,
  countEventsByMonth,
  createDefaultFilters,
  filterEvents,
  formatDayHeading,
  formatDayMonth,
  formatTimeRange,
  getInitials,
  getNextEvent,
  groupEventsByMonth,
} from '../lib/agenda-presentation';
import { mapCronogramaStatus, toAgendaEventViewModel } from '../adapters/cronograma.adapter';
import { buildWorkspaceNavigation, resolveWorkspaceSection } from '../lib/workspace-navigation';
import { FIXTURE_EVENTS, FIXTURE_TODAY } from '../fixtures/agenda.fixtures';

describe('agenda presentation helpers', () => {
  it('formats dates and times in the Agenda Fenasoja language', () => {
    expect(formatDayMonth('2026-09-22')).toBe('22 SET');
    expect(formatDayHeading('2026-09-22')).toBe('Terça-feira · 22 SET');
    expect(formatTimeRange('19:00', '21:30')).toBe('19:00 → 21:30');
    expect(formatTimeRange('19:00', null)).toBe('19:00');
    expect(computeDuration('19:00', '21:30')).toBe('2h30');
    expect(computeDuration('09:00', '10:00')).toBe('1h');
    expect(getInitials('Marina Ribeiro Wollmann Schneider')).toBe('MS');
  });

  it('groups events by month and day in chronological order', () => {
    const groups = groupEventsByMonth(FIXTURE_EVENTS);
    const monthKeys = groups.map((group) => group.monthKey);
    expect(monthKeys).toEqual([...monthKeys].sort());
    for (const group of groups) {
      expect(group.total).toBe(group.days.reduce((sum, day) => sum + day.events.length, 0));
      const dayKeys = group.days.map((day) => day.dateKey);
      expect(dayKeys).toEqual([...dayKeys].sort());
    }
  });

  it('filters by year, month, status tab and search without accents', () => {
    const base = createDefaultFilters(2026);
    const september = filterEvents(FIXTURE_EVENTS, { ...base, month: 9 }, FIXTURE_TODAY);
    expect(september.length).toBe(countEventsByMonth(FIXTURE_EVENTS, 2026)[9]);
    expect(september.every((event) => event.date.startsWith('2026-09'))).toBe(true);

    const completed = filterEvents(FIXTURE_EVENTS, { ...base, status: 'completed' }, FIXTURE_TODAY);
    expect(completed.every((event) => event.status === 'completed' || (event.endDate ?? event.date) < FIXTURE_TODAY)).toBe(true);

    const search = filterEvents(FIXTURE_EVENTS, { ...base, search: 'reuniao' }, FIXTURE_TODAY);
    expect(search.length).toBeGreaterThan(0);
    expect(search.every((event) => /reuni[aã]o/i.test(event.title) || /reuni[aã]o/i.test(event.description ?? ''))).toBe(true);
  });

  it('derives the compact dashboard and the next event', () => {
    const dashboard = buildDashboard(FIXTURE_EVENTS, 6, FIXTURE_TODAY);
    const next = getNextEvent(FIXTURE_EVENTS, FIXTURE_TODAY);
    expect(dashboard.nextEvent?.id).toBe(next?.id);
    expect(next?.date >= FIXTURE_TODAY).toBe(true);
    expect(dashboard.documents).toBe(6);
    expect(dashboard.upcoming + dashboard.completed).toBeLessThanOrEqual(FIXTURE_EVENTS.length);
  });
});

describe('workspace navigation', () => {
  it('builds section routes from the unit base path and resolves them back', () => {
    const items = buildWorkspaceNavigation('/comissoes/mercosul', { agenda: 3 });
    expect(items.map((item) => item.path)).toEqual([
      '/comissoes/mercosul/dashboard',
      '/comissoes/mercosul/agenda',
      '/comissoes/mercosul/documentos',
      '/comissoes/mercosul/equipe',
      '/comissoes/mercosul/tarefas',
    ]);
    expect(items.find((item) => item.id === 'agenda')?.count).toBe(3);
    expect(resolveWorkspaceSection('/comissoes/mercosul/agenda', '/comissoes/mercosul')).toBe('agenda');
    expect(resolveWorkspaceSection('/comissoes/mercosul/equipe/extra', '/comissoes/mercosul')).toBe('team');
    expect(resolveWorkspaceSection('/comissoes/mercosul', '/comissoes/mercosul')).toBe('overview');
  });
});

describe('cronograma adapter', () => {
  it('maps Agenda Fenasoja rows into event view models', () => {
    expect(mapCronogramaStatus('confirmed')).toBe('confirmed');
    expect(mapCronogramaStatus('planejado')).toBe('requested');
    expect(mapCronogramaStatus('cancelado')).toBe('cancelled');
    expect(mapCronogramaStatus(null)).toBe('draft');

    const event = toAgendaEventViewModel(
      {
        id: 'row-1',
        title: 'Reunião geral',
        start_date: '2026-10-02T00:00:00',
        end_date: '2026-10-03',
        start_time: '9:00:00',
        end_time: '11:30',
        status: 'completed',
        location: 'Casa Fenasoja',
        responsible_name: 'Eduardo Santos',
        commission_slug: 'assessoria-de-imprensa',
      },
      { self: { id: 'mercosul', name: 'Mercosul', type: 'comissao' } },
    );
    expect(event).toMatchObject({
      id: 'row-1',
      date: '2026-10-02',
      endDate: '2026-10-03',
      startTime: '09:00',
      endTime: '11:30',
      duration: '2h30',
      status: 'completed',
    });
    expect(event?.units?.[0]?.id).toBe('mercosul');
    expect(event?.people?.[0]?.name).toBe('Eduardo Santos');
    expect(toAgendaEventViewModel({ id: 'x', title: 'Sem data', start_date: null, status: null, location: null })).toBeNull();
  });
});
