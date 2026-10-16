import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callWorkerAction, callWorkerWorkspace } from '../workspace-api';
const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mocks.getSession } } }));
const orgId = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const actionId = '20000000-0000-4000-8000-000000000001';
const confirm = { command: 'confirm' as const, orgId, actionId, expectedVersion: 3 };
const instant = '2026-10-16T12:00:00.000Z';
const view = { id: actionId, orgId, conversationId: actionId, workerId: 'arena', kind: 'arena_note', version: 3,
  status: 'executed', summary: 'Nota salva', target: { recordId: actionId, label: 'Evento', href: `/eventos-restaurante-arena/arena/agenda?evento=${actionId}&aba=historico` }, diff: [],
  createdAt: instant, updatedAt: instant, expiresAt: instant, serverNow: instant,
  permissions: { canConfirm: false, canEdit: false, canCancel: false, reason: 'executed' }, manualInputState: 'notRequired', receipt: null, failure: null,
};
beforeEach(() => {
  vi.clearAllMocks(); mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'caller-only-token' } }, error: null });
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co'); vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'public-key');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const respond = (body: unknown, status = 200) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));

describe('bots action/workspace transport boundary', () => {
  it('confirms only the immutable ID/version in the selected organization with the current caller JWT', async () => {
    respond(view); await callWorkerAction(confirm);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://project.supabase.co/functions/v1/workers-actions');
    expect(JSON.parse(init!.body as string)).toEqual(confirm);
    expect(init!.headers).toMatchObject({ Authorization: 'Bearer caller-only-token', apikey: 'public-key' });
  });
  it('rejects payload/RPC/receipt injection before any network call', async () => {
    respond(view);
    for (const extra of [{ payload: { body: 'other' } }, { rpc: 'financial_record_movement' }, { receipt: 'client-attested' }]) {
      await expect(callWorkerAction({ ...confirm, ...extra })).rejects.toThrow();
    }
    expect(fetch).not.toHaveBeenCalled(); expect(mocks.getSession).not.toHaveBeenCalled();
  });
  it('fails closed on a response from another organization or another record', async () => {
    respond({ ...view, orgId: other }); await expect(callWorkerAction(confirm)).rejects.toMatchObject({ code: 'invalid_response' });
    respond({ ...view, id: other }); await expect(callWorkerAction(confirm)).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('rejects public token links and echoed commercial form values in an action response', async () => {
    respond({ ...view, target: { ...view.target, href: '/areas/pavilhao/token' } });
    await expect(callWorkerAction(confirm)).rejects.toMatchObject({ code: 'invalid_response' });
    respond({ ...view, companyName: 'Private company', contactName: 'Private person' });
    await expect(callWorkerAction(confirm)).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('never exposes raw SQL, business input or upstream error text', async () => {
    respond({ error: { code: 'stale_version', message: 'SQL UPDATE private table ana@example.com' } }, 409);
    await expect(callWorkerAction(confirm)).rejects.toMatchObject({ code: 'stale_version', message: 'O registro mudou. Revise uma nova proposta.' });
  });
  it('cancels after an auth lookup without fetching using a stale scope', async () => {
    const controller = new AbortController();
    mocks.getSession.mockImplementation(async () => { controller.abort(); return { data: { session: { access_token: 'old' } }, error: null }; });
    respond(view); await expect(callWorkerAction(confirm, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('validates conversation scope in a workspace snapshot', async () => {
    respond({ serverNow: instant, routines: [], runs: [], memories: [], alerts: [], events: [{ id: actionId, conversationId: other, createdAt: instant, kind: 'routineCreated', entityId: actionId, version: 1, label: 'Rotina', canUndo: true }] });
    await expect(callWorkerWorkspace({ command: 'snapshot', orgId, conversationId: actionId })).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('keeps unknown costs unknown and rejects an invented zero-dollar cost', async () => {
    const usage = { from: instant, to: instant, serverNow: instant, rows: [{ userId: actionId, workerId: 'agenda', requests: 1, inputTokens: 0, outputTokens: 0, incompleteMeasurements: 1, costUsd: null, costSource: 'notReported', telemetryTrust: 'user_scoped' }] };
    respond(usage); expect(await callWorkerWorkspace({ command: 'usage', orgId, from: instant, to: instant })).toEqual(usage);
    respond({ ...usage, rows: [{ ...usage.rows[0], costUsd: 0 }] });
    await expect(callWorkerWorkspace({ command: 'usage', orgId, from: instant, to: instant })).rejects.toMatchObject({ code: 'invalid_response' });
  });
});
