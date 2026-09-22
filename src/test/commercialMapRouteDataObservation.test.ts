import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommercialMapRouteDataObservation } from '@/features/commercial-map/utils/routeDataObservation';
import { beginCommercialMapBoot, captureCommercialMapStageRecorder, getCommercialMapBootSnapshot } from '@/features/commercial-map/utils/performanceDiagnostics';

let client: QueryClient;
beforeEach(() => { client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } }); });
afterEach(() => { client.clear(); vi.restoreAllMocks(); });

describe('route data wait attribution', () => {
  const key = ['private-query-key', 'never-publish-me'];

  it('records cached reuse before observing and completes once without refetching', async () => {
    const fetch = vi.fn(async () => ({ private: 'inventory' }));
    await client.prefetchQuery({ queryKey: key, queryFn: fetch });
    const record = vi.fn(), tracking = createCommercialMapRouteDataObservation(client.getQueryState(key), record);
    const observer = new QueryObserver(client, { queryKey: key, queryFn: fetch });
    const unsubscribe = observer.subscribe(result => tracking.observe(result.data !== undefined, result.isError));
    tracking.observe(observer.getCurrentResult().data !== undefined, false); tracking.observe(true, false);
    expect(tracking.source).toBe('cached'); expect(fetch).toHaveBeenCalledTimes(1);
    expect(record.mock.calls.map(([stage]) => stage)).toEqual(['route-data:source', 'route-data-wait:start', 'route-data-wait:end']);
    expect(JSON.stringify(record.mock.calls)).not.toMatch(/private|inventory|never-publish/); unsubscribe();
  });

  it('attributes an in-flight prewarm to prefetched and waits for the shared operation', async () => {
    let resolve!: (value: string) => void;
    const fetch = vi.fn(() => new Promise<string>(finish => { resolve = finish; }));
    const pending = client.prefetchQuery({ queryKey: key, queryFn: fetch });
    const record = vi.fn(), tracking = createCommercialMapRouteDataObservation(client.getQueryState(key), record);
    const observer = new QueryObserver(client, { queryKey: key, queryFn: fetch });
    const unsubscribe = observer.subscribe(result => tracking.observe(result.data !== undefined, result.isError));
    tracking.observe(observer.getCurrentResult().data !== undefined, false);
    expect(tracking.source).toBe('prefetched'); expect(record).toHaveBeenCalledTimes(2);
    resolve('ready'); await pending;
    expect(record).toHaveBeenLastCalledWith('route-data-wait:end', expect.objectContaining({ source: 'prefetched', failed: false }));
    expect(fetch).toHaveBeenCalledTimes(1); unsubscribe();
  });

  it('keeps a cold source when its own observer starts fetching and reports failure without changing query state', async () => {
    const record = vi.fn(), tracking = createCommercialMapRouteDataObservation(client.getQueryState(key), record);
    const observer = new QueryObserver(client, { queryKey: key, queryFn: async () => { throw new Error('denied'); } });
    const unsubscribe = observer.subscribe(result => tracking.observe(result.data !== undefined, result.isError));
    expect(tracking.source).toBe('cold');
    await vi.waitFor(() => expect(observer.getCurrentResult().isError).toBe(true));
    expect(record).toHaveBeenLastCalledWith('route-data-wait:end', expect.objectContaining({ source: 'cold', failed: true }));
    expect(client.getQueryData(key)).toBeUndefined(); unsubscribe();
  });

  it('does not publish an abandoned observation into the next route boot', () => {
    beginCommercialMapBoot();
    const old = createCommercialMapRouteDataObservation(undefined, captureCommercialMapStageRecorder());
    beginCommercialMapBoot(); old.observe(true, false);
    expect(getCommercialMapBootSnapshot().marks['route-data-wait:end']).toBeUndefined();
    const current = createCommercialMapRouteDataObservation({ data: {} }, captureCommercialMapStageRecorder());
    current.observe(true, false);
    expect(getCommercialMapBootSnapshot().marks['route-data-wait:end']).toBeDefined();
  });
});
