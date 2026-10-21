import { saveFinancialBatch, FinancialEntryError } from '@/features/financial-management/operational/financialEntryApi';

vi.mock('@/features/financial-management/operational/financialEntryApi', async original => ({...await original<typeof import('@/features/financial-management/operational/financialEntryApi')>(), fetchPaymentPlan:vi.fn().mockResolvedValue(null),listFinancialReferences:vi.fn().mockResolvedValue([]),fetchFinancialSchedule:vi.fn().mockResolvedValue({months:[],unscheduled_sources:0}),saveFinancialBatch:vi.fn()}));
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Financial2028RevenueComparison } from '@/features/financial-management/operational/Financial2028RevenueComparison';
import { FinancialRevenueRanking } from '@/features/financial-management/operational/FinancialRevenueRanking';
import { FUNDING_TYPE_LABELS, fetchEditionSummary, fetchRevenueOverview, saveFinancialRecord, type FinancialEditionSummary, type FinancialRevenue } from '@/features/financial-management/operational/financialOperationalApi';

vi.mock('@/hooks/useCurrentOrg', () => ({ useCurrentOrg: () => ({ orgId: 'qa-org' }) }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));
const permissions = vi.hoisted(() => ({ canAccess: true, canEdit: true, canConfirm: true, canAdmin: true, isLoading: false, isError: false }));
vi.mock('@/features/financial-management/operational/useFinancialExpenseCapabilities', () => ({ useFinancialExpenseCapabilities: () => ({ ...permissions, refetch: vi.fn() }) }));
vi.mock('@/features/financial-management/operational/financialOperationalApi', async original => ({
  ...await original<typeof import('@/features/financial-management/operational/financialOperationalApi')>(),
  fetchEditionSummary: vi.fn(), fetchRevenueOverview: vi.fn(), saveFinancialRecord: vi.fn(),
}));

