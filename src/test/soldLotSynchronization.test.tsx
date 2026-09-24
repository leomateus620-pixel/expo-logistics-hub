import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSalesCheckout } from '@/features/commercial-map/sales/useSalesCheckout';
import { useSalesStore } from '@/features/commercial-map/sales/useSalesSelection';
import { soldLotSurfaceColor, isSoldLot } from '@/features/commercial-map/utils/soldLotPresentation';
import { registerSaleOrder } from '@/features/commercial-map/sales/salesService';
import type { CommercialStatus } from '@/features/commercial-map/types';
import type { SalesOrderPayload } from '@/features/commercial-map/sales/salesTypes';

vi.mock('@/features/commercial-map/sales/salesService', () => ({ registerSaleOrder: vi.fn(), fetchSalesPricing: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));

afterEach(() => { vi.clearAllMocks(); useSalesStore.getState().closeSalesMode(); });

describe('confirmed sale -> shared map query -> sold presentation', () => {
  it('refreshes every active map scope after confirmation and reverses from refreshed official status', async () => {
    let officialStatus: CommercialStatus = 'AVAILABLE';
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
    const readOfficial = vi.fn(async () => ({ id: 'lot', status: officialStatus }));
    vi.mocked(registerSaleOrder).mockImplementation(async () => {
      officialStatus = 'SOLD';
      return {} as Awaited<ReturnType<typeof registerSaleOrder>>;
    });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => ({
      map: useQuery({ queryKey: ['commercial-map', 'full'], queryFn: readOfficial }),
      segment: useQuery({ queryKey: ['commercial-map', 'commission', 'industry'], queryFn: readOfficial }),
      checkout: useSalesCheckout(),
    }), { wrapper });
    await waitFor(() => expect(result.current.map.data?.status).toBe('AVAILABLE'));
    expect(isSoldLot(result.current.map.data?.status)).toBe(false);
    act(() => {
      useSalesStore.getState().addLot({ lotId: 'lot', publicIdentifier: 'D-01', displayName: 'D-01', context: null });
      useSalesStore.getState().setCheckoutOpen(true);
    });
    await act(async () => { await result.current.checkout.mutateAsync({} as SalesOrderPayload); });
    await waitFor(() => expect(result.current.map.data?.status).toBe('SOLD'));
    expect(result.current.segment.data?.status).toBe('SOLD');
    expect(isSoldLot(result.current.map.data?.status)).toBe(true);
    expect(soldLotSurfaceColor(result.current.map.data?.status)).not.toBeNull();
    expect(useSalesStore.getState().selection).toEqual([]);
    expect(useSalesStore.getState().checkoutOpen).toBe(false);
    officialStatus = 'RESERVED';
    await act(async () => { await client.invalidateQueries({ queryKey: ['commercial-map'] }); });
    await waitFor(() => expect(result.current.map.data?.status).toBe('RESERVED'));
    expect(isSoldLot(result.current.map.data?.status)).toBe(false);
    expect(soldLotSurfaceColor(result.current.map.data?.status)).toBeNull();
    expect(registerSaleOrder).toHaveBeenCalledTimes(1);
    expect(readOfficial).toHaveBeenCalledTimes(6);
    unmount(); client.clear();
  });
});
