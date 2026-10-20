import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pavilionOccupancyKey, usePavilionOccupancy } from '@/features/commercial-map/dashboard/usePavilionOccupancy';
import { buildPavilionOccupancyGroups } from '@/features/commercial-map/dashboard/pavilionOccupancy';
import { createPavilionOccupancyFixture, createPavilionGroupingRegressionFixture } from './helpers/pavilionOccupancyFixture';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), refresh: vi.fn(async () => undefined) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/features/commercial-map/queries/commercialMapRefresh', () => ({ scheduleCommercialMapRefresh: mocks.refresh }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const wrapper = (client: QueryClient) => ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

describe('pavilion occupancy shares the dashboard invalidation cycle', () => {
  it('fetches the complete pavilion in one abortable request and updates document-only changes through the existing sales prefix', async () => {
    const { snapshot, payload } = createPavilionOccupancyFixture();
    let response = payload;
    mocks.rpc.mockImplementation(() => ({ abortSignal: vi.fn(async () => ({ data: response, error: null })) }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePavilionOccupancy(payload.projectId, snapshot, 1), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('commercial_pavilion_occupancy', { p_project_id: payload.projectId, p_pavilion_id: payload.pavilionId });
    response = { ...payload, observedAt: '2026-10-19T19:00:00Z' };
    await act(async () => { await client.invalidateQueries({ queryKey: ['commercial-sale-orders', payload.projectId] }); });
    await waitFor(() => expect(result.current.payload?.observedAt).toBe(response.observedAt));
    expect(mocks.rpc).toHaveBeenCalledTimes(2); expect(mocks.refresh).not.toHaveBeenCalled();
    client.clear();
  });
  it('recomposes new and removed contracts through sales invalidation without another company label or per-lot query', async () => {
    const { snapshot, payload } = createPavilionGroupingRegressionFixture();
    let response = payload;
    mocks.rpc.mockImplementation(() => ({ abortSignal: vi.fn(async () => ({ data: response, error: null })) }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePavilionOccupancy(payload.projectId, snapshot, 1), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.ready).toBe(true));
    const before = buildPavilionOccupancyGroups(result.current.payload!).find(g => g.id === 'exhibitor:diniz')!;
    const contract = before.orders[0].contracts[0];
    response = { ...payload, lots: payload.lots.map(row => Number(row.lotNumber) === 59 ? { ...row, associations: row.associations.map(a => ({ ...a,
      contracts: [{ ...contract, id: 'new-document', number: 'NEW' }] })) } : row) };
    await act(async () => { await client.invalidateQueries({ queryKey: ['commercial-sale-orders', payload.projectId] }); });
    await waitFor(() => expect(buildPavilionOccupancyGroups(result.current.payload!).find(g => g.id === before.id)?.orders[0].contracts).toHaveLength(2));
    let after = buildPavilionOccupancyGroups(result.current.payload!).find(g => g.id === before.id)!;
    expect(after.items.map(i => i.lotId)).toEqual(before.items.map(i => i.lotId));
    response = payload;
    await act(async () => { await client.invalidateQueries({ queryKey: ['commercial-sale-orders', payload.projectId] }); });
    await waitFor(() => expect(buildPavilionOccupancyGroups(result.current.payload!).find(g => g.id === before.id)?.orders[0].contracts).toHaveLength(1));
    after = buildPavilionOccupancyGroups(result.current.payload!).find(g => g.id === before.id)!;
    expect(after.items).toHaveLength(6); expect(mocks.rpc).toHaveBeenCalledTimes(3);
    expect(mocks.refresh).not.toHaveBeenCalled(); client.clear();
  });
  it('hides mismatched associations and schedules one coalesced recovery until inventory reconciles', async () => {
    const { snapshot, payload } = createPavilionOccupancyFixture();
    const changed = { ...payload, lots: payload.lots.map((row, i) => i ? row : { ...row, status: 'SOLD' }) };
    mocks.rpc.mockImplementation(() => ({ abortSignal: vi.fn(async () => ({ data: changed, error: null })) }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePavilionOccupancy(payload.projectId, snapshot, 1), { wrapper: wrapper(client) });
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(result.current.payload).toBeUndefined();
    await act(async () => { await client.invalidateQueries({ queryKey: pavilionOccupancyKey(payload.projectId, payload.pavilionId) }); });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    client.clear();
  });
  it('fails closed on permission loss and rejects a response from another pavilion', async () => {
    const { snapshot, payload } = createPavilionOccupancyFixture();
    mocks.rpc.mockImplementation(() => ({ abortSignal: vi.fn(async () => ({ data: { ...payload, pavilionId: 'wrong-pavilion' }, error: null })) }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePavilionOccupancy(payload.projectId, snapshot, 1), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.message).toContain('indisponíveis'));
    expect(result.current.payload).toBeUndefined(); expect(mocks.refresh).not.toHaveBeenCalled();
    client.clear();
  });
  it('retains coherent annotations during a background check so inspection cannot flicker or resize', async () => {
    const { snapshot, payload } = createPavilionOccupancyFixture();
    let finish: (response: { data: typeof payload; error: null }) => void;
    mocks.rpc.mockReturnValueOnce({ abortSignal: async () => ({ data: payload, error: null }) })
      .mockReturnValueOnce({ abortSignal: () => new Promise(resolve => { finish = resolve; }) });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePavilionOccupancy(payload.projectId, snapshot, 1), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.ready).toBe(true));
    let refresh: Promise<void>;
    act(() => { refresh = client.invalidateQueries({ queryKey: pavilionOccupancyKey(payload.projectId, payload.pavilionId) }); });
    await waitFor(() => expect(result.current.isRefreshing).toBe(true));
    expect(result.current.ready).toBe(true); expect(result.current.payload?.lots).toEqual(payload.lots);
    await act(async () => { finish!({ data: payload, error: null }); await refresh!; });
    await waitFor(() => expect(result.current.isRefreshing).toBe(false)); client.clear();
  });
});
