import type { PaymentPlanInput } from './financialEntryApi';
import { supabase } from '@/integrations/supabase/client';
import { FinancialNotActivatedError } from './financialOperationalApi';

/**
 * Despesas 2028 — contratos de serviço (RPCs `financial_*`). Nenhuma gravação direta em tabelas.
 * Valores sempre em centavos inteiros; `null` = não informado (diferente de zero).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type ExpenseStatus = 'prevista' | 'realizada' | 'cancelada';
export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = { prevista: 'Prevista', realizada: 'Realizada', cancelada: 'Cancelada' };
export type ExpenseDateField = 'planned_on' | 'committed_on' | 'due_date';
export const EXPENSE_DATE_FIELD_LABELS: Record<ExpenseDateField, string> = {
  planned_on: 'Data prevista', committed_on: 'Competência / realização', due_date: 'Vencimento',
};

export interface FinancialExpense {
  payee_reference_id?: string | null; payee_reference_name?: string | null;
  id: string; edition_id: string; title: string; description: string | null;
  category_id: string | null; category_name: string | null; commission_id: string | null; commission_name: string | null;
  budget_line_id: string | null; payee_name: string | null;
  planned_cents: number | null; planned_on: string | null; committed_cents: number | null; committed_on: string | null;
  due_date: string | null; status: ExpenseStatus; notes: string | null; cancel_reason: string | null;
  version: number; created_at: string; updated_at: string;
  obligation_id: string | null; paid_cents: number; open_cents: number; settlement_inconsistent: boolean;
}
export interface ExpenseFilters {
  category_id?: string; commission_id?: string; status?: ExpenseStatus | ''; q?: string;
  date_field?: ExpenseDateField; from?: string; to?: string;
}
export interface ExpensePage { total: number; limit: number; offset: number; items: FinancialExpense[] }
export type ComparisonState = 'comparavel' | 'sem_previsao';
export interface ExpenseGroupComparison {
  id: string | null; name: string; count: number; planned_cents: number; committed_cents: number; paid_cents: number;
  deviation_cents: number; deviation_pct: number | null; comparison_state: ComparisonState;
}
export interface ExpenseComparison {
  totals: {
    count: number; planned_cents: number; committed_cents: number; paid_cents: number; open_cents: number;
    deviation_cents: number; deviation_pct: number | null; comparison_state: ComparisonState;
    overdue_count: number; overdue_cents: number; realized_without_plan_count: number;
    by_status: Record<ExpenseStatus, number>;
  };
  by_category: ExpenseGroupComparison[];
  by_commission: ExpenseGroupComparison[];
}
export interface ExpenseCategory {
  id: string; parent_id: string | null; name: string; active: boolean; sort_order: number;
  icon: string | null; color: string | null; version: number; usage_count: number;
}
export interface ExpenseDetail {
  expense: FinancialExpense;
  obligation: { id: string; amount_cents: number; status: string; due_date: string | null } | null;
  movements: Array<{ id: string; kind: string; occurred_on: string; allocated_cents: number; reverses_movement_id: string | null }>;
  history: Array<{ id: string; action: string; created_at: string; reason: string | null }>;
}

/** Tipos de falha distinguíveis pela interface. */
export type ExpenseErrorKind = 'not_activated' | 'forbidden' | 'conflict' | 'validation' | 'network' | 'unknown';
export class FinancialExpenseError extends Error {
  constructor(public kind: ExpenseErrorKind, message: string, public raw?: string) { super(message); }
}

