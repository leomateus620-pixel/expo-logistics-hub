import type {
  BudgetAttentionStatus,
  CommissionBudget,
  CommissionBudgetSource,
  ExpenseCategory,
  FinancialExpense,
  FinancialExpenseSourceRow,
  FinancialRevenue,
  FinancialScenario,
  FinancialSemanticStatus,
  FundingType,
  GeneralBudgetItem,
  GeneralBudgetItemKind,
  ScenarioId,
  Sponsor,
  SponsorTier,
} from '../types';
import { roundCurrency } from '../utils/financialFormatters';

const SPONSOR_TIER_ORDER: readonly SponsorTier[] = [
  'Grão de Ouro',
  'Ouro',
  'Prata',
  'Bronze',
  'Soy Summit',
  'Outros Apoios',
  'Não classificado',
];

const BUDGET_STATUS_COMPOSITION_ORDER: readonly BudgetAttentionStatus[] = [
  'normal',
  'attention',
  'near-limit',
  'over-budget',
  'no-budget-cap',
];

export type ExpenseFundingSource = 'free-resource' | 'municipality-plan' | 'rouanet';

export interface RevenueTotals {
  projectedAmount: number;
  consolidatedAmount: number;
  /** Sum of the workbook's explicit A Receber field. Never inferred from the gap. */
  explicitReceivableAmount: number;
  consolidationGapAmount: number;
  consolidationRate: number;
}

export interface ExpenseGroupSummary<Key extends string = string> {
  key: Key;
  label: string;
  expenseCount: number;
  value2025Amount: number;
  value2026Amount: number;
  realizedAmount: number;
}

export interface CommissionExpenseGroupSummary extends ExpenseGroupSummary {
  budgetCap: number;
  /** Orçado até o momento informado no cabeçalho da comissão. */
  budgetedAmount: number;
  remainingAmount: number;
  utilizationPercentage: number;
  status: BudgetAttentionStatus;
}

export interface ExpenseFundingSummary {
  key: ExpenseFundingSource;
  label: string;
  amount: number;
  /** Share only among the three registered source columns; not a share of realized expenses. */
  registeredSharePercentage: number;
}

/**
 * Commission-level reading of the workbook's registered-origin columns.
 *
 * The three origin amounts are intentionally exposed independently. They are
 * neither exhaustive nor guaranteed to form a partition of `realizedAmount`,
 * so this view model deliberately does not provide a combined origin total or
 * a share of realized expenses.
 */
export interface CommissionExpenseFundingSummary {
  commissionId: string;
  commission: string;
  expenseCount: number;
  realizedAmount: number;
  freeResourceAmount: number;
  municipalityPlanAmount: number;
  rouanetAmount: number;
}

export interface BudgetStatusCompositionSummary {
  status: BudgetAttentionStatus;
  commissionCount: number;
  budgetCap: number;
  budgetedAmount: number;
  balanceAmount: number;
}

export type ExpenseLedgerMode = 'planning' | 'realized';
export type ExpenseGroupingMode = 'commission' | 'category' | 'value' | 'period';

/**
 * Coverage contract for layered expense visualizations.
 *
 * Amount-bearing rows can be represented by charts while zero-value and
 * negative-value rows remain explicitly represented by the complete ledger.
 * `activeLineCount` is broader than `positiveVisualLineCount` in realized
 * mode because a row may register a funding origin while its realized anchor
 * remains zero.
 */
export interface ExpenseVisualizationCoverage {
  mode: ExpenseLedgerMode;
  totalLineCount: number;
  activeLineCount: number;
  positiveVisualLineCount: number;
  zeroVisualLineCount: number;
  negativeVisualLineCount: number;
  ledgerLineCount: number;
  representedLineCount: number;
  representationPercentage: number;
  visualAmount: number;
  activeExpenseIds: string[];
  positiveVisualExpenseIds: string[];
  negativeVisualExpenseIds: string[];
  zeroValueLedgerExpenseIds: string[];
  ledgerExpenseIds: string[];
  representedExpenseIds: string[];
}

export interface RevenueReceiptStatus {
  status: FinancialSemanticStatus;
  label: string;
}

export interface GeneralBudgetSummary {
  kind: GeneralBudgetItemKind;
  itemCount: number;
  budgetCap: number;
  budgetedAmount: number;
  remainingAmount: number;
}

export interface RevenueGroupSummary<Key extends string = string> {
  key: Key;
  label: string;
  revenueCount: number;
  projectedAmount: number;
  consolidatedAmount: number;
  explicitReceivableAmount: number;
  consolidationGapAmount: number;
  consolidationRate: number;
}

export interface SponsorTotals {
  sponsorCount: number;
  /** Sponsors with at least one explicit, non-zero financial value in the workbook. */
  financialSponsorCount: number;
  declaredValue: number;
  projectedFreeResource: number;
  consolidatedFreeResource: number;
  explicitReceivableAmount: number;
  projectedRouanet: number;
  consolidatedRouanet: number;
  totalProjectedAmount: number;
  totalConsolidatedAmount: number;
  consolidationGapAmount: number;
  consolidationRate: number;
  vehicleCredentials: number;
  soySummitCredentials: number;
  inKindContributionCount: number;
}

export interface SponsorTierDistribution extends SponsorTotals {
  tier: SponsorTier;
  sponsorSharePercentage: number;
  projectedSharePercentage: number;
  consolidatedSharePercentage: number;
}

export interface SponsorResourceMixPart {
  projectedAmount: number;
  consolidatedAmount: number;
  consolidationGapAmount: number;
  consolidationRate: number;
  projectedSharePercentage: number;
  consolidatedSharePercentage: number;
}

export interface SponsorResourceMix {
  freeResource: SponsorResourceMixPart;
  rouanet: SponsorResourceMixPart;
}

