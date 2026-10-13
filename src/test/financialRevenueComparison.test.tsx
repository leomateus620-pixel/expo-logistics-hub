import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Financial2028RevenueComparison } from '@/features/financial-management/operational/Financial2028RevenueComparison';
import { FinancialRevenueRanking } from '@/features/financial-management/operational/FinancialRevenueRanking';
import { fetchEditionSummary, fetchRevenues, saveFinancialRecord, type FinancialEditionSummary, type FinancialRevenue } from '@/features/financial-management/operational/financialOperationalApi';

vi.mock('@/hooks/useCurrentOrg', () => ({ useCurrentOrg: () => ({ orgId: 'qa-org' }) }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/features/financial-management/operational/financialOperationalApi', async original => ({
  ...await original<typeof import('@/features/financial-management/operational/financialOperationalApi')>(),
  fetchEditionSummary: vi.fn(), fetchRevenues: vi.fn(), saveFinancialRecord: vi.fn(),
}));
const edition = { id: 'qa-e', org_id: 'qa-org', code: 2028, label: 'Fenasoja 2028', status: 'operacional' as const, period_start: '2027-01-01', period_end: '2028-12-31' };
const revenue: FinancialRevenue = { id: 'qa-r', description: 'Comercialização no título não define a categoria', counterparty: 'Contraparte', responsible_name: null, funding_type: 'recurso_livre', status: 'confirmada', projected_cents: 120000, confirmed_cents: 90000, competence_date: null, due_date: null, notes: null, version: 8 };
const summary: FinancialEditionSummary = { budget: { count: 0, cap_cents: 0, uncapped_count: 0, planned_cents: 0, line_count: 0 }, revenues: { projected_cents: 800000, confirmed_cents: 500000, received_cents: 12345, receivable_open_cents: 487655, overdue_count: 0 }, revenue: { count: 700, projected_cents: 700000, confirmed_cents: 400000 }, sponsorship: { count: 20, declared_cents: 100000, projected_cents: 100000, confirmed_cents: 100000, in_kind_cents: 5000000 }, obligations: { received_cents: 12345, paid_cents: 0, receivable_open_cents: 487655, payable_open_cents: 0, overdue_count: 0 }, movements: { count: 2, inflow_cents: 12345, outflow_cents: 0 } };
const panel = (side: 'projetado' | 'realizado') => document.querySelector(`[data-revenue-panel="${side}"]`) as HTMLElement;
const metric = (name: string) => screen.getByRole('heading', { name }).closest('article') as HTMLElement;
function mount(focus: 'projetado' | 'realizado' = 'projetado') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(<QueryClientProvider client={client}><Financial2028RevenueComparison edition={edition} focus={focus} /></QueryClientProvider>);
  return { ...result, client };
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  vi.mocked(fetchEditionSummary).mockResolvedValue(structuredClone(summary));
  vi.mocked(fetchRevenues).mockResolvedValue([revenue]);
  vi.mocked(saveFinancialRecord).mockResolvedValue({ id: 'qa-save', version: 1 });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', { configurable: true, value: () => false });
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { configurable: true, value: vi.fn() });
});
afterEach(cleanup);

