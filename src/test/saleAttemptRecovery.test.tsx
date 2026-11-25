import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaleAttemptCheck, SaleAttemptsRecovery } from '@/features/commercial-map/sales/components/SaleAttemptRecovery';
import { SalesCheckoutDialog } from '@/features/commercial-map/sales/components/SalesCheckoutDialog';
import { clearSaleAttempt, listSaleAttempts, readUncertainSale, startSaleAttempt } from '@/features/commercial-map/sales/saleAttemptStore';
import { useSalesStore } from '@/features/commercial-map/sales/useSalesSelection';
import type { SalesCartSummary } from '@/features/commercial-map/sales/salesPricing';
import type { SalesOrderPayload } from '@/features/commercial-map/sales/salesTypes';

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), submit: vi.fn(), refresh: vi.fn() }));
vi.mock('@/features/commercial-map/sales/salesService', () => ({ fetchSaleAttemptResult: mocks.lookup }));
vi.mock('@/features/commercial-map/queries/commercialMapRefresh', () => ({ scheduleCommercialMapRefresh: mocks.refresh }));
vi.mock('@/features/commercial-map/sales/useSalesCheckout', () => ({ useSalesCheckout: () => ({ mutateAsync: mocks.submit, isPending: false }) }));
vi.mock('@/features/commercial-map/sales/useExhibitorAutosave', () => ({ useExhibitorAutosave: () => ({ exhibitorId: null, flushWithin: vi.fn(), reset: vi.fn() }) }));
vi.mock('@/features/commercial-map/sales/components/SalesBuyerForm', () => ({
  buyerErrors: () => ({}),
  SalesBuyerForm: ({ value, onChange }: { value: SalesOrderPayload['buyer']; onChange: (value: SalesOrderPayload['buyer']) => void }) =>
    <input aria-label="Expositor de teste" value={value.buyerName} onChange={(event) => onChange({ ...value, buyerName: event.target.value })} />,
}));
vi.mock('@/features/commercial-map/sales/components/SalesPaymentForm', () => ({ paymentErrors: () => ({}), SalesPaymentForm: () => null }));
vi.mock('@/features/commercial-map/sales/components/SalesReview', () => ({ SalesReview: () => null }));

const owner = { projectId: 'project-a', operatorId: 'operator-a' };
const entry = { lotId: 'lot-a', publicIdentifier: 'B1-M047', displayName: 'Módulo 47', context: 'Pavilhão 1' };
const summary: SalesCartSummary = {
  lines: [{ entry, pricing: null, areaSqm: 9, pricePerSqm: 100, total: 900, unpriced: false, pendingReason: null }],
  areaTotal: 9, foodPointCount: 0, valueTotal: 900, blockingCount: 0, pendingCount: 0, ready: true,
};
const found = { orderId: '00000000-0000-4000-8000-000000000001', reference: 'PV-00000000' };

function mount(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  mocks.lookup.mockReset(); mocks.submit.mockReset();
  useSalesStore.setState({ selection: [entry], stage: 'RENOVACAO', checkoutOpen: true });
});
afterEach(() => {
  cleanup();
  for (const attempt of listSaleAttempts(owner)) clearSaleAttempt(attempt);
});

async function requestDismissal() {
  fireEvent.click(screen.getByRole('button', { name: 'Verificar resultado' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Remover aviso' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' })); });
}

