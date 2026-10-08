import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommercialDashboardSalesSummary } from '@/features/commercial-map/dashboard/CommercialDashboardSalesSummary';
import { useCommercialSalesSummary, type CommercialSalesSummaryAccess } from '@/features/commercial-map/dashboard/salesOrders/useCommercialSalesSummary';
import { EMPTY_SALE_FILTERS, fetchSaleOrdersPage, type SaleOrdersPage } from '@/features/commercial-map/dashboard/salesOrders/salesOrdersService';
import { useSalesOrdersUiStore } from '@/features/commercial-map/dashboard/salesOrders/useSalesOrdersUiStore';

vi.mock('@/features/commercial-map/dashboard/salesOrders/salesOrdersService', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/features/commercial-map/dashboard/salesOrders/salesOrdersService')>(),
  fetchSaleOrdersPage: vi.fn(),
}));

let client: QueryClient;
const access: CommercialSalesSummaryAccess = { projectId: 'project-a', canManageSales: true, canManageContracts: true };
const response = (total: number): SaleOrdersPage => ({ total, rows: [], documentsAccessible: true });
const totals = { total: 143, pending: 71, signed: 15 };
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
function mockTotals(values = totals) {
  vi.mocked(fetchSaleOrdersPage).mockImplementation(async (_project, filters) => response(
    filters.status === 'PENDING' ? values.pending : filters.status === 'SIGNED' ? values.signed : values.total,
  ));
}
async function invalidate() {
  await act(async () => { await client.invalidateQueries({ queryKey: ['commercial-sale-orders'] }); });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: 0 } } });
  mockTotals();
});
afterEach(() => { cleanup(); client.clear(); });

