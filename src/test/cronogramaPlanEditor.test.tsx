// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventRelationshipWorkspace } from '@/components/cronograma-eventos/workspace/EventRelationshipWorkspace';
import type {
  CronogramaEvent,
  CronogramaSubevent,
} from '@/components/cronograma-eventos/types';

vi.mock('@/hooks/useOrgCommissions', () => ({
  useOrgCommissions: () => ({
    units: [
      {
        id: 'commission-1',
        name: 'Programação e Eventos',
        slug: 'programacao-e-eventos',
        type: 'comissao',
        isOfficial: true,
        isLegacy: false,
        responsibles: [],
      },
    ],
    commissions: [
      {
        id: 'commission-1',
        nome: 'Programação e Eventos',
        slug: 'programacao-e-eventos',
      },
    ],
    isLoading: false,
  }),
}));
vi.mock('@/hooks/useOrgMembers', () => ({
  useOrgMembers: () => ({
    members: [],
    loginMembers: [
      {
        user_id: 'person-1',
        nome_exibicao: 'Mariana Oliveira',
        cargo: 'Coordenação',
        is_active: true,
      },
    ],
    isLoading: false,
    isLoadingLoginMembers: false,
  }),
}));

const subevent: CronogramaSubevent = {
  id: 'sub-1',
  title: 'Planejamento operacional',
  description: 'Descrição original',
  date: '2026-10-24',
  status: 'planned',
  actions: [
    { title: 'Abertura', startTime: '08:00' },
    { title: 'Recepção', startTime: '09:00' },
  ],
  provisions: [
    { description: 'Som', isDone: true },
    { description: 'Convites', isDone: false },
  ],
  budget: [
    { item: 'Som', supplier: 'Produção', amount: 1200.5 },
    { item: 'Café', amount: 50 },
  ],
  guests: [{ name: 'Equipe', category: 'Comissões' }],
};
const baseEvent: CronogramaEvent = {
  id: 'main-plan',
  title: 'IMERSÃO FENASOJA 2028',
  summary: '',
  date: '2026-10-24',
  year: 2026,
  kind: 'event',
  category: 'programacao',
  status: 'planned',
  priority: 'high',
  subevents: [subevent],
};
const props = {
  onBack: vi.fn(),
  onSaveEvent: vi.fn(),
  onCreateSubevent: vi.fn(),
  onUpdateSubevent: vi.fn(),
  onRemoveSubevent: vi.fn(),
  canManage: true,
  canDeleteSubevents: true,
};
const editName = 'Editar subevento Planejamento operacional';
const draftKey = 'cronograma-plan-draft:main-plan:edit:sub-1';
const renderWorkspace = (
  save = vi.fn().mockResolvedValue(undefined),
  event = baseEvent,
) =>
  render(
    <EventRelationshipWorkspace
      {...props}
      event={event}
      onSaveSubeventPlan={save}
    />,
  );
const openEditor = async () => {
  const trigger = screen.getByRole('button', { name: editName });
  await userEvent.click(trigger);
  await screen.findByRole('dialog');
  return trigger;
};

beforeEach(() => {
  localStorage.clear();
  Element.prototype.scrollTo = vi.fn();
});
afterEach(cleanup);

