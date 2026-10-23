import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadCommercialReport, prepareCommercialReport, readCommercialReport } from '../commercial-reports-api';

const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { getSession: mocks.session } } }));
const request = { orgId: '10000000-0000-4000-8000-000000000001', snapshotId: '20000000-0000-4000-8000-000000000001' };
const reportId = '30000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.clearAllMocks(); mocks.session.mockResolvedValue({ data: { session: { access_token: 'test-session' } }, error: null });
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co'); vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'public-test');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('authorized commercial artifact transport', () => {
  it('posts only identifiers to the dedicated endpoint and strips server extras', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ report: { id: reportId, status: 'ready', signedUrl: 'https://untrusted.test/private' } }), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    expect(await readCommercialReport(request)).toEqual({ id: reportId, status: 'ready' });
    expect(fetch).toHaveBeenCalledWith('https://project.supabase.co/functions/v1/workers-commercial-reports', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer test-session' }), body: JSON.stringify({ operation: 'status', ...request }),
    }));
  });
  it('denies missing sessions before any request', async () => {
    mocks.session.mockResolvedValue({ data: { session: null }, error: null }); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(prepareCommercialReport(request)).rejects.toMatchObject({ code: 'access_denied' }); expect(fetch).not.toHaveBeenCalled();
  });
  it('does not expose SQL, private links or upstream permission messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('SELECT secret; https://private.test/token', { status: 403 })));
    await expect(readCommercialReport(request)).rejects.toMatchObject({ code: 'access_denied' });
    try { await readCommercialReport(request); } catch (cause) { expect(String(cause)).not.toMatch(/SELECT|secret|https:/); }
  });
  it('distinguishes expiration from denied access and rejects a non PDF download', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 410 })).mockResolvedValueOnce(new Response('<script>not a report</script>', { headers: { 'Content-Type': 'text/html' } }));
    vi.stubGlobal('fetch', fetch);
    await expect(downloadCommercialReport({ ...request, reportId })).rejects.toMatchObject({ code: 'expired' });
    await expect(downloadCommercialReport({ ...request, reportId })).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('explains legacy inventory/period mismatch without exposing upstream diagnostics', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('REPORT_INVENTORY_CURRENT_ONLY private SQL', {status:422})));
    await expect(prepareCommercialReport(request)).rejects.toMatchObject({code:'inventory_current_only',message:expect.stringContaining('Faça uma nova consulta do inventário atual')});
  });
  it('requires explicit IDs and validates a successful job response', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ report: { id: 'arbitrary', status: 'ready' } }))); vi.stubGlobal('fetch', fetch);
    await expect(prepareCommercialReport(request)).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(readCommercialReport({ ...request, snapshotId: 'other project' })).rejects.toMatchObject({ code: 'invalid_response' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
