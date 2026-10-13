import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Financial2028Expenses } from '@/features/financial-management/operational/Financial2028Expenses';
import { EXPENSE_SPLIT_KEY, readExpenseSplit } from '@/features/financial-management/operational/financialExpenseLayout';
import { fetchExpenseComparison, listExpenseCategories, listExpenses, FinancialExpenseError, type ExpenseComparison, type FinancialExpense } from '@/features/financial-management/operational/financialExpensesApi';
const auth = vi.hoisted(() => ({ edit: true, confirm: true, admin: true }));
vi.mock('@/hooks/useCurrentOrg', () => ({ useCurrentOrg: () => ({ orgId: 'qa-org' }) }));
vi.mock('@/hooks/useOrgCommissions', () => ({ useOrgCommissions: () => ({ commissions: [{ id: 'c', nome: 'Comissão' }] }) }));
vi.mock('@/features/financial-management/operational/useFinancialExpenseCapabilities', () => ({ useFinancialExpenseCapabilities: () => ({ canAccess: true, canEdit: auth.edit, canConfirm: auth.confirm, canAdmin: auth.admin, isLoading: false, isError: false, refetch: vi.fn() }) }));
vi.mock('@/features/financial-management/operational/financialExpensesApi', async original => ({ ...await original<typeof import('@/features/financial-management/operational/financialExpensesApi')>(), fetchExpenseComparison: vi.fn(), listExpenseCategories: vi.fn(), listExpenses: vi.fn() }));
const edition = { id: 'qa-edition', org_id: 'qa-org', code: 2028, label: 'Fenasoja 2028', status: 'operacional' as const, period_start: '2027-01-01', period_end: '2028-12-31' };
const expense: FinancialExpense = { id: 'qa-expense', edition_id: edition.id, title: 'Despesa prevista preservada', description: null, category_id: 'cat', category_name: 'Categoria personalizada', commission_id: 'c', commission_name: 'Comissão', budget_line_id: null, payee_name: null, planned_cents: 10000, planned_on: '2028-01-02', committed_cents: 12000, committed_on: '2028-01-03', due_date: null, status: 'realizada', notes: null, cancel_reason: null, version: 2, created_at: '', updated_at: '', obligation_id: 'o', paid_cents: 4000, open_cents: 8000, settlement_inconsistent: false };
const comparison: ExpenseComparison = { totals: { count: 30, planned_cents: 1000000, committed_cents: 1200000, paid_cents: 400000, open_cents: 800000, deviation_cents: 200000, deviation_pct: 20, comparison_state: 'comparavel', overdue_count: 0, overdue_cents: 0, realized_without_plan_count: 0, by_status: { prevista: 0, realizada: 30, cancelada: 0 } }, by_category: [{ id: 'cat', name: 'Categoria personalizada', count: 30, planned_cents: 1000000, committed_cents: 1200000, paid_cents: 400000, deviation_cents: 200000, deviation_pct: 20, comparison_state: 'comparavel' }], by_commission: [] };
const metric = (name: string) => screen.getByRole('heading', { name }).closest('article') as HTMLElement;
function mount(focus: 'projetado' | 'realizado' = 'projetado') { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return { client, ...render(<QueryClientProvider client={client}><Financial2028Expenses edition={edition} focus={focus} /></QueryClientProvider>) }; }
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); auth.edit = auth.confirm = auth.admin = true;
  vi.mocked(fetchExpenseComparison).mockResolvedValue(structuredClone(comparison));
  vi.mocked(listExpenses).mockResolvedValue({ total: 30, limit: 25, offset: 0, items: [expense] });
  vi.mocked(listExpenseCategories).mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('comparação de despesas 2028', () => {
  it('preserva previsão de realizada e usa os totais do servidor em todos os painéis', async () => {
    mount(); await within(metric('Total realizado')).findByRole('button', { name: /12\.000,00/ });
    expect(within(metric('Total projetado')).getByRole('button', { name: /10\.000,00/ })).toBeInTheDocument();
    expect(within(metric('Pago líquido')).getByRole('button', { name: /4\.000,00/ })).toBeInTheDocument();
    expect(within(metric('Saldo a pagar')).getByRole('button', { name: /8\.000,00/ })).toBeInTheDocument();
    expect(screen.queryByText('Inclui previsões preservadas · exclui canceladas')).not.toBeInTheDocument();
    fireEvent.click(within(metric('Total projetado')).getByRole('button', { name: 'Ajuda sobre Total projetado' }));
    expect(await screen.findByText('Inclui previsões preservadas · exclui canceladas')).toBeInTheDocument();
    expect(fetchExpenseComparison).toHaveBeenCalledTimes(1);
  });
  it('paginação consulta somente a listagem e busca com botão atualiza o recorte inteiro', async () => {
    mount(); await screen.findByRole('button', { name: 'Próxima' });
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await waitFor(() => expect(listExpenses).toHaveBeenLastCalledWith('qa-org', edition.id, { date_field: 'planned_on' }, 25, 25));
    expect(fetchExpenseComparison).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'pavilhão' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(fetchExpenseComparison).toHaveBeenLastCalledWith('qa-org', edition.id, { date_field: 'planned_on', q: 'pavilhão' }));
    expect(listExpenses).toHaveBeenLastCalledWith('qa-org', edition.id, { date_field: 'planned_on', q: 'pavilhão' }, 25, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });
  it('mantém painéis, filtro e consultas ao alternar abas', async () => {
    const result = mount('realizado'); await within(metric('Total realizado')).findByRole('button', { name: /Ver valor exato/ });
    const panels = [...result.container.querySelectorAll('[data-expense-panel]')];
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'rascunho' } });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Realizado' }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Projetado' })).toHaveAttribute('aria-selected', 'true');
    expect([...result.container.querySelectorAll('[data-expense-panel]')]).toEqual(panels);
    expect(screen.getByRole('searchbox')).toHaveValue('rascunho');
    expect(fetchExpenseComparison).toHaveBeenCalledTimes(1); expect(listExpenses).toHaveBeenCalledTimes(1);
  });
  it('recolhe todos os seletores no mobile e remove um filtro sem perder os demais', async () => {
    vi.stubGlobal('ResizeObserver', class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) { this.callback([{ target, contentRect: { width: 390, height: 600 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      unobserve() {}
      disconnect() {}
    });
    const result = mount();
    await within(metric('Total projetado')).findByRole('button', { name: /Ver valor exato/ });
    const filters = result.container.querySelector('.f28-expense-filters') as HTMLElement;
    expect(result.container.querySelector('.f28-expense-comparison')).toHaveAttribute('data-compact', 'true');
    expect(filters).not.toHaveAttribute('open');
    expect(screen.getByRole('combobox', { name: 'Categoria' }).closest('details')).toBe(filters);
    expect(result.container.querySelector('.f28-expense-toolbar > select')).toBeNull();
    fireEvent.click(within(filters).getByText('Filtros'));
    fireEvent.change(within(filters).getByRole('combobox', { name: 'Categoria' }), { target: { value: 'none' } });
    fireEvent.change(within(filters).getByRole('combobox', { name: 'Comissão' }), { target: { value: 'c' } });
    fireEvent.change(within(filters).getByRole('combobox', { name: 'Situação' }), { target: { value: 'realizada' } });
    fireEvent.change(within(filters).getByLabelText('De'), { target: { value: '2028-01-01' } });
    await waitFor(() => expect(fetchExpenseComparison).toHaveBeenLastCalledWith('qa-org', edition.id, { date_field: 'planned_on', category_id: 'none', commission_id: 'c', status: 'realizada', from: '2028-01-01' }));
    expect(within(filters).getByLabelText('4 filtros ativos')).toBeInTheDocument();
    expect(within(result.container.querySelector('.f28-expense-scope') as HTMLElement).getByRole('status')).toHaveTextContent('Período por data prevista');
    fireEvent.click(screen.getByRole('button', { name: 'Remover filtro Sem categoria' }));
    await waitFor(() => expect(fetchExpenseComparison).toHaveBeenLastCalledWith('qa-org', edition.id, { date_field: 'planned_on', category_id: '', commission_id: 'c', status: 'realizada', from: '2028-01-01' }));
    expect(screen.getByRole('button', { name: 'Remover filtro Comissão' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover filtro De 01/01/2028' })).toBeInTheDocument();
  });
  it('explica o atalho de vencimento e mantém o recorte e as datas nas duas consultas', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-13T15:00:00Z'));
    vi.mocked(fetchExpenseComparison).mockResolvedValue({ ...comparison, totals: { ...comparison.totals, overdue_count: 2, overdue_cents: 30000 } });
    const result = mount('realizado');
    await screen.findByRole('button', { name: 'Ver despesas por vencimento' });
    (result.container.querySelector('.f28-expense-ledger-section') as HTMLElement).scrollIntoView = vi.fn();
    expect(screen.queryByText('A listagem por vencimento também inclui despesas quitadas.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sobre a consulta por vencimento' }));
    expect(await screen.findByText('A listagem por vencimento também inclui despesas quitadas.')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Ver despesas por vencimento' }));
    await waitFor(() => expect(fetchExpenseComparison).toHaveBeenLastCalledWith('qa-org', edition.id, { date_field: 'due_date', status: 'realizada', from: '', to: '2026-10-12' }));
    expect(listExpenses).toHaveBeenLastCalledWith('qa-org', edition.id, { date_field: 'due_date', status: 'realizada', from: '', to: '2026-10-12' }, 25, 0);
  });
  it('volta à última página válida se uma atualização reduzir o recorte', async () => {
    vi.mocked(listExpenses).mockResolvedValueOnce({ total: 30, limit: 25, offset: 0, items: [expense] })
      .mockResolvedValueOnce({ total: 1, limit: 25, offset: 25, items: [] })
      .mockResolvedValue({ total: 1, limit: 25, offset: 0, items: [expense] });
    mount(); await screen.findByRole('button', { name: 'Próxima' });
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await waitFor(() => expect(listExpenses).toHaveBeenCalledTimes(3));
    expect(listExpenses).toHaveBeenLastCalledWith('qa-org', edition.id, { date_field: 'planned_on' }, 25, 0);
    expect(fetchExpenseComparison).toHaveBeenCalledTimes(1);
  });
  it('oculta ações sem capacidade e impede realização sem confirmação', async () => {
    auth.edit = false; auth.confirm = false; auth.admin = false; mount();
    expect(screen.getByRole('button', { name: /Adicionar despesa projetada/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Adicionar despesa realizada/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Categorias' })).not.toBeInTheDocument();
    await screen.findAllByText(expense.title);
    expect(screen.queryByRole('button', { name: `Editar ${expense.title}` })).not.toBeInTheDocument();
    cleanup(); auth.edit = true; mount();
    expect(screen.getByRole('button', { name: /Adicionar despesa projetada/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Adicionar despesa realizada/ })).toBeDisabled();
  });
  it('distingue carregamento, erro, falta de permissão, base vazia, filtros vazios e zero verdadeiro', async () => {
    vi.mocked(fetchExpenseComparison).mockImplementation(() => new Promise(() => {})); mount();
    expect(metric('Total realizado')).toHaveTextContent('Carregando'); cleanup();
    vi.mocked(fetchExpenseComparison).mockRejectedValue(new FinancialExpenseError('forbidden', 'Sem acesso')); mount();
    await screen.findByText('Acesso financeiro indisponível'); expect(metric('Total realizado')).toHaveTextContent('Indisponível'); cleanup();
    vi.mocked(fetchExpenseComparison).mockResolvedValue({ ...comparison, totals: { ...comparison.totals, count: 0, committed_cents: 0 } });
    vi.mocked(listExpenses).mockResolvedValue({ total: 0, limit: 25, offset: 0, items: [] }); mount();
    await screen.findByText('Nenhuma despesa cadastrada'); expect(within(metric('Total realizado')).getByRole('button', { name: /0,00/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ausente' } }); fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText('Nenhuma despesa para estes filtros');
  });
  it('lê apenas preferência de despesas válida e limitada', () => {
    localStorage.setItem('financial-revenue-split-2028', '65'); expect(readExpenseSplit()).toBe(50);
    localStorage.setItem(EXPENSE_SPLIT_KEY, '61'); expect(readExpenseSplit()).toBe(61);
    localStorage.setItem(EXPENSE_SPLIT_KEY, '90'); expect(readExpenseSplit()).toBe(50);
  });
});
