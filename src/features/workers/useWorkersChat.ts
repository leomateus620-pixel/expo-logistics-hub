import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { maskSensitiveText } from '@/lib/workers/privacy';
import { safeWorkerSourceUrl, streamWorkersTurn, type WorkerRequestContext, type WorkersStreamEvent } from './api';
import { workersDatabase } from './database';
import type { WorkerAttachment, WorkerChatMessage, WorkerConversation, WorkerId, WorkerProgressStep } from './types';

const WORKER_IDS = new Set(['agenda', 'arena', 'mapa', 'interesse', 'comissao', 'logistica', 'caixa', 'radar']);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const workerId = (value: unknown): WorkerId => WORKER_IDS.has(String(value)) ? value as WorkerId : 'agenda';

function sourcesFrom(value: unknown): NonNullable<WorkerChatMessage['sources']> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const source = item as Record<string, unknown>;
    const kind = source.source === 'web' ? 'web' : 'app';
    const url = safeWorkerSourceUrl(source.url, kind);
    if (!url || typeof source.label !== 'string') return [];
    return [{ title: maskSensitiveText(source.label).slice(0, 160), url, kind, ...(typeof source.date === 'string' ? { date: source.date.slice(0, 30) } : {}) }];
  });
}

export interface UseWorkersChatOptions {
  workerId?: WorkerId;
  context?: WorkerRequestContext;
  conversationId?: string;
}

