import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchExpenseComparison, fetchExpenseDetail, listExpenseCategories, listExpenses, saveExpense, saveExpenseCategory,
  seedExpenseCategories, transitionExpense, type ExpenseFilters, type ExpenseInput, type ExpenseStatus, type ExpenseCategory,
} from './financialExpensesApi';

const ROOT = ['financial-operational'] as const;
export const expenseKeys = {
  all: (orgId: string) => [...ROOT, 'expenses', orgId] as const,
  list: (orgId: string, editionId: string, filters: ExpenseFilters, page: number) => [...ROOT, 'expenses', orgId, editionId, 'list', filters, page] as const,
  comparison: (orgId: string, editionId: string, filters: ExpenseFilters) => [...ROOT, 'expenses', orgId, editionId, 'comparison', filters] as const,
  detail: (orgId: string, id: string) => [...ROOT, 'expenses', orgId, 'detail', id] as const,
  categories: (orgId: string, archived: boolean) => [...ROOT, 'expense-categories', orgId, archived] as const,
};
const PAGE = 25;

export function useExpenseList(orgId: string, editionId: string, filters: ExpenseFilters, page: number) {
  return useQuery({ queryKey: expenseKeys.list(orgId, editionId, filters, page), queryFn: () => listExpenses(orgId, editionId, filters, PAGE, page * PAGE),
    placeholderData: keepPreviousData, retry: false });
}
export const EXPENSE_PAGE_SIZE = PAGE;
export function useExpenseComparison(orgId: string, editionId: string, filters: ExpenseFilters) {
  return useQuery({ queryKey: expenseKeys.comparison(orgId, editionId, filters), queryFn: () => fetchExpenseComparison(orgId, editionId, filters), retry: false });
}
export function useExpenseDetail(orgId: string, id: string | null) {
  return useQuery({ queryKey: expenseKeys.detail(orgId, id ?? ''), queryFn: () => fetchExpenseDetail(orgId, id as string), enabled: Boolean(id), retry: false });
}
export function useExpenseCategories(orgId: string, includeArchived = false) {
  return useQuery({ queryKey: expenseKeys.categories(orgId, includeArchived), queryFn: () => listExpenseCategories(orgId, includeArchived), retry: false });
}

/** Após confirmação do servidor: lista, detalhe, comparação, execução orçamentária e painel. */
function useInvalidate(orgId: string) {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: expenseKeys.all(orgId) }),
    qc.invalidateQueries({ queryKey: [...ROOT, 'expense-categories', orgId] }),
    qc.invalidateQueries({ queryKey: [...ROOT, 'summary'] }),
    qc.invalidateQueries({ queryKey: [...ROOT, 'budget-execution'] }),
    qc.invalidateQueries({ queryKey: [...ROOT, 'budgets'] }),
  ]);
}

export function useSaveExpense(orgId: string) {
  const invalidate = useInvalidate(orgId);
  return useMutation({
    mutationFn: (v: { payload: ExpenseInput; expectedVersion: number | null; requestId: string; reason?: string }) =>
      saveExpense(orgId, v.payload, v.expectedVersion, v.requestId, v.reason),
    onSuccess: () => invalidate(),
  });
}
export function useTransitionExpense(orgId: string) {
  const invalidate = useInvalidate(orgId);
  return useMutation({
    mutationFn: (v: { id: string; to: ExpenseStatus; expectedVersion: number; payload: { committed_cents?: number; committed_on?: string; due_date?: string | null }; reason: string | null; requestId: string }) =>
      transitionExpense(orgId, v.id, v.to, v.expectedVersion, v.payload, v.reason, v.requestId),
    onSuccess: () => invalidate(),
  });
}
export function useSaveExpenseCategory(orgId: string) {
  const invalidate = useInvalidate(orgId);
  return useMutation({
    mutationFn: (v: { payload: Partial<ExpenseCategory> & { name?: string }; expectedVersion: number | null; requestId: string }) =>
      saveExpenseCategory(orgId, v.payload, v.expectedVersion, v.requestId),
    onSuccess: () => invalidate(),
  });
}
export function useSeedExpenseCategories(orgId: string) {
  const invalidate = useInvalidate(orgId);
  return useMutation({ mutationFn: (requestId: string) => seedExpenseCategories(orgId, requestId), onSuccess: () => invalidate() });
}
