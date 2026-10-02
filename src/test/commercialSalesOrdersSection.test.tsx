import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CommercialSalesOrdersSection,
  type CommercialSalesOrdersSectionProps,
} from '@/features/commercial-map/dashboard/salesOrders/CommercialSalesOrdersSection';
import {
  EMPTY_SALE_FILTERS, fetchSaleOrderDetail, fetchSaleOrdersPage,
  type SaleContract, type SaleOrderDetail, type SaleOrderSummary,
} from '@/features/commercial-map/dashboard/salesOrders/salesOrdersService';
import { useSalesOrdersUiStore } from '@/features/commercial-map/dashboard/salesOrders/useSalesOrdersUiStore';

vi.mock('@/features/commercial-map/dashboard/salesOrders/salesOrdersService', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/features/commercial-map/dashboard/salesOrders/salesOrdersService')>(),
  fetchSaleOrdersPage: vi.fn(),
  fetchSaleOrderDetail: vi.fn(),
}));
vi.mock('@/features/commercial-map/services/commercialMapService', () => ({ getContractSignedUrl: vi.fn() }));

// Data exists only in this component test: no application fixture or persisted sales.
const record: SaleOrderSummary = {
  recordId: 'order-one', kind: 'ORDER', orderId: 'order-one', saleId: null,
  reference: 'PED-0001', createdAt: '2026-10-01T12:00:00Z', status: 'OPEN',
  buyerName: 'Expositor de teste Ltda.', buyerTradeName: 'Expositor de teste', displayName: 'Expositor de teste',
  negotiatedTotal: 5250, spacesSubtotal: 5000, feesTotal: 250,
  paymentMethod: 'BOLETO_PARCELADO', installmentCount: 2,
  itemCount: 3, activeCount: 2, signedCount: 1, pendingCount: 1, cancelledCount: 1, legacyCount: 0,
  activeItemsTotal: 3000, lotIds: ['lot-one', 'lot-two'], documentCount: 1, paidInstallments: 0,
};

const contract: SaleContract = {
  contractId: 'contract-one', scope: 'ORDER_ITEMS', contractNumber: 'TESTE-01',
  activeVersion: 2, createdAt: '2026-10-01T12:00:00Z', lotIds: ['lot-one', 'lot-two'],
  versions: [
    { id: 'version-two', version: 2, storagePath: 'test/v2.pdf', originalName: 'contrato-v2.pdf',
      mimeType: 'application/pdf', fileSize: 200, uploadedAt: '2026-10-02T12:00:00Z', supersededAt: null },
    { id: 'version-one', version: 1, storagePath: 'test/v1.pdf', originalName: 'contrato-v1.pdf',
      mimeType: 'application/pdf', fileSize: 180, uploadedAt: '2026-10-01T12:00:00Z', supersededAt: '2026-10-02T12:00:00Z' },
  ],
};

const detail: SaleOrderDetail = {
  header: { ...record, feeAdmin: 250, feePpci: 0, feeCleaning: 0, documentNumber: 'Documento de teste' },
  items: [
    { itemId: 'item-one', lotId: 'lot-one', entityId: 'entity-one', publicIdentifier: 'B5-M001',
      lotNumber: '1', displayName: 'Módulo 1', areaSnapshot: 25, itemTotal: 3000,
      contractState: 'SIGNED', lotStatus: 'SOLD' },
    { itemId: 'item-two', lotId: 'lot-two', entityId: 'entity-two', publicIdentifier: 'B5-M002',
      lotNumber: '2', displayName: 'Módulo 2', areaSnapshot: 20, itemTotal: 0,
      contractState: 'PENDING_SIGNATURE', lotStatus: 'SALE_OPEN' },
    { itemId: 'item-three', lotId: 'lot-three', entityId: 'entity-three', publicIdentifier: 'A-003',
      lotNumber: '3', displayName: 'Lote 3', areaSnapshot: 30, itemTotal: 2000,
      contractState: 'CANCELLED', lotStatus: 'AVAILABLE' },
  ],
  installments: [
    { number: 1, dueDate: '2026-10-10', amount: 2625, paymentStatus: 'PENDING', paidAt: null },
    { number: 2, dueDate: '2026-11-10', amount: 2625, paymentStatus: 'PENDING', paidAt: null },
  ],
  contracts: [contract, contract], documentsAccessible: true,
};

const data = {
  entities: [
    { id: 'pavilion', name: 'Pavilhão 13', publicIdentifier: 'B5', parentEntityId: null },
    { id: 'entity-one', name: 'Módulo 1', publicIdentifier: 'B5-M001', parentEntityId: 'pavilion' },
    { id: 'entity-two', name: 'Módulo 2', publicIdentifier: 'B5-M002', parentEntityId: 'pavilion' },
    { id: 'entity-three', name: 'Lote 3', publicIdentifier: 'A-003', parentEntityId: null },
  ],
  lots: [
    { id: 'lot-one', entityId: 'entity-one', displayName: 'Módulo 1' },
    { id: 'lot-two', entityId: 'entity-two', displayName: 'Módulo 2' },
    { id: 'lot-three', entityId: 'entity-three', displayName: 'Lote 3', block: 'A' },
  ],
} as CommercialSalesOrdersSectionProps['data'];

