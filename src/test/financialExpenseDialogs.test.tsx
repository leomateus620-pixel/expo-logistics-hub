import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {saveFinancialBatch,FinancialEntryError} from '@/features/financial-management/operational/financialEntryApi';
import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoriesDialog, ExpenseDetailDialog, ExpenseFormDialog, TransitionDialog } from '@/features/financial-management/operational/FinancialExpenseDialogs';
import { canTransitionExpense } from '@/features/financial-management/operational/financialExpenseActions';
import { FinancialExpenseError, type ExpenseCategory, type FinancialExpense } from '@/features/financial-management/operational/financialExpensesApi';
import type { FinancialEdition } from '@/features/financial-management/operational/financialOperationalApi';
import type { FinancialExpenseCapabilities } from '@/features/financial-management/operational/useFinancialExpenseCapabilities';

const render=(ui:React.ReactNode)=>rtlRender(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}>{ui}</QueryClientProvider>);
vi.mock('@/hooks/useCurrentOrg',()=>({useCurrentOrg:()=>({orgId:'org'})}));
vi.mock('@/features/financial-management/operational/useFinancialExpenseCapabilities',()=>({useFinancialExpenseCapabilities:()=>({canAccess:true,canEdit:false,canConfirm:false,canAdmin:false,canSettle:false,isLoading:false,isError:false})}));
vi.mock('@/features/financial-management/operational/financialEntryApi',async original=>({...await original<typeof import('@/features/financial-management/operational/financialEntryApi')>(),fetchPaymentPlan:vi.fn().mockResolvedValue(null),listFinancialReferences:vi.fn().mockResolvedValue([]),saveFinancialBatch:vi.fn()}));
const mocked = vi.hoisted(() => ({
  save: vi.fn(), transition: vi.fn(), categorySave: vi.fn(), seed: vi.fn(),
  categories: [] as unknown[], categoryLoading: false, categoryError: false, detail: null as unknown,
}));
vi.mock('@/features/financial-management/operational/useFinancialExpenses', () => ({
  useSaveExpense: () => ({ mutateAsync: mocked.save, isPending: false }),
  useTransitionExpense: () => ({ mutateAsync: mocked.transition, isPending: false }),
  useSaveExpenseCategory: () => ({ mutateAsync: mocked.categorySave, isPending: false }),
  useSeedExpenseCategories: () => ({ mutateAsync: mocked.seed, isPending: false }),
  useExpenseCategories: () => ({ data: mocked.categories, isLoading: mocked.categoryLoading, isError: mocked.categoryError, refetch: vi.fn() }),
  useExpenseDetail: () => ({ data: mocked.detail, isLoading: false, isError: false, refetch: vi.fn() }),
}));

const capabilities: FinancialExpenseCapabilities = { canAccess: true, canEdit: true, canConfirm: true, canAdmin: true, isLoading: false, isError: false };
const edition: FinancialEdition = { id: 'edition', org_id: 'org', code: 2028, label: '2028', status: 'operacional', period_start: '2028-01-01', period_end: '2028-12-31' };
const category: ExpenseCategory = { id: 'category', parent_id: null, name: 'Serviços', active: true, sort_order: 1, icon: null, color: null, version: 4, usage_count: 2 };
const expense: FinancialExpense = {
  id: 'expense', edition_id: 'edition', title: 'Locação de equipamentos', description: null,
  category_id: 'category', category_name: 'Serviços', commission_id: null, commission_name: null, budget_line_id: null, payee_name: null,
  planned_cents: 100000, planned_on: '2028-05-01', committed_cents: 120000, committed_on: '2028-05-02', due_date: '2028-05-10',
  status: 'realizada', notes: null, cancel_reason: null, version: 7, created_at: '', updated_at: '',
  obligation_id: 'obligation', paid_cents: 0, open_cents: 120000, settlement_inconsistent: false,
};

