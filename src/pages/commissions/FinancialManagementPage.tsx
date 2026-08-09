import { useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  BookOpenCheck,
  Calculator,
  ChartNoAxesCombined,
  CheckCircle2,
  CircleDollarSign,
  FileChartColumn,
  FileSpreadsheet,
  Handshake,
  Landmark,
  Layers3,
  LayoutDashboard,
  LineChart,
  ListTree,
  PiggyBank,
  ReceiptText,
  Search,
  SlidersHorizontal,
  Target,
  TrendingDown,
  TrendingUp,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getModuleRoute,
  type CommissionModule,
} from '@/modules/commissions/commissionRegistry';
import {
  CommissionBudgetUtilizationChart,
  FundingSourceChart,
  RevenueComparisonChart,
  RevenueCompositionChart,
  ScenarioComparisonChart,
} from '@/features/financial-management/components/FinancialCharts';
import {
  BudgetProgress,
  FinancialAmount,
  FinancialDataProvenance,
  FinancialKpiCard,
  FinancialKpiGrid,
  FinancialRestrictedBadge,
  FinancialSectionHeader,
  FinancialStatusBadge,
} from '@/features/financial-management/components/FinancialPrimitives';
import {
  CommissionBudgetLedger,
  ExpenseLedger,
  GeneralBudgetLedger,
  RevenueLedger,
  SponsorLedger,
  SponsorTierBadge,
} from '@/features/financial-management/components/FinancialTables';
import {
  commissionBudgetSources,
  financial2026Source,
  financialReports,
  financialScenarios,
  financialWorkbookTotals,
  generalBudgetItems,
  revenueSources,
  sponsors,
} from '@/features/financial-management/data/financial2026Data';
import {
  flattenCommissionExpenses,
  groupExpensesByCategory,
  groupExpensesByCommission,
  groupRevenuesByCategory,
  selectExpenseDisplayAmount,
  selectExpenseLedgerTotal,
  selectGeneralBudgetSummaries,
  selectCommissionBudgets,
  selectOverBudgetCommissions,
  selectRevenueTotals,
  selectScenarioSummaries,
  selectSponsorTierDistribution,
  selectSponsorTotals,
  sortExpensesForLedger,
} from '@/features/financial-management/selectors/financialSelectors';
import type { ExpenseGroupingMode } from '@/features/financial-management/selectors/financialSelectors';
import {
  formatBRL,
  formatPercentage,
  roundCurrency,
} from '@/features/financial-management/utils/financialFormatters';
import type {
  ExpenseCategory,
  FinancialViewPath,
  FundingType,
  RevenueCategory,
  ScenarioId,
  SponsorTier,
} from '@/features/financial-management/types';
import '@/styles/financial-management.css';

interface FinancialManagementPageProps {
  module: CommissionModule;
}

const VIEW_COPY: Record<FinancialViewPath, {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
}> = {
  dashboard: {
    eyebrow: 'Comando executivo',
    title: 'Painel Financeiro',
    description: 'Leitura integrada de receita, orçamento, execução, risco e capacidade da base Fenasoja 2026.',
    icon: LayoutDashboard,
  },
  'receitas-projetadas': {
    eyebrow: 'Planejamento de entradas',
    title: 'Receitas Projetadas',
    description: 'Fontes de receita, composição e expectativa financeira preservadas da planilha de referência.',
    icon: TrendingUp,
  },
  'receitas-confirmadas': {
    eyebrow: 'Consolidação financeira',
    title: 'Receitas Confirmadas',
    description: 'Comparação entre projetado e consolidado sem confundir lacuna de consolidação com A Receber.',
    icon: CheckCircle2,
  },
  'despesas-previstas': {
    eyebrow: 'Plano orçamentário',
    title: 'Despesas Previstas',
    description: 'Detalhamento por comissão, natureza, valor e período, mantendo a descrição original de cada linha.',
    icon: ReceiptText,
  },
  'despesas-realizadas': {
    eyebrow: 'Execução da fonte',
    title: 'Despesas Realizadas',
    description: 'Valores realizados e origens informadas, com leitura explícita das limitações de reconciliação.',
    icon: Banknote,
  },
  'orcamento-comissoes': {
    eyebrow: 'Governança de teto',
    title: 'Orçamento por Comissão',
    description: 'Teto, valor orçado, saldo, utilização e alertas executivos por comissão.',
    icon: BadgeDollarSign,
  },
  patrocinios: {
    eyebrow: 'Captação institucional',
    title: 'Patrocínios',
    description: 'Patrocinadores, categorias explicitamente marcadas, recursos, recebimentos e contrapartidas.',
    icon: Handshake,
  },
  simulacoes: {
    eyebrow: 'Decisão gerencial',
    title: 'Cenários Financeiros',
    description: 'Comparação local entre as perspectivas Realista, Pessimista e Otimista registradas na planilha.',
    icon: SlidersHorizontal,
  },
  relatorios: {
    eyebrow: 'Inteligência gerencial',
    title: 'Relatórios Financeiros',
    description: 'Atalhos analíticos para as visões já disponíveis, sem oferecer exportações ainda inexistentes.',
    icon: FileChartColumn,
  },
};

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function hasFinancialSponsorValue(sponsor: (typeof sponsors)[number]) {
  return [
    sponsor.declaredValue,
    sponsor.projectedFreeResource,
    sponsor.consolidatedFreeResource,
    sponsor.receivableAmount,
    sponsor.projectedRouanet,
    sponsor.consolidatedRouanet,
  ].some((value) => value !== 0);
}

function FinancialPanel({
  title,
  description,
  icon,
  action,
  className,
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('financial-panel', className)}>
      <FinancialSectionHeader
        title={title}
        description={description}
        icon={icon}
        action={action}
        headingLevel={2}
      />
      <div className="financial-panel__content">{children}</div>
    </section>
  );
}