const clients: QueryClient[] = [];
const props: CommercialSalesOrdersSectionProps = {
  projectId: 'test-project', orgId: 'test-org', canManageSales: true, canManageContracts: true,
  data, scrollContainer: () => null, onViewSale: vi.fn(),
};
function mount(overrides: Partial<CommercialSalesOrdersSectionProps> = {}, client?: QueryClient) {
  const queryClient = client ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  if (!clients.includes(queryClient)) clients.push(queryClient);
  return { ...render(<QueryClientProvider client={queryClient}>
    <CommercialSalesOrdersSection {...props} {...overrides} />
  </QueryClientProvider>), client: queryClient };
}
function saleArticle(reference = record.reference) {
  return screen.getByRole('button', { name: `Detalhes de Expositor de teste · ${reference}` }).closest('article')!;
}

beforeEach(() => {
  vi.clearAllMocks();
  useSalesOrdersUiStore.setState({
    filters: { ...EMPTY_SALE_FILTERS }, page: 0, expandedRecordId: null, filtersOpen: false, scrollTop: 0, originRecordId: null,
  });
  vi.mocked(fetchSaleOrdersPage).mockResolvedValue({ rows: [record], total: 1, documentsAccessible: true });
  vi.mocked(fetchSaleOrderDetail).mockResolvedValue(detail);
  vi.stubGlobal('CSS', { escape: (value: string) => value });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
});

