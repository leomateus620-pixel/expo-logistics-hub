import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { executeWorkerTool, listWorkerTools, resolveWorkerAccess } from '../_shared/workers/generated/read-tools.js';
import { isObject, isUuid, parseWorkerRequest, redactWorkerText, WorkerError } from '../_shared/workers/contracts.ts';
import { publicWorkerError, runWorkerTurn, type TurnStart, type WorkerTurnDependencies } from '../_shared/workers/engine.ts';
import { createLovableProvider, readBoundedJson } from '../_shared/workers/provider.ts';
import { searchWorkersWeb } from '../_shared/workers/web-search.ts';
import { workspacePlanner } from '../_shared/workers/workspace-planner.ts';
import { readInstitutionalPresident } from '../_shared/workers/institutional.ts';
import { searchKnowledgeBase } from '../_shared/workers/knowledge-base.ts';
import { parseCommercialReportSnapshot } from '../_shared/workers/commercial-report.ts';
import { boundedWorkerCleanup, raceWorkerSignal, workerAuthFailureCode, workerFailureDiagnostic } from '../_shared/workers/failures.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-runtime, x-supabase-client-platform-version, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function publicKey(): string {
  const direct = Deno.env.get('SUPABASE_PUBLISHABLE_KEY')?.trim() || Deno.env.get('SUPABASE_ANON_KEY')?.trim();
  if (direct?.startsWith('sb_publishable_')) return direct;
  if (direct?.split('.').length === 3) {
    try {
      const body: unknown = JSON.parse(atob(direct.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (isObject(body) && body.role === 'anon') return direct;
    } catch { /* Opaque configuration failure; never accept a service-role key. */ }
  }
  try {
    const values: unknown = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}');
    if (isObject(values)) {
      const key = Object.values(values).find(value => typeof value === 'string' && value.startsWith('sb_publishable_'));
      if (typeof key === 'string') return key;
    }
  } catch { /* Configuration error is intentionally opaque. */ }
  throw new WorkerError('backend_not_configured', 503);
}

function databaseError(error: { code?: string; message?: string } | null, stage = 'persistence'): WorkerError {
  if (error?.message?.includes('KB_VERSION_CHANGED')) return new WorkerError('kb_version_changed', 409, { stage: 'kb_persistence', technicalCode: 'KB_VERSION_CHANGED' });
  if (error?.message?.includes('WORKERS_RATE_LIMITED')) return new WorkerError('rate_limited', 429);
  if (error?.message?.includes('WORKERS_REQUEST_IN_PROGRESS_OR_FAILED')) return new WorkerError('request_in_progress', 409);
  if (error?.code === '42501' || error?.message?.includes('FORBIDDEN')) return new WorkerError('forbidden', 403);
  const technicalCode = /^[A-Z0-9_]{1,40}$/i.test(error?.code ?? '') ? error?.code : undefined;
  const code = ['PGRST202','PGRST203','42883','42703'].includes(error?.code ?? '') ? 'rpc_incompatible'
    : error?.code === '57014' ? 'timeout' : /^(?:08|PGRST00)/.test(error?.code ?? '') ? 'network_error'
    : error?.message?.includes('WORKERS_INVALID_RESPONSE') ? 'invalid_response' : error?.code ? 'sql_error' : 'query_failed';
  return new WorkerError(code, 503, { stage, technicalCode });
}

async function scopedRpc(client: SupabaseClient, name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
  const { data, error } = await raceWorkerSignal(() => client.rpc(name, args).abortSignal(signal), signal);
  if (error) throw databaseError(error);
  return data;
}

