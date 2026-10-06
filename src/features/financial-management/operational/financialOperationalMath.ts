import type { FinancialBudget, FinancialBudgetLine } from './financialOperationalApi';

export interface BudgetExecutionRow {
  budget: FinancialBudget;
  lines: FinancialBudgetLine[];
  plannedCents: number;
  /** null quando não há teto: utilização indefinida, nunca zero. */
  balanceCents: number | null;
  utilizationPercentage: number | null;
}

/** Planejado deriva das linhas ativas; o teto é informado. Tudo em centavos inteiros. */
export function buildBudgetRows(budgets: readonly FinancialBudget[], lines: readonly FinancialBudgetLine[]): BudgetExecutionRow[] {
  return budgets.map((budget) => {
    const own = lines.filter((line) => line.budget_id === budget.id);
    const plannedCents = own.filter((line) => line.active).reduce((sum, line) => sum + line.planned_cents, 0);
    const cap = budget.budget_cap_cents;
    return {
      budget, lines: own, plannedCents,
      balanceCents: cap == null ? null : cap - plannedCents,
      utilizationPercentage: cap == null || cap === 0 ? null : Math.round((plannedCents / cap) * 1000) / 10,
    };
  });
}

/** Valor do patrocínio em dinheiro: livre + Rouanet. Declarado e contrapartida não somam. */
export function sponsorshipMoneyCents(s: { projected_free_cents: number; projected_rouanet_cents: number }): number {
  return s.projected_free_cents + s.projected_rouanet_cents;
}

export function sponsorshipConfirmedCents(s: { confirmed_free_cents: number; confirmed_rouanet_cents: number }): number {
  return s.confirmed_free_cents + s.confirmed_rouanet_cents;
}