function FinancialFilterBar({ children, resultLabel }: { children: ReactNode; resultLabel: string }) {
  return (
    <div className="financial-filter-bar">
      <div className="financial-filter-bar__controls">{children}</div>
      <p className="financial-filter-bar__result" role="status">{resultLabel}</p>
    </div>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="financial-search-field">
      <span className="sr-only">{label}</span>
      <Search aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function SelectField({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="financial-select-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function DataQualityNote({
  title,
  children,
  tone = 'attention',
}: {
  title: string;
  children: ReactNode;
  tone?: 'attention' | 'information';
}) {
  const Icon = tone === 'attention' ? AlertTriangle : BookOpenCheck;
  return (
    <aside className={cn('financial-quality-note', `financial-quality-note--${tone}`)} role="note">
      <span className="financial-quality-note__icon"><Icon aria-hidden="true" /></span>
      <div>
        <h3>{title}</h3>
        <div>{children}</div>
      </div>
    </aside>
  );
}

function ExecutiveStrip({
  items,
}: {
  items: ReadonlyArray<{ label: string; value: ReactNode; detail?: string }>;
}) {
  return (
    <dl className="financial-executive-strip">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
          {item.detail && <p>{item.detail}</p>}
        </div>
      ))}
    </dl>
  );
}

function AboutFinancialModule({
  module,
  activeDescription,
}: {
  module: CommissionModule;
  activeDescription: string;
}) {
  return (
    <details className="financial-about">
      <summary>
        <span><BookOpenCheck aria-hidden="true" /> Sobre esta visão e sua governança</span>
        <span className="financial-about__hint">Base somente leitura</span>
      </summary>
      <div className="financial-about__content">
        <div>
          <h2>Propósito atual</h2>
          <p>{activeDescription}</p>
        </div>
        <div>
          <h2>Fonte</h2>
          <p>{financial2026Source.workbook}, abas Despesas, Receitas e PROJEÇÃO 2026.</p>
        </div>
        <div>
          <h2>Limite operacional</h2>
          <p>A experiência não grava, corrige ou sincroniza valores no Supabase. {module.name} continua protegido pela permissão financeira existente.</p>
        </div>
      </div>
    </details>
  );
}

