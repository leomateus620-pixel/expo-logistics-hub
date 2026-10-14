import type { ExpenseStatus, FinancialExpense } from './financialExpensesApi';
import type { FinancialExpenseCapabilities } from './useFinancialExpenseCapabilities';

/** Mirrors transition capabilities and existing settlement restrictions before offering an action. */
export function canTransitionExpense(expense: FinancialExpense, to: ExpenseStatus, capabilities: FinancialExpenseCapabilities) {
  if (!capabilities.canEdit || capabilities.isLoading || capabilities.isError || expense.status === 'cancelada' || expense.status === to) return false;
  if (to === 'realizada') return expense.status === 'prevista' && capabilities.canConfirm;
  if (expense.paid_cents !== 0) return false;
  if (to === 'prevista') return expense.status === 'realizada' && expense.planned_cents != null && capabilities.canConfirm;
  return expense.status === 'prevista' || capabilities.canConfirm;
}
