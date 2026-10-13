import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, FileChartColumn, Handshake, LayoutDashboard, ReceiptText, Scale, SlidersHorizontal, TrendingUp, WalletCards } from 'lucide-react';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import type { FinancialViewPath } from '../types';
import { FinancialNotActivatedError, fetchEditions } from './financialOperationalApi';
import { DashboardView } from './Financial2028Dashboard';
import { BudgetsView, SponsorshipsView } from './Financial2028Ledgers';
import { Financial2028RevenueComparison } from './Financial2028RevenueComparison';
import { Financial2028Expenses } from './Financial2028Expenses';
import { PendingView, ReportsView } from './Financial2028SecondaryViews';
import { Financial2028Loading, Financial2028State } from './Financial2028Presentation';
import '@/styles/financial-operational-2028.css';

const viewCopy = {
  dashboard: { title: 'Painel Financeiro', eyebrow: 'Comando executivo', description: 'Planejamento, compromissos e movimentação de caixa da edição.', Icon: LayoutDashboard },
  'receitas-projetadas': { title: 'Receitas Projetadas', eyebrow: 'Planejamento de entradas', description: 'Composição e expectativa das receitas manuais da operação.', Icon: TrendingUp },
  'receitas-confirmadas': { title: 'Receitas Confirmadas', eyebrow: 'Consolidação financeira', description: 'Acompanhamento dos compromissos confirmados, independente do recebimento.', Icon: CheckCircle2 },
  'despesas-previstas': { title: 'Despesas Previstas', eyebrow: 'Planejamento de despesas', description: 'Estimativas e detalhamento dos compromissos da edição.', Icon: ReceiptText },
  'despesas-realizadas': { title: 'Despesas Realizadas', eyebrow: 'Execução financeira', description: 'Compromissos realizados e sua distinção dos pagamentos.', Icon: WalletCards },
  'orcamento-comissoes': { title: 'Orçamento por Comissão', eyebrow: 'Governança do planejamento', description: 'Tetos, linhas e responsáveis, com utilização por comissão.', Icon: Scale },
  patrocinios: { title: 'Patrocínios', eyebrow: 'Portfólio de recursos', description: 'Negociação e composição da carteira, com recursos e contrapartidas distintos.', Icon: Handshake },
  simulacoes: { title: 'Simulações', eyebrow: 'Inteligência de cenários', description: 'Premissas e comparações da edição operacional.', Icon: SlidersHorizontal },
  relatorios: { title: 'Relatórios', eyebrow: 'Consultas gerenciais', description: 'Acessos às análises disponíveis e recursos pendentes da edição.', Icon: FileChartColumn },
};

export function Financial2028Workspace({ view }: { view: FinancialViewPath }) {
  const { orgId } = useCurrentOrg();
  const editions = useQuery({ queryKey: ['financial-operational', 'editions', orgId], queryFn: () => fetchEditions(orgId as string), enabled: Boolean(orgId), retry: false });
  const edition = editions.data?.find((e) => e.code === 2028);
  const copy = viewCopy[view];
  const isRevenue = view === 'receitas-projetadas' || view === 'receitas-confirmadas';
  const isExpense = view === 'despesas-previstas' || view === 'despesas-realizadas';
  let content;
  if (!orgId || editions.isLoading) content = <Financial2028Loading label="Abrindo Fenasoja 2028…" />;
  else if (editions.error instanceof FinancialNotActivatedError) content = <Financial2028State tone="locked" title="Financeiro 2028 ainda não ativado">A estrutura de cadastros está pronta, mas o banco ainda não recebeu a atualização. Ela só será aplicada com autorização.</Financial2028State>;
  else if (editions.isError) content = <Financial2028State tone="error" title="Não foi possível abrir a edição 2028." retry={() => void editions.refetch()} />;
  else if (!edition) content = <Financial2028State tone="locked" title="Edição 2028 indisponível para sua conta">Peça acesso financeiro ao administrador.</Financial2028State>;
  else if (view === 'dashboard') content = <DashboardView edition={edition} />;
  else if (view === 'orcamento-comissoes') content = <BudgetsView edition={edition} />;
  else if (isRevenue) content = <Financial2028RevenueComparison edition={edition} focus={view === 'receitas-confirmadas' ? 'realizado' : 'projetado'} />;
  else if (view === 'despesas-previstas' || view === 'despesas-realizadas') content = <Financial2028Expenses edition={edition} focus={view === 'despesas-realizadas' ? 'realizado' : 'projetado'} />;
  else if (view === 'patrocinios') content = <SponsorshipsView edition={edition} />;
  else if (view === 'relatorios') content = <ReportsView />;
  else content = <PendingView view={view} />;
  return <>
    {isRevenue || isExpense ? <header className="f28-revenue-header" data-menu={isExpense ? 'expenses' : 'revenue'}><div className="f28-revenue-header__identity"><span className="f28-revenue-header__mark" aria-hidden="true">{isExpense ? <ReceiptText /> : <TrendingUp />}</span><h1>{isExpense ? 'Despesas' : 'Receitas'}</h1></div><span className="f28-revenue-header__edition">FENASOJA <strong>2028</strong></span></header> : <header className="f28-header">
      <span className="f28-header__icon"><copy.Icon aria-hidden="true" /></span>
      <div className="f28-header__copy"><p>{copy.eyebrow}</p><h1>{copy.title}</h1><span className="f28-header__description">{copy.description}</span></div>
      <div className="f28-header__edition">Fenasoja 2028<span>Operação financeira</span></div>
    </header>}
    <div className="f28-content" data-financial-view={view}>{content}</div>
  </>;
}