beforeEach(() => {
  vi.mocked(saveFinancialBatch).mockReset().mockResolvedValue({count:1,items:[{draft_id:'qa-draft',record:{id:'expense'}}]});
  mocked.save.mockReset().mockResolvedValue(expense);
  mocked.transition.mockReset().mockResolvedValue(expense);
  mocked.categorySave.mockReset().mockResolvedValue(category);
  mocked.seed.mockReset().mockResolvedValue({ created: 12 });
  mocked.categories = [category];
  mocked.categoryLoading = false;
  mocked.categoryError = false;
  mocked.detail = null;
  let next = 0;
  vi.stubGlobal('crypto', { randomUUID: () => `request-${++next}` });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('formulários de despesas 2028', () => {
  it('associa o erro ao campo obrigatório, move o foco e limpa o erro ao corrigir', async () => {
    const user = userEvent.setup();
    render(<ExpenseFormDialog org="org" edition={edition} value="new-prevista" onClose={vi.fn()} categories={[]} commissions={[]} capabilities={capabilities} />);
    const title = screen.getByLabelText(/Descrição da despesa/);
    const projected = screen.getByLabelText(/Valor projetado/);
    await user.click(screen.getByRole('button', { name: 'Salvar despesa' }));
    const titleError = await screen.findByRole('alert');
    expect(titleError).toHaveTextContent('Informe uma descrição com 2 a 240 caracteres.');
    expect(document.getElementById(title.getAttribute('aria-describedby')!)).toBe(titleError);
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title).toHaveAttribute('aria-describedby', titleError.id);
    expect(title).toHaveFocus();
    expect(mocked.save).not.toHaveBeenCalled();
    await user.type(title, 'Locação planejada');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(title).not.toHaveAttribute('aria-invalid');
    expect(title).not.toHaveAttribute('aria-describedby');

    await user.click(screen.getByRole('button', { name: 'Salvar despesa' }));
    const amountError = await screen.findByRole('alert');
    expect(amountError).toHaveTextContent('Informe o valor projetado maior que zero.');
    expect(document.getElementById(projected.getAttribute('aria-describedby')!)).toBe(amountError);
    expect(projected).toHaveAttribute('aria-describedby', amountError.id);
    expect(projected).toHaveFocus();
    expect(mocked.save).not.toHaveBeenCalled();
    await user.type(projected, '500,00');
    fireEvent.change(screen.getByLabelText(/^Vencimento$/),{target:{value:'2028-05-10'}});
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(projected).not.toHaveAttribute('aria-invalid');
    await user.click(screen.getByRole('button', { name: 'Salvar despesa' }));
    expect(saveFinancialBatch).toHaveBeenCalledOnce();
    expect(vi.mocked(saveFinancialBatch).mock.calls[0][3][0].payload).toMatchObject({ title: 'Locação planejada', status: 'prevista', planned_cents: 50000 });
  });

  it('retry de realizada direta preserva chave, centavos e ausência de previsão', async () => {
    const user = userEvent.setup();
    vi.mocked(saveFinancialBatch).mockRejectedValueOnce(new FinancialEntryError('Falha de conexão.',undefined,true));
    const close = vi.fn();
    render(<ExpenseFormDialog org="org" edition={edition} value="new-realizada" onClose={close} categories={[category]} commissions={[]} capabilities={capabilities} />);
    await user.type(screen.getByLabelText(/Descrição da despesa/), 'Compra direta');
    await user.type(screen.getByLabelText(/Valor realizado/), '1.234,56');
    fireEvent.change(screen.getByLabelText(/Competência/), { target: { value: '2028-05-02' } });
    fireEvent.change(screen.getByLabelText(/^Vencimento$/),{target:{value:'2028-05-10'}});
    await user.click(screen.getByRole('button', { name: 'Salvar despesa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha de conexão');
    expect(close).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Verificar e repetir tentativa' }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(saveFinancialBatch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(saveFinancialBatch).mock.calls[0]).toEqual(vi.mocked(saveFinancialBatch).mock.calls[1]);
    expect(vi.mocked(saveFinancialBatch).mock.calls[0][3][0]).toMatchObject({ expected_version: null, payload: { status: 'realizada', planned_cents: null, committed_cents: 123456 } });
  });

  it('edit sem confirmação preserva os campos realizados e o vínculo arquivado', async () => {
    const user = userEvent.setup();
    render(<ExpenseFormDialog org="org" edition={edition} value={expense} onClose={vi.fn()} categories={[{ ...category, active: false }, { ...category, id: 'other', name: 'Outra arquivada', active: false }]} commissions={[]} capabilities={{ ...capabilities, canConfirm: false }} />);
    await screen.findByLabelText(/Valor realizado/);
    expect(screen.getByLabelText(/Valor realizado/)).toBeDisabled();
    expect(screen.getByLabelText(/Competência/)).toBeDisabled();
    expect(screen.getByRole('combobox', {name:'Categoria'})).toHaveValue('Serviços');
    expect(screen.queryByRole('option', { name: /Outra arquivada/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar despesa' }));
    await waitFor(()=>expect(saveFinancialBatch).toHaveBeenCalledOnce());
    expect(vi.mocked(saveFinancialBatch).mock.calls[0][3][0]).toMatchObject({ expected_version: 7, payload: { id: expense.id, planned_cents: 100000, category_id: 'category' } });
    expect(vi.mocked(saveFinancialBatch).mock.calls[0][3][0].payload).not.toHaveProperty('committed_cents');
    expect(vi.mocked(saveFinancialBatch).mock.calls[0][3][0].payload).not.toHaveProperty('committed_on');
  });

  it('não envia compromisso menor que pago nem permite transição paga', async () => {
    const user = userEvent.setup();
    render(<ExpenseFormDialog org="org" edition={edition} value={{ ...expense, paid_cents: 50000 }} onClose={vi.fn()} categories={[]} commissions={[]} capabilities={capabilities} />);
    await screen.findByLabelText(/Valor realizado/);
    await user.clear(screen.getByLabelText(/Valor realizado/));
    await user.type(screen.getByLabelText(/Valor realizado/), '400,00');
    await user.click(screen.getByRole('button', { name: 'Salvar despesa' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('abaixo do que já foi pago');
    expect(mocked.save).not.toHaveBeenCalled();
    cleanup();
    render(<TransitionDialog org="org" expense={{ ...expense, paid_cents: 50000 }} to="cancelada" onClose={vi.fn()} capabilities={capabilities} />);
    expect(await screen.findByRole('button', { name: 'Cancelar despesa' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Há pagamentos registrados');
    expect(mocked.transition).not.toHaveBeenCalled();
  });

  it('edição histórica e perfil de consulta não habilitam gravação', () => {
    render(<ExpenseFormDialog org="org" edition={{ ...edition, status: 'historico' }} value="new-prevista" onClose={vi.fn()} categories={[]} commissions={[]} capabilities={capabilities} />);
    expect(screen.getByRole('button', { name: 'Salvar despesa' })).toBeDisabled();
    cleanup();
    render(<ExpenseFormDialog org="org" edition={edition} value="new-prevista" onClose={vi.fn()} categories={[]} commissions={[]} capabilities={{ ...capabilities, canEdit: false }} />);
    expect(screen.getByRole('button', { name: 'Salvar despesa' })).toBeDisabled();
    expect(canTransitionExpense(expense, 'prevista', { ...capabilities, canEdit: false })).toBe(false);
    expect(canTransitionExpense(expense, 'prevista', { ...capabilities, canConfirm: false })).toBe(false);
  });
});

describe('categorias com versionamento e idempotência', () => {
  it('devolve o foco ao botão que abriu as categorias após fechar ou usar Escape', async () => {
    function CategoriesHarness() {
      const [open, setOpen] = useState(false);
      return <><button type="button" onClick={() => setOpen(true)}>Abrir categorias</button>{open && <CategoriesDialog org="org" onClose={() => setOpen(false)} capabilities={capabilities} />}</>;
    }
    const user = userEvent.setup();
    render(<CategoriesHarness />);
    const trigger = screen.getByRole('button', { name: 'Abrir categorias' });
    await user.click(trigger);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.click(within(dialog.querySelector('.f28-expense-dialog-footer') as HTMLElement).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(mocked.categorySave).not.toHaveBeenCalled();
  });

  it('renomeia em formulário integrado e mantém a chave após falha de rede', async () => {
    const user = userEvent.setup();
    mocked.categorySave.mockRejectedValueOnce(new FinancialExpenseError('network', 'Falha de conexão.'));
    render(<CategoriesDialog org="org" onClose={vi.fn()} capabilities={capabilities} />);
    await user.click(screen.getByRole('button', { name: 'Renomear Serviços' }));
    const name = screen.getByLabelText('Novo nome de Serviços');
    await user.clear(name);
    await user.type(name, 'Serviços especiais');
    await user.click(screen.getByRole('button', { name: 'Salvar nome' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha de conexão');
    await user.click(screen.getByRole('button', { name: 'Salvar nome' }));
    await screen.findByText('Categoria renomeada. Os vínculos foram preservados.');
    expect(mocked.categorySave.mock.calls[0][0]).toEqual(mocked.categorySave.mock.calls[1][0]);
    expect(mocked.categorySave.mock.calls[0][0]).toMatchObject({ expectedVersion: 4, payload: { id: 'category', name: 'Serviços especiais' } });
  });

  it('retry de arquivamento usa a mesma ação e versão', async () => {
    const user = userEvent.setup();
    mocked.categorySave.mockRejectedValueOnce(new FinancialExpenseError('network', 'Falha de conexão.'));
    render(<CategoriesDialog org="org" onClose={vi.fn()} capabilities={capabilities} />);
    await user.click(screen.getByRole('button', { name: 'Arquivar Serviços' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Arquivar Serviços' }));
    await screen.findByText('Categoria arquivada. Os vínculos foram preservados.');
    expect(mocked.categorySave.mock.calls[0][0]).toEqual(mocked.categorySave.mock.calls[1][0]);
    expect(mocked.categorySave.mock.calls[0][0]).toMatchObject({ expectedVersion: 4, payload: { id: 'category', active: false } });
  });

  it('sugestões só são carregadas por ação explícita e retry mantém chave', async () => {
    const user = userEvent.setup();
    mocked.categories = [];
    mocked.seed.mockRejectedValueOnce(new FinancialExpenseError('network', 'Falha de conexão.'));
    render(<CategoriesDialog org="org" onClose={vi.fn()} capabilities={capabilities} />);
    expect(mocked.seed).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Usar nomes de 2026 como sugestão' }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Usar nomes de 2026 como sugestão' }));
    await screen.findByText('12 sugestões adicionadas.');
    expect(mocked.seed.mock.calls[0][0]).toBe(mocked.seed.mock.calls[1][0]);
  });

  it('carregamento não é apresentado como ausência de categorias', () => {
    mocked.categories = [];
    mocked.categoryLoading = true;
    render(<CategoriesDialog org="org" onClose={vi.fn()} capabilities={capabilities} />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando categorias');
    expect(screen.queryByText('Nenhuma categoria cadastrada.')).not.toBeInTheDocument();
  });
});

describe('consulta de pagamento, saldo e histórico', () => {
  it('mostra alocações assinadas sem duplicar sinal de estorno e preserva acesso de consulta', () => {
    mocked.detail = {
      expense: { ...expense, paid_cents: 20000, open_cents: 100000 }, obligation: { id: 'obligation', amount_cents: 120000, status: 'aberta', due_date: '2028-05-10' },
      movements: [{ id: 'paid', kind: 'pagamento', occurred_on: '2028-05-02', allocated_cents: 32300, reverses_movement_id: null }, { id: 'reversed', kind: 'estorno', occurred_on: '2028-05-03', allocated_cents: -12300, reverses_movement_id: 'paid' }],
      history: [{ id: 'history', action: 'status_realizada', created_at: '2028-05-02T15:00:00Z', reason: 'Contrato confirmado' }],
    };
    render(<ExpenseDetailDialog org="org" expenseId="expense" onClose={vi.fn()} onEdit={vi.fn()} onTransition={vi.fn()} capabilities={{ ...capabilities, canEdit: false, canConfirm: false }} />);
    expect(screen.getByText('Saldo a pagar').parentElement).toHaveTextContent(/R\$\s*1\.000,00/);
    const reversal = screen.getByText('Estorno de pagamento').closest('li')!;
    expect(within(reversal).getByText(/-R\$\s*123,00/)).toBeInTheDocument();
    expect(reversal).not.toHaveTextContent('− -');
    expect(screen.getByText('Contrato confirmado')).toBeInTheDocument();
    expect(screen.getByText('10/05/2028')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar despesa' })).not.toBeInTheDocument();
  });
});
