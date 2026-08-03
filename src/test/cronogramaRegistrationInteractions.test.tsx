// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CronogramaRegistrationAction } from '@/components/cronograma-eventos/CronogramaRegistrationAction';
import {
  RelationalMultiSelect,
  type RelationalOption,
  type RelationalSelection,
} from '@/components/cronograma-eventos/RelationalMultiSelect';

const HISTORY_KEY = '__cronogramaMobileOverlay';

const organizationOptions: RelationalOption[] = [
  {
    id: 'commission-logistics',
    label: 'Logística, Hotelaria e Turismo',
    group: 'Comissões',
    description: 'Comissão · Eduardo Santos',
    context: 'Área institucional',
  },
  {
    id: 'advisory-marketing',
    label: 'Assessoria de Marketing',
    group: 'Assessorias',
    description: 'Assessoria · Zélia Savoldi',
  },
  {
    id: 'commission-strategy',
    label: 'Relações Estratégicas',
    group: 'Comissões',
    description: 'Comissão · Miguel Nedel e Diana Nedel',
  },
];

const personOptions: RelationalOption[] = [
  {
    id: 'user-fabiano',
    label: 'Fabiano Soltis',
    group: 'Membros do sistema',
    description: 'Presidente Fenasoja 2028',
    context: 'Comissão Central',
  },
  {
    id: 'user-zelia',
    label: 'Zélia Savoldi',
    group: 'Membros do sistema',
    description: 'Assessoria de Marketing',
    context: 'Usuária do sistema',
  },
  {
    id: 'user-leonardo',
    label: 'Leonardo Mateus Stroschein',
    group: 'Membros do sistema',
    description: 'Voluntário',
  },
];

function StatefulPeopleSelector({ presentation = 'desktop' }: { presentation?: 'desktop' | 'mobile' }) {
  const [value, setValue] = useState<RelationalSelection[]>([
    {
      id: 'user-fabiano',
      label: 'Fabiano Soltis',
      hint: 'Presidente Fenasoja 2028',
      isPrimary: true,
    },
  ]);

  return (
    <RelationalMultiSelect
      id={`event-responsibles-${presentation}`}
      label="Responsáveis do evento"
      description="Defina quem executará ou acompanhará esta ação."
      placeholder="Buscar pessoa por nome ou função"
      triggerLabel="Selecionar responsáveis"
      selectedTriggerLabel="Adicionar ou alterar responsáveis"
      emptyLabel="Nenhum responsável vinculado."
      options={personOptions}
      value={value}
      onChange={setValue}
      allowCustom
      primaryLabel="Responsável principal"
      presentation={presentation}
      variant="person"
    />
  );
}

function installHistoryBackBehavior() {
  return vi.spyOn(window.history, 'back').mockImplementation(() => {
    const nextState = { ...(window.history.state ?? {}) };
    delete nextState[HISTORY_KEY];
    window.history.replaceState(nextState, '', window.location.href);
    window.dispatchEvent(new PopStateEvent('popstate', { state: nextState }));
  });
}

