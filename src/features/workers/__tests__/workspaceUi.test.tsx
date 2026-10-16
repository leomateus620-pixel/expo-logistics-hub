import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionView, RoutineView, SystemEventView } from '../workspace-contracts';
import { WorkspaceActionCard } from '../workspace/WorkspaceActionCard';
import { RoutineCard, SystemEvent, WorkspacePanels } from '../workspace/WorkspacePanels';
import type { WorkerWorkspace } from '../workspace/useWorkerWorkspace';

vi.mock('../workspace-api', () => ({ callWorkerAction: vi.fn(), callWorkerWorkspace: vi.fn() }));
const orgId = '10000000-0000-4000-8000-000000000001';
const actionId = '20000000-0000-4000-8000-000000000001';
const recordId = '30000000-0000-4000-8000-000000000001';
function action(patch: Partial<ActionView> = {}): ActionView {
  const now = new Date().toISOString();
  return { id: actionId, orgId, conversationId: '40000000-0000-4000-8000-000000000001', workerId: 'arena', kind: 'arena_note', version: 3, status: 'proposed', summary: 'Adicionar nota operacional', target: { recordId, label: 'Evento da Arena', href: '/eventos-restaurante-arena' }, diff: [{ field: 'body', label: 'Nota', beforeDisplay: null, afterDisplay: 'Confirmar som às 18h', redacted: false }], createdAt: now, updatedAt: now, serverNow: now, expiresAt: new Date(Date.now() + 900000).toISOString(), permissions: { canConfirm: true, canEdit: true, canCancel: true, reason: 'allowed' }, manualInputState: 'notRequired', receipt: null, failure: null, ...patch };
}
function workspace(): WorkerWorkspace {
  return { orgId, scope: `user:${orgId}`, actions: [], conversationActions: [], pendingActions: [], snapshot: { serverNow: new Date().toISOString(), routines: [], runs: [], events: [], memories: [], alerts: [] }, loading: false, error: null, busyId: null, refresh: vi.fn().mockResolvedValue(undefined), mutateAction: vi.fn().mockResolvedValue(action()), mutateWorkspace: vi.fn().mockResolvedValue(undefined), clearError: vi.fn() };
}
function routine(patch: Partial<RoutineView> = {}): RoutineView {
  return { id: actionId, orgId, conversationId: recordId, version: 2, config: { title: 'Briefing de amanhã', workerId: 'agenda', schedule: { timeZone: 'America/Sao_Paulo', localTime: '08:00', weekdays: [1,2,3,4,5] }, recipe: { recipeId: 'agendaBriefing', commissionId: null, dayOffset: 1, includeRestaurantConflicts: true }, delivery: 'inApp', executionMode: 'activeSession' }, state: 'proposed', scheduleLabel: 'Dias úteis às 08:00', nextScheduledAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), expiresAt: null, serverNow: new Date().toISOString(), lastRunAt: null, waitingForSession: true, canConfirm: true, canEdit: true, canRunNow: false, unavailableReason: null, ...patch };
}
afterEach(cleanup);