describe('global sales summary source and lifecycle', () => {
  it('uses first-page response totals independently of list filters, partial signatures, documents and rows', async () => {
    useSalesOrdersUiStore.setState({ page: 5, filters: { ...EMPTY_SALE_FILTERS, status: 'PARTIAL', hasDocument: 'yes', search: 'filtered buyer' } });
    const hook = renderHook(() => useCommercialSalesSummary(access), { wrapper });
    await waitFor(() => expect(hook.result.current.totals).toEqual(totals));
    expect(fetchSaleOrdersPage).toHaveBeenCalledTimes(3);
    for (const status of ['', 'PENDING', 'SIGNED']) {
      expect(fetchSaleOrdersPage).toHaveBeenCalledWith('project-a', { ...EMPTY_SALE_FILTERS, status }, 0);
    }
    expect(hook.result.current.totals?.total).not.toBe(totals.pending + totals.signed);
    expect(client.getQueryCache().getAll()[0].meta).toEqual({ persist: false });
  });

  it('never requests or displays readable totals without sales permission', () => {
    const hook = renderHook(() => useCommercialSalesSummary({ ...access, canManageSales: false }), { wrapper });
    expect(hook.result.current).toMatchObject({ totals: null, state: 'restricted', isFetching: false });
    expect(fetchSaleOrdersPage).not.toHaveBeenCalled();
  });

  it('keeps no fabricated zero after an initial failed read', async () => {
    vi.mocked(fetchSaleOrdersPage).mockRejectedValue(new Error('Failed to fetch'));
    const hook = renderHook(() => useCommercialSalesSummary(access), { wrapper });
    await waitFor(() => expect(hook.result.current.state).toBe('unavailable'));
    expect(hook.result.current.totals).toBeNull();
  });

  it('retains a complete previous generation while refreshing and on transient failure', async () => {
    const hook = renderHook(() => useCommercialSalesSummary(access), { wrapper });
    await waitFor(() => expect(hook.result.current.totals).toEqual(totals));
    const pending = deferred<SaleOrdersPage>();
    vi.mocked(fetchSaleOrdersPage).mockImplementation(async (_project, filters) => filters.status === 'PENDING'
      ? pending.promise : response(filters.status === 'SIGNED' ? 25 : 200));
    let updating!: Promise<void>;
    act(() => { updating = client.invalidateQueries({ queryKey: ['commercial-sale-orders'] }); });
    await waitFor(() => expect(hook.result.current.isFetching).toBe(true));
    expect(hook.result.current.totals).toEqual(totals);
    await act(async () => { pending.resolve(response(99)); await updating; });
    await waitFor(() => expect(hook.result.current.totals).toEqual({ total: 200, pending: 99, signed: 25 }));
    vi.mocked(fetchSaleOrdersPage).mockRejectedValue(new Error('Failed to fetch'));
    await invalidate();
    await waitFor(() => expect(hook.result.current.state).toBe('stale'));
    expect(hook.result.current.totals).toEqual({ total: 200, pending: 99, signed: 25 });
  });

  it('drops previous readable totals on API denial and never resurrects them after a transient failure', async () => {
    const hook = renderHook(() => useCommercialSalesSummary(access), { wrapper });
    await waitFor(() => expect(hook.result.current.totals).toEqual(totals));
    vi.mocked(fetchSaleOrdersPage).mockRejectedValue(new Error('MAP_PERMISSION_DENIED'));
    await invalidate();
    await waitFor(() => expect(hook.result.current.state).toBe('restricted'));
    expect(hook.result.current.totals).toBeNull();
    vi.mocked(fetchSaleOrdersPage).mockRejectedValue(new Error('Failed to fetch'));
    await invalidate();
    await waitFor(() => expect(hook.result.current.state).toBe('restricted'));
    expect(hook.result.current.totals).toBeNull();
    hook.unmount();
    const remounted = renderHook(() => useCommercialSalesSummary(access), { wrapper });
    expect(remounted.result.current.totals).toBeNull();
    await waitFor(() => expect(remounted.result.current.isFetching).toBe(false));
    expect(remounted.result.current.totals).toBeNull();
    mockTotals({ total: 144, pending: 72, signed: 16 });
    await invalidate();
    await waitFor(() => expect(remounted.result.current.totals).toEqual({ total: 144, pending: 72, signed: 16 }));
  });

  it('drops the whole generation if one read denies access even while other reads finish successfully', async () => {
    const hook = renderHook(() => useCommercialSalesSummary(access), { wrapper });
    await waitFor(() => expect(hook.result.current.totals).toEqual(totals));
    const remaining = deferred<SaleOrdersPage>();
    vi.mocked(fetchSaleOrdersPage).mockImplementation(async (_project, filters) => {
      if (filters.status === 'PENDING') throw { code: '42501', message: 'permission denied' };
      return remaining.promise;
    });
    await invalidate();
    await waitFor(() => expect(hook.result.current.state).toBe('restricted'));
    expect(hook.result.current.totals).toBeNull();
    await act(async () => { remaining.resolve(response(999)); });
    expect(hook.result.current.totals).toBeNull();
    expect(hook.result.current.state).toBe('restricted');
    expect(fetchSaleOrdersPage).toHaveBeenCalledTimes(6);
  });

  it('hides totals immediately when authorization is lost and rereads when restored', async () => {
    const hook = renderHook((input: CommercialSalesSummaryAccess) => useCommercialSalesSummary(input), { wrapper, initialProps: access });
    await waitFor(() => expect(hook.result.current.totals).toEqual(totals));
    hook.rerender({ ...access, canManageSales: false });
    expect(hook.result.current.totals).toBeNull();
    expect(hook.result.current.state).toBe('restricted');
    expect(fetchSaleOrdersPage).toHaveBeenCalledTimes(3);
    const reread = deferred<SaleOrdersPage>();
    vi.mocked(fetchSaleOrdersPage).mockReturnValue(reread.promise);
    hook.rerender(access);
    expect(hook.result.current.totals).toBeNull();
    await waitFor(() => expect(fetchSaleOrdersPage).toHaveBeenCalledTimes(6));
    await act(async () => { reread.resolve(response(8)); });
    await waitFor(() => expect(hook.result.current.totals).toEqual({ total: 8, pending: 8, signed: 8 }));
  });

  it('keeps project and permission contexts separate without old-context placeholders', async () => {
    const hook = renderHook((input: CommercialSalesSummaryAccess) => useCommercialSalesSummary(input), { wrapper, initialProps: access });
    await waitFor(() => expect(hook.result.current.totals).toEqual(totals));
    const next = deferred<SaleOrdersPage>();
    vi.mocked(fetchSaleOrdersPage).mockReturnValue(next.promise);
    hook.rerender({ ...access, projectId: 'project-b' });
    expect(hook.result.current.totals).toBeNull();
    await act(async () => { next.resolve(response(7)); });
    await waitFor(() => expect(hook.result.current.totals?.total).toBe(7));
    const permissionChange = deferred<SaleOrdersPage>();
    vi.mocked(fetchSaleOrdersPage).mockReturnValue(permissionChange.promise);
    hook.rerender({ ...access, projectId: 'project-b', canManageContracts: false });
    expect(hook.result.current.totals).toBeNull();
    await act(async () => { permissionChange.resolve(response(6)); });
    await waitFor(() => expect(hook.result.current.totals?.total).toBe(6));
  });

  it('ignores a late authorized response after permission loss, including on a fresh mount', async () => {
    const hook = renderHook((input: CommercialSalesSummaryAccess) => useCommercialSalesSummary(input), { wrapper, initialProps: access });
    await waitFor(() => expect(hook.result.current.totals).toEqual(totals));
    const late = deferred<SaleOrdersPage>();
    vi.mocked(fetchSaleOrdersPage).mockReturnValue(late.promise);
    let updating!: Promise<void>;
    act(() => { updating = client.invalidateQueries({ queryKey: ['commercial-sale-orders'] }); });
    await waitFor(() => expect(hook.result.current.isFetching).toBe(true));
    hook.rerender({ ...access, canManageSales: false });
    await act(async () => { late.resolve(response(999)); await updating; });
    expect(hook.result.current.totals).toBeNull();
    hook.unmount();
    vi.mocked(fetchSaleOrdersPage).mockRejectedValue(new Error('Failed to fetch'));
    const remounted = renderHook(() => useCommercialSalesSummary(access), { wrapper });
    expect(remounted.result.current.totals).toBeNull();
    await waitFor(() => expect(remounted.result.current.isFetching).toBe(false));
    expect(remounted.result.current.totals).toBeNull();
  });

  it('refreshes through existing module invalidations and rereads on overview return', async () => {
    const first = renderHook(() => useCommercialSalesSummary(access), { wrapper });
    await waitFor(() => expect(first.result.current.totals).toEqual(totals));
    mockTotals({ total: 143, pending: 70, signed: 16 });
    await invalidate();
    await waitFor(() => expect(first.result.current.totals).toEqual({ total: 143, pending: 70, signed: 16 }));
    // No map revision change is needed for a new signature or document read.
    first.unmount();
    mockTotals({ total: 144, pending: 71, signed: 16 });
    const returned = renderHook(() => useCommercialSalesSummary(access), { wrapper });
    await waitFor(() => expect(returned.result.current.totals).toEqual({ total: 144, pending: 71, signed: 16 }));
    expect(fetchSaleOrdersPage).toHaveBeenCalledTimes(9);
  });

  it('validates returned totals while preserving a real observed zero', async () => {
    mockTotals({ total: 0, pending: 0, signed: 0 });
    const hook = renderHook(() => useCommercialSalesSummary(access), { wrapper });
    await waitFor(() => expect(hook.result.current.totals).toEqual({ total: 0, pending: 0, signed: 0 }));
    mockTotals({ total: NaN, pending: 0, signed: 0 });
    await invalidate();
    await waitFor(() => expect(hook.result.current.state).toBe('stale'));
    expect(hook.result.current.totals).toEqual({ total: 0, pending: 0, signed: 0 });
  });
});

