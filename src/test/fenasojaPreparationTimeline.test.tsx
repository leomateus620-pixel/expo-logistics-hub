import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FenasojaPreparationTimeline } from '@/components/cronograma-eventos/FenasojaPreparationTimeline';

function renderTimeline(
  cycleProgress: number,
  availability: 'ready' | 'loading' | 'offline' = 'ready',
) {
  return render(
    <FenasojaPreparationTimeline
      cycleProgress={cycleProgress}
      availability={availability}
      presentation="desktop"
    />,
  );
}

describe('FenasojaPreparationTimeline', () => {
  it.each([0, 50, 100])('expõe uma única faixa de progresso em %i%%', (progress) => {
    const { container } = renderTimeline(progress);

    const meter = screen.getByRole('progressbar', {
      name: 'Progresso temporal da preparação para a Fenasoja 2028',
    });
    expect(meter).toHaveAttribute('aria-valuenow', String(progress));
    expect(meter.querySelector('span')).toHaveStyle(`--preparation-progress: ${progress / 100}`);
    expect(container.querySelectorAll('[role="progressbar"]')).toHaveLength(1);
  });

  it('mantém somente o resumo, a data final oficial e o andamento', () => {
    renderTimeline(47);

    expect(screen.getByRole('heading', { name: 'Preparação 2026—2028' })).toBeVisible();
    expect(screen.getByLabelText('47% do ciclo')).toBeVisible();
    expect(screen.getByText('29 de abril de 2028, às 10h')).toBeVisible();
    expect(screen.getByText('Horário de Brasília')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Construção em andamento');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('Próximo marco operacional')).not.toBeInTheDocument();
  });

  it('resume loading, offline e conclusão sem criar blocos adicionais', () => {
    const { rerender } = renderTimeline(25, 'loading');
    expect(screen.getByRole('status')).toHaveTextContent('Atualizando o progresso oficial');

    rerender(
      <FenasojaPreparationTimeline
        cycleProgress={25}
        availability="offline"
        presentation="desktop"
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('sincronização online indisponível');

    rerender(
      <FenasojaPreparationTimeline
        cycleProgress={100}
        availability="ready"
        presentation="desktop"
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Ciclo concluído no marco oficial');
  });
});
