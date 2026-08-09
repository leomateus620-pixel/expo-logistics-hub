import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BudgetStatusDonutChart,
  ExpenseTreemapChart,
} from '@/features/financial-management/components/FinancialCharts';
import {
  CommissionBudgetLedger,
  ExpenseLedger,
} from '@/features/financial-management/components/FinancialTables';
import { commissionBudgetSources } from '@/features/financial-management/data/financial2026Data';
import {
  flattenCommissionExpenses,
  selectBudgetStatusComposition,
  selectCommissionBudgets,
  selectExpenseDisplayAmount,
} from '@/features/financial-management/selectors/financialSelectors';
import type { BudgetAttentionStatus, FinancialExpense } from '@/features/financial-management/types';

const expenses = flattenCommissionExpenses(commissionBudgetSources);
const budgets = selectCommissionBudgets(commissionBudgetSources);

const budgetStatusLabels: Record<BudgetAttentionStatus, string> = {
  normal: 'Dentro do esperado',
  attention: 'Atenção',
  'near-limit': 'Próximo do teto',
  'over-budget': 'Acima do teto',
  'no-budget-cap': 'Sem teto definido',
};

function requireExpense(
  predicate: (expense: FinancialExpense) => boolean,
  description: string,
) {
  const expense = expenses.find(predicate);
  if (!expense) throw new Error(`Fixture financeira sem despesa para: ${description}`);
  return expense;
}