export interface SponsorshipPortfolioFlags {
  hasFinancialValue: boolean;
  hasProjectedValue: boolean;
  hasConsolidatedValue: boolean;
  hasExplicitReceivable: boolean;
  hasReceivableNote: boolean;
  hasInKindContribution: boolean;
  hasSourceQualityFlag: boolean;
}

export interface SponsorshipPortfolioItem {
  rank: number;
  sponsor: Sponsor;
  projectedAmount: number;
  consolidatedAmount: number;
  consolidationGapAmount: number;
  consolidationRate: number;
  /** Share of the complete portfolio's projected amount. */
  sharePercentage: number;
  /** Cumulative projected share in Pareto order. */
  cumulativeSharePercentage: number;
  resourceMix: SponsorResourceMix;
  flags: SponsorshipPortfolioFlags;
}

export type SponsorshipResourceKey = 'free-resource' | 'rouanet';

export interface SponsorshipResourceCompositionItem extends SponsorResourceMixPart {
  key: SponsorshipResourceKey;
  label: string;
}

export interface SponsorshipConcentrationSegment {
  limit: 5 | 10 | 20;
  sponsorCount: number;
  projectedAmount: number;
  sharePercentage: number;
}

export interface SponsorshipConcentration {
  top5SharePercentage: number;
  top10SharePercentage: number;
  top20SharePercentage: number;
  segments: SponsorshipConcentrationSegment[];
}

export interface SponsorshipIntelligence {
  totals: SponsorTotals;
  tiers: SponsorTierDistribution[];
  /** Complete portfolio, including zero-value rows, ordered for a Pareto reading. */
  portfolio: SponsorshipPortfolioItem[];
  resourceComposition: {
    freeResource: SponsorshipResourceCompositionItem;
    rouanet: SponsorshipResourceCompositionItem;
  };
  concentration: SponsorshipConcentration;
}

export interface FinancialScenarioSummary {
  id: ScenarioId;
  label: string;
  commercialization: number;
  exporural: number;
  externalArea: number;
  agroindustryPavilion: number;
  foodPoints: number;
  parking: number;
  commercialRevenue: number;
  freeSponsorship: number;
  rouanetSponsorship: number;
  sponsorshipRevenue: number;
  totalRevenue: number;
  operatingExecution: number;
  historicalObligations: number;
  reserve: number;
  totalCommitments: number;
  investmentCapacity: number;
  negativeResult: number;
}

export type ScenarioBridgeStepKey =
  | 'commercial-revenue'
  | 'free-sponsorship'
  | 'rouanet-sponsorship'
  | 'total-revenue'
  | 'operating-execution'
  | 'historical-obligations'
  | 'reserve'
  | 'literal-result';

export type ScenarioBridgeStepKind = 'positive' | 'subtotal' | 'negative' | 'result';

export interface ScenarioBridgeStep {
  key: ScenarioBridgeStepKey;
  label: string;
  kind: ScenarioBridgeStepKind;
  /** Literal source amount. `kind` defines whether it adds, subtracts, or anchors. */
  amount: number;
  signedAmount: number;
  startAmount: number;
  endAmount: number;
  runningTotal: number;
}

export interface ScenarioBridge {
  scenarioId: ScenarioId;
  steps: ScenarioBridgeStep[];
  computedResult: number;
  literalResult: number;
  resultKind: 'capacity' | 'deficit' | 'balanced';
  /** Literal result minus the arithmetically computed bridge. */
  reconciliationDelta: number;
}

export type ScenarioContributionKey =
  | 'commercialization'
  | 'exporural'
  | 'external-area'
  | 'agroindustry-pavilion'
  | 'food-points'
  | 'parking'
  | 'free-sponsorship'
  | 'rouanet-sponsorship'
  | 'operating-execution'
  | 'historical-obligations'
  | 'reserve';

export interface ScenarioContribution {
  key: ScenarioContributionKey;
  label: string;
  direction: 'positive' | 'negative';
  /** Literal source amount, before applying contribution direction. */
  amount: number;
  signedAmount: number;
  /** Share within positive sources or within commitments, according to direction. */
  sharePercentage: number;
}

function roundPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  return sign * (Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100);
}

function sumCurrency(values: Iterable<number>): number {
  let cents = 0;
  for (const value of values) {
    cents += Math.round(roundCurrency(value) * 100);
  }
  return roundCurrency(cents / 100);
}

function percentageOf(numerator: number, denominator: number): number {
  if (!Number.isFinite(denominator) || denominator === 0) return 0;
  return roundPercentage((numerator / denominator) * 100);
}

function normalizeExpense(expense: FinancialExpenseSourceRow): FinancialExpenseSourceRow {
  return {
    ...expense,
    value2025: roundCurrency(expense.value2025),
    value2026: roundCurrency(expense.value2026),
    realizedAmount: roundCurrency(expense.realizedAmount),
    paidWithFreeResource: roundCurrency(expense.paidWithFreeResource),
    municipalityPlanAmount: roundCurrency(expense.municipalityPlanAmount),
    rouanetAmount: roundCurrency(expense.rouanetAmount),
    paidMarkerAmount: roundCurrency(expense.paidMarkerAmount),
  };
}

export function selectRevenueTotals(revenues: readonly FinancialRevenue[]): RevenueTotals {
  const projectedAmount = sumCurrency(revenues.map((revenue) => revenue.projectedAmount));
  const consolidatedAmount = sumCurrency(revenues.map((revenue) => revenue.consolidatedAmount));

  return {
    projectedAmount,
    consolidatedAmount,
    explicitReceivableAmount: sumCurrency(revenues.map((revenue) => revenue.receivableAmount)),
    consolidationGapAmount: roundCurrency(projectedAmount - consolidatedAmount),
    consolidationRate: percentageOf(consolidatedAmount, projectedAmount),
  };
}

export function calculateRevenueGap(revenue: FinancialRevenue): number {
  return roundCurrency(revenue.projectedAmount - revenue.consolidatedAmount);
}

