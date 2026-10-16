import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { executeWorkerTool, listWorkerTools, resolveWorkerAccess } from '../_shared/workers/generated/read-tools.js';
import { isObject, isUuid, parseWorkerRequest, WorkerError } from '../_shared/workers/contracts.ts';
import { publicWorkerError, runWorkerTurn, type TurnStart, type WorkerTurnDependencies } from '../_shared/workers/engine.ts';
import { createLovableProvider, readBoundedJson } from '../_shared/workers/provider.ts';
import { searchWorkersWeb } from '../_shared/workers/web-search.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-runtime, x-supabase-client-platform-version, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function publicKey(): string {
  const direct = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')?.trim() || Deno.env.get('SUPABASE_ANON_KEY')?.trim();
  if (direct && !direct.startsWith('sb_secret_')) return direct;
  try {
    const values: unknown = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
    if (isObject(values)) {
      const key = Object.values(values).find(value => typeof value === 'string' && value.startsWith('sb_publishable_'));
      if (typeof key === 'string') return key;
    }
  } catch { /* Configuration error is intentionally opaque. */ }
  throw new WorkerError('backend_not_configured', 503);
}

function databaseError(error: { code?: string; message?: string } | null): WorkerError {
  if (error?.message?.includes('WORKERS_RATE_LIMITED')) return new WorkerError('rate_limited', 429);
  if (error?.message?.includes('WORKERS_REQUEST_IN_PROGRESS_OR_FAILED')) return new WorkerError('request_in_progress', 409);
  if (error?.code === '42501' || error?.message?.includes('FORBIDDEN')) return new WorkerError('forbidden', 403);
  return new WorkerError('storage_unavailable', 503);
}

async function scopedRpc(client: SupabaseClient, name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw databaseError(error);
  return data;
}

function jsonError(error: unknown): Response {
  const details = publicWorkerError(error);
  return new Response(JSON.stringify({ error: details }), {
    status: error instanceof WorkerError ? Math.min(error.status, 599) : details.code === 'forbidden' ? 403 : 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return jsonError(new WorkerError('method_not_allowed', 405));
  const abort = new AbortController();
  let consumerCancelled = false;
  const onConsumerAbort = () => { consumerCancelled = true; abort.abort(); };
  req.signal.addEventListener('abort', onConsumerAbort, { once: true });
  if (req.signal.aborted) onConsumerAbort();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    if (abort.signal.aborted) throw new WorkerError('request_cancelled', 499);
    if (!req.headers.get('content-type')?.includes('application/json')) throw new WorkerError('invalid_request', 415);
    const bearer = req.headers.get('authorization');
    if (!bearer || !/^Bearer [A-Za-z0-9._-]{20,8192}$/i.test(bearer)) throw new WorkerError('forbidden', 401);
    const request = parseWorkerRequest(await readBoundedJson(req, 32000));
    const url = Deno.env.get('SUPABASE_URL')?.trim();
    if (!url) throw new WorkerError('backend_not_configured', 503);
    // This client is the sole database client: all reads/RPCs carry the caller JWT.
    const client = createClient(url, publicKey(), {
      global: { headers: { Authorization: bearer } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: identity, error: authError } = await client.auth.getUser();
    if (authError || !identity.user?.id) throw new WorkerError('forbidden', 401);
    const access = await resolveWorkerAccess(client, identity.user.id, request.orgId);
    const provider = createLovableProvider({ apiKey: Deno.env.get('LOVABLE_API_KEY'), model: Deno.env.get('WORKERS_ANALYSIS_MODEL') });
    const dependencies: WorkerTurnDependencies = {
      provider,
      signal: abort.signal,
      listTools: worker => listWorkerTools(worker, access),
      executeTool: (name, input) => executeWorkerTool(name, input, access),
      searchWeb: (input, signal) => searchWorkersWeb(input, { apiKey: Deno.env.get('FIRECRAWL_API_KEY'), gatewayKey: Deno.env.get('LOVABLE_API_KEY'), signal }),
      begin: async (value, worker) => {
        const result = await scopedRpc(client, 'ai_workers_begin_turn', {
          _org_id: value.orgId, _request_id: value.requestId, _worker_id: worker,
          _message: value.message, _conversation_id: value.conversationId ?? null,
        });
        if (!isObject(result) || !isUuid(result.conversationId) || typeof result.replayed !== 'boolean') throw new WorkerError('invalid_storage_response', 503);
        return result as unknown as TurnStart;
      },
      history: async conversationId => {
        const { data, error } = await client.from('ai_messages').select('role,content').eq('conversation_id', conversationId)
          .eq('org_id', request.orgId).eq('user_id', identity.user!.id).eq('state', 'complete').order('created_at', { ascending: false }).limit(6);
        if (error) throw databaseError(error);
        return (data ?? []).reverse();
      },
      finish: async (value, completion) => {
        await scopedRpc(client, 'ai_workers_finish_turn', {
          _org_id: value.orgId, _request_id: value.requestId, _content: completion.content,
          _citations: completion.citations, _model: completion.model,
          _input_tokens: completion.inputTokens, _output_tokens: completion.outputTokens, _tool_names: completion.tools,
          _usage_complete: completion.usageComplete ?? true,
        });
      },
      fail: async (value, usage) => { await scopedRpc(client, 'ai_workers_fail_turn', {
        _org_id: value.orgId, _request_id: value.requestId,
        _model: usage?.model ?? null, _input_tokens: usage?.inputTokens ?? 0, _output_tokens: usage?.outputTokens ?? 0,
      }); },
    };
    if (abort.signal.aborted) throw new WorkerError('request_cancelled', 499);
    deadline = setTimeout(() => abort.abort(), 55000);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit: Parameters<typeof runWorkerTurn>[2] = (event, data) => {
          if (!consumerCancelled) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        try { await runWorkerTurn(request, dependencies, emit); }
        catch (error) { emit('error', publicWorkerError(error)); }
        finally {
          if (deadline) clearTimeout(deadline);
          try { controller.close(); } catch { /* Consumer already disconnected. */ }
        }
      },
      cancel() { consumerCancelled = true; abort.abort(); if (deadline) clearTimeout(deadline); },
    });
    return new Response(stream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-store', 'X-Accel-Buffering': 'no' } });
  } catch (error) {
    if (deadline) clearTimeout(deadline);
    return jsonError(error);
  }
});
