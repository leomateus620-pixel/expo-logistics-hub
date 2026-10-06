import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { EventFormSheet, EventFormShell } from '../components/EventFormShell';
import { WorkspaceSheet } from '../components/WorkspaceSheet';
import { draftToSaveEventPayload } from '../lib/event-draft';
import type { AgendaEventViewModel, PersonSummary, UnitSummary } from '../types';

const people: PersonSummary[] = [
  { id: 'person-a', name: 'Maria Silva', role: 'Coordenação', userId: 'user-a' },
  { id: 'person-b', name: 'Maria Silva', role: 'Comunicação', userId: 'user-b' },
  { id: 'person-c', name: 'Ana Souza', role: 'Secretaria' },
];
const units: UnitSummary[] = [
  { id: 'owner', name: 'Acolhimento e Bem Comum', type: 'comissao' },
  { id: 'partner', name: 'Assessoria de Comunicação e Relações Institucionais', type: 'assessoria' },
  { id: 'other', name: 'Saúde e Acessibilidade', type: 'comissao' },
];
const event: AgendaEventViewModel = {
  id: 'canonical-event-id', title: 'Reunião de preparação', date: '2026-10-24',
  startTime: '07:30', endTime: '09:00', status: 'requested',
  people: [people[1], people[0]], units: [units[1], units[0]],
};