describe('interações da seção existente de vendas e contratos', () => {
  it('aplica a busca somente por Enter ou lupa, conservando os filtros em uso', async () => {
    useSalesOrdersUiStore.setState({ filters: { ...EMPTY_SALE_FILTERS, status: 'PENDING' }, page: 2 });
    const user = userEvent.setup();
    mount();
    await screen.findByText(record.reference);
    const search = screen.getByRole('textbox', { name: 'Pesquisar vendas' });
    await user.type(search, 'expositor');
    expect(fetchSaleOrdersPage).toHaveBeenCalledTimes(1);
    expect(useSalesOrdersUiStore.getState().filters.search).toBe('');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(fetchSaleOrdersPage).toHaveBeenLastCalledWith('test-project',
      { ...EMPTY_SALE_FILTERS, search: 'expositor', status: 'PENDING' }, 0));
    await user.clear(search);
    await user.type(search, 'PED-0001');
    expect(useSalesOrdersUiStore.getState().filters.search).toBe('expositor');
    await user.click(screen.getByRole('button', { name: 'Pesquisar' }));
    await waitFor(() => expect(fetchSaleOrdersPage).toHaveBeenLastCalledWith('test-project',
      { ...EMPTY_SALE_FILTERS, search: 'PED-0001', status: 'PENDING' }, 0));
  });

  it('remove um filtro ativo sem limpar os demais e volta à primeira página', async () => {
    useSalesOrdersUiStore.setState({
      filters: { ...EMPTY_SALE_FILTERS, status: 'PENDING', hasDocument: 'yes', search: 'expositor' }, page: 1,
    });
    mount();
    await screen.findByText(record.reference);
    fireEvent.click(screen.getByRole('button', { name: 'Remover filtro de situação: Aguardando assinatura' }));
    await waitFor(() => expect(fetchSaleOrdersPage).toHaveBeenLastCalledWith('test-project',
      { ...EMPTY_SALE_FILTERS, hasDocument: 'yes', search: 'expositor' }, 0));
    expect(screen.getByRole('combobox', { name: 'Documento' })).toHaveValue('yes');
    expect(screen.getByRole('textbox', { name: 'Pesquisar vendas' })).toHaveValue('expositor');
  });

  it('mantém pedidos do mesmo expositor separados e expande apenas o pedido acionado', async () => {
    const second = { ...record, recordId: 'order-two', orderId: 'order-two', reference: 'PED-0002' };
    vi.mocked(fetchSaleOrdersPage).mockResolvedValue({ rows: [record, second], total: 2, documentsAccessible: true });
    mount();
    await screen.findByText(second.reference);
    const firstRow = within(saleArticle());
    const secondRow = within(saleArticle(second.reference));
    fireEvent.click(secondRow.getByRole('button', { expanded: false }));
    await waitFor(() => expect(fetchSaleOrderDetail).toHaveBeenCalledWith(second));
    expect(firstRow.getByRole('button', { expanded: false })).toBeInTheDocument();
    expect(secondRow.getByRole('button', { expanded: true })).toBeInTheDocument();
    expect(useSalesOrdersUiStore.getState().expandedRecordId).toBe(second.recordId);
  });

  it('preserva o total original, o subtotal ativo, os zeros e a distinção entre arquivo, assinatura e recebimento', async () => {
    mount();
    await screen.findByText(record.reference);
    fireEvent.click(within(saleArticle()).getByRole('button', { expanded: false }));
    await screen.findByRole('heading', { name: /^Contratos/ });
    expect(screen.getByText('Total registrado').closest('div')).toHaveTextContent('5.250,00');
    expect(screen.getByText('Subtotal dos espaços ativos').closest('div')).toHaveTextContent('3.000,00');
    expect(screen.getByText('PPCI').closest('div')).toHaveTextContent('0,00');
    expect(screen.getByText('Módulo 2', { exact: true }).closest('li')).toHaveTextContent('0,00');
    expect(within(saleArticle()).getByText('Aguardando assinatura')).toBeInTheDocument();
    expect(within(saleArticle()).getByText('1 documento')).toBeInTheDocument();
    expect(within(saleArticle()).getByText('Sem recebimento registrado')).toBeInTheDocument();
    expect(screen.getAllByText('Pendente')).toHaveLength(2);
    expect(screen.queryByText('Recebida', { exact: true })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Abrir contrato' })).toHaveLength(1);
    expect(screen.getByText('Arquivo anexado não comprova assinatura ou recebimento.')).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: /^Pavilhão 13/ })).toHaveLength(1);
  });

  it('preserva busca, filtros, página, expansão, rolagem e foco ao voltar do mapa', async () => {
    const scrollContainer = document.createElement('div');
    const onViewSale = vi.fn();
    useSalesOrdersUiStore.setState({ filters: { ...EMPTY_SALE_FILTERS, search: 'expositor', hasDocument: 'yes' }, page: 1, filtersOpen: true });
    vi.mocked(fetchSaleOrdersPage).mockResolvedValue({ rows: [record], total: 41, documentsAccessible: true });
    const view = mount({ scrollContainer: () => scrollContainer, onViewSale });
    await screen.findByText(record.reference);
    expect(screen.getByRole('navigation', { name: 'Páginas de vendas' })).toHaveTextContent('Página 2 de 3');
    fireEvent.click(within(saleArticle()).getByRole('button', { expanded: false }));
    await screen.findByRole('heading', { name: /^Contratos/ });
    scrollContainer.scrollTop = 640;
    fireEvent.click(screen.getByRole('button', { name: 'Ver lotes no mapa' }));
    expect(onViewSale).toHaveBeenCalledWith(record, record.lotIds);
    expect(useSalesOrdersUiStore.getState().originRecordId).toBe(record.recordId);
    view.unmount();
    scrollContainer.scrollTop = 0;
    mount({ scrollContainer: () => scrollContainer, onViewSale }, view.client);
    await screen.findByRole('button', { name: `Detalhes de Expositor de teste · ${record.reference}` });
    expect(screen.getByRole('textbox', { name: 'Pesquisar vendas' })).toHaveValue('expositor');
    expect(screen.getByRole('combobox', { name: 'Documento' })).toHaveValue('yes');
    expect(screen.getByRole('button', { name: /^Filtros/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('navigation', { name: 'Páginas de vendas' })).toHaveTextContent('Página 2 de 3');
    expect(within(saleArticle()).getByRole('button', { expanded: true })).toBeInTheDocument();
    expect(scrollContainer.scrollTop).toBe(640);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ver lotes no mapa' })).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await waitFor(() => expect(fetchSaleOrdersPage).toHaveBeenLastCalledWith('test-project',
      { ...EMPTY_SALE_FILTERS, search: 'expositor', hasDocument: 'yes' }, 2));
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();
  });

  it('respeita o acesso restrito sem consultar vendas ou apresentar documentos como ausentes', async () => {
    const restricted = mount({ canManageSales: false });
    expect(screen.getByText(/Acesso restrito/)).toBeInTheDocument();
    expect(fetchSaleOrdersPage).not.toHaveBeenCalled();
    restricted.unmount();
    vi.mocked(fetchSaleOrdersPage).mockResolvedValue({ rows: [{ ...record, documentCount: null }], total: 1, documentsAccessible: false });
    vi.mocked(fetchSaleOrderDetail).mockResolvedValue({ ...detail, contracts: null, documentsAccessible: false });
    mount({ canManageContracts: false });
    await screen.findByText(record.reference);
    fireEvent.click(within(saleArticle()).getByRole('button', { expanded: false }));
    expect(await screen.findByText(/Consulta de documentos restrita/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anexar contrato' })).not.toBeInTheDocument();
    expect(screen.queryByText('Sem arquivo anexado.')).not.toBeInTheDocument();
  });
});
