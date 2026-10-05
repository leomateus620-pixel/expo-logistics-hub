import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CommercialSalesOrdersSection,
  type CommercialSalesOrdersSectionProps,
} from '@/features/commercial-map/dashboard/salesOrders/CommercialSalesOrdersSection';
import {
  EMPTY_SALE_FILTERS, fetchSaleOrderDetail, fetchSaleOrderRevisions, fetchSaleOrdersPage,
  type SaleContract, type SaleOrderDetail, type SaleOrderSummary,
} from '@/features/commercial-map/dashboard/salesOrders/salesOrdersService';
import { useSalesOrdersUiStore } from '@/features/commercial-map/dashboard/salesOrders/useSalesOrdersUiStore';

vi.mock('@/features/commercial-map/dashboard/salesOrders/salesOrdersService', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/features/commercial-map/dashboard/salesOrders/salesOrdersService')>(),
  fetchSaleOrdersPage: vi.fn(),
  fetchSaleOrderDetail: vi.fn(), fetchSaleOrderRevisions: vi.fn(),
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
    scopeProjectId: null, area: 'sales', detailTab: 'overview', selectedRecordIdentity: null, listScrollTop: 0, detailScrollTop: 0, searchOpen: false, filters: { ...EMPTY_SALE_FILTERS }, page: 0, expandedRecordId: null, filtersOpen: false, scrollTop: 0, originRecordId: null,
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

describe('espaço dedicado de vendas e contratos', () => {
  it('monta controles recolhidos, consulta só a página e move foco para a área', async () => {
    mount({ onBack: vi.fn() });
    expect(screen.getByRole('heading', { name: 'Vendas e contratos' })).toHaveFocus();
    await screen.findByText(record.reference);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(fetchSaleOrderDetail).not.toHaveBeenCalled();
    expect(fetchSaleOrderRevisions).not.toHaveBeenCalled();
    expect(within(saleArticle()).getByText('Venda em aberto')).toBeInTheDocument();
    expect(within(saleArticle()).getByText('1 de 2 assinados · 1 cancelado(s)')).toBeInTheDocument();
    expect(within(saleArticle()).getByText('1 documento')).toBeInTheDocument();
    expect(within(saleArticle()).getByText('Sem recebimento registrado')).toBeInTheDocument();
  });

  it('aplica busca somente por Enter ou lupa, preservando os filtros existentes', async () => {
    useSalesOrdersUiStore.setState({ filters: { ...EMPTY_SALE_FILTERS, status: 'PENDING' }, page: 2 });
    const user = userEvent.setup();
    mount();
    await screen.findByText(record.reference);
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    const search = screen.getByRole('textbox', { name: 'Pesquisar vendas' });
    await waitFor(() => expect(search).toHaveFocus());
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
    search.focus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Buscar/ })).toHaveFocus();
  });

  it('expande filtros por teclado, remove um critério e conserva os demais', async () => {
    useSalesOrdersUiStore.setState({ filters: { ...EMPTY_SALE_FILTERS, status: 'PENDING', hasDocument: 'yes', search: 'expositor' }, page: 1 });
    const user = userEvent.setup();
    mount();
    await screen.findByText(record.reference);
    fireEvent.click(screen.getByRole('button', { name: 'Remover filtro de situação: Aguardando assinatura' }));
    await waitFor(() => expect(fetchSaleOrdersPage).toHaveBeenLastCalledWith('test-project',
      { ...EMPTY_SALE_FILTERS, hasDocument: 'yes', search: 'expositor' }, 0));
    const filterButton = screen.getByRole('button', { name: /Filtrar/ });
    filterButton.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('combobox', { name: 'Documento' })).toHaveValue('yes');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('combobox')).not.toBeInTheDocument());
    expect(filterButton).toHaveFocus();
    expect(screen.getByText('Busca: expositor')).toBeInTheDocument();
    expect(screen.getByText('Com arquivo anexado')).toBeInTheDocument();
  });

  it('separa pedidos do mesmo expositor, abre detalhe dedicado e restaura o cartão ao voltar', async () => {
    const second = { ...record, recordId: 'order-two', orderId: 'order-two', reference: 'PED-0002' };
    vi.mocked(fetchSaleOrdersPage).mockResolvedValue({ rows: [record, second], total: 2, documentsAccessible: true });
    vi.mocked(fetchSaleOrderDetail).mockResolvedValue({ ...detail, header: { ...detail.header, ...second } });
    const scrollContainer = document.createElement('div');
    mount({ scrollContainer: () => scrollContainer });
    await screen.findByText(second.reference);
    expect(screen.getAllByRole('article')).toHaveLength(2);
    scrollContainer.scrollTop = 460;
    fireEvent.click(within(saleArticle(second.reference)).getByRole('button'));
    await waitFor(() => expect(fetchSaleOrderDetail).toHaveBeenCalledWith(second));
    await screen.findByRole('tab', { name: 'Visão geral' });
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.queryByText(record.reference)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Expositor de teste' })).toHaveFocus();
    expect(useSalesOrdersUiStore.getState().expandedRecordId).toBe(second.recordId);
    expect(scrollContainer.scrollTop).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Voltar às vendas' }));
    await screen.findByText(second.reference);
    expect(scrollContainer.scrollTop).toBe(460);
    await waitFor(() => expect(within(saleArticle(second.reference)).getByRole('button')).toHaveFocus());
  });

  it('mantém grupos independentes, total original, subtotal ativo e zeros sem misturar assinatura, documentos e recebimentos', async () => {
    mount();
    await screen.findByText(record.reference);
    fireEvent.click(within(saleArticle()).getByRole('button'));
    await screen.findByRole('tab', { name: 'Financeiro' });
    expect(screen.queryByText('Parcelas e recebimentos')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Financeiro' }));
    expect(screen.getByText('Total registrado').closest('div')).toHaveTextContent('5.250,00');
    expect(screen.getByText('Subtotal dos espaços ativos').closest('div')).toHaveTextContent('3.000,00');
    expect(screen.getByText('PPCI').closest('div')).toHaveTextContent('0,00');
    expect(screen.getAllByText('Pendente')).toHaveLength(2);
    expect(screen.queryByText('Recebida', { exact: true })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Espaços' }));
    expect(screen.getByText('Módulo 2', { exact: true }).closest('li')).toHaveTextContent('0,00');
    expect(screen.getByText('Aguardando assinatura')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Editar lotes' })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { name: /^Pavilhão 13/ })).toHaveLength(1);
    expect(screen.queryByText('Parcelas e recebimentos')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Contratos' }));
    expect(screen.getAllByRole('button', { name: 'Abrir contrato' })).toHaveLength(1);
    expect(screen.getByText('Arquivo anexado não comprova assinatura ou recebimento.')).toBeInTheDocument();
    expect(screen.getByText(/Abrangência/)).toHaveTextContent('2 espaços');
    expect(screen.queryByRole('button', { name: 'Editar lotes' })).not.toBeInTheDocument();
  });

  it('conserva desconhecido versus zero no subtotal ativo e nas taxas', async () => {
    vi.mocked(fetchSaleOrderDetail).mockResolvedValue({ ...detail, header: { ...detail.header, feeAdmin: null }, items: detail.items.map((item) => item.lotId === 'lot-one' ? { ...item, itemTotal: null } : item) });
    mount();
    await screen.findByText(record.reference);
    fireEvent.click(within(saleArticle()).getByRole('button'));
    await screen.findByRole('tab', { name: 'Financeiro' });
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Financeiro' }));
    expect(screen.getByText('Taxa administrativa').closest('div')).toHaveTextContent('—');
    expect(screen.getByText('Subtotal dos espaços ativos').closest('div')).toHaveTextContent('—');
    expect(screen.getByText('PPCI').closest('div')).toHaveTextContent('0,00');
  });

  it('restaura área, filtros, página, aba, rolagem e foco só depois do detalhe voltar do mapa', async () => {
    const scrollContainer = document.createElement('div');
    const onViewSale = vi.fn();
    useSalesOrdersUiStore.setState({ area: 'sales', filters: { ...EMPTY_SALE_FILTERS, search: 'expositor', hasDocument: 'yes' }, page: 1, filtersOpen: false, searchOpen: true });
    vi.mocked(fetchSaleOrdersPage).mockResolvedValue({ rows: [record], total: 41, documentsAccessible: true });
    const view = mount({ scrollContainer: () => scrollContainer, onViewSale });
    await screen.findByText(record.reference);
    expect(screen.getByRole('navigation', { name: 'Páginas de vendas' })).toHaveTextContent('Página 2 de 3');
    scrollContainer.scrollTop = 200;
    fireEvent.click(within(saleArticle()).getByRole('button'));
    await screen.findByRole('tab', { name: 'Espaços' });
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Espaços' }));
    scrollContainer.scrollTop = 640;
    fireEvent.click(screen.getByRole('button', { name: 'Ver lotes no mapa' }));
    expect(onViewSale).toHaveBeenCalledWith(record, record.lotIds);
    expect(useSalesOrdersUiStore.getState().originRecordId).toBe(record.recordId);
    view.unmount();
    view.client.removeQueries({ queryKey: ['commercial-sale-order-detail'] });
    let resolveDetail!: (value: SaleOrderDetail) => void;
    vi.mocked(fetchSaleOrderDetail).mockImplementationOnce(() => new Promise((resolve) => { resolveDetail = resolve; }));
    scrollContainer.scrollTop = 0;
    mount({ scrollContainer: () => scrollContainer, onViewSale }, view.client);
    await screen.findByText('Carregando detalhes…');
    expect(useSalesOrdersUiStore.getState().originRecordId).toBe(record.recordId);
    resolveDetail(detail);
    await screen.findByRole('button', { name: 'Ver lotes no mapa' });
    expect(screen.getByRole('tab', { name: 'Espaços' })).toHaveAttribute('data-state', 'active');
    expect(useSalesOrdersUiStore.getState().area).toBe('sales');
    expect(scrollContainer.scrollTop).toBe(640);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ver lotes no mapa' })).toHaveFocus());
    expect(useSalesOrdersUiStore.getState().originRecordId).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar às vendas' }));
    expect(scrollContainer.scrollTop).toBe(200);
    expect(screen.getByRole('textbox', { name: 'Pesquisar vendas' })).toHaveValue('expositor');
    fireEvent.click(screen.getByRole('button', { name: /Filtrar/ }));
    expect(screen.getByRole('combobox', { name: 'Documento' })).toHaveValue('yes');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar filtros' }));
    expect(screen.getByRole('navigation', { name: 'Páginas de vendas' })).toHaveTextContent('Página 2 de 3');
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await waitFor(() => expect(fetchSaleOrdersPage).toHaveBeenLastCalledWith('test-project',
      { ...EMPTY_SALE_FILTERS, search: 'expositor', hasDocument: 'yes' }, 2));
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();
  });

  it('reabre pela identidade depois que a venda deixa a página filtrada, usando valores e estados atuais do detalhe', async () => {
    const scrollContainer = document.createElement('div');
    const onViewSale = vi.fn();
    useSalesOrdersUiStore.setState({ filters: { ...EMPTY_SALE_FILTERS, status: 'PENDING' } });
    const view = mount({ scrollContainer: () => scrollContainer, onViewSale });
    await screen.findByText(record.reference);
    fireEvent.click(within(saleArticle()).getByRole('button'));
    await screen.findByRole('tab', { name: 'Espaços' });
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Espaços' }));
    expect(useSalesOrdersUiStore.getState().selectedRecordIdentity).toEqual({ recordId: record.recordId, orderId: record.orderId, saleId: record.saleId });
    // Simula a resposta invalidada do filtro depois de uma alteração autorizada, sem executar mutation.
    view.client.setQueryData(['commercial-sale-orders', 'test-project', { ...EMPTY_SALE_FILTERS, status: 'PENDING' }, 0], { rows: [], total: 0, documentsAccessible: true });
    scrollContainer.scrollTop = 320;
    fireEvent.click(screen.getByRole('button', { name: 'Ver lotes no mapa' }));
    view.unmount();
    view.client.removeQueries({ queryKey: ['commercial-sale-orders'] });
    view.client.removeQueries({ queryKey: ['commercial-sale-order-detail'] });
    vi.mocked(fetchSaleOrdersPage).mockResolvedValue({ rows: [], total: 0, documentsAccessible: true });
    vi.mocked(fetchSaleOrderDetail).mockResolvedValue({ ...detail, header: {
      kind: 'ORDER', orderId: record.orderId, reference: record.reference, createdAt: record.createdAt,
      status: 'CONFIRMED', buyerName: 'Razão social atual', buyerTradeName: 'Expositor atualizado',
      negotiatedTotal: 6000, spacesSubtotal: 5750, feesTotal: 250,
      feeAdmin: 250, feePpci: 0, feeCleaning: 0, paymentMethod: 'BOLETO_PARCELADO', installmentCount: 2,
    }, items: detail.items.map((item) => item.contractState === 'PENDING_SIGNATURE' ? { ...item, contractState: 'SIGNED' } : item) });
    scrollContainer.scrollTop = 0;
    mount({ scrollContainer: () => scrollContainer, onViewSale }, view.client);
    await screen.findByRole('heading', { name: 'Expositor atualizado' });
    expect(fetchSaleOrderDetail).toHaveBeenLastCalledWith({ recordId: record.recordId, orderId: record.orderId, saleId: record.saleId });
    expect(screen.getByText('Venda confirmada')).toBeInTheDocument();
    expect(screen.getByText('Assinatura confirmada · 1 cancelado(s)')).toBeInTheDocument();
    expect(screen.getByText('Espaços ativos').closest('div')).toHaveTextContent('2');
    expect(screen.getByText('Valor negociado').closest('div')).toHaveTextContent('6.000,00');
    expect(screen.queryByText(/registro não está na página/)).not.toBeInTheDocument();
    expect(scrollContainer.scrollTop).toBe(320);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ver lotes no mapa' })).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Ver lotes no mapa' }));
    expect(onViewSale).toHaveBeenLastCalledWith(expect.objectContaining({ reference: record.reference, orderId: record.orderId, activeCount: 2, signedCount: 2, pendingCount: 0, negotiatedTotal: 6000 }), ['lot-one', 'lot-two']);
  });

  it('impede consulta e exibição da identidade anterior ao trocar de projeto, e só abre pedido do novo projeto após seleção', async () => {
    const nextRecord = { ...record, recordId: 'order-project-two', orderId: 'order-project-two', reference: 'PED-PROJETO-2', buyerTradeName: 'Outro projeto' };
    const scrollContainer = document.createElement('div');
    useSalesOrdersUiStore.setState({ filters: { ...EMPTY_SALE_FILTERS, status: 'PENDING', search: 'expositor' }, page: 2 });
    vi.mocked(fetchSaleOrdersPage).mockImplementation(async (id) => ({ rows: [id === 'test-project' ? record : nextRecord], total: 41, documentsAccessible: true }));
    vi.mocked(fetchSaleOrderDetail).mockImplementation(async (identity) => ({ ...detail, header: { ...detail.header, ...(identity.orderId === record.orderId ? record : nextRecord) } }));
    const view = mount({ scrollContainer: () => scrollContainer });
    await screen.findByText(record.reference);
    expect(useSalesOrdersUiStore.getState().scopeProjectId).toBe('test-project');
    expect(useSalesOrdersUiStore.getState().page).toBe(2);
    fireEvent.click(within(saleArticle()).getByRole('button'));
    await screen.findByRole('tab', { name: 'Espaços' });
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Espaços' }));
    scrollContainer.scrollTop = 430;
    act(() => useSalesOrdersUiStore.getState().rememberOrigin(record.recordId, 430));
    expect(fetchSaleOrderDetail).toHaveBeenCalledTimes(1);
    view.rerender(<QueryClientProvider client={view.client}><CommercialSalesOrdersSection {...props} projectId="project-two" scrollContainer={() => scrollContainer} /></QueryClientProvider>);
    // O bloqueio acontece antes do efeito: o pedido anterior já saiu do DOM e não inicia outra RPC.
    expect(screen.queryByRole('tab', { name: 'Espaços' })).not.toBeInTheDocument();
    expect(screen.queryByText(record.reference)).not.toBeInTheDocument();
    expect(fetchSaleOrderDetail).toHaveBeenCalledTimes(1);
    await screen.findByText(nextRecord.reference);
    expect(fetchSaleOrdersPage).toHaveBeenLastCalledWith('project-two', EMPTY_SALE_FILTERS, 0);
    expect(useSalesOrdersUiStore.getState()).toMatchObject({ scopeProjectId: 'project-two', expandedRecordId: null,
      selectedRecordIdentity: null, detailTab: 'overview', page: 0, filters: EMPTY_SALE_FILTERS,
      originRecordId: null, listScrollTop: 0, detailScrollTop: 0 });
    expect(screen.queryByRole('tab', { name: 'Espaços' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Detalhes de Outro projeto · PED-PROJETO-2' }));
    await screen.findByRole('heading', { name: 'Outro projeto' });
    expect(fetchSaleOrderDetail).toHaveBeenCalledTimes(2);
    expect(fetchSaleOrderDetail).toHaveBeenLastCalledWith(nextRecord);
    expect(useSalesOrdersUiStore.getState().selectedRecordIdentity).toEqual({ recordId: nextRecord.recordId, orderId: nextRecord.orderId, saleId: null });
  });

  it('pagina 17 parcelas localmente e carrega histórico somente na aba, sem inferir numeração de IDs técnicos', async () => {
    const installments = Array.from({ length: 17 }, (_, i) => ({ number: i + 1, dueDate: '2026-10-10', amount: 100, paymentStatus: 'PENDING', paidAt: null }));
    vi.mocked(fetchSaleOrderDetail).mockResolvedValue({ ...detail, installments });
    vi.mocked(fetchSaleOrderRevisions).mockResolvedValue({ updatedAt: '2026-10-05', revisions: [{ id: 'rev-one', createdAt: '2026-10-05T12:00:00Z', reason: 'Troca de espaços', actorName: 'Equipe de teste', before: { lots: ['B5-M031'], negotiated_total: 0 }, after: { lots: ['B5-M104'], negotiated_total: 100 } }] });
    mount();
    await screen.findByText(record.reference);
    fireEvent.click(within(saleArticle()).getByRole('button'));
    await screen.findByRole('tab', { name: 'Financeiro' });
    expect(fetchSaleOrderRevisions).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Financeiro' }));
    expect(screen.getAllByText('Pendente')).toHaveLength(8);
    expect(screen.getByRole('navigation', { name: 'Páginas de parcelas' })).toHaveTextContent('1–8 de 17');
    fireEvent.click(screen.getByRole('button', { name: 'Próximas parcelas' }));
    expect(screen.getByRole('navigation', { name: 'Páginas de parcelas' })).toHaveTextContent('9–16 de 17');
    fireEvent.click(screen.getByRole('button', { name: 'Próximas parcelas' }));
    expect(screen.getByText('17ª')).toBeInTheDocument();
    expect(screen.getAllByText('Pendente')).toHaveLength(1);
    expect(fetchSaleOrderDetail).toHaveBeenCalledTimes(1);
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Histórico' }));
    await screen.findByText('Troca de espaços');
    expect(fetchSaleOrderRevisions).toHaveBeenCalledWith(record.orderId);
    expect(screen.getByText('B5-M031')).toBeInTheDocument();
    expect(screen.getByText('B5-M104')).toBeInTheDocument();
    expect(screen.getByText('Equipe de teste')).toBeInTheDocument();
    expect(screen.queryByText('Parcelas e recebimentos')).not.toBeInTheDocument();
  });

  it('respeita o acesso restrito sem consultar vendas nem apresentar documento restrito como ausente', async () => {
    const restricted = mount({ canManageSales: false });
    expect(screen.getByText(/Acesso restrito/)).toBeInTheDocument();
    expect(fetchSaleOrdersPage).not.toHaveBeenCalled();
    restricted.unmount();
    vi.mocked(fetchSaleOrdersPage).mockResolvedValue({ rows: [{ ...record, documentCount: null }], total: 1, documentsAccessible: false });
    vi.mocked(fetchSaleOrderDetail).mockResolvedValue({ ...detail, contracts: null, documentsAccessible: false });
    mount({ canManageContracts: false });
    await screen.findByText(record.reference);
    expect(screen.getByText('Documentos restritos')).toBeInTheDocument();
    fireEvent.click(within(saleArticle()).getByRole('button'));
    await screen.findByRole('tab', { name: 'Contratos' });
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Contratos' }));
    expect(screen.getByText(/Consulta de documentos restrita/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Anexar contrato' })).not.toBeInTheDocument();
    expect(screen.queryByText('Sem arquivo anexado.')).not.toBeInTheDocument();
  });

  it('distingue falha de carregamento de ausência de vendas', async () => {
    vi.mocked(fetchSaleOrdersPage).mockRejectedValue(new Error('Falha de conexão de teste'));
    mount();
    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent('Falha de conexão de teste');
    expect(screen.queryByText('Nenhuma venda encontrada')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});
