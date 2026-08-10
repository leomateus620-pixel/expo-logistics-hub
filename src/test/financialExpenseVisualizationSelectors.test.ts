import { describe, expect, it } from 'vitest';
import {
  flattenCommissionExpenses,
  hasRealizedExpenseActivity,
  selectBudgetStatusComposition,
  selectCommissionBudgets,
  selectCommissionExpenseFundingSummaries,
  selectExpenseVisualizationCoverage,
} from '@/features/financial-management/selectors/financialSelectors';
import {
  commissionBudgetSources,
  financialWorkbookTotals,
} from '@/features/financial-management/data/financial2026Data';
import { roundCurrency } from '@/features/financial-management/utils/financialFormatters';

const expenses = flattenCommissionExpenses(commissionBudgetSources);
const commissionBudgets = selectCommissionBudgets(commissionBudgetSources);

function sumCurrency(values: readonly number[]): number {
  return roundCurrency(values.reduce((total, value) => total + value, 0));
}

describe('seletores de visualizacao integral de despesas', () => {
  it('agrupa as origens independentes por comissao e acompanha o recorte recebido', () => {
    const summaries = selectCommissionExpenseFundingSummaries(expenses);

    expect(expenses).toHaveLength(254);
    expect(summaries).toHaveLength(23);
    expect(sumCurrency(summaries.map((item) => item.expenseCount))).toBe(254);
    expect(sumCurrency(summaries.map((item) => item.realizedAmount))).toBe(
      financialWorkbookTotals.coreCommissionBudgeted,
    );
    expect(sumCurrency(summaries.map((item) => item.freeResourceAmount))).toBe(
      financialWorkbookTotals.paidWithFreeResource,
    );
    expect(sumCurrency(summaries.map((item) => item.municipalityPlanAmount))).toBe(
      financialWorkbookTotals.municipalityPlanAmount,
    );
    expect(sumCurrency(summaries.map((item) => item.rouanetAmount))).toBe(
      financialWorkbookTotals.rouanetAmount,
    );

    const registeredOriginAmount = sumCurrency(summaries.flatMap((item) => [
      item.freeResourceAmount,
      item.municipalityPlanAmount,
      item.rouanetAmount,
    ]));
    expect(registeredOriginAmount).toBe(1_226_505.86);
    expect(registeredOriginAmount).not.toBe(financialWorkbookTotals.coreCommissionBudgeted);

    const marketingRows = expenses.filter((expense) => expense.commission === 'Marketing');
    expect(selectCommissionExpenseFundingSummaries(marketingRows)).toEqual([
      {
        commissionId: marketingRows[0].commissionId,
        commission: 'Marketing',
        expenseCount: 73,
        realizedAmount: 1_150_769,
        freeResourceAmount: 31_300,
        municipalityPlanAmount: 35_400,
        rouanetAmount: 125_518.36,
      },
    ]);
  });

  it('compoe todos os status em ordem estavel e reconcilia o portfolio completo', () => {
    const composition = selectBudgetStatusComposition(commissionBudgets);

    expect(commissionBudgets).toHaveLength(25);
    expect(composition.map((item) => item.status)).toEqual([
      'normal',
      'attention',
      'near-limit',
      'over-budget',
      'no-budget-cap',
    ]);
    expect(Object.fromEntries(composition.map((item) => [
      item.status,
      item.commissionCount,
    ]))).toEqual({
      normal: 6,
      attention: 10,
      'near-limit': 5,
      'over-budget': 3,
      'no-budget-cap': 1,
    });

    expect(sumCurrency(composition.map((item) => item.budgetCap))).toBe(
      financialWorkbookTotals.coreCommissionBudgetCap,
    );
    expect(sumCurrency(composition.map((item) => item.budgetedAmount))).toBe(
      financialWorkbookTotals.coreCommissionBudgeted,
    );
    expect(sumCurrency(composition.map((item) => item.balanceAmount))).toBe(532_949.86);
  });

  it('preserva 100% das linhas previstas entre geometria positiva e ledger', () => {
    const coverage = selectExpenseVisualizationCoverage(expenses, 'planning');

    expect(coverage).toMatchObject({
      mode: 'planning',
      totalLineCount: 254,
      activeLineCount: 216,
      positiveVisualLineCount: 216,
      zeroVisualLineCount: 38,
      negativeVisualLineCount: 0,
      ledgerLineCount: 254,
      representedLineCount: 254,
      representationPercentage: 100,
      visualAmount: 8_519_650.14,
    });
    expect(coverage.positiveVisualExpenseIds).toHaveLength(216);
    expect(coverage.zeroValueLedgerExpenseIds).toHaveLength(38);
    expect(coverage.ledgerExpenseIds).toHaveLength(254);
    expect(new Set(coverage.representedExpenseIds)).toEqual(new Set(coverage.ledgerExpenseIds));
  });

  it('distingue atividade realizada de valor positivo sem perder a linha de origem isolada', () => {
    const coverage = selectExpenseVisualizationCoverage(expenses, 'realized');
    const originOnlyExpense = expenses.find((expense) => expense.sourceRow === 107);

    expect(originOnlyExpense).toBeDefined();
    expect(originOnlyExpense?.realizedAmount).toBe(0);
    expect(originOnlyExpense?.rouanetAmount).toBe(1_000);
    expect(hasRealizedExpenseActivity(originOnlyExpense!)).toBe(true);
    expect(coverage).toMatchObject({
      mode: 'realized',
      totalLineCount: 254,
      activeLineCount: 216,
      positiveVisualLineCount: 215,
      zeroVisualLineCount: 39,
      negativeVisualLineCount: 0,
      ledgerLineCount: 254,
      representedLineCount: 254,
      representationPercentage: 100,
      visualAmount: financialWorkbookTotals.coreCommissionBudgeted,
    });
    expect(coverage.activeExpenseIds).toContain(originOnlyExpense?.id);
    expect(coverage.zeroValueLedgerExpenseIds).toContain(originOnlyExpense?.id);
    expect(coverage.positiveVisualExpenseIds).not.toContain(originOnlyExpense?.id);
    expect(new Set(coverage.representedExpenseIds)).toEqual(new Set(coverage.ledgerExpenseIds));
  });

  it('mantem o contrato deterministico para base vazia e valores negativos', () => {
    expect(selectExpenseVisualizationCoverage([], 'planning')).toMatchObject({
      mode: 'planning',
      totalLineCount: 0,
      activeLineCount: 0,
      positiveVisualLineCount: 0,
      zeroVisualLineCount: 0,
      negativeVisualLineCount: 0,
      ledgerLineCount: 0,
      representedLineCount: 0,
      representationPercentage: 0,
      visualAmount: 0,
    });

    const negativeExpense = {
      ...expenses[0],
      id: 'negative-expense',
      value2025: -10,
      value2026: 0,
      realizedAmount: -5,
      paidWithFreeResource: 0,
      municipalityPlanAmount: 0,
      rouanetAmount: 0,
      paidMarkerAmount: 0,
    };
    const coverage = selectExpenseVisualizationCoverage([negativeExpense], 'realized');

    expect(coverage).toMatchObject({
      activeLineCount: 1,
      positiveVisualLineCount: 0,
      zeroVisualLineCount: 0,
      negativeVisualLineCount: 1,
      representedLineCount: 1,
      representationPercentage: 100,
      visualAmount: -5,
    });
  });
});
