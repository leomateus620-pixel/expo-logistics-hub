import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveWorkerAccess } from '../lib/workers/access';
import { WorkerError, type ReadResult, type WorkerRequest } from '../../supabase/functions/_shared/workers/contracts';
import { runWorkerTurn, type WorkerTurnDependencies } from '../../supabase/functions/_shared/workers/engine';
import { boundedWorkerCleanup, publicWorkerError, raceWorkerSignal, workerAuthFailureCode } from '../../supabase/functions/_shared/workers/failures';

afterEach(() => vi.useRealTimers());

describe('Worker deadlines and authentication transport', () => {
  it('ends a stalled deterministic query at the deadline and never saves its late result', async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    let resolveTool!: (result: ReadResult) => void;
    const stalled = new Promise<ReadResult>(resolve => { resolveTool = resolve; });
    const request: WorkerRequest = { orgId: '10000000-0000-4000-8000-000000000001', requestId: '20000000-0000-4000-8000-000000000001', message: 'Qual pessoa teve mais eventos em outubro?' };
    const dependencies: WorkerTurnDependencies = {
      provider: { model: 'test', complete: vi.fn() }, signal: abort.signal,
      now: () => new Date('2026-10-17T12:00:00Z'),
      listTools: vi.fn(async () => [{ name: 'agenda_people_ranking', readOnly: true as const, description: 'Ranking', inputJsonSchema: {} }]),
      executeTool: vi.fn(() => raceWorkerSignal(() => stalled, abort.signal)),
      begin: vi.fn(async () => ({ conversationId: request.orgId, replayed: false })),
      finish: vi.fn(), fail: vi.fn(async () => undefined),
    };
    const events: string[] = [];
    const turn = raceWorkerSignal(() => runWorkerTurn(request, dependencies, event => events.push(event)), abort.signal);
    const rejected = expect(turn).rejects.toMatchObject({ code: 'timeout' });
    setTimeout(() => abort.abort(new WorkerError('timeout', 504, { stage: 'orchestration' })), 55_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(dependencies.executeTool).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(55_000);
    await rejected;
    expect(dependencies.fail).toHaveBeenCalledOnce();
    expect(dependencies.finish).not.toHaveBeenCalled();
    const count = events.length;
    resolveTool({ summary: 'Late data', records: [], citations: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toHaveLength(count);
    expect(events).not.toContain('delta');
    expect(dependencies.finish).not.toHaveBeenCalled();
  });

  it('gives failure persistence its own three-second budget even when the main turn expired', async () => {
    vi.useFakeTimers();
    let cleanupSignal: AbortSignal | undefined;
    const cleanup = boundedWorkerCleanup(signal => {
      cleanupSignal = signal;
      return new Promise<never>(() => undefined);
    });
    const rejected = expect(cleanup).rejects.toMatchObject({ code: 'timeout', diagnostic: { stage: 'failure_cleanup' } });
    await vi.advanceTimersByTimeAsync(0);
    expect(cleanupSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    await rejected;
    expect(cleanupSignal?.aborted).toBe(true);
  });

  it('does not start work after cancellation and observes a late rejection', async () => {
    const abort = new AbortController(); abort.abort();
    const operation = vi.fn(async () => 1);
    await expect(raceWorkerSignal(operation, abort.signal)).rejects.toMatchObject({ code: 'request_cancelled' });
    expect(operation).not.toHaveBeenCalled();
    const active = new AbortController();
    let rejectOperation!: (cause: Error) => void;
    const turn = raceWorkerSignal(() => new Promise<never>((_, reject) => { rejectOperation = reject; }), active.signal);
    const rejected = expect(turn).rejects.toMatchObject({ code: 'request_cancelled' });
    await Promise.resolve(); active.abort(); await rejected;
    rejectOperation(new Error('late private failure'));
    await Promise.resolve();
  });

  it.each([
    [{ name: 'AuthRetryableFetchError', status: 503, message: 'private auth internals' }, 'network_error', 'NETWORK_ERROR'],
    [{ name: 'AuthUnknownError', message: 'Failed to fetch' }, 'network_error', 'NETWORK_ERROR'],
    [{ name: 'AuthApiError', status: 504 }, 'timeout', 'TIMEOUT'],
    [{ name: 'AuthApiError', status: 401, code: 'bad_jwt' }, 'forbidden', 'AUTH_REQUIRED'],
    [{ name: 'AuthApiError', status: 429 }, 'query_failed', 'DATA_UNAVAILABLE'],
    [{ name: 'AuthSessionMissingError' }, 'forbidden', 'AUTH_REQUIRED'],
  ])('classifies auth transport without inventing an authorization denial: %j', async (authError, expected, registryCode) => {
    expect(workerAuthFailureCode(authError)).toBe(expected);
    const from = vi.fn();
    const client = { auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: authError })) }, from } as unknown as SupabaseClient;
    const result = resolveWorkerAccess(client, '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
    await expect(result).rejects.toMatchObject({ code: registryCode, diagnostic: { stage: 'authentication' } });
    const error = await result.catch(cause => cause);
    expect(publicWorkerError(error).code).toBe(expected);
    expect(JSON.stringify(publicWorkerError(error))).not.toContain('private auth internals');
    expect(from).not.toHaveBeenCalled();
  });
});