export function classifyRevenueConsolidationStatus(
  revenue: FinancialRevenue,
): FinancialSemanticStatus {
  if (revenue.projectedAmount === 0 && revenue.consolidatedAmount === 0) return 'unreported';
  if (revenue.consolidatedAmount >= revenue.projectedAmount) return 'consolidated';
  if (revenue.consolidatedAmount > 0) return 'partial';
  return 'projected';
}

export function selectRevenueReceiptStatus(revenue: FinancialRevenue): RevenueReceiptStatus {
  if (revenue.receivableAmount !== 0) {
    return { status: 'receivable', label: 'A receber informado' };
  }
  if (revenue.receivedOn !== undefined) {
    return { status: 'realized', label: 'Data informada' };
  }
  return { status: 'unreported', label: 'NÃ£o informado' };
}

export function flattenCommissionExpenses(
  commissionSources: readonly CommissionBudgetSource[],
): FinancialExpense[] {
  return commissionSources.flatMap((commission) => commission.expenses.map((sourceExpense) => ({
    ...normalizeExpense(sourceExpense),
    commissionId: commission.id,
    commission: commission.commission,
    commissionBudgetCap: roundCurrency(commission.budgetCap),
    commissionBudgetedAmount: roundCurrency(commission.budgetedAmount),
  })));
}

export function selectExpenseDisplayAmount(
  expense: FinancialExpense,
  mode: ExpenseLedgerMode,
): number {
  return mode === 'realized'
    ? roundCurrency(expense.realizedAmount)
    : sumCurrency([expense.value2025, expense.value2026]);
}

export function hasRealizedExpenseActivity(
  expense: FinancialExpenseSourceRow,
): boolean {
  return expense.realizedAmount !== 0
    || expense.paidWithFreeResource !== 0
    || expense.municipalityPlanAmount !== 0
    || expense.rouanetAmount !== 0
    || expense.paidMarkerAmount !== 0;
}

export function selectExpenseLedgerTotal(
  expenses: readonly FinancialExpense[],
  mode: ExpenseLedgerMode,
): number {
  return sumCurrency(expenses.map((expense) => selectExpenseDisplayAmount(expense, mode)));
}

export function selectExpenseVisualizationCoverage(
  expenses: readonly FinancialExpense[],
  mode: ExpenseLedgerMode,
): ExpenseVisualizationCoverage {
  const activeExpenseIds: string[] = [];
  const positiveVisualExpenseIds: string[] = [];
  const negativeVisualExpenseIds: string[] = [];
  const zeroValueLedgerExpenseIds: string[] = [];
  const ledgerExpenseIds = expenses.map((expense) => expense.id);

  for (const expense of expenses) {
    const visualAmount = selectExpenseDisplayAmount(expense, mode);
    if (visualAmount > 0) positiveVisualExpenseIds.push(expense.id);
    else if (visualAmount < 0) negativeVisualExpenseIds.push(expense.id);
    else zeroValueLedgerExpenseIds.push(expense.id);

    const isActive = mode === 'realized'
      ? hasRealizedExpenseActivity(expense)
      : visualAmount !== 0;
    if (isActive) activeExpenseIds.push(expense.id);
  }

  const totalLineCount = expenses.length;
  const representedExpenseIds = Array.from(new Set([
    ...positiveVisualExpenseIds,
    ...negativeVisualExpenseIds,
    ...zeroValueLedgerExpenseIds,
  ]));
  const representedLineCount = representedExpenseIds.length;

  return {
    mode,
    totalLineCount,
    activeLineCount: activeExpenseIds.length,
    positiveVisualLineCount: positiveVisualExpenseIds.length,
    zeroVisualLineCount: zeroValueLedgerExpenseIds.length,
    negativeVisualLineCount: negativeVisualExpenseIds.length,
    ledgerLineCount: ledgerExpenseIds.length,
    representedLineCount,
    representationPercentage: totalLineCount === 0
      ? 0
      : percentageOf(representedLineCount, totalLineCount),
    visualAmount: selectExpenseLedgerTotal(expenses, mode),
    activeExpenseIds,
    positiveVisualExpenseIds,
    negativeVisualExpenseIds,
    zeroValueLedgerExpenseIds,
    ledgerExpenseIds,
    representedExpenseIds,
  };
}

export function sortExpensesForLedger(
  expenses: readonly FinancialExpense[],
  mode: ExpenseLedgerMode,
  grouping: ExpenseGroupingMode,
): FinancialExpense[] {
  const amount = (expense: FinancialExpense) => selectExpenseDisplayAmount(expense, mode);
  return [...expenses].sort((left, right) => {
    if (grouping === 'category') {
      return left.category.localeCompare(right.category, 'pt-BR') || amount(right) - amount(left);
    }
    if (grouping === 'value') return amount(right) - amount(left);
    if (grouping === 'period') return right.value2026 - left.value2026;
    return left.commission.localeCompare(right.commission, 'pt-BR') || amount(right) - amount(left);
  });
}

export function selectGeneralBudgetSummaries(
  items: readonly GeneralBudgetItem[],
): GeneralBudgetSummary[] {
  return (['historical-obligation', 'investment'] as const).map((kind) => {
    const matching = items.filter((item) => item.kind === kind);
    const budgetCap = sumCurrency(matching.map((item) => item.budgetCap));
    const budgetedAmount = sumCurrency(matching.map((item) => item.budgetedAmount));
    return {
      kind,
      itemCount: matching.length,
      budgetCap,
      budgetedAmount,
      remainingAmount: roundCurrency(budgetCap - budgetedAmount),
    };
  });
}

export function calculateBudgetUtilization(budgetCap: number, budgetedAmount: number): number {
  if (!Number.isFinite(budgetCap) || budgetCap <= 0) return 0;
  return percentageOf(roundCurrency(budgetedAmount), roundCurrency(budgetCap));
}

