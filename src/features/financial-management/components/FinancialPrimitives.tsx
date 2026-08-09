import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  CircleDashed,
  Clock3,
  Database,
  FileSearch,
  Loader2,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  BudgetAttentionStatus,
  FinancialSemanticStatus,
} from '@/features/financial-management/types';

const fullCurrencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactCurrencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  compactDisplay: 'short',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 2,
});

const percentageFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

function formatFullCurrency(value: number) {
  return fullCurrencyFormatter.format(value);
}

function formatCompactCurrency(value: number) {
  return compactCurrencyFormatter.format(value);
}

function isFiniteFinancialValue(value: number) {
  return Number.isFinite(value);
}

export interface FinancialAmountProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  value: number;
  compact?: boolean;
  accessibleLabel?: string;
  fallback?: string;
}

/**
 * Displays an optional compact BRL value while always exposing the exact,
 * two-decimal amount to assistive technology and native hover affordances.
 */
export function FinancialAmount({
  value,
  compact = false,
  accessibleLabel,
  fallback = 'Valor não informado',
  className,
  title,
  ...props
}: FinancialAmountProps) {
  const hasValue = isFiniteFinancialValue(value);
  const exactValue = hasValue ? formatFullCurrency(value) : fallback;
  const visualValue = hasValue
    ? compact
      ? formatCompactCurrency(value)
      : exactValue
    : '—';
  const spokenValue = accessibleLabel ? `${accessibleLabel}: ${exactValue}` : exactValue;

  return (
    <span
      className={cn('financial-amount', compact && 'financial-amount--compact', className)}
      title={title ?? exactValue}
      {...props}
    >
      <span className="financial-amount__visual" aria-hidden="true">
        {visualValue}
      </span>
      <span className="sr-only">{spokenValue}</span>
    </span>
  );
}

export type FinancialStatus = FinancialSemanticStatus | BudgetAttentionStatus;

interface FinancialStatusPresentation {
  label: string;
  icon: LucideIcon;
}

const statusPresentation: Record<FinancialStatus, FinancialStatusPresentation> = {
  projected: { label: 'Projetado', icon: TrendingUp },
  consolidated: { label: 'Consolidado', icon: BadgeCheck },
  receivable: { label: 'A receber', icon: Clock3 },
  realized: { label: 'Realizado', icon: ReceiptText },
  partial: { label: 'Consolidação parcial', icon: CircleDashed },
  unreported: { label: 'Não informado', icon: FileSearch },
  normal: { label: 'Dentro do esperado', icon: BadgeCheck },
  attention: { label: 'Atenção', icon: Clock3 },
  'near-limit': { label: 'Próximo do teto', icon: AlertTriangle },
  'over-budget': { label: 'Acima do teto', icon: AlertTriangle },
  'no-budget-cap': { label: 'Sem teto definido', icon: WalletCards },
};

export interface FinancialStatusBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  status: FinancialStatus;
  label?: string;
  hideIcon?: boolean;
}

export function FinancialStatusBadge({
  status,
  label,
  hideIcon = false,
  className,
  ...props
}: FinancialStatusBadgeProps) {
  const presentation = statusPresentation[status];
  const Icon = presentation.icon;

  return (
    <span
      className={cn(
        'financial-status-badge',
        `financial-status-badge--${status}`,
        className,
      )}
      data-financial-status={status}
      {...props}
    >
      {!hideIcon && <Icon className="financial-status-badge__icon" aria-hidden="true" />}
      <span className="financial-status-badge__label">{label ?? presentation.label}</span>
    </span>
  );
}

export type FinancialKpiValueKind = 'currency' | 'percentage' | 'number' | 'text';

export interface FinancialKpiCardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  label: string;
  value: ReactNode;
  valueKind?: FinancialKpiValueKind;
  compactValue?: boolean;
  detail?: ReactNode;
  eyebrow?: ReactNode;
  icon?: LucideIcon;
  status?: FinancialStatus;
  statusLabel?: string;
  tone?: FinancialStatus | 'neutral' | 'gold';
  footer?: ReactNode;
}

function renderKpiValue(
  value: ReactNode,
  valueKind: FinancialKpiValueKind,
  compactValue: boolean,
  label: string,
) {
  if (typeof value !== 'number') return value;

  if (valueKind === 'currency') {
    return <FinancialAmount value={value} compact={compactValue} accessibleLabel={label} />;
  }

  if (valueKind === 'percentage') {
    return `${percentageFormatter.format(value)}%`;
  }

  return numberFormatter.format(value);
}