describe('ações confirmadas da equipe', () => {
  it('confirma somente ID e versão e não anuncia sucesso antes do receipt', () => {
    const state = workspace(); render(<WorkspaceActionCard action={action()} workspace={state} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(state.mutateAction).toHaveBeenCalledWith({ command: 'confirm', orgId, actionId, expectedVersion: 3 });
    expect(screen.queryByText('Concluído')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desfazer' })).not.toBeInTheDocument();
  });
  it('oculta Confirmar sem autorização e apresenta apenas o estado recebido', () => {
    render(<WorkspaceActionCard action={action({ permissions: { canConfirm: false, canEdit: false, canCancel: false, reason: 'missingCapability' } })} workspace={workspace()} />);
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
    expect(screen.getByText(/confirmação não está disponível/)).toBeInTheDocument();
  });
  it('expiração usa o relógio do servidor e retira os controles', async () => {
    const state = workspace(); render(<WorkspaceActionCard action={action({ expiresAt: '2026-10-16T12:00:00Z', serverNow: '2026-10-16T12:01:00Z' })} workspace={state} />);
    await waitFor(() => expect(screen.getByText('Proposta expirada')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument();
    expect(state.mutateAction).not.toHaveBeenCalled();
  });
  it('envia campos pessoais somente pelo comando manual e limpa o formulário ao fechar', async () => {
    const state = workspace(); const card = action({ kind: 'commercial_reserve', workerId: 'mapa', manualInputState: 'required', permissions: { canConfirm: false, canEdit: true, canCancel: true, reason: 'manualInputRequired' } });
    render(<WorkspaceActionCard action={card} workspace={state} />);
    fireEvent.click(screen.getByRole('button', { name: 'Completar dados' }));
    fireEvent.change(screen.getByLabelText('Empresa ou identificação comercial'), { target: { value: 'Empresa privada' } });
    fireEvent.change(screen.getByLabelText('Nome do contato'), { target: { value: 'Contato privado' } });
    fireEvent.change(screen.getByLabelText(/Reserva válida até/), { target: { value: '2060-01-01T18:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e revisar proposta' }));
    await waitFor(() => expect(state.mutateAction).toHaveBeenCalledWith(expect.objectContaining({ command: 'manual', manualInput: { kind: 'commercial_reserve', companyName: 'Empresa privada', contactName: 'Contato privado', reservationExpiresAt: '2060-01-01T21:00:00.000Z' } })));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Completar dados' }));
    expect(screen.getByLabelText('Empresa ou identificação comercial')).toHaveValue('');
    expect(state.mutateAction).not.toHaveBeenCalledWith(expect.objectContaining({ command: 'confirm' }));
  });
  it('restaura o foco ao botão de edição quando o formulário fecha', async () => {
    render(<WorkspaceActionCard action={action()} workspace={workspace()} />);
    const trigger = screen.getByRole('button', { name: 'Editar' });
    fireEvent.click(trigger); fireEvent.click(screen.getByRole('button', { name: 'Fechar painel' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

describe('rotinas e memória explícitas', () => {
  it('confirma a rotina por versão e cancela proposta desativando sem apagar', () => {
    const state = workspace(); render(<RoutineCard routine={routine()} workspace={state} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar rotina' }));
    expect(state.mutateWorkspace).toHaveBeenCalledWith({ command: 'confirmRoutine', orgId, routineId: actionId, expectedVersion: 2 }, actionId);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar proposta' }));
    expect(state.mutateWorkspace).toHaveBeenCalledWith({ command: 'setRoutineState', orgId, routineId: actionId, expectedVersion: 2, state: 'disabled' }, actionId);
    expect(screen.queryByRole('button', { name: 'Executar agora' })).not.toBeInTheDocument();
  });
  it('Desfazer usa a versão atual da rotina e não apaga a execução', () => {
    const state = workspace(); state.snapshot.routines = [routine({ state: 'active', version: 4 })];
    const event: SystemEventView = { id: recordId, conversationId: recordId, createdAt: new Date().toISOString(), kind: 'routineCreated', entityId: actionId, version: 2, label: 'Rotina criada: Briefing de amanhã', canUndo: true };
    render(<SystemEvent event={event} workspace={state} />); fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(state.mutateWorkspace).toHaveBeenCalledWith({ command: 'undoRoutine', orgId, routineId: actionId, expectedVersion: 4 }, actionId);
  });
  it('só grava uma memória depois de preencher e salvar explicitamente', async () => {
    const state = workspace(); render(<WorkspacePanels panel="memory" onPanelChange={vi.fn()} workspace={state} onAsk={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar preferência' }));
    fireEvent.change(screen.getByLabelText('Preferência'), { target: { value: 'Prefiro resumos curtos com fontes.' } });
    expect(state.mutateWorkspace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar memória' }));
    await waitFor(() => expect(state.mutateWorkspace).toHaveBeenCalledWith(expect.objectContaining({ command: 'saveMemory', content: 'Prefiro resumos curtos com fontes.', workerId: null, enabled: true }), 'memory-new'));
  });
});
