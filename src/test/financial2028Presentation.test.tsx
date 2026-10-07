import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Financial2028Workspace } from '@/features/financial-management/operational/Financial2028Workspace';
import type { FinancialViewPath } from '@/features/financial-management/types';
import { fetchBudgets, fetchBudgetLines, fetchEditions, fetchEditionSummary, fetchRevenues, fetchSponsorships, saveFinancialRecord } from '@/features/financial-management/operational/financialOperationalApi';

vi.mock('@/hooks/useCurrentOrg', () => ({ useCurrentOrg: () => ({ orgId: 'qa-org' }) }));
vi.mock('@/hooks/useOrgCommissions', () => ({ useOrgCommissions: () => ({ commissions: [
  { id: 'qa-c1', nome: 'Comissão de teste', slug: 'qa' }, { id: 'qa-c2', nome: 'Comissão disponível', slug: 'qa2' },
] }) }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }));
vi.mock('@/features/financial-management/operational/financialOperationalApi', async (original) => ({
  ...await original<typeof import('@/features/financial-management/operational/financialOperationalApi')>(),
  fetchEditions: vi.fn(), fetchBudgets: vi.fn(), fetchBudgetLines: vi.fn(), fetchEditionSummary: vi.fn(), fetchRevenues: vi.fn(), fetchSponsorships: vi.fn(), saveFinancialRecord: vi.fn(),
}));
const edition = { id:'qa-e',org_id:'qa-org',code:2028,label:'Fenasoja 2028',status:'operacional' as const,period_start:'2027-01-01',period_end:'2028-12-31' };
const budget = { id:'qa-b',edition_id:'qa-e',commission_id:'qa-c1',responsible_name:'Responsável de teste',budget_cap_cents:null,period_start:null,period_end:null,notes:null,version:7,updated_at:'' };
const revenue = { id:'qa-r',description:'Receita de teste',counterparty:'Contraparte',responsible_name:null,funding_type:'recurso_livre' as const,status:'confirmada' as const,projected_cents:123456,confirmed_cents:12345,competence_date:null,due_date:'2028-05-01',notes:null,version:8 };
const sponsor = { id:'qa-s',name:'Patrocinador de teste',tier:'ouro' as const,negotiation_status:'negociacao' as const,responsible_name:null,declared_cents:null,projected_free_cents:12345,projected_rouanet_cents:10000,confirmed_free_cents:2000,confirmed_rouanet_cents:1000,in_kind_description:'Serviço de teste',in_kind_value_cents:500000,notes:null,version:9 };
function mount(view: FinancialViewPath) {
  const client = new QueryClient({ defaultOptions: { queries:{retry:false},mutations:{retry:false} } });
  return render(<QueryClientProvider client={client}><Financial2028Workspace view={view} /></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchEditions).mockResolvedValue([edition]);
  vi.mocked(fetchBudgets).mockResolvedValue([budget]);
  vi.mocked(fetchBudgetLines).mockResolvedValue([{id:'qa-l',budget_id:budget.id,kind:'operacional',description:'Linha de teste',planned_cents:12345,active:true,version:1,notes:null}]);
  vi.mocked(fetchRevenues).mockResolvedValue([revenue]);
  vi.mocked(fetchSponsorships).mockResolvedValue([sponsor]);
  vi.mocked(saveFinancialRecord).mockResolvedValue({id:'qa-saved',version:1});
  Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:vi.fn()});
  Object.defineProperty(HTMLElement.prototype,'hasPointerCapture',{configurable:true,value:()=>false});
  Object.defineProperty(HTMLElement.prototype,'setPointerCapture',{configurable:true,value:vi.fn()});
  Object.defineProperty(HTMLElement.prototype,'releasePointerCapture',{configurable:true,value:vi.fn()});
});
afterEach(cleanup);

