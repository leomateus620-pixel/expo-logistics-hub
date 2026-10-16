/** This test double is restricted to a separate loopback-only Vite harness. */
if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Workers QA requires loopback.');
type QueryResult = { data: Record<string, unknown>[]; error: null | { message: string } };
export const supabase = {
  auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-local-qa-only' } }, error: null }) },
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
