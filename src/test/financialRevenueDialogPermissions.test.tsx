import {fetchPaymentPlan,saveFinancialBatch} from '@/features/financial-management/operational/financialEntryApi';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RevenueDialog } from '@/features/financial-management/operational/Financial2028Forms';
import { saveFinancialRecord, type FinancialEdition, type FinancialRevenue } from '@/features/financial-management/operational/financialOperationalApi';
import type { FinancialExpenseCapabilities } from '@/features/financial-management/operational/useFinancialExpenseCapabilities';

vi.mock('@/hooks/useCurrentOrg', () => ({ useCurrentOrg: () => ({ orgId: 'qa-org' }) }));
vi.mock('@/features/financial-management/operational/financialEntryApi',async original=>({...await original<typeof import('@/features/financial-management/operational/financialEntryApi')>(),fetchPaymentPlan:vi.fn().mockResolvedValue(null),listFinancialReferences:vi.fn().mockResolvedValue([]),saveFinancialBatch:vi.fn()}));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/features/financial-management/operational/financialOperationalApi', async original => ({
  ...await original<typeof import('@/features/financial-management/operational/financialOperationalApi')>(), saveFinancialRecord: vi.fn(),
}));

const edition: FinancialEdition = { id: 'qa-edition', org_id: 'qa-org', code: 2028, label: 'Fenasoja 2028', status: 'operacional', period_start: '2028-01-01', period_end: '2028-12-31' };
const capabilities: FinancialExpenseCapabilities = { canAccess: true, canEdit: true, canConfirm: true, canAdmin: true, isLoading: false, isError: false };
const revenue: FinancialRevenue = { id: 'qa-revenue', description: 'Receita confirmada de teste', counterparty: 'Contraparte de teste', responsible_name: null, funding_type: 'recurso_livre', status: 'confirmada', projected_cents: 100000, confirmed_cents: 90000, competence_date: null, due_date: '2028-05-01', notes: null, version: 8 };

function mount({ permission = capabilities, value = null, selectedEdition = edition }: { permission?: FinancialExpenseCapabilities; value?: FinancialRevenue | null; selectedEdition?: FinancialEdition } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const close = vi.fn();
  const view = (next: FinancialExpenseCapabilities) => <QueryClientProvider client={client}><RevenueDialog edition={selectedEdition} revenue={value} capabilities={next} onClose={close} /></QueryClientProvider>;
  return { ...render(view(permission)), close, view };
}

async function expectBlocked() {
  await screen.findByLabelText(/^Descrição/);
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('button', { name: 'Salvar receita' })).toBeDisabled();
  expect(within(dialog).getByLabelText(/^Descrição/)).toBeDisabled();
  expect(within(dialog).getByRole('combobox', { name: 'Situação' })).toBeDisabled();
  // The submit handler must also reject a synthetic event, beyond disabling the button.
  fireEvent.submit(dialog.querySelector('form')!);
  expect(saveFinancialRecord).not.toHaveBeenCalled();expect(saveFinancialBatch).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();vi.mocked(saveFinancialBatch).mockResolvedValue({count:1,items:[{draft_id:'qa-draft',record:{id:'qa-saved'}}]});
  vi.mocked(saveFinancialRecord).mockResolvedValue({ id: 'qa-saved', version: 1 });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', { configurable: true, value: () => false });
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { configurable: true, value: vi.fn() });
});
afterEach(cleanup);

describe('permissões do cadastro de receitas 2028', () => {
  it('permite projetada ao editor e não oferece confirmação sem financial_confirm', async () => {
    const user = userEvent.setup();
    const { close } = mount({ permission: { ...capabilities, canConfirm: false } });
    await user.click(screen.getByRole('combobox', { name: 'Situação' }));
    expect(screen.getByRole('option', { name: 'Projetada' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Cancelada' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Confirmada' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox',{name:'Situação'}),{target:{value:'projetada'}});
    await user.type(screen.getByLabelText(/^Descrição/), 'Nova projeção de teste');
    await user.type(screen.getByLabelText(/^Valor projetado/), '123,45');
    fireEvent.change(screen.getByLabelText(/^Vencimento$/),{target:{value:'2028-05-01'}});
    expect(screen.queryByLabelText(/^Valor confirmado/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar receita' }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(vi.mocked(saveFinancialBatch).mock.calls[0][3][0]).toMatchObject({expected_version:null,payload:{edition_id:edition.id,status:'projetada',projected_cents:12345,confirmed_cents:null}});
  });

  it('bloqueia o compromisso existente sem financial_confirm, inclusive envio direto', async () => {
    mount({ value: revenue, permission: { ...capabilities, canConfirm: false } });
    await expectBlocked();
    expect(screen.getByLabelText(/^Valor confirmado/)).toBeDisabled();
    expect(screen.getByText('Editar uma receita confirmada exige confirmação financeira.')).toHaveAttribute('role','status');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
  });

  it.each([
    { state: 'carregando', isLoading: true, isError: false, message: 'Verificando permissões…', role: 'status' },
    { state: 'erro', isLoading: false, isError: true, message: 'Não foi possível verificar suas permissões.', role: 'alert' },
  ])('bloqueia formulário com permissão em $state, mesmo com capacidades anteriores verdadeiras', async ({ isLoading, isError, message, role }) => {
    mount({ value: revenue, permission: { ...capabilities, isLoading, isError } });
    await expectBlocked();
    expect(screen.getByText(message)).toHaveAttribute('role',role);
  });

  it('edição histórica permanece somente leitura mesmo com todas as capacidades', async () => {
    mount({ value: revenue, selectedEdition: { ...edition, code: 2026, status: 'historico' } });
    await expectBlocked();
    expect(screen.getByLabelText(/^Valor projetado/)).toHaveValue('1.000,00');
    expect(screen.getByLabelText(/^Valor confirmado/)).toHaveValue('900,00');
  });

  it('exige acesso financeiro além das capacidades de edição e confirmação', async () => {
    mount({ value: revenue, permission: { ...capabilities, canAccess: false } });
    await expectBlocked();
  });

  it('revogação de capacidade com formulário aberto preserva o rascunho e impede o envio', async () => {
    const user = userEvent.setup();
    const result = mount();
    await user.type(screen.getByLabelText(/^Descrição/), 'Rascunho preservado');
    result.rerender(result.view({ ...capabilities, canEdit: false }));
    expect(screen.getByLabelText(/^Descrição/)).toHaveValue('Rascunho preservado');
    await expectBlocked();
  });
});
