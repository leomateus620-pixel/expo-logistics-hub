import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommercialDashboard, type CommercialDashboardProps } from '@/features/commercial-map/dashboard/CommercialDashboard';
import { buildCommercialDashboardSnapshot } from '@/features/commercial-map/dashboard/commercialDashboardAnalytics';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { STATUS_CONFIG } from '@/features/commercial-map/constants';
import { EMPTY_SALE_FILTERS, fetchSaleOrdersPage } from '@/features/commercial-map/dashboard/salesOrders/salesOrdersService';
import { useSalesOrdersUiStore } from '@/features/commercial-map/dashboard/salesOrders/useSalesOrdersUiStore';

vi.mock('@/features/commercial-map/dashboard/salesOrders/salesOrdersService', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/features/commercial-map/dashboard/salesOrders/salesOrdersService')>(),
  fetchSaleOrdersPage: vi.fn(),
}));

// Keep the actual Dashboard, workspace, minimap and navigation. A small subset
// of the existing reference keeps this regression focused on presentation state.
const officialSnapshot = buildCommercialDashboardSnapshot(OFFICIAL_REFERENCE_DATA);
const segments = officialSnapshot.segments.slice(0, 2);
const records = segments.flatMap((segment) => segment.records.slice(0, 1));
const recordEntities = new Set(records.map((record) => record.entity.id));
const data = {
  entities: OFFICIAL_REFERENCE_DATA.entities.filter((entity) => recordEntities.has(entity.id) || !entity.isSellable),
  lots: records.map((record) => record.lot),
};
const props: CommercialDashboardProps = {
  data, dataUpdatedAt: 0, isFetching: false, onClose: vi.fn(), onViewLot: vi.fn(), onViewSale: vi.fn(),
  projectId: 'navigation-project', orgId: 'navigation-org', canManageSales: true, canManageContracts: false,
};
let client: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  useSalesOrdersUiStore.setState({
    scopeProjectId: null, area: 'overview', filters: { ...EMPTY_SALE_FILTERS }, page: 0,
    expandedRecordId: null, selectedRecordIdentity: null, filtersOpen: false, searchOpen: false,
    detailTab: 'overview', listScrollTop: 0, detailScrollTop: 0, scrollTop: 0, originRecordId: null,
  });
  vi.mocked(fetchSaleOrdersPage).mockResolvedValue({ rows: [], total: 0, documentsAccessible: false });
});

afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); });

const dashboard = (overrides: Partial<CommercialDashboardProps> = {}) =>
  <QueryClientProvider client={client}><CommercialDashboard {...props} {...overrides} /></QueryClientProvider>;
const areaSelectors = () => screen.getByRole('group', { name: 'Selecionar área externa' });
const metricSelectors = () => screen.getByRole('group', { name: 'Métrica de distribuição' });
const currentMap = () => screen.getByRole('region', { name: `Mini mapa comercial: ${segments[0].segment.name}` });
const soldStatus = () => within(screen.getByRole('complementary', { name: `Distribuição de ${segments[0].segment.name}` }))
  .getByRole('button', { name: new RegExp(`^${STATUS_CONFIG.SOLD.label}:`) });

function selectPresentation() {
  // A → B → A keeps the selected identity of each external scope.
  for (const [index, segment] of segments.entries()) {
    fireEvent.click(within(areaSelectors()).getByRole('button', { name: new RegExp(segment.segment.name) }));
    const map = screen.getByRole('region', { name: `Mini mapa comercial: ${segment.segment.name}` });
    fireEvent.change(within(map).getByRole('combobox'), { target: { value: records[index].entity.id } });
  }
  fireEvent.click(within(areaSelectors()).getByRole('button', { name: new RegExp(segments[0].segment.name) }));
  expect(within(currentMap()).getByRole('combobox')).toHaveValue(records[0].entity.id);
  fireEvent.click(within(metricSelectors()).getByRole('button', { name: 'Área oficial' }));
  fireEvent.click(soldStatus());
}