export function FinancialKpiCard({
  label,
  value,
  valueKind = 'currency',
  compactValue = true,
  detail,
  eyebrow,
  icon: Icon,
  status,
  statusLabel,
  tone = 'neutral',
  footer,
  className,
  ...props
}: FinancialKpiCardProps) {
  return (
    <article
      className={cn('financial-kpi-card', `financial-kpi-card--${tone}`, className)}
      data-financial-tone={tone}
      {...props}
    >
      <div className="financial-kpi-card__topline">
        <div className="financial-kpi-card__heading">
          {eyebrow && <span className="financial-kpi-card__eyebrow">{eyebrow}</span>}
          <h3 className="financial-kpi-card__label">{label}</h3>
        </div>
        {Icon && (
          <span className="financial-kpi-card__icon-shell" aria-hidden="true">
            <Icon className="financial-kpi-card__icon" />
          </span>
        )}
      </div>

      <div className="financial-kpi-card__value">
        {renderKpiValue(value, valueKind, compactValue, label)}
      </div>

      {(detail || status) && (
        <div className="financial-kpi-card__context">
          {detail && <div className="financial-kpi-card__detail">{detail}</div>}
          {status && <FinancialStatusBadge status={status} label={statusLabel} />}
        </div>
      )}

      {footer && <div className="financial-kpi-card__footer">{footer}</div>}
    </article>
  );
}

export interface FinancialKpiGridProps extends HTMLAttributes<HTMLDivElement> {
  columns?: 2 | 3 | 4 | 5 | 6;
}

export function FinancialKpiGrid({
  columns = 3,
  className,
  children,
  ...props
}: FinancialKpiGridProps) {
  return (
    <div
      className={cn('financial-kpi-grid', className)}
      data-financial-columns={columns}
      {...props}
    >
      {children}
    </div>
  );
}

export interface FinancialSectionHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  headingLevel?: 2 | 3;
  titleId?: string;
}

export function FinancialSectionHeader({
  title,
  description,
  eyebrow,
  action,
  icon: Icon,
  headingLevel = 2,
  titleId,
  className,
  ...props
}: FinancialSectionHeaderProps) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';

  return (
    <header className={cn('financial-section-header', className)} {...props}>
      <div className="financial-section-header__identity">
        {Icon && (
          <span className="financial-section-header__icon-shell" aria-hidden="true">
            <Icon className="financial-section-header__icon" />
          </span>
        )}
        <div className="financial-section-header__copy">
          {eyebrow && <p className="financial-section-header__eyebrow">{eyebrow}</p>}
          <Heading id={titleId} className="financial-section-header__title">
            {title}
          </Heading>
          {description && (
            <p className="financial-section-header__description">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="financial-section-header__action">{action}</div>}
    </header>
  );
}

export interface BudgetProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  label: string;
  budgetCap: number;
  budgetedAmount: number;
  remainingAmount: number;
  utilizationPercentage: number;
  status: BudgetAttentionStatus;
  budgetCapLabel?: string;
  budgetedLabel?: string;
  balanceLabel?: string;
  compactAmounts?: boolean;
  showStatus?: boolean;
}