const MESSAGES: Array<[RegExp, ExpenseErrorKind, string]> = [
  [/FINANCIAL_FORBIDDEN: financial_confirm/, 'forbidden', 'Realizar despesas exige a permissão de confirmação financeira.'],
  [/FINANCIAL_FORBIDDEN: financial_admin/, 'forbidden', 'Gerenciar categorias exige administração financeira.'],
  [/FINANCIAL_FORBIDDEN|FINANCIAL_AUTH_REQUIRED|permission denied|FINANCIAL_EXPENSE_PROTECTED/, 'forbidden', 'Você não tem permissão para esta ação no Financeiro.'],
  [/FINANCIAL_EDITION_READ_ONLY/, 'forbidden', 'Esta edição é histórica e somente leitura.'],
  [/FINANCIAL_CONFLICT|FINANCIAL_REQUEST_IN_PROGRESS/, 'conflict', 'A despesa foi alterada por outra pessoa. Recarregue e tente novamente.'],
  [/FINANCIAL_IDEMPOTENCY_CONFLICT/, 'conflict', 'Esta tentativa já foi usada com outro conteúdo. Envie novamente.'],
  [/FINANCIAL_HAS_SETTLEMENT/, 'validation', 'Há pagamentos registrados. Estorne-os antes de cancelar ou reverter.'],
  [/FINANCIAL_OBLIGATION_BELOW_SETTLED/, 'validation', 'O valor realizado não pode ficar abaixo do que já foi pago.'],
  [/FINANCIAL_NO_PROJECTION/, 'validation', 'Esta despesa não tem previsão para voltar ao estado previsto.'],
  [/FINANCIAL_REASON_REQUIRED/, 'validation', 'Informe o motivo (mínimo 3 caracteres).'],
  [/FINANCIAL_PLANNED_REQUIRED/, 'validation', 'Informe o valor projetado.'],
  [/FINANCIAL_COMMITTED_REQUIRED/, 'validation', 'Informe valor realizado maior que zero e a data de competência.'],
  [/FINANCIAL_CATEGORY_ARCHIVED/, 'validation', 'Categoria arquivada não aceita novos vínculos.'],
  [/FINANCIAL_CATEGORY_DUPLICATE/, 'validation', 'Já existe uma categoria ativa com este nome.'],
  [/FINANCIAL_CATEGORY_CYCLE/, 'validation', 'Uma categoria não pode ficar dentro de si mesma.'],
  [/FINANCIAL_CATEGORY/, 'validation', 'Categoria inválida.'],
  [/FINANCIAL_BUDGET_COMMISSION_MISMATCH/, 'validation', 'A linha orçamentária pertence a outra comissão.'],
  [/FINANCIAL_BUDGET_INVALID/, 'validation', 'Linha orçamentária inválida para esta edição.'],
  [/FINANCIAL_COMMISSION_INVALID/, 'validation', 'Comissão inválida para esta organização.'],
  [/FINANCIAL_AMOUNT_INVALID/, 'validation', 'Valor inválido.'],
  [/FINANCIAL_DATE_INVALID/, 'validation', 'Data inválida.'],
  [/FINANCIAL_TITLE_INVALID/, 'validation', 'O título deve ter entre 2 e 240 caracteres.'],
  [/FINANCIAL_TRANSITION_INVALID|FINANCIAL_USE_TRANSITION|FINANCIAL_EXPENSE_CANCELLED/, 'validation', 'Esta mudança de situação não é permitida.'],
  [/FINANCIAL_/, 'validation', 'Algum dado informado é inválido.'],
];

function toError(error: { code?: string; message?: string } | null): FinancialExpenseError {
  const message = error?.message ?? '';
  if (error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(message))) {
    return new FinancialExpenseError('not_activated', new FinancialNotActivatedError().message, message);
  }
  if (/fetch|network|Failed to fetch|timeout/i.test(message) && !/FINANCIAL_/.test(message)) {
    return new FinancialExpenseError('network', 'Falha de conexão. Seus dados continuam no formulário; tente novamente.', message);
  }
  const hit = MESSAGES.find(([pattern]) => pattern.test(message));
  return hit ? new FinancialExpenseError(hit[1], hit[2], message) : new FinancialExpenseError('unknown', 'Não foi possível concluir a operação.', message);
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  let result: { data: unknown; error: { code?: string; message?: string } | null };
  try { result = await db.rpc(name, args); } catch (e) {
    throw new FinancialExpenseError('network', 'Falha de conexão. Tente novamente.', String(e));
  }
  if (result.error) throw toError(result.error);
  return result.data as T;
}

const cleanFilters = (f: ExpenseFilters) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== ''));