beforeEach(() => {
  window.history.replaceState({}, '', '/cronograma-eventos');
  Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    return window.setTimeout(() => callback(performance.now()), 0);
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((handle: number) => window.clearTimeout(handle)));
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/cronograma-eventos');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('interações do cadastro do cronograma', () => {
  it('exibe o CTA somente para quem pode gerenciar e encaminha a criação ao handler existente', () => {
    const onCreate = vi.fn();
    const { rerender } = render(
      <CronogramaRegistrationAction
        canManage={false}
        onCreate={onCreate}
        presentation="desktop"
      />,
    );

    expect(screen.queryByRole('button', { name: 'Criar novo evento no cronograma' })).not.toBeInTheDocument();

    rerender(
      <CronogramaRegistrationAction
        canManage
        onCreate={onCreate}
        presentation="desktop"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Criar novo evento no cronograma' }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('abre o popover desktop, agrupa unidades e busca sem acento pelo contexto institucional', async () => {
    const initialSelection: RelationalSelection[] = [
      {
        id: 'commission-logistics',
        label: 'Logística, Hotelaria e Turismo',
        hint: 'Comissão · Eduardo Santos',
        isPrimary: true,
      },
    ];

    function OrganizationHarness() {
      const [value, setValue] = useState(initialSelection);
      return (
        <RelationalMultiSelect
          id="main-organization"
          label="Comissão ou Assessoria responsável"
          placeholder="Buscar comissão, assessoria ou responsável"
          triggerLabel="Selecionar comissão ou assessoria"
          selectedTriggerLabel="Adicionar ou alterar comissão ou assessoria"
          options={organizationOptions}
          value={value}
          onChange={setValue}
          primaryLabel="Comissão principal"
          variant="organization"
        />
      );
    }

    render(<OrganizationHarness />);
    const trigger = screen.getByRole('button', { name: /Adicionar ou alterar comissão ou assessoria/i });
    fireEvent.click(trigger);

    const listbox = await screen.findByRole('listbox', { name: 'Comissão ou Assessoria responsável' });
    expect(screen.getByText('Comissões')).toBeInTheDocument();
    expect(screen.getByText('Assessorias')).toBeInTheDocument();
    expect(within(listbox).getByRole('option', { name: /Logística, Hotelaria e Turismo.*Eduardo Santos/i }))
      .toHaveAttribute('aria-selected', 'true');

    const search = screen.getByRole('combobox', { name: 'Buscar comissão, assessoria ou responsável' });
    fireEvent.keyDown(search, { key: 'ArrowDown', code: 'ArrowDown' });
    expect(within(listbox).getByRole('option', { name: /Relações Estratégicas.*Miguel Nedel/i }))
      .toHaveAttribute('data-active', 'true');

    fireEvent.change(search, { target: { value: 'ZELIA ASSESSORIA' } });

    expect(await within(listbox).findByRole('option', { name: /Assessoria de Marketing.*Zélia Savoldi/i }))
      .toHaveAttribute('aria-selected', 'false');
    expect(within(listbox).queryByRole('option', { name: /Logística, Hotelaria e Turismo/i }))
      .not.toBeInTheDocument();

    fireEvent.keyDown(search, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox', {
      name: 'Comissão ou Assessoria responsável',
    })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('mantém resultados parciais acessíveis quando uma fonte do registro falha', async () => {
    render(
      <RelationalMultiSelect
        id="partial-registry"
        label="Responsáveis do evento"
        placeholder="Buscar pessoa por nome ou função"
        triggerLabel="Selecionar responsáveis"
        options={personOptions}
        value={[]}
        onChange={vi.fn()}
        errorMessage="Tente novamente em instantes."
        allowCustom
        variant="person"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Selecionar responsáveis/i }));
    const listbox = await screen.findByRole('listbox', { name: 'Responsáveis do evento' });

    expect(screen.getByRole('alert')).toHaveTextContent('Parte do registro pode estar indisponível');
    expect(within(listbox).getByRole('option', { name: /Fabiano Soltis/i })).toBeInTheDocument();
  });

  it('mantém seleção semântica, opera por teclado e gerencia múltiplos responsáveis sem duplicar nome externo', async () => {
    render(<StatefulPeopleSelector />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar ou alterar responsáveis/i }));

    const listbox = await screen.findByRole('listbox', { name: 'Responsáveis do evento' });
    expect(within(listbox).getByRole('option', { name: /Fabiano Soltis.*Presidente Fenasoja 2028/i }))
      .toHaveAttribute('aria-selected', 'true');

    const search = screen.getByRole('combobox', { name: 'Buscar pessoa por nome ou função' });
    fireEvent.keyDown(search, { key: 'ArrowDown', code: 'ArrowDown' });
    expect(within(listbox).getByRole('option', { name: /Zélia Savoldi.*Assessoria de Marketing/i }))
      .toHaveAttribute('data-active', 'true');
    fireEvent.keyDown(search, { key: 'Enter', code: 'Enter' });

    expect(within(listbox).getByRole('option', { name: /Zélia Savoldi.*Assessoria de Marketing/i }))
      .toHaveAttribute('aria-selected', 'true');

    fireEvent.click(within(listbox).getByRole('option', { name: /Leonardo Mateus Stroschein/i }));
    let selectedList = screen.getByRole('list', { name: 'Responsáveis do evento selecionados' });
    expect(within(selectedList).getByText('Fabiano Soltis')).toBeInTheDocument();
    expect(within(selectedList).getByText('Zélia Savoldi')).toBeInTheDocument();
    expect(within(selectedList).getByText('Leonardo Mateus Stroschein')).toBeInTheDocument();

    fireEvent.click(within(selectedList).getByRole('button', {
      name: 'Marcar Zélia Savoldi como responsável principal',
    }));
    const zeliaRow = within(selectedList).getByText('Zélia Savoldi').closest('li');
    const fabianoRow = within(selectedList).getByText('Fabiano Soltis').closest('li');
    expect(zeliaRow).toHaveAttribute('data-primary', 'true');
    expect(fabianoRow).not.toHaveAttribute('data-primary');

    fireEvent.click(within(selectedList).getByRole('button', { name: 'Remover Zélia Savoldi' }));
    selectedList = screen.getByRole('list', { name: 'Responsáveis do evento selecionados' });
    expect(within(selectedList).queryByText('Zélia Savoldi')).not.toBeInTheDocument();
    expect(within(selectedList).getByText('Fabiano Soltis').closest('li'))
      .toHaveAttribute('data-primary', 'true');

    fireEvent.change(search, { target: { value: 'Joana Ávila' } });
    fireEvent.click(within(listbox).getByRole('option', { name: /Adicionar .*Joana Ávila/i }));
    selectedList = screen.getByRole('list', { name: 'Responsáveis do evento selecionados' });
    expect(within(selectedList).getByText('Joana Ávila')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'JOANA AVILA' } });
    expect(within(listbox).queryByRole('option', { name: /Adicionar .*JOANA AVILA/i }))
      .not.toBeInTheDocument();
    expect(within(listbox).getByText('Nenhum resultado encontrado para esta busca.')).toBeInTheDocument();
  });

  it('apresenta o seletor móvel em Sheet e devolve o foco ao controle após fechar', async () => {
    installHistoryBackBehavior();
    render(
      <div data-testid="event-registration-flow">
        <p>Fluxo de cadastro preservado</p>
        <StatefulPeopleSelector presentation="mobile" />
      </div>,
    );

    const trigger = screen.getByRole('button', { name: /Adicionar ou alterar responsáveis/i });
    trigger.focus();
    fireEvent.click(trigger);

    const sheet = await screen.findByRole('dialog', { name: 'Responsáveis do evento' });
    expect(sheet).toHaveClass('cronograma-relation-sheet', 'fixed', 'z-50');
    expect(document.querySelector('.cronograma-relation-sheet-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('event-registration-flow')).toBeInTheDocument();
    const search = screen.getByRole('combobox', { name: 'Buscar pessoa por nome ou função' });
    await waitFor(() => expect(search).toHaveFocus());

    fireEvent.click(within(sheet).getByRole('button', { name: /^Concluir seleção/i }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Responsáveis do evento' })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