/**
 * Presentation-only thresholds from the product specification. They are not
 * formal Fenasoja accounting rules.
 */
export function classifyBudgetStatus(
  budgetCap: number,
  budgetedAmount: number,
): BudgetAttentionStatus {
  const normalizedCap = roundCurrency(budgetCap);
  const normalizedBudgeted = roundCurrency(budgetedAmount);

  if (normalizedBudgeted > normalizedCap) return 'over-budget';
  if (normalizedCap <= 0 && normalizedBudgeted === 0) return 'no-budget-cap';
  if (normalizedCap <= 0) return 'normal';

  const utilization = calculateBudgetUtilization(normalizedCap, normalizedBudgeted);
  if (utilization >= 95) return 'near-limit';
  if (utilization >= 80) return 'attention';
  return 'normal';
}

export function selectCommissionBudgets(
  commissionSources: readonly CommissionBudgetSource[],
): CommissionBudget[] {
  return commissionSources.map((commission) => {
    const expenses = flattenCommissionExpenses([commission]);
    const budgetCap = roundCurrency(commission.budgetCap);
    const budgetedAmount = roundCurrency(commission.budgetedAmount);

    return {
      id: commission.id,
      sourceLabel: commission.sourceLabel,
      commission: commission.commission,
      responsible: commission.responsible,
      budgetCap,
      budgetedAmount,
      realizedAmount: sumCurrency(expenses.map((expense) => expense.realizedAmount)),
      remainingAmount: roundCurrency(budgetCap - budgetedAmount),
      utilizationPercentage: calculateBudgetUtilization(budgetCap, budgetedAmount),
      status: classifyBudgetStatus(budgetCap, budgetedAmount),
      expenseCount: expenses.length,
      expenses,
    };
  });
}

export function selectBudgetStatusComposition(
  budgets: readonly CommissionBudget[],
): BudgetStatusCompositionSummary[] {
  return BUDGET_STATUS_COMPOSITION_ORDER.map((status) => {
    const matchingBudgets = budgets.filter((budget) => budget.status === status);
    const budgetCap = sumCurrency(matchingBudgets.map((budget) => budget.budgetCap));
    const budgetedAmount = sumCurrency(
      matchingBudgets.map((budget) => budget.budgetedAmount),
    );

    return {
      status,
      commissionCount: matchingBudgets.length,
      budgetCap,
      budgetedAmount,
      balanceAmount: roundCurrency(budgetCap - budgetedAmount),
    };
  });
}

export function selectOverBudgetCommissions(
  budgets: readonly CommissionBudget[],
): CommissionBudget[] {
  return budgets.filter((budget) => budget.status === 'over-budget');
}

function groupExpenses<Key extends string>(
  expenses: readonly FinancialExpense[],
  resolveGroup: (expense: FinancialExpense) => { key: Key; label: string },
): ExpenseGroupSummary<Key>[] {
  const groups = new Map<Key, { label: string; expenses: FinancialExpense[] }>();

  for (const expense of expenses) {
    const { key, label } = resolveGroup(expense);
    const current = groups.get(key);
    if (current) current.expenses.push(expense);
    else groups.set(key, { label, expenses: [expense] });
  }

  return Array.from(groups, ([key, group]) => ({
    key,
    label: group.label,
    expenseCount: group.expenses.length,
    value2025Amount: sumCurrency(group.expenses.map((expense) => expense.value2025)),
    value2026Amount: sumCurrency(group.expenses.map((expense) => expense.value2026)),
    realizedAmount: sumCurrency(group.expenses.map((expense) => expense.realizedAmount)),
  }));
}

export function groupExpensesByCategory(
  expenses: readonly FinancialExpense[],
): ExpenseGroupSummary<ExpenseCategory>[] {
  return groupExpenses(expenses, (expense) => ({
    key: expense.category,
    label: expense.category,
  }));
}

export function groupExpensesByCommission(
  expenses: readonly FinancialExpense[],
): CommissionExpenseGroupSummary[] {
  const periodGroups = groupExpenses(expenses, (expense) => ({
    key: expense.commissionId,
    label: expense.commission,
  }));
  const anchorByCommission = new Map<string, FinancialExpense>();

  for (const expense of expenses) {
    if (!anchorByCommission.has(expense.commissionId)) {
      anchorByCommission.set(expense.commissionId, expense);
    }
  }

  return periodGroups.map((group) => {
    const anchor = anchorByCommission.get(group.key);
    const budgetCap = roundCurrency(anchor?.commissionBudgetCap ?? 0);
    const budgetedAmount = roundCurrency(anchor?.commissionBudgetedAmount ?? 0);

    return {
      ...group,
      budgetCap,
      budgetedAmount,
      remainingAmount: roundCurrency(budgetCap - budgetedAmount),
      utilizationPercentage: calculateBudgetUtilization(budgetCap, budgetedAmount),
      status: classifyBudgetStatus(budgetCap, budgetedAmount),
    };
  });
}

export function groupExpensesByFundingSource(
  expenses: readonly FinancialExpense[],
): ExpenseFundingSummary[] {
  const groups: Array<Omit<ExpenseFundingSummary, 'amount' | 'registeredSharePercentage'> & { values: number[] }> = [
    {
      key: 'free-resource',
      label: 'Recurso Livre',
      values: expenses.map((expense) => expense.paidWithFreeResource),
    },
    {
      key: 'municipality-plan',
      label: 'Prefeitura / Plano de Trabalho',
      values: expenses.map((expense) => expense.municipalityPlanAmount),
    },
    {
      key: 'rouanet',
      label: 'Lei Rouanet',
      values: expenses.map((expense) => expense.rouanetAmount),
    },
  ];
  const total = sumCurrency(groups.flatMap((group) => group.values));

  return groups.map(({ key, label, values }) => {
    const amount = sumCurrency(values);
    return {
      key,
      label,
      amount,
      registeredSharePercentage: percentageOf(amount, total),
    };
  });
}