describe('dispensa segura do aviso local', () => {
  it('remove após duas consultas sem pedido e não reaparece ao remontar', async () => {
    const attempt = startSaleAttempt(owner, 'RENOVACAO', [entry.lotId]);
    mocks.lookup.mockResolvedValue(null);
    const ui = <SaleAttemptsRecovery owner={owner} labelOf={(id) => id} onOpenOrder={vi.fn()} />;
    const view = mount(ui);
    fireEvent.click(screen.getByRole('button', { name: 'Recuperar venda (1)' }));
    await requestDismissal();
    await waitFor(() => expect(listSaleAttempts(owner)).toEqual([]));
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
    expect(mocks.lookup).toHaveBeenLastCalledWith(attempt);
    expect(screen.queryByRole('button', { name: /Recuperar venda/ })).not.toBeInTheDocument();
    view.unmount(); mount(ui);
    expect(screen.queryByRole('button', { name: /Recuperar venda/ })).not.toBeInTheDocument();
  });

  it('não remove nada quando a consulta falha', async () => {
    const attempt = startSaleAttempt(owner, 'RENOVACAO', [entry.lotId]);
    mocks.lookup.mockRejectedValue(new Error('Failed to fetch'));
    mount(<SaleAttemptCheck attempt={attempt} onOpenOrder={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Verificar resultado' }));
    await waitFor(() => expect(mocks.lookup).toHaveBeenCalledTimes(1));
    expect(listSaleAttempts(owner)).toEqual([attempt]);
    expect(screen.queryByRole('button', { name: 'Remover aviso' })).not.toBeInTheDocument();
  });

  it('preserva o aviso se a reconsulta da confirmação falhar', async () => {
    const attempt = startSaleAttempt(owner, 'RENOVACAO', [entry.lotId]);
    mocks.lookup.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('AUTH_REQUIRED'));
    mount(<SaleAttemptCheck attempt={attempt} onOpenOrder={vi.fn()} />);
    await requestDismissal();
    await waitFor(() => expect(mocks.lookup).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remover aviso' })).not.toBeInTheDocument());
    expect(listSaleAttempts(owner)).toEqual([attempt]);
  });

  it('não dispensa enquanto uma consulta estiver em andamento', async () => {
    const attempt = startSaleAttempt(owner, 'RENOVACAO', [entry.lotId]);
    let finish: ((result: null) => void) | undefined;
    mocks.lookup.mockImplementation(() => new Promise<null>((resolve) => { finish = resolve; }));
    mount(<SaleAttemptCheck attempt={attempt} onOpenOrder={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Verificar resultado' }));
    expect(screen.getByRole('button', { name: 'Verificar resultado' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remover aviso' })).not.toBeInTheDocument();
    expect(listSaleAttempts(owner)).toEqual([attempt]);
    await act(async () => { finish?.(null); });
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });

  it('cancelar a confirmação mantém a tentativa sem nova consulta', async () => {
    const attempt = startSaleAttempt(owner, 'RENOVACAO', [entry.lotId]);
    mocks.lookup.mockResolvedValue(null);
    mount(<SaleAttemptCheck attempt={attempt} onOpenOrder={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Verificar resultado' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover aviso' }));
    fireEvent.click(screen.getByRole('button', { name: 'Manter aviso' }));
    expect(listSaleAttempts(owner)).toEqual([attempt]);
    expect(mocks.lookup).toHaveBeenCalledTimes(1);
  });

  it('preserva e abre o pedido se ele surgir na reconsulta', async () => {
    const attempt = startSaleAttempt(owner, 'RENOVACAO', [entry.lotId]);
    const openOrder = vi.fn();
    mocks.lookup.mockResolvedValueOnce(null).mockResolvedValueOnce(found);
    mount(<SaleAttemptCheck attempt={attempt} onOpenOrder={openOrder} />);
    await requestDismissal();
    const open = await screen.findByRole('button', { name: 'Abrir pedido' });
    expect(listSaleAttempts(owner)).toEqual([attempt]);
    fireEvent.click(open);
    expect(openOrder).toHaveBeenCalledWith(found.orderId);
    expect(listSaleAttempts(owner)).toEqual([]);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it('remove só o aviso escolhido e mantém outros projetos, operadores e tentativas', async () => {
    const attempt = startSaleAttempt(owner, 'RENOVACAO', [entry.lotId]);
    const other = startSaleAttempt(owner, 'SEGUNDA_ETAPA', ['lot-b']);
    const project = { ...owner, projectId: 'project-b' };
    const operator = { ...owner, operatorId: 'operator-b' };
    const differentProject = startSaleAttempt(project, 'RENOVACAO', [entry.lotId]);
    const differentOperator = startSaleAttempt(operator, 'RENOVACAO', [entry.lotId]);
    mocks.lookup.mockResolvedValue(null);
    mount(<SaleAttemptCheck attempt={attempt} onOpenOrder={vi.fn()} />);
    await requestDismissal();
    await waitFor(() => expect(listSaleAttempts(owner)).toEqual([other]));
    expect(listSaleAttempts(project)).toEqual([differentProject]);
    expect(listSaleAttempts(operator)).toEqual([differentOperator]);
    clearSaleAttempt(differentProject); clearSaleAttempt(differentOperator);
  });
});

async function failCheckout() {
  mocks.submit.mockRejectedValueOnce(new Error('Failed to fetch'));
  const view = mount(<SalesCheckoutDialog owner={owner} summary={summary} availabilityNotices={[]} onOpenOrder={vi.fn()} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Expositor de teste' }), { target: { value: 'EXPOSITOR SINTÉTICO' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar' })).not.toBeDisabled());
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Registrar venda em aberto' }));
  await screen.findByRole('button', { name: 'Verificar resultado' });
  return view;
}

describe('continuidade da tentativa original', () => {
  it('voltar ao carrinho e reabrir não cria outro envio; reenvio preserva chave e dados', async () => {
    await failCheckout();
    const original = structuredClone(mocks.submit.mock.calls[0][0]) as SalesOrderPayload;
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao carrinho' }));
    act(() => useSalesStore.setState({ checkoutOpen: true, selection: [{ ...entry, lotId: 'lot-b' }], stage: 'SEGUNDA_ETAPA' }));
    expect(screen.queryByRole('button', { name: 'Registrar venda em aberto' })).not.toBeInTheDocument();
    expect(listSaleAttempts(owner)).toHaveLength(1);
    mocks.lookup.mockResolvedValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'Verificar resultado' }));
    mocks.submit.mockResolvedValueOnce(found.orderId);
    fireEvent.click(await screen.findByRole('button', { name: 'Reenviar tentativa original' }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2));
    expect(mocks.submit.mock.calls[1][0]).toEqual(original);
    await waitFor(() => expect(listSaleAttempts(owner)).toEqual([]));
    expect(readUncertainSale(owner)).toBeNull();
  });

  it('remontar após sair do modo Vendas recupera dados em memória, sem guardar dados pessoais no navegador', async () => {
    const view = await failCheckout();
    const original = structuredClone(mocks.submit.mock.calls[0][0]) as SalesOrderPayload;
    const attempt = listSaleAttempts(owner)[0];
    expect(readUncertainSale(owner)?.payload).toEqual(original);
    expect(readUncertainSale({ ...owner, operatorId: 'operator-b' })).toBeNull();
    expect(readUncertainSale({ ...owner, projectId: 'project-b' })).toBeNull();
    expect(JSON.stringify(Object.values(localStorage))).not.toContain('EXPOSITOR SINTÉTICO');
    view.unmount();
    act(() => useSalesStore.setState({ checkoutOpen: true }));
    mount(<SalesCheckoutDialog owner={owner} summary={summary} availabilityNotices={[]} onOpenOrder={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Verificar resultado' })).toBeInTheDocument();
    expect(listSaleAttempts(owner)).toEqual([attempt]);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it('dispensar permite um novo envio com chave própria sem deixar aviso anterior', async () => {
    await failCheckout();
    const original = mocks.submit.mock.calls[0][0] as SalesOrderPayload;
    mocks.lookup.mockResolvedValue(null);
    await requestDismissal();
    const register = await screen.findByRole('button', { name: 'Registrar venda em aberto' });
    expect(listSaleAttempts(owner)).toEqual([]);
    mocks.submit.mockResolvedValueOnce(found.orderId);
    fireEvent.click(register);
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2));
    expect(mocks.submit.mock.calls[1][0].idempotencyKey).not.toBe(original.idempotencyKey);
    await waitFor(() => expect(listSaleAttempts(owner)).toEqual([]));
  });
});