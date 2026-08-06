import type { PropsWithChildren } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import TimeDemandPanel from '@/components/cronograma-eventos/dashboard/TimeDemandPanel';
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

function event(id: string, date: string | null, startTime?: string, overrides: Partial<CronogramaEvent> = {}): CronogramaEvent {
  return {
    id,
    title: `Evento ${id}`,
    summary: '',
    date,
    startTime,
    year: 2026,
    category: 'governanca',
    status: 'planned',
    priority: 'medium',
    kind: 'event',
    ...overrides,
  } as CronogramaEvent;
}

const events = [
  event('a', '2026-08-04', '18:30'),
  event('b', '2026-08-11', '18:45'),
  event('c', '2026-08-05', '09:00'),
  event('sem-hora', '2026-08-07'),
];

describe('Horários com maior demanda', () => {
  it('exibe o painel com o período mensal padrão', () => {
    render(<TimeDemandPanel events={events} todayKey="2026-08-05" onDrilldown={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Horários com maior demanda' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mês' })).toHaveAttribute('data-active', 'true');
    expect(screen.getAllByText(/3 eventos com horário/).length).toBeGreaterThan(0);
  });

  it('permite trocar o período', () => {
    render(<TimeDemandPanel events={events} todayKey="2026-08-05" onDrilldown={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '1 ano' }));
    expect(screen.getByRole('button', { name: '1 ano' })).toHaveAttribute('data-active', 'true');
  });

  it('abre os eventos do horário pelo ranking', () => {
    const onDrilldown = vi.fn();
    render(<TimeDemandPanel events={events} todayKey="2026-08-05" onDrilldown={onDrilldown} />);

    const top = screen.getByRole('region', { name: /Horários de maior demanda/i });
    const first = within(top).getAllByRole('button')[0];
    expect(first).toHaveTextContent('18:30');
    fireEvent.click(first);

    expect(onDrilldown).toHaveBeenCalledWith(
      expect.objectContaining({ view: 'timeline', eventIds: ['a', 'b'] }),
    );
  });

  it('mostra a cobertura de eventos sem horário', () => {
    const onDrilldown = vi.fn();
    render(<TimeDemandPanel events={events} todayKey="2026-08-05" onDrilldown={onDrilldown} />);
    const coverage = screen.getByRole('button', { name: /3 de 4 eventos com horário definido/i });
    fireEvent.click(coverage);
    expect(onDrilldown).toHaveBeenCalledWith(
      expect.objectContaining({ eventIds: ['sem-hora'] }),
    );
  });

  it('mostra estado vazio quando não há horários', () => {
    render(
      <TimeDemandPanel events={[event('x', '2026-08-05')]} todayKey="2026-08-05" onDrilldown={vi.fn()} />,
    );
    expect(screen.getByText(/Nenhum evento com horário neste período/i)).toBeInTheDocument();
  });
});
