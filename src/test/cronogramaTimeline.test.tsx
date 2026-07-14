// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CronogramaTimelineBoard } from '@/components/cronograma-eventos/CronogramaTimelineBoard';
import { EventDrawer } from '@/components/cronograma-eventos/EventDrawer';
import type { CronogramaEvent, CronogramaFilters } from '@/components/cronograma-eventos/types';
import {
  buildCronogramaYearSummaries,
  getFirstRelevantMonthForYear,
  isCycleMonthKey,
} from '@/lib/cronograma-cycle';
import {
  deriveOperationalStatus,
  filterTimelineEvents,
  getInitialTimelineMonth,
  getSubeventProgress,
  getTimelineSnapshot,
  getTodayKey,
  groupTimelineByMonth,
} from '@/lib/cronograma-timeline';

const baseEvent: CronogramaEvent = {
  id: 'event-2026-july',
  sourceKey: 'official-event-2026-july',
  title: 'Reunião da Comissão Central',
  summary: 'Definição institucional da programação e dos responsáveis.',
  date: '2026-07-15',
  year: 2026,
  category: 'governanca',
  status: 'planned',
  priority: 'high',
  kind: 'meeting',
  owner: 'Comissão Central',
  commission: 'Comissão Central',
  location: 'Parque de Exposições',
  isOfficial: true,
  sourceSheet: 'Cronograma oficial 2026',
};

const cycleEvents: CronogramaEvent[] = [
  baseEvent,
  { ...baseEvent, id: 'event-2026-august', sourceKey: 'official-event-2026-august', title: 'Marco de agosto', date: '2026-08-10' },
  { ...baseEvent, id: 'event-2027-february', sourceKey: 'official-event-2027-february', title: 'Abertura do ciclo 2027', date: '2027-02-09', year: 2027 },
  { ...baseEvent, id: 'event-2028-january', sourceKey: 'official-event-2028-january', title: 'Reta final 2028', date: '2028-01-18', year: 2028 },
];

const undated2027: CronogramaEvent = {
  ...baseEvent,
  id: 'event-2027-undated',
  sourceKey: 'official-event-2027-undated',
  title: 'Definição contratual de 2027',
  date: null,
  year: 2027,
  status: 'undated',
};

const emptyFilters: CronogramaFilters = {
  query: '',
  year: 'all',
  month: 'all',
  category: 'all',
  status: 'all',
  priority: 'all',
  period: 'all',
  commission: 'all',
  owner: 'all',
  officialOnly: false,
  missingOwner: false,
  fromDate: '',
  toDate: '',
};

const scrollIntoView = vi.fn();
let observerRecords: Array<{ callback: IntersectionObserverCallback; observed: Set<Element> }> = [];

function setMediaMatches({ mobile = false, reducedMotion = false } = {}) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('max-width') ? mobile : query.includes('prefers-reduced-motion') ? reducedMotion : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function triggerIntersection(target: Element, ratio = 0.8) {
  const record = [...observerRecords].reverse().find((item) => item.observed.has(target));
  if (!record) throw new Error('Elemento não observado');
  act(() => {
    record.callback([{
      target,
      isIntersecting: true,
      intersectionRatio: ratio,
    } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
}

function renderTimeline(overrides: Partial<React.ComponentProps<typeof CronogramaTimelineBoard>> = {}) {
  return render(
    <CronogramaTimelineBoard
      events={cycleEvents}
      allEvents={cycleEvents}
      onOpen={vi.fn()}
      onClearFilters={vi.fn()}
      onReturnToFullCycle={vi.fn()}
      onOpenUndated={vi.fn()}
      todayKey="2026-07-14"
      {...overrides}
    />,
  );
}

beforeAll(() => {
  Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0),
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    value: (id: number) => window.clearTimeout(id),
  });

  class IntersectionObserverMock {
    readonly record: { callback: IntersectionObserverCallback; observed: Set<Element> };

    constructor(callback: IntersectionObserverCallback) {
      this.record = { callback, observed: new Set() };
      observerRecords.push(this.record);
    }

    observe(element: Element) { this.record.observed.add(element); }
    disconnect() { this.record.observed.clear(); }
    unobserve(element: Element) { this.record.observed.delete(element); }
    takeRecords() { return []; }
  }

  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: IntersectionObserverMock,
  });
});