export const listExpenses = (orgId: string, editionId: string, filters: ExpenseFilters, limit = 50, offset = 0) =>
  rpc<ExpensePage>('financial_list_expenses', { _org_id: orgId, _edition_id: editionId, _filters: cleanFilters(filters), _limit: limit, _offset: offset });
export const fetchExpenseDetail = (orgId: string, expenseId: string) =>
  rpc<ExpenseDetail>('financial_expense_detail', { _org_id: orgId, _expense_id: expenseId });
export const fetchExpenseComparison = (orgId: string, editionId: string, filters: ExpenseFilters) =>
  rpc<ExpenseComparison>('financial_expense_comparison', { _org_id: orgId, _edition_id: editionId, _filters: cleanFilters(filters) });
export const listExpenseCategories = (orgId: string, includeArchived = false) =>
  rpc<ExpenseCategory[]>('financial_list_categories', { _org_id: orgId, _domain: 'despesa', _include_archived: includeArchived });

export interface ExpenseInput {
  id?: string; edition_id?: string; status?: 'prevista' | 'realizada';
  title?: string; description?: string | null; category_id?: string | null; commission_id?: string | null;
  budget_line_id?: string | null; payee_name?: string | null; planned_cents?: number | null; planned_on?: string | null;
  committed_cents?: number | null; committed_on?: string | null; due_date?: string | null; notes?: string | null;
}
export const saveExpense = (orgId: string, payload: ExpenseInput, expectedVersion: number | null, requestId: string, reason?: string) =>
  rpc<FinancialExpense>('financial_save_expense', { _org_id: orgId, _payload: payload, _expected_version: expectedVersion, _request_id: requestId, _reason: reason ?? null });
export const transitionExpense = (orgId: string, expenseId: string, to: ExpenseStatus, expectedVersion: number,
  payload: { committed_cents?: number; committed_on?: string; due_date?: string | null; payment_plan?: PaymentPlanInput }, reason: string | null, requestId: string) =>
  rpc<FinancialExpense>('financial_transition_expense', { _org_id: orgId, _expense_id: expenseId, _to: to, _expected_version: expectedVersion,
    _payload: payload, _reason: reason, _request_id: requestId });
export const saveExpenseCategory = (orgId: string, payload: Partial<ExpenseCategory> & { name?: string }, expectedVersion: number | null, requestId: string) =>
  rpc<ExpenseCategory>('financial_save_category', { _org_id: orgId, _payload: { domain: 'despesa', ...payload }, _expected_version: expectedVersion, _request_id: requestId });
export const reorderExpenseCategories = (orgId: string, ids: string[], requestId: string) =>
  rpc<{ ok: boolean }>('financial_reorder_categories', { _org_id: orgId, _ordered_ids: ids, _request_id: requestId });
export const seedExpenseCategories = (orgId: string, requestId: string) =>
  rpc<{ created: number }>('financial_seed_expense_categories', { _org_id: orgId, _request_id: requestId });

/** Converte "1.234,56" → 123456 centavos; vazio → null. Rejeita frações abaixo do centavo e valores inseguros. */
export function parseCents(input: string): number | null {
  const value = input.trim();
  if (!value) return null;
  const normalized = value.replace(/\s|R\$/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new FinancialExpenseError('validation', 'Valor inválido. Use o formato 1.234,56.');
  const [int, frac = ''] = normalized.split('.');
  const cents = Number(int) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new FinancialExpenseError('validation', 'Valor acima do limite seguro.');
  return cents;
}
export const centsToInput = (cents: number | null) =>
  cents == null ? '' : (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Desvio = realizado − projetado; sem previsão não há percentual. */
export function deviation(planned: number | null, committed: number | null): { cents: number | null; pct: number | null; state: ComparisonState | 'sem_realizado' } {
  if (committed == null) return { cents: null, pct: null, state: 'sem_realizado' };
  if (planned == null || planned === 0) return { cents: planned == null ? null : committed - planned, pct: null, state: 'sem_previsao' };
  return { cents: committed - planned, pct: Math.round(((committed - planned) / planned) * 10000) / 100, state: 'comparavel' };
}
