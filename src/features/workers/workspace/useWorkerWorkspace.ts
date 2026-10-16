import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { callWorkerAction, callWorkerWorkspace } from '../workspace-api';
import type { ActionCommand, ActionView, WorkspaceCommand, WorkspaceSnapshot } from '../workspace-contracts';

const emptySnapshot: WorkspaceSnapshot = { serverNow: '', routines: [], runs: [], events: [], memories: [], alerts: [] };
const safeError = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível atualizar a equipe. Tente novamente.';
const isSnapshot = (value: unknown): value is WorkspaceSnapshot => !!value && typeof value === 'object' && 'routines' in value && 'memories' in value;

export function useWorkerWorkspace({ conversationId, revision = 0, isStreaming = false }: { conversationId?: string | null; revision?: number; isStreaming?: boolean } = {}) {
  const { user } = useAuth(); const userId = user?.id; const { orgId } = useCurrentOrg();
  const scope = `${userId ?? ''}:${orgId ?? ''}`; const liveScope = useRef(scope); liveScope.current = scope;
  const [ownerScope, setOwnerScope] = useState(scope); const [actions, setActions] = useState<ActionView[]>([]);
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot>(emptySnapshot); const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null); const [busyId, setBusyId] = useState<string | null>(null);
  const pending = useRef(new Set<string>()); const reads = useRef<AbortController | null>(null); const generation = useRef(0);
  const upsertAction = useCallback((action: ActionView) => setActions(current => [action, ...current.filter(item => item.id !== action.id)]), []);
  const refresh = useCallback(async () => {
    if (!orgId || !userId) return;
    reads.current?.abort(); const controller = new AbortController(); reads.current = controller;
    const requestScope = scope; const requestGeneration = ++generation.current; setLoading(true);
    const results = await Promise.allSettled([
      callWorkerAction({ command: 'list', orgId }, controller.signal),
      callWorkerWorkspace({ command: 'snapshot', orgId }, controller.signal),
    ]);
    if (controller.signal.aborted || liveScope.current !== requestScope || generation.current !== requestGeneration) return;
    setOwnerScope(requestScope); setLoading(false);
    const [actionResult, workspaceResult] = results;
    if (actionResult.status === 'fulfilled' && Array.isArray(actionResult.value)) setActions(actionResult.value);
    if (workspaceResult.status === 'fulfilled' && isSnapshot(workspaceResult.value)) setSnapshot(workspaceResult.value);
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') setError(safeError(failure.reason));
    else setError(null);
  }, [orgId, userId, scope]);
  useEffect(() => {
    setOwnerScope(scope); setActions([]); setSnapshot(emptySnapshot); setError(null); setBusyId(null); pending.current.clear();
    void refresh();
    return () => { reads.current?.abort(); generation.current += 1; };
  }, [scope, refresh]);
  useEffect(() => { if (!isStreaming) void refresh(); }, [revision, isStreaming, conversationId, refresh]);
  useEffect(() => {
    const update = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    window.addEventListener('focus', update);
    return () => { window.removeEventListener('focus', update); };
  }, [refresh]);

  const mutateAction = useCallback(async (command: ActionCommand) => {
    const key = 'actionId' in command ? command.actionId : 'propose';
    if (pending.current.has(key)) return undefined;
    const requestScope = scope; pending.current.add(key); setBusyId(key); setError(null);
    try {
      const result = await callWorkerAction(command);
      if (liveScope.current !== requestScope) return undefined;
      if (!Array.isArray(result)) { upsertAction(result); return result; }
    } catch (failure) {
      // A timeout may follow a committed transaction. Read the same card; never create another action.
      if (command.command === 'confirm' && liveScope.current === requestScope) {
        try {
          const current = await callWorkerAction({ command: 'get', orgId: command.orgId, actionId: command.actionId });
          if (!Array.isArray(current) && liveScope.current === requestScope) {
            upsertAction(current);
            if (current.status === 'executed') return current;
          }
        } catch { /* Retain the original safe transport error and offer reconciliation. */ }
      }
      if (liveScope.current === requestScope) setError(safeError(failure));
      throw failure;
    } finally {
      pending.current.delete(key); if (liveScope.current === requestScope) setBusyId(null);
    }
    return undefined;
  }, [scope, upsertAction]);
  const mutateWorkspace = useCallback(async (command: WorkspaceCommand, entityId: string) => {
    if (pending.current.has(entityId)) return;
    const requestScope = scope; pending.current.add(entityId); setBusyId(entityId); setError(null);
    try {
      const result = await callWorkerWorkspace(command);
      if (liveScope.current !== requestScope) return;
      if (isSnapshot(result)) setSnapshot(result);
      await refresh();
      window.dispatchEvent(new CustomEvent('workers-workspace-updated', { detail: { orgId: command.orgId } }));
      return result;
    } catch (failure) {
      if (liveScope.current === requestScope) { setError(safeError(failure)); void refresh(); }
      throw failure;
    } finally { pending.current.delete(entityId); if (liveScope.current === requestScope) setBusyId(null); }
  }, [scope, refresh]);
  const visible = ownerScope === scope;
  return {
    orgId, scope, actions: visible ? actions : [], snapshot: visible ? snapshot : emptySnapshot,
    conversationActions: visible ? actions.filter(action => action.conversationId === conversationId) : [],
    pendingActions: visible ? actions.filter(action => action.status === 'proposed' && Date.parse(action.expiresAt) > Date.now()) : [],
    loading: !visible || loading, error: visible ? error : null, busyId: visible ? busyId : null,
    refresh, mutateAction, mutateWorkspace, clearError: () => setError(null),
  };
}
export type WorkerWorkspace = ReturnType<typeof useWorkerWorkspace>;

export function workspaceDate(value: string | null, includeDate = true) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Não informado';
  return new Intl.DateTimeFormat('pt-BR', { ...(includeDate ? { day: '2-digit', month: '2-digit' } as const : {}), hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
}