beforeEach(() => {
  observerRecords = [];
  scrollIntoView.mockClear();
  setMediaMatches();
});

describe('domínio temporal do cronograma', () => {
  it('deriva atrasos sem alterar estados finais ou itens sem data', () => {
    expect(deriveOperationalStatus(baseEvent, '2026-07-14')).toBe('planned');
    expect(deriveOperationalStatus({ ...baseEvent, date: '2026-07-13' }, '2026-07-14')).toBe('overdue');
    expect(deriveOperationalStatus({ ...baseEvent, date: '2026-07-13', status: 'completed' }, '2026-07-14')).toBe('completed');
    expect(deriveOperationalStatus({ ...baseEvent, date: null }, '2026-07-14')).toBe('undated');
    expect(deriveOperationalStatus({ ...baseEvent, date: null, status: 'cancelled' }, '2026-07-14')).toBe('cancelled');
  });

  it('respeita a virada de dia no fuso de São Paulo', () => {
    expect(getTodayKey(new Date('2026-07-15T02:30:00.000Z'))).toBe('2026-07-14');
    expect(getTodayKey(new Date('2026-07-15T03:30:00.000Z'))).toBe('2026-07-15');
  });

  it('abre o mês atual ou o mês futuro mais próximo e agrupa em ordem cronológica', () => {
    const events = [
      { ...baseEvent, id: 'august', date: '2026-08-02' },
      { ...baseEvent, id: 'july', date: '2026-07-20' },
      { ...baseEvent, id: 'undated', date: null },
    ];
    expect(getInitialTimelineMonth(events, '2026-07-14')).toBe('2026-07');
    expect(Array.from(groupTimelineByMonth(events).keys())).toEqual(['2026-07', '2026-08']);
    expect(getInitialTimelineMonth(events.filter((event) => event.id !== 'july'), '2026-07-14')).toBe('2026-08');
  });

  it('escolhe o mês mais relevante de cada etapa do ciclo', () => {
    expect(getFirstRelevantMonthForYear(cycleEvents, 2026, '2026-07-14')).toBe('2026-07');
    expect(getFirstRelevantMonthForYear(cycleEvents, 2027, '2026-07-14')).toBe('2027-02');
    expect(getFirstRelevantMonthForYear(cycleEvents, 2026, '2028-07-14')).toBe('2026-08');
  });

  it('agrega totais reais e resultados filtrados por ano', () => {
    const summaries = buildCronogramaYearSummaries([...cycleEvents, undated2027], [baseEvent, undated2027]);
    expect(summaries.map(({ year, total, filtered, undatedFiltered }) => ({ year, total, filtered, undatedFiltered }))).toEqual([
      { year: 2026, total: 2, filtered: 1, undatedFiltered: 0 },
      { year: 2027, total: 2, filtered: 1, undatedFiltered: 1 },
      { year: 2028, total: 1, filtered: 0, undatedFiltered: 0 },
    ]);
  });

  it('recalcula o ciclo quando um evento muda de ano', () => {
    const before = buildCronogramaYearSummaries(cycleEvents, cycleEvents);
    const moved = cycleEvents.map((event) => event.id === baseEvent.id ? { ...event, year: 2027, date: '2027-07-15' } : event);
    const after = buildCronogramaYearSummaries(moved, moved);
    expect(before.find((item) => item.year === 2026)?.total).toBe(2);
    expect(after.find((item) => item.year === 2026)?.total).toBe(1);
    expect(after.find((item) => item.year === 2027)?.total).toBe(2);
  });

  it('valida meses persistidos no histórico da URL', () => {
    expect(isCycleMonthKey('2027-02')).toBe(true);
    expect(isCycleMonthKey('2029-02')).toBe(false);
    expect(isCycleMonthKey('2027-13')).toBe(false);
  });

  it('combina busca sem acento, período, responsabilidade e origem oficial', () => {
    const events = [
      baseEvent,
      { ...baseEvent, id: 'manual', title: 'Ação comercial', commission: 'Comercial', owner: undefined, isOfficial: false, date: '2026-08-20' },
    ];
    expect(filterTimelineEvents(events, { ...emptyFilters, query: 'comissao central' }, '2026-07-14')).toEqual([baseEvent]);
    expect(filterTimelineEvents(events, { ...emptyFilters, officialOnly: true }, '2026-07-14')).toEqual([baseEvent]);
    expect(filterTimelineEvents(events, { ...emptyFilters, missingOwner: true }, '2026-07-14')).toEqual([events[1]]);
    expect(filterTimelineEvents(events, { ...emptyFilters, period: '30days' }, '2026-07-14')).toEqual([baseEvent]);
    expect(filterTimelineEvents([
      baseEvent,
      { ...baseEvent, id: 'completed', status: 'completed' },
    ], { ...emptyFilters, period: 'upcoming' }, '2026-07-14')).toEqual([baseEvent]);
  });

  it('calcula progresso de checklist e próxima ação oficial', () => {
    const event = {
      ...baseEvent,
      subevents: [
        { title: 'Concluído', status: 'completed' as const },
        { title: 'Pendente', status: 'planned' as const },
        { title: 'Cancelado', status: 'cancelled' as const },
      ],
    };
    expect(getSubeventProgress(event)).toEqual({ completed: 1, total: 2, percent: 50 });
    expect(getTimelineSnapshot([event], '2026-07-14')).toMatchObject({
      nextOfficialAction: event,
      overdue: 0,
      undated: 0,
    });
  });
});

