/** This test double is restricted to a separate loopback-only Vite harness. */
if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Workers QA requires loopback.');
type QueryResult = { data: Record<string, unknown>[]; error: null | { message: string } };
export const supabase = {
  auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-local-qa-only' } }, error: null }) },
  rpc: (name: string, args: { _org_id: string; _conversation_id: string; _before_sequence?: number; _turn_limit?: number }) => {
    if (name === 'ai_workers_can_access') return Promise.resolve({ data: true, error: null });
    if (name !== 'ai_workers_read_history') throw new Error('Unknown local fixture RPC');
    let signal: AbortSignal | undefined;
    const params = new URLSearchParams({ org_id: args._org_id, conversation_id: args._conversation_id, state: 'complete' });
    const query = { abortSignal: (value: AbortSignal) => { signal = value; return query; }, then: (resolve: (result: QueryResult) => unknown, reject: (error: unknown) => unknown) =>
      fetch(`/__workers-qa/history/ai_messages?${params}`, { signal }).then(response => response.json()).then((result: QueryResult) => ({ ...result, data: result.data.map((row, index) => ({ ...row, message_seq: row.message_seq ?? index + 1 })).filter(row => args._before_sequence === undefined || Number(row.message_seq) < args._before_sequence).slice(-((args._turn_limit ?? 50) * 2)) })).then(resolve, reject) };
    return query;
  },
  from: (table: string) => {
    const params = new URLSearchParams();
    let signal: AbortSignal | undefined;
    const query = {
      select: (_fields: string) => query,
      eq: (key: string, value: string) => { params.set(key, value); return query; },
      order: (_key: string, _options: unknown) => query,
      limit: (_limit: number) => query,
      abortSignal: (value: AbortSignal) => { signal = value; return query; },
      then: (resolve: (result: QueryResult) => unknown, reject: (error: unknown) => unknown) =>
        fetch(`/__workers-qa/history/${table}?${params}`, { signal }).then(response => response.json()).then(resolve, reject),
    };
    return query;
  },
};
