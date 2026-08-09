import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownWideNarrow,
  BadgeDollarSign,
  ChevronRight,
  CircleDollarSign,
  Handshake,
  Layers3,
  ListFilter,
  ReceiptText,
  SearchX,
  TicketCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type {
  CommissionBudget,
  FinancialExpense,
  FinancialRevenue,
  GeneralBudgetItem,
  Sponsor,
  SponsorTier,
} from '../types';
import {
  calculateRevenueGap,
  classifyBudgetStatus,
  classifyRevenueConsolidationStatus,
  groupExpensesByCategory,
  groupExpensesByFundingSource,
  selectExpenseDisplayAmount,
  selectRevenueReceiptStatus,
} from '../selectors/financialSelectors';
import {
  formatBRL,
  formatExcelSerialDate,
  formatPercentage,
  roundCurrency,
} from '../utils/financialFormatters';
import {
  BudgetProgress,
  FinancialAmount,
  FinancialStatePanel,
  FinancialStatusBadge,
} from './FinancialPrimitives';
import '@/styles/financial-expense-ledgers.css';

function getExpenseFundingLabels(expense: FinancialExpense) {
  const labels: string[] = [];
  if (expense.paidWithFreeResource !== 0) labels.push('Recurso Livre');
  if (expense.municipalityPlanAmount !== 0) labels.push('Prefeitura / Plano de Trabalho');
  if (expense.rouanetAmount !== 0) labels.push('Lei Rouanet');
  return labels;
}

function getExpensePaymentStatus(expense: FinancialExpense) {
  if (expense.paidMarkerAmount !== 0 || expense.paidWithFreeResource !== 0) {
    return { status: 'realized' as const, label: 'Pagamento informado' };
  }
  if (getExpenseFundingLabels(expense).length > 0) {
    return { status: 'partial' as const, label: 'Origem informada' };
  }
  if (expense.realizedAmount !== 0) {
    return { status: 'realized' as const, label: 'Realizado na fonte' };
  }
  return { status: 'unreported' as const, label: 'Sem valor realizado' };
}

function getSponsorAmounts(sponsor: Sponsor) {
  return {
    projected: roundCurrency(sponsor.projectedFreeResource + sponsor.projectedRouanet),
    consolidated: roundCurrency(sponsor.consolidatedFreeResource + sponsor.consolidatedRouanet),
  };
}

function getSponsorStatus(sponsor: Sponsor) {
  const { projected, consolidated } = getSponsorAmounts(sponsor);
  if (projected === 0 && consolidated === 0) return 'unreported' as const;
  if (consolidated >= projected) return 'consolidated' as const;
  if (consolidated > 0) return 'partial' as const;
  return 'projected' as const;
}

function FinancialTableEmpty({ search = false }: { search?: boolean }) {
  return (
    <FinancialStatePanel
      state={search ? 'no-results' : 'empty'}
      icon={search ? SearchX : undefined}
    />
  );
}

interface RevenueLedgerProps {
  revenues: readonly FinancialRevenue[];
  emptyFromSearch?: boolean;
  confirmedView?: boolean;
}

