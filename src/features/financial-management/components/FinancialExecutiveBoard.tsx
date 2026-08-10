import {
  memo,
  useCallback,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { Layers3, Receipt, Wallet, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatBRL,
  formatCompactBRL,
  formatPercentage,
} from '@/features/financial-management/utils/financialFormatters';
import type {
  ExpenseExecutionGroup,
  ExpenseExecutionGroupingMode,
  ExpenseExecutionModel,
  ExpenseFundingSummary,
} from '@/features/financial-management/selectors/financialSelectors';

type ExecutionSide = 'planned' | 'realized';

interface TooltipState {
  group: ExpenseExecutionGroup;
  side: ExecutionSide;
  x: number;
  y: number;
}

function barWidth(amount: number, maxAmount: number) {
  if (!Number.isFinite(amount) || amount <= 0 || maxAmount <= 0) return 0;
  return Math.min(100, (amount / maxAmount) * 100);
}

interface ExecutionBarRowProps {
  group: ExpenseExecutionGroup;
  side: ExecutionSide;
  maxAmount: number;
  index: number;
  activeKey: string | null;
  onActivate: (group: ExpenseExecutionGroup, side: ExecutionSide, event: ReactMouseEvent) => void;
  onDeactivate: () => void;
}

const ExecutionBarRow = memo(function ExecutionBarRow({
  group,
  side,
  maxAmount,
  index,
  activeKey,
  onActivate,
  onDeactivate,
}: ExecutionBarRowProps) {
  const amount = side === 'planned' ? group.plannedAmount : group.realizedAmount;
  const share = side === 'planned' ? group.plannedSharePercentage : group.realizedSharePercentage;
  const isActive = activeKey === group.key;
  const isDimmed = activeKey !== null && !isActive;
  const width = barWidth(amount, maxAmount);

  return (
    <li
      className={cn(
        'fin-exec-row',
        `fin-exec-row--${side}`,
        isActive && 'is-active',
        isDimmed && 'is-dimmed',
        amount <= 0 && 'is-empty',
      )}
      style={{ ['--fin-exec-delay' as string]: `${Math.min(index, 18) * 26}ms` }}
      onMouseEnter={(event) => onActivate(group, side, event)}
      onMouseMove={(event) => onActivate(group, side, event)}
      onMouseLeave={onDeactivate}
      onFocus={(event) => onActivate(group, side, event as unknown as ReactMouseEvent)}
      onBlur={onDeactivate}
      tabIndex={0}
      aria-label={`${group.label}: ${side === 'planned' ? 'previsto' : 'realizado'} ${formatBRL(amount)}`}
    >
      <div className="fin-exec-row__head">
        <span className="fin-exec-row__label" title={group.label}>{group.label}</span>
        <span className="fin-exec-row__value" title={formatBRL(amount)}>
          {amount > 0 ? formatCompactBRL(amount) : '—'}
        </span>
      </div>
      <div className="fin-exec-row__track">
        <span
          className="fin-exec-row__fill"
          style={{ ['--fin-exec-width' as string]: `${width}%` }}
        />
      </div>
      <div className="fin-exec-row__foot">
        <span>{amount > 0 ? `${formatPercentage(share)} do total` : 'Sem valor registrado'}</span>
        <span>{group.expenseCount} {group.expenseCount === 1 ? 'linha' : 'linhas'}</span>
      </div>
    </li>
  );
});

function ExecutionColumn({
  side,
  title,
  eyebrow,
  icon: Icon,
  total,
  totalCaption,
  model,
  activeKey,
  onActivate,
  onDeactivate,
}: {
  side: ExecutionSide;
  title: string;
  eyebrow: string;
  icon: LucideIcon;
  total: number;
  totalCaption: ReactNode;
  model: ExpenseExecutionModel;
  activeKey: string | null;
  onActivate: (group: ExpenseExecutionGroup, side: ExecutionSide, event: ReactMouseEvent) => void;
  onDeactivate: () => void;
}) {
  const rows = side === 'realized'
    ? [...model.groups].sort((a, b) => b.realizedAmount - a.realizedAmount)
    : model.groups;
  const hasAnyValue = rows.some((group) => (
    (side === 'planned' ? group.plannedAmount : group.realizedAmount) > 0
  ));

  return (
    <section className={cn('fin-exec-column', `fin-exec-column--${side}`)}>
      <header className="fin-exec-column__header">
        <span className="fin-exec-column__icon" aria-hidden="true"><Icon /></span>
        <div className="fin-exec-column__identity">
          <p>{eyebrow}</p>
          <h3>{title}</h3>
        </div>
        <div className="fin-exec-column__total">
          <strong title={formatBRL(total)}>{formatCompactBRL(total)}</strong>
          <small>{totalCaption}</small>
        </div>
      </header>

      {hasAnyValue ? (
        <ol className="fin-exec-column__rows">
          {rows.map((group, index) => (
            <ExecutionBarRow
              key={group.key}
              group={group}
              side={side}
              index={index}
              maxAmount={model.maxAmount}
              activeKey={activeKey}
              onActivate={onActivate}
              onDeactivate={onDeactivate}
            />
          ))}
        </ol>
      ) : (
        <p className="fin-exec-column__empty">Nenhum valor registrado neste recorte.</p>
      )}
    </section>
  );
}

function ExecutionTooltip({ state }: { state: TooltipState }) {
  const { group } = state;
  return (
    <div
      className="fin-exec-tooltip"
      role="presentation"
      style={{
        ['--fin-tip-x' as string]: `${state.x}px`,
        ['--fin-tip-y' as string]: `${state.y}px`,
      }}
    >
      <p className="fin-exec-tooltip__title">{group.label}</p>
      <dl>
        <div>
          <dt>Previsto</dt>
          <dd>{formatBRL(group.plannedAmount)}</dd>
        </div>
        <div>
          <dt>Realizado</dt>
          <dd>{formatBRL(group.realizedAmount)}</dd>
        </div>
        {group.hasExecutionRate && (
          <div>
            <dt>Execução</dt>
            <dd>{formatPercentage(group.executionPercentage)}</dd>
          </div>
        )}
        {group.hasExecutionRate && (
          <div>
            <dt>Diferença</dt>
            <dd className={group.differenceAmount > 0 ? 'is-over' : undefined}>
              {formatBRL(group.differenceAmount)}
            </dd>
          </div>
        )}
        <div>
          <dt>Participação {state.side === 'planned' ? 'no previsto' : 'no realizado'}</dt>
          <dd>
            {formatPercentage(state.side === 'planned'
              ? group.plannedSharePercentage
              : group.realizedSharePercentage)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export interface ExpenseExecutionBoardProps {
  model: ExpenseExecutionModel;
  grouping: ExpenseExecutionGroupingMode;
  onGroupingChange: (grouping: ExpenseExecutionGroupingMode) => void;
}

/**
 * Side-by-side planning versus execution reading of the complete expense base.
 * Both columns share one scale so their bars remain directly comparable, and
 * hovering a group highlights its counterpart on the opposite column.
 */
export function ExpenseExecutionBoard({
  model,
  grouping,
  onGroupingChange,
}: ExpenseExecutionBoardProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const handleActivate = useCallback((
    group: ExpenseExecutionGroup,
    side: ExecutionSide,
    event: ReactMouseEvent,
  ) => {
    const board = event.currentTarget.closest('.fin-exec-board') as HTMLElement | null;
    const bounds = board?.getBoundingClientRect();
    const pointerX = 'clientX' in event && event.clientX ? event.clientX : (bounds?.left ?? 0) + 120;
    const pointerY = 'clientY' in event && event.clientY ? event.clientY : (bounds?.top ?? 0) + 80;
    setTooltip({
      group,
      side,
      x: bounds ? Math.min(Math.max(pointerX - bounds.left, 90), bounds.width - 90) : 0,
      y: bounds ? pointerY - bounds.top : 0,
    });
  }, []);

  const handleDeactivate = useCallback(() => setTooltip(null), []);

  const summary = useMemo(() => ([
    { label: 'Previsto', value: formatCompactBRL(model.plannedTotal), exact: formatBRL(model.plannedTotal) },
    { label: 'Realizado', value: formatCompactBRL(model.realizedTotal), exact: formatBRL(model.realizedTotal) },
    {
      label: 'Execução',
      value: model.hasExecutionRate ? formatPercentage(model.executionPercentage) : '—',
      exact: model.hasExecutionRate ? formatPercentage(model.executionPercentage, 2) : 'Sem previsto positivo',
    },
    { label: 'Diferença', value: formatCompactBRL(model.differenceAmount), exact: formatBRL(model.differenceAmount) },
  ]), [model]);

  return (
    <div className="fin-exec-board" data-fin-grouping={grouping}>
      <div className="fin-exec-board__command">
        <dl className="fin-exec-board__summary">
          {summary.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd title={item.exact}>{item.value}</dd>
            </div>
          ))}
        </dl>
        <div className="fin-exec-board__toggle" role="group" aria-label="Agrupamento das despesas">
          {([
            { id: 'commission' as const, label: 'Comissão' },
            { id: 'category' as const, label: 'Categoria' },
          ]).map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={grouping === option.id}
              className={cn('fin-exec-board__toggle-button', grouping === option.id && 'is-active')}
              onClick={() => onGroupingChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="fin-exec-board__columns">
        <ExecutionColumn
          side="planned"
          eyebrow="Planejamento"
          title="Despesas previstas"
          icon={Layers3}
          total={model.plannedTotal}
          totalCaption={`${model.groupCount} ${grouping === 'category' ? 'categorias' : 'comissões'} · ${model.expenseCount} linhas`}
          model={model}
          activeKey={tooltip?.group.key ?? null}
          onActivate={handleActivate}
          onDeactivate={handleDeactivate}
        />
        <ExecutionColumn
          side="realized"
          eyebrow="Execução"
          title="Despesas realizadas"
          icon={Receipt}
          total={model.realizedTotal}
          totalCaption={model.hasExecutionRate
            ? `${formatPercentage(model.executionPercentage)} do previsto`
            : 'Sem base de comparação'}
          model={model}
          activeKey={tooltip?.group.key ?? null}
          onActivate={handleActivate}
          onDeactivate={handleDeactivate}
        />
      </div>

      {tooltip && <ExecutionTooltip state={tooltip} />}
    </div>
  );
}

export interface FundingDistributionStripProps {
  data: readonly ExpenseFundingSummary[];
}

/**
 * Compact stacked reading of the registered origin columns. The origins are
 * independent worksheet fields and never totalise the realized amount.
 */
export function FundingDistributionStrip({ data }: FundingDistributionStripProps) {
  const registeredTotal = data.reduce((total, item) => total + Math.max(item.amount, 0), 0);
  const items = [...data].sort((left, right) => right.amount - left.amount);

  if (registeredTotal <= 0) {
    return <p className="fin-funding__empty">Nenhuma origem registrada neste recorte.</p>;
  }

  return (
    <div className="fin-funding">
      <div className="fin-funding__bar" role="img" aria-label="Distribuição entre origens registradas">
        {items.map((item, index) => (
          <span
            key={item.key}
            className={cn('fin-funding__segment', `fin-funding__segment--${item.key}`)}
            style={{
              ['--fin-funding-share' as string]: `${(Math.max(item.amount, 0) / registeredTotal) * 100}%`,
              ['--fin-exec-delay' as string]: `${index * 90}ms`,
            }}
            title={`${item.label}: ${formatBRL(item.amount)}`}
          />
        ))}
      </div>
      <ul className="fin-funding__legend">
        {items.map((item) => (
          <li key={item.key}>
            <span className={cn('fin-funding__dot', `fin-funding__segment--${item.key}`)} aria-hidden="true" />
            <span className="fin-funding__label">{item.label}</span>
            <span className="fin-funding__amount" title={formatBRL(item.amount)}>
              {formatCompactBRL(item.amount)}
            </span>
            <span className="fin-funding__share">
              {formatPercentage((Math.max(item.amount, 0) / registeredTotal) * 100)}
            </span>
          </li>
        ))}
      </ul>
      <p className="fin-funding__note">
        <Wallet aria-hidden="true" />
        Origens independentes; não totalizam o realizado.
      </p>
    </div>
  );
}
