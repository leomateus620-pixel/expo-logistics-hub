// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';
import CronogramaDashboardBoard from '@/components/cronograma-eventos/dashboard/CronogramaDashboardBoard';
import type { CronogramaEvent } from '@/components/cronograma-eventos/types';
import { buildCronogramaDashboardModel } from '@/lib/cronograma-dashboard-selectors';

vi.mock('recharts', () => {
  const Container = ({ children }: PropsWithChildren) => <div data-testid="responsive-chart">{children}</div>;
  const Element = ({ children }: PropsWithChildren) => <div>{children}</div>;
  const Chart = ({ children }: PropsWithChildren) => <svg>{children}</svg>;
  return {
    ResponsiveContainer: Container,
    AreaChart: Chart,
    Area: Element,
    BarChart: Chart,
    Bar: Element,
    Cell: Element,
    CartesianGrid: Element,
    Line: Element,
    Tooltip: Element,
    XAxis: Element,
    YAxis: Element,
  };
});

const quality = {
  date: true,
  responsible: true,
  commission: true,
  location: true,
  description: true,
  priority: true,
  status: true,
  updatedAt: true,
};

function event(id: string, overrides: Partial<CronogramaEvent> = {}): CronogramaEvent {
  return {
    id,
    title: `Evento ${id}`,
    summary: 'Descrição executiva.',
    date: '2026-08-15',
    endDate: '2026-08-15',
    year: 2026,
    category: 'infraestrutura',
    status: 'planned',
    priority: 'high',
    kind: 'milestone',
    owner: 'Responsável operacional',
    commission: 'Comissão Infra',
    location: 'Parque de Exposições',
    isOfficial: true,
    updatedAt: '2026-07-20T12:00:00Z',
    dataQuality: { ...quality },
    ...overrides,
  };
}

describe('Dashboard executivo do cronograma', () => {
  it('renderiza indicadores reais e mantém o recorte exato no drill-down', async () => {
    const overdue = event('overdue', {
      title: 'Obra atrasada',
      date: '2026-06-01',
      endDate: '2026-06-15',
      status: 'in_progress',
      priority: 'critical',
    });
    const main = event('main', {
      title: 'Abertura da Fenasoja',
      isMain: true,
      date: '2028-04-29',
      endDate: '2028-05-07',
      subevents: [
        { id: 'done', title: 'Licenças', status: 'completed', date: '2026-07-01' },
        { id: 'next', title: 'Montagem', status: 'planned', date: '2026-08-01' },
      ],
    });
    const model = buildCronogramaDashboardModel(
      [overdue, main],
      [],
      { todayKey: '2026-07-31', logStatus: 'restricted' },
    );
    const onDrilldown = vi.fn();
    const onOpenEvent = vi.fn();

    render(
      <CronogramaDashboardBoard
        model={model}
        logStatus="restricted"
        isFallback={false}
        onDrilldown={onDrilldown}
        onOpenEvent={onOpenEvent}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Prontidão Fenasoja 2028' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Volume de eventos' })).toBeInTheDocument();
    expect(screen.getByText('Acesso gerencial necessário')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Eventos atrasados: 1\./ }));
    expect(onDrilldown).toHaveBeenCalledWith(expect.objectContaining({
      view: 'timeline',
      eventIds: ['overdue'],
      filterPatch: expect.objectContaining({ period: 'overdue' }),
    }));

    const majorProgress = screen.getByRole('progressbar', {
      name: /Abertura da Fenasoja/,
    });
    fireEvent.click(majorProgress.closest('button')!);
    expect(onOpenEvent).toHaveBeenCalledWith(main);

    fireEvent.click(screen.getByRole('button', { name: 'Auditar cálculo' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Como o Índice de Prontidão é calculado',
    });
    expect(within(dialog).getByText('Conclusão geral')).toBeInTheDocument();
    expect(within(dialog).getByText(/Peso nominal 35%/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Janela de atualização recente: 30 dias/)).toBeInTheDocument();
  });

  it('explicita fallback remoto e não fabrica gráficos quando não há eventos', () => {
    const { rerender } = render(
      <CronogramaDashboardBoard
        model={buildCronogramaDashboardModel(
          [event('fallback')],
          null,
          { todayKey: '2026-07-31', logStatus: 'offline' },
        )}
        logStatus="offline"
        isFallback
        onDrilldown={vi.fn()}
        onOpenEvent={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Indicadores calculados sobre a base oficial consolidada local',
    );
    expect(screen.getByText('Histórico indisponível offline')).toBeInTheDocument();

    rerender(
      <CronogramaDashboardBoard
        model={buildCronogramaDashboardModel(
          [],
          null,
          { todayKey: '2026-07-31', logStatus: 'unavailable' },
        )}
        logStatus="unavailable"
        isFallback={false}
        onDrilldown={vi.fn()}
        onOpenEvent={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', {
      name: 'Nenhum evento elegível neste recorte',
    })).toBeInTheDocument();
    expect(screen.queryByTestId('responsive-chart')).not.toBeInTheDocument();
  });
});
