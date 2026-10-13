import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Financial2028RevenueComparison } from '@/features/financial-management/operational/Financial2028RevenueComparison';
import { FinancialRevenueRanking } from '@/features/financial-management/operational/FinancialRevenueRanking';
import { fetchEditionSummary, fetchReceivableSettlements, fetchRevenues, fetchSponsorships, saveFinancialRecord, type FinancialEditionSummary, type FinancialReceivableSettlement, type FinancialRevenue, type FinancialSponsorship } from '@/features/financial-management/operational/financialOperationalApi';
import { buildProjectedSide, buildRealizedSide, sharedScale, type RevenueCategoryItem } from '@/features/financial-management/operational/revenueComparisonModel';

vi.mock('@/hooks/useCurrentOrg', () => ({ useCurrentOrg: () => ({ orgId: 'qa-org' }) }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/features/financial-management/operational/financialOperationalApi', async original => ({
  ...await original<typeof import('@/features/financial-management/operational/financialOperationalApi')>(),
  fetchEditionSummary: vi.fn(), fetchRevenues: vi.fn(), fetchSponsorships: vi.fn(), fetchReceivableSettlements: vi.fn(), saveFinancialRecord: vi.fn(),
}));
const edition = { id: 'qa-e', org_id: 'qa-org', code: 2028, label: 'Fenasoja 2028', status: 'operacional' as const, period_start: '2027-01-01', period_end: '2028-12-31' };
const revenue: FinancialRevenue = { id: 'qa-r', description: 'Comercialização no título não define a categoria', counterparty: 'Contraparte', responsible_name: null, funding_type: 'recurso_livre', status: 'confirmada', projected_cents: 120000, confirmed_cents: 90000, competence_date: null, due_date: null, notes: null, version: 8 };
const summary: FinancialEditionSummary = { budget: { count: 0, cap_cents: 0, uncapped_count: 0, planned_cents: 0, line_count: 0 }, revenues: { projected_cents: 800000, confirmed_cents: 500000, received_cents: 12345, receivable_open_cents: 487655, overdue_count: 0 }, revenue: { count: 700, projected_cents: 700000, confirmed_cents: 400000 }, sponsorship: { count: 20, declared_cents: 100000, projected_cents: 100000, confirmed_cents: 100000, in_kind_cents: 5000000 }, obligations: { received_cents: 12345, paid_cents: 0, receivable_open_cents: 487655, payable_open_cents: 0, overdue_count: 0 }, movements: { count: 2, inflow_cents: 12345, outflow_cents: 0 } };
const sponsor: FinancialSponsorship = { id: 'qa-s', name: 'Patrocinador', tier: 'ouro', negotiation_status: 'confirmado', responsible_name: null, declared_cents: null, projected_free_cents: 40000, projected_rouanet_cents: 60000, confirmed_free_cents: 0, confirmed_rouanet_cents: 60000, in_kind_description: null, in_kind_value_cents: null, notes: null, version: 1 };
const receivable = (id: string, source_type: FinancialReceivableSettlement['source_type'], source_id: string | null, settled_cents: number): FinancialReceivableSettlement => ({ id, source_type, source_id, status: 'aberta', amount_cents: Math.max(settled_cents, 1), settled_cents });
// 2.345 (receita livre) + 6.000 (patrocínio só Rouanet) + 4.000 (parcela comercial) = 12.345 recebidos no resumo.
const receivables = [receivable('o1', 'receita', 'qa-r', 2345), receivable('o2', 'patrocinio', 'qa-s', 6000), receivable('o3', 'parcela_comercial', 'qa-i', 4000)];
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
  vi.mocked(fetchSponsorships).mockResolvedValue([sponsor]);
  vi.mocked(fetchReceivableSettlements).mockResolvedValue(receivables);
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
    expect(metric('Comercialização projetada')).toHaveTextContent('Sem fonte financeira');
    expect(within(metric('Comercialização projetada')).queryByRole('button')).not.toBeInTheDocument();
    await within(metric('Comercialização realizada')).findByRole('button', { name: /40,00/ });
    expect(within(metric('Rouanet realizado')).getByRole('button', { name: /60,00/ })).toBeInTheDocument();
    expect(within(metric('Rouanet projetado')).getByRole('button', { name: /600,00/ })).toBeInTheDocument();
    expect(panel('realizado').querySelector('.f28-ledger-mobile-values__received')).toHaveTextContent('RecebidoR$ 23,45');
    expect(within(panel('realizado')).getByText('Compromissos confirmados')).toBeInTheDocument();
    expect(within(panel('realizado')).getByText(/não somar ao recebido/)).toBeInTheDocument();
    expect(fetchRevenues).toHaveBeenCalledTimes(1); expect(fetchEditionSummary).toHaveBeenCalledTimes(1);
    expect(fetchSponsorships).toHaveBeenCalledTimes(1); expect(fetchReceivableSettlements).toHaveBeenCalledTimes(1);
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
    // 300 (receita Rouanet) + 600 (cota Rouanet do patrocínio); canceladas e origem mista ficam fora.
    await within(metric('Rouanet projetado')).findByRole('button', { name: /900,00/ });
    expect(within(metric('Rouanet projetado')).getByText('Recorte')).toBeInTheDocument();
    expect(within(metric('Total projetado')).getByRole('button', { name: /8\.000,00/ })).toBeInTheDocument();
    const ranking = panel('projetado').querySelector('.f28-revenue-ranking')!;
    const rows = [...ranking.querySelectorAll('li')];
    expect(rows.map(row => row.querySelector('.f28-revenue-ranking__name')!.textContent)).toEqual(['Receitas · Recurso livre', 'Patrocínios', 'Receitas · Misto', 'Receitas · Lei Rouanet', 'Receitas · Prefeitura / Plano de Trabalho', 'Receitas · Não identificado']);
    expect(rows[0]).toHaveTextContent('40%'); expect(rows[1]).toHaveTextContent('33,3%'); expect(rows[3]).toHaveTextContent('10%');
    expect(rows[4].querySelector('.f28-revenue-ranking__track > span')).toBeNull();
    expect(within(panel('projetado')).getByText('Recorte carregado')).toBeInTheDocument();
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
    expect(within(panel('projetado')).getByText('Recorte carregado · primeiros 500 registros')).toBeInTheDocument();
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
    const items: RevenueCategoryItem[] = [{ key: 'receita:recurso_livre', label: 'Origem com nome longo para leitura', value: 10000 }, { key: 'receita:misto', label: 'Origem zero', value: 0 }, { key: 'avulsos', label: 'Ajuste negativo', value: -5000 }];
    const result = render(<><section aria-label="Projetado teste"><FinancialRevenueRanking items={items} total={20000} scale={{ negative: -5000, positive: 15000 }} scopeLabel="no projetado" /></section><section aria-label="Recebido teste"><FinancialRevenueRanking items={items} total={40000} scale={{ negative: -5000, positive: 15000 }} scopeLabel="no realizado" /></section></>);
    const rankings = result.container.querySelectorAll('.f28-revenue-ranking');
    const first = rankings[0].querySelectorAll('li'); const second = rankings[1].querySelectorAll('li');
    expect(first[0].querySelector('.f28-revenue-ranking__track > span')).toHaveStyle({ width: '50%', left: '25%' });
    expect(second[0].querySelector('.f28-revenue-ranking__track > span')).toHaveStyle({ width: '50%', left: '25%' });
    expect(first[0]).toHaveTextContent('50%'); expect(second[0]).toHaveTextContent('25%');
    expect(first[1].querySelector('.f28-revenue-ranking__track > span')).toBeNull();
    expect(first[0]).toHaveAttribute('data-category-index', second[0].getAttribute('data-category-index'));
    expect(first[2]).toHaveAttribute('data-negative', 'true'); expect(first[2]).toHaveTextContent('-25%');
    expect(first[2].querySelector('.f28-revenue-ranking__track > span')).toHaveStyle({ width: '25%', left: '0%' });
    const user = userEvent.setup(); await user.click(within(screen.getByRole('region', { name: 'Projetado teste' })).getByRole('button', { name: /Origem com nome longo.*100,00/ }));
    expect(screen.getByText('R$ 100,00', { selector: '.f28-revenue-value-popover span' })).toBeInTheDocument();
  });
});

