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
  BudgetStatusDonutChart,
  CommissionBudgetUtilizationChart,
  ExpenseCategoryDonutChart,
  ExpenseDistributionBarChart,
  ExpenseFundingStackedBarChart,
  ExpensePeriodComparisonChart,
  ExpenseTreemapChart,
  FinancialDistributionDonutChart,
  FundingSourceChart,
  RevenueComparisonChart,
  RevenueCompositionChart,
  ScenarioComparisonChart,
} from '@/features/financial-management/components/FinancialCharts';
import {
  BudgetProgress,
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
  groupExpensesByFundingSource,
  groupRevenuesByCategory,
  hasRealizedExpenseActivity,
  selectBudgetStatusComposition,
  selectExpenseLedgerTotal,
  selectExpenseVisualizationCoverage,
  selectGeneralBudgetSummaries,
  selectCommissionBudgets,
  selectOverBudgetCommissions,
  selectRevenueTotals,
  selectScenarioSummaries,
  selectSponsorTierDistribution,
  selectSponsorTotals,
  sortExpensesForLedger,
} from '@/features/financial-management/selectors/financialSelectors';
import {
  selectExpenseExecutionModel,
} from '@/features/financial-management/selectors/financialSelectors';
import type {
  ExpenseExecutionGroupingMode,
  ExpenseGroupingMode,
  ExpenseVisualizationCoverage,
} from '@/features/financial-management/selectors/financialSelectors';
import {
  ExpenseExecutionBoard,
  FundingDistributionStrip,
} from '@/features/financial-management/components/FinancialExecutiveBoard';
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
import '@/styles/financial-executive-panel.css';

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
  className,
}: {
  items: ReadonlyArray<{ label: string; value: ReactNode; detail?: string }>;
  className?: string;
}) {
  return (
    <dl className={cn('financial-executive-strip', className)}>
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

function ExpenseCoverageBand({
  coverage,
  availableLineCount,
}: {
  coverage: ExpenseVisualizationCoverage;
  availableLineCount: number;
}) {
  const geometryLineCount = coverage.positiveVisualLineCount + coverage.negativeVisualLineCount;
  const isFiltered = coverage.totalLineCount !== availableLineCount;

  return (
    <section className="financial-coverage-band" aria-label="Cobertura da base de despesas">
      <div className="financial-coverage-band__lead">
        <span className="financial-coverage-band__icon"><Layers3 aria-hidden="true" /></span>
        <div>
          <p>Cobertura integral</p>
          <strong>{coverage.representationPercentage}% da base preservada</strong>
          <span>{isFiltered ? 'Visualizações sincronizadas com o recorte ativo' : 'Todas as linhas seguem disponíveis nas camadas analítica e detalhada'}</span>
        </div>
      </div>
      <dl>
        <div>
          <dt>Linhas no recorte</dt>
          <dd>{coverage.totalLineCount}<small> de {availableLineCount}</small></dd>
        </div>
        <div>
          <dt>Atividade registrada</dt>
          <dd>{coverage.activeLineCount}</dd>
        </div>
        <div>
          <dt>Com área monetária</dt>
          <dd>{geometryLineCount}</dd>
        </div>
        <div>
          <dt>Sem área monetária</dt>
          <dd>{coverage.zeroVisualLineCount}<small> no ledger</small></dd>
        </div>
        <div>
          <dt>Valor visualizado</dt>
          <dd>{formatBRL(coverage.visualAmount)}</dd>
        </div>
      </dl>
    </section>
  );
}

function FinancialDisclosureSection({
  title,
  summary,
  meta,
  icon: Icon = BookOpenCheck,
  tone = 'neutral',
  children,
}: {
  title: string;
  summary: string;
  meta?: string;
  icon?: LucideIcon;
  tone?: 'neutral' | 'attention' | 'information';
  children: ReactNode;
}) {
  return (
    <details className={cn('financial-disclosure-section', `financial-disclosure-section--${tone}`)}>
      <summary>
        <span className="financial-disclosure-section__icon"><Icon aria-hidden="true" /></span>
        <span className="financial-disclosure-section__copy">
          <strong>{title}</strong>
          <small>{summary}</small>
        </span>
        {meta && <span className="financial-disclosure-section__meta">{meta}</span>}
      </summary>
      <div className="financial-disclosure-section__content">{children}</div>
    </details>
  );
}

function AboutFinancialModule({
  module,
  activeDescription,
  compact = false,
}: {
  module: CommissionModule;
  activeDescription: string;
  compact?: boolean;
}) {
  return (
    <details className={cn('financial-about', compact && 'financial-about--compact')}>
      <summary>
        <span>
          <BookOpenCheck aria-hidden="true" />
          {compact ? 'Fonte e metodologia' : 'Sobre esta visão e sua governança'}
        </span>
        {!compact && <span className="financial-about__hint">Base somente leitura</span>}
      </summary>
      <div className="financial-about__content">
        {!compact && (
          <div>
            <h2>Propósito atual</h2>
            <p>{activeDescription}</p>
          </div>
        )}
        <div>
          <h2>Fonte</h2>
          <p>{financial2026Source.workbook}, abas Despesas, Receitas e PROJEÇÃO 2026.</p>
        </div>
        <div>
          <h2>{compact ? 'Leitura' : 'Limite operacional'}</h2>
          <p>
            {compact
              ? 'Somente leitura: sem gravação, correção ou sincronização. A permissão financeira permanece inalterada.'
              : `A experiência não grava, corrige ou sincroniza valores no Supabase. ${module.name} continua protegido pela permissão financeira existente.`}
          </p>
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
  const isFlagshipFinanceView = view === 'dashboard'
    || view === 'receitas-projetadas'
    || view === 'receitas-confirmadas'
    || view === 'despesas-previstas'
    || view === 'despesas-realizadas'
    || view === 'orcamento-comissoes';

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
  const [executionGrouping, setExecutionGrouping] = useState<ExpenseExecutionGroupingMode>('commission');

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
    () => filteredExpenses.filter(hasRealizedExpenseActivity),
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
  const revenueComposition = revenueCategoryGroups.map((group) => ({
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

  const executionModel = useMemo(
    () => selectExpenseExecutionModel(expenses, executionGrouping),
    [expenses, executionGrouping],
  );
  const fundingDistribution = useMemo(() => {
    const registeredTotal = fundingData.reduce((total, item) => total + Math.max(item.amount, 0), 0);
    return ([
      { key: 'free-resource' as const, label: 'Recurso Livre', amount: financialWorkbookTotals.paidWithFreeResource },
      { key: 'municipality-plan' as const, label: 'Prefeitura / Plano de Trabalho', amount: financialWorkbookTotals.municipalityPlanAmount },
      { key: 'rouanet' as const, label: 'Lei Rouanet', amount: financialWorkbookTotals.rouanetAmount },
    ]).map((item) => ({
      ...item,
      registeredSharePercentage: registeredTotal > 0 ? (item.amount / registeredTotal) * 100 : 0,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderDashboard = () => (
    <div className="financial-view-stack financial-view-stack--executive">
      <section className="financial-exec-kpis" aria-label="Posição financeira executiva">
        <div className="financial-exec-kpis__block financial-exec-kpis__block--revenue">
          <h2 className="financial-exec-kpis__title">Receitas</h2>
          <div className="financial-exec-kpis__cards">
            <FinancialKpiCard
              label="Projetada"
              value={revenueTotals.projectedAmount}
              icon={TrendingUp}
              tone="projected"
              priority="primary"
              showStatus={false}
              animateValue
              className="financial-kpi-card--exec"
            />
            <FinancialKpiCard
              label="Consolidada"
              value={revenueTotals.consolidatedAmount}
              icon={CheckCircle2}
              tone="consolidated"
              priority="primary"
              showStatus={false}
              animateValue
              detail={`${formatPercentage(revenueTotals.consolidationRate)} da projeção`}
              className="financial-kpi-card--exec"
            />
            <FinancialKpiCard
              label="A receber"
              value={explicitReceivable}
              icon={CircleDollarSign}
              tone="receivable"
              priority="secondary"
              showStatus={false}
              animateValue
              className="financial-kpi-card--exec"
            />
            <FinancialKpiCard
              label="Lacuna de consolidação"
              value={revenueTotals.consolidationGapAmount}
              icon={TrendingDown}
              tone="gold"
              priority="secondary"
              showStatus={false}
              animateValue
              detail="Não equivale a A Receber"
              className="financial-kpi-card--exec"
            />
          </div>
        </div>

        <div className="financial-exec-kpis__block financial-exec-kpis__block--expense">
          <h2 className="financial-exec-kpis__title">Despesas</h2>
          <div className="financial-exec-kpis__cards">
            <FinancialKpiCard
              label="Previstas"
              value={executionModel.plannedTotal}
              icon={Layers3}
              tone="attention"
              priority="primary"
              showStatus={false}
              animateValue
              detail="Períodos 2025 + 2026"
              className="financial-kpi-card--exec financial-kpi-card--planned"
            />
            <FinancialKpiCard
              label="Realizadas"
              value={executionModel.realizedTotal}
              icon={ReceiptText}
              tone="realized"
              priority="primary"
              showStatus={false}
              animateValue
              detail={executionModel.hasExecutionRate
                ? `${formatPercentage(executionModel.executionPercentage)} do previsto`
                : 'Sem base de comparação'}
              className="financial-kpi-card--exec financial-kpi-card--realized"
            />
          </div>
        </div>

        <div className="financial-exec-kpis__block financial-exec-kpis__block--budget">
          <h2 className="financial-exec-kpis__title">Orçamento</h2>
          <div className="financial-exec-kpis__cards">
            <FinancialKpiCard
              label="Orçado"
              value={financialWorkbookTotals.coreCommissionBudgeted}
              icon={Calculator}
              tone="neutral"
              priority="secondary"
              showStatus={false}
              animateValue
              detail={`Teto ${formatBRL(financialWorkbookTotals.coreCommissionBudgetCap)}`}
              className="financial-kpi-card--exec"
            />
            <FinancialKpiCard
              label="Saldo"
              value={coreBudgetBalance}
              icon={PiggyBank}
              tone="neutral"
              priority="secondary"
              showStatus={false}
              animateValue
              detail={`${formatPercentage(coreBudgetUtilization)} utilizado`}
              className="financial-kpi-card--exec"
            />
          </div>
        </div>
      </section>

      <FinancialPanel
        title="Previsto versus realizado"
        description="Base completa de despesas agrupada; nenhuma linha é descartada."
        icon={ChartNoAxesCombined}
        className="financial-panel--execution"
      >
        <ExpenseExecutionBoard
          model={executionModel}
          grouping={executionGrouping}
          onGroupingChange={setExecutionGrouping}
        />
      </FinancialPanel>

      <FinancialPanel
        title="Pressão orçamentária"
        icon={BadgeDollarSign}
        action={<span className="financial-source-pill" title="Fonte: Despesas!B310">Despesas!B310</span>}
        className="financial-panel--budget-command"
      >
        <div className="financial-budget-command">
          <BudgetProgress
            label="Comissões"
            budgetCap={financialWorkbookTotals.coreCommissionBudgetCap}
            budgetedAmount={financialWorkbookTotals.coreCommissionBudgeted}
            remainingAmount={coreBudgetBalance}
            utilizationPercentage={coreBudgetUtilization}
            status="attention"
            compactAmounts={false}
          />
          <div className="financial-budget-risks" aria-label="Comissões acima do teto">
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

        <ExecutiveStrip
          className="financial-executive-strip--inside"
          items={[
            { label: 'Orçamento geral', value: formatBRL(financialWorkbookTotals.generalBudgeted), detail: `Teto ${formatBRL(financialWorkbookTotals.generalBudgetCap)}` },
            { label: 'Saldo geral', value: formatBRL(generalBudgetBalance), detail: `${formatPercentage(generalBudgetUtilization)} utilizado` },
            { label: 'Comissões acima do teto', value: String(overBudgetCommissions.length), detail: 'Marketing, Inovação e Experiência, Gastronomia' },
            { label: 'Capacidade realista', value: formatBRL(financialScenarios[0].investmentCapacity), detail: 'Capacidade registrada' },
          ]}
        />
      </FinancialPanel>

      <div className="financial-dashboard-grid">
        <FinancialPanel
          title="Receita por ecossistema"
          icon={BarChart3}
          className="financial-panel--span-7"
        >
          <RevenueComparisonChart data={revenueByEcosystem} height={400} />
        </FinancialPanel>
        <FinancialPanel
          title="Composição projetada"
          icon={Layers3}
          className="financial-panel--span-5"
        >
          <RevenueCompositionChart data={revenueComposition} height={400} />
        </FinancialPanel>
      </div>

      <div className="financial-dashboard-grid">
        <FinancialPanel
          title="10 maiores orçamentos"
          description="Ranking executivo; não representa a base completa."
          icon={ChartNoAxesCombined}
          className="financial-panel--span-7 financial-panel--ranking"
        >
          <CommissionBudgetUtilizationChart
            data={topCommissionBudgets}
            forceMotion
            variant="executive"
          />
        </FinancialPanel>
        <FinancialPanel
          title="Origem dos recursos"
          icon={Landmark}
          className="financial-panel--span-5 financial-panel--funding"
        >
          <FundingDistributionStrip data={fundingDistribution} />
        </FinancialPanel>
      </div>

      <DataQualityNote title="Conciliação da fonte">
        <p>Realizado oficial: {formatBRL(coreRealizedAmount)}. Períodos 2025 + 2026: {formatBRL(periodBridgeTotal)}. Diferença: {formatBRL(periodIntegrityDelta)}, na linha 14 (valor em 2026 e consolidado vazio).</p>
      </DataQualityNote>
    </div>
  );

          className="financial-panel--span-5"
        >
          <FundingSourceChart data={fundingData} forceMotion variant="executive" />
        </FinancialPanel>
      </div>

      <DataQualityNote title="Conciliação da fonte">
        <p>Realizado oficial: {formatBRL(coreRealizedAmount)}. Períodos 2025 + 2026: {formatBRL(periodBridgeTotal)}. Diferença: {formatBRL(periodIntegrityDelta)}, na linha 14 (valor em 2026 e consolidado vazio).</p>
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
      .map((group) => ({
        id: group.key,
        label: group.label,
        amount: confirmed ? group.consolidatedAmount : group.projectedAmount,
      }));
    const comparisonPanel = (
      <FinancialPanel
        title="Projetado versus consolidado"
        description="A diferença indica lacuna de consolidação — não A Receber."
        icon={BarChart3}
        className={confirmed ? 'financial-panel--span-7' : 'financial-panel--span-5'}
      >
        <RevenueComparisonChart data={filteredRevenueByEcosystem} height={442} />
      </FinancialPanel>
    );
    const compositionPanel = (
      <FinancialPanel
        title={confirmed ? 'Consolidado por categoria' : 'Projeção por categoria'}
        icon={Layers3}
        className={confirmed ? 'financial-panel--span-5' : 'financial-panel--span-7'}
      >
        <RevenueCompositionChart
          data={composition}
          height={442}
          title={confirmed ? 'Receita consolidada por categoria' : 'Receita projetada por categoria'}
          summary={`Composição da receita ${confirmed ? 'consolidada' : 'projetada'} por categoria.`}
        />
      </FinancialPanel>
    );

    return (
      <div className="financial-view-stack">
        {confirmed ? (
          <>
            <FinancialKpiGrid columns={4} className="financial-kpi-grid--decision" aria-label="Posição das receitas confirmadas">
              <FinancialKpiCard
                label="Consolidado"
                value={filteredTotals.consolidatedAmount}
                status="consolidated"
                showStatus={false}
                icon={CheckCircle2}
                tone="consolidated"
                priority="primary"
                animateValue
              />
              <FinancialKpiCard
                label="Taxa de consolidação"
                value={filteredTotals.consolidationRate}
                valueKind="percentage"
                icon={Target}
                tone="neutral"
                priority="primary"
                animateValue
                detail="Consolidado ÷ projetado"
              />
              <FinancialKpiCard
                label="A receber informado"
                value={filteredTotals.explicitReceivableAmount}
                status="receivable"
                showStatus={false}
                icon={CircleDollarSign}
                tone="receivable"
                priority="primary"
                animateValue
              />
              <FinancialKpiCard
                label="Lacuna de consolidação"
                value={filteredTotals.consolidationGapAmount}
                status="partial"
                icon={TrendingDown}
                tone="gold"
                priority="primary"
                animateValue
                detail="Não equivale a A Receber"
              />
            </FinancialKpiGrid>
            <FinancialKpiGrid columns={2} className="financial-kpi-grid--secondary" aria-label="Composição consolidada por recurso">
              <FinancialKpiCard label="Patrocínio livre consolidado" value={filteredFreeConsolidated} icon={WalletCards} tone="consolidated" priority="secondary" animateValue />
              <FinancialKpiCard label="Rouanet consolidado" value={filteredRouanetConsolidated} icon={Landmark} tone="consolidated" priority="secondary" animateValue />
            </FinancialKpiGrid>
          </>
        ) : (
          <>
            <FinancialKpiGrid columns={4} className="financial-kpi-grid--decision" aria-label="Composição executiva das receitas projetadas">
              <FinancialKpiCard
                label="Total projetado"
                value={filteredTotals.projectedAmount}
                status="projected"
                showStatus={false}
                icon={TrendingUp}
                tone="projected"
                priority="primary"
                animateValue
              />
              <FinancialKpiCard label="Patrocínio livre projetado" value={filteredFreeProjected} icon={WalletCards} tone="projected" priority="primary" animateValue />
              <FinancialKpiCard label="Comercialização projetada" value={filteredCommercialTotals.projectedAmount} icon={Banknote} tone="projected" priority="primary" animateValue />
              <FinancialKpiCard label="Rouanet projetado" value={filteredRouanetProjected} icon={Landmark} tone="projected" priority="primary" animateValue />
            </FinancialKpiGrid>
            <ExecutiveStrip
              className="financial-executive-strip--revenue"
              items={[
                { label: 'Consolidado', value: formatBRL(filteredTotals.consolidatedAmount), detail: `${formatPercentage(filteredTotals.consolidationRate)} da projeção` },
                { label: 'Lacuna de consolidação', value: formatBRL(filteredTotals.consolidationGapAmount), detail: 'Não equivale a A Receber' },
                { label: 'A receber informado', value: formatBRL(filteredTotals.explicitReceivableAmount), detail: 'Campo explícito da fonte' },
                { label: 'Fontes na visão', value: String(filteredRevenues.length), detail: `${revenueSources.length} no total` },
              ]}
            />
          </>
        )}

        <div className="financial-dashboard-grid financial-dashboard-grid--revenue">
          {confirmed ? (
            <>{comparisonPanel}{compositionPanel}</>
          ) : (
            <>{compositionPanel}{comparisonPanel}</>
          )}
        </div>

        <FinancialPanel
          title={confirmed ? 'Receitas consolidadas por fonte' : 'Receitas projetadas por fonte'}
          icon={FileSpreadsheet}
          className="financial-panel--revenue-ledger"
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

      </div>
    );
  };

  const renderExpenses = (realized: boolean) => {
    const mode = realized ? 'realized' : 'planning';
    const availableRows = expenses;
    const chartRows = realized ? realizedExpenses : filteredExpenses;
    const rows = sortExpensesForLedger(filteredExpenses, mode, expenseGrouping);
    const visibleAmount = selectExpenseLedgerTotal(rows, mode);
    const coverage = selectExpenseVisualizationCoverage(filteredExpenses, mode);
    const categoryGroups = groupExpensesByCategory(chartRows);
    const commissionGroups = groupExpensesByCommission(chartRows);
    const fundingComposition = groupExpensesByFundingSource(chartRows);
    const registeredFundingTotal = roundCurrency(
      fundingComposition.reduce((total, item) => total + item.amount, 0),
    );
    const hasActiveExpenseFilters = Boolean(
      expenseSearch || expenseCommission !== 'all' || expenseCategory !== 'all',
    );
    return (
      <div className="financial-view-stack">
        {realized ? (
          <FinancialKpiGrid columns={5} className="financial-kpi-grid--decision financial-kpi-grid--five">
            <FinancialKpiCard label="Total realizado" value={coreRealizedAmount} status="realized" icon={Banknote} tone="consolidated" priority="primary" animateValue sourceLabel="Despesas · coluna Realizado" />
            <FinancialKpiCard label="Recurso Livre" value={financialWorkbookTotals.paidWithFreeResource} icon={WalletCards} tone="gold" priority="primary" animateValue sourceLabel="Despesas · Recurso Livre" />
            <FinancialKpiCard label="Prefeitura / Plano de Trabalho" value={financialWorkbookTotals.municipalityPlanAmount} icon={Landmark} tone="neutral" priority="secondary" animateValue sourceLabel="Despesas · Prefeitura" />
            <FinancialKpiCard label="Lei Rouanet" value={financialWorkbookTotals.rouanetAmount} icon={FileSpreadsheet} tone="projected" priority="secondary" animateValue sourceLabel="Despesas · Lei Rouanet" />
            <FinancialKpiCard label="Maior execução por comissão" value={highestExecutionCommission?.realizedAmount ?? 0} icon={TrendingUp} tone="neutral" priority="secondary" animateValue detail={highestExecutionCommission?.label ?? 'Sem comissão'} sourceLabel="Agrupamento por comissão" />
          </FinancialKpiGrid>
        ) : (
          <FinancialKpiGrid columns={5} className="financial-kpi-grid--decision financial-kpi-grid--five">
            <FinancialKpiCard label="Teto das comissões" value={financialWorkbookTotals.coreCommissionBudgetCap} icon={Target} tone="neutral" priority="primary" animateValue sourceLabel="Cabeçalhos das comissões" />
            <FinancialKpiCard label="Orçado até o momento" value={financialWorkbookTotals.coreCommissionBudgeted} status="attention" icon={ReceiptText} tone="gold" priority="primary" animateValue sourceLabel="Cabeçalhos das comissões" />
            <FinancialKpiCard label="Período 2025" value={period2025Total} icon={ReceiptText} tone="neutral" priority="secondary" animateValue sourceLabel="Despesas · 2025" />
            <FinancialKpiCard label="Período 2026" value={period2026Total} icon={ReceiptText} tone="projected" priority="secondary" animateValue sourceLabel="Despesas · 2026" />
            <FinancialKpiCard label="Saldo das comissões" value={coreBudgetBalance} icon={WalletCards} tone="consolidated" priority="secondary" animateValue sourceLabel="Teto menos orçado" />
          </FinancialKpiGrid>
        )}

        <section className="financial-analysis-toolbar" aria-label="Filtros das visualizações de despesas">
          <div className="financial-analysis-toolbar__heading">
            <span><Search aria-hidden="true" /></span>
            <div>
              <strong>Explorar a base completa</strong>
              <small>Gráficos e detalhamento respondem ao mesmo recorte.</small>
            </div>
          </div>
          <FinancialFilterBar resultLabel={`${rows.length} de ${availableRows.length} despesas · ${formatBRL(visibleAmount)}`}>
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
        </section>

        <ExpenseCoverageBand coverage={coverage} availableLineCount={availableRows.length} />

        {realized ? (
          <>
            <div className="financial-analytics-grid">
              <FinancialPanel
                title="Distribuição entre origens declaradas"
                description="Participação no subtotal preenchido; não representa a composição integral do realizado."
                icon={CircleDollarSign}
                className="financial-panel--span-5"
              >
                <FinancialDistributionDonutChart
                  data={fundingComposition.map((item) => ({
                    id: item.key,
                    label: item.label,
                    value: item.amount,
                    detail: `${formatPercentage(item.registeredSharePercentage)} entre as origens declaradas`,
                  }))}
                  centerLabel="Origens declaradas"
                  centerValue={registeredFundingTotal}
                  title="Distribuição entre origens declaradas"
                  summary="As três colunas de origem são independentes e não exaustivas."
                  forceMotion
                />
              </FinancialPanel>
              <FinancialPanel title="Execução por categoria" icon={BarChart3} className="financial-panel--span-7">
                <ExpenseDistributionBarChart data={categoryGroups} mode="realized" dimension="category" forceMotion />
              </FinancialPanel>
            </div>
            <FinancialPanel
              title="Mapa completo da execução"
              description="Categoria → despesa. Todas as linhas do recorte permanecem no sistema em camadas."
              icon={Layers3}
              className="financial-panel--treemap"
            >
              <ExpenseTreemapChart expenses={filteredExpenses} mode="realized" forceMotion height={620} mobileHeight={520} />
            </FinancialPanel>
            <div className="financial-analytics-grid">
              <FinancialPanel title="Execução por comissão" icon={ChartNoAxesCombined} className="financial-panel--span-6">
                <ExpenseDistributionBarChart data={commissionGroups} mode="realized" dimension="commission" forceMotion />
              </FinancialPanel>
              <FinancialPanel
                title="Origens declaradas por comissão"
                description="Barras empilhadas sobre o subtotal declarado, sem inferir cobertura total."
                icon={Landmark}
                className="financial-panel--span-6"
              >
                <ExpenseFundingStackedBarChart expenses={chartRows} forceMotion />
              </FinancialPanel>
            </div>
          </>
        ) : (
          <>
            <div className="financial-analytics-grid">
              <FinancialPanel title="Composição por categoria" icon={CircleDollarSign} className="financial-panel--span-5">
                <ExpenseCategoryDonutChart data={categoryGroups} mode="planning" forceMotion />
              </FinancialPanel>
              <FinancialPanel title="Planejamento 2025 × 2026" icon={BarChart3} className="financial-panel--span-7">
                <ExpensePeriodComparisonChart data={categoryGroups} forceMotion />
              </FinancialPanel>
            </div>
            <FinancialPanel
              title="Mapa completo das despesas previstas"
              description="Categoria → despesa, com o valor integral do recorte e acesso ao detalhamento abaixo."
              icon={Layers3}
              className="financial-panel--treemap"
            >
              <ExpenseTreemapChart expenses={filteredExpenses} mode="planning" forceMotion height={620} mobileHeight={520} />
            </FinancialPanel>
            <div className="financial-analytics-grid">
              <FinancialPanel title="Distribuição por comissão" icon={ChartNoAxesCombined} className="financial-panel--span-6">
                <ExpenseDistributionBarChart data={commissionGroups} mode="planning" dimension="commission" forceMotion />
              </FinancialPanel>
              <FinancialPanel title="Categorias em comparação" icon={BarChart3} className="financial-panel--span-6">
                <ExpenseDistributionBarChart data={categoryGroups} mode="planning" dimension="category" forceMotion />
              </FinancialPanel>
            </div>
          </>
        )}

        <FinancialPanel title={realized ? 'Base realizada detalhada' : 'Base planejada detalhada'} icon={realized ? Banknote : ReceiptText} className="financial-panel--ledger">
          <ExpenseLedger expenses={rows} mode={mode} emptyFromSearch={hasActiveExpenseFilters} />
        </FinancialPanel>

        {!realized && (
          <>
            <FinancialDisclosureSection
              title="Reconciliação dos períodos"
              summary="2025 + 2026 divergem da coluna Realizado na linha 14."
              meta={`Diferença ${formatBRL(periodIntegrityDelta)}`}
              icon={AlertTriangle}
              tone="attention"
            >
              <div className="financial-governance-copy">
                <p>Os períodos somam <strong>{formatBRL(periodBridgeTotal)}</strong>, enquanto o realizado oficial registra <strong>{formatBRL(coreRealizedAmount)}</strong>. A diferença de <strong>{formatBRL(periodIntegrityDelta)}</strong> permanece visível e não é corrigida silenciosamente.</p>
              </div>
            </FinancialDisclosureSection>
            <FinancialDisclosureSection
              title="Orçamento geral fora das comissões"
              summary="Linhas 311–342, mantidas fora dos tetos de comissão."
              meta={`${generalBudgetItems.length} itens · ${formatBRL(generalBudgetSummaries.reduce((total, item) => total + item.budgetedAmount, 0))}`}
              icon={Landmark}
            >
              <ExecutiveStrip className="financial-executive-strip--inside" items={[
                { label: 'Obrigações históricas', value: formatBRL(historicalBudgetSummary?.budgetedAmount ?? 0), detail: `${historicalBudgetSummary?.itemCount ?? 0} itens` },
                { label: 'Teto histórico', value: formatBRL(historicalBudgetSummary?.budgetCap ?? 0), detail: `Saldo ${formatBRL(historicalBudgetSummary?.remainingAmount ?? 0)}` },
                { label: 'Investimentos / obras', value: formatBRL(investmentBudgetSummary?.budgetedAmount ?? 0), detail: `${investmentBudgetSummary?.itemCount ?? 0} itens` },
                { label: 'Teto de investimentos', value: formatBRL(investmentBudgetSummary?.budgetCap ?? 0), detail: `Saldo ${formatBRL(investmentBudgetSummary?.remainingAmount ?? 0)}` },
              ]} />
              <GeneralBudgetLedger items={generalBudgetItems} />
            </FinancialDisclosureSection>
          </>
        )}

        {realized && (
          <FinancialDisclosureSection
            title="Integridade e limites da fonte"
            summary="Reconciliação oficial e cobertura das origens declaradas."
            meta="2 notas"
            icon={AlertTriangle}
            tone="attention"
          >
            <div className="financial-disclosure-note-grid">
              <DataQualityNote title="A soma dos períodos não fecha com o realizado oficial">
                <p>2025 + 2026 soma {formatBRL(periodBridgeTotal)}, enquanto a coluna realizado registra {formatBRL(coreRealizedAmount)}. A diferença de {formatBRL(periodIntegrityDelta)} está na linha 14 e permanece visível como questão de qualidade da fonte.</p>
              </DataQualityNote>
              <DataQualityNote title="Origens não exaustivas" tone="information">
                <p>Recurso Livre, Prefeitura / Plano de Trabalho e Lei Rouanet são campos independentes. O subtotal declarado não substitui a coluna Realizado.</p>
              </DataQualityNote>
            </div>
          </FinancialDisclosureSection>
        )}
      </div>
    );
  };

  const renderCommissionBudgets = () => {
    const budgetStatusComposition = selectBudgetStatusComposition(commissionBudgets);
    const countByStatus = (status: (typeof budgetStatusComposition)[number]['status']) => (
      budgetStatusComposition.find((item) => item.status === status)?.commissionCount ?? 0
    );
    const budgetsByAmount = [...commissionBudgets].sort((left, right) => (
      right.budgetedAmount - left.budgetedAmount
    ));
    const budgetsByPressure = [...commissionBudgets].sort((left, right) => {
      if (left.status === 'no-budget-cap') return 1;
      if (right.status === 'no-budget-cap') return -1;
      return right.utilizationPercentage - left.utilizationPercentage;
    });

    return (
      <div className="financial-view-stack">
        <FinancialKpiGrid columns={5} className="financial-kpi-grid--decision financial-kpi-grid--five">
          <FinancialKpiCard label="Teto das comissões" value={financialWorkbookTotals.coreCommissionBudgetCap} icon={Target} tone="neutral" priority="primary" animateValue sourceLabel="Cabeçalhos das comissões" />
          <FinancialKpiCard label="Orçado" value={financialWorkbookTotals.coreCommissionBudgeted} status="attention" icon={BadgeDollarSign} tone="gold" priority="primary" animateValue sourceLabel="Cabeçalhos das comissões" />
          <FinancialKpiCard label="Saldo" value={coreBudgetBalance} icon={WalletCards} tone="consolidated" priority="secondary" animateValue sourceLabel="Teto menos orçado" />
          <FinancialKpiCard label="Utilização" value={coreBudgetUtilization} valueKind="percentage" icon={Calculator} tone="gold" priority="secondary" animateValue sourceLabel="Orçado sobre teto" />
          <FinancialKpiCard label="Acima do teto" value={overBudgetCommissions.length} valueKind="number" status="over-budget" icon={AlertTriangle} tone="over-budget" priority="secondary" animateValue sourceLabel="Faixa acima de 100%" />
        </FinancialKpiGrid>

        <ExecutiveStrip className="financial-executive-strip--budget-coverage" items={[
          { label: 'Cobertura do portfólio', value: `${commissionBudgets.length} de ${commissionBudgets.length}`, detail: 'Todas as comissões' },
          { label: 'Dentro do esperado', value: String(countByStatus('normal')), detail: 'Abaixo de 80%' },
          { label: 'Em atenção', value: String(countByStatus('attention')), detail: 'Entre 80% e 95%' },
          { label: 'Próximas do teto', value: String(countByStatus('near-limit')), detail: 'Entre 95% e 100%' },
          { label: 'Acima do teto', value: String(countByStatus('over-budget')), detail: 'Excesso real' },
          { label: 'Sem teto definido', value: String(countByStatus('no-budget-cap')), detail: 'Exceção preservada' },
        ]} />

        <div className="financial-analytics-grid">
          <FinancialPanel title="Composição do status orçamentário" icon={CircleDollarSign} className="financial-panel--span-5">
            <BudgetStatusDonutChart budgets={commissionBudgets} forceMotion />
          </FinancialPanel>
          <FinancialPanel
            title="Teto × orçado — visão absoluta"
            description="25 comissões na mesma escala monetária."
            icon={ChartNoAxesCombined}
            className="financial-panel--span-7"
          >
            <CommissionBudgetUtilizationChart
              data={budgetsByAmount}
              title="Teto e valor orçado de todas as comissões"
              summary="Comparação monetária absoluta, sem truncar o portfólio."
              height={760}
              mobileHeight={680}
              forceMotion
            />
          </FinancialPanel>
        </div>

        <FinancialPanel
          title="Pressão orçamentária comissão a comissão"
          description="Escala relativa por linha para comparar utilização sem apagar comissões menores."
          icon={Target}
          className="financial-panel--budget-pressure"
        >
          <CommissionBudgetUtilizationChart
            data={budgetsByPressure}
            title="Utilização completa por comissão"
            summary="Bullet chart relativo com teto, orçado, excesso e status para todas as comissões."
            forceMotion
            variant="executive"
            scaleMode="relative"
          />
        </FinancialPanel>

        <FinancialPanel title="Posição completa por comissão" description="Todas as comissões, ordenáveis e detalháveis." icon={BadgeDollarSign} className="financial-panel--ledger">
          <CommissionBudgetLedger budgets={commissionBudgets} />
        </FinancialPanel>

        <FinancialDisclosureSection
          title="Faixas de leitura e exceções"
          summary="Limiar visual para decisão; não altera regras contábeis."
          meta="1 comissão sem teto"
          icon={AlertTriangle}
          tone="information"
        >
          <div className="financial-governance-copy">
            <p><strong>Atenção</strong> a partir de 80%; <strong>próximo do teto</strong> a partir de 95%; <strong>acima do teto</strong> somente acima de 100%.</p>
            <p>Indústria, Comércio e Serviços possui teto e orçamento iguais a zero na fonte. O estado “Sem teto definido” evita uma leitura enganosa de 0% como desempenho normal.</p>
          </div>
        </FinancialDisclosureSection>
      </div>
    );
  };

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
    <div
      className="financial-management-page"
      data-financial-view={view}
      data-financial-motion={isFlagshipFinanceView ? 'full' : 'system'}
    >
      <section className={cn('financial-page-header', isFlagshipFinanceView && 'financial-page-header--executive')}>
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
          {!isFlagshipFinanceView && (
            <>
              <p className="financial-page-header__description">{viewCopy.description}</p>
              <div className="financial-semantic-legend" aria-label="Hierarquia semântica dos valores">
                <FinancialStatusBadge status="projected" />
                <FinancialStatusBadge status="consolidated" />
                <FinancialStatusBadge status="receivable" />
                <FinancialStatusBadge status="realized" />
              </div>
            </>
          )}
        </div>
        <FinancialDataProvenance
          label="Base Orçamentária Fenasoja 2026"
          detail={isFlagshipFinanceView
            ? 'Planilha oficial · somente leitura'
            : 'Planilha oficial em modo somente leitura; sem persistência ou correção automática.'}
        />
      </section>

      {viewContent[view]()}

      <AboutFinancialModule
        module={module}
        activeDescription={activeMenu.description}
        compact={isFlagshipFinanceView}
      />
    </div>
  );
}
