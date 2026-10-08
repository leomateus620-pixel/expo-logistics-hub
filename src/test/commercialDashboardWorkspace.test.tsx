import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommercialDashboard } from '@/features/commercial-map/dashboard/CommercialDashboard';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { useSalesOrdersUiStore } from '@/features/commercial-map/dashboard/salesOrders/useSalesOrdersUiStore';
import { EMPTY_SALE_FILTERS, fetchSaleOrderDetail, fetchSaleOrdersPage } from '@/features/commercial-map/dashboard/salesOrders/salesOrdersService';

vi.mock('@/features/commercial-map/dashboard/salesOrders/salesOrdersService', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/features/commercial-map/dashboard/salesOrders/salesOrdersService')>(),
  fetchSaleOrdersPage: vi.fn(),
  fetchSaleOrderDetail: vi.fn(),
}));
const props = { data: { entities: [OFFICIAL_REFERENCE_DATA.entities[0]], lots: [] }, dataUpdatedAt: 0,
  isFetching: false, onClose: vi.fn(), onViewLot: vi.fn(), onViewSale: vi.fn(),
  projectId: 'ui-test-only', canManageSales: true, canManageContracts: false };
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  useSalesOrdersUiStore.setState({ area: 'overview', filters: { ...EMPTY_SALE_FILTERS }, page: 0,
    expandedRecordId: null, filtersOpen: false, searchOpen: false, detailTab: 'overview',
    listScrollTop: 0, detailScrollTop: 0, scrollTop: 0, originRecordId: null });
  vi.mocked(fetchSaleOrdersPage).mockResolvedValue({ rows: [], total: 0, documentsAccessible: false });
});
afterEach(() => { cleanup(); client.clear(); });
const mount = (overrides = {}) => render(<QueryClientProvider client={client}><CommercialDashboard {...props} {...overrides} /></QueryClientProvider>);

describe('Dashboard sales workspace composition', () => {
  it('opens the existing list only on Acessar and replaces overview with a dedicated area', async () => {
    mount();
    expect(screen.getByRole('region', { name: 'Indicadores comerciais principais' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acessar vendas e contratos' })).toBeInTheDocument();
    await waitFor(() => expect(fetchSaleOrdersPage).toHaveBeenCalledTimes(3));
    expect(fetchSaleOrderDetail).not.toHaveBeenCalled();
    expect(screen.queryByRole('navigation', { name: 'Páginas de vendas' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Acessar vendas e contratos' }));
    await waitFor(() => expect(fetchSaleOrdersPage).toHaveBeenCalledTimes(4));
    expect(useSalesOrdersUiStore.getState().area).toBe('sales');
    expect(screen.queryByRole('region', { name: 'Indicadores comerciais principais' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Selecionar pavilhão' })).not.toBeInTheDocument();
    expect(fetchSaleOrderDetail).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Voltar à visão geral/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Acessar vendas e contratos' })).toHaveFocus());
    expect(screen.getByRole('region', { name: 'Indicadores comerciais principais' })).toBeInTheDocument();
  });

  it('remounts the sales area directly with preserved filters/page after the map handoff', async () => {
    useSalesOrdersUiStore.setState({ area: 'sales', page: 2,
      filters: { ...EMPTY_SALE_FILTERS, search: 'registro', hasDocument: 'yes' } });
    mount();
    await waitFor(() => expect(fetchSaleOrdersPage).toHaveBeenCalledWith('ui-test-only',
      { ...EMPTY_SALE_FILTERS, search: 'registro', hasDocument: 'yes' }, 2));
    expect(screen.queryByRole('button', { name: 'Acessar vendas e contratos' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Indicadores comerciais principais' })).not.toBeInTheDocument();
  });

  it('returns from dedicated sales with the selected scope, metric, focus and overview scroll intact', async () => {
    const container = document.createElement('div');
    mount({ scrollContainer: () => container });
    await waitFor(() => expect(fetchSaleOrdersPage).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole('button', { name: 'Exporural' }));
    fireEvent.click(screen.getByRole('button', { name: 'Área oficial' }));
    container.scrollTop = 640;
    fireEvent.click(screen.getByRole('button', { name: 'Acessar vendas e contratos' }));
    await waitFor(() => expect(fetchSaleOrdersPage).toHaveBeenCalledTimes(4));
    expect(container.scrollTop).toBe(0);
    container.scrollTop = 220;
    fireEvent.click(screen.getByRole('button', { name: /Voltar à visão geral/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Acessar vendas e contratos' })).toHaveFocus());
    expect(container.scrollTop).toBe(640);
    expect(screen.getByRole('button', { name: 'Exporural' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Todas as áreas' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Área oficial' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps lack of sales permission explicit without starting a list request', async () => {
    mount({ canManageSales: false });
    fireEvent.click(screen.getByRole('button', { name: 'Acessar vendas e contratos' }));
    expect(screen.getByText(/Acesso restrito/)).toBeInTheDocument();
    expect(fetchSaleOrdersPage).not.toHaveBeenCalled();
    expect(fetchSaleOrderDetail).not.toHaveBeenCalled();
  });
});