describe('navegador do ciclo na linha do tempo', () => {
  it('renderiza ano atual, etapas, totais e mantém botões semanticamente focáveis', () => {
    renderTimeline();
    const cycle = screen.getByRole('list', { name: 'Anos do planejamento institucional' });
    const yearButtons = within(cycle).getAllByRole('button');
    expect(yearButtons).toHaveLength(3);
    expect(yearButtons[0]).toHaveAttribute('aria-current', 'step');
    expect(yearButtons[0]).toHaveAccessibleName(/2026 selecionado, etapa Estruturação, 2 eventos, ano atual/i);
    expect(yearButtons[1]).toHaveAccessibleName(/Selecionar 2027, etapa Consolidação, 1 evento/i);
    yearButtons[1].focus();
    expect(yearButtons[1]).toHaveFocus();
  });

  it('seleciona 2027 e 2028 rapidamente, abre o mês correto e não limpa filtros', async () => {
    const onClearFilters = vi.fn();
    const onPositionChange = vi.fn();
    renderTimeline({ onClearFilters, onPositionChange });
    const preservedMonthNode = document.querySelector('[data-focus-key="month:2026-07"]');

    fireEvent.click(screen.getByRole('button', { name: /Selecionar 2027, etapa Consolidação/i }));
    expect(screen.getByRole('button', { name: /2027 selecionado/i })).toHaveAttribute('aria-current', 'step');
    expect(within(screen.getByRole('navigation', { name: 'Navegação entre períodos' })).getByText('Fevereiro de 2027')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Selecionar 2028, etapa Realização/i }));
    expect(screen.getByRole('button', { name: /2028 selecionado/i })).toHaveAttribute('aria-current', 'step');
    expect(onClearFilters).not.toHaveBeenCalled();
    expect(document.querySelector('[data-focus-key="month:2026-07"]')).toBe(preservedMonthNode);
    expect(onPositionChange).toHaveBeenLastCalledWith(expect.objectContaining({
      year: 2028,
      month: '2028-01',
      reason: 'year-select',
      replace: false,
    }));
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });

  it('mostra contagem filtrada e recuperação explícita sem trocar o ano', () => {
    const onClearFilters = vi.fn();
    const onReturnToFullCycle = vi.fn();
    renderTimeline({
      events: cycleEvents.filter((event) => event.year === 2026),
      onClearFilters,
      onReturnToFullCycle,
    });

    const year2027 = screen.getByRole('button', { name: /Selecionar 2027, etapa Consolidação, 1 evento, 0 correspondem/i });
    expect(year2027).toBeEnabled();
    fireEvent.click(year2027);
    expect(screen.getByText('Nenhum evento encontrado em 2027 com os filtros atuais.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /2027 selecionado/i })).toHaveAttribute('aria-current', 'step');

    fireEvent.click(screen.getByRole('button', { name: 'Ver todo o ciclo' }));
    expect(onReturnToFullCycle).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: /Limpar filtros/i }));
    expect(onClearFilters).toHaveBeenCalledOnce();
  });

  it('distingue ano com eventos apenas sem data', () => {
    const onOpenUndated = vi.fn();
    renderTimeline({
      events: [undated2027],
      allEvents: [...cycleEvents, undated2027],
      requestedYear: 2027,
      onOpenUndated,
    });

    expect(screen.getByText('1 evento atende aos filtros, mas ainda não possui data.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver sem data' }));
    expect(onOpenUndated).toHaveBeenCalledOnce();
  });

  it('mantém anos sem eventos visíveis, identificados e indisponíveis', () => {
    renderTimeline({ events: [baseEvent], allEvents: [baseEvent] });
    const unavailableYear = screen.getByRole('button', {
      name: /Selecionar 2027, etapa Consolidação, 0 eventos, ano indisponível/i,
    });
    expect(unavailableYear).toBeDisabled();
  });

  it('reconcilia uma URL persistida para um ano que ficou indisponível', async () => {
    const onPositionChange = vi.fn();
    renderTimeline({
      events: [baseEvent],
      allEvents: [baseEvent],
      requestedYear: 2027,
      onPositionChange,
    });

    expect(screen.getByRole('button', { name: /2026 selecionado/i })).toHaveAttribute('aria-current', 'step');
    await waitFor(() => expect(onPositionChange).toHaveBeenCalledWith(expect.objectContaining({
      year: 2026,
      reason: 'reconcile',
      replace: true,
    })));
  });

  it('Ir para hoje restaura julho de 2026 e atualiza o ano', () => {
    renderTimeline({ requestedYear: 2027, requestedMonth: '2027-02' });
    fireEvent.click(screen.getByRole('button', { name: 'Ir para o período de hoje' }));
    expect(screen.getByRole('button', { name: /2026 selecionado/i })).toHaveAttribute('aria-current', 'step');
    expect(within(screen.getByRole('navigation', { name: 'Navegação entre períodos' })).getByText('Julho de 2026')).toBeInTheDocument();
  });

  it('restaura ano e mês ao navegar pelo histórico externo', async () => {
    const { rerender } = renderTimeline();
    rerender(
      <CronogramaTimelineBoard
        events={cycleEvents}
        allEvents={cycleEvents}
        onOpen={vi.fn()}
        onClearFilters={vi.fn()}
        requestedYear={2028}
        requestedMonth="2028-01"
        todayKey="2026-07-14"
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /2028 selecionado/i })).toHaveAttribute('aria-current', 'step'));
    expect(within(screen.getByRole('navigation', { name: 'Navegação entre períodos' })).getByText('Janeiro de 2028')).toBeInTheDocument();
  });

  it('acompanha rolagem manual e bloqueia realimentação durante navegação programática', () => {
    renderTimeline();
    fireEvent.wheel(window);
    const month2027 = document.querySelector('[data-focus-key="month:2027-02"]');
    if (!month2027) throw new Error('Mês 2027 não renderizado');
    triggerIntersection(month2027);
    expect(screen.getByRole('button', { name: /2027 selecionado/i })).toHaveAttribute('aria-current', 'step');

    fireEvent.click(screen.getByRole('button', { name: /Selecionar 2028, etapa Realização/i }));
    const month2026 = document.querySelector('[data-focus-key="month:2026-07"]');
    if (!month2026) throw new Error('Mês 2026 não renderizado');
    triggerIntersection(month2026, 1);
    expect(screen.getByRole('button', { name: /2028 selecionado/i })).toHaveAttribute('aria-current', 'step');
  });

  it('sincroniza filtros temporais com o ano do período principal', async () => {
    const { rerender } = renderTimeline({ requestedYear: 2028, requestedMonth: '2028-01' });
    rerender(
      <CronogramaTimelineBoard
        events={[baseEvent]}
        allEvents={cycleEvents}
        onOpen={vi.fn()}
        onClearFilters={vi.fn()}
        onReturnToFullCycle={vi.fn()}
        onOpenUndated={vi.fn()}
        requestedYear={2028}
        requestedMonth="2028-01"
        temporalFocusKey="period:week"
        todayKey="2026-07-14"
      />,
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /2026 selecionado/i })).toHaveAttribute('aria-current', 'step'));
  });

  it('mantém o ano após refetch e abertura de detalhes', () => {
    const onOpen = vi.fn();
    const { rerender } = renderTimeline({ onOpen });
    fireEvent.click(screen.getByRole('button', { name: /Selecionar 2027, etapa Consolidação/i }));

    const refreshed = cycleEvents.map((event) => ({ ...event }));
    rerender(
      <CronogramaTimelineBoard
        events={refreshed}
        allEvents={refreshed}
        onOpen={onOpen}
        onClearFilters={vi.fn()}
        onReturnToFullCycle={vi.fn()}
        onOpenUndated={vi.fn()}
        todayKey="2026-07-14"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Abertura do ciclo 2027/i }));
    expect(onOpen).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /2027 selecionado/i })).toHaveAttribute('aria-current', 'step');
  });

  it('usa movimento reduzido e mantém um único seletor horizontal no mobile', async () => {
    setMediaMatches({ mobile: true, reducedMotion: true });
    renderTimeline();
    scrollIntoView.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Selecionar 2027, etapa Consolidação/i }));

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView.mock.calls.some(([options]) => options?.behavior === 'auto')).toBe(true);
    expect(scrollIntoView.mock.calls.some(([options]) => options?.inline === 'nearest')).toBe(true);
    expect(screen.getAllByRole('list', { name: 'Anos do planejamento institucional' })).toHaveLength(1);
  });
});

describe('componentes críticos preservados', () => {
  it('seleciona um evento na Timeline', () => {
    const onOpen = vi.fn();
    renderTimeline({ events: [baseEvent], allEvents: cycleEvents, onOpen });
    fireEvent.click(screen.getByRole('button', { name: /Reunião da Comissão Central/i }));
    expect(onOpen).toHaveBeenCalledWith(baseEvent);
  });

  it('separa leitura e edição e protege alterações não salvas', async () => {
    const onOpenChange = vi.fn();
    const onSave = vi.fn();
    render(
      <EventDrawer
        event={baseEvent}
        open
        onOpenChange={onOpenChange}
        onSave={onSave}
        canManage
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Leitura executiva')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Editar evento/i }));
    expect(await screen.findByText('Modo de edição')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Título alterado' } });
    await waitFor(() => expect(screen.getByText('Há alterações ainda não salvas.')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Fechar detalhes do evento' }));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Descartar alterações?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Continuar editando/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByText('Modo de edição')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