describe('inteligência visual de despesas', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class ResizeObserverMock {
      private readonly callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }

      observe(target: Element) {
        this.callback([{
          target,
          contentRect: { width: 800, height: 500 },
        } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }

      unobserve() {}

      disconnect() {}
    });

    let frameTime = performance.now();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameTime += 1_000;
      callback(frameTime);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('representa a fixture integral no treemap, contabiliza zeros e permite exploração por teclado', () => {
    const positiveExpenses = expenses.filter(
      (expense) => selectExpenseDisplayAmount(expense, 'planning') > 0,
    );
    const zeroExpenses = expenses.filter(
      (expense) => selectExpenseDisplayAmount(expense, 'planning') === 0,
    );

    expect(expenses.length).toBeGreaterThan(200);
    expect(positiveExpenses.length).toBeGreaterThan(0);
    expect(zeroExpenses.length).toBeGreaterThan(0);

    render(<ExpenseTreemapChart expenses={expenses} mode="planning" forceMotion />);

    expect(screen.getByText(new RegExp(
      `Cobertura: ${expenses.length} linhas filtradas.*${positiveExpenses.length} blocos proporcionais.*${zeroExpenses.length} linhas sem área por valor zero`,
    ))).toBeInTheDocument();

    const accessibleTable = screen.getByRole('table', {
      name: /Mapa completo das despesas planejadas.*Todas as linhas, inclusive valores zero/i,
    });
    expect(within(accessibleTable).getAllByRole('row')).toHaveLength(expenses.length + 1);
    expect(within(accessibleTable).getAllByText('Sem área: valor zero')).toHaveLength(
      zeroExpenses.length,
    );

    const canvas = screen.getByRole('group', {
      name: new RegExp(`Mapa com ${positiveExpenses.length} despesas com valor`, 'i'),
    });
    act(() => canvas.focus());

    expect(canvas).toHaveFocus();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    const firstAccessibleName = canvas.getAttribute('aria-label');

    fireEvent.keyDown(canvas, { key: 'ArrowRight' });

    expect(canvas.getAttribute('aria-label')).not.toBe(firstAccessibleName);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(canvas).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id);
  });

  it('preserva as 254 linhas no treemap realizado, inclusive os 39 zeros e a origem da linha 107', () => {
    const positiveExpenses = expenses.filter(
      (expense) => selectExpenseDisplayAmount(expense, 'realized') > 0,
    );
    const zeroExpenses = expenses.filter(
      (expense) => selectExpenseDisplayAmount(expense, 'realized') === 0,
    );
    const rouanetWithoutRealizedAmount = requireExpense(
      (expense) => expense.sourceRow === 107,
      'linha 107 com origem Rouanet e realizado zero',
    );

    expect(expenses).toHaveLength(254);
    expect(positiveExpenses).toHaveLength(215);
    expect(zeroExpenses).toHaveLength(39);
    expect(rouanetWithoutRealizedAmount.rouanetAmount).toBe(1_000);
    expect(rouanetWithoutRealizedAmount.realizedAmount).toBe(0);

    render(<ExpenseTreemapChart expenses={expenses} mode="realized" forceMotion />);

    expect(screen.getByText(
      /Cobertura: 254 linhas filtradas.*215 blocos proporcionais.*39 linhas sem área por valor zero/,
    )).toBeInTheDocument();

    const accessibleTable = screen.getByRole('table', {
      name: /Mapa completo das despesas realizadas.*Todas as linhas, inclusive valores zero/i,
    });
    expect(within(accessibleTable).getAllByRole('row')).toHaveLength(255);
    expect(within(accessibleTable).getAllByText('Sem área: valor zero')).toHaveLength(39);

    const rouanetRowHeader = within(accessibleTable).getByRole('rowheader', {
      name: rouanetWithoutRealizedAmount.description,
    });
    const rouanetRow = rouanetRowHeader.closest('tr');
    expect(rouanetRow).not.toBeNull();
    expect(rouanetRow).toHaveTextContent(/R\$\s*0,00/);
    expect(within(rouanetRow as HTMLTableRowElement).getByText('Sem área: valor zero'))
      .toBeInTheDocument();
  });

  it('expõe as 25 comissões e os cinco estados no donut orçamentário', () => {
    const composition = selectBudgetStatusComposition(budgets);

    expect(budgets).toHaveLength(25);
    expect(composition).toHaveLength(5);
    expect(composition.every((item) => item.commissionCount > 0)).toBe(true);
    expect(composition.reduce((total, item) => total + item.commissionCount, 0)).toBe(25);

    const { container } = render(<BudgetStatusDonutChart budgets={budgets} forceMotion />);

    expect(container.querySelectorAll('.financial-distribution-donut__legend-item')).toHaveLength(5);
    expect(container.querySelector('.financial-distribution-donut__center')).toHaveTextContent(
      '25comissões',
    );

    const accessibleTable = screen.getByRole('table', {
      name: 'Composição do status orçamentário',
    });
    expect(within(accessibleTable).getAllByRole('row')).toHaveLength(6);

    composition.forEach((item) => {
      const rowHeader = within(accessibleTable).getByRole('rowheader', {
        name: budgetStatusLabels[item.status],
      });
      const row = rowHeader.closest('tr');
      expect(row).not.toBeNull();
      expect(within(row as HTMLTableRowElement).getByRole('cell', {
        name: String(item.commissionCount),
      })).toBeInTheDocument();
    });
  });

  it('mantém as novas colunas e todos os estados do ledger de despesas', () => {
    const paymentReported = requireExpense(
      (expense) => expense.paidMarkerAmount !== 0 || expense.paidWithFreeResource !== 0,
      'pagamento informado',
    );
    const originReported = requireExpense(
      (expense) => expense.paidMarkerAmount === 0
        && expense.paidWithFreeResource === 0
        && (expense.municipalityPlanAmount !== 0 || expense.rouanetAmount !== 0),
      'origem informada sem pagamento',
    );
    const realizedOnly = requireExpense(
      (expense) => expense.paidMarkerAmount === 0
        && expense.paidWithFreeResource === 0
        && expense.municipalityPlanAmount === 0
        && expense.rouanetAmount === 0
        && expense.realizedAmount !== 0,
      'realizado sem origem registrada',
    );
    const unreported = requireExpense(
      (expense) => expense.paidMarkerAmount === 0
        && expense.paidWithFreeResource === 0
        && expense.municipalityPlanAmount === 0
        && expense.rouanetAmount === 0
        && expense.realizedAmount === 0,
      'sem valor realizado',
    );

    const realizedView = render(
      <ExpenseLedger
        expenses={[paymentReported, originReported, realizedOnly, unreported]}
        mode="realized"
      />,
    );
    const realizedLedger = realizedView.container.querySelector('[data-financial-ledger="expense"]');
    expect(realizedLedger).toHaveAttribute('data-financial-expense-mode', 'realized');
    expect(realizedLedger).toHaveAttribute('data-financial-primary-column', 'realized');

    const realizedRegion = screen.getByRole('region', {
      name: 'Tabela rolável de despesas realizadas',
    });
    ['Realizado', '2025', '2026', 'Origem registrada', 'Observação', 'Status'].forEach((name) => {
      expect(within(realizedRegion).getByRole('columnheader', { name })).toBeInTheDocument();
    });

    const realizedRows = [
      [paymentReported, 'realized', 'Pagamento informado'],
      [originReported, 'partial', 'Origem informada'],
      [realizedOnly, 'realized', 'Realizado na fonte'],
      [unreported, 'unreported', 'Sem valor realizado'],
    ] as const;
    realizedRows.forEach(([expense, status, label]) => {
      const row = realizedRegion.querySelector(`tr[data-source-row="${expense.sourceRow}"]`);
      expect(row).toHaveAttribute('data-financial-row-status', status);
      expect(within(row as HTMLTableRowElement).getByText(label)).toBeInTheDocument();
    });

    realizedView.unmount();

    const planned = requireExpense(
      (expense) => selectExpenseDisplayAmount(expense, 'planning') > 0,
      'planejamento com valor',
    );
    const zeroPlanned = requireExpense(
      (expense) => selectExpenseDisplayAmount(expense, 'planning') === 0,
      'planejamento sem valor',
    );
    const planningView = render(
      <ExpenseLedger expenses={[planned, zeroPlanned]} mode="planning" />,
    );
    const planningLedger = planningView.container.querySelector('[data-financial-ledger="expense"]');
    expect(planningLedger).toHaveAttribute('data-financial-expense-mode', 'planning');
    expect(planningLedger).toHaveAttribute('data-financial-primary-column', 'period-total');

    const planningRegion = screen.getByRole('region', {
      name: 'Tabela rolável de despesas previstas',
    });
    ['Categoria analítica', '2025', '2026', 'Soma dos períodos', 'Impacto no teto', 'Status']
      .forEach((name) => {
        expect(within(planningRegion).getByRole('columnheader', { name })).toBeInTheDocument();
      });
    expect(planningRegion.querySelector(`tr[data-source-row="${planned.sourceRow}"]`))
      .toHaveAttribute('data-financial-row-status', 'projected');
    expect(planningRegion.querySelector(`tr[data-source-row="${zeroPlanned.sourceRow}"]`))
      .toHaveAttribute('data-financial-row-status', 'unreported');
  });

  it('preserva as 25 comissões no ledger integral, com cinco estados, ordenação e filtro', () => {
    const { container } = render(<CommissionBudgetLedger budgets={budgets} />);
    const ledger = container.querySelector('[data-financial-ledger="commission-budget"]');
    expect(ledger).toHaveAttribute('data-financial-primary-column', 'budgeted');

    const region = screen.getByRole('region', {
      name: 'Tabela rolável de orçamento por comissão',
    });
    const table = within(region).getByRole('table', {
      name: 'Orçamento e utilização por comissão',
    });
    expect(within(table).getAllByRole('row')).toHaveLength(budgets.length + 1);
    expect(container.querySelectorAll('.financial-commission-card')).toHaveLength(budgets.length);

    const statusRows = Array.from(table.querySelectorAll('tbody tr'));
    expect(new Set(statusRows.map((row) => row.getAttribute('data-financial-row-status'))))
      .toEqual(new Set<BudgetAttentionStatus>([
        'normal',
        'attention',
        'near-limit',
        'over-budget',
        'no-budget-cap',
      ]));

    const commissionsInTable = within(table).getAllByRole('rowheader').map(
      (header) => header.textContent ?? '',
    );
    budgets.forEach((budget) => {
      expect(commissionsInTable.some((label) => label.includes(budget.commission))).toBe(true);
    });

    const largestBudget = [...budgets].sort(
      (left, right) => right.budgetedAmount - left.budgetedAmount,
    )[0];
    fireEvent.change(screen.getByLabelText('Ordenar'), { target: { value: 'budget' } });
    expect(within(table).getAllByRole('rowheader')[0]).toHaveTextContent(largestBudget.commission);

    const overBudget = budgets.filter((budget) => budget.status === 'over-budget');
    const overBudgetToggle = screen.getByRole('button', { name: /Acima do teto/i });
    fireEvent.click(overBudgetToggle);
    expect(overBudgetToggle).toHaveAttribute('aria-pressed', 'true');
    expect(within(table).getAllByRole('row')).toHaveLength(overBudget.length + 1);
    expect(container.querySelectorAll('.financial-commission-card')).toHaveLength(overBudget.length);

    fireEvent.click(overBudgetToggle);
    expect(within(table).getAllByRole('row')).toHaveLength(budgets.length + 1);
  });
});