function jsonError(error: unknown, requestId?: string): Response {
  const details = publicWorkerError(error);
  return new Response(JSON.stringify({ error: { ...details, ...(requestId ? { requestId } : {}) } }), {
    status: error instanceof WorkerError ? Math.min(error.status, 599) : details.code === 'forbidden' ? 403 : 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return jsonError(new WorkerError('method_not_allowed', 405));
  const abort = new AbortController();
  let consumerCancelled = false;
  const onConsumerAbort = () => { consumerCancelled = true; abort.abort(new WorkerError('request_cancelled', 499)); };
  req.signal.addEventListener('abort', onConsumerAbort, { once: true });
  if (req.signal.aborted) onConsumerAbort();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let requestId: string | undefined;
  try {
    deadline = setTimeout(() => { timedOut = true; abort.abort(new WorkerError('timeout', 504, { stage: 'orchestration' })); }, 55000);
    if (abort.signal.aborted) throw new WorkerError('request_cancelled', 499);
    if (!req.headers.get('content-type')?.includes('application/json')) throw new WorkerError('invalid_request', 415);
    const bearer = req.headers.get('authorization');
    if (!bearer || !/^Bearer [A-Za-z0-9._-]{20,8192}$/i.test(bearer)) throw new WorkerError('forbidden', 401);
    const request = parseWorkerRequest(await raceWorkerSignal(() => readBoundedJson(req, 32000), abort.signal));
    requestId = request.requestId;
    const url = Deno.env.get('SUPABASE_URL')?.trim();
    if (!url) throw new WorkerError('backend_not_configured', 503);
    // This client is the sole database client: all reads/RPCs carry the caller JWT.
    const client = createClient(url, publicKey(), {
      global: { headers: { Authorization: bearer } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: identity, error: authError } = await raceWorkerSignal(() => client.auth.getUser(), abort.signal);
    if (authError) {
      const code = workerAuthFailureCode(authError);
      throw new WorkerError(code, code === 'forbidden' ? 401 : code === 'timeout' ? 504 : 503, { stage: 'authentication' });
    }
    if (!identity.user?.id || identity.user.role === 'service_role') throw new WorkerError('forbidden', 401);
    const callerId = identity.user.id;
    const access = await raceWorkerSignal(() => resolveWorkerAccess(client, callerId, request.orgId), abort.signal);
    // Equipe Fenasoja is limited to org admins, CCPF and Comissão Central (DB-side check).
    const { data: eligible, error: eligibleError } = await raceWorkerSignal(() => client.rpc('ai_workers_can_access', { _org_id: request.orgId }).abortSignal(abort.signal), abort.signal);
    if (eligibleError) throw databaseError(eligibleError, 'authorization');
    if (eligible !== true) throw new WorkerError('forbidden', 403);
    const provider = createLovableProvider({ apiKey: Deno.env.get('LOVABLE_API_KEY'), model: Deno.env.get('WORKERS_ANALYSIS_MODEL') });
    let cleanup: Promise<void> | undefined;
    const dependencies: WorkerTurnDependencies = {
      provider,
      captureCommercialReport: async (snapshot, context) => {
        const verified = parseCommercialReportSnapshot(snapshot);
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!serviceKey) throw new WorkerError('report_capture_unavailable', 503);
        // The privileged client only stores trusted tool evidence. Commercial reads use the caller JWT.
        const artifacts = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
        const snapshotId = await scopedRpc(artifacts, 'workers_commercial_report_store', {
          _org_id: context.orgId, _user_id: callerId, _conversation_id: context.conversationId,
          _request_id: context.requestId, _snapshot: verified,
        }, abort.signal);
        if (snapshotId !== verified.snapshotId) throw new WorkerError('report_snapshot_mismatch', 503);
        if (!context.generatePdf) return { snapshotId: verified.snapshotId, status: 'available' };
        const report = await scopedRpc(client, 'workers_commercial_report_prepare', {
          _org_id: context.orgId, _snapshot_id: verified.snapshotId,
        }, abort.signal);
        if (!isObject(report) || !isUuid(report.id) || typeof report.status !== 'string') throw new WorkerError('invalid_storage_response', 503);
        return { snapshotId: verified.snapshotId, reportId: report.id, status: report.status as 'requested' | 'rendering' | 'ready' | 'error' | 'expired', ...(typeof report.expiresAt === 'string' ? { expiresAt: report.expiresAt } : {}) };
      },
      resolveCommercialReport: async (snapshotId, context) => parseCommercialReportSnapshot(await scopedRpc(client, 'workers_commercial_report_snapshot', {
        _org_id: context.orgId, _snapshot_id: snapshotId,
      }, abort.signal)),
      ...workspacePlanner(client, request.orgId),
      signal: abort.signal,
      listTools: worker => raceWorkerSignal(() => listWorkerTools(worker, access), abort.signal),
      executeTool: (name, input) => raceWorkerSignal(() => executeWorkerTool(name, input, access), abort.signal),
      searchWeb: (input, signal) => searchWorkersWeb(input, { apiKey: Deno.env.get('FIRECRAWL_API_KEY'), gatewayKey: Deno.env.get('LOVABLE_API_KEY'), signal }),
      institutionalPresident: (input, signal) => readInstitutionalPresident(input, { signal }),
      searchKb: (message, now, signal) => searchKnowledgeBase((name, args) => scopedRpc(client, name, args, signal ?? abort.signal), message, now),
      logKb: async (value, selection) => {
        await scopedRpc(client, 'workers_log_kb_answer', {
          _org_id: value.orgId, _request_id: value.requestId,
          _entry_id: selection?.type === 'answer' ? selection.hit.entry_id : null,
          _score: selection?.type === 'answer' ? selection.hit.score : null,
          _outcome: selection?.outcome ?? 'miss', _kb_version: selection?.type === 'answer' ? selection.hit.kb_version : null,
        }, abort.signal);
      },
      begin: async (value, worker) => {
        const result = await scopedRpc(client, 'ai_workers_begin_turn', {
          _org_id: value.orgId, _request_id: value.requestId, _worker_id: worker,
          _message: redactWorkerText(value.message), _conversation_id: value.conversationId ?? null,
        }, abort.signal);
        if (!isObject(result) || !isUuid(result.conversationId) || typeof result.replayed !== 'boolean') throw new WorkerError('invalid_storage_response', 503);
        return result as unknown as TurnStart;
      },
      history: async conversationId => {
        const { data, error } = await raceWorkerSignal(() => client.rpc('ai_workers_read_history', {
          _org_id: request.orgId, _conversation_id: conversationId, _turn_limit: 3,
        }).abortSignal(abort.signal), abort.signal);
        if (error) throw databaseError(error, 'history');
        // The RPC returns complete turns in admission order; the current prompt is supplied separately.
        return (data ?? []).filter((row: { request_id: string; state: string; role: string }) => row.request_id !== request.requestId && (row.role === 'user' || row.state === 'complete'))
          .map((row: { role: 'user' | 'assistant'; content: string }) => ({ role: row.role, content: row.content }));
      },
      finish: async (value, completion) => {
        await scopedRpc(client, 'ai_workers_finish_turn', {
          _org_id: value.orgId, _request_id: value.requestId, _content: completion.content,
          _citations: completion.citations, _model: completion.model,
          _input_tokens: completion.inputTokens, _output_tokens: completion.outputTokens, _tool_names: completion.tools,
          _usage_complete: completion.usageComplete ?? true,
        }, abort.signal);
      },
      fail: (value, usage) => cleanup ??= boundedWorkerCleanup(async cleanupSignal => {
        await scopedRpc(client, 'ai_workers_fail_turn', {
          _org_id: value.orgId, _request_id: value.requestId,
          _model: usage?.model ?? null, _input_tokens: usage?.inputTokens ?? 0, _output_tokens: usage?.outputTokens ?? 0,
        }, cleanupSignal);
      }),
    };
    if (abort.signal.aborted) throw new WorkerError('request_cancelled', 499);
    const encoder = new TextEncoder();
    let streamClosed = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit: Parameters<typeof runWorkerTurn>[2] = (event, data) => {
          if (!consumerCancelled && !streamClosed) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        try { await raceWorkerSignal(() => runWorkerTurn(request, dependencies, emit), abort.signal); }
        catch (error) {
          const failure = timedOut ? new WorkerError('timeout', 504, { stage: 'orchestration' }) : error;
          console.error(JSON.stringify(workerFailureDiagnostic(failure, requestId)));
          emit('error', { ...publicWorkerError(failure), requestId });
        }
        finally {
          if (deadline) clearTimeout(deadline);
          streamClosed = true;
          try { controller.close(); } catch { /* Consumer already disconnected. */ }
          req.signal.removeEventListener('abort', onConsumerAbort);
          // Close SSE first. This independent budget also clears a pending
          // admission when the aborted worker never reaches its own catch.
          if (abort.signal.aborted) await dependencies.fail(request).catch(() => undefined);
        }
      },
      cancel() { consumerCancelled = true; streamClosed = true; abort.abort(new WorkerError('request_cancelled', 499)); if (deadline) clearTimeout(deadline); },
    });
    return new Response(stream, { headers: { ...corsHeaders, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-store', 'X-Accel-Buffering': 'no' } });
  } catch (error) {
    if (deadline) clearTimeout(deadline);
    req.signal.removeEventListener('abort', onConsumerAbort);
    console.error(JSON.stringify(workerFailureDiagnostic(error, requestId)));
    return jsonError(error, requestId);
  }
});
