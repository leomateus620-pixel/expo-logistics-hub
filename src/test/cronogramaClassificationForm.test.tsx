import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventForm } from '@/components/cronograma-eventos/EventForm';
import type { CronogramaEvent } from '@/components/cronograma-eventos/types';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/components/cronograma-eventos/useCronogramaRelationOptions', async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    '@/components/cronograma-eventos/useCronogramaRelationOptions',
  );
  return {
    ...actual,
    useCronogramaRelationOptions: () => ({
      units: [],
      commissions: [],
      members: [],
      loginMembers: [],
      responsibleOptions: [],
      commissionsLoading: false,
      commissionsError: null,
      membersLoading: false,
      membersError: null,
    }),
  };
});

function renderForm(event?: CronogramaEvent | null) {
  const onSubmit = vi.fn();
  render(
    <EventForm
      event={event ?? undefined}
      onSubmit={onSubmit}
      onCancel={() => {}}
      showSubevents={false}
      showRelational={false}
    />,
  );
  return { onSubmit };
}

const advance = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 700));
  });
};

describe('EventForm — classificação automática', () => {
  it('classifica Categoria e Tipo a partir do título', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(
      screen.getByLabelText('Título'),
      'Reunião com patrocinadores para definição das cotas 2028',
    );
    await advance();

    expect(screen.getByRole('combobox', { name: 'Categoria' })).toHaveTextContent('Comercial e Patrocínios');
    expect(screen.getByRole('combobox', { name: 'Tipo' })).toHaveTextContent('Reunião');
    expect(screen.getAllByText('✦ Sugestão automática').length).toBeGreaterThan(0);
  });

  it('não toca em Status e Prioridade', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText('Título'), 'Conclusão da instalação elétrica do parque');
    await advance();

    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Planejado');
    expect(screen.getByRole('combobox', { name: 'Prioridade' })).toHaveTextContent('Média');
  });

  it('não reclassifica silenciosamente um evento já salvo', async () => {
    renderForm({
      id: 'evt-1',
      title: 'Reunião com patrocinadores',
      summary: '',
      date: null,
      year: 2028,
      category: 'infraestrutura',
      status: 'planned',
      priority: 'medium',
      kind: 'event',
    });
    await advance();

    expect(screen.getByRole('combobox', { name: 'Categoria' })).toHaveTextContent('Infraestrutura e Operações');
    expect(screen.getByRole('combobox', { name: 'Tipo' })).toHaveTextContent('Evento');
    expect(screen.getByText('✦ Atualizar classificação automaticamente')).toBeInTheDocument();
  });
});