export function selectCommissionExpenseFundingSummaries(
  expenses: readonly FinancialExpense[],
): CommissionExpenseFundingSummary[] {
  const expensesByCommission = new Map<string, {
    commission: string;
    expenses: FinancialExpense[];
  }>();

  for (const expense of expenses) {
    const current = expensesByCommission.get(expense.commissionId);
    if (current) current.expenses.push(expense);
    else {
      expensesByCommission.set(expense.commissionId, {
        commission: expense.commission,
        expenses: [expense],
      });
    }
  }

  return Array.from(expensesByCommission, ([commissionId, group]) => {
    return {
      commissionId,
      commission: group.commission,
      expenseCount: group.expenses.length,
      realizedAmount: sumCurrency(
        group.expenses.map((expense) => expense.realizedAmount),
      ),
      freeResourceAmount: sumCurrency(
        group.expenses.map((expense) => expense.paidWithFreeResource),
      ),
      municipalityPlanAmount: sumCurrency(
        group.expenses.map((expense) => expense.municipalityPlanAmount),
      ),
      rouanetAmount: sumCurrency(
        group.expenses.map((expense) => expense.rouanetAmount),
      ),
    };
  });
}

function groupRevenues<Key extends string>(
  revenues: readonly FinancialRevenue[],
  resolveGroup: (revenue: FinancialRevenue) => { key: Key; label: string },
): RevenueGroupSummary<Key>[] {
  const groups = new Map<Key, { label: string; revenues: FinancialRevenue[] }>();

  for (const revenue of revenues) {
    const { key, label } = resolveGroup(revenue);
    const current = groups.get(key);
    if (current) current.revenues.push(revenue);
    else groups.set(key, { label, revenues: [revenue] });
  }

  return Array.from(groups, ([key, group]) => ({
    key,
    label: group.label,
    revenueCount: group.revenues.length,
    ...selectRevenueTotals(group.revenues),
  }));
}

export function groupRevenuesByCategory(
  revenues: readonly FinancialRevenue[],
): RevenueGroupSummary<FinancialRevenue['category']>[] {
  return groupRevenues(revenues, (revenue) => ({
    key: revenue.category,
    label: revenue.category,
  }));
}

export function groupRevenuesByFundingType(
  revenues: readonly FinancialRevenue[],
): RevenueGroupSummary<FundingType>[] {
  return groupRevenues(revenues, (revenue) => ({
    key: revenue.fundingType,
    label: revenue.fundingType,
  }));
}

function hasInKindContribution(sponsor: Sponsor): boolean {
  if (typeof sponsor.inKindContribution === 'number') return sponsor.inKindContribution !== 0;
  return Boolean(sponsor.inKindContribution?.trim());
}

function hasFinancialSponsorValue(sponsor: Sponsor): boolean {
  return [
    sponsor.declaredValue,
    sponsor.projectedFreeResource,
    sponsor.consolidatedFreeResource,
    sponsor.receivableAmount,
    sponsor.projectedRouanet,
    sponsor.consolidatedRouanet,
  ].some((amount) => roundCurrency(amount) !== 0);
}

function createSponsorResourceMixPart(
  projectedAmount: number,
  consolidatedAmount: number,
  totalProjectedAmount: number,
  totalConsolidatedAmount: number,
): SponsorResourceMixPart {
  const normalizedProjectedAmount = roundCurrency(projectedAmount);
  const normalizedConsolidatedAmount = roundCurrency(consolidatedAmount);

  return {
    projectedAmount: normalizedProjectedAmount,
    consolidatedAmount: normalizedConsolidatedAmount,
    consolidationGapAmount: roundCurrency(
      normalizedProjectedAmount - normalizedConsolidatedAmount,
    ),
    consolidationRate: percentageOf(
      normalizedConsolidatedAmount,
      normalizedProjectedAmount,
    ),
    projectedSharePercentage: percentageOf(
      normalizedProjectedAmount,
      totalProjectedAmount,
    ),
    consolidatedSharePercentage: percentageOf(
      normalizedConsolidatedAmount,
      totalConsolidatedAmount,
    ),
  };
}

function selectSponsorResourceMix(sponsor: Sponsor): SponsorResourceMix {
  const projectedFreeResource = roundCurrency(sponsor.projectedFreeResource);
  const consolidatedFreeResource = roundCurrency(sponsor.consolidatedFreeResource);
  const projectedRouanet = roundCurrency(sponsor.projectedRouanet);
  const consolidatedRouanet = roundCurrency(sponsor.consolidatedRouanet);
  const totalProjectedAmount = sumCurrency([projectedFreeResource, projectedRouanet]);
  const totalConsolidatedAmount = sumCurrency([consolidatedFreeResource, consolidatedRouanet]);

  return {
    freeResource: createSponsorResourceMixPart(
      projectedFreeResource,
      consolidatedFreeResource,
      totalProjectedAmount,
      totalConsolidatedAmount,
    ),
    rouanet: createSponsorResourceMixPart(
      projectedRouanet,
      consolidatedRouanet,
      totalProjectedAmount,
      totalConsolidatedAmount,
    ),
  };
}

