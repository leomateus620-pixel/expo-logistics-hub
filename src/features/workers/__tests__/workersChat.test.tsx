import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkersChat } from '../useWorkersChat';
import type { WorkersStreamEvent, WorkersTurnRequest } from '../api';

const USER_A = '00000000-0000-4000-8000-000000000001';
const USER_B = '00000000-0000-4000-8000-000000000002';
const ORG_A = '10000000-0000-4000-8000-000000000001';
const ORG_B = '10000000-0000-4000-8000-000000000002';
const CHAT_A = '20000000-0000-4000-8000-000000000001';
const CHAT_B = '20000000-0000-4000-8000-000000000002';
const mocks = vi.hoisted(() => ({ user: { id: '00000000-0000-4000-8000-000000000001' } as { id: string } | null, orgId: '10000000-0000-4000-8000-000000000001' as string | null, from: vi.fn(), stream: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/hooks/useCurrentOrg', () => ({ useCurrentOrg: () => ({ orgId: mocks.orgId }) }));
vi.mock('../database', () => ({ workersDatabase: { from: mocks.from } }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: vi.fn() } } }));
vi.mock('../api', async importOriginal => ({ ...await importOriginal<typeof import('../api')>(), streamWorkersTurn: mocks.stream }));

interface DbResult { data: Array<Record<string, unknown>> | null; error: { message: string } | null }
interface StreamCall { request: WorkersTurnRequest; onEvent: (event: WorkersStreamEvent) => void; signal: AbortSignal; resolve: () => void }
let queryResolver: (query: TestQuery) => Promise<DbResult>;
let queries: TestQuery[];
let streams: StreamCall[];

class TestQuery implements PromiseLike<DbResult> {
  filters = new Map<string, unknown>();
  signal?: AbortSignal;
  constructor(readonly table: string) {}
  select() { return this; }
  eq(column: string, value: unknown) { this.filters.set(column, value); return this; }
  order() { return this; }
  limit() { return this; }
  abortSignal(signal: AbortSignal) { this.signal = signal; return this; }
  then<TResult1 = DbResult, TResult2 = never>(fulfilled?: ((value: DbResult) => TResult1 | PromiseLike<TResult1>) | null, rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2> {
    queries.push(this);
    return queryResolver(this).then(fulfilled, rejected);
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const row = (content: string, id = CHAT_A) => ({ id, role: 'assistant', content, worker_id: 'agenda', citations: [], created_at: '2026-10-16T12:00:00Z', state: 'complete' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: USER_A }; mocks.orgId = ORG_A;
  queries = []; streams = [];
  queryResolver = async () => ({ data: [], error: null });
  mocks.from.mockImplementation((table: string) => new TestQuery(table));
  mocks.stream.mockImplementation((request: WorkersTurnRequest, onEvent: (event: WorkersStreamEvent) => void, signal: AbortSignal) => new Promise<void>(resolve => { streams.push({ request, onEvent, signal, resolve }); }));
});
afterEach(() => { cleanup(); streams.forEach(stream => stream.resolve()); });

describe('bots chat request lifecycle', () => {
  it('sends current scope and stripped attachment metadata, blocks duplicate sends and masks local personal data', async () => {
    const { result } = renderHook(() => useWorkersChat({ workerId: 'agenda', context: { route: '/cronograma-eventos' } }));
    act(() => { void result.current.sendMessage('Contato ana@example.com', [{ name: 'nota', text: 'conteúdo', trust: 'untrusted' }]); void result.current.sendMessage('duplicate'); });
    await waitFor(() => expect(streams).toHaveLength(1));
    expect(streams[0].request).toMatchObject({ orgId: ORG_A, worker: 'agenda', context: { route: '/cronograma-eventos' }, attachments: [{ name: 'nota', text: 'conteúdo' }] });
    expect(streams[0].request.attachments?.[0]).not.toHaveProperty('trust');
    expect(result.current.messages[0].content).not.toContain('ana@example.com');
    act(() => {
      streams[0].onEvent({ event: 'conversation', data: { conversationId: CHAT_A } });
      streams[0].onEvent({ event: 'delta', data: { text: '1 evento visível' } });
      streams[0].onEvent({ event: 'citations', data: { citations: [{ label: 'Agenda', url: '/cronograma-eventos', source: 'app' }, { label: 'Privado', url: '/areas/pav/token', source: 'app' }] } });
    });
    expect(result.current.conversationId).toBe(CHAT_A);
    expect(result.current.messages[1].sources).toHaveLength(1);
    await act(async () => { streams[0].resolve(); });
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages[1].content).toBe('1 evento visível');
  });

  it('removes a blank assistant placeholder when stopped and ignores every later frame', async () => {
    const { result } = renderHook(() => useWorkersChat());
    act(() => { void result.current.sendMessage('Agenda amanhã'); });
    await waitFor(() => expect(streams).toHaveLength(1));
    act(() => result.current.stop());
    expect(streams[0].signal.aborted).toBe(true);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages).toHaveLength(1);
    act(() => streams[0].onEvent({ event: 'delta', data: { text: 'must not appear' } }));
    expect(result.current.messages.some(message => message.content.includes('must not appear'))).toBe(false);
  });

  it('preserves partial verified text on interruption and exposes an actionable error', async () => {
    mocks.stream.mockImplementation(async (_request: WorkersTurnRequest, onEvent: (event: WorkersStreamEvent) => void) => {
      onEvent({ event: 'delta', data: { text: 'Resultado parcial autorizado' } });
      throw new Error('A conexão foi interrompida.');
    });
    const { result } = renderHook(() => useWorkersChat());
    await act(async () => { await result.current.sendMessage('Agenda amanhã'); });
    expect(result.current.error).toContain('interrompida');
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages[1].content).toBe('Resultado parcial autorizado');
  });
});