describe('modelo de projeção e realização', () => {
  const mixed: FinancialSponsorship = { ...sponsor, id: 'qa-mixed', confirmed_free_cents: 1000, confirmed_rouanet_cents: 1000 };
  const free: FinancialSponsorship = { ...sponsor, id: 'qa-free', projected_rouanet_cents: 0, confirmed_free_cents: 5000, confirmed_rouanet_cents: 0 };
  const rouanetRevenue: FinancialRevenue = { ...revenue, id: 'qa-rr', funding_type: 'lei_rouanet' };
  it('distribui cada centavo recebido em uma única categoria e confere com o resumo', () => {
    const rows = [...receivables, receivable('o4', 'patrocinio', 'qa-mixed', 2000), receivable('o5', 'patrocinio', 'qa-free', 5000), receivable('o6', 'receita', 'qa-rr', 700), receivable('o7', 'receita', 'qa-fora', 300), receivable('o8', 'manual', null, 100)];
    const total = rows.reduce((sum, row) => sum + row.settled_cents, 0);
    const side = buildRealizedSide(rows, [revenue, rouanetRevenue], [sponsor, mixed, free], { ...summary, revenues: { ...summary.revenues!, received_cents: total } });
    expect(side.total).toBe(total); expect(side.complete).toBe(true);
    expect(side.items.reduce((sum, item) => sum + item.value, 0)).toBe(total);
    expect(side.commercial).toBe(4000);
    expect(side.rouanet).toBe(6000 + 700);
    expect(side.rouanetUnattributed).toBe(2000 + 300);
    expect(side.items.find(item => item.key === 'patrocinios')!.value).toBe(6000 + 2000 + 5000);
    expect(side.items.find(item => item.key === 'receita:fora_do_recorte')!.value).toBe(300);
    expect(side.receivedByRevenue.get('qa-r')).toBe(2345);
    expect(buildRealizedSide(rows, [revenue, rouanetRevenue], [sponsor, mixed, free], summary).complete).toBe(false);
  });
  it('soma projetado sem canceladas e só marca completo quando as listas cobrem o resumo', () => {
    const side = buildProjectedSide([revenue, { ...rouanetRevenue, projected_cents: 300 }, { ...revenue, id: 'c', status: 'cancelada' }], [sponsor, { ...sponsor, id: 'x', negotiation_status: 'cancelado' }], { ...summary, revenue: { ...summary.revenue, count: 3 }, sponsorship: { ...summary.sponsorship, count: 2 } });
    expect(side.total).toBe(120000 + 300 + 100000); expect(side.rouanet).toBe(300 + 60000); expect(side.complete).toBe(true);
    expect(buildProjectedSide([revenue], [sponsor], summary).complete).toBe(false);
  });
  it('usa uma escala comum aos dois lados', () => {
    expect(sharedScale([{ key: 'patrocinios', label: 'P', value: 500 }], [{ key: 'avulsos', label: 'A', value: -20 }, { key: 'patrocinios', label: 'P', value: 900 }])).toEqual({ negative: -20, positive: 900 });
  });
});