export function selectSponsorTotals(sponsors: readonly Sponsor[]): SponsorTotals {
  const projectedFreeResource = sumCurrency(sponsors.map((sponsor) => sponsor.projectedFreeResource));
  const consolidatedFreeResource = sumCurrency(sponsors.map((sponsor) => sponsor.consolidatedFreeResource));
  const projectedRouanet = sumCurrency(sponsors.map((sponsor) => sponsor.projectedRouanet));
  const consolidatedRouanet = sumCurrency(sponsors.map((sponsor) => sponsor.consolidatedRouanet));

  const totalProjectedAmount = sumCurrency([projectedFreeResource, projectedRouanet]);
  const totalConsolidatedAmount = sumCurrency([consolidatedFreeResource, consolidatedRouanet]);

  return {
    sponsorCount: sponsors.length,
    financialSponsorCount: sponsors.filter(hasFinancialSponsorValue).length,
    declaredValue: sumCurrency(sponsors.map((sponsor) => sponsor.declaredValue)),
    projectedFreeResource,
    consolidatedFreeResource,
    explicitReceivableAmount: sumCurrency(sponsors.map((sponsor) => sponsor.receivableAmount)),
    projectedRouanet,
    consolidatedRouanet,
    totalProjectedAmount,
    totalConsolidatedAmount,
    consolidationGapAmount: roundCurrency(totalProjectedAmount - totalConsolidatedAmount),
    consolidationRate: percentageOf(totalConsolidatedAmount, totalProjectedAmount),
    vehicleCredentials: sponsors.reduce((total, sponsor) => total + sponsor.vehicleCredentials, 0),
    soySummitCredentials: sponsors.reduce((total, sponsor) => total + sponsor.soySummitCredentials, 0),
    inKindContributionCount: sponsors.filter(hasInKindContribution).length,
  };
}

export function selectSponsorTierDistribution(
  sponsors: readonly Sponsor[],
  includeEmpty = false,
): SponsorTierDistribution[] {
  const totals = selectSponsorTotals(sponsors);

  return SPONSOR_TIER_ORDER.flatMap((tier) => {
    const tierSponsors = sponsors.filter((sponsor) => sponsor.tier === tier);
    if (!includeEmpty && tierSponsors.length === 0) return [];

    const tierTotals = selectSponsorTotals(tierSponsors);
    return [{
      tier,
      ...tierTotals,
      sponsorSharePercentage: percentageOf(tierTotals.sponsorCount, totals.sponsorCount),
      projectedSharePercentage: percentageOf(
        tierTotals.totalProjectedAmount,
        totals.totalProjectedAmount,
      ),
      consolidatedSharePercentage: percentageOf(
        tierTotals.totalConsolidatedAmount,
        totals.totalConsolidatedAmount,
      ),
    }];
  });
}

export function selectSponsorshipIntelligence(
  sponsors: readonly Sponsor[],
): SponsorshipIntelligence {
  const totals = selectSponsorTotals(sponsors);
  const rankedSponsors = sponsors
    .map((sponsor) => ({
      sponsor,
      projectedAmount: sumCurrency([
        sponsor.projectedFreeResource,
        sponsor.projectedRouanet,
      ]),
      consolidatedAmount: sumCurrency([
        sponsor.consolidatedFreeResource,
        sponsor.consolidatedRouanet,
      ]),
    }))
    .sort((left, right) => (
      right.projectedAmount - left.projectedAmount
      || left.sponsor.sourceRow - right.sponsor.sourceRow
      || left.sponsor.name.localeCompare(right.sponsor.name, 'pt-BR')
    ));

  let cumulativeProjectedAmount = 0;
  const portfolio = rankedSponsors.map((entry, index): SponsorshipPortfolioItem => {
    cumulativeProjectedAmount = sumCurrency([
      cumulativeProjectedAmount,
      entry.projectedAmount,
    ]);

    return {
      rank: index + 1,
      sponsor: entry.sponsor,
      projectedAmount: entry.projectedAmount,
      consolidatedAmount: entry.consolidatedAmount,
      consolidationGapAmount: roundCurrency(
        entry.projectedAmount - entry.consolidatedAmount,
      ),
      consolidationRate: percentageOf(
        entry.consolidatedAmount,
        entry.projectedAmount,
      ),
      sharePercentage: percentageOf(
        entry.projectedAmount,
        totals.totalProjectedAmount,
      ),
      cumulativeSharePercentage: percentageOf(
        cumulativeProjectedAmount,
        totals.totalProjectedAmount,
      ),
      resourceMix: selectSponsorResourceMix(entry.sponsor),
      flags: {
        hasFinancialValue: hasFinancialSponsorValue(entry.sponsor),
        hasProjectedValue: entry.projectedAmount !== 0,
        hasConsolidatedValue: entry.consolidatedAmount !== 0,
        hasExplicitReceivable: roundCurrency(entry.sponsor.receivableAmount) !== 0,
        hasReceivableNote: Boolean(entry.sponsor.receivableNote?.trim()),
        hasInKindContribution: hasInKindContribution(entry.sponsor),
        hasSourceQualityFlag: entry.sponsor.sourceQualityFlag !== undefined,
      },
    };
  });

  const resourceComposition = {
    freeResource: {
      key: 'free-resource' as const,
      label: 'Recurso Livre',
      ...createSponsorResourceMixPart(
        totals.projectedFreeResource,
        totals.consolidatedFreeResource,
        totals.totalProjectedAmount,
        totals.totalConsolidatedAmount,
      ),
    },
    rouanet: {
      key: 'rouanet' as const,
      label: 'Lei Rouanet',
      ...createSponsorResourceMixPart(
        totals.projectedRouanet,
        totals.consolidatedRouanet,
        totals.totalProjectedAmount,
        totals.totalConsolidatedAmount,
      ),
    },
  };

  const limits = [5, 10, 20] as const;
  const segments = limits.map((limit): SponsorshipConcentrationSegment => {
    const projectedAmount = sumCurrency(
      portfolio.slice(0, limit).map((item) => item.projectedAmount),
    );
    return {
      limit,
      sponsorCount: Math.min(limit, portfolio.length),
      projectedAmount,
      sharePercentage: percentageOf(projectedAmount, totals.totalProjectedAmount),
    };
  });

  return {
    totals,
    tiers: selectSponsorTierDistribution(sponsors),
    portfolio,
    resourceComposition,
    concentration: {
      top5SharePercentage: segments[0].sharePercentage,
      top10SharePercentage: segments[1].sharePercentage,
      top20SharePercentage: segments[2].sharePercentage,
      segments,
    },
  };
}