describe('apresentação operacional Financeiro 2028', () => {
  it('conserva recebimento separado e totais canônicos, sem somar listas', async () => {
    vi.mocked(fetchEditionSummary).mockResolvedValue({budget:{count:1,cap_cents:0,uncapped_count:1,planned_cents:10000,line_count:1},expenses:{count:0,planned_cents:10000,committed_cents:5000,paid_cents:0,payable_open_cents:5000,overdue_count:0},revenues:{projected_cents:987654321,confirmed_cents:87654321,received_cents:123,receivable_open_cents:87654198,overdue_count:0},revenue:{count:1,projected_cents:123456,confirmed_cents:12345},sponsorship:{count:1,declared_cents:0,projected_cents:1,confirmed_cents:1,in_kind_cents:0},obligations:{received_cents:123,paid_cents:0,receivable_open_cents:87654198,payable_open_cents:5000,overdue_count:0},movements:{count:0,inflow_cents:123,outflow_cents:0}});
    mount('dashboard');
    await screen.findByText('Recebido');
    expect(screen.getAllByText(/9\.876\.543,21/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1,23/).length).toBeGreaterThan(0);
    expect(fetchRevenues).not.toHaveBeenCalled();
  });
  it('apresenta Sem teto e planejado por linhas sem substituir nulo por zero', async () => {
    mount('orcamento-comissoes');
    await screen.findAllByText('Comissão de teste');
    expect(screen.getAllByText('Sem teto').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/123,45/).length).toBeGreaterThan(0);
  });
  it('mantém execução indisponível quando a fonte não fornece despesas e conserva caixa das obrigações', async () => {
    vi.mocked(fetchEditionSummary).mockResolvedValue({budget:{count:1,cap_cents:0,uncapped_count:1,planned_cents:10000,line_count:1},revenue:{count:0,projected_cents:0,confirmed_cents:0},sponsorship:{count:0,declared_cents:0,projected_cents:0,confirmed_cents:0,in_kind_cents:0},obligations:{received_cents:0,paid_cents:123,receivable_open_cents:0,payable_open_cents:456,overdue_count:0},movements:{count:0,inflow_cents:0,outflow_cents:123}});
    mount('dashboard');
    await screen.findByRole('heading',{name:'Consolidação de despesas não fornecida pela fonte'});
    const metric=screen.getByRole('heading',{name:'Previsto'}).closest('article');
    expect(metric).toHaveTextContent('Não informado');
    expect(metric).not.toHaveTextContent('0,00');
    expect(screen.getAllByText(/1,23/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Despesas realizadas')).not.toBeInTheDocument();
  });
  it('valida descrição junto ao campo e cancelar não grava', async () => {
    const user=userEvent.setup(); mount('receitas-projetadas');
    await user.click(await screen.findByRole('button',{name:'Nova receita'}));
    const dialog=screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button',{name:'Salvar'}));
    expect(within(dialog).getByLabelText(/^Descrição/)).toHaveAttribute('aria-invalid','true');
    expect(saveFinancialRecord).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button',{name:'Cancelar'}));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('mantém conteúdo, expectedVersion e chave de tentativa após falha recuperável', async () => {
    const user=userEvent.setup(); mount('receitas-confirmadas');
    await user.click(await screen.findByRole('button',{name:'Editar Receita de teste'}));
    const dialog=screen.getByRole('dialog'); const description=within(dialog).getByLabelText(/^Descrição/);
    await user.clear(description); await user.type(description,'Receita revisada em teste');
    vi.mocked(saveFinancialRecord).mockRejectedValueOnce(new Error('Falha de rede recuperável de teste.'));
    await user.click(within(dialog).getByRole('button',{name:'Salvar'}));
    await within(dialog).findByText('Falha de rede recuperável de teste.');
    expect(description).toHaveValue('Receita revisada em teste');
    const first=vi.mocked(saveFinancialRecord).mock.calls[0][0];
    expect(first).toMatchObject({entity:'revenue',expectedVersion:8,payload:{id:revenue.id,projected_cents:123456,confirmed_cents:12345}});
    await user.click(within(dialog).getByRole('button',{name:'Salvar'}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(vi.mocked(saveFinancialRecord).mock.calls[1][0].requestId).toBe(first.requestId);
  });
  it('conserva conflito de versão visível e rascunho aberto', async () => {
    const user=userEvent.setup(); mount('patrocinios');
    await user.click(await screen.findByRole('button',{name:'Editar Patrocinador de teste'}));
    const dialog=screen.getByRole('dialog');
    vi.mocked(saveFinancialRecord).mockRejectedValueOnce(new Error('O registro foi alterado por outra pessoa. Recarregue e tente novamente.'));
    await user.click(within(dialog).getByRole('button',{name:'Salvar'}));
    await within(dialog).findByText(/alterado por outra pessoa/);
    expect(within(dialog).getByLabelText(/^Patrocinador/)).toHaveValue(sponsor.name);
    expect(vi.mocked(saveFinancialRecord).mock.calls[0][0]).toMatchObject({entity:'sponsorship',expectedVersion:9,payload:{declared_cents:null,projected_free_cents:12345,projected_rouanet_cents:10000,in_kind_description:'Serviço de teste'}});
  });
  it('bloqueia controles e mantém envio até confirmação real', async () => {
    const user=userEvent.setup(); let confirm:(value:Record<string,unknown>)=>void=()=>undefined;
    vi.mocked(saveFinancialRecord).mockImplementation(()=>new Promise(resolve=>{confirm=resolve;}));
    mount('receitas-projetadas'); await user.click(await screen.findByRole('button',{name:'Editar Receita de teste'}));
    const dialog=screen.getByRole('dialog'); await user.click(within(dialog).getByRole('button',{name:'Salvar'}));
    expect(within(dialog).getByLabelText(/^Descrição/)).toBeDisabled();
    expect(within(dialog).getByRole('button',{name:'Cancelar'})).toBeDisabled();
    fireEvent.keyDown(dialog,{key:'Escape'}); expect(dialog).toBeInTheDocument();
    confirm({id:'qa-saved'}); await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('preserva teto zero e motivo obrigatório ao editar teto ausente', async () => {
    const user=userEvent.setup(); mount('orcamento-comissoes');
    await user.click((await screen.findAllByRole('button',{name:/^Editar(?: orçamento.*)?$/}))[0]);
    const dialog=screen.getByRole('dialog'); await user.type(within(dialog).getByLabelText(/^Teto/),'0');
    await user.click(within(dialog).getByRole('button',{name:'Salvar'}));
    expect(saveFinancialRecord).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(/^Motivo/),'Definição autorizada em teste');
    await user.click(within(dialog).getByRole('button',{name:'Salvar'}));
    await waitFor(()=>expect(saveFinancialRecord).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveFinancialRecord).mock.calls[0][0]).toMatchObject({entity:'budget',expectedVersion:7,reason:'Definição autorizada em teste',payload:{budget_cap_cents:0}});
  });
  it('cria orçamento sem teto e conserva identidade da comissão no payload', async () => {
    const user=userEvent.setup(); mount('orcamento-comissoes');
    await user.click(await screen.findByRole('button',{name:'Novo orçamento'}));
    const dialog=screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('combobox',{name:'Comissão'}));
    await user.click(screen.getByRole('option',{name:'Comissão disponível'}));
    await user.type(within(dialog).getByLabelText('Responsável'),'Responsável de teste');
    await user.click(within(dialog).getByRole('button',{name:'Salvar'}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(vi.mocked(saveFinancialRecord).mock.calls[0][0]).toMatchObject({entity:'budget',expectedVersion:null,payload:{edition_id:'qa-e',commission_id:'qa-c2',responsible_name:'Responsável de teste',budget_cap_cents:null}});
  });
  it('cria linha com a máscara em centavos e vínculo do orçamento existentes', async () => {
    const user=userEvent.setup(); mount('orcamento-comissoes');
    await user.click((await screen.findAllByRole('button',{name:/^(Linha|Adicionar linha)(?:.*)?$/}))[0]);
    const dialog=screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Descrição/),'Linha criada em teste');
    await user.type(within(dialog).getByLabelText(/^Valor previsto/),'12345');
    expect(within(dialog).getByLabelText(/^Valor previsto/)).toHaveValue('123,45');
    await user.click(within(dialog).getByRole('button',{name:'Adicionar linha'}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(vi.mocked(saveFinancialRecord).mock.calls[0][0]).toMatchObject({entity:'budget_line',expectedVersion:null,payload:{budget_id:'qa-b',description:'Linha criada em teste',planned_cents:12345,kind:'operacional'}});
  });
  it('cria patrocínio sem converter contrapartida em dinheiro', async () => {
    const user=userEvent.setup(); mount('patrocinios');
    await user.click(await screen.findByRole('button',{name:'Novo patrocínio'}));
    const dialog=screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Patrocinador/),'Patrocinador criado em teste');
    await user.type(within(dialog).getByLabelText(/^Projetado · recurso livre/),'12345');
    await user.type(within(dialog).getByLabelText(/^Contrapartida/),'Serviços sem movimentação financeira');
    await user.click(within(dialog).getByRole('button',{name:'Salvar'}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(vi.mocked(saveFinancialRecord).mock.calls[0][0]).toMatchObject({entity:'sponsorship',expectedVersion:null,payload:{edition_id:'qa-e',name:'Patrocinador criado em teste',declared_cents:null,projected_free_cents:12345,confirmed_free_cents:0,in_kind_description:'Serviços sem movimentação financeira'}});
  });
  it('preserva seleção original: projetadas inclui confirmadas e exclui canceladas', async () => {
    vi.mocked(fetchRevenues).mockResolvedValue([revenue,{...revenue,id:'qa-p',description:'Expectativa de teste',status:'projetada'},{...revenue,id:'qa-c',description:'Cancelada de teste',status:'cancelada'}]);
    const view=mount('receitas-projetadas');
    await screen.findAllByText('Expectativa de teste'); expect(screen.getAllByText('Receita de teste').length).toBeGreaterThan(0);
    expect(screen.queryByText('Cancelada de teste')).not.toBeInTheDocument(); view.unmount();
    mount('receitas-confirmadas'); await screen.findAllByText('Receita de teste');
    expect(screen.queryByText('Expectativa de teste')).not.toBeInTheDocument();
  });
  it.each(['despesas-previstas','despesas-realizadas','simulacoes'] as const)('explicita indisponibilidade operacional em %s', async view => {
    mount(view); await waitFor(()=>expect(screen.queryByText(/Abrindo Fenasoja/)).not.toBeInTheDocument());
    await screen.findByRole('heading',{name:view === 'simulacoes' ? 'Cenários operacionais ainda indisponíveis' : 'Livro de despesas ainda indisponível'});
    expect(screen.queryByRole('button',{name:'Salvar'})).not.toBeInTheDocument();
    expect(saveFinancialRecord).not.toHaveBeenCalled();
  });
});
