import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FenasojaPreparationTimeline } from '@/components/cronograma-eventos/FenasojaPreparationTimeline';
import type { CronogramaEvent } from '@/components/cronograma-eventos/types';

const nextAction: CronogramaEvent = {
  id: 'next-action',
  title: 'Definição operacional integrada com todas as comissões responsáveis pela edição',
  summary: 'Próximo marco',
  date: '2027-08-14',
  year: 2027,
  category: 'governanca',
  status: 'in_progress',
  priority: 'high',
  kind: 'milestone',
  isOfficial: true,
};

function renderTimeline(
  cycleProgress: number,
  availability: 'ready' | 'loading' | 'offline' = 'ready',
  events: CronogramaEvent[] = [nextAction],
) {
  return render(
    <FenasojaPreparationTimeline
      events={events}
      cycleProgress={cycleProgress}
      nextAction={events.length ? nextAction : null}
      nextCountdown={events.length ? 'em 1 ano' : null}
      availability={availability}
      presentation="desktop"
    />,
  );
}

describe('FenasojaPreparationTimeline', () => {
  it.each([0, 50, 100])('expõe progresso sem alterar a geometria em %i%%', (progress) => {
    renderTimeline(progress);

    const meter = screen.getByRole('progressbar', {
      name: 'Progresso temporal da preparação para a Fenasoja 2028',
    });
    expect(meter).toHaveAttribute('aria-valuenow', String(progress));
    expect(meter.querySelector('span')).toHaveStyle(`--preparation-progress: ${progress / 100}`);
  });

  it('preserva nomes longos, marco oficial e etapa corrente', () => {
    renderTimeline(47);

    expect(screen.getByText(nextAction.title)).toBeInTheDocument();
    expect(screen.getByText('Abertura FENASOJA 2028')).toBeInTheDocument();
    expect(screen.getByText('Em andamento')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Marcos da preparação' })).toBeInTheDocument();
  });

  it('apresenta estados de carregamento, vazio e offline', () => {
    const { rerender } = renderTimeline(25, 'loading');
    expect(screen.getByRole('status')).toHaveTextContent('Carregando marcos do ciclo');

    rerender(
      <FenasojaPreparationTimeline
        events={[]}
        cycleProgress={25}
        nextAction={null}
        nextCountdown={null}
        availability="ready"
        presentation="desktop"
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Marcos ainda indisponíveis');

    rerender(
      <FenasojaPreparationTimeline
        events={[nextAction]}
        cycleProgress={25}
        nextAction={nextAction}
        nextCountdown="em 1 ano"
        availability="offline"
        presentation="desktop"
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Base oficial consolidada');
  });
});