describe('bots history and identity isolation', () => {
  it.each(['user', 'org'])('clears immediately and rejects stale stream frames when the %s changes', async changed => {
    const { result, rerender } = renderHook(() => useWorkersChat());
    act(() => { void result.current.sendMessage('Primeira identidade'); });
    await waitFor(() => expect(streams).toHaveLength(1));
    act(() => streams[0].onEvent({ event: 'delta', data: { text: 'Dados da primeira identidade' } }));
    if (changed === 'user') mocks.user = { id: USER_B }; else mocks.orgId = ORG_B;
    rerender();
    expect(result.current.messages).toEqual([]);
    expect(result.current.conversationId).toBeNull();
    expect(streams[0].signal.aborted).toBe(true);
    act(() => { void result.current.sendMessage('Segunda identidade'); });
    await waitFor(() => expect(streams).toHaveLength(2));
    act(() => {
      streams[0].onEvent({ event: 'conversation', data: { conversationId: CHAT_A } });
      streams[0].onEvent({ event: 'delta', data: { text: 'Dados antigos' } });
      streams[1].onEvent({ event: 'conversation', data: { conversationId: CHAT_B } });
      streams[1].onEvent({ event: 'delta', data: { text: 'Dados atuais' } });
    });
    expect(result.current.conversationId).toBe(CHAT_B);
    expect(result.current.messages.map(message => message.content).join(' ')).not.toContain('Dados antigos');
    expect(result.current.messages[1].content).toBe('Dados atuais');
    expect(streams[1].request.orgId).toBe(changed === 'org' ? ORG_B : ORG_A);
  });

  it('ignores stale conversation-list and message reads after a user/org switch, with scoped DB filters', async () => {
    const oldList = deferred<DbResult>();
    const oldMessages = deferred<DbResult>();
    queryResolver = query => query.filters.get('user_id') === USER_A
      ? query.table === 'ai_conversations' ? oldList.promise : oldMessages.promise
      : Promise.resolve({ data: query.table === 'ai_conversations' ? [{ id: CHAT_B, title: 'Conversa B', worker_id: 'arena', updated_at: '2026-10-16' }] : [], error: null });
    const { result, rerender } = renderHook(() => useWorkersChat());
    act(() => { void result.current.selectConversation(CHAT_A); });
    await waitFor(() => expect(queries.some(query => query.table === 'ai_messages')).toBe(true));
    mocks.user = { id: USER_B }; mocks.orgId = ORG_B; rerender();
    await waitFor(() => expect(result.current.conversations[0]?.title).toBe('Conversa B'));
    await act(async () => {
      oldList.resolve({ data: [{ id: CHAT_A, title: 'PRIVATE OLD LIST', worker_id: 'agenda', updated_at: '2026-10-15' }], error: null });
      oldMessages.resolve({ data: [row('PRIVATE OLD MESSAGE')], error: null });
    });
    expect(result.current.messages).toEqual([]);
    expect(result.current.conversations.map(conversation => conversation.title)).toEqual(['Conversa B']);
    const historyRead = queries.find(query => query.table === 'ai_messages')!;
    expect(historyRead.filters.get('org_id')).toBe(ORG_A);
    expect(historyRead.filters.get('user_id')).toBe(USER_A);
    expect(historyRead.filters.get('conversation_id')).toBe(CHAT_A);
    expect(historyRead.signal?.aborted).toBe(true);
  });

  it('keeps only the most recently selected conversation when earlier history resolves late', async () => {
    const first = deferred<DbResult>(); const second = deferred<DbResult>();
    queryResolver = query => query.table === 'ai_conversations' ? Promise.resolve({ data: [], error: null }) : query.filters.get('conversation_id') === CHAT_A ? first.promise : second.promise;
    const { result } = renderHook(() => useWorkersChat());
    act(() => { void result.current.selectConversation(CHAT_A); });
    await waitFor(() => expect(queries.filter(query => query.table === 'ai_messages')).toHaveLength(1));
    act(() => { void result.current.selectConversation(CHAT_B); });
    await act(async () => { second.resolve({ data: [row('Conversa selecionada B', CHAT_B)], error: null }); });
    await act(async () => { first.resolve({ data: [row('Conversa antiga A')], error: null }); });
    expect(result.current.conversationId).toBe(CHAT_B);
    expect(result.current.messages.map(message => message.content)).toEqual(['Conversa selecionada B']);
  });

  it('does not append a new request to a previous conversation after selecting an unavailable one', async () => {
    queryResolver = async query => ({ data: query.table === 'ai_conversations' ? [] : [row('Conversa A')], error: null });
    const { result } = renderHook(() => useWorkersChat());
    await act(async () => { await result.current.selectConversation(CHAT_A); });
    expect(result.current.conversationId).toBe(CHAT_A);
    queryResolver = async query => query.table === 'ai_messages' ? { data: null, error: { message: 'denied' } } : { data: [], error: null };
    await act(async () => { await result.current.selectConversation(CHAT_B); });
    expect(result.current.conversationId).toBeNull();
    act(() => { void result.current.sendMessage('Nova pergunta'); });
    await waitFor(() => expect(streams).toHaveLength(1));
    expect(streams[0].request).not.toHaveProperty('conversationId');
  });

  it('finishes loading and reports a history transport rejection without an unhandled promise', async () => {
    queryResolver = async query => {
      if (query.table === 'ai_messages') throw new Error('network transport rejected');
      return { data: [], error: null };
    };
    const { result } = renderHook(() => useWorkersChat());
    await act(async () => { await result.current.selectConversation(CHAT_A); });
    expect(result.current.isLoadingHistory).toBe(false);
    expect(result.current.error).toContain('Não foi possível abrir');
    expect(result.current.conversationId).toBeNull();
  });

  it('reports a conversation-list transport rejection without leaking the underlying exception', async () => {
    queryResolver = async () => { throw new Error('private transport details'); };
    const { result } = renderHook(() => useWorkersChat());
    await waitFor(() => expect(result.current.error).toContain('Não foi possível carregar'));
    expect(result.current.error).not.toContain('private transport details');
  });
});