describe('workspace de planejamento em tela inteira', () => {
  it('usa portal fora da árvore, isola o fundo e devolve foco sem alterar a URL', async () => {
    renderWorkspace();
    const originalUrl = window.location.href;
    const trigger = await openEditor();
    const dialog = screen.getByRole('dialog');
    expect(dialog.closest('.cronograma-branch-content')).toBeNull();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByLabelText('Título do subevento')).toHaveValue(
      subevent.title,
    );
    expect(within(dialog).getByLabelText('Descrição')).toHaveValue(
      subevent.description,
    );
    expect(
      screen
        .getByRole('button', { name: 'Voltar ao cronograma', hidden: true })
        .closest('[aria-hidden=true]'),
    ).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '05 Orçamento' }));
    expect(Element.prototype.scrollTo).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
    expect(window.location.href).toBe(originalUrl);
  });

  it('mantém a mesma instância e o rascunho durante refetches do evento', async () => {
    const save = vi.fn();
    const view = renderWorkspace(save);
    await openEditor();
    const title = screen.getByLabelText('Título do subevento');
    fireEvent.change(title, { target: { value: 'Minha edição em andamento' } });
    title.focus();
    view.rerender(
      <EventRelationshipWorkspace
        {...props}
        event={{
          ...baseEvent,
          subevents: [{ ...subevent, title: 'Título vindo do servidor' }],
        }}
        onSaveSubeventPlan={save}
      />,
    );
    expect(screen.getByLabelText('Título do subevento')).toBe(title);
    expect(title).toHaveFocus();
    expect(title).toHaveValue('Minha edição em andamento');
    expect(JSON.parse(localStorage.getItem(draftKey)!).items[0].title).toBe(
      'Minha edição em andamento',
    );
  });

  it('aguarda sucesso, bloqueia submissões repetidas e preserva campos/rascunho após falha', async () => {
    let rejectSave!: (error: Error) => void;
    const save = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectSave = reject;
          }),
      )
      .mockResolvedValue(undefined);
    renderWorkspace(save);
    const trigger = await openEditor();
    fireEvent.change(screen.getByLabelText('Título do subevento'), {
      target: { value: 'Plano revisado' },
    });
    fireEvent.submit(screen.getByTestId('subevent-plan-builder'));
    fireEvent.submit(screen.getByTestId('subevent-plan-builder'));
    expect(save).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Salvando plano…' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Título do subevento')).toBeDisabled();
    expect(screen.getByRole('dialog')).toBeVisible();
    await act(async () =>
      rejectSave(new Error('Falha na conexão. Tente novamente.')),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Falha na conexão',
    );
    expect(screen.getByLabelText('Título do subevento')).toHaveValue(
      'Plano revisado',
    );
    expect(localStorage.getItem(draftKey)).not.toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'Salvar planejamento' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(save).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(draftKey)).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('protege Escape, permite continuar, mantém/restaura e descarta rascunhos com confirmação', async () => {
    renderWorkspace();
    await openEditor();
    fireEvent.change(screen.getByLabelText('Descrição'), {
      target: { value: 'Rascunho importante' },
    });
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(
      'Há alterações não salvas',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Continuar editando' }),
    );
    expect(screen.getByLabelText('Descrição')).toHaveValue(
      'Rascunho importante',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Fechar planejamento' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Manter rascunho' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    await openEditor();
    expect(screen.getByLabelText('Descrição')).toHaveValue(
      'Rascunho importante',
    );
    expect(screen.getByText(/Rascunho não salvo restaurado/)).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.getByRole('alertdialog')).toBeVisible();
    await userEvent.click(
      screen.getByRole('button', { name: 'Descartar alterações' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(localStorage.getItem(draftKey)).toBeNull();
    await openEditor();
    expect(screen.getByLabelText('Descrição')).toHaveValue(
      'Descrição original',
    );
  });

  it('ordena no blur e no envio sem trocar os nós dos campos ou perder texto', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    renderWorkspace(save);
    await openEditor();
    const firstDescription = screen.getByLabelText('Ação 1', { exact: true });
    const firstTime = screen.getByLabelText('Horário da ação 1');
    fireEvent.change(firstTime, { target: { value: '10:00' } });
    fireEvent.blur(firstTime);
    expect(screen.getByLabelText('Ação 2', { exact: true })).toBe(
      firstDescription,
    );
    expect(firstDescription).toHaveValue('Abertura');
    await userEvent.click(firstDescription);
    await userEvent.type(firstDescription, ' oficial');
    expect(firstDescription).toHaveFocus();
    expect(firstDescription).toHaveValue('Abertura oficial');
    // Deleting a preceding unsaved row must keep the remaining node.
    await userEvent.click(
      screen.getByRole('button', { name: 'Remover ação 1' }),
    );
    expect(screen.getByLabelText('Ação 1', { exact: true })).toBe(
      firstDescription,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Adicionar ação' }),
    );
    fireEvent.change(screen.getByLabelText('Ação 2', { exact: true }), {
      target: { value: 'Recepção final' },
    });
    fireEvent.change(screen.getByLabelText('Horário da ação 2'), {
      target: { value: '07:00' },
    });
    // Submit directly, without blur: sort-on-save is still required.
    fireEvent.submit(screen.getByTestId('subevent-plan-builder'));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(
      save.mock.calls[0][0][0].actions.map((a: { title: string }) => a.title),
    ).toEqual(['Recepção final', 'Abertura oficial']);
  });

  it('preserva checklist, moeda, fornecedores, convidados e chaves ao remover linhas', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    renderWorkspace(save);
    await openEditor();
    expect(screen.getByLabelText('Concluir providência 1')).toBeChecked();
    const provisionNode = screen.getByLabelText('Providência 2', {
      exact: true,
    });
    await userEvent.click(
      screen.getByRole('button', { name: 'Remover providência 1' }),
    );
    expect(screen.getByLabelText('Providência 1', { exact: true })).toBe(
      provisionNode,
    );
    await userEvent.click(screen.getByLabelText('Concluir providência 1'));
    fireEvent.change(provisionNode, {
      target: { value: 'Convites e cerimonial' },
    });
    fireEvent.change(screen.getByLabelText('Responsável da providência 1'), {
      target: { value: 'Produção executiva' },
    });
    const budgetNode = screen.getByLabelText('Produto ou serviço 2');
    await userEvent.click(
      screen.getByRole('button', { name: 'Remover item 1 do orçamento' }),
    );
    expect(screen.getByLabelText('Produto ou serviço 1')).toBe(budgetNode);
    fireEvent.change(screen.getByLabelText('Valor 1', { exact: true }), {
      target: { value: '123456' },
    });
    fireEvent.change(screen.getByLabelText('Fornecedor 1'), {
      target: { value: 'Fornecedor oficial' },
    });
    expect(screen.getAllByText(/1\.234,56/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Imprensa' }));
    fireEvent.change(screen.getByLabelText('Novo convidado'), {
      target: { value: 'Jornal local' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Incluir' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Remover convidado Equipe' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Salvar planejamento' }),
    );
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0][0]).toMatchObject({
      provisions: [
        {
          description: 'Convites e cerimonial',
          responsibleName: 'Produção executiva',
          isDone: true,
        },
      ],
      budget: [
        { item: 'Café', supplier: 'Fornecedor oficial', amount: 1234.56 },
      ],
      guests: [{ name: 'Jornal local', category: 'Imprensa' }],
    });
  });

  it('seleciona registros oficiais dentro de outro diálogo e mantém o planejamento aberto', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    renderWorkspace(save);
    await openEditor();
    await userEvent.click(
      screen.getByRole('button', {
        name: /Comissão ou Assessoria responsável Selecionar/,
      }),
    );
    const selector = screen.getAllByRole('dialog').slice(-1)[0]!;
    fireEvent.change(within(selector).getByRole('combobox'), {
      target: { value: 'Programação' },
    });
    await userEvent.click(
      within(selector).getByRole('option', { name: /Programação e Eventos/ }),
    );
    await userEvent.keyboard('{Escape}');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await userEvent.click(
      screen.getByRole('button', {
        name: /Responsáveis do subevento Selecionar/,
      }),
    );
    const people = screen.getAllByRole('dialog').slice(-1)[0]!;
    await userEvent.click(
      within(people).getByRole('option', { name: /Mariana Oliveira/ }),
    );
    await userEvent.keyboard('{Escape}');
    await userEvent.click(
      screen.getByRole('button', { name: 'Salvar planejamento' }),
    );
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0][0]).toMatchObject({
      commissionsRel: [{ commissionId: 'commission-1', isPrimary: true }],
      responsiblesRel: [{ userId: 'person-1', isPrimary: true }],
    });
  });

  it('cria vários subeventos, valida títulos e mantém os campos montados ao alternar', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    renderWorkspace(save);
    const trigger = screen.getByRole('button', { name: 'Adicionar subevento' });
    await userEvent.click(trigger);
    await userEvent.click(
      screen.getByRole('button', { name: 'Salvar planejamento' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Informe o título',
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Título do subevento')).toHaveFocus(),
    );
    fireEvent.change(screen.getByLabelText('Título do subevento'), {
      target: { value: 'Primeira etapa' },
    });
    const titleNode = screen.getByLabelText('Título do subevento');
    fireEvent.change(screen.getByLabelText('Novo convidado'), {
      target: { value: 'Nome em digitação' },
    });
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Adicionar outro subevento ao plano',
      }),
    );
    fireEvent.change(screen.getAllByLabelText('Título do subevento')[1], {
      target: { value: 'Segunda etapa' },
    });
    await userEvent.click(
      screen.getByRole('button', { name: /01 Primeira etapa/ }),
    );
    expect(screen.getAllByLabelText('Título do subevento')[0]).toBe(titleNode);
    expect(screen.getAllByLabelText('Novo convidado')[0]).toHaveValue(
      'Nome em digitação',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Salvar planejamento' }),
    );
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(
      save.mock.calls[0][0].map((item: { title: string }) => item.title),
    ).toEqual(['Primeira etapa', 'Segunda etapa']);
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
  });
});
