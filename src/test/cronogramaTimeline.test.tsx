// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { CronogramaTimelineBoard } from '@/components/cronograma-eventos/CronogramaTimelineBoard';
import { EventDrawer } from '@/components/cronograma-eventos/EventDrawer';
import type { CronogramaEvent, CronogramaFilters } from '@/components/cronograma-eventos/types';
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
  id: 'event-1',
  sourceKey: 'official-event-1',
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

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  class IntersectionObserverMock {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: IntersectionObserverMock,
  });
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

describe('componentes críticos da linha do tempo', () => {
  it('renderiza o mês, seleciona um evento e oferece recuperação no estado vazio', () => {
    const onOpen = vi.fn();
    const { rerender } = render(
      <CronogramaTimelineBoard events={[baseEvent]} onOpen={onOpen} onClearFilters={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Reunião da Comissão Central/i }));
    expect(onOpen).toHaveBeenCalledWith(baseEvent);

    const onClear = vi.fn();
    rerender(<CronogramaTimelineBoard events={[]} onOpen={onOpen} onClearFilters={onClear} />);
    expect(screen.getByText('Nenhum evento corresponde aos filtros')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Limpar filtros/i }));
    expect(onClear).toHaveBeenCalledOnce();
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