describe('comparação das receitas de 2028', () => {
  it('usa consolidação canônica e recebimento, sem somar novamente lista, patrocínio ou confirmação', async () => {
    mount();
    await within(metric('Total realizado')).findByRole('button', { name: /123,45/ });
    expect(within(metric('Total projetado')).getByRole('button', { name: /8\.000,00/ })).toBeInTheDocument();
    expect(metric('Total realizado')).not.toHaveTextContent('5.000,00');
    expect(metric('Comercialização projetada')).toHaveTextContent('Não disponível');
    expect(metric('Comercialização realizada')).toHaveTextContent('Não disponível');
    expect(metric('Rouanet realizado')).toHaveTextContent('Não disponível');
    expect(within(panel('realizado')).getByText('Compromissos confirmados')).toBeInTheDocument();
    expect(within(panel('realizado')).getByText(/não somar ao recebido/)).toBeInTheDocument();
    expect(fetchRevenues).toHaveBeenCalledTimes(1); expect(fetchEditionSummary).toHaveBeenCalledTimes(1);
  });
  it('mantém a compatibilidade existente apenas com agregações do servidor', async () => {
    const compatibility = structuredClone(summary); delete compatibility.revenues;
    vi.mocked(fetchEditionSummary).mockResolvedValue(compatibility);
    mount('realizado');
    await within(metric('Total realizado')).findByRole('button', { name: /123,45/ });
    expect(within(metric('Total projetado')).getByRole('button', { name: /8\.000,00/ })).toBeInTheDocument();
    expect(document.querySelector('.f28-revenue-comparison')).toHaveAttribute('data-active-side', 'realizado');
    expect(screen.getByText(/Entrada de compromissos confirmados/)).toBeInTheDocument();
  });
  it('separa recorte manual de Rouanet e ranking da edição completa e exclui canceladas', async () => {
    vi.mocked(fetchRevenues).mockResolvedValue([revenue, { ...revenue, id: 'qa-rouanet', funding_type: 'lei_rouanet', projected_cents: 30000 }, { ...revenue, id: 'qa-misto', funding_type: 'misto', projected_cents: 50000 }, { ...revenue, id: 'qa-cancel', funding_type: 'lei_rouanet', status: 'cancelada', projected_cents: 9000000 }]);
    const result = mount();
    await within(metric('Rouanet projetado')).findByRole('button', { name: /300,00/ });
    expect(metric('Rouanet projetado')).toHaveTextContent('recorte carregado');
    expect(within(metric('Total projetado')).getByRole('button', { name: /8\.000,00/ })).toBeInTheDocument();
    const ranking = result.container.querySelector('.f28-revenue-ranking')!;
    const rows = [...ranking.querySelectorAll('li')];
    expect(rows.map(row => row.getAttribute('data-category'))).toEqual(['recurso_livre', 'misto', 'lei_rouanet', 'nao_identificado', 'prefeitura_plano_trabalho']);
    expect(rows[0]).toHaveTextContent('60%'); expect(rows[1]).toHaveTextContent('25%'); expect(rows[2]).toHaveTextContent('15%');
    expect(rows[3].querySelector('.f28-revenue-ranking__track > span')).toHaveStyle({ width: '0%' });
  });
  it('preserva filtros independentes e os dois painéis ao alternar contexto', async () => {
    const user = userEvent.setup(); const result = mount();
    await within(panel('projetado')).findAllByText(revenue.description);
    const projected = panel('projetado'); const received = panel('realizado');
    fireEvent.change(within(projected).getByRole('searchbox', { name: 'Pesquisar' }), { target: { value: 'sem correspondência' } });
    expect(within(projected).getByRole('searchbox')).toHaveValue('sem correspondência');
    fireEvent.change(within(received).getByRole('searchbox', { name: 'Pesquisar' }), { target: { value: 'Contraparte' } });
    expect(within(received).getByRole('searchbox')).toHaveValue('Contraparte');
    await user.click(screen.getByRole('tab', { name: 'Realizado' }));
    expect(panel('projetado')).toBe(projected); expect(panel('realizado')).toBe(received);
    expect(within(projected).getByRole('searchbox')).toHaveValue('sem correspondência');
    expect(within(received).getByRole('searchbox')).toHaveValue('Contraparte');
    result.rerender(<QueryClientProvider client={result.client}><Financial2028RevenueComparison edition={edition} focus="realizado" /></QueryClientProvider>);
    expect(within(projected).getByRole('searchbox')).toHaveValue('sem correspondência');
    expect(fetchRevenues).toHaveBeenCalledTimes(1); expect(fetchEditionSummary).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Realizado' }), { key: 'Home' });
    expect(document.querySelector('.f28-revenue-comparison')).toHaveAttribute('data-active-side', 'projetado');
  });
  it('mantém carregamento e falha distintos de zero verdadeiro', async () => {
    let finish!: (value: FinancialEditionSummary) => void;
    vi.mocked(fetchEditionSummary).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    mount(); await screen.findAllByText(revenue.description);
    expect(metric('Total realizado')).toHaveTextContent('Carregando…');
    expect(within(metric('Total realizado')).queryByRole('button')).not.toBeInTheDocument();
    finish({ ...summary, revenues: { ...summary.revenues!, received_cents: 0 } });
    await within(metric('Total realizado')).findByRole('button', { name: /0,00/ });
    cleanup(); vi.mocked(fetchEditionSummary).mockRejectedValue(new Error('Falha da fonte de recebimento'));
    mount(); await waitFor(() => expect(metric('Total realizado')).toHaveTextContent('Indisponível'));
    expect(within(metric('Total realizado')).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os valores');
  });
  it('declara o limite de 500 registros sem usá-lo como total integral', async () => {
    vi.mocked(fetchRevenues).mockResolvedValue(Array.from({ length: 500 }, (_, i) => ({ ...revenue, id: `qa-${i}` })));
    mount(); await within(metric('Total projetado')).findByRole('button', { name: /8\.000,00/ });
    expect(within(panel('projetado')).getByText('Recorte carregado · 500 registros · limite de 500')).toBeInTheDocument();
    expect(metric('Total projetado')).not.toHaveTextContent('600.000');
  });
  it('abre o cadastro existente pela ação realizada sem oferecer operação de recebimento', async () => {
    const user = userEvent.setup(); mount('realizado');
    await user.click(screen.getByRole('button', { name: /Registrar receita/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText(/^Descrição/)).toBeInTheDocument();
    expect(within(panel('realizado')).getByText(/não registra recebimento/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(saveFinancialRecord).not.toHaveBeenCalled();
  });
});

describe('ranking monetário assinado', () => {
  it('usa a mesma escala para valores iguais, percentuais próprios e zero sem preenchimento', async () => {
    const items = [{ key: 'livre', label: 'Origem com nome longo para leitura', value: 10000 }, { key: 'zero', label: 'Origem zero', value: 0 }, { key: 'negativo', label: 'Ajuste negativo', value: -5000 }];
    const result = render(<><section aria-label="Projetado teste"><FinancialRevenueRanking items={items} total={20000} scale={{ negative: -5000, positive: 15000 }} /></section><section aria-label="Recebido teste"><FinancialRevenueRanking items={items} total={40000} scale={{ negative: -5000, positive: 15000 }} /></section></>);
    const rankings = result.container.querySelectorAll('.f28-revenue-ranking');
    const first = rankings[0].querySelectorAll('li'); const second = rankings[1].querySelectorAll('li');
    expect(first[0].querySelector('.f28-revenue-ranking__track > span')).toHaveStyle({ width: '50%', left: '25%' });
    expect(second[0].querySelector('.f28-revenue-ranking__track > span')).toHaveStyle({ width: '50%', left: '25%' });
    expect(first[0]).toHaveTextContent('50%'); expect(second[0]).toHaveTextContent('25%');
    expect(first[1].querySelector('.f28-revenue-ranking__track > span')).toHaveStyle({ width: '0%' });
    expect(first[2]).toHaveAttribute('data-negative', 'true'); expect(first[2]).toHaveTextContent('-25%');
    expect(first[2].querySelector('.f28-revenue-ranking__track > span')).toHaveStyle({ width: '25%', left: '0%' });
    const user = userEvent.setup(); await user.click(within(screen.getByRole('region', { name: 'Projetado teste' })).getByRole('button', { name: /Origem com nome longo.*100,00/ }));
    expect(screen.getByText('R$ 100,00', { selector: '.f28-revenue-value-popover span' })).toBeInTheDocument();
  });
});