describe('commission event form presentation', () => {
  it('keeps failed creation fields and its source identity for a safe retry', async () => {
    const onSubmit = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<EventFormShell unitId="owner" peopleOptions={people} unitOptions={units} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText(/Título/), { target: { value: 'Evento sintético local' } });
    fireEvent.change(screen.getByLabelText(/^Data\s*\*?$/), { target: { value: '2028-04-29' } });
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Seus campos foram preservados'));
    expect(screen.getByLabelText(/Título/)).toHaveValue('Evento sintético local');
    const sourceKey = onSubmit.mock.calls[0][0].sourceKey;
    expect(sourceKey).toMatch(/^unidade-owner-[0-9a-f-]{36}$/);
    fireEvent.submit(document.querySelector('form')!);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect(onSubmit.mock.calls[1][0].sourceKey).toBe(sourceKey);
  });
  it('keeps equal names as distinct identities and preserves the first responsible through search and editing', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<EventFormShell event={event} unitId="owner" peopleOptions={people} unitOptions={units} onSubmit={onSubmit} />);

    const title = screen.getByLabelText(/Título/);
    fireEvent.change(title, { target: { value: 'Reunião atualizada' } });
    const trigger = screen.getByRole('button', { name: /Pessoas responsáveis Buscar e selecionar/ });
    await user.click(trigger);
    const search = screen.getByLabelText('Buscar em pessoas responsáveis');
    await user.type(search, 'Maria');
    expect(screen.getAllByRole('checkbox', { name: /Maria Silva/ })).toHaveLength(2);
    expect(screen.getAllByRole('checkbox', { name: /Maria Silva/ })).toEqual(expect.arrayContaining([
      expect.objectContaining({ checked: true }), expect.objectContaining({ checked: true }),
    ]));
    await user.clear(search);
    await user.type(search, 'Ana');
    await user.click(screen.getByRole('checkbox', { name: /Ana Souza/ }));
    expect(search).toHaveValue('Ana');
    expect(screen.getByRole('checkbox', { name: /Ana Souza/ })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    expect(title).toHaveValue('Reunião atualizada');

    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    const draft = onSubmit.mock.calls[0][0];
    expect(draft.peopleIds).toEqual(['person-b', 'person-a', 'person-c']);
    expect(draft.unitIds).toEqual(['partner', 'owner']);
    const payload = draftToSaveEventPayload(draft, {
      orgId: 'organization', owner: { commissionId: 'owner-db', slug: 'acolhimento', name: units[0].name }, editing: event,
      resolvePerson: (id) => people.find((person) => person.id === id),
      resolveUnit: (id) => ({ commissionId: `${id}-db`, slug: id, name: units.find((unit) => unit.id === id)?.name ?? '' }),
    });
    expect(payload.id).toBe('canonical-event-id');
    expect(payload.responsibles?.map((person) => [person.user_id, person.is_primary])).toEqual([['user-b', true], ['user-a', false], [null, false]]);
    expect(payload.commissions?.map((unit) => [unit.commission_id, unit.relation_role])).toEqual([['owner-db', 'principal'], ['partner-db', 'participante']]);
  });

  it('removes only the chosen ID, appends a reselected person and keeps the required workspace separate', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<EventFormShell event={event} unitId="owner" peopleOptions={people} unitOptions={units} onSubmit={onSubmit} />);
    const selected = screen.getByRole('list', { name: 'Pessoas responsáveis selecionados' });
    await user.click(within(selected).getAllByRole('button', { name: 'Remover Maria Silva' })[0]);
    expect(within(selected).getAllByText('Maria Silva')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /Pessoas responsáveis Buscar e selecionar/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Maria Silva Comunicação' }));
    expect(screen.queryByRole('button', { name: 'Remover Acolhimento e Bem Comum' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Comissões e assessorias participantes Buscar e selecionar/ }));
    await user.click(screen.getByRole('checkbox', { name: /Saúde e Acessibilidade/ }));
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ peopleIds: ['person-a', 'person-b'], unitIds: ['partner', 'owner', 'other'] });
  });

  it('retains saved selections absent from current options and never resets fields when a selector opens', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<EventFormShell event={event} unitId="owner" peopleOptions={[people[2]]} unitOptions={[units[0]]} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Descrição/), 'Pauta preservada');
    await user.click(screen.getByRole('button', { name: /Pessoas responsáveis Buscar e selecionar/ }));
    expect(screen.getAllByRole('checkbox', { name: /Maria Silva/ })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /Pessoas responsáveis Concluir seleção/ }));
    expect(screen.getByLabelText(/Descrição/)).toHaveValue('Pauta preservada');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ description: 'Pauta preservada', peopleIds: ['person-b', 'person-a'], unitIds: ['partner', 'owner'] });
  });

  it('shows errors beside fields without changing existing submit eligibility or adding an upload interaction', async () => {
    const user = userEvent.setup();
    const cancel = vi.fn();
    render(<EventFormShell unitId="owner" unitOptions={units} onCancel={cancel} />);
    const title = screen.getByLabelText(/Título/);
    fireEvent.blur(title);
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('pelo menos 3 caracteres');
    expect(screen.getByRole('button', { name: 'Criar evento' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Adicionar documentos/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('closes a selector with Escape without dismissing the sheet and returns focus after removing selections', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<EventFormSheet open onOpenChange={onOpenChange} unitLabel={units[0].name} event={event} unitId="owner" peopleOptions={people} unitOptions={units} />);
    const trigger = screen.getByRole('button', { name: /Pessoas responsáveis Buscar e selecionar/ });
    await user.click(trigger);
    const search = screen.getByLabelText('Buscar em pessoas responsáveis');
    await waitFor(() => expect(search).toHaveFocus());
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    expect(onOpenChange).not.toHaveBeenCalled();
    const selected = screen.getByRole('list', { name: 'Pessoas responsáveis selecionados' });
    await user.click(within(selected).getAllByRole('button', { name: 'Remover Maria Silva' })[0]);
    await waitFor(() => expect(within(selected).getByRole('button', { name: 'Remover Maria Silva' })).toHaveFocus());
    await user.keyboard('{Enter}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getByLabelText(/Título/)).toHaveValue(event.title);
  });

  it('returns focus to the external opener when the controlled sheet closes', async () => {
    const user = userEvent.setup();
    function ControlledSheet() {
      const [open, setOpen] = useState(false);
      return <><button type="button" onClick={() => setOpen(true)}>Criar compromisso</button><EventFormSheet open={open} onOpenChange={setOpen} unitLabel={units[0].name} unitId="owner" peopleOptions={people} unitOptions={units} /></>;
    }
    render(<ControlledSheet />);
    const opener = screen.getByRole('button', { name: 'Criar compromisso' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('keeps focus in the edit form during the detail transition and returns to the original page opener', async () => {
    const user = userEvent.setup();
    function DetailTransition() {
      const [panel, setPanel] = useState<'detail' | 'edit' | null>(null);
      return <>
        <button type="button" onClick={() => setPanel('detail')}>Ver compromisso</button>
        <WorkspaceSheet open={panel === 'detail'} onOpenChange={(open) => { if (!open) setPanel(null); }} title="Detalhe do evento">
          <button type="button" onClick={() => setPanel('edit')}>Editar compromisso</button>
        </WorkspaceSheet>
        <EventFormSheet open={panel === 'edit'} onOpenChange={(open) => { if (!open) setPanel(null); }} unitLabel={units[0].name} event={event} unitId="owner" peopleOptions={people} unitOptions={units} />
      </>;
    }
    render(<DetailTransition />);
    const opener = screen.getByRole('button', { name: 'Ver compromisso' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Editar compromisso' }));
    await waitFor(() => expect(screen.getByRole('dialog').querySelector('.ua-sheet__body')).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('shows an existing completed status without enabling additional selectable states or changing the draft', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<EventFormShell event={{ ...event, status: 'completed' }} unitId="owner" peopleOptions={people} unitOptions={units} onSubmit={onSubmit} />);
    expect(screen.getByLabelText('Situação')).toHaveValue('completed');
    expect(screen.getByRole('option', { name: 'Concluído' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(onSubmit.mock.calls[0][0].status).toBe('completed');
  });

  it('selects with Enter from a search result without submitting the event', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<EventFormShell event={event} unitId="owner" peopleOptions={people} unitOptions={units} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: /Pessoas responsáveis Buscar e selecionar/ }));
    const search = screen.getByLabelText('Buscar em pessoas responsáveis');
    await user.type(search, 'Ana');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(screen.getByRole('checkbox', { name: /Ana Souza/ })).toBeChecked();
    expect(onSubmit).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(onSubmit.mock.calls[0][0].peopleIds).toEqual(['person-b', 'person-a', 'person-c']);
  });
});