describe('Dashboard presentation across discarded navigation views', () => {
  it('restores scope, selection, metric, status, comparison, scroll and entry focus after sales', async () => {
    const scrollContainer = document.createElement('div');
    const view = render(dashboard({ scrollContainer: () => scrollContainer }));
    selectPresentation();
    fireEvent.click(screen.getByRole('button', { name: '2ª Etapa' }));
    const comparison = screen.getByText('Comparar segmentos externos').closest('details')!;
    comparison.open = true;
    fireEvent(comparison, new Event('toggle'));

    for (const scrollTop of [640, 920]) {
      scrollContainer.scrollTop = scrollTop;
      fireEvent.click(screen.getByRole('button', { name: 'Acessar vendas e contratos' }));
      await screen.findByText('Nenhuma venda encontrada');
      expect(scrollContainer.scrollTop).toBe(0);
      expect(view.container.querySelector('.commercial-dashboard-workspace')).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Voltar à visão geral' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Acessar vendas e contratos' })).toHaveFocus());
      expect(scrollContainer.scrollTop).toBe(scrollTop);
      expect(within(areaSelectors()).getByRole('button', { name: new RegExp(segments[0].segment.name) })).toHaveAttribute('aria-pressed', 'true');
      expect(within(currentMap()).getByRole('combobox')).toHaveValue(records[0].entity.id);
      expect(within(metricSelectors()).getByRole('button', { name: 'Área oficial' })).toHaveAttribute('aria-pressed', 'true');
      expect(soldStatus()).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText('Comparar segmentos externos').closest('details')).toHaveAttribute('open');
      expect(screen.getByRole('button', { name: '2ª Etapa' })).toHaveAttribute('aria-pressed', 'true');
    }
  });

  it.each([
    ['project', { projectId: 'different-project' }],
    ['organization', { orgId: 'different-org' }],
  ] as const)('discards spatial presentation when the %s identity changes', (_label, nextIdentity) => {
    const view = render(dashboard());
    selectPresentation();
    view.rerender(dashboard(nextIdentity));
    expect(within(areaSelectors()).getByRole('button', { name: /Todas as áreas/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(metricSelectors()).getByRole('button', { name: 'Quantidade' })).toHaveAttribute('aria-pressed', 'true');
    const map = screen.getByRole('region', { name: 'Mini mapa comercial: Todas as áreas externas' });
    expect(within(map).getByRole('combobox')).toHaveValue('');
    const statuses = screen.getByLabelText('Distribuição comercial por quantidade de lotes e área');
    expect(within(statuses).queryByRole('button', { pressed: true })).not.toBeInTheDocument();
  });

  it.each([
    ['project', { projectId: 'different-project' }],
    ['organization', { orgId: 'different-org' }],
  ] as const)('resets the overview scroll when the %s changes while sales is open', async (_label, nextIdentity) => {
    const scrollContainer = document.createElement('div');
    const getScrollContainer = () => scrollContainer;
    const view = render(dashboard({ scrollContainer: getScrollContainer }));
    scrollContainer.scrollTop = 640;
    fireEvent.click(screen.getByRole('button', { name: 'Acessar vendas e contratos' }));
    await screen.findByText('Nenhuma venda encontrada');
    view.rerender(dashboard({ ...nextIdentity, scrollContainer: getScrollContainer }));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à visão geral' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Acessar vendas e contratos' })).toHaveFocus());
    expect(scrollContainer.scrollTop).toBe(0);
    expect(within(areaSelectors()).getByRole('button', { name: /Todas as áreas/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores a queued overview restoration after an immediate return to sales', async () => {
    const scrollContainer = document.createElement('div');
    render(dashboard({ scrollContainer: () => scrollContainer }));
    scrollContainer.scrollTop = 640;
    fireEvent.click(screen.getByRole('button', { name: 'Acessar vendas e contratos' }));
    await screen.findByText('Nenhuma venda encontrada');
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à visão geral' }));
    const pendingOverviewFrames = frames.splice(0);
    expect(pendingOverviewFrames.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Acessar vendas e contratos' }));
    await screen.findByText('Nenhuma venda encontrada');
    act(() => pendingOverviewFrames.forEach((callback) => callback(performance.now())));
    expect(useSalesOrdersUiStore.getState().area).toBe('sales');
    expect(scrollContainer.scrollTop).toBe(0);
    expect(screen.getByRole('heading', { name: 'Vendas e contratos' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Acessar vendas e contratos' })).not.toBeInTheDocument();
  });
});
