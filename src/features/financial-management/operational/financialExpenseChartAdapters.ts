import type { ExpenseCategory, ExpenseComparison, ExpenseGroupComparison, ComparisonState } from './financialExpensesApi';

export type ExpenseChartSide = 'projetado' | 'realizado';
export type ExpenseChartDimension = 'category' | 'commission';

export interface ExpenseChartRow {
  key: string;
  id: string | null;
  label: string;
  archived: boolean;
  unclassified: boolean;
  count: number;
  plannedCents: number | null;
  committedCents: number | null;
  plannedShare: number | null;
  committedShare: number | null;
  deviationCents: number | null;
  deviationPct: number | null;
  comparisonState: ComparisonState;
}

export interface ExpenseDimensionChartModel {
  dimension: ExpenseChartDimension;
  /** A single order and a single monetary scale for the paired comparison. */
  rows: readonly ExpenseChartRow[];
  rankings: Record<ExpenseChartSide, readonly ExpenseChartRow[]>;
  maximumCents: number | null;
  totals: Record<ExpenseChartSide, number | null>;
  compositionReady: Record<ExpenseChartSide, boolean>;
}

export interface ExpenseChartModel {
  category: ExpenseDimensionChartModel;
  commission: ExpenseDimensionChartModel;
}

const nonnegativeCents = (value: unknown): number | null => (
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
);
const signedCents = (value: unknown): number | null => (
  typeof value === 'number' && Number.isSafeInteger(value) ? value : null
);

export const expenseChartValue = (row: ExpenseChartRow, side: ExpenseChartSide) => (
  side === 'projetado' ? row.plannedCents : row.committedCents
);
export const expenseChartShare = (row: ExpenseChartRow, side: ExpenseChartSide) => (
  side === 'projetado' ? row.plannedShare : row.committedShare
);

/** Null is unavailable; genuine zero stays zero. The denominator is always the RPC total. */
function share(cents: number | null, total: number | null): number | null {
  return cents !== null && total !== null && total > 0 ? cents / total * 100 : null;
}

function dimensionModel(
  groups: readonly ExpenseGroupComparison[],
  dimension: ExpenseChartDimension,
  totals: ExpenseDimensionChartModel['totals'],
  categories: ReadonlyMap<string, ExpenseCategory>,
): ExpenseDimensionChartModel {
  const rows = groups.map((group): ExpenseChartRow => {
    const plannedCents = nonnegativeCents(group.planned_cents);
    const committedCents = nonnegativeCents(group.committed_cents);
    const category = dimension === 'category' && group.id ? categories.get(group.id) : undefined;
    return {
      key: `${dimension}:${group.id === null ? 'none' : `id:${group.id}`}`,
      id: group.id,
      label: group.name.trim() || category?.name || (dimension === 'category' ? 'Sem categoria' : 'Sem comissão'),
      archived: category?.active === false,
      unclassified: group.id === null,
      count: group.count,
      plannedCents,
      committedCents,
      plannedShare: share(plannedCents, totals.projetado),
      committedShare: share(committedCents, totals.realizado),
      deviationCents: signedCents(group.deviation_cents),
      // Preserve the server's absence of a denominator, even if a malformed payload sends a percentage.
      deviationPct: group.comparison_state === 'comparavel' && typeof group.deviation_pct === 'number'
        && Number.isFinite(group.deviation_pct) ? group.deviation_pct : null,
      comparisonState: group.comparison_state,
    };
  });
  const alphabetical = (left: ExpenseChartRow, right: ExpenseChartRow) => (
    left.label.localeCompare(right.label, 'pt-BR') || left.key.localeCompare(right.key)
  );
  // Largest series value defines the shared order; projected and committed are never added.
  rows.sort((left, right) => (
    Math.max(right.plannedCents ?? -1, right.committedCents ?? -1)
      - Math.max(left.plannedCents ?? -1, left.committedCents ?? -1)
    || alphabetical(left, right)
  ));
  const values = rows.flatMap(row => [row.plannedCents, row.committedCents]).filter((value): value is number => value !== null);
  const rankings = (side: ExpenseChartSide) => [...rows].sort((left, right) => (
    (expenseChartValue(right, side) ?? -1) - (expenseChartValue(left, side) ?? -1) || alphabetical(left, right)
  ));
  const compositionReady = (side: ExpenseChartSide) => {
    const total = totals[side];
    // The historical generic donut assumes complete values. Do not send missing values as zero.
    return total !== null && total > 0 && rows.length > 0
      && rows.every(row => expenseChartValue(row, side) !== null)
      && rows.reduce((sum, row) => sum + (expenseChartValue(row, side) as number), 0) === total;
  };
  return {
    dimension,
    rows,
    rankings: { projetado: rankings('projetado'), realizado: rankings('realizado') },
    maximumCents: values.length ? Math.max(...values) : null,
    totals,
    compositionReady: { projetado: compositionReady('projetado'), realizado: compositionReady('realizado') },
  };
}

/** Adapter for the complete server aggregate, never for a page of expenses or 2026 data. */
export function adaptExpenseComparison(
  comparison: ExpenseComparison | null | undefined,
  categories: readonly ExpenseCategory[] = [],
): ExpenseChartModel | null {
  if (!comparison) return null;
  const totals = {
    projetado: nonnegativeCents(comparison.totals.planned_cents),
    realizado: nonnegativeCents(comparison.totals.committed_cents),
  };
  const categoriesById = new Map(categories.map(category => [category.id, category]));
  return {
    category: dimensionModel(comparison.by_category, 'category', totals, categoriesById),
    commission: dimensionModel(comparison.by_commission, 'commission', totals, categoriesById),
  };
}