export default function FinancialManagementPage({ module }: FinancialManagementPageProps) {
  const location = useLocation();
  const relativePath = location.pathname.replace(module.basePath, '').replace(/^\/+/, '');
  const requestedView = (relativePath || 'dashboard') as FinancialViewPath;
  const view: FinancialViewPath = Object.prototype.hasOwnProperty.call(VIEW_COPY, requestedView)
    ? requestedView
    : 'dashboard';
  const viewCopy = VIEW_COPY[view];
  const activeMenu = module.menus.find((menu) => menu.path === view) ?? module.menus[0];

  const [revenueSearch, setRevenueSearch] = useState('');
  const [revenueCategory, setRevenueCategory] = useState<'all' | RevenueCategory>('all');
  const [revenueFundingType, setRevenueFundingType] = useState<'all' | FundingType>('all');
  const [revenueEcosystem, setRevenueEcosystem] = useState<'all' | 'sponsorship' | 'commercial'>('all');
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<'all' | ExpenseCategory>('all');
  const [expenseCommission, setExpenseCommission] = useState('all');
  const [expenseGrouping, setExpenseGrouping] = useState<ExpenseGroupingMode>('commission');
  const [sponsorSearch, setSponsorSearch] = useState('');
  const [sponsorTier, setSponsorTier] = useState<'all' | SponsorTier>('all');
  const [scenarioId, setScenarioId] = useState<ScenarioId>('realistic');

  const commissionBudgets = useMemo(() => selectCommissionBudgets(commissionBudgetSources), []);
  const expenses = useMemo(() => flattenCommissionExpenses(commissionBudgetSources), []);
  const revenueTotals = useMemo(() => selectRevenueTotals(revenueSources), []);
  const revenueCategories = useMemo(
    () => Array.from(new Set(revenueSources.map((item) => item.category))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [],
  );
  const revenueFundingTypes = useMemo(
    () => Array.from(new Set(revenueSources.map((item) => item.fundingType))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [],
  );
  const expenseCategories = useMemo(
    () => Array.from(new Set(expenses.map((item) => item.category))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [expenses],
  );
  const commissionNames = useMemo(
    () => Array.from(new Set(expenses.map((item) => item.commission))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [expenses],
  );
  const revenueCategoryGroups = useMemo(
    () => groupRevenuesByCategory(revenueSources).sort((a, b) => b.projectedAmount - a.projectedAmount),
    [],
  );
  const sponsorTotals = useMemo(() => selectSponsorTotals(sponsors), []);
  const sponsorTiers = useMemo(() => selectSponsorTierDistribution(sponsors), []);
  const scenarioSummaries = useMemo(() => selectScenarioSummaries(financialScenarios), []);
  const generalBudgetSummaries = useMemo(
    () => selectGeneralBudgetSummaries(generalBudgetItems),
    [],
  );
  const historicalBudgetSummary = generalBudgetSummaries.find(
    (summary) => summary.kind === 'historical-obligation',
  );
  const investmentBudgetSummary = generalBudgetSummaries.find(
    (summary) => summary.kind === 'investment',
  );
  const selectedScenario = scenarioSummaries.find((scenario) => scenario.id === scenarioId) ?? scenarioSummaries[0];
  const overBudgetCommissions = useMemo(
    () => selectOverBudgetCommissions(commissionBudgets),
    [commissionBudgets],
  );

  const filteredRevenues = useMemo(() => {
    const query = normalizeSearch(revenueSearch);
    return revenueSources.filter((revenue) => {
      const matchesQuery = !query || normalizeSearch([
        revenue.source,
        revenue.category,
        revenue.fundingType,
      ].join(' ')).includes(query);
      return matchesQuery
        && (revenueCategory === 'all' || revenue.category === revenueCategory)
        && (revenueFundingType === 'all' || revenue.fundingType === revenueFundingType)
        && (revenueEcosystem === 'all' || revenue.ecosystem === revenueEcosystem);
    });
  }, [revenueCategory, revenueEcosystem, revenueFundingType, revenueSearch]);

  const filteredExpenses = useMemo(() => {
    const query = normalizeSearch(expenseSearch);
    return expenses.filter((expense) => {
      const matchesQuery = !query || normalizeSearch([
        expense.description,
        expense.commission,
        expense.category,
        expense.observation ?? '',
      ].join(' ')).includes(query);
      return matchesQuery
        && (expenseCategory === 'all' || expense.category === expenseCategory)
        && (expenseCommission === 'all' || expense.commission === expenseCommission);
    });
  }, [expenseCategory, expenseCommission, expenseSearch, expenses]);

  const realizedExpenses = useMemo(
    () => filteredExpenses.filter((expense) => (
      expense.realizedAmount !== 0
      || expense.paidWithFreeResource !== 0
      || expense.municipalityPlanAmount !== 0
      || expense.rouanetAmount !== 0
      || expense.paidMarkerAmount !== 0
    )),
    [filteredExpenses],
  );

  const filteredSponsors = useMemo(() => {
    const query = normalizeSearch(sponsorSearch);
    return sponsors.filter((sponsor) => {
      const matchesQuery = !query || normalizeSearch([
        sponsor.name,
        sponsor.tier,
        sponsor.receivableNote ?? '',
        sponsor.inKindContribution !== undefined ? String(sponsor.inKindContribution) : '',
      ].join(' ')).includes(query);
      return matchesQuery && (sponsorTier === 'all' || sponsor.tier === sponsorTier);
    });
  }, [sponsorSearch, sponsorTier]);

  const coreBudgetBalance = roundCurrency(
    financialWorkbookTotals.coreCommissionBudgetCap - financialWorkbookTotals.coreCommissionBudgeted,
  );
  const generalBudgetBalance = roundCurrency(
    financialWorkbookTotals.generalBudgetCap - financialWorkbookTotals.generalBudgeted,
  );
  const explicitReceivable = roundCurrency(
    financialWorkbookTotals.sponsorshipReceivableReported
    + financialWorkbookTotals.commercialReceivableReported,
  );
  const coreBudgetUtilization = (financialWorkbookTotals.coreCommissionBudgeted
    / financialWorkbookTotals.coreCommissionBudgetCap) * 100;
  const generalBudgetUtilization = (financialWorkbookTotals.generalBudgeted
    / financialWorkbookTotals.generalBudgetCap) * 100;
  const period2025Total = roundCurrency(expenses.reduce((total, expense) => total + expense.value2025, 0));
  const period2026Total = roundCurrency(expenses.reduce((total, expense) => total + expense.value2026, 0));
  const periodBridgeTotal = roundCurrency(period2025Total + period2026Total);
  const coreRealizedAmount = roundCurrency(
    expenses.reduce((total, expense) => total + expense.realizedAmount, 0),
  );
  const periodIntegrityDelta = roundCurrency(periodBridgeTotal - coreRealizedAmount);
  const financialSponsorCount = sponsors.filter(hasFinancialSponsorValue).length;
  const highestExecutionCommission = [...groupExpensesByCommission(expenses)]
    .sort((left, right) => right.realizedAmount - left.realizedAmount)[0];

  const revenueByEcosystem = (['sponsorship', 'commercial'] as const).map((ecosystem) => {
    const totals = selectRevenueTotals(revenueSources.filter((revenue) => revenue.ecosystem === ecosystem));
    return {
      id: ecosystem,
      label: ecosystem === 'sponsorship' ? 'Patrocínios' : 'Comercial',
      projectedAmount: totals.projectedAmount,
      consolidatedAmount: totals.consolidatedAmount,
    };
  });
  const revenueComposition = revenueCategoryGroups.slice(0, 7).map((group) => ({
    id: group.key,
    label: group.label,
    amount: group.projectedAmount,
  }));
  const topCommissionBudgets = [...commissionBudgets]
    .filter((budget) => budget.budgetCap > 0 || budget.budgetedAmount > 0)
    .sort((a, b) => b.budgetedAmount - a.budgetedAmount)
    .slice(0, 10);
  const fundingData = [
    { id: 'free', fundingType: 'Recurso Livre', amount: financialWorkbookTotals.paidWithFreeResource },
    { id: 'municipality', fundingType: 'Prefeitura / Plano de Trabalho', amount: financialWorkbookTotals.municipalityPlanAmount },
    { id: 'rouanet', fundingType: 'Lei Rouanet', amount: financialWorkbookTotals.rouanetAmount },
  ];

  const renderDashboard = () => (
    <div className="financial-view-stack">
      <FinancialKpiGrid columns={6}>
        <FinancialKpiCard label="Receita projetada" value={revenueTotals.projectedAmount} status="projected" icon={TrendingUp} tone="projected" detail="Receitas!K131" />
        <FinancialKpiCard label="Receita consolidada" value={revenueTotals.consolidatedAmount} status="consolidated" icon={CheckCircle2} tone="consolidated" detail={`${formatPercentage(revenueTotals.consolidationRate)} da projeção`} />
        <FinancialKpiCard label="A receber informado" value={explicitReceivable} status="receivable" icon={CircleDollarSign} tone="receivable" detail="Patrocínios + comercial" />
        <FinancialKpiCard label="Teto das comissões" value={financialWorkbookTotals.coreCommissionBudgetCap} icon={Target} tone="neutral" detail="Despesas!B310" />
        <FinancialKpiCard label="Orçado até o momento" value={financialWorkbookTotals.coreCommissionBudgeted} status="attention" icon={ReceiptText} tone="gold" detail={`${formatPercentage(coreBudgetUtilization)} do teto`} />
        <FinancialKpiCard label="Saldo das comissões" value={coreBudgetBalance} icon={WalletCards} tone="consolidated" detail="Teto menos orçado" />
      </FinancialKpiGrid>

      <ExecutiveStrip items={[
        { label: 'Lacuna de consolidação', value: formatBRL(revenueTotals.consolidationGapAmount), detail: 'Não equivale a A Receber' },
        { label: 'Orçamento geral', value: formatBRL(financialWorkbookTotals.generalBudgeted), detail: `de ${formatBRL(financialWorkbookTotals.generalBudgetCap)}` },
        { label: 'Saldo geral', value: formatBRL(generalBudgetBalance), detail: `${formatPercentage(generalBudgetUtilization)} utilizado` },
        { label: 'Comissões acima do teto', value: String(overBudgetCommissions.length), detail: 'Marketing, Inovação e Experiência, Gastronomia' },
        { label: 'Capacidade realista', value: formatBRL(financialScenarios[0].investmentCapacity), detail: 'Valor literal de PROJEÇÃO 2026!C18' },
      ]} />

      <div className="financial-dashboard-grid">
        <FinancialPanel
          title="Receita por ecossistema"
          description="Patrocínio e comercial lado a lado: projetado versus consolidado."
          icon={BarChart3}
          className="financial-panel--span-7"
        >
          <RevenueComparisonChart data={revenueByEcosystem} />
        </FinancialPanel>
        <FinancialPanel
          title="Composição projetada"
          description="Principais frentes que formam a receita prevista."
          icon={Layers3}
          className="financial-panel--span-5"
        >
          <RevenueCompositionChart data={revenueComposition} />
        </FinancialPanel>
      </div>

      <FinancialPanel
        title="Pressão orçamentária das comissões"
        description="O valor orçado usa o cabeçalho de cada comissão; o realizado usa a coluna consolidada da fonte."
        icon={BadgeDollarSign}
      >
        <div className="financial-budget-command">
          <BudgetProgress
            label="Orçamento-base das comissões"
            budgetCap={financialWorkbookTotals.coreCommissionBudgetCap}
            budgetedAmount={financialWorkbookTotals.coreCommissionBudgeted}
            remainingAmount={coreBudgetBalance}
            utilizationPercentage={coreBudgetUtilization}
            status="attention"
            compactAmounts={false}
          />
          <div className="financial-budget-risks">
            {overBudgetCommissions.map((budget) => (
              <article key={budget.id}>
                <FinancialStatusBadge status="over-budget" />
                <h3>{budget.commission}</h3>
                <p>{formatPercentage(budget.utilizationPercentage)} utilizado</p>
                <strong>{formatBRL(Math.abs(budget.remainingAmount))} acima do teto</strong>
              </article>
            ))}
          </div>
        </div>
      </FinancialPanel>

      <div className="financial-dashboard-grid">
        <FinancialPanel
          title="Maiores orçamentos"
          description="Comparação entre teto e valor orçado nas dez maiores comissões."
          icon={ChartNoAxesCombined}
          className="financial-panel--span-7"
        >
          <CommissionBudgetUtilizationChart data={topCommissionBudgets} />
        </FinancialPanel>
        <FinancialPanel
          title="Valores por origem registrada"
          description="Colunas independentes da planilha; não representam 100% do realizado."
          icon={Landmark}
          className="financial-panel--span-5"
        >
          <FundingSourceChart data={fundingData} />
        </FinancialPanel>
      </div>

      <DataQualityNote title="Ponto de reconciliação preservado na fonte">
        <p>O realizado oficial é {formatBRL(coreRealizedAmount)}. A soma dos períodos 2025 e 2026 resulta em {formatBRL(periodBridgeTotal)}, diferença de {formatBRL(periodIntegrityDelta)} causada pela linha 14, que possui valor em 2026 e célula consolidada vazia. O painel não corrige a planilha silenciosamente.</p>
      </DataQualityNote>
    </div>
  );

  const renderRevenues = (confirmed: boolean) => {
    const filteredTotals = selectRevenueTotals(filteredRevenues);
    const filteredFreeProjected = roundCurrency(filteredRevenues.reduce((total, revenue) => total + revenue.projectedFreeResource, 0));
    const filteredFreeConsolidated = roundCurrency(filteredRevenues.reduce((total, revenue) => total + revenue.consolidatedFreeResource, 0));
    const filteredRouanetProjected = roundCurrency(filteredRevenues.reduce((total, revenue) => total + revenue.projectedRouanet, 0));
    const filteredRouanetConsolidated = roundCurrency(filteredRevenues.reduce((total, revenue) => total + revenue.consolidatedRouanet, 0));
    const filteredCommercialTotals = selectRevenueTotals(filteredRevenues.filter((revenue) => revenue.ecosystem === 'commercial'));
    const filteredRevenueByEcosystem = (['sponsorship', 'commercial'] as const)
      .filter((ecosystem) => filteredRevenues.some((revenue) => revenue.ecosystem === ecosystem))
      .map((ecosystem) => {
        const totals = selectRevenueTotals(
          filteredRevenues.filter((revenue) => revenue.ecosystem === ecosystem),
        );
        return {
          id: ecosystem,
          label: ecosystem === 'sponsorship' ? 'Patrocínios' : 'Comercial',
          projectedAmount: totals.projectedAmount,
          consolidatedAmount: totals.consolidatedAmount,
        };
      });
    const composition = groupRevenuesByCategory(filteredRevenues)
      .sort((a, b) => (confirmed ? b.consolidatedAmount - a.consolidatedAmount : b.projectedAmount - a.projectedAmount))
      .slice(0, 8)
      .map((group) => ({
        id: group.key,
        label: group.label,
        amount: confirmed ? group.consolidatedAmount : group.projectedAmount,
      }));
    return (
      <div className="financial-view-stack">
        {confirmed ? (
          <FinancialKpiGrid columns={6}>
            <FinancialKpiCard label="Consolidado" value={filteredTotals.consolidatedAmount} status="consolidated" icon={CheckCircle2} tone="consolidated" />
            <FinancialKpiCard label="Taxa de consolidação" value={filteredTotals.consolidationRate} valueKind="percentage" icon={Target} tone="neutral" detail="Consolidado ÷ projetado" />
            <FinancialKpiCard label="A receber informado" value={filteredTotals.explicitReceivableAmount} status="receivable" icon={CircleDollarSign} tone="receivable" />
            <FinancialKpiCard label="Patrocínio livre consolidado" value={filteredFreeConsolidated} icon={WalletCards} tone="consolidated" />
            <FinancialKpiCard label="Rouanet consolidado" value={filteredRouanetConsolidated} icon={Landmark} tone="consolidated" />
            <FinancialKpiCard label="Lacuna de consolidação" value={filteredTotals.consolidationGapAmount} status="partial" icon={TrendingDown} tone="gold" />
          </FinancialKpiGrid>
        ) : (
          <FinancialKpiGrid columns={6}>
            <FinancialKpiCard label="Total projetado" value={filteredTotals.projectedAmount} status="projected" icon={TrendingUp} tone="projected" />
            <FinancialKpiCard label="Patrocínio livre projetado" value={filteredFreeProjected} icon={WalletCards} tone="projected" />
            <FinancialKpiCard label="Rouanet projetado" value={filteredRouanetProjected} icon={Landmark} tone="projected" />
            <FinancialKpiCard label="Comercialização projetada" value={filteredCommercialTotals.projectedAmount} icon={Banknote} tone="projected" />
            <FinancialKpiCard label="Consolidado" value={filteredTotals.consolidatedAmount} status="consolidated" icon={CheckCircle2} tone="consolidated" />
            <FinancialKpiCard label="Fontes na visão" value={filteredRevenues.length} valueKind="number" icon={ListTree} tone="neutral" detail={`${revenueSources.length} fontes na base`} />
          </FinancialKpiGrid>
        )}

        <div className="financial-dashboard-grid">
          <FinancialPanel
            title={confirmed ? 'Consolidado por categoria' : 'Projeção por categoria'}
            description="A composição responde aos filtros aplicados na listagem."
            icon={Layers3}
            className="financial-panel--span-5"
          >
            <RevenueCompositionChart
              data={composition}
              title={confirmed ? 'Receita consolidada por categoria' : 'Receita projetada por categoria'}
              summary={`Composição da receita ${confirmed ? 'consolidada' : 'projetada'} por categoria.`}
            />
          </FinancialPanel>
          <FinancialPanel
            title="Projetado versus consolidado"
            description="A diferença visual é uma lacuna de consolidação, não um cálculo de contas a receber."
            icon={BarChart3}
            className="financial-panel--span-7"
          >
            <RevenueComparisonChart data={filteredRevenueByEcosystem} />
          </FinancialPanel>
        </div>

        <FinancialPanel
          title={confirmed ? 'Livro de receitas consolidadas' : 'Livro de receitas projetadas'}
          description="Valores e descrições mantidos conforme a referência oficial de 2026."
          icon={FileSpreadsheet}
        >
          <FinancialFilterBar resultLabel={`${filteredRevenues.length} de ${revenueSources.length} fontes`}>
            <SearchField value={revenueSearch} onChange={setRevenueSearch} label="Buscar receita" placeholder="Buscar fonte, categoria ou recurso" />
            <SelectField value={revenueCategory} onChange={(value) => setRevenueCategory(value as 'all' | RevenueCategory)} label="Categoria">
              <option value="all">Todas as categorias</option>
              {revenueCategories.map((category) => <option key={category} value={category}>{category}</option>)}
            </SelectField>
            <SelectField value={revenueFundingType} onChange={(value) => setRevenueFundingType(value as 'all' | FundingType)} label="Tipo de recurso">
              <option value="all">Todos os recursos</option>
              {revenueFundingTypes.map((fundingType) => <option key={fundingType} value={fundingType}>{fundingType}</option>)}
            </SelectField>
            <SelectField value={revenueEcosystem} onChange={(value) => setRevenueEcosystem(value as 'all' | 'sponsorship' | 'commercial')} label="Ecossistema">
              <option value="all">Todos os ecossistemas</option>
              <option value="sponsorship">Patrocínios</option>
              <option value="commercial">Comercial / evento</option>
            </SelectField>
          </FinancialFilterBar>
          <RevenueLedger revenues={filteredRevenues} emptyFromSearch={Boolean(revenueSearch || revenueCategory !== 'all' || revenueFundingType !== 'all' || revenueEcosystem !== 'all')} confirmedView={confirmed} />
        </FinancialPanel>

        <DataQualityNote title="Leitura financeira correta" tone="information">
          <p>Nesta visão filtrada, a lacuna projetado − consolidado é {formatBRL(filteredTotals.consolidationGapAmount)} e o A Receber explícito é {formatBRL(filteredTotals.explicitReceivableAmount)}. Os dois conceitos vêm de campos distintos e permanecem separados em toda a interface.</p>
        </DataQualityNote>
      </div>
    );
  };

  const renderExpenses = (realized: boolean) => {
    const mode = realized ? 'realized' : 'planning';
    const sourceRows = realized ? realizedExpenses : filteredExpenses;
    const rows = sortExpensesForLedger(sourceRows, mode, expenseGrouping);
    const visibleAmount = selectExpenseLedgerTotal(rows, mode);
    const expenseInsights = realized
      ? []
      : expenseGrouping === 'category'
        ? groupExpensesByCategory(rows)
          .map((item) => ({
            label: item.label,
            value: roundCurrency(item.value2025Amount + item.value2026Amount),
            detail: `${item.expenseCount} itens`,
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 4)
        : expenseGrouping === 'commission'
          ? groupExpensesByCommission(rows)
            .map((item) => ({
              label: item.label,
              value: roundCurrency(item.value2025Amount + item.value2026Amount),
              detail: `${item.expenseCount} itens`,
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 4)
          : rows.slice(0, 4).map((item) => ({
            label: item.description || `Linha ${item.sourceRow}`,
            value: expenseGrouping === 'period'
              ? item.value2026
              : selectExpenseDisplayAmount(item, 'planning'),
            detail: item.commission,
          }));
    return (
      <div className="financial-view-stack">
        {realized ? (
          <FinancialKpiGrid columns={5}>
            <FinancialKpiCard label="Total realizado" value={coreRealizedAmount} status="realized" icon={Banknote} tone="consolidated" detail="Âncora: coluna realizado da fonte" />
            <FinancialKpiCard label="Recurso Livre" value={financialWorkbookTotals.paidWithFreeResource} icon={WalletCards} tone="gold" detail="Valor registrado" />
            <FinancialKpiCard label="Prefeitura / Plano de Trabalho" value={financialWorkbookTotals.municipalityPlanAmount} icon={Landmark} tone="neutral" detail="Valor registrado" />
            <FinancialKpiCard label="Lei Rouanet" value={financialWorkbookTotals.rouanetAmount} icon={FileSpreadsheet} tone="projected" detail="Valor registrado" />
            <FinancialKpiCard label="Maior execução por comissão" value={highestExecutionCommission?.realizedAmount ?? 0} icon={TrendingUp} tone="neutral" detail={highestExecutionCommission?.label ?? 'Sem comissão'} />
          </FinancialKpiGrid>
        ) : (
          <FinancialKpiGrid columns={5}>
            <FinancialKpiCard label="Teto das comissões" value={financialWorkbookTotals.coreCommissionBudgetCap} icon={Target} tone="neutral" />
            <FinancialKpiCard label="Orçado até o momento" value={financialWorkbookTotals.coreCommissionBudgeted} status="attention" icon={ReceiptText} tone="gold" />
            <FinancialKpiCard label="Período 2025" value={period2025Total} icon={ReceiptText} tone="neutral" detail="Soma da coluna 2025" />
            <FinancialKpiCard label="Período 2026" value={period2026Total} icon={ReceiptText} tone="projected" detail="Soma da coluna 2026" />
            <FinancialKpiCard label="Saldo das comissões" value={coreBudgetBalance} icon={WalletCards} tone="consolidated" />
          </FinancialKpiGrid>
        )}

        <FinancialPanel
          title={realized ? 'Execução e origens registradas' : 'Plano detalhado de despesas'}
          description={realized
            ? 'A coluna realizado é a âncora da fonte; as origens registradas são campos independentes e não exaustivos.'
            : 'Ordene por comissão, categoria, valor ou período sem alterar a taxonomia e a descrição da planilha.'}
          icon={realized ? Banknote : ReceiptText}
        >
          <FinancialFilterBar resultLabel={`${rows.length} despesas · ${formatBRL(visibleAmount)} ${realized ? 'na coluna realizado' : 'planejados nos períodos'}`}>
            <SearchField value={expenseSearch} onChange={setExpenseSearch} label="Buscar despesa" placeholder="Buscar despesa, comissão ou observação" />
            <SelectField value={expenseCommission} onChange={setExpenseCommission} label="Comissão">
              <option value="all">Todas as comissões</option>
              {commissionNames.map((commission) => <option key={commission} value={commission}>{commission}</option>)}
            </SelectField>
            <SelectField value={expenseCategory} onChange={(value) => setExpenseCategory(value as 'all' | ExpenseCategory)} label="Categoria">
              <option value="all">Todas as categorias</option>
              {expenseCategories.map((category) => <option key={category} value={category}>{category}</option>)}
            </SelectField>
            <SelectField value={expenseGrouping} onChange={(value) => setExpenseGrouping(value as ExpenseGroupingMode)} label="Organizar">
              <option value="commission">Por comissão</option>
              <option value="category">Por categoria</option>
              <option value="value">Por maior valor</option>
              <option value="period">Por período 2026</option>
            </SelectField>
          </FinancialFilterBar>

          {!realized && expenseInsights.length > 0 && (
            <div className="financial-insight-grid" aria-label="Destaques do agrupamento selecionado">
              {expenseInsights.map((item) => (
                <article key={`${item.label}-${item.detail}`}>
                  <p>{item.label}</p>
                  <strong>{formatBRL(item.value)}</strong>
                  <span>{item.detail}</span>
                </article>
              ))}
            </div>
          )}
          <ExpenseLedger expenses={rows} mode={realized ? 'realized' : 'planning'} emptyFromSearch={Boolean(expenseSearch || expenseCommission !== 'all' || expenseCategory !== 'all')} />
        </FinancialPanel>

        {!realized && (
          <FinancialPanel
            title="Orçamento geral fora das comissões"
            description="Obrigações históricas e investimentos das linhas 311–342, mantidos separados dos tetos das comissões."
            icon={Landmark}
          >
            <ExecutiveStrip items={[
              { label: 'Obrigações históricas', value: formatBRL(historicalBudgetSummary?.budgetedAmount ?? 0), detail: `${historicalBudgetSummary?.itemCount ?? 0} itens orçados` },
              { label: 'Teto histórico', value: formatBRL(historicalBudgetSummary?.budgetCap ?? 0), detail: `Saldo ${formatBRL(historicalBudgetSummary?.remainingAmount ?? 0)}` },
              { label: 'Investimentos / obras', value: formatBRL(investmentBudgetSummary?.budgetedAmount ?? 0), detail: `${investmentBudgetSummary?.itemCount ?? 0} itens` },
              { label: 'Teto de investimentos', value: formatBRL(investmentBudgetSummary?.budgetCap ?? 0), detail: `Saldo ${formatBRL(investmentBudgetSummary?.remainingAmount ?? 0)}` },
              { label: 'Itens gerais', value: String(generalBudgetItems.length), detail: 'Linhas 311–342 da fonte' },
            ]} />
            <GeneralBudgetLedger items={generalBudgetItems} />
          </FinancialPanel>
        )}

        {realized && (
          <div className="financial-dashboard-grid">
            <FinancialPanel title="Valores por origem registrada" description="Comparação absoluta, sem leitura proporcional do total." icon={Landmark} className="financial-panel--span-5">
              <FundingSourceChart data={fundingData} />
            </FinancialPanel>
            <div className="financial-panel--span-7 financial-note-stack">
              <DataQualityNote title="A soma dos períodos não fecha com o realizado oficial">
                <p>2025 + 2026 soma {formatBRL(periodBridgeTotal)}, enquanto a coluna realizado registra {formatBRL(coreRealizedAmount)}. A diferença de {formatBRL(periodIntegrityDelta)} está na linha 14 e permanece visível como questão de qualidade da fonte.</p>
              </DataQualityNote>
              <DataQualityNote title="Origens não exaustivas" tone="information">
                <p>Recurso Livre, Prefeitura / Plano de Trabalho e Lei Rouanet são colunas independentes. Elas não devem ser somadas como se fossem a composição integral do realizado.</p>
              </DataQualityNote>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCommissionBudgets = () => (
    <div className="financial-view-stack">
      <FinancialKpiGrid columns={5}>
        <FinancialKpiCard label="Teto das comissões" value={financialWorkbookTotals.coreCommissionBudgetCap} icon={Target} tone="neutral" />
        <FinancialKpiCard label="Orçado" value={financialWorkbookTotals.coreCommissionBudgeted} status="attention" icon={BadgeDollarSign} tone="gold" />
        <FinancialKpiCard label="Saldo" value={coreBudgetBalance} icon={WalletCards} tone="consolidated" />
        <FinancialKpiCard label="Utilização" value={coreBudgetUtilization} valueKind="percentage" icon={Calculator} tone="gold" detail="Faixa de atenção executiva" />
        <FinancialKpiCard label="Acima do teto" value={overBudgetCommissions.length} valueKind="number" status="over-budget" icon={AlertTriangle} tone="over-budget" detail="3 comissões" />
      </FinancialKpiGrid>

      <FinancialPanel title="10 maiores orçamentos" description="Recorte ordenado pelo valor orçado. Vermelho indica excesso real; amarelo e laranja representam faixas de atenção visual." icon={ChartNoAxesCombined}>
        <CommissionBudgetUtilizationChart data={topCommissionBudgets} title="Utilização nos 10 maiores orçamentos" height={500} mobileHeight={390} />
      </FinancialPanel>

      <FinancialPanel title="Orçamento completo por comissão" description="Ordene o portfólio e abra cada comissão para examinar categorias, maiores itens e observações." icon={BadgeDollarSign}>
        <CommissionBudgetLedger budgets={commissionBudgets} />
      </FinancialPanel>

      <DataQualityNote title="Comissão sem teto definido" tone="information">
        <p>Indústria, Comércio e Serviços possui teto e orçamento iguais a zero na fonte. A interface apresenta “Sem teto definido”, evitando uma leitura enganosa de 0% como desempenho normal.</p>
      </DataQualityNote>
    </div>
  );

  const renderSponsorships = () => (
    <div className="financial-view-stack">
      <FinancialKpiGrid columns={6}>
        <FinancialKpiCard label="Patrocínio projetado" value={sponsorTotals.totalProjectedAmount} status="projected" icon={TrendingUp} tone="projected" />
        <FinancialKpiCard label="Patrocínio consolidado" value={sponsorTotals.totalConsolidatedAmount} status="consolidated" icon={CheckCircle2} tone="consolidated" />
        <FinancialKpiCard label="A receber informado" value={sponsorTotals.explicitReceivableAmount} status="receivable" icon={CircleDollarSign} tone="receivable" />
        <FinancialKpiCard label="Recurso Livre projetado" value={sponsorTotals.projectedFreeResource} icon={WalletCards} tone="projected" detail={`${formatBRL(sponsorTotals.consolidatedFreeResource)} consolidado`} />
        <FinancialKpiCard label="Rouanet projetado" value={sponsorTotals.projectedRouanet} icon={Landmark} tone="projected" detail={`${formatBRL(sponsorTotals.consolidatedRouanet)} consolidado`} />
        <FinancialKpiCard label="Patrocinadores com valor" value={financialSponsorCount} valueKind="number" icon={Handshake} tone="neutral" detail={`${sponsorTotals.sponsorCount} registros nomeados`} />
      </FinancialKpiGrid>

      <ExecutiveStrip items={[
        { label: 'Credenciais veículos', value: String(sponsorTotals.vehicleCredentials), detail: 'Total informado na planilha' },
        { label: 'Credenciais Soy Summit', value: String(sponsorTotals.soySummitCredentials), detail: 'Não define categoria automaticamente' },
        { label: 'Contrapartidas registradas', value: String(sponsorTotals.inKindContributionCount), detail: 'Textos ou valores informados' },
        { label: 'Livre consolidado', value: formatBRL(sponsorTotals.consolidatedFreeResource), detail: 'Patrocínios' },
        { label: 'Rouanet consolidado', value: formatBRL(sponsorTotals.consolidatedRouanet), detail: 'Patrocínios' },
      ]} />

      <FinancialPanel title="Categorias explicitamente marcadas" description="Nenhuma categoria é inferida pelo nome ou pela quantidade de credenciais." icon={Layers3}>
        <div className="financial-tier-grid">
          {sponsorTiers.map((tier) => (
            <button
              key={tier.tier}
              type="button"
              className={cn('financial-tier-card', sponsorTier === tier.tier && 'is-active')}
              aria-pressed={sponsorTier === tier.tier}
              onClick={() => setSponsorTier((current) => current === tier.tier ? 'all' : tier.tier)}
            >
              <SponsorTierBadge tier={tier.tier} />
              <strong>{tier.sponsorCount}</strong>
              <span>{formatBRL(tier.totalProjectedAmount)} projetado</span>
            </button>
          ))}
        </div>
      </FinancialPanel>

      <FinancialPanel title="Carteira de patrocínios" description="Valores financeiros, categoria, recebimento e contrapartidas em uma leitura única." icon={Handshake}>
        <FinancialFilterBar resultLabel={`${filteredSponsors.length} de ${sponsors.length} patrocinadores`}>
          <SearchField value={sponsorSearch} onChange={setSponsorSearch} label="Buscar patrocinador" placeholder="Buscar patrocinador ou contrapartida" />
          <SelectField value={sponsorTier} onChange={(value) => setSponsorTier(value as 'all' | SponsorTier)} label="Categoria">
            <option value="all">Todas as categorias</option>
            {sponsorTiers.map((tier) => <option key={tier.tier} value={tier.tier}>{tier.tier}</option>)}
          </SelectField>
        </FinancialFilterBar>
        <SponsorLedger sponsors={filteredSponsors} emptyFromSearch={Boolean(sponsorSearch || sponsorTier !== 'all')} />
      </FinancialPanel>

      <DataQualityNote title="Categorias e situações preservadas" tone="information">
        <p>Soy Summit só é tratado como categoria quando existe marcação explícita na coluna correspondente. Textos como “pago” nas células de A Receber permanecem como situação informada, sem conversão artificial em valor.</p>
      </DataQualityNote>
    </div>
  );

  const renderScenarios = () => (
    <div className="financial-view-stack">
      <div className="financial-simulation-banner" role="note">
        <SlidersHorizontal aria-hidden="true" />
        <div>
          <strong>Simulação gerencial local</strong>
          <span>Alternar cenários não altera dados oficiais, Supabase ou a planilha de referência.</span>
        </div>
      </div>

      <div className="financial-scenario-tabs" role="group" aria-label="Selecionar cenário em destaque">
        {scenarioSummaries.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            aria-pressed={scenarioId === scenario.id}
            className={cn('financial-scenario-tab', scenarioId === scenario.id && 'is-active')}
            onClick={() => setScenarioId(scenario.id)}
          >
            <span>{scenario.label}</span>
            <strong>{formatBRL(scenario.totalRevenue)}</strong>
            <small>{scenario.negativeResult > 0 ? `${formatBRL(scenario.negativeResult)} de déficit` : `${formatBRL(scenario.investmentCapacity)} de capacidade`}</small>
          </button>
        ))}
      </div>

      <FinancialKpiGrid columns={5}>
        <FinancialKpiCard label="Receita comercial" value={selectedScenario.commercialRevenue} icon={Banknote} tone="projected" />
        <FinancialKpiCard label="Patrocínios" value={selectedScenario.sponsorshipRevenue} icon={Handshake} tone="projected" />
        <FinancialKpiCard label="Receita total" value={selectedScenario.totalRevenue} icon={TrendingUp} tone="consolidated" />
        <FinancialKpiCard label="Compromissos" value={selectedScenario.totalCommitments} icon={ReceiptText} tone="gold" />
        <FinancialKpiCard
          label={selectedScenario.negativeResult > 0 ? 'Déficit projetado' : 'Capacidade de investimento'}
          value={selectedScenario.negativeResult > 0 ? selectedScenario.negativeResult : selectedScenario.investmentCapacity}
          icon={selectedScenario.negativeResult > 0 ? TrendingDown : PiggyBank}
          tone={selectedScenario.negativeResult > 0 ? 'over-budget' : 'consolidated'}
          status={selectedScenario.negativeResult > 0 ? 'over-budget' : 'consolidated'}
        />
      </FinancialKpiGrid>

      <div className="financial-dashboard-grid">
        <FinancialPanel title="Comparação de cenários" description="Receita total, compromissos, capacidade e déficit lado a lado." icon={LineChart} className="financial-panel--span-7">
          <ScenarioComparisonChart data={financialScenarios} />
        </FinancialPanel>
        <FinancialPanel title={`Ponte do cenário ${selectedScenario.label}`} description="Composição preservada dos campos da planilha de projeção." icon={Calculator} className="financial-panel--span-5">
          <dl className="financial-scenario-bridge">
            <div><dt>Comercialização</dt><dd>{formatBRL(selectedScenario.commercialization)}</dd></div>
            <div><dt>Exporural</dt><dd>{formatBRL(selectedScenario.exporural)}</dd></div>
            <div><dt>Área externa</dt><dd>{formatBRL(selectedScenario.externalArea)}</dd></div>
            <div><dt>Pavilhão agroindústria</dt><dd>{formatBRL(selectedScenario.agroindustryPavilion)}</dd></div>
            <div><dt>Pontos de alimentação</dt><dd>{formatBRL(selectedScenario.foodPoints)}</dd></div>
            <div><dt>Estacionamento</dt><dd>{formatBRL(selectedScenario.parking)}</dd></div>
            <div className="is-total"><dt>Execução operacional</dt><dd>− {formatBRL(selectedScenario.operatingExecution)}</dd></div>
            <div><dt>Obrigações históricas</dt><dd>− {formatBRL(selectedScenario.historicalObligations)}</dd></div>
            <div><dt>Reserva</dt><dd>− {formatBRL(selectedScenario.reserve)}</dd></div>
          </dl>
        </FinancialPanel>
      </div>

      <DataQualityNote title="Valores literais dos cenários">
        <p>A capacidade Realista registrada é {formatBRL(financialScenarios[0].investmentCapacity)} — R$ 0,06 abaixo da ponte aritmética. A capacidade Otimista é {formatBRL(financialScenarios[2].investmentCapacity)} — R$ 0,04 acima. Os valores da fonte foram preservados.</p>
      </DataQualityNote>
    </div>
  );

  const renderReports = () => (
    <div className="financial-view-stack">
      <ExecutiveStrip items={[
        { label: 'Visões analíticas', value: String(financialReports.length), detail: 'Cobertura gerencial disponível' },
        { label: 'Fonte de dados', value: '3 abas', detail: 'Despesas, Receitas e PROJEÇÃO 2026' },
        { label: 'Exportação', value: 'Não habilitada', detail: 'Sem botão ou arquivo fictício' },
        { label: 'Persistência', value: 'Somente leitura', detail: 'Nenhuma gravação no Supabase' },
      ]} />
      <section className="financial-report-grid" aria-label="Catálogo de relatórios financeiros">
        {financialReports.map((report, index) => (
          <article key={report.id} className="financial-report-card">
            <span className="financial-report-card__index">{String(index + 1).padStart(2, '0')}</span>
            <div className="financial-report-card__icon"><FileChartColumn aria-hidden="true" /></div>
            <h2>{report.title}</h2>
            <p>{report.description}</p>
            <div className="financial-report-card__insight">
              <strong>Pergunta gerencial</strong>
              <span>{report.insight}</span>
            </div>
            <Link to={getModuleRoute(module, report.route)}>
              Abrir visão
              <ArrowRight aria-hidden="true" />
            </Link>
          </article>
        ))}
      </section>
      <DataQualityNote title="Relatórios honestos por construção" tone="information">
        <p>Os cartões direcionam para análises realmente disponíveis. Exportação PDF, conciliação contábil e trilha de alterações não foram simuladas porque não existem no escopo técnico atual.</p>
      </DataQualityNote>
    </div>
  );

  const viewContent: Record<FinancialViewPath, () => ReactNode> = {
    dashboard: renderDashboard,
    'receitas-projetadas': () => renderRevenues(false),
    'receitas-confirmadas': () => renderRevenues(true),
    'despesas-previstas': () => renderExpenses(false),
    'despesas-realizadas': () => renderExpenses(true),
    'orcamento-comissoes': renderCommissionBudgets,
    patrocinios: renderSponsorships,
    simulacoes: renderScenarios,
    relatorios: renderReports,
  };

  return (
    <div className="financial-management-page" data-financial-view={view}>
      <section className="financial-page-header">
        <div className="financial-page-header__main">
          <div className="financial-page-header__badges">
            <FinancialRestrictedBadge />
            <span className="financial-period-badge">Planejamento 2026</span>
          </div>
          <div className="financial-page-header__identity">
            <span className="financial-page-header__icon" aria-hidden="true"><viewCopy.icon /></span>
            <div>
              <p>{viewCopy.eyebrow}</p>
              <h1>{viewCopy.title}</h1>
            </div>
          </div>
          <p className="financial-page-header__description">{viewCopy.description}</p>
          <div className="financial-semantic-legend" aria-label="Hierarquia semântica dos valores">
            <FinancialStatusBadge status="projected" />
            <FinancialStatusBadge status="consolidated" />
            <FinancialStatusBadge status="receivable" />
            <FinancialStatusBadge status="realized" />
          </div>
        </div>
        <FinancialDataProvenance
          label="Base Orçamentária Fenasoja 2026"
          detail="Planilha oficial em modo somente leitura; sem persistência ou correção automática."
        />
      </section>

      {viewContent[view]()}

      <AboutFinancialModule module={module} activeDescription={activeMenu.description} />
    </div>
  );
}
