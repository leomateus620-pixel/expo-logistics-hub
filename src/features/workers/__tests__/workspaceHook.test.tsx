import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkerWorkspace } from '../workspace/useWorkerWorkspace';
import { callWorkerAction, callWorkerWorkspace } from '../workspace-api';
import type { ActionCommand, ActionView } from '../workspace-contracts';

const identity = vi.hoisted(() => ({ userId: '10000000-0000-4000-8000-000000000001', orgId: '20000000-0000-4000-8000-000000000001' }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: identity.userId } }) }));
vi.mock('@/hooks/useCurrentOrg', () => ({ useCurrentOrg: () => ({ orgId: identity.orgId }) }));
vi.mock('../workspace-api', () => ({ callWorkerAction: vi.fn(), callWorkerWorkspace: vi.fn() }));
const action: ActionView = { id: '30000000-0000-4000-8000-000000000001', orgId: identity.orgId, conversationId: '40000000-0000-4000-8000-000000000001', workerId: 'arena', kind: 'arena_note', version: 1, status: 'proposed', summary: 'Nota operacional', target: { recordId: '50000000-0000-4000-8000-000000000001', label: 'Arena', href: '/eventos-restaurante-arena' }, diff: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 900000).toISOString(), serverNow: new Date().toISOString(), permissions: { canConfirm: true, canEdit: true, canCancel: true, reason: 'allowed' }, manualInputState: 'notRequired', receipt: null, failure: null };
const command = (): ActionCommand => ({ command: 'confirm', orgId: identity.orgId, actionId: action.id, expectedVersion: 1 });
beforeEach(() => {
  identity.orgId = '20000000-0000-4000-8000-000000000001'; vi.clearAllMocks();
  vi.mocked(callWorkerAction).mockResolvedValue([]);
  vi.mocked(callWorkerWorkspace).mockResolvedValue({ serverNow: new Date().toISOString(), routines: [], runs: [], events: [], memories: [], alerts: [] });
});
afterEach(cleanup);

describe('isolamento e reconciliação do workspace', () => {
  it('reconcilia confirmação com timeout por GET do mesmo card sem executar outra vez', async () => {
    const executed = { ...action, status: 'executed' as const, receipt: { receiptId: action.id, executedAt: new Date().toISOString(), target: action.target, summary: 'Nota salva', replayed: true, undo: null } };
    vi.mocked(callWorkerAction).mockImplementation(async input => { if (input.command === 'confirm') throw new Error('A resposta demorou. Confira o estado.'); if (input.command === 'get') return executed; return []; });
    const { result } = renderHook(() => useWorkerWorkspace());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.mutateAction(command()); });
    expect(result.current.actions).toEqual([executed]);
    expect(callWorkerAction).toHaveBeenCalledWith({ command: 'get', orgId: identity.orgId, actionId: action.id });
    expect(vi.mocked(callWorkerAction).mock.calls.filter(([input]) => input.command === 'confirm')).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });
  it('impede dois comandos simultâneos para o mesmo card no mesmo hook', async () => {
    let complete: (value: ActionView) => void = () => undefined;
    vi.mocked(callWorkerAction).mockImplementation(input => input.command === 'confirm' ? new Promise(resolve => { complete = resolve; }) : Promise.resolve([]));
    const { result } = renderHook(() => useWorkerWorkspace()); await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { const first = result.current.mutateAction(command()); await result.current.mutateAction(command()); complete(action); await first; });
    expect(vi.mocked(callWorkerAction).mock.calls.filter(([input]) => input.command === 'confirm')).toHaveLength(1);
  });
  it('ignora confirmação tardia após mudar de organização e limpa os dados imediatamente', async () => {
    let complete: (value: ActionView) => void = () => undefined;
    vi.mocked(callWorkerAction).mockImplementation(input => input.command === 'confirm' ? new Promise(resolve => { complete = resolve; }) : Promise.resolve(input.orgId === action.orgId ? [action] : []));
    const { result, rerender } = renderHook(() => useWorkerWorkspace()); await waitFor(() => expect(result.current.actions).toHaveLength(1));
    let pending: Promise<ActionView | undefined>;
    act(() => { pending = result.current.mutateAction(command()); });
    identity.orgId = '20000000-0000-4000-8000-000000000002'; rerender();
    expect(result.current.actions).toEqual([]);
    await act(async () => { complete(action); await pending; });
    expect(result.current.actions).toEqual([]); expect(result.current.error).toBeNull();
  });
});