export function selectScenarioSummaries(
  scenarios: readonly FinancialScenario[],
): FinancialScenarioSummary[] {
  return scenarios.map((scenario) => {
    const freeSponsorship = roundCurrency(scenario.freeSponsorship);
    const rouanetSponsorship = roundCurrency(scenario.rouanetSponsorship);
    const operatingExecution = roundCurrency(scenario.operatingExecution);
    const historicalObligations = roundCurrency(scenario.historicalObligations);
    const reserve = roundCurrency(scenario.reserve);

    return {
      id: scenario.id,
      label: scenario.label,
      commercialization: roundCurrency(scenario.commercialization),
      exporural: roundCurrency(scenario.exporural),
      externalArea: roundCurrency(scenario.externalArea),
      agroindustryPavilion: roundCurrency(scenario.agroindustryPavilion),
      foodPoints: roundCurrency(scenario.foodPoints),
      parking: roundCurrency(scenario.parking),
      commercialRevenue: roundCurrency(scenario.commercialRevenue),
      freeSponsorship,
      rouanetSponsorship,
      sponsorshipRevenue: sumCurrency([freeSponsorship, rouanetSponsorship]),
      totalRevenue: roundCurrency(scenario.totalRevenue),
      operatingExecution,
      historicalObligations,
      reserve,
      totalCommitments: sumCurrency([operatingExecution, historicalObligations, reserve]),
      investmentCapacity: roundCurrency(scenario.investmentCapacity),
      negativeResult: roundCurrency(scenario.negativeResult),
    };
  });
}

export function selectScenarioBridge(summary: FinancialScenarioSummary): ScenarioBridge {
  const commercialRevenue = roundCurrency(summary.commercialRevenue);
  const freeSponsorship = roundCurrency(summary.freeSponsorship);
  const rouanetSponsorship = roundCurrency(summary.rouanetSponsorship);
  const totalRevenue = roundCurrency(summary.totalRevenue);
  const operatingExecution = roundCurrency(summary.operatingExecution);
  const historicalObligations = roundCurrency(summary.historicalObligations);
  const reserve = roundCurrency(summary.reserve);

  const afterCommercialRevenue = commercialRevenue;
  const afterFreeSponsorship = sumCurrency([afterCommercialRevenue, freeSponsorship]);
  const afterRouanetSponsorship = sumCurrency([afterFreeSponsorship, rouanetSponsorship]);
  const afterOperatingExecution = sumCurrency([totalRevenue, -operatingExecution]);
  const afterHistoricalObligations = sumCurrency([
    afterOperatingExecution,
    -historicalObligations,
  ]);
  const computedResult = sumCurrency([afterHistoricalObligations, -reserve]);
  const normalizedInvestmentCapacity = roundCurrency(summary.investmentCapacity);
  const normalizedNegativeResult = roundCurrency(summary.negativeResult);
  const literalResult = normalizedInvestmentCapacity !== 0
    ? normalizedInvestmentCapacity
    : normalizedNegativeResult !== 0
      ? roundCurrency(-Math.abs(normalizedNegativeResult))
      : 0;
  const reconciliationDelta = roundCurrency(literalResult - computedResult);

  return {
    scenarioId: summary.id,
    computedResult,
    literalResult,
    resultKind: literalResult > 0
      ? 'capacity'
      : literalResult < 0
        ? 'deficit'
        : 'balanced',
    reconciliationDelta,
    steps: [
      {
        key: 'commercial-revenue',
        label: 'Receita Comercial',
        kind: 'positive',
        amount: commercialRevenue,
        signedAmount: commercialRevenue,
        startAmount: 0,
        endAmount: afterCommercialRevenue,
        runningTotal: afterCommercialRevenue,
      },
      {
        key: 'free-sponsorship',
        label: 'Patrocínio Livre',
        kind: 'positive',
        amount: freeSponsorship,
        signedAmount: freeSponsorship,
        startAmount: afterCommercialRevenue,
        endAmount: afterFreeSponsorship,
        runningTotal: afterFreeSponsorship,
      },
      {
        key: 'rouanet-sponsorship',
        label: 'Patrocínio Rouanet',
        kind: 'positive',
        amount: rouanetSponsorship,
        signedAmount: rouanetSponsorship,
        startAmount: afterFreeSponsorship,
        endAmount: afterRouanetSponsorship,
        runningTotal: afterRouanetSponsorship,
      },
      {
        key: 'total-revenue',
        label: 'Receita Total',
        kind: 'subtotal',
        amount: totalRevenue,
        signedAmount: totalRevenue,
        startAmount: 0,
        endAmount: totalRevenue,
        runningTotal: totalRevenue,
      },
      {
        key: 'operating-execution',
        label: 'Execução operacional',
        kind: 'negative',
        amount: operatingExecution,
        signedAmount: roundCurrency(-operatingExecution),
        startAmount: totalRevenue,
        endAmount: afterOperatingExecution,
        runningTotal: afterOperatingExecution,
      },
      {
        key: 'historical-obligations',
        label: 'Obrigações históricas',
        kind: 'negative',
        amount: historicalObligations,
        signedAmount: roundCurrency(-historicalObligations),
        startAmount: afterOperatingExecution,
        endAmount: afterHistoricalObligations,
        runningTotal: afterHistoricalObligations,
      },
      {
        key: 'reserve',
        label: 'Reserva',
        kind: 'negative',
        amount: reserve,
        signedAmount: roundCurrency(-reserve),
        startAmount: afterHistoricalObligations,
        endAmount: computedResult,
        runningTotal: computedResult,
      },
      {
        key: 'literal-result',
        label: literalResult < 0 ? 'Déficit' : 'Capacidade de investimento',
        kind: 'result',
        amount: literalResult,
        signedAmount: literalResult,
        startAmount: 0,
        endAmount: literalResult,
        runningTotal: literalResult,
      },
    ],
  };
}