export function RevenueLedger({ revenues, emptyFromSearch = false, confirmedView = false }: RevenueLedgerProps) {
  if (revenues.length === 0) return <FinancialTableEmpty search={emptyFromSearch} />;

  const primaryColumn = confirmedView ? 'consolidated' : 'projected';

  return (
    <div
      className="financial-ledger"
      data-financial-ledger="revenue"
      data-financial-primary-column={primaryColumn}
    >
      <div className="financial-table-shell financial-desktop-only">
        <table className="financial-table financial-table--revenue">
          <caption className="sr-only">
            {confirmedView ? 'Receitas consolidadas por fonte' : 'Receitas projetadas por fonte'}
          </caption>
          <thead>
            <tr>
              <th scope="col">Fonte</th>
              <th scope="col">Categoria</th>
              <th scope="col">Recurso</th>
              <th
                scope="col"
                className={cn(
                  'financial-table__number',
                  !confirmedView && 'financial-table__number--primary',
                )}
                data-financial-column="projected"
              >
                Projetado
              </th>
              <th
                scope="col"
                className={cn(
                  'financial-table__number',
                  confirmedView && 'financial-table__number--primary',
                )}
                data-financial-column="consolidated"
              >
                Consolidado
              </th>
              <th scope="col" className="financial-table__number">Lacuna</th>
              <th scope="col" className="financial-table__number">A receber informado</th>
              <th scope="col">Consolidação</th>
              <th scope="col">Recebimento</th>
            </tr>
          </thead>
          <tbody>
            {revenues.map((revenue) => {
              const status = classifyRevenueConsolidationStatus(revenue);
              const receipt = selectRevenueReceiptStatus(revenue);
              const gap = calculateRevenueGap(revenue);
              return (
                <tr key={revenue.id}>
                  <th scope="row">
                    <span className="financial-table__primary">{revenue.source}</span>
                    <span className="financial-table__secondary">
                      {revenue.ecosystem === 'sponsorship' ? 'Patrocínios' : 'Comercial'}
                    </span>
                  </th>
                  <td>
                    <span className="financial-table__quiet-chip financial-table__quiet-chip--category">
                      {revenue.category}
                    </span>
                  </td>
                  <td>
                    <span className="financial-table__quiet-chip financial-table__quiet-chip--resource">
                      {revenue.fundingType}
                    </span>
                  </td>
                  <td
                    className={cn(
                      'financial-table__number',
                      !confirmedView && 'financial-table__number--primary',
                    )}
                    data-financial-column="projected"
                  >
                    <FinancialAmount value={revenue.projectedAmount} />
                  </td>
                  <td
                    className={cn(
                      'financial-table__number',
                      confirmedView && 'financial-table__number--primary',
                    )}
                    data-financial-column="consolidated"
                  >
                    <FinancialAmount value={revenue.consolidatedAmount} />
                  </td>
                  <td className={cn('financial-table__number', gap < 0 && 'financial-table__number--positive')}>
                    <FinancialAmount value={gap} />
                  </td>
                  <td className="financial-table__number"><FinancialAmount value={revenue.receivableAmount} /></td>
                  <td><FinancialStatusBadge status={status} /></td>
                  <td>
                    <div className="financial-table__status-stack">
                      <FinancialStatusBadge status={receipt.status} label={receipt.label} />
                      {revenue.receivedOn !== undefined && (
                        <small>{formatExcelSerialDate(revenue.receivedOn)}</small>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="financial-mobile-list financial-mobile-only">
        {revenues.map((revenue) => {
          const status = classifyRevenueConsolidationStatus(revenue);
          const receipt = selectRevenueReceiptStatus(revenue);
          const gap = calculateRevenueGap(revenue);
          const hasProjectionBase = revenue.projectedAmount > 0;
          const rawConsolidationPercentage = hasProjectionBase
            ? (revenue.consolidatedAmount / revenue.projectedAmount) * 100
            : 0;
          const consolidationPercentage = Number.isFinite(rawConsolidationPercentage)
            ? Math.max(rawConsolidationPercentage, 0)
            : 0;
          const visualConsolidationPercentage = Math.min(consolidationPercentage, 100);
          const consolidationLabel = hasProjectionBase
            ? formatPercentage(consolidationPercentage)
            : 'Sem projeção-base';
          return (
            <article
              key={revenue.id}
              className="financial-mobile-card financial-mobile-card--revenue"
              data-financial-primary-column={primaryColumn}
            >
              <header className="financial-mobile-card__header">
                <div>
                  <p className="financial-mobile-card__eyebrow">
                    <span className="financial-table__quiet-chip financial-table__quiet-chip--category">
                      {revenue.category}
                    </span>
                  </p>
                  <h3>{revenue.source}</h3>
                </div>
                <FinancialStatusBadge status={status} />
              </header>
              <dl className="financial-mobile-card__amount-grid">
                <div
                  className="financial-mobile-card__amount financial-mobile-card__amount--primary"
                  data-financial-column={confirmedView ? 'consolidated' : 'projected'}
                >
                  <dt>{confirmedView ? 'Consolidado' : 'Projetado'}</dt>
                  <dd><FinancialAmount value={confirmedView ? revenue.consolidatedAmount : revenue.projectedAmount} /></dd>
                </div>
                <div
                  className="financial-mobile-card__amount financial-mobile-card__amount--secondary"
                  data-financial-column={confirmedView ? 'projected' : 'consolidated'}
                >
                  <dt>{confirmedView ? 'Projetado' : 'Consolidado'}</dt>
                  <dd><FinancialAmount value={confirmedView ? revenue.projectedAmount : revenue.consolidatedAmount} /></dd>
                </div>
              </dl>
              <div className="financial-mobile-card__consolidation">
                <div className="financial-mobile-card__consolidation-label" aria-hidden="true">
                  <span>Consolidação</span>
                  <strong>{consolidationLabel}</strong>
                </div>
                <div
                  className="financial-mobile-card__consolidation-track"
                  role="progressbar"
                  aria-label={`Consolidação de ${revenue.source}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={visualConsolidationPercentage}
                  aria-valuetext={`${formatBRL(revenue.consolidatedAmount)} consolidados de ${formatBRL(revenue.projectedAmount)} projetados (${consolidationLabel})`}
                >
                  <span
                    className="financial-mobile-card__consolidation-fill"
                    style={{ transform: `scaleX(${visualConsolidationPercentage / 100})` }}
                  />
                </div>
              </div>
              <details className="financial-mobile-card__details">
                <summary>Ver detalhes</summary>
                <dl>
                  <div><dt>Lacuna de consolidação</dt><dd>{formatBRL(gap)}</dd></div>
                  <div><dt>A receber informado</dt><dd>{formatBRL(revenue.receivableAmount)}</dd></div>
                  <div><dt>Situação de recebimento</dt><dd>{receipt.label}</dd></div>
                  <div>
                    <dt>Tipo de recurso</dt>
                    <dd>
                      <span className="financial-table__quiet-chip financial-table__quiet-chip--resource">
                        {revenue.fundingType}
                      </span>
                    </dd>
                  </div>
                  {revenue.receivedOn !== undefined && (
                    <div><dt>Data informada</dt><dd>{formatExcelSerialDate(revenue.receivedOn)}</dd></div>
                  )}
                </dl>
                {revenue.notes && <p>{revenue.notes}</p>}
              </details>
            </article>
          );
        })}
      </div>
    </div>
  );
}

interface ExpenseLedgerProps {
  expenses: readonly FinancialExpense[];
  mode: 'planning' | 'realized';
  emptyFromSearch?: boolean;
}

export function ExpenseLedger({ expenses, mode, emptyFromSearch = false }: ExpenseLedgerProps) {
  if (expenses.length === 0) return <FinancialTableEmpty search={emptyFromSearch} />;
  const isPlanning = mode === 'planning';
  const primaryColumn = isPlanning ? 'period-total' : 'realized';

  return (
    <div
      className="financial-ledger financial-expense-ledger"
      data-financial-ledger="expense"
      data-financial-expense-mode={mode}
      data-financial-primary-column={primaryColumn}
    >
      <div
        className="financial-table-shell financial-desktop-only financial-ledger-table-region"
        role="region"
        aria-label={isPlanning ? 'Tabela rolável de despesas previstas' : 'Tabela rolável de despesas realizadas'}
        tabIndex={0}
      >
        <table className="financial-table financial-table--expenses">
          <caption className="sr-only">
            {isPlanning ? 'Despesas previstas por comissão e período' : 'Despesas realizadas e origens registradas'}
          </caption>
          <thead>
            <tr>
              <th scope="col">Despesa</th>
              <th scope="col">Comissão</th>
              {isPlanning && <th scope="col">Categoria analítica</th>}
              {!isPlanning && (
                <th scope="col" className="financial-table__number financial-table__column--primary">
                  Realizado
                </th>
              )}
              <th scope="col" className="financial-table__number financial-table__column--supporting">
                2025
              </th>
              <th scope="col" className="financial-table__number financial-table__column--supporting">
                2026
              </th>
              {isPlanning && (
                <th scope="col" className="financial-table__number financial-table__column--primary">
                  Soma dos períodos
                </th>
              )}
              {isPlanning && (
                <th scope="col" className="financial-table__number">
                  Impacto no teto
                </th>
              )}
              {!isPlanning && <th scope="col">Origem registrada</th>}
              {!isPlanning && <th scope="col">Observação</th>}
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((expense) => {
              const periodTotal = selectExpenseDisplayAmount(expense, 'planning');
              const fundingLabels = getExpenseFundingLabels(expense);
              const paymentStatus = getExpensePaymentStatus(expense);
              const rowStatus = isPlanning ? (periodTotal > 0 ? 'projected' : 'unreported') : paymentStatus.status;
              const impact = expense.commissionBudgetCap > 0 ? (periodTotal / expense.commissionBudgetCap) * 100 : 0;
              return (
                <tr
                  key={expense.id}
                  className={cn('financial-table__data-row', `financial-table__data-row--${rowStatus}`)}
                  data-source-row={expense.sourceRow}
                  data-financial-row-status={rowStatus}
                  data-financial-has-observation={expense.observation ? 'true' : undefined}
                >
                  <th scope="row">
                    <span className="financial-table__primary">
                      {expense.description || `Sem descrição na fonte — linha ${expense.sourceRow}`}
                    </span>
                    <span className="financial-table__secondary">Linha {expense.sourceRow} da planilha</span>
                  </th>
                  <td className="financial-table__context-cell">{expense.commission}</td>
                  {isPlanning && <td className="financial-table__context-cell">{expense.category}</td>}
                  {!isPlanning && (
                    <td className="financial-table__number financial-table__number--primary">
                      <FinancialAmount value={expense.realizedAmount} />
                    </td>
                  )}
                  <td className="financial-table__number financial-table__number--supporting">
                    <FinancialAmount value={expense.value2025} />
                  </td>
                  <td className="financial-table__number financial-table__number--supporting">
                    <FinancialAmount value={expense.value2026} />
                  </td>
                  {isPlanning && (
                    <td className="financial-table__number financial-table__number--primary">
                      <FinancialAmount value={periodTotal} />
                    </td>
                  )}
                  {isPlanning && <td className="financial-table__number financial-table__number--ratio">{formatPercentage(impact)}</td>}
                  {!isPlanning && <td className="financial-table__context-cell">{fundingLabels.join(' + ') || 'Não informada'}</td>}
                  {!isPlanning && <td className="financial-table__observation">{expense.observation || '—'}</td>}
                  <td className="financial-table__status-cell">
                    {isPlanning ? (
                      <FinancialStatusBadge status={rowStatus} />
                    ) : (
                      <FinancialStatusBadge status={paymentStatus.status} label={paymentStatus.label} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="financial-mobile-list financial-mobile-only">
        {expenses.map((expense) => {
          const periodTotal = selectExpenseDisplayAmount(expense, 'planning');
          const fundingLabels = getExpenseFundingLabels(expense);
          const paymentStatus = getExpensePaymentStatus(expense);
          const rowStatus = isPlanning ? (periodTotal > 0 ? 'projected' : 'unreported') : paymentStatus.status;
          return (
            <article
              key={expense.id}
              className={cn('financial-mobile-card', 'financial-mobile-card--expense', `financial-mobile-card--expense-${mode}`)}
              data-financial-row-status={rowStatus}
              data-source-row={expense.sourceRow}
            >
              <header className="financial-mobile-card__header">
                <div>
                  <p className="financial-mobile-card__eyebrow">{expense.commission}</p>
                  <h3>{expense.description || `Sem descrição na fonte — linha ${expense.sourceRow}`}</h3>
                </div>
                <FinancialStatusBadge status={rowStatus} label={isPlanning ? undefined : paymentStatus.label} />
              </header>
              <div
                className="financial-mobile-card__hero-amount financial-mobile-card__hero-amount--primary"
                data-financial-primary-amount={primaryColumn}
              >
                <span>{isPlanning ? 'Soma dos períodos' : 'Realizado na fonte'}</span>
                <FinancialAmount value={isPlanning ? periodTotal : expense.realizedAmount} />
              </div>
              <dl className="financial-mobile-card__amount-grid">
                <div>
                  <dt>2025</dt>
                  <dd>
                    <FinancialAmount value={expense.value2025} />
                  </dd>
                </div>
                <div>
                  <dt>2026</dt>
                  <dd>
                    <FinancialAmount value={expense.value2026} />
                  </dd>
                </div>
              </dl>
              <details className="financial-mobile-card__details">
                <summary>Ver contexto financeiro</summary>
                <dl>
                  <div>
                    <dt>Categoria</dt>
                    <dd>{expense.category}</dd>
                  </div>
                  <div>
                    <dt>Teto da comissão</dt>
                    <dd>{formatBRL(expense.commissionBudgetCap)}</dd>
                  </div>
                  <div>
                    <dt>Orçado da comissão</dt>
                    <dd>{formatBRL(expense.commissionBudgetedAmount)}</dd>
                  </div>
                  <div>
                    <dt>Origem registrada</dt>
                    <dd>{fundingLabels.join(' + ') || 'Não informada'}</dd>
                  </div>
                </dl>
                {expense.observation && <p>{expense.observation}</p>}
              </details>
            </article>
          );
        })}
      </div>
    </div>
  );
}

interface GeneralBudgetLedgerProps {
  items: readonly GeneralBudgetItem[];
}

export function GeneralBudgetLedger({ items }: GeneralBudgetLedgerProps) {
  if (items.length === 0) return <FinancialTableEmpty />;

  return (
    <div className="financial-ledger" data-financial-ledger="general-budget">
      <div className="financial-table-shell financial-desktop-only">
        <table className="financial-table financial-table--general-budget">
          <caption className="sr-only">
            Obrigações históricas e investimentos gerais fora dos blocos de comissão
          </caption>
          <thead>
            <tr>
              <th scope="col">Item geral</th>
              <th scope="col">Natureza</th>
              <th scope="col" className="financial-table__number">Teto</th>
              <th scope="col" className="financial-table__number">Orçado</th>
              <th scope="col" className="financial-table__number">Saldo</th>
              <th scope="col">Observação da fonte</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const remaining = roundCurrency(item.budgetCap - item.budgetedAmount);
              const status = classifyBudgetStatus(item.budgetCap, item.budgetedAmount);
              return (
                <tr key={item.id} data-source-row={item.sourceRow}>
                  <th scope="row">
                    <span className="financial-table__primary">{item.description}</span>
                    <span className="financial-table__secondary">Despesas · linha {item.sourceRow}</span>
                  </th>
                  <td>{item.kind === 'historical-obligation' ? 'Obrigação histórica' : 'Investimento / obra'}</td>
                  <td className="financial-table__number"><FinancialAmount value={item.budgetCap} /></td>
                  <td className="financial-table__number"><FinancialAmount value={item.budgetedAmount} /></td>
                  <td className={cn('financial-table__number', remaining < 0 && 'financial-table__number--negative')}>
                    <FinancialAmount value={remaining} />
                  </td>
                  <td className="financial-table__observation">{item.observation || '—'}</td>
                  <td><FinancialStatusBadge status={status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="financial-mobile-list financial-mobile-only">
        {items.map((item) => {
          const remaining = roundCurrency(item.budgetCap - item.budgetedAmount);
          const status = classifyBudgetStatus(item.budgetCap, item.budgetedAmount);
          return (
            <article key={item.id} className="financial-mobile-card">
              <header className="financial-mobile-card__header">
                <div>
                  <p className="financial-mobile-card__eyebrow">
                    {item.kind === 'historical-obligation' ? 'Obrigação histórica' : 'Investimento / obra'}
                  </p>
                  <h3>{item.description}</h3>
                </div>
                <FinancialStatusBadge status={status} />
              </header>
              <div className="financial-mobile-card__hero-amount">
                <span>Orçado</span>
                <FinancialAmount value={item.budgetedAmount} />
              </div>
              <dl className="financial-mobile-card__amount-grid">
                <div><dt>Teto</dt><dd><FinancialAmount value={item.budgetCap} /></dd></div>
                <div><dt>{remaining < 0 ? 'Excedente' : 'Saldo'}</dt><dd><FinancialAmount value={Math.abs(remaining)} /></dd></div>
              </dl>
              <details className="financial-mobile-card__details">
                <summary>Ver referência</summary>
                <p>{item.observation || 'Sem observação na fonte.'}</p>
                <small>Despesas · linha {item.sourceRow}</small>
              </details>
            </article>
          );
        })}
      </div>
    </div>
  );
}

type CommissionSort = 'utilization' | 'budget' | 'balance';

interface CommissionBudgetLedgerProps {
  budgets: readonly CommissionBudget[];
}

export function CommissionBudgetLedger({ budgets }: CommissionBudgetLedgerProps) {
  const [sort, setSort] = useState<CommissionSort>('utilization');
  const [overOnly, setOverOnly] = useState(false);
  const [selected, setSelected] = useState<CommissionBudget | null>(null);
  const visibleBudgets = useMemo(() => {
    const filtered = overOnly ? budgets.filter((budget) => budget.status === 'over-budget') : budgets;
    return [...filtered].sort((left, right) => {
      if (sort === 'budget') return right.budgetedAmount - left.budgetedAmount;
      if (sort === 'balance') return left.remainingAmount - right.remainingAmount;
      return right.utilizationPercentage - left.utilizationPercentage;
    });
  }, [budgets, overOnly, sort]);

  const categories = selected ? groupExpensesByCategory(selected.expenses) : [];
  const funding = selected ? groupExpensesByFundingSource(selected.expenses) : [];
  const largestExpenses = selected ? [...selected.expenses].sort((a, b) => b.realizedAmount - a.realizedAmount).slice(0, 5) : [];
  const observations = selected?.expenses.filter((expense) => expense.observation) ?? [];

  return (
    <div className="financial-commission-ledger" data-financial-ledger="commission-budget" data-financial-primary-column="budgeted">
      <div className="financial-table-controls financial-commission-ledger__controls" aria-label="Ordenação e filtros do orçamento">
        <label>
          <ArrowDownWideNarrow aria-hidden="true" />
          <span>Ordenar</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as CommissionSort)}>
            <option value="utilization">Maior utilização</option>
            <option value="budget">Maior valor orçado</option>
            <option value="balance">Menor saldo</option>
          </select>
        </label>
        <button
          type="button"
          className={cn('financial-filter-toggle', overOnly && 'is-active')}
          aria-pressed={overOnly}
          onClick={() => setOverOnly((current) => !current)}
        >
          <ListFilter aria-hidden="true" />
          Acima do teto
          <span>{budgets.filter((budget) => budget.status === 'over-budget').length}</span>
        </button>
      </div>

      {visibleBudgets.length === 0 ? (
        <FinancialTableEmpty search />
      ) : (
        <>
          <div
            className="financial-table-shell financial-desktop-only financial-ledger-table-region"
            role="region"
            aria-label="Tabela rolável de orçamento por comissão"
            tabIndex={0}
          >
            <table className="financial-table financial-table--commissions">
              <caption className="sr-only">Orçamento e utilização por comissão</caption>
              <thead>
                <tr>
                  <th scope="col">Comissão</th>
                  <th scope="col" className="financial-table__number">
                    Teto
                  </th>
                  <th scope="col" className="financial-table__number financial-table__column--primary">
                    Orçado
                  </th>
                  <th scope="col" className="financial-table__number">
                    Saldo
                  </th>
                  <th scope="col" className="financial-table__number">
                    Utilização
                  </th>
                  <th scope="col" className="financial-table__number">
                    Despesas
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Detalhes</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleBudgets.map((budget) => (
                  <tr
                    key={budget.id}
                    className={cn('financial-table__data-row', `financial-table__data-row--${budget.status}`)}
                    data-selected={selected?.id === budget.id || undefined}
                    data-financial-row-status={budget.status}
                  >
                    <th scope="row">
                      <span className="financial-table__primary">{budget.commission}</span>
                      {budget.responsible && <span className="financial-table__secondary">Responsável: {budget.responsible}</span>}
                    </th>
                    <td className="financial-table__number financial-table__number--reference">
                      <FinancialAmount value={budget.budgetCap} />
                    </td>
                    <td className="financial-table__number financial-table__number--primary">
                      <FinancialAmount value={budget.budgetedAmount} />
                    </td>
                    <td
                      className={cn(
                        'financial-table__number',
                        'financial-table__number--balance',
                        budget.remainingAmount < 0 && 'financial-table__number--risk',
                      )}
                    >
                      <FinancialAmount value={budget.remainingAmount} />
                    </td>
                    <td className="financial-table__number financial-table__number--utilization">
                      {formatPercentage(budget.utilizationPercentage)}
                    </td>
                    <td className="financial-table__number financial-table__number--count">{budget.expenseCount}</td>
                    <td className="financial-table__status-cell">
                      <FinancialStatusBadge status={budget.status} label={budget.budgetCap === 0 ? 'Sem teto definido' : undefined} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="financial-table__detail-button"
                        onClick={() => setSelected(budget)}
                        aria-label={`Ver despesas de ${budget.commission}`}
                      >
                        <ChevronRight aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="financial-mobile-list financial-mobile-only">
            {visibleBudgets.map((budget) => (
              <article
                key={budget.id}
                className={cn('financial-commission-card', `financial-commission-card--${budget.status}`)}
                data-financial-row-status={budget.status}
              >
                <BudgetProgress
                  label={budget.commission}
                  budgetCap={budget.budgetCap}
                  budgetedAmount={budget.budgetedAmount}
                  remainingAmount={budget.remainingAmount < 0 ? Math.abs(budget.remainingAmount) : budget.remainingAmount}
                  utilizationPercentage={budget.utilizationPercentage}
                  status={budget.status}
                  balanceLabel={budget.remainingAmount < 0 ? 'Excedente' : 'Saldo'}
                  compactAmounts={false}
                />
                <Button type="button" variant="outline" className="financial-commission-card__action" onClick={() => setSelected(budget)}>
                  Ver {budget.expenseCount} despesas
                  <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Button>
              </article>
            ))}
          </div>
        </>
      )}

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="financial-detail-sheet">
          {selected && (
            <div className="financial-detail-sheet__layout">
              <SheetHeader className="financial-detail-sheet__header">
                <div className="financial-detail-sheet__eyebrow">
                  <BadgeDollarSign aria-hidden="true" /> Orçamento por comissão
                </div>
                <SheetTitle>{selected.commission}</SheetTitle>
                <SheetDescription>Leitura da base 2026. Teto, orçado e períodos permanecem conforme a planilha.</SheetDescription>
              </SheetHeader>
              <div className="financial-detail-sheet__body">
                <BudgetProgress
                  label={selected.commission}
                  budgetCap={selected.budgetCap}
                  budgetedAmount={selected.budgetedAmount}
                  remainingAmount={selected.remainingAmount < 0 ? Math.abs(selected.remainingAmount) : selected.remainingAmount}
                  utilizationPercentage={selected.utilizationPercentage}
                  status={selected.status}
                  balanceLabel={selected.remainingAmount < 0 ? 'Excedente' : 'Saldo'}
                  compactAmounts={false}
                />

                <section className="financial-detail-block">
                  <h3>
                    <Layers3 aria-hidden="true" /> Categorias de despesa
                  </h3>
                  <div className="financial-detail-list">
                    {categories
                      .sort((a, b) => b.realizedAmount - a.realizedAmount)
                      .slice(0, 6)
                      .map((category) => (
                        <div key={category.key}>
                          <span>{category.label}</span>
                          <strong>{formatBRL(category.realizedAmount)}</strong>
                        </div>
                      ))}
                  </div>
                </section>

                <section className="financial-detail-block">
                  <h3>
                    <ReceiptText aria-hidden="true" /> Maiores despesas
                  </h3>
                  <ol className="financial-ranked-list">
                    {largestExpenses.map((expense) => (
                      <li key={expense.id}>
                        <span>{expense.description || `Linha ${expense.sourceRow} sem descrição`}</span>
                        <strong>{formatBRL(expense.realizedAmount)}</strong>
                      </li>
                    ))}
                  </ol>
                </section>

                <section className="financial-detail-block">
                  <h3>
                    <CircleDollarSign aria-hidden="true" /> Valores registrados por origem
                  </h3>
                  <div className="financial-detail-list">
                    {funding.map((item) => (
                      <div key={item.key}>
                        <span>{item.label}</span>
                        <strong>{formatBRL(item.amount)}</strong>
                      </div>
                    ))}
                  </div>
                  <p className="financial-detail-block__note">As origens registradas não formam uma partição exaustiva do realizado.</p>
                </section>

                {observations.length > 0 && (
                  <section className="financial-detail-block">
                    <h3>
                      <TicketCheck aria-hidden="true" /> Observações da fonte
                    </h3>
                    <ul className="financial-note-list">
                      {observations.slice(0, 8).map((expense) => (
                        <li key={expense.id}>{expense.observation}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function SponsorTierBadge({ tier }: { tier: SponsorTier }) {
  const slug = tier
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-');
  return <span className={`financial-sponsor-tier financial-sponsor-tier--${slug}`}>{tier}</span>;
}

interface SponsorLedgerProps {
  sponsors: readonly Sponsor[];
  emptyFromSearch?: boolean;
}

export function SponsorLedger({ sponsors, emptyFromSearch = false }: SponsorLedgerProps) {
  const [selected, setSelected] = useState<Sponsor | null>(null);
  if (sponsors.length === 0) return <FinancialTableEmpty search={emptyFromSearch} />;

  return (
    <>
      <div className="financial-table-shell financial-desktop-only">
        <table className="financial-table financial-table--sponsors">
          <caption className="sr-only">Patrocínios Fenasoja 2026</caption>
          <thead>
            <tr>
              <th scope="col">Patrocinador</th>
              <th scope="col">Categoria</th>
              <th scope="col" className="financial-table__number">Projetado</th>
              <th scope="col" className="financial-table__number">Consolidado</th>
              <th scope="col" className="financial-table__number">A receber</th>
              <th scope="col">Recurso</th>
              <th scope="col">Contrapartida</th>
              <th scope="col">Status</th>
              <th scope="col"><span className="sr-only">Detalhes</span></th>
            </tr>
          </thead>
          <tbody>
            {sponsors.map((sponsor) => {
              const amounts = getSponsorAmounts(sponsor);
              const status = getSponsorStatus(sponsor);
              const resources = [
                sponsor.projectedFreeResource || sponsor.consolidatedFreeResource ? 'Livre' : '',
                sponsor.projectedRouanet || sponsor.consolidatedRouanet ? 'Rouanet' : '',
              ].filter(Boolean).join(' + ') || 'Não informado';
              return (
                <tr key={sponsor.id} data-selected={selected?.id === sponsor.id || undefined}>
                  <th scope="row"><span className="financial-table__primary">{sponsor.name}</span></th>
                  <td><SponsorTierBadge tier={sponsor.tier} /></td>
                  <td className="financial-table__number"><FinancialAmount value={amounts.projected} /></td>
                  <td className="financial-table__number"><FinancialAmount value={amounts.consolidated} /></td>
                  <td className="financial-table__number"><FinancialAmount value={sponsor.receivableAmount} /></td>
                  <td>{resources}</td>
                  <td className="financial-table__observation">
                    {sponsor.inKindContribution !== undefined ? String(sponsor.inKindContribution) : '—'}
                  </td>
                  <td><FinancialStatusBadge status={status} /></td>
                  <td>
                    <button
                      type="button"
                      className="financial-table__detail-button"
                      onClick={() => setSelected(sponsor)}
                      aria-label={`Ver detalhes de ${sponsor.name}`}
                    >
                      <ChevronRight aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="financial-mobile-list financial-mobile-only">
        {sponsors.map((sponsor) => {
          const amounts = getSponsorAmounts(sponsor);
          return (
            <article key={sponsor.id} className="financial-mobile-card financial-sponsor-card">
              <header className="financial-mobile-card__header">
                <div>
                  <SponsorTierBadge tier={sponsor.tier} />
                  <h3>{sponsor.name}</h3>
                </div>
                <FinancialStatusBadge status={getSponsorStatus(sponsor)} />
              </header>
              <dl className="financial-mobile-card__amount-grid">
                <div><dt>Projetado</dt><dd><FinancialAmount value={amounts.projected} /></dd></div>
                <div><dt>Consolidado</dt><dd><FinancialAmount value={amounts.consolidated} /></dd></div>
              </dl>
              {sponsor.receivableAmount > 0 && (
                <div className="financial-sponsor-card__receivable">
                  <span>A receber informado</span>
                  <FinancialAmount value={sponsor.receivableAmount} />
                </div>
              )}
              <Button type="button" variant="outline" onClick={() => setSelected(sponsor)}>
                Ver composição
                <ChevronRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </article>
          );
        })}
      </div>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent side="right" className="financial-detail-sheet">
          {selected && (() => {
            const amounts = getSponsorAmounts(selected);
            return (
              <div className="financial-detail-sheet__layout">
                <SheetHeader className="financial-detail-sheet__header">
                  <div className="financial-detail-sheet__eyebrow"><Handshake aria-hidden="true" /> Patrocínio Fenasoja 2026</div>
                  <SheetTitle>{selected.name}</SheetTitle>
                  <SheetDescription>Composição financeira e contrapartidas preservadas da planilha de referência.</SheetDescription>
                </SheetHeader>
                <div className="financial-detail-sheet__body">
                  <div className="financial-sponsor-detail__hero">
                    <SponsorTierBadge tier={selected.tier} />
                    <FinancialStatusBadge status={getSponsorStatus(selected)} />
                  </div>
                  <dl className="financial-detail-metrics">
                    <div><dt>Projetado</dt><dd>{formatBRL(amounts.projected)}</dd></div>
                    <div><dt>Consolidado</dt><dd>{formatBRL(amounts.consolidated)}</dd></div>
                    <div><dt>A receber informado</dt><dd>{formatBRL(selected.receivableAmount)}</dd></div>
                    <div><dt>Valor declarado</dt><dd>{formatBRL(selected.declaredValue)}</dd></div>
                  </dl>
                  {selected.receivableNote && (
                    <section className="financial-detail-block">
                      <h3><ReceiptText aria-hidden="true" /> Situação informada em A Receber</h3>
                      <p>{selected.receivableNote}</p>
                    </section>
                  )}
                  <section className="financial-detail-block">
                    <h3><CircleDollarSign aria-hidden="true" /> Composição por recurso</h3>
                    <div className="financial-detail-list">
                      <div><span>Recurso Livre projetado</span><strong>{formatBRL(selected.projectedFreeResource)}</strong></div>
                      <div><span>Recurso Livre consolidado</span><strong>{formatBRL(selected.consolidatedFreeResource)}</strong></div>
                      <div><span>Rouanet projetado</span><strong>{formatBRL(selected.projectedRouanet)}</strong></div>
                      <div><span>Rouanet consolidado</span><strong>{formatBRL(selected.consolidatedRouanet)}</strong></div>
                    </div>
                  </section>
                  <section className="financial-detail-block">
                    <h3><TicketCheck aria-hidden="true" /> Credenciais e recebimento</h3>
                    <div className="financial-detail-list">
                      <div><span>Veículos / credenciais</span><strong>{selected.vehicleCredentials || '—'}</strong></div>
                      <div><span>Soy Summit</span><strong>{selected.soySummitCredentials || '—'}</strong></div>
                      <div><span>Data de recebimento</span><strong>{formatExcelSerialDate(selected.receivedOn)}</strong></div>
                    </div>
                  </section>
                  {selected.inKindContribution !== undefined && (
                    <section className="financial-detail-block">
                      <h3><Handshake aria-hidden="true" /> Outras contrapartidas</h3>
                      <p>{String(selected.inKindContribution)}</p>
                    </section>
                  )}
                  {selected.sourceQualityFlag?.code === 'DATE_LIKE_VALUE_IN_CONTRIBUTION_COLUMN' && (
                    <section className="financial-detail-block financial-detail-block--quality">
                      <h3><AlertTriangle aria-hidden="true" /> Valor atípico na fonte</h3>
                      <p>
                        {formatExcelSerialDate(selected.sourceQualityFlag.rawValue)} foi registrado em{' '}
                        <strong>{selected.sourceQualityFlag.cell}</strong>, coluna “Outras contrapartidas”.
                        O valor foi preservado como ocorrência de qualidade e não contabilizado como contrapartida.
                      </p>
                    </section>
                  )}
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
    </>
  );
}