function overview(items: import('@/features/financial-management/operational/financialOperationalApi').FinancialRevenue[]) {
 return {items,total:items.length,by_source:Object.keys(FUNDING_TYPE_LABELS).map(key=>({key,name:null,funding_type:key as keyof typeof FUNDING_TYPE_LABELS,count:items.filter(r=>r.funding_type===key&&r.status!=='cancelada').length,projected_cents:items.filter(r=>r.funding_type===key&&r.status!=='cancelada').reduce((s,r)=>s+r.projected_cents,0),confirmed_cents:0}))};
}

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
  vi.clearAllMocks();vi.mocked(saveFinancialBatch).mockResolvedValue({count:1,items:[{draft_id:'qa-draft',record:{id:'qa-saved'}}]}); localStorage.clear();
  Object.assign(permissions, { canAccess: true, canEdit: true, canConfirm: true, canAdmin: true, isLoading: false, isError: false });
  vi.mocked(fetchEditionSummary).mockResolvedValue(structuredClone(summary));
  vi.mocked(fetchRevenueOverview).mockResolvedValue(overview([revenue]));
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
    await within(metric('Recebido líquido')).findByRole('button', { name: /123,45/ });
    expect(within(metric('Total projetado')).getByRole('button', { name: /8\.000,00/ })).toBeInTheDocument();
    expect(metric('Recebido líquido')).not.toHaveTextContent('5.000,00');
    expect(within(metric('Receitas manuais')).getByRole('button', { name: /7\.000,00/ })).toBeInTheDocument();
    expect(within(metric('Patrocínios')).getByRole('button', { name: /1\.000,00/ })).toBeInTheDocument();
    expect(within(metric('Confirmado')).getByRole('button', { name: /5\.000,00/ })).toBeInTheDocument();
    expect(within(metric('Saldo a receber')).getByRole('button', { name: /4\.876,55/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Comercialização projetada' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Rouanet realizado' })).not.toBeInTheDocument();
    expect(screen.queryByText('Cobertura financeira')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ajuda sobre fontes e comparação de receitas' }));
    expect(screen.getByText('Cobertura financeira')).toBeInTheDocument();
    expect(document.querySelectorAll('.f28-revenue-records')).toHaveLength(1);
    expect(fetchRevenueOverview).toHaveBeenCalledTimes(1); expect(fetchEditionSummary).toHaveBeenCalledTimes(1);
  });
  it('mantém a compatibilidade existente apenas com agregações do servidor', async () => {
    const compatibility = structuredClone(summary); delete compatibility.revenues;
    vi.mocked(fetchEditionSummary).mockResolvedValue(compatibility);
    mount('realizado');
    await within(metric('Recebido líquido')).findByRole('button', { name: /123,45/ });
    expect(within(metric('Total projetado')).getByRole('button', { name: /8\.000,00/ })).toBeInTheDocument();
    expect(document.querySelector('.f28-revenue-comparison')).toHaveAttribute('data-active-side', 'realizado');
    expect(screen.getByRole('combobox', { name: 'Situação' })).toHaveValue('confirmada');
    expect(within(metric('Saldo a receber')).getByRole('button', { name: /4\.876,55/ })).toBeInTheDocument();
  });
  it('separa recorte manual de Rouanet e ranking da edição completa e exclui canceladas', async () => {
    vi.mocked(fetchRevenueOverview).mockResolvedValue(overview([revenue, { ...revenue, id: 'qa-rouanet', funding_type: 'lei_rouanet', projected_cents: 30000 }, { ...revenue, id: 'qa-misto', funding_type: 'misto', projected_cents: 50000 }, { ...revenue, id: 'qa-cancel', funding_type: 'lei_rouanet', status: 'cancelada', projected_cents: 9000000 }]));
    const result = mount();
    await within(metric('Rouanet projetado')).findByRole('button', { name: /300,00/ });
    expect(screen.getByText('Edição completa · receitas manuais ativas')).toBeInTheDocument();
    await userEvent.setup().click(within(metric('Rouanet projetado')).getByRole('button', { name: 'Ajuda sobre Rouanet projetado' }));
    expect(screen.getByText(/todas as receitas manuais ativas da edição/)).toBeInTheDocument();
    expect(within(metric('Total projetado')).getByRole('button', { name: /8\.000,00/ })).toBeInTheDocument();
    const ranking = result.container.querySelector('.f28-revenue-ranking')!;
    const rows = [...ranking.querySelectorAll('li')];
    expect(rows.slice(0,3).map(row => row.getAttribute('data-category'))).toEqual(['recurso_livre', 'misto', 'lei_rouanet']);
    expect(rows[0]).toHaveTextContent('60%'); expect(rows[1]).toHaveTextContent('25%'); expect(rows[2]).toHaveTextContent('15%');
    expect(rows[3].querySelector('.f28-revenue-ranking__track > span')).toHaveStyle({ width: '0%' });
  });
  it('mantém uma lista compartilhada e filtros locais sem alterar resumo ou composição', async () => {
    const user = userEvent.setup(); const result = mount();
    await screen.findByText(revenue.description);
    const projected = panel('projetado'); const received = panel('realizado');
    const records = document.querySelector('.f28-revenue-records');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Pesquisar receitas' }), { target: { value: 'sem correspondência' } });
    expect(screen.getByRole('heading', { name: 'Nenhuma receita corresponde aos filtros' })).toBeInTheDocument();
    expect(within(metric('Total projetado')).getByRole('button', { name: /8\.000,00/ })).toBeInTheDocument();
    expect(result.container.querySelector('.f28-revenue-ranking')).toHaveTextContent('Recurso livre');
    await user.click(screen.getByRole('tab', { name: 'Recebido' }));
    expect(panel('projetado')).toBe(projected); expect(panel('realizado')).toBe(received);
    expect(document.querySelector('.f28-revenue-records')).toBe(records);
    expect(screen.getByRole('searchbox')).toHaveValue('sem correspondência');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Contraparte' } });
    result.rerender(<QueryClientProvider client={result.client}><Financial2028RevenueComparison edition={edition} focus="realizado" /></QueryClientProvider>);
    expect(screen.getByRole('searchbox')).toHaveValue('Contraparte');
    expect(screen.getByRole('combobox', { name: 'Situação' })).toHaveValue('confirmada');
    expect(fetchRevenueOverview).toHaveBeenCalledTimes(1); expect(fetchEditionSummary).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Recebido' }), { key: 'Home' });
    expect(document.querySelector('.f28-revenue-comparison')).toHaveAttribute('data-active-side', 'projetado');
  });
  it('mantém carregamento e falha distintos de zero verdadeiro', async () => {
    let finish!: (value: FinancialEditionSummary) => void;
    vi.mocked(fetchEditionSummary).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    mount(); await screen.findAllByText(revenue.description);
    expect(metric('Recebido líquido')).toHaveTextContent('Carregando…');
    expect(within(metric('Recebido líquido')).queryByRole('button', { name: /^Recebido líquido:/ })).not.toBeInTheDocument();
    finish({ ...summary, revenues: { ...summary.revenues!, received_cents: 0 } });
    await within(metric('Recebido líquido')).findByRole('button', { name: /0,00/ });
    cleanup(); vi.mocked(fetchEditionSummary).mockRejectedValue(new Error('Falha da fonte de recebimento'));
    mount(); await waitFor(() => expect(metric('Recebido líquido')).toHaveTextContent('Indisponível'));
    expect(within(metric('Recebido líquido')).queryByRole('button', { name: /^Recebido líquido:/ })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os valores');
  });
  it('declara o limite de 500 registros sem usá-lo como total integral', async () => {
    vi.mocked(fetchRevenueOverview).mockResolvedValue({...overview(Array.from({ length: 500 }, (_, i) => ({ ...revenue, id: `qa-${i}` }))),total:700});
    mount(); await within(metric('Total projetado')).findByRole('button', { name: /8\.000,00/ });
    expect(screen.getByText('500 de 700 registros')).toBeInTheDocument();
    expect(screen.getByText('500 de 700 registros')).toBeInTheDocument();
    expect(metric('Total projetado')).not.toHaveTextContent('600.000');
  });
  it('abre o cadastro existente pela ação realizada sem oferecer operação de recebimento', async () => {
    const user = userEvent.setup(); mount('realizado');
    await user.click(screen.getByRole('button', { name: 'Ajuda sobre fontes e comparação de receitas' }));
    expect(screen.getByText(/recebimentos são registrados separadamente em Movimentos/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Cadastrar receita' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText(/^Descrição/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(saveFinancialRecord).not.toHaveBeenCalled();
  });
  it('expande detalhes da única lista sem apresentar recebimento inventado por registro', async () => {
    const user = userEvent.setup(); mount();
    const details = await screen.findByRole('button', { name: `Ver detalhes de ${revenue.description}` });
    await user.click(details);
    expect(details).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(details.getAttribute('aria-controls')!)).toHaveTextContent('Recebimentos e saldos são consultados no cronograma abaixo');
    expect(screen.getByRole('table')).toHaveTextContent('900,00');
    expect(fetchRevenueOverview).toHaveBeenCalledTimes(1);
  });
  it('restringe cadastro e edição com financial_can, preservando a consulta', async () => {
    permissions.canEdit = false; permissions.canConfirm = false;
    mount(); await screen.findByText(revenue.description);
    expect(screen.queryByRole('button', { name: 'Adicionar receita projetada' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Editar ${revenue.description}` })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Ver detalhes de ${revenue.description}` })).toBeInTheDocument();
    cleanup(); permissions.canEdit = true;
    mount(); await screen.findByText(revenue.description);
    expect(screen.getByRole('button', { name: 'Adicionar receita projetada' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: `Editar ${revenue.description}` })).not.toBeInTheDocument();
    expect(saveFinancialRecord).not.toHaveBeenCalled();
  });
  it('consulta negada não busca dados financeiros', async () => {
    permissions.canAccess = false;
    mount(); await screen.findByRole('heading', { name: 'Acesso financeiro indisponível' });
    expect(fetchRevenueOverview).not.toHaveBeenCalled(); expect(fetchEditionSummary).not.toHaveBeenCalled();
  });
  it('permite ao perfil de confirmação editar compromissos e preserva a restrição de cadastro', async () => {
    const user = userEvent.setup(); permissions.canEdit = false;
    vi.mocked(fetchRevenueOverview).mockResolvedValue(overview([revenue, { ...revenue, id: 'qa-expectation', description: 'Expectativa sem confirmação', status: 'projetada', confirmed_cents: null }]));
    mount();
    await user.click(await screen.findByRole('button', { name: `Editar ${revenue.description}` }));
    expect(await screen.findByLabelText(/^Descrição/)).toHaveValue(revenue.description);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('button', { name: 'Editar Expectativa sem confirmação' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adicionar receita projetada' })).not.toBeInTheDocument();
    expect(saveFinancialRecord).not.toHaveBeenCalled();
  });
  it('mantém explicações da composição e dos filtros em ajuda acessível', async () => {
    const user = userEvent.setup(); mount(); await screen.findByText(revenue.description);
    expect(screen.getByText('Resumo da edição')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Receitas manuais carregadas' })).toBeInTheDocument();
    expect(screen.queryByText(/O ranking representa os registros ativos carregados/)).not.toBeInTheDocument();
    const composition = screen.getByRole('button', { name: 'Ajuda sobre a composição das receitas manuais' });
    composition.focus(); await user.keyboard('{Enter}');
    expect(screen.getByText(/antes dos filtros da lista/)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    const filters = screen.getByRole('button', { name: 'Ajuda sobre os filtros das receitas manuais' });
    filters.focus(); await user.keyboard('{Enter}');
    expect(screen.getByText(/Os filtros alteram somente as receitas manuais carregadas/)).toBeInTheDocument();
    expect(fetchRevenueOverview).toHaveBeenCalledTimes(1); expect(fetchEditionSummary).toHaveBeenCalledTimes(1);
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