export function useWorkersChat(options: UseWorkersChatOptions = {}) {
  const { user } = useAuth();
  const { orgId } = useCurrentOrg();
  const scope = `${user?.id ?? ''}:${orgId ?? ''}`;
  const liveScope = useRef(scope);
  liveScope.current = scope;
  const [ownerScope, setOwnerScope] = useState(scope);
  const [messages, setMessages] = useState<WorkerChatMessage[]>([]);
  const [conversations, setConversations] = useState<WorkerConversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [activeWorkerId, setActiveWorkerId] = useState<WorkerId>(options.workerId ?? 'agenda');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [progress, setProgress] = useState<WorkerProgressStep[]>([]);
  const stream = useRef<AbortController | null>(null);
  const history = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const workspaceRefreshPending = useRef(false);
  const currentConversation = useRef<string | null>(null);
  const previousWorker = useRef(options.workerId);

  const stop = useCallback(() => {
    generation.current += 1;
    stream.current?.abort();
    stream.current = null;
    busy.current = false;
    setIsStreaming(false);
    setProgress([]);
    setMessages(current => current.filter(item => item.role !== 'assistant' || item.content.trim()));
  }, []);

  const newConversation = useCallback(() => {
    stop();
    history.current?.abort();
    currentConversation.current = null;
    setConversationId(null);
    setMessages([]);
    setProgress([]);
    setError(null);
    setActiveWorkerId(options.workerId ?? 'agenda');
    setIsLoadingHistory(false);
  }, [options.workerId, stop]);

  const refreshConversations = useCallback(async () => {
    if (!user?.id || !orgId) return;
    const requestScope = scope;
    try {
      const result = await workersDatabase.from('ai_conversations')
        .select('id,title,worker_id,updated_at')
        .eq('user_id', user.id).eq('org_id', orgId)
        .order('updated_at', { ascending: false }).limit(30);
      if (liveScope.current !== requestScope) return;
      if (result.error) {
        setError('Não foi possível carregar seu histórico. Você pode tentar novamente.');
        return;
      }
      setConversations((result.data ?? []).map(row => ({
        id: row.id, title: maskSensitiveText(row.title), workerId: workerId(row.worker_id), updatedAt: row.updated_at,
      })));
    } catch {
      if (liveScope.current === requestScope) setError('Não foi possível carregar seu histórico. Você pode tentar novamente.');
    }
  }, [user?.id, orgId, scope]);

  useEffect(() => {
    generation.current += 1;
    stream.current?.abort();
    history.current?.abort();
    busy.current = false;
    currentConversation.current = null;
    setOwnerScope(scope);
    setMessages([]);
    setConversations([]);
    setWorkspaceRevision(0);
    workspaceRefreshPending.current = false;
    setConversationId(null);
    setProgress([]);
    setError(null);
    setIsStreaming(false);
    setIsLoadingHistory(false);
    if (user?.id && orgId) void refreshConversations();
    return () => {
      generation.current += 1;
      stream.current?.abort();
      history.current?.abort();
    };
  }, [scope, user?.id, orgId, refreshConversations]);

  useEffect(() => {
    if (previousWorker.current === options.workerId) return;
    previousWorker.current = options.workerId;
    newConversation();
  }, [options.workerId, newConversation]);

  const selectConversation = useCallback(async (id: string) => {
    if (!uuid(id) || !user?.id || !orgId) return;
    stop();
    history.current?.abort();
    const controller = new AbortController();
    history.current = controller;
    const requestScope = scope;
    setIsLoadingHistory(true);
    currentConversation.current = null;
    setConversationId(null);
    setMessages([]);
    setError(null);
    try {
      const result = await workersDatabase.from('ai_messages')
        .select('id,request_id,role,content,worker_id,citations,created_at,state')
        .eq('conversation_id', id).eq('org_id', orgId).eq('user_id', user.id)
        .eq('state', 'complete').order('created_at', { ascending: false }).limit(100)
        .abortSignal(controller.signal);
      if (controller.signal.aborted || liveScope.current !== requestScope) return;
      setIsLoadingHistory(false);
      if (result.error) { setError('Não foi possível abrir esta conversa. Tente novamente.'); return; }
      if (!result.data?.length) { setError('Conversa indisponível ou sem mensagens concluídas.'); return; }
      currentConversation.current = id;
      setConversationId(id);
      const ordered = chronological(result.data);
      setMessages(ordered.map(row => ({
        id: row.id, role: row.role, content: maskSensitiveText(row.content), workerId: workerId(row.worker_id),
        createdAt: row.created_at, requestId: row.request_id, sources: sourcesFrom(row.citations),
      })));
      setActiveWorkerId(workerId(ordered[ordered.length - 1]?.worker_id));
    } catch {
      if (!controller.signal.aborted && liveScope.current === requestScope) {
        setIsLoadingHistory(false);
        setError('Não foi possível abrir esta conversa. Tente novamente.');
      }
    }
  }, [orgId, user?.id, scope, stop]);

  // Refresh background routine results without interrupting a live human turn.
  const refreshMessages = useCallback(async () => {
    const id = currentConversation.current;
    if (!id || busy.current || !user?.id || !orgId) return;
    history.current?.abort();
    const controller = new AbortController(); history.current = controller;
    const requestScope = scope; const requestGeneration = generation.current;
    try {
      const result = await workersDatabase.from('ai_messages')
        .select('id,request_id,role,content,worker_id,citations,created_at,state')
        .eq('conversation_id', id).eq('org_id', orgId).eq('user_id', user.id)
        .eq('state', 'complete').order('created_at', { ascending: false }).limit(100).abortSignal(controller.signal);
      if (controller.signal.aborted || liveScope.current !== requestScope || generation.current !== requestGeneration || busy.current || currentConversation.current !== id) return;
      if (result.error) return;
      setMessages(chronological(result.data ?? []).map(row => ({
        id: row.id, requestId: row.request_id, role: row.role, content: maskSensitiveText(row.content), workerId: workerId(row.worker_id),
        createdAt: row.created_at, sources: sourcesFrom(row.citations),
      })));
      void refreshConversations();
    } catch { /* The next active-session refresh may retry; never erase visible history. */ }
  }, [user?.id, orgId, scope, refreshConversations]);

  useEffect(() => {
    const update = (event: Event) => {
      if ((event as CustomEvent<{ orgId?: string }>).detail?.orgId !== orgId) return;
      setWorkspaceRevision(current => current + 1);
      if (busy.current) workspaceRefreshPending.current = true; else void refreshMessages();
    };
    window.addEventListener('workers-workspace-updated', update);
    return () => window.removeEventListener('workers-workspace-updated', update);
  }, [orgId, refreshMessages]);

  useEffect(() => {
    if (options.conversationId) void selectConversation(options.conversationId);
  }, [options.conversationId, selectConversation]);

  const sendMessage = useCallback(async (text: string, attachments: WorkerAttachment[] = []) => {
    const message = text.trim();
    if (!message || busy.current) return;
    if (!user?.id || !orgId) { setError('Entre na sua organização para conversar com a equipe.'); return; }
    if (message.length > 6_000) { setError('Escreva uma mensagem de até 6.000 caracteres.'); return; }
    if (attachments.length > 3 || attachments.some(file => file.text.length > 6_000) || attachments.reduce((total, file) => total + file.text.length, 0) > 12_000) {
      setError('Anexe até três arquivos de até 6.000 caracteres, somando no máximo 12.000 caracteres.'); return;
    }
    history.current?.abort();
    const controller = new AbortController();
    stream.current = controller;
    const requestGeneration = ++generation.current;
    const requestScope = scope;
    busy.current = true;
    setIsStreaming(true);
    setIsLoadingHistory(false);
    setError(null);
    setProgress([]);
    const requestId = crypto.randomUUID();
    const assistantId = `assistant-${requestId}`;
    setMessages(current => [...current, {
      id: `user-${requestId}`, requestId, role: 'user', content: maskSensitiveText(message), createdAt: new Date().toISOString(),
    }, {
      id: assistantId, requestId, role: 'assistant', content: '', workerId: options.workerId ?? activeWorkerId,
      createdAt: new Date().toISOString(), sources: [],
    }]);
    const alive = () => !controller.signal.aborted && requestGeneration === generation.current && liveScope.current === requestScope;
    const onEvent = (event: WorkersStreamEvent) => {
      if (!alive()) return;
      if (event.event === 'worker' && typeof event.data.workerId === 'string' && WORKER_IDS.has(event.data.workerId)) {
        const selected = workerId(event.data.workerId);
        setActiveWorkerId(selected);
        setMessages(current => current.map(item => item.id === assistantId ? { ...item, workerId: selected } : item));
      } else if (event.event === 'conversation' && uuid(event.data.conversationId)) {
        currentConversation.current = event.data.conversationId;
        setConversationId(event.data.conversationId);
      } else if (event.event === 'workspace' && uuid(event.data.id) && ['action', 'routine'].includes(event.data.kind)) {
        setWorkspaceRevision(current => current + 1);
        window.dispatchEvent(new CustomEvent('workers-workspace-updated', { detail: { orgId } }));
      } else if (event.event === 'progress' && typeof event.data.label === 'string' && ['running', 'complete'].includes(event.data.status)) {
        const step = { label: maskSensitiveText(event.data.label).slice(0, 160), status: event.data.status };
        setProgress(current => [...current.filter(item => item.label !== step.label), step].slice(-12));
      } else if (event.event === 'delta' && typeof event.data.text === 'string') {
        setMessages(current => current.map(item => item.id === assistantId
          ? { ...item, content: maskSensitiveText((item.content + event.data.text).slice(0, 32_000)) } : item));
      } else if (event.event === 'citations') {
        const sources = sourcesFrom(event.data.citations);
        setMessages(current => current.map(item => item.id === assistantId ? { ...item, sources } : item));
      } else if (event.event === 'error') {
        throw new Error(typeof event.data.message === 'string' ? maskSensitiveText(event.data.message).slice(0, 300) : 'A consulta não pôde ser concluída.');
      }
    };
    try {
      await streamWorkersTurn({
        orgId, requestId, message,
        ...(currentConversation.current ? { conversationId: currentConversation.current } : {}),
        ...(options.workerId ? { worker: options.workerId } : {}),
        ...(options.context ? { context: options.context } : {}),
        ...(attachments.length ? { attachments: attachments.map(file => ({ name: maskSensitiveText(file.name).slice(0, 100), text: file.text })) } : {}),
      }, onEvent, controller.signal);
      if (alive()) void refreshConversations();
    } catch (cause) {
      if (alive()) setError(cause instanceof Error ? cause.message : 'A consulta não pôde ser concluída.');
    } finally {
      if (requestGeneration === generation.current && liveScope.current === requestScope) {
        busy.current = false;
        setIsStreaming(false);
        setMessages(current => current.filter(item => item.id !== assistantId || item.content.trim()));
        if (workspaceRefreshPending.current) { workspaceRefreshPending.current = false; void refreshMessages(); }
      }
    }
  }, [user?.id, orgId, scope, options.workerId, options.context, activeWorkerId, refreshConversations, refreshMessages]);

  const visible = ownerScope === scope;
  return {
    messages: visible ? messages : [], conversations: visible ? conversations : [],
    conversationId: visible ? conversationId : null, activeWorkerId,
    isStreaming: visible && isStreaming, isLoadingHistory: visible && isLoadingHistory,
    progress: visible ? progress : [], error: visible ? error : null,
    workspaceRevision, refreshMessages, sendMessage, stop, selectConversation, newConversation, clearError: () => setError(null),
  };
}