export function BudgetProgress({
  label,
  budgetCap,
  budgetedAmount,
  remainingAmount,
  utilizationPercentage,
  status,
  budgetCapLabel = 'Teto',
  budgetedLabel = 'Orçado',
  balanceLabel = 'Saldo',
  compactAmounts = true,
  showStatus = true,
  className,
  ...props
}: BudgetProgressProps) {
  const safeUtilization = Number.isFinite(utilizationPercentage) ? utilizationPercentage : 0;
  const visualPercentage = Math.min(Math.max(safeUtilization, 0), 100);
  const percentageLabel = status === 'no-budget-cap'
    ? 'Sem teto definido'
    : `${percentageFormatter.format(safeUtilization)}% utilizado`;
  const progressStyle = {
    width: '100%',
    transform: `scaleX(${visualPercentage / 100})`,
  } as CSSProperties;

  return (
    <div
      className={cn('financial-budget-progress', `financial-budget-progress--${status}`, className)}
      data-budget-status={status}
      {...props}
    >
      <div className="financial-budget-progress__header">
        <div>
          <h3 className="financial-budget-progress__label">{label}</h3>
          <p className="financial-budget-progress__percentage">{percentageLabel}</p>
        </div>
        {showStatus && <FinancialStatusBadge status={status} />}
      </div>

      <div
        className="financial-budget-progress__track"
        role="progressbar"
        aria-label={`Utilização orçamentária de ${label}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={visualPercentage}
        aria-valuetext={percentageLabel}
      >
        <span className="financial-budget-progress__fill" style={progressStyle} />
        {safeUtilization > 100 && (
          <span className="financial-budget-progress__overflow" aria-hidden="true" />
        )}
      </div>

      <dl className="financial-budget-progress__amounts">
        <div className="financial-budget-progress__amount">
          <dt>{budgetedLabel}</dt>
          <dd>
            <FinancialAmount
              value={budgetedAmount}
              compact={compactAmounts}
              accessibleLabel={`${budgetedLabel} de ${label}`}
            />
          </dd>
        </div>
        <div className="financial-budget-progress__amount">
          <dt>{budgetCapLabel}</dt>
          <dd>
            <FinancialAmount
              value={budgetCap}
              compact={compactAmounts}
              accessibleLabel={`${budgetCapLabel} de ${label}`}
            />
          </dd>
        </div>
        <div className="financial-budget-progress__amount">
          <dt>{balanceLabel}</dt>
          <dd>
            <FinancialAmount
              value={remainingAmount}
              compact={compactAmounts}
              accessibleLabel={`${balanceLabel} de ${label}`}
            />
          </dd>
        </div>
      </dl>
    </div>
  );
}

export type FinancialStateKind =
  | 'loading'
  | 'empty'
  | 'no-results'
  | 'error'
  | 'restricted';

interface FinancialStatePresentation {
  title: string;
  description: string;
  icon: LucideIcon;
}

const financialStatePresentation: Record<FinancialStateKind, FinancialStatePresentation> = {
  loading: {
    title: 'Carregando visão financeira',
    description: 'Aguarde enquanto organizamos as informações desta área.',
    icon: Loader2,
  },
  empty: {
    title: 'Sem informações financeiras',
    description: 'Não há registros disponíveis para esta visão na base de referência.',
    icon: WalletCards,
  },
  'no-results': {
    title: 'Nenhum resultado encontrado',
    description: 'Revise a busca ou remova um dos filtros aplicados.',
    icon: FileSearch,
  },
  error: {
    title: 'Não foi possível apresentar os dados',
    description: 'Ocorreu uma inconsistência ao preparar esta visão financeira.',
    icon: AlertTriangle,
  },
  restricted: {
    title: 'Acesso financeiro restrito',
    description: 'Seu perfil precisa de uma autorização financeira explícita para visualizar esta área.',
    icon: LockKeyhole,
  },
};

export interface FinancialStatePanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  state: FinancialStateKind;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
}

export function FinancialStatePanel({
  state,
  title,
  description,
  action,
  icon,
  className,
  ...props
}: FinancialStatePanelProps) {
  const presentation = financialStatePresentation[state];
  const Icon = icon ?? presentation.icon;
  const role = state === 'error' ? 'alert' : 'status';

  return (
    <div
      className={cn('financial-state-panel', `financial-state-panel--${state}`, className)}
      data-financial-state={state}
      role={role}
      aria-live={state === 'loading' ? 'polite' : undefined}
      aria-busy={state === 'loading' ? true : undefined}
      {...props}
    >
      <span className="financial-state-panel__icon-shell" aria-hidden="true">
        <Icon
          className={cn(
            'financial-state-panel__icon',
            state === 'loading' && 'financial-state-panel__icon--loading',
          )}
        />
      </span>
      <div className="financial-state-panel__copy">
        <h2 className="financial-state-panel__title">{title ?? presentation.title}</h2>
        <p className="financial-state-panel__description">
          {description ?? presentation.description}
        </p>
      </div>
      {action && <div className="financial-state-panel__action">{action}</div>}
    </div>
  );
}

export interface FinancialDataProvenanceBadgeProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  label?: ReactNode;
  detail?: ReactNode;
}

export function FinancialDataProvenanceBadge({
  label = 'Base Orçamentária 2026',
  detail = 'Referência importada da planilha oficial, sem persistência no sistema.',
  className,
  ...props
}: FinancialDataProvenanceBadgeProps) {
  return (
    <div
      className={cn('financial-data-provenance', className)}
      role="note"
      {...props}
    >
      <Database className="financial-data-provenance__icon" aria-hidden="true" />
      <span className="financial-data-provenance__copy">
        <strong className="financial-data-provenance__label">{label}</strong>
        {detail && <span className="financial-data-provenance__detail">{detail}</span>}
      </span>
    </div>
  );
}

export function FinancialDataProvenance(props: FinancialDataProvenanceBadgeProps) {
  return <FinancialDataProvenanceBadge {...props} />;
}

export interface FinancialRestrictedBadgeProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  label?: ReactNode;
}

export function FinancialRestrictedBadge({
  label = 'Acesso financeiro restrito',
  className,
  ...props
}: FinancialRestrictedBadgeProps) {
  return (
    <span className={cn('financial-restricted-badge', className)} {...props}>
      <ShieldCheck className="financial-restricted-badge__icon" aria-hidden="true" />
      <span className="financial-restricted-badge__label">{label}</span>
    </span>
  );
}