export function selectScenarioContributions(
  summary: FinancialScenarioSummary,
): ScenarioContribution[] {
  const positiveSources: Array<{
    key: ScenarioContributionKey;
    label: string;
    amount: number;
  }> = [
    { key: 'commercialization', label: 'Comercialização', amount: summary.commercialization },
    { key: 'exporural', label: 'Exporural', amount: summary.exporural },
    { key: 'external-area', label: 'Área externa', amount: summary.externalArea },
    {
      key: 'agroindustry-pavilion',
      label: 'Pavilhão da agroindústria',
      amount: summary.agroindustryPavilion,
    },
    { key: 'food-points', label: 'Pontos de alimentação', amount: summary.foodPoints },
    { key: 'parking', label: 'Estacionamento', amount: summary.parking },
    { key: 'free-sponsorship', label: 'Patrocínio Livre', amount: summary.freeSponsorship },
    { key: 'rouanet-sponsorship', label: 'Patrocínio Rouanet', amount: summary.rouanetSponsorship },
  ].map((source): {
    key: ScenarioContributionKey;
    label: string;
    amount: number;
  } => ({
    key: source.key as ScenarioContributionKey,
    label: source.label,
    amount: roundCurrency(source.amount),
  }));
  const commitments: Array<{
    key: ScenarioContributionKey;
    label: string;
    amount: number;
  }> = [
    {
      key: 'operating-execution',
      label: 'Execução operacional',
      amount: roundCurrency(summary.operatingExecution),
    },
    {
      key: 'historical-obligations',
      label: 'Obrigações históricas',
      amount: roundCurrency(summary.historicalObligations),
    },
    { key: 'reserve', label: 'Reserva', amount: roundCurrency(summary.reserve) },
  ];
  const positiveTotal = sumCurrency(positiveSources.map((source) => source.amount));
  const commitmentTotal = sumCurrency(commitments.map((commitment) => commitment.amount));

  return [
    ...positiveSources.map((source): ScenarioContribution => ({
      ...source,
      direction: 'positive',
      signedAmount: source.amount,
      sharePercentage: percentageOf(source.amount, positiveTotal),
    })),
    ...commitments.map((commitment): ScenarioContribution => ({
      ...commitment,
      direction: 'negative',
      signedAmount: roundCurrency(-commitment.amount),
      sharePercentage: percentageOf(commitment.amount, commitmentTotal),
    })),
  ];
}

export type ExpenseExecutionGroupingMode = 'commission' | 'category';

/**
 * Comparative planning-versus-execution reading of a single expense group.
 *
 * `plannedAmount` reuses the planning ledger definition (2025 + 2026 periods)
 * and `realizedAmount` reuses the realized column. Neither value is redefined
 * here: both come from the same aggregation used by the specialised menus.
 */
export interface ExpenseExecutionGroup {
  key: string;
  label: string;
  expenseCount: number;
  plannedAmount: number;
  realizedAmount: number;
  /** Realizado − Previsto. Positivo indica execução acima do previsto. */
  differenceAmount: number;
  executionPercentage: number;
  /** Falso quando não há previsto positivo, evitando percentual sem sentido. */
  hasExecutionRate: boolean;
  plannedSharePercentage: number;
  realizedSharePercentage: number;
}

export interface ExpenseExecutionModel {
  groups: ExpenseExecutionGroup[];
  plannedTotal: number;
  realizedTotal: number;
  differenceAmount: number;
  executionPercentage: number;
  hasExecutionRate: boolean;
  /** Maior valor absoluto entre previsto e realizado; escala comum dos dois gráficos. */
  maxAmount: number;
  groupCount: number;
  expenseCount: number;
}

function toSharePercentage(amount: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return (amount / total) * 100;
}

/**
 * Consolidates the whole expense base into comparable planning/execution
 * groups. Every line is represented — grouping never truncates the base.
 */
export function selectExpenseExecutionModel(
  expenses: readonly FinancialExpense[],
  grouping: ExpenseExecutionGroupingMode,
): ExpenseExecutionModel {
  const baseGroups = grouping === 'category'
    ? groupExpensesByCategory(expenses)
    : groupExpensesByCommission(expenses);

  const plannedTotal = selectExpenseLedgerTotal(expenses, 'planning');
  const realizedTotal = selectExpenseLedgerTotal(expenses, 'realized');

  const groups = baseGroups.map<ExpenseExecutionGroup>((group) => {
    const plannedAmount = sumCurrency([group.value2025Amount, group.value2026Amount]);
    const realizedAmount = roundCurrency(group.realizedAmount);
    const hasExecutionRate = plannedAmount > 0;

    return {
      key: group.key,
      label: group.label,
      expenseCount: group.expenseCount,
      plannedAmount,
      realizedAmount,
      differenceAmount: roundCurrency(realizedAmount - plannedAmount),
      executionPercentage: hasExecutionRate ? (realizedAmount / plannedAmount) * 100 : 0,
      hasExecutionRate,
      plannedSharePercentage: toSharePercentage(plannedAmount, plannedTotal),
      realizedSharePercentage: toSharePercentage(realizedAmount, realizedTotal),
    };
  }).sort((left, right) => (
    (right.plannedAmount + right.realizedAmount) - (left.plannedAmount + left.realizedAmount)
  ));

  const maxAmount = groups.reduce(
    (largest, group) => Math.max(largest, group.plannedAmount, group.realizedAmount),
    0,
  );

  return {
    groups,
    plannedTotal,
    realizedTotal,
    differenceAmount: roundCurrency(realizedTotal - plannedTotal),
    executionPercentage: plannedTotal > 0 ? (realizedTotal / plannedTotal) * 100 : 0,
    hasExecutionRate: plannedTotal > 0,
    maxAmount,
    groupCount: groups.length,
    expenseCount: expenses.length,
  };
}
