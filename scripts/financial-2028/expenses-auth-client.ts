import { createClient } from '@supabase/supabase-js';
import { qaProfile } from './expenses-auth-hooks';

// Uses the real Supabase JS query/RPC client against a loopback-only PostgREST gateway.
// No operational API/hook is replaced, and there is no production project URL here.
if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Local financial QA requires loopback.');
const session = await fetch(`/qa/session?profile=${encodeURIComponent(qaProfile())}`).then(async response => {
  if (!response.ok) throw new Error('Local QA gateway is unavailable.');
  return response.json() as Promise<{ anonKey: string; accessToken: string }>;
});
export const supabase = createClient(location.origin, session.anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { Authorization: `Bearer ${session.accessToken}` }, fetch: async (input, init) => {
    // DOM-only QA telemetry: count RPC requests without storing credentials or payloads.
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const rpc = new URL(url, location.origin).pathname.match(/\/rpc\/([^/]+)$/)?.[1];
    if (rpc) {
      const counts = JSON.parse(document.documentElement.dataset.financialQaRpcCounts ?? '{}') as Record<string, number>;
      counts[rpc] = (counts[rpc] ?? 0) + 1;
      document.documentElement.dataset.financialQaRpcCounts = JSON.stringify(counts);
    }
    return fetch(input, init);
  } },
});
