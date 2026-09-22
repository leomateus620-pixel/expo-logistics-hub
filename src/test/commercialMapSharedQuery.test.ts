import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), present: vi.fn((data: unknown) => ({ presented: data })), capture: vi.fn(() => vi.fn()) }));
vi.mock('@/features/commercial-map/services/commercialMapService', () => ({ fetchCommercialMap: mocks.fetch }));
vi.mock('@/features/commercial-map/utils/presentCommercialMapData', () => ({ presentCommercialMapData: mocks.present }));
vi.mock('@/features/commercial-map/utils/performanceDiagnostics', () => ({ captureCommercialMapStageRecorder: mocks.capture }));
import { commercialMapQueryOptions, commercialMapQueryKey, COMMERCIAL_MAP_GC_TIME, FULL_COMMERCIAL_MAP_SCOPE } from '@/features/commercial-map/queries/commercialMapQuery';

let client: QueryClient;
beforeEach(() => { client = new QueryClient(); mocks.fetch.mockReset().mockResolvedValue({ entities: [], lots: [], layers: [] }); mocks.present.mockClear(); mocks.capture.mockClear(); });
afterEach(() => { client.clear(); vi.useRealTimers(); });

describe('canonical query shared by portal and map route', () => {
  it('reuses fresh raw data while the route applies the same canonical presentation', async () => {
    const options = commercialMapQueryOptions('user', 'org');
    await client.prefetchQuery(options);
    const raw = client.getQueryData(options.queryKey);
    expect(mocks.present).not.toHaveBeenCalled();
    const observer = new QueryObserver(client, commercialMapQueryOptions('user', 'org'));
    const unsubscribe = observer.subscribe(() => {});
    expect(observer.getCurrentResult().data).toEqual({ presented: raw });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(options).toMatchObject({ staleTime: 30_000, gcTime: 600_000, retry: 1, meta: { persist: false } });
    expect(COMMERCIAL_MAP_GC_TIME).toBe(600_000); unsubscribe();
  });

  it('preserves stale inventory during the existing background refresh policy', async () => {
    const options = commercialMapQueryOptions('user', 'org');
    client.setQueryData([...options.queryKey], { entities: ['prior'], lots: [], layers: [] }, { updatedAt: Date.now() - 31_000 });
    let finish!: (data: unknown) => void; mocks.fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const observer = new QueryObserver(client, options); const unsubscribe = observer.subscribe(() => {});
    expect(observer.getCurrentResult()).toMatchObject({ status: 'success', isFetching: true, data: { presented: { entities: ['prior'] } } });
    finish({ entities: ['current'], lots: [], layers: [] });
    await vi.waitFor(() => expect(observer.getCurrentResult().isFetching).toBe(false));
    expect(observer.getCurrentResult().data).toMatchObject({ presented: { entities: ['current'] } }); unsubscribe();
  });

  it('isolates user, organization, full map and commission/segment keys', () => {
    const scopes = [FULL_COMMERCIAL_MAP_SCOPE, { mode: 'commission' as const, commissionId: 'a', segmentId: 'exporural' }, { mode: 'commission' as const, commissionId: 'b', segmentId: 'exporural' }, { mode: 'commission' as const, commissionId: 'a', segmentId: 'automoveis' }];
    const keys = scopes.flatMap(scope => [['u', 'o'], ['u2', 'o'], ['u', 'o2']].map(([user, org]) => commercialMapQueryKey(user, org, scope)));
    expect(new Set(keys.map(key => JSON.stringify(key))).size).toBe(keys.length);
    expect(keys[0]).toEqual(['commercial-map', 'full', 'u', 'o']);
    expect(commercialMapQueryOptions(null, 'org').enabled).toBe(false);
  });

  it('uses the prewarm recorder across later completion and forwards the cancellation signal', async () => {
    let finish!: (data: unknown) => void; mocks.fetch.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const record = vi.fn(), options = commercialMapQueryOptions('user', 'org', FULL_COMMERCIAL_MAP_SCOPE, record);
    const pending = client.prefetchQuery(options);
    expect(mocks.fetch.mock.calls[0][2]).toMatchObject({ includeReferenceImage: false, recordStage: record });
    const signal = mocks.fetch.mock.calls[0][2].signal as AbortSignal;
    await client.cancelQueries({ queryKey: options.queryKey, exact: true });
    expect(signal.aborted).toBe(true);
    finish({ entities: ['revoked'], lots: [], layers: [] }); await pending;
    expect(client.getQueryData(options.queryKey)).toBeUndefined();
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