describe('sales summary presentation', () => {
  it('labels record counts accurately and makes coverage information available by touch/focus', async () => {
    const onAccess = vi.fn();
    render(<CommercialDashboardSalesSummary {...access} onAccess={onAccess} />, { wrapper });
    const summary = screen.getByRole('region', { name: 'Vendas e contratos' });
    await waitFor(() => expect(within(summary).getByText('143')).toBeInTheDocument());
    expect(within(summary).getByText('Registros de venda')).toBeInTheDocument();
    expect(within(summary).getByText('Aguardando assinatura')).toBeInTheDocument();
    expect(within(summary).getByText('Assinatura confirmada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Informações sobre os registros de venda' }));
    expect(screen.getByText(/assinatura parcial \(PARTIAL\)/)).toBeInTheDocument();
    expect(screen.getByText(/registros legados e outras situações/)).toBeInTheDocument();
    expect(screen.getByText(/não são documentos de contrato/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Acessar vendas e contratos' }));
    expect(onAccess).toHaveBeenCalledTimes(1);
  });

  it('shows unavailable values and an explicit restricted state instead of three zeros', () => {
    render(<CommercialDashboardSalesSummary {...access} canManageSales={false} onAccess={vi.fn()} />, { wrapper });
    const summary = screen.getByRole('region', { name: 'Vendas e contratos' });
    expect(within(summary).getAllByText('—')).toHaveLength(3);
    expect(within(summary).getByRole('status')).toHaveTextContent('Acesso restrito');
    expect(within(summary).queryByText('0')).not.toBeInTheDocument();
  });
});
