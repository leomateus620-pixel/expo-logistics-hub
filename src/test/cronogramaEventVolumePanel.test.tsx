import type { PropsWithChildren } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import EventVolumePanel from '@/components/cronograma-eventos/dashboard/EventVolumePanel';
import type { CronogramaEvent } from '@/components/cronograma-eventos/types';

vi.mock('recharts', () => {
  const Element = ({ children }: PropsWithChildren) => <div>{children}</div>;
  return {
    ResponsiveContainer: ({ children }: PropsWithChildren) => (
      <div data-testid="responsive-chart">{children}</div>
    ),
    BarChart: ({ children }: PropsWithChildren) => <svg>{children}</svg>,
    Bar: Element,
    Cell: Element,
    CartesianGrid: Element,
    Tooltip: Element,
    XAxis: Element,
    YAxis: Element,
  };
});

function event(id: string, date: string | null, overrides: Partial<CronogramaEvent> = {}): CronogramaEvent {
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

const events = [
  event('a', '2026-08-18'),
  event('b', '2026-08-18', { status: 'completed' }),
  event('c', '2026-09-05'),
  event('cancelado', '2026-08-02', { status: 'cancelled' }),
  event('sem-data', null, { status: 'undated' }),
];

function renderPanel(onDrilldown = vi.fn()) {
  render(<EventVolumePanel events={events} todayKey="2026-08-05" onDrilldown={onDrilldown} />);
  return onDrilldown;
}

describe('Volume de eventos', () => {
  it('exibe apenas eventos elegíveis e permite trocar o período', () => {
    renderPanel();

    expect(screen.getByRole('heading', { name: 'Volume de eventos' })).toBeInTheDocument();
    expect(screen.getAllByText(/3 eventos/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: '1 ano' }));
    expect(screen.getByRole('button', { name: '1 ano' })).toHaveAttribute('data-active', 'true');
  });

  it('faz drill-down mensal e envia apenas os eventos daquele mês', () => {
    const onDrilldown = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: /agosto de 2026: 2 eventos/i }));

    const detail = screen.getByRole('region', { name: /Detalhe diário/i });
    expect(within(detail).getByRole('heading', { name: /agosto de 2026/i })).toBeInTheDocument();

    fireEvent.click(within(detail).getAllByRole('button')[1]);
    expect(onDrilldown).toHaveBeenCalledWith(
      expect.objectContaining({ view: 'timeline', eventIds: ['a', 'b'] }),
    );
  });

  it('lista os dias de maior concentração e abre o recorte do dia', () => {
    const onDrilldown = renderPanel();

    const top = screen.getByRole('region', { name: /Dias com maior concentração/i });
    const first = within(top).getAllByRole('button')[0];
    expect(first).toHaveTextContent('18');
    fireEvent.click(first);

    expect(onDrilldown).toHaveBeenCalledWith(
      expect.objectContaining({ eventIds: ['a', 'b'] }),
    );
  });

  it('mostra estado vazio quando não há eventos elegíveis', () => {
    render(
      <EventVolumePanel
        events={[event('sem-data', null, { status: 'undated' })]}
        todayKey="2026-08-05"
        onDrilldown={vi.fn()}
      />,
    );
    expect(screen.getByText(/Nenhum evento datado neste período/i)).toBeInTheDocument();
  });
});
