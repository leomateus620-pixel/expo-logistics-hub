import {
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { cn } from '@/lib/utils';
import type {
  BudgetAttentionStatus,
  CommissionBudget,
  ExpenseCategory,
  FinancialExpense,
  FinancialScenario,
  FundingType,
  RevenueCategory,
} from '@/features/financial-management/types';
import {
  selectExpenseDisplayAmount,
  type ExpenseGroupSummary,
  type ExpenseLedgerMode,
} from '@/features/financial-management/selectors/financialSelectors';
import { FinancialStatePanel } from './FinancialPrimitives';
import '@/styles/financial-expense-intelligence.css';

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
  maximumFractionDigits: 1,
});

const percentageFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const countFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
});

const chartColors = {
  projected: 'var(--financial-chart-projected, oklch(var(--chart-1)))',
  consolidated: 'var(--financial-chart-consolidated, oklch(var(--chart-3)))',
  receivable: 'var(--financial-chart-receivable, oklch(var(--chart-4)))',
  neutral: 'var(--financial-chart-neutral, oklch(var(--muted-foreground) / 0.38))',
  attention: 'var(--financial-chart-attention, oklch(var(--brand-orange-500)))',
  danger: 'var(--financial-chart-danger, oklch(var(--destructive)))',
  gold: 'var(--financial-chart-gold, oklch(var(--gold)))',
  blue: 'var(--financial-chart-blue, oklch(var(--chart-5)))',
  indigo: 'var(--financial-chart-indigo, oklch(var(--chart-6)))',
} as const;

const compositionPalette = [
  chartColors.projected,
  chartColors.consolidated,
  chartColors.receivable,
  chartColors.blue,
  chartColors.gold,
  chartColors.indigo,
  chartColors.attention,
] as const;

const expenseCategoryColors: Record<ExpenseCategory, string> = {
  'Pessoal e Equipes': 'var(--financial-expense-personnel, oklch(0.48 0.14 286))',
  'Infraestrutura e Obras': 'var(--financial-expense-infrastructure, oklch(0.34 0.12 258))',
  'Serviços Operacionais': 'var(--financial-expense-services, oklch(0.55 0.16 250))',
  'Marketing e Comunicação': 'var(--financial-expense-marketing, oklch(0.67 0.18 49))',
  'Eventos e Produção': 'var(--financial-expense-events, oklch(0.74 0.16 83))',
  'Alimentação e Hospitalidade': 'var(--financial-expense-hospitality, oklch(0.57 0.13 316))',
  'Logística e Transporte': 'var(--financial-expense-logistics, oklch(0.58 0.12 196))',
  Segurança: 'var(--financial-expense-security, oklch(0.46 0.09 238))',
  'Taxas, Seguros e Licenças': 'var(--financial-expense-fees, oklch(0.68 0.15 66))',
  'Equipamentos e Materiais': 'var(--financial-expense-equipment, oklch(0.61 0.13 224))',
  Investimentos: 'var(--financial-expense-investments, oklch(0.56 0.12 158))',
  Reservas: 'var(--financial-expense-reserves, oklch(0.5 0.14 303))',
  'Obrigações de Edições Anteriores': 'var(--financial-expense-obligations, oklch(0.52 0.09 55))',
  'Não classificado': 'var(--financial-expense-unclassified, oklch(0.58 0.03 258))',
};

const expenseCategoryTextColors: Partial<Record<ExpenseCategory, string>> = {
  'Eventos e Produção': 'oklch(var(--brand-navy-900))',
  'Taxas, Seguros e Licenças': 'oklch(var(--brand-navy-900))',
};

const revenueCategoryColors = {
  Patrocínios: 'var(--financial-category-sponsorship, oklch(0.42 0.18 268))',
  'Lei Rouanet': 'var(--financial-category-rouanet, oklch(0.78 0.16 88))',
  'Comercialização de pavilhões': 'var(--financial-category-commercialization, oklch(0.62 0.14 170))',
  Exporural: 'var(--financial-category-exporural, oklch(0.58 0.16 250))',
  'Área externa': 'var(--financial-category-external-area, oklch(0.78 0.17 78))',
  Gastronomia: 'var(--financial-category-gastronomy, oklch(0.56 0.12 292))',
  'Bilheteria e estacionamento': 'var(--financial-category-ticketing, oklch(0.67 0.19 45))',
  'Rádio e mídia': 'var(--financial-category-media, oklch(0.59 0.14 225))',
  Eventos: 'var(--financial-category-events, oklch(0.63 0.15 145))',
  'Outras receitas': 'var(--financial-category-other, oklch(0.58 0.03 258))',
} satisfies Record<RevenueCategory, string>;

function resolveRevenueCategoryColor(id: string | undefined, label: string) {
  const category = (id ?? label) as RevenueCategory;
  return revenueCategoryColors[category] ?? chartColors.indigo;
}

const budgetStatusColors: Record<BudgetAttentionStatus, string> = {
  normal: chartColors.consolidated,
  attention: chartColors.gold,
  'near-limit': chartColors.attention,
  'over-budget': chartColors.danger,
  'no-budget-cap': chartColors.neutral,
};

const budgetStatusLabels: Record<BudgetAttentionStatus, string> = {
  normal: 'Dentro do esperado',
  attention: 'Atenção',
  'near-limit': 'Próximo do teto',
  'over-budget': 'Acima do teto',
  'no-budget-cap': 'Sem teto definido',
};

function formatFullCurrency(value: number) {
  return fullCurrencyFormatter.format(value);
}

function formatCompactCurrency(value: number | string) {
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) ? compactCurrencyFormatter.format(numericValue) : '—';
}

function abbreviateAxisLabel(value: string, maximumLength = 20) {
  return value.length > maximumLength ? `${value.slice(0, maximumLength - 1).trimEnd()}…` : value;
}

function formatPercentage(value: number | string) {
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) ? `${percentageFormatter.format(numericValue)}%` : '—';
}

function formatCount(value: number | string) {
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) ? countFormatter.format(numericValue) : '—';
}

export type FinancialDistributionValueKind = 'currency' | 'count';

function formatDistributionValue(value: number, valueKind: FinancialDistributionValueKind) {
  return valueKind === 'currency' ? formatFullCurrency(value) : formatCount(value);
}

function formatCompactDistributionValue(value: number, valueKind: FinancialDistributionValueKind) {
  return valueKind === 'currency' ? formatCompactCurrency(value) : formatCount(value);
}

function resolveExpenseCategoryChartColor(category: ExpenseCategory) {
  return expenseCategoryColors[category];
}

function isExpenseCategory(value: string): value is ExpenseCategory {
  return Object.prototype.hasOwnProperty.call(expenseCategoryColors, value);
}

function roundChartCurrency(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = (event: MediaQueryListEvent | MediaQueryList) => {
      setPrefersReducedMotion(event.matches);
    };

    updatePreference(mediaQuery);
    mediaQuery.addEventListener?.('change', updatePreference);

    return () => mediaQuery.removeEventListener?.('change', updatePreference);
  }, []);

  return prefersReducedMotion;
}

/**
 * Drives the finance-specific chart reveal in JavaScript so the data transition remains
 * intentional even when a legacy, global reduced-motion stylesheet disables CSS motion.
 */
function useProgressiveChartMotion(duration: number, dependencyKey: string, enabled = true) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setProgress(1);
      return undefined;
    }

    if (typeof window === 'undefined') {
      setProgress(1);
      return undefined;
    }

    let frameId: number | undefined;
    let timeoutId: number | undefined;
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const getNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    const scheduleFrame = (callback: FrameRequestCallback) => {
      if (typeof window.requestAnimationFrame === 'function') {
        frameId = window.requestAnimationFrame(callback);
        return;
      }

      timeoutId = window.setTimeout(() => callback(getNow()), 16);
    };

    const animate = (timestamp: number) => {
      const elapsed = Math.max(0, timestamp - startedAt);
      const linearProgress = Math.min(1, elapsed / duration);
      const easedProgress = 1 - ((1 - linearProgress) ** 3);

      setProgress(easedProgress);

      if (linearProgress < 1) scheduleFrame(animate);
    };

    setProgress(0);
    scheduleFrame(animate);

    return () => {
      if (frameId !== undefined) window.cancelAnimationFrame?.(frameId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [dependencyKey, duration, enabled]);

  return progress;
}

interface FinancialDetailTooltipRow {
  label: string;
  value: string;
  color?: string;
}

interface FinancialDetailTooltipProps {
  id: string;
  title: string;
  rows: ReadonlyArray<FinancialDetailTooltipRow>;
}

function FinancialDetailTooltip({ id, title, rows }: FinancialDetailTooltipProps) {
  return (
    <div id={id} role="tooltip" className="financial-chart-detail-tooltip">
      <p className="financial-chart-detail-tooltip__label">{title}</p>
      <dl className="financial-chart-detail-tooltip__values">
        {rows.map((row) => (
          <div className="financial-chart-detail-tooltip__value" key={row.label}>
            <dt>
              {row.color && (
                <span
                  className="financial-chart-detail-tooltip__indicator"
                  style={{ backgroundColor: row.color }}
                  aria-hidden="true"
                />
              )}
              {row.label}
            </dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

type FinancialChartTooltipProps = TooltipProps<number, string> & {
  valueLabels?: Readonly<Record<string, string>>;
};

function FinancialChartTooltip({
  active,
  payload,
  label,
  valueLabels,
}: FinancialChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="financial-chart-tooltip">
      {label !== undefined && label !== null && (
        <p className="financial-chart-tooltip__label">{String(label)}</p>
      )}
      <dl className="financial-chart-tooltip__values">
        {payload.map((entry, index) => {
          if (entry.value === undefined || entry.value === null) return null;

          const dataKey = String(entry.dataKey ?? entry.name ?? index);
          const displayName = valueLabels?.[dataKey] ?? String(entry.name ?? dataKey);
          const numericValue = Number(entry.value);

          return (
            <div className="financial-chart-tooltip__value" key={`${dataKey}-${index}`}>
              <dt>
                <span
                  className="financial-chart-tooltip__indicator"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden="true"
                />
                {displayName}
              </dt>
              <dd>{Number.isFinite(numericValue) ? formatFullCurrency(numericValue) : '—'}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

type CommissionChartTooltipProps = TooltipProps<number, string> & {
  data: ReadonlyArray<CommissionBudgetChartDatum>;
};

function CommissionChartTooltip({
  active,
  payload,
  label,
  data,
}: CommissionChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const commission = data.find((item) => item.commission === String(label));

  return (
    <div className="financial-chart-tooltip">
      <p className="financial-chart-tooltip__label">{String(label ?? '')}</p>
      <dl className="financial-chart-tooltip__values">
        {payload.map((entry, index) => {
          if (entry.value === undefined || entry.value === null) return null;
          const dataKey = String(entry.dataKey ?? entry.name ?? index);
          const displayName = dataKey === 'budgetCap' ? 'Teto' : 'Orçado';
          const numericValue = Number(entry.value);

          return (
            <div className="financial-chart-tooltip__value" key={`${dataKey}-${index}`}>
              <dt>
                <span
                  className="financial-chart-tooltip__indicator"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden="true"
                />
                {displayName}
              </dt>
              <dd>{Number.isFinite(numericValue) ? formatFullCurrency(numericValue) : '—'}</dd>
            </div>
          );
        })}
        {commission && (
          <div className="financial-chart-tooltip__value">
            <dt>Utilização</dt>
            <dd>{formatPercentage(commission.utilizationPercentage)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

interface FinancialChartFrameProps {
  title: string;
  summary: string;
  className?: string;
  height: number;
  mobileHeight: number;
  chart: ReactNode;
  accessibleTable: ReactNode;
  interactiveCanvas?: boolean;
}

function FinancialChartFrame({
  title,
  summary,
  className,
  height,
  mobileHeight,
  chart,
  accessibleTable,
  interactiveCanvas = false,
}: FinancialChartFrameProps) {
  const generatedId = useId().replace(/:/g, '');
  const titleId = `${generatedId}-title`;
  const summaryId = `${generatedId}-summary`;

  return (
    <figure
      className={cn('financial-chart', className)}
      aria-labelledby={titleId}
      aria-describedby={summaryId}
    >
      <figcaption id={titleId} className="sr-only">
        {title}
      </figcaption>
      <p id={summaryId} className="sr-only">
        {summary}
      </p>
      <div
        className="financial-chart__canvas"
        style={{ height: `clamp(${mobileHeight}px, 36vw, ${height}px)` }}
        aria-hidden={interactiveCanvas ? undefined : true}
        data-interactive={interactiveCanvas ? 'true' : undefined}
      >
        {chart}
      </div>
      <div className="sr-only">{accessibleTable}</div>
    </figure>
  );
}

interface BaseFinancialChartProps {
  title?: string;
  summary?: string;
  className?: string;
  height?: number;
  mobileHeight?: number;
}

export interface RevenueComparisonDatum {
  id?: string;
  label: string;
  projectedAmount: number;
  consolidatedAmount: number;
}

export interface RevenueComparisonChartProps extends BaseFinancialChartProps {
  data: ReadonlyArray<RevenueComparisonDatum>;
}

export function RevenueComparisonChart({
  data,
  title = 'Receita projetada e consolidada',
  summary = 'Comparação, em reais, entre a receita projetada e a receita consolidada.',
  className,
  height = 320,
  mobileHeight = 260,
}: RevenueComparisonChartProps) {
  const tooltipBaseId = useId().replace(/:/g, '');
  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);
  const chartData = data.map((item, index) => {
    const projectedAmount = Number.isFinite(item.projectedAmount) ? item.projectedAmount : 0;
    const consolidatedAmount = Number.isFinite(item.consolidatedAmount)
      ? item.consolidatedAmount
      : 0;
    const projectedGeometry = Math.max(0, projectedAmount);
    const consolidatedGeometry = Math.max(0, consolidatedAmount);
    const gapAmount = Math.max(0, projectedAmount - consolidatedAmount);
    const overrunAmount = Math.max(0, consolidatedAmount - projectedAmount);
    const consolidationRate = projectedAmount > 0
      ? (consolidatedAmount / projectedAmount) * 100
      : null;

    return {
      ...item,
      chartKey: item.id ?? `${item.label}-${index}`,
      projectedAmount,
      consolidatedAmount,
      projectedGeometry,
      consolidatedGeometry,
      gapAmount,
      overrunAmount,
      consolidationRate,
    };
  });
  const motionKey = chartData
    .map((item) => `${item.chartKey}:${item.projectedAmount}:${item.consolidatedAmount}`)
    .join('|');
  const motionProgress = useProgressiveChartMotion(760, motionKey);

  if (chartData.length === 0) {
    return <FinancialStatePanel state="empty" title={`Sem dados para ${title}`} />;
  }

  const scaleMaximum = Math.max(
    1,
    ...chartData.flatMap((item) => [item.projectedGeometry, item.consolidatedGeometry]),
  );

  return (
    <FinancialChartFrame
      title={title}
      summary={summary}
      className={cn('financial-chart--revenue-comparison', className)}
      height={height}
      mobileHeight={mobileHeight}
      interactiveCanvas
      chart={(
        <div
          className="financial-comparison"
          data-force-motion="true"
          style={{ '--financial-chart-motion-duration': '760ms' } as CSSProperties}
        >
          <div className="financial-comparison__legend" aria-hidden="true">
            <span className="financial-comparison__legend-item financial-comparison__legend-item--consolidated">
              <span />
              Consolidado
            </span>
            <span className="financial-comparison__legend-item financial-comparison__legend-item--gap">
              <span />
              Lacuna positiva
            </span>
            <span className="financial-comparison__legend-item financial-comparison__legend-item--projected">
              <span />
              Referência projetada
            </span>
          </div>

          <div className="financial-comparison__rows">
            {chartData.map((item, index) => {
              const projectedPercentage = (item.projectedGeometry / scaleMaximum) * 100;
              const consolidatedPercentage = (item.consolidatedGeometry / scaleMaximum) * 100;
              const gapPercentage = (item.gapAmount / scaleMaximum) * 100;
              const overrunPercentage = (item.overrunAmount / scaleMaximum) * 100;
              const rateLabel = item.consolidationRate === null
                ? 'Taxa não aplicável'
                : `${formatPercentage(item.consolidationRate)} consolidado`;
              const tooltipId = `${tooltipBaseId}-${index}-tooltip`;
              const isActive = activeRowKey === item.chartKey;

              return (
                <div
                  key={item.chartKey}
                  className={cn(
                    'financial-comparison__row',
                    item.gapAmount > 0 && 'financial-comparison__row--with-gap',
                    item.overrunAmount > 0 && 'financial-comparison__row--over-consolidated',
                    isActive && 'is-active',
                  )}
                  role="group"
                  tabIndex={0}
                  aria-label={`${item.label}. Projetado ${formatFullCurrency(item.projectedAmount)}. Consolidado ${formatFullCurrency(item.consolidatedAmount)}. Lacuna ${formatFullCurrency(item.gapAmount)}. ${rateLabel}.`}
                  aria-describedby={isActive ? tooltipId : undefined}
                  onPointerEnter={() => setActiveRowKey(item.chartKey)}
                  onPointerLeave={(event) => {
                    if (!event.currentTarget.matches(':focus')) setActiveRowKey(null);
                  }}
                  onFocus={() => setActiveRowKey(item.chartKey)}
                  onBlur={() => setActiveRowKey(null)}
                >
                  <div className="financial-comparison__row-heading" aria-hidden="true">
                    <span className="financial-comparison__label">{item.label}</span>
                    <span className="financial-comparison__headline-metrics">
                      <strong>{formatCompactCurrency(item.consolidatedAmount)}</strong>
                      <span className="financial-comparison__rate">{rateLabel}</span>
                    </span>
                  </div>

                  <div className="financial-comparison__track" aria-hidden="true">
                    <span
                      className="financial-comparison__projected-reference"
                      style={{
                        width: `${projectedPercentage}%`,
                        transform: `scaleX(${motionProgress})`,
                        transformOrigin: 'left center',
                      }}
                    />
                    <span
                      className="financial-comparison__consolidated-fill"
                      style={{
                        width: `${consolidatedPercentage}%`,
                        backgroundColor: chartColors.consolidated,
                        transform: `scaleX(${motionProgress})`,
                        transformOrigin: 'left center',
                      }}
                    />
                    {item.gapAmount > 0 && (
                      <span
                        className="financial-comparison__gap-fill"
                        style={{
                          left: `${consolidatedPercentage}%`,
                          width: `${gapPercentage}%`,
                          backgroundColor: chartColors.gold,
                          transform: `scaleX(${motionProgress})`,
                          transformOrigin: 'right center',
                        }}
                      />
                    )}
                    {item.overrunAmount > 0 && (
                      <span
                        className="financial-comparison__overrun-fill"
                        style={{
                          left: `${projectedPercentage}%`,
                          width: `${overrunPercentage}%`,
                          transform: `scaleX(${motionProgress})`,
                          transformOrigin: 'left center',
                        }}
                      />
                    )}
                    <span
                      className="financial-comparison__projected-marker"
                      style={{
                        left: `${projectedPercentage}%`,
                        opacity: motionProgress,
                      }}
                    />
                  </div>

                  <div className="financial-comparison__scale" aria-hidden="true">
                    <span>R$ 0</span>
                    <span>Projetado {formatCompactCurrency(item.projectedAmount)}</span>
                  </div>

                  {isActive && (
                    <FinancialDetailTooltip
                      id={tooltipId}
                      title={item.label}
                      rows={[
                        {
                          label: 'Projetado',
                          value: formatFullCurrency(item.projectedAmount),
                          color: chartColors.projected,
                        },
                        {
                          label: 'Consolidado',
                          value: formatFullCurrency(item.consolidatedAmount),
                          color: chartColors.consolidated,
                        },
                        {
                          label: 'Lacuna',
                          value: formatFullCurrency(item.gapAmount),
                          color: chartColors.gold,
                        },
                        {
                          label: 'Taxa de consolidação',
                          value: item.consolidationRate === null
                            ? 'Não aplicável'
                            : formatPercentage(item.consolidationRate),
                        },
                      ]}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      accessibleTable={(
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Fonte</th>
              <th scope="col">Projetado</th>
              <th scope="col">Consolidado</th>
              <th scope="col">Lacuna</th>
              <th scope="col">Taxa de consolidação</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((item) => (
              <tr key={item.id ?? item.label}>
                <th scope="row">{item.label}</th>
                <td>{formatFullCurrency(item.projectedAmount)}</td>
                <td>{formatFullCurrency(item.consolidatedAmount)}</td>
                <td>{formatFullCurrency(item.gapAmount)}</td>
                <td>
                  {item.consolidationRate === null
                    ? 'Não aplicável'
                    : formatPercentage(item.consolidationRate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}

export interface RevenueCompositionDatum {
  id?: string;
  label: string;
  amount: number;
}

export interface RevenueCompositionChartProps extends BaseFinancialChartProps {
  data: ReadonlyArray<RevenueCompositionDatum>;
}

export function RevenueCompositionChart({
  data,
  title = 'Composição da receita',
  summary = 'Distribuição do valor projetado entre as fontes de receita da Fenasoja.',
  className,
  height = 360,
  mobileHeight = 300,
}: RevenueCompositionChartProps) {
  const tooltipBaseId = useId().replace(/:/g, '');
  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);
  const chartData = data
    .map((item, originalIndex) => ({
      ...item,
      chartKey: item.id ?? `${item.label}-${originalIndex}`,
      originalIndex,
      amount: Number.isFinite(item.amount) ? item.amount : 0,
    }))
    .sort((first, second) => second.amount - first.amount || first.originalIndex - second.originalIndex);
  const motionKey = chartData
    .map((item) => `${item.chartKey}:${item.amount}`)
    .join('|');
  const motionProgress = useProgressiveChartMotion(720, motionKey);

  if (chartData.length === 0) {
    return <FinancialStatePanel state="empty" title={`Sem dados para ${title}`} />;
  }

  const maximumAmount = Math.max(1, ...chartData.map((item) => Math.max(0, item.amount)));
  const totalAmount = chartData.reduce((total, item) => total + item.amount, 0);
  const resolvedHeight = Math.max(height, 70 + (chartData.length * 38));
  const resolvedMobileHeight = Math.max(mobileHeight, 64 + (chartData.length * 42));

  return (
    <FinancialChartFrame
      title={title}
      summary={summary}
      className={cn('financial-chart--revenue-composition', className)}
      height={resolvedHeight}
      mobileHeight={resolvedMobileHeight}
      interactiveCanvas
      chart={(
        <div
          className="financial-composition"
          role="list"
          data-force-motion="true"
          style={{ '--financial-chart-motion-duration': '720ms' } as CSSProperties}
        >
          {chartData.map((item, index) => {
            const share = totalAmount !== 0 ? (item.amount / totalAmount) * 100 : null;
            const barPercentage = (Math.max(0, item.amount) / maximumAmount) * 100;
            const color = resolveRevenueCategoryColor(item.id, item.label);
            const tooltipId = `${tooltipBaseId}-${index}-tooltip`;
            const isActive = activeRowKey === item.chartKey;
            const shareLabel = share === null ? 'Participação não aplicável' : `${formatPercentage(share)} do total`;

            return (
              <div
                key={item.chartKey}
                className={cn('financial-composition__row', isActive && 'is-active')}
                role="listitem"
                tabIndex={0}
                aria-label={`${index + 1}ª posição, ${item.label}. ${formatFullCurrency(item.amount)}. ${shareLabel}.`}
                aria-describedby={isActive ? tooltipId : undefined}
                onPointerEnter={() => setActiveRowKey(item.chartKey)}
                onPointerLeave={(event) => {
                  if (!event.currentTarget.matches(':focus')) setActiveRowKey(null);
                }}
                onFocus={() => setActiveRowKey(item.chartKey)}
                onBlur={() => setActiveRowKey(null)}
              >
                <div className="financial-composition__row-heading" aria-hidden="true">
                  <span className="financial-composition__rank">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="financial-composition__label">{item.label}</span>
                  <span className="financial-composition__metrics">
                    <strong>{formatCompactCurrency(item.amount)}</strong>
                    <span>{share === null ? '—' : formatPercentage(share)}</span>
                  </span>
                </div>
                <div className="financial-composition__track" aria-hidden="true">
                  <span
                    className="financial-composition__fill"
                    style={{
                      width: `${barPercentage}%`,
                      backgroundColor: color,
                      transform: `scaleX(${motionProgress})`,
                      transformOrigin: 'left center',
                    }}
                  />
                </div>

                {isActive && (
                  <FinancialDetailTooltip
                    id={tooltipId}
                    title={item.label}
                    rows={[
                      {
                        label: 'Valor',
                        value: formatFullCurrency(item.amount),
                        color,
                      },
                      {
                        label: 'Participação',
                        value: share === null ? 'Não aplicável' : formatPercentage(share),
                      },
                    ]}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      accessibleTable={(
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Fonte</th>
              <th scope="col">Valor</th>
              <th scope="col">Participação</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((item) => (
              <tr key={item.id ?? item.label}>
                <th scope="row">{item.label}</th>
                <td>{formatFullCurrency(item.amount)}</td>
                <td>
                  {totalAmount === 0
                    ? 'Não aplicável'
                    : formatPercentage((item.amount / totalAmount) * 100)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}

export interface CommissionBudgetChartDatum {
  id: string;
  commission: string;
  budgetCap: number;
  budgetedAmount: number;
  utilizationPercentage: number;
  status: BudgetAttentionStatus;
}

export interface CommissionBudgetUtilizationChartProps extends BaseFinancialChartProps {
  data: ReadonlyArray<CommissionBudgetChartDatum>;
  forceMotion?: boolean;
  variant?: 'standard' | 'executive';
  scaleMode?: 'portfolio' | 'relative';
}

export function CommissionBudgetUtilizationChart({
  data,
  title = 'Utilização do orçamento por comissão',
  summary = 'Comparação entre o teto e o valor orçado de cada comissão, com o percentual de utilização.',
  className,
  height = 440,
  mobileHeight = 340,
  forceMotion = false,
  variant = 'standard',
  scaleMode = 'portfolio',
}: CommissionBudgetUtilizationChartProps) {
  const reducedMotion = usePrefersReducedMotion();
  const motionEnabled = forceMotion || !reducedMotion;
  const tooltipBaseId = useId().replace(/:/g, '');
  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);
  const chartData = data.map((item) => {
    const budgetCapGeometry = Math.max(0, Number.isFinite(item.budgetCap) ? item.budgetCap : 0);
    const budgetedGeometry = Math.max(
      0,
      Number.isFinite(item.budgetedAmount) ? item.budgetedAmount : 0,
    );

    return {
      ...item,
      budgetCapGeometry,
      budgetedGeometry,
      overrunAmount: Math.max(0, item.budgetedAmount - item.budgetCap),
    };
  });
  const executiveMotionKey = chartData
    .map((item) => `${item.id}:${item.budgetCap}:${item.budgetedAmount}:${item.status}`)
    .join('|');
  const executiveMotionProgress = useProgressiveChartMotion(
    760,
    executiveMotionKey,
    variant === 'executive' && motionEnabled,
  );

  if (chartData.length === 0) {
    return <FinancialStatePanel state="empty" title={`Sem dados para ${title}`} />;
  }

  if (variant === 'executive') {
    const portfolioScaleMaximum = Math.max(
      1,
      ...chartData.flatMap((item) => [item.budgetCapGeometry, item.budgetedGeometry]),
    );
    const executiveHeight = Math.max(height, mobileHeight, 72 + (chartData.length * 38));

    return (
      <FinancialChartFrame
        title={title}
        summary={summary}
        className={cn(
          'financial-chart--commission-budget',
          'financial-chart--commission-budget-executive',
          className,
        )}
        height={executiveHeight}
        mobileHeight={executiveHeight}
        interactiveCanvas
        chart={(
          <div
            className="financial-budget-bullets"
            data-force-motion={forceMotion ? 'true' : undefined}
            data-scale-mode={scaleMode}
            style={{ '--financial-chart-motion-duration': '760ms' } as CSSProperties}
          >
            <div className="financial-budget-bullets__legend" aria-hidden="true">
              <span className="financial-budget-bullets__legend-item financial-budget-bullets__legend-item--ceiling">
                <span />
                Teto
              </span>
              <span className="financial-budget-bullets__legend-item financial-budget-bullets__legend-item--planned">
                <span />
                Orçado
              </span>
              <span className="financial-budget-bullets__legend-item financial-budget-bullets__legend-item--overrun">
                <span />
                Excesso
              </span>
            </div>

            <div className="financial-budget-bullets__rows">
              {chartData.map((item, index) => {
                const scaleMaximum = scaleMode === 'relative'
                  ? Math.max(1, item.budgetCapGeometry, item.budgetedGeometry)
                  : portfolioScaleMaximum;
                const ceilingPercentage = (item.budgetCapGeometry / scaleMaximum) * 100;
                const plannedPercentage = (item.budgetedGeometry / scaleMaximum) * 100;
                const overrunPercentage = (item.overrunAmount / scaleMaximum) * 100;
                const isActive = activeRowKey === item.id;
                const tooltipId = `${tooltipBaseId}-${index}-tooltip`;
                const utilizationLabel = item.status === 'no-budget-cap'
                  ? 'Sem teto'
                  : formatPercentage(item.utilizationPercentage);
                const plannedColor = item.status === 'over-budget'
                  ? chartColors.attention
                  : budgetStatusColors[item.status];

                return (
                  <div
                    key={item.id}
                    className={cn(
                      'financial-budget-bullets__row',
                      item.overrunAmount > 0 && 'financial-budget-bullets__row--overrun',
                      isActive && 'is-active',
                    )}
                    data-status={item.status}
                    role="group"
                    tabIndex={0}
                    aria-label={`${item.commission}. Teto ${formatFullCurrency(item.budgetCap)}. Orçado ${formatFullCurrency(item.budgetedAmount)}. Utilização ${utilizationLabel}. Excesso ${formatFullCurrency(item.overrunAmount)}. Status ${budgetStatusLabels[item.status]}.`}
                    aria-describedby={isActive ? tooltipId : undefined}
                    onPointerEnter={() => setActiveRowKey(item.id)}
                    onPointerLeave={(event) => {
                      if (!event.currentTarget.matches(':focus')) setActiveRowKey(null);
                    }}
                    onFocus={() => setActiveRowKey(item.id)}
                    onBlur={() => setActiveRowKey(null)}
                  >
                    <div className="financial-budget-bullets__row-heading" aria-hidden="true">
                      <span className="financial-budget-bullets__identity">
                        <strong>{item.commission}</strong>
                        <span>Teto {formatCompactCurrency(item.budgetCap)}</span>
                      </span>
                      <span className="financial-budget-bullets__metrics">
                        <strong>{formatCompactCurrency(item.budgetedAmount)}</strong>
                        <span className="financial-budget-bullets__rate">{utilizationLabel}</span>
                        <span className="financial-budget-bullets__status">
                          {item.overrunAmount > 0
                            ? `+ ${formatCompactCurrency(item.overrunAmount)}`
                            : budgetStatusLabels[item.status]}
                        </span>
                      </span>
                    </div>

                    <div className="financial-budget-bullets__track" aria-hidden="true">
                      <span
                        className="financial-budget-bullets__ceiling-reference"
                        style={{
                          width: `${ceilingPercentage}%`,
                          transform: `scaleX(${executiveMotionProgress})`,
                          transformOrigin: 'left center',
                        }}
                      />
                      <span
                        className="financial-budget-bullets__planned-fill"
                        style={{
                          width: `${plannedPercentage}%`,
                          backgroundColor: plannedColor,
                          transform: `scaleX(${executiveMotionProgress})`,
                          transformOrigin: 'left center',
                        }}
                      />
                      {item.overrunAmount > 0 && (
                        <span
                          className="financial-budget-bullets__overrun-fill"
                          style={{
                            left: `${ceilingPercentage}%`,
                            width: `${overrunPercentage}%`,
                            transform: `scaleX(${executiveMotionProgress})`,
                            transformOrigin: 'left center',
                          }}
                        />
                      )}
                      <span
                        className="financial-budget-bullets__ceiling-marker"
                        style={{
                          left: `${ceilingPercentage}%`,
                          opacity: executiveMotionProgress,
                        }}
                      />
                    </div>

                    {isActive && (
                      <FinancialDetailTooltip
                        id={tooltipId}
                        title={item.commission}
                        rows={[
                          {
                            label: 'Teto',
                            value: formatFullCurrency(item.budgetCap),
                            color: chartColors.neutral,
                          },
                          {
                            label: 'Orçado',
                            value: formatFullCurrency(item.budgetedAmount),
                            color: plannedColor,
                          },
                          {
                            label: 'Utilização',
                            value: utilizationLabel,
                          },
                          {
                            label: 'Excesso',
                            value: formatFullCurrency(item.overrunAmount),
                            color: item.overrunAmount > 0 ? chartColors.danger : undefined,
                          },
                          {
                            label: 'Status',
                            value: budgetStatusLabels[item.status],
                          },
                        ]}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        accessibleTable={(
          <table>
            <caption>{title}</caption>
            <thead>
              <tr>
                <th scope="col">Comissão</th>
                <th scope="col">Teto</th>
                <th scope="col">Orçado</th>
                <th scope="col">Utilização</th>
                <th scope="col">Excesso</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((item) => (
                <tr key={item.id}>
                  <th scope="row">{item.commission}</th>
                  <td>{formatFullCurrency(item.budgetCap)}</td>
                  <td>{formatFullCurrency(item.budgetedAmount)}</td>
                  <td>
                    {item.status === 'no-budget-cap'
                      ? 'Sem teto'
                      : formatPercentage(item.utilizationPercentage)}
                  </td>
                  <td>{formatFullCurrency(item.overrunAmount)}</td>
                  <td>{budgetStatusLabels[item.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      />
    );
  }

  return (
    <FinancialChartFrame
      title={title}
      summary={summary}
      className={cn('financial-chart--commission-budget', className)}
      height={height}
      mobileHeight={mobileHeight}
      chart={(
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 8, right: 22, bottom: 8, left: 12 }}
          >
            <CartesianGrid horizontal={false} stroke="var(--financial-chart-grid, oklch(var(--border)))" />
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tickFormatter={formatCompactCurrency}
            />
            <YAxis
              type="category"
              dataKey="commission"
              axisLine={false}
              tickLine={false}
              width={132}
              tickMargin={8}
              tickFormatter={(value: string) => abbreviateAxisLabel(value, 20)}
            />
            <Tooltip
              cursor={{ fill: 'var(--financial-chart-hover, oklch(var(--muted) / 0.45))' }}
              content={<CommissionChartTooltip data={chartData} />}
            />
            <Legend
              formatter={(value) => (value === 'budgetCap' ? 'Teto' : 'Orçado')}
            />
            <Bar
              dataKey="budgetCap"
              name="budgetCap"
              fill={chartColors.neutral}
              radius={[0, 5, 5, 0]}
              isAnimationActive={motionEnabled}
              animationDuration={360}
              animationEasing="ease-out"
            />
            <Bar
              dataKey="budgetedAmount"
              name="budgetedAmount"
              fill={chartColors.consolidated}
              radius={[0, 5, 5, 0]}
              isAnimationActive={motionEnabled}
              animationDuration={360}
              animationEasing="ease-out"
            >
              {chartData.map((item) => (
                <Cell key={item.id} fill={budgetStatusColors[item.status]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      accessibleTable={(
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Comissão</th>
              <th scope="col">Teto</th>
              <th scope="col">Orçado</th>
              <th scope="col">Utilização</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((item) => (
              <tr key={item.id}>
                <th scope="row">{item.commission}</th>
                <td>{formatFullCurrency(item.budgetCap)}</td>
                <td>{formatFullCurrency(item.budgetedAmount)}</td>
                <td>{formatPercentage(item.utilizationPercentage)}</td>
                <td>{budgetStatusLabels[item.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}

export interface FundingSourceDatum {
  id?: string;
  fundingType: FundingType | string;
  amount: number;
}

export interface FundingSourceChartProps extends BaseFinancialChartProps {
  data: ReadonlyArray<FundingSourceDatum>;
  forceMotion?: boolean;
  variant?: 'standard' | 'executive';
}

export function FundingSourceChart({
  data,
  title = 'Valores registrados por origem',
  summary = 'Comparação dos valores registrados em cada coluna de origem; as colunas não formam uma partição exaustiva do total.',
  className,
  height = 340,
  mobileHeight = 300,
  forceMotion = false,
  variant = 'standard',
}: FundingSourceChartProps) {
  const reducedMotion = usePrefersReducedMotion();
  const motionEnabled = forceMotion || !reducedMotion;
  const tooltipBaseId = useId().replace(/:/g, '');
  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);
  const chartData = data.map((item, originalIndex) => ({
    ...item,
    chartKey: item.id ?? `${item.fundingType}-${originalIndex}`,
    originalIndex,
    amountGeometry: Math.max(0, Number.isFinite(item.amount) ? item.amount : 0),
  }));
  const rankedChartData = [...chartData]
    .sort((first, second) => second.amount - first.amount || first.originalIndex - second.originalIndex);
  const executiveMotionKey = rankedChartData
    .map((item) => `${item.chartKey}:${item.amount}`)
    .join('|');
  const executiveMotionProgress = useProgressiveChartMotion(
    720,
    executiveMotionKey,
    variant === 'executive' && motionEnabled,
  );

  if (chartData.length === 0) {
    return <FinancialStatePanel state="empty" title={`Sem dados para ${title}`} />;
  }

  if (variant === 'executive') {
    const maximumAmount = Math.max(1, ...rankedChartData.map((item) => item.amountGeometry));
    const totalAmount = rankedChartData.reduce((total, item) => total + item.amount, 0);
    const executiveHeight = Math.max(height, mobileHeight, 452);

    return (
      <FinancialChartFrame
        title={title}
        summary={summary}
        className={cn(
          'financial-chart--funding-source',
          'financial-chart--funding-source-executive',
          className,
        )}
        height={executiveHeight}
        mobileHeight={executiveHeight}
        interactiveCanvas
        chart={(
          <div
            className="financial-composition financial-composition--funding"
            role="list"
            data-force-motion={forceMotion ? 'true' : undefined}
            style={{ '--financial-chart-motion-duration': '720ms' } as CSSProperties}
          >
            {rankedChartData.map((item, index) => {
              const share = totalAmount !== 0 ? (item.amount / totalAmount) * 100 : null;
              const barPercentage = (item.amountGeometry / maximumAmount) * 100;
              const color = compositionPalette[index % compositionPalette.length];
              const tooltipId = `${tooltipBaseId}-${index}-tooltip`;
              const isActive = activeRowKey === item.chartKey;
              const shareLabel = share === null
                ? 'Participação não aplicável'
                : `${formatPercentage(share)} do valor exibido`;

              return (
                <div
                  key={item.chartKey}
                  className={cn(
                    'financial-composition__row',
                    'financial-composition__row--funding',
                    isActive && 'is-active',
                  )}
                  role="listitem"
                  tabIndex={0}
                  aria-label={`${index + 1}ª posição, ${item.fundingType}. ${formatFullCurrency(item.amount)}. ${shareLabel}.`}
                  aria-describedby={isActive ? tooltipId : undefined}
                  onPointerEnter={() => setActiveRowKey(item.chartKey)}
                  onPointerLeave={(event) => {
                    if (!event.currentTarget.matches(':focus')) setActiveRowKey(null);
                  }}
                  onFocus={() => setActiveRowKey(item.chartKey)}
                  onBlur={() => setActiveRowKey(null)}
                >
                  <div className="financial-composition__row-heading" aria-hidden="true">
                    <span className="financial-composition__rank">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="financial-composition__label">{item.fundingType}</span>
                    <span className="financial-composition__metrics">
                      <strong>{formatCompactCurrency(item.amount)}</strong>
                      <span>{share === null ? '—' : formatPercentage(share)}</span>
                    </span>
                  </div>
                  <div className="financial-composition__track" aria-hidden="true">
                    <span
                      className="financial-composition__fill"
                      style={{
                        width: `${barPercentage}%`,
                        backgroundColor: color,
                        transform: `scaleX(${executiveMotionProgress})`,
                        transformOrigin: 'left center',
                      }}
                    />
                  </div>

                  {isActive && (
                    <FinancialDetailTooltip
                      id={tooltipId}
                      title={String(item.fundingType)}
                      rows={[
                        {
                          label: 'Valor registrado',
                          value: formatFullCurrency(item.amount),
                          color,
                        },
                        {
                          label: 'Participação na visão',
                          value: share === null ? 'Não aplicável' : formatPercentage(share),
                        },
                      ]}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        accessibleTable={(
          <table>
            <caption>{title}</caption>
            <thead>
              <tr>
                <th scope="col">Origem</th>
                <th scope="col">Valor</th>
                <th scope="col">Participação na visão</th>
              </tr>
            </thead>
            <tbody>
              {rankedChartData.map((item) => (
                <tr key={item.chartKey}>
                  <th scope="row">{item.fundingType}</th>
                  <td>{formatFullCurrency(item.amount)}</td>
                  <td>
                    {totalAmount === 0
                      ? 'Não aplicável'
                      : formatPercentage((item.amount / totalAmount) * 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      />
    );
  }

  return (
    <FinancialChartFrame
      title={title}
      summary={summary}
      className={cn('financial-chart--funding-source', className)}
      height={height}
      mobileHeight={mobileHeight}
      chart={(
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 8, right: 24, bottom: 8, left: 12 }}
          >
            <CartesianGrid horizontal={false} stroke="var(--financial-chart-grid, oklch(var(--border)))" />
            <XAxis
              type="number"
              axisLine={false}
              tickLine={false}
              tickFormatter={formatCompactCurrency}
            />
            <YAxis
              type="category"
              dataKey="fundingType"
              axisLine={false}
              tickLine={false}
              width={150}
              tickMargin={8}
              tickFormatter={(value: string) => abbreviateAxisLabel(value, 24)}
            />
            <Tooltip
              cursor={{ fill: 'var(--financial-chart-hover, oklch(var(--muted) / 0.45))' }}
              content={<FinancialChartTooltip valueLabels={{ amount: 'Valor registrado' }} />}
            />
            <Bar
              data={chartData}
              dataKey="amount"
              name="Valor registrado"
              radius={[0, 6, 6, 0]}
              isAnimationActive={motionEnabled}
              animationDuration={420}
              animationEasing="ease-out"
            >
              {chartData.map((item, index) => (
                <Cell
                  key={item.id ?? item.fundingType}
                  fill={compositionPalette[index % compositionPalette.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      accessibleTable={(
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Origem</th>
              <th scope="col">Valor</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((item) => (
              <tr key={item.id ?? item.fundingType}>
                <th scope="row">{item.fundingType}</th>
                <td>{formatFullCurrency(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}

export interface FinancialDistributionDatum {
  id: string;
  label: string;
  value: number;
  color?: string;
  detail?: string;
}

export interface FinancialDistributionDonutChartProps extends BaseFinancialChartProps {
  data: ReadonlyArray<FinancialDistributionDatum>;
  valueKind?: FinancialDistributionValueKind;
  centerLabel?: string;
  centerValue?: number;
  forceMotion?: boolean;
  sort?: 'descending' | 'none';
}

/**
 * Shared financial donut with an interactive, keyboard-accessible legend. Zero-value
 * entries stay in the legend and accessible table even though they have no arc geometry.
 */
export function FinancialDistributionDonutChart({
  data,
  valueKind = 'currency',
  title = 'Distribuição financeira',
  summary = 'Composição proporcional da distribuição exibida.',
  centerLabel = 'Total na visão',
  centerValue,
  forceMotion = false,
  sort = 'descending',
  className,
  height = 390,
  mobileHeight = 430,
}: FinancialDistributionDonutChartProps) {
  const reducedMotion = usePrefersReducedMotion();
  const motionEnabled = forceMotion || !reducedMotion;
  const tooltipBaseId = useId().replace(/:/g, '');
  const [activeId, setActiveId] = useState<string | null>(null);
  const chartData = useMemo(() => {
    const normalized = data.map((item, index) => ({
      ...item,
      value: Number.isFinite(item.value) ? item.value : 0,
      geometryValue: Math.max(0, Number.isFinite(item.value) ? item.value : 0),
      color: item.color ?? compositionPalette[index % compositionPalette.length],
      originalIndex: index,
    }));
    return sort === 'descending'
      ? [...normalized].sort((left, right) => (
        right.geometryValue - left.geometryValue || left.originalIndex - right.originalIndex
      ))
      : normalized;
  }, [data, sort]);
  const positiveData = chartData.filter((item) => item.geometryValue > 0);
  const geometryTotal = positiveData.reduce((total, item) => total + item.geometryValue, 0);
  const displayedCenterValue = centerValue ?? geometryTotal;
  const activeDatum = chartData.find((item) => item.id === activeId) ?? null;
  const activeDatumIndex = activeDatum
    ? chartData.findIndex((item) => item.id === activeDatum.id)
    : -1;
  const activeTooltipId = activeDatumIndex >= 0
    ? `${tooltipBaseId}-${activeDatumIndex}-tooltip`
    : undefined;

  if (chartData.length === 0) {
    return <FinancialStatePanel state="empty" title={`Sem dados para ${title}`} />;
  }

  return (
    <FinancialChartFrame
      title={title}
      summary={summary}
      className={cn(
        'financial-chart--distribution-donut',
        'financial-expense-intelligence',
        className,
      )}
      height={height}
      mobileHeight={mobileHeight}
      interactiveCanvas
      chart={(
        <div
          className="financial-distribution-donut"
          data-force-motion={forceMotion ? 'true' : undefined}
          data-motion-enabled={motionEnabled ? 'true' : 'false'}
        >
          <div className="financial-distribution-donut__plot" aria-hidden="true">
            {positiveData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={positiveData}
                    dataKey="geometryValue"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius="59%"
                    outerRadius="86%"
                    paddingAngle={1.25}
                    cornerRadius={4}
                    stroke="var(--financial-chart-surface, white)"
                    strokeWidth={2}
                    isAnimationActive={motionEnabled}
                    animationDuration={720}
                    animationEasing="ease-out"
                    onMouseEnter={(_, index) => setActiveId(positiveData[index]?.id ?? null)}
                    onMouseLeave={() => setActiveId(null)}
                  >
                    {positiveData.map((item) => {
                      const isActive = item.id === activeId;
                      return (
                        <Cell
                          key={item.id}
                          fill={item.color}
                          opacity={activeId && !isActive ? 0.42 : 1}
                          stroke={isActive ? 'var(--financial-chart-active-ring, oklch(var(--brand-navy-900)))' : 'var(--financial-chart-surface, white)'}
                          strokeWidth={isActive ? 3 : 2}
                          className="financial-distribution-donut__sector"
                        />
                      );
                    })}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="financial-distribution-donut__empty-ring" />
            )}
            <div className="financial-distribution-donut__center">
              <strong>{formatCompactDistributionValue(displayedCenterValue, valueKind)}</strong>
              <span>{centerLabel}</span>
            </div>
          </div>

          <div className="financial-distribution-donut__legend" role="list" aria-label={`Legenda de ${title}`}>
            {chartData.map((item, index) => {
              const share = geometryTotal > 0 ? (item.geometryValue / geometryTotal) * 100 : 0;
              const isActive = item.id === activeId;
              const tooltipId = `${tooltipBaseId}-${index}-tooltip`;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="listitem"
                  className="financial-distribution-donut__legend-item"
                  data-active={isActive ? 'true' : undefined}
                  data-zero={item.geometryValue === 0 ? 'true' : undefined}
                  aria-label={`${item.label}. ${formatDistributionValue(item.value, valueKind)}. ${formatPercentage(share)} da distribuição.${item.detail ? ` ${item.detail}.` : ''}`}
                  aria-describedby={isActive ? tooltipId : undefined}
                  onPointerEnter={() => setActiveId(item.id)}
                  onPointerLeave={(event) => {
                    if (!event.currentTarget.matches(':focus')) setActiveId(null);
                  }}
                  onFocus={() => setActiveId(item.id)}
                  onBlur={() => setActiveId(null)}
                >
                  <span
                    className="financial-distribution-donut__legend-marker"
                    style={{ backgroundColor: item.color }}
                    aria-hidden="true"
                  />
                  <span className="financial-distribution-donut__legend-copy">
                    <strong>{item.label}</strong>
                    {item.detail && <small>{item.detail}</small>}
                  </span>
                  <span className="financial-distribution-donut__legend-metrics" aria-hidden="true">
                    <strong>{formatCompactDistributionValue(item.value, valueKind)}</strong>
                    <small>{formatPercentage(share)}</small>
                  </span>
                </button>
              );
            })}
          </div>

          {activeDatum && activeTooltipId && (
            <FinancialDetailTooltip
              id={activeTooltipId}
              title={activeDatum.label}
              rows={[
                {
                  label: valueKind === 'currency' ? 'Valor' : 'Quantidade',
                  value: formatDistributionValue(activeDatum.value, valueKind),
                  color: activeDatum.color,
                },
                {
                  label: 'Participação',
                  value: formatPercentage(
                    geometryTotal > 0 ? (activeDatum.geometryValue / geometryTotal) * 100 : 0,
                  ),
                },
                ...(activeDatum.detail ? [{ label: 'Contexto', value: activeDatum.detail }] : []),
              ]}
            />
          )}
        </div>
      )}
      accessibleTable={(
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Componente</th>
              <th scope="col">{valueKind === 'currency' ? 'Valor' : 'Quantidade'}</th>
              <th scope="col">Participação</th>
              <th scope="col">Contexto</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((item) => (
              <tr key={item.id}>
                <th scope="row">{item.label}</th>
                <td>{formatDistributionValue(item.value, valueKind)}</td>
                <td>{formatPercentage(geometryTotal > 0 ? (item.geometryValue / geometryTotal) * 100 : 0)}</td>
                <td>{item.detail ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}

export interface ExpenseCategoryDonutChartProps extends BaseFinancialChartProps {
  data: ReadonlyArray<ExpenseGroupSummary>;
  mode: ExpenseLedgerMode;
  forceMotion?: boolean;
}

export function ExpenseCategoryDonutChart({
  data,
  mode,
  forceMotion = false,
  title = mode === 'planning' ? 'Distribuição planejada por categoria' : 'Distribuição realizada por categoria',
  summary = 'Todas as categorias presentes no recorte, com valor, participação e quantidade de despesas.',
  className,
  height,
  mobileHeight,
}: ExpenseCategoryDonutChartProps) {
  const distribution = data.map((item) => ({
    id: item.key,
    label: item.label,
    value: mode === 'planning'
      ? roundChartCurrency(item.value2025Amount + item.value2026Amount)
      : item.realizedAmount,
    color: isExpenseCategory(item.label)
      ? resolveExpenseCategoryChartColor(item.label)
      : chartColors.neutral,
    detail: `${formatCount(item.expenseCount)} ${item.expenseCount === 1 ? 'despesa' : 'despesas'}`,
  }));

  return (
    <FinancialDistributionDonutChart
      data={distribution}
      valueKind="currency"
      title={title}
      summary={summary}
      centerLabel={mode === 'planning' ? 'Planejado no recorte' : 'Realizado no recorte'}
      forceMotion={forceMotion}
      className={className}
      height={height}
      mobileHeight={mobileHeight}
    />
  );
}

interface ExpenseTreemapLeafDatum {
  id: string;
  name: string;
  value: number;
  category: ExpenseCategory;
  commission: string;
  color: string;
  textColor: string;
  expense: FinancialExpense;
}

interface ExpenseTreemapContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  depth?: number;
  children?: unknown[];
  id?: string;
  name?: string;
  value?: number;
  color?: string;
  textColor?: string;
  expense?: FinancialExpense;
  activeExpenseId?: string | null;
  onActivate?: (expense: FinancialExpense | null) => void;
}

function ExpenseTreemapContent({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  depth = 0,
  children,
  id,
  name = '',
  value = 0,
  color = chartColors.neutral,
  textColor = 'white',
  expense,
  activeExpenseId,
  onActivate,
}: ExpenseTreemapContentProps) {
  if (depth === 0 || width <= 0 || height <= 0) return null;
  const isLeaf = Boolean(expense) && (!children || children.length === 0);

  if (!isLeaf) {
    return (
      <rect
        x={x + 1}
        y={y + 1}
        width={Math.max(0, width - 2)}
        height={Math.max(0, height - 2)}
        rx={7}
        fill={color}
        fillOpacity={0.08}
        stroke={color}
        strokeOpacity={0.52}
        strokeWidth={2}
        pointerEvents="none"
      />
    );
  }

  const isActive = activeExpenseId === id;
  const showLabel = width >= 72 && height >= 30;
  const showValue = width >= 104 && height >= 50;
  const maximumCharacters = Math.max(5, Math.floor((width - 14) / 6.4));
  const displayName = abbreviateAxisLabel(name, maximumCharacters);

  return (
    <g
      className="financial-expense-treemap__leaf"
      data-active={isActive ? 'true' : undefined}
      aria-hidden="true"
      onPointerEnter={() => onActivate?.(expense ?? null)}
      onPointerLeave={() => onActivate?.(null)}
    >
      <rect
        x={x + 1.5}
        y={y + 1.5}
        width={Math.max(0, width - 3)}
        height={Math.max(0, height - 3)}
        rx={Math.min(7, width / 5, height / 5)}
        fill={color}
        fillOpacity={isActive ? 1 : 0.86}
        stroke={isActive ? 'var(--financial-chart-active-ring, oklch(var(--brand-gold-500)))' : 'var(--financial-chart-surface, white)'}
        strokeWidth={isActive ? 3 : 1.5}
      />
      {showLabel && (
        <text
          x={x + 8}
          y={y + 16}
          fill={textColor}
          className="financial-expense-treemap__label"
          pointerEvents="none"
        >
          {displayName}
        </text>
      )}
      {showValue && (
        <text
          x={x + 8}
          y={y + 32}
          fill={textColor}
          className="financial-expense-treemap__value"
          pointerEvents="none"
        >
          {formatCompactCurrency(value)}
        </text>
      )}
    </g>
  );
}

export interface ExpenseTreemapChartProps extends BaseFinancialChartProps {
  expenses: ReadonlyArray<FinancialExpense>;
  mode: ExpenseLedgerMode;
  forceMotion?: boolean;
}

/**
 * Hierarchical category -> expense treemap. Every positive leaf is rendered; every
 * zero-value row remains explicitly accounted for and is included in the accessible table.
 */
export function ExpenseTreemapChart({
  expenses,
  mode,
  forceMotion = false,
  title = mode === 'planning' ? 'Mapa completo das despesas planejadas' : 'Mapa completo das despesas realizadas',
  summary = 'Mapa hierárquico por categoria contendo todas as despesas do recorte. Linhas sem valor permanecem contabilizadas separadamente.',
  className,
  height = 520,
  mobileHeight = 430,
}: ExpenseTreemapChartProps) {
  const reducedMotion = usePrefersReducedMotion();
  const motionEnabled = forceMotion || !reducedMotion;
  const tooltipId = `${useId().replace(/:/g, '')}-tooltip`;
  const [activeExpenseId, setActiveExpenseId] = useState<string | null>(null);
  const model = useMemo(() => {
    const normalized = expenses.map((expense) => ({
      expense,
      value: selectExpenseDisplayAmount(expense, mode),
    }));
    const positive = normalized.filter((item) => item.value > 0);
    const zero = normalized.filter((item) => item.value <= 0);
    const groups = new Map<ExpenseCategory, Array<{ expense: FinancialExpense; value: number }>>();

    positive.forEach((item) => {
      const current = groups.get(item.expense.category);
      if (current) current.push(item);
      else groups.set(item.expense.category, [item]);
    });

    const tree = Array.from(groups, ([category, items]) => {
      const color = resolveExpenseCategoryChartColor(category);
      const textColor = expenseCategoryTextColors[category] ?? 'white';
      const children: ExpenseTreemapLeafDatum[] = [...items]
        .sort((left, right) => right.value - left.value)
        .map(({ expense, value }) => ({
          id: expense.id,
          name: expense.description || `Linha ${expense.sourceRow} sem descrição`,
          value,
          category,
          commission: expense.commission,
          color,
          textColor,
          expense,
        }));
      return {
        id: `category-${category}`,
        name: category,
        category,
        color,
        textColor,
        children,
        value: children.reduce((total, item) => total + item.value, 0),
      };
    }).sort((left, right) => right.value - left.value);

    return {
      normalized,
      positive,
      zero,
      tree,
      positiveExpenses: tree.flatMap((category) => category.children.map((item) => item.expense)),
      totalValue: roundChartCurrency(positive.reduce((total, item) => total + item.value, 0)),
    };
  }, [expenses, mode]);
  const activeExpense = model.positiveExpenses.find((expense) => expense.id === activeExpenseId) ?? null;
  const activeValue = activeExpense ? selectExpenseDisplayAmount(activeExpense, mode) : 0;

  if (expenses.length === 0) {
    return <FinancialStatePanel state="empty" title={`Sem dados para ${title}`} />;
  }

  const activateExpense = (expense: FinancialExpense | null) => {
    setActiveExpenseId(expense?.id ?? null);
  };
  const moveActiveExpense = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (model.positiveExpenses.length === 0) return;
    const currentIndex = model.positiveExpenses.findIndex((expense) => expense.id === activeExpenseId);
    let nextIndex = currentIndex < 0 ? 0 : currentIndex;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex += 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex -= 1;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = model.positiveExpenses.length - 1;
    else return;

    event.preventDefault();
    const wrappedIndex = (nextIndex + model.positiveExpenses.length) % model.positiveExpenses.length;
    setActiveExpenseId(model.positiveExpenses[wrappedIndex]?.id ?? null);
  };

  return (
    <FinancialChartFrame
      title={title}
      summary={summary}
      className={cn(
        'financial-chart--expense-treemap',
        'financial-expense-intelligence',
        className,
      )}
      height={height}
      mobileHeight={mobileHeight}
      interactiveCanvas
      chart={(
        <div
          className="financial-expense-treemap"
          data-force-motion={forceMotion ? 'true' : undefined}
          data-motion-enabled={motionEnabled ? 'true' : 'false'}
        >
          <div className="financial-expense-treemap__summary" aria-hidden="true">
            <span><strong>{formatCount(model.positive.length)}</strong> com valor</span>
            <span><strong>{formatCount(model.zero.length)}</strong> sem valor na visão</span>
            <span><strong>{formatCompactCurrency(model.totalValue)}</strong> no recorte</span>
          </div>
          <div
            className="financial-expense-treemap__canvas"
            role="group"
            tabIndex={0}
            aria-label={activeExpense
              ? `${activeExpense.description || `Linha ${activeExpense.sourceRow}`}. ${activeExpense.commission}. ${formatFullCurrency(activeValue)}. Use as setas para explorar outras despesas.`
              : `Mapa com ${formatCount(model.positive.length)} despesas com valor. Use as setas para explorar os itens.`}
            aria-describedby={activeExpense ? tooltipId : undefined}
            onFocus={() => {
              if (!activeExpenseId) setActiveExpenseId(model.positiveExpenses[0]?.id ?? null);
            }}
            onBlur={() => setActiveExpenseId(null)}
            onKeyDown={moveActiveExpense}
          >
            {model.tree.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <Treemap
                  data={model.tree}
                  dataKey="value"
                  nameKey="name"
                  type="flat"
                  aspectRatio={16 / 10}
                  isAnimationActive={false}
                  isUpdateAnimationActive={false}
                  content={(
                    <ExpenseTreemapContent
                      activeExpenseId={activeExpenseId}
                      onActivate={activateExpense}
                    />
                  )}
                />
              </ResponsiveContainer>
            ) : (
              <div className="financial-expense-treemap__zero-only">
                Todas as {formatCount(model.zero.length)} linhas do recorte estão sem valor nesta visão.
              </div>
            )}
          </div>
          <div className="financial-expense-treemap__category-legend" aria-label="Categorias no mapa">
            {model.tree.map((category) => (
              <span key={category.id}>
                <i style={{ backgroundColor: category.color }} aria-hidden="true" />
                {category.name}
              </span>
            ))}
          </div>
          <p className="financial-expense-treemap__zero-accounting">
            Cobertura: {formatCount(expenses.length)} linhas filtradas · {formatCount(model.positive.length)} blocos proporcionais · {formatCount(model.zero.length)} linhas sem área por valor zero.
          </p>

          {activeExpense && (
            <FinancialDetailTooltip
              id={tooltipId}
              title={activeExpense.description || `Linha ${activeExpense.sourceRow} sem descrição`}
              rows={[
                {
                  label: mode === 'planning' ? 'Planejado' : 'Realizado',
                  value: formatFullCurrency(activeValue),
                  color: resolveExpenseCategoryChartColor(activeExpense.category),
                },
                { label: 'Comissão', value: activeExpense.commission },
                { label: 'Categoria', value: activeExpense.category },
                { label: '2025', value: formatFullCurrency(activeExpense.value2025) },
                { label: '2026', value: formatFullCurrency(activeExpense.value2026) },
                { label: 'Realizado', value: formatFullCurrency(activeExpense.realizedAmount) },
              ]}
            />
          )}
        </div>
      )}
      accessibleTable={(
        <table>
          <caption>{title}. Todas as linhas, inclusive valores zero.</caption>
          <thead>
            <tr>
              <th scope="col">Despesa</th>
              <th scope="col">Comissão</th>
              <th scope="col">Categoria</th>
              <th scope="col">Valor na visão</th>
              <th scope="col">2025</th>
              <th scope="col">2026</th>
              <th scope="col">Realizado</th>
              <th scope="col">Representação no mapa</th>
            </tr>
          </thead>
          <tbody>
            {model.normalized.map(({ expense, value }) => (
              <tr key={expense.id}>
                <th scope="row">{expense.description || `Linha ${expense.sourceRow} sem descrição`}</th>
                <td>{expense.commission}</td>
                <td>{expense.category}</td>
                <td>{formatFullCurrency(value)}</td>
                <td>{formatFullCurrency(expense.value2025)}</td>
                <td>{formatFullCurrency(expense.value2026)}</td>
                <td>{formatFullCurrency(expense.realizedAmount)}</td>
                <td>{value > 0 ? 'Bloco proporcional' : 'Sem área: valor zero'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}

export interface ExpenseDistributionBarChartProps extends BaseFinancialChartProps {
  data: ReadonlyArray<ExpenseGroupSummary>;
  mode: ExpenseLedgerMode;
  dimension: 'commission' | 'category';
  forceMotion?: boolean;
}

export function ExpenseDistributionBarChart({
  data,
  mode,
  dimension,
  forceMotion = false,
  title = mode === 'planning'
    ? `Despesas planejadas por ${dimension === 'commission' ? 'comissão' : 'categoria'}`
    : `Despesas realizadas por ${dimension === 'commission' ? 'comissão' : 'categoria'}`,
  summary = 'Distribuição horizontal completa, ordenada por valor e sem truncamento de grupos.',
  className,
  height = 540,
  mobileHeight = 460,
}: ExpenseDistributionBarChartProps) {
  const reducedMotion = usePrefersReducedMotion();
  const motionEnabled = forceMotion || !reducedMotion;
  const tooltipBaseId = useId().replace(/:/g, '');
  const [activeId, setActiveId] = useState<string | null>(null);
  const chartData = useMemo(() => data.map((item, index) => {
    const value = mode === 'planning'
      ? roundChartCurrency(item.value2025Amount + item.value2026Amount)
      : item.realizedAmount;
    const color = dimension === 'category' && isExpenseCategory(item.label)
      ? resolveExpenseCategoryChartColor(item.label)
      : mode === 'planning'
        ? chartColors.projected
        : chartColors.consolidated;
    return {
      ...item,
      id: item.key || `${item.label}-${index}`,
      value,
      geometryValue: Math.max(0, Number.isFinite(value) ? value : 0),
      color,
      originalIndex: index,
    };
  }).sort((left, right) => (
    right.geometryValue - left.geometryValue || left.originalIndex - right.originalIndex
  )), [data, dimension, mode]);
  const maximumValue = Math.max(1, ...chartData.map((item) => item.geometryValue));
  const totalValue = chartData.reduce((total, item) => total + item.geometryValue, 0);
  const motionKey = chartData.map((item) => `${item.id}:${item.value}`).join('|');
  const motionProgress = useProgressiveChartMotion(720, motionKey, motionEnabled);
  const activeDatum = chartData.find((item) => item.id === activeId) ?? null;

  if (chartData.length === 0) {
    return <FinancialStatePanel state="empty" title={`Sem dados para ${title}`} />;
  }

  return (
    <FinancialChartFrame
      title={title}
      summary={summary}
      className={cn(
        'financial-chart--expense-distribution',
        'financial-expense-intelligence',
        className,
      )}
      height={height}
      mobileHeight={mobileHeight}
      interactiveCanvas
      chart={(
        <div
          className="financial-expense-bars"
          data-force-motion={forceMotion ? 'true' : undefined}
          data-dimension={dimension}
        >
          <div className="financial-expense-bars__scale" aria-hidden="true">
            <span>R$ 0</span>
            <span>{formatCompactCurrency(maximumValue / 2)}</span>
            <span>{formatCompactCurrency(maximumValue)}</span>
          </div>
          <div className="financial-expense-bars__rows" role="list" aria-label={title}>
            {chartData.map((item, index) => {
              const isActive = activeId === item.id;
              const tooltipId = `${tooltipBaseId}-${index}-tooltip`;
              const share = totalValue > 0 ? (item.geometryValue / totalValue) * 100 : 0;
              return (
                <div
                  key={item.id}
                  className="financial-expense-bars__row"
                  data-active={isActive ? 'true' : undefined}
                  data-zero={item.geometryValue === 0 ? 'true' : undefined}
                  role="listitem"
                  tabIndex={0}
                  aria-label={`${index + 1}ª posição, ${item.label}. ${formatFullCurrency(item.value)}. ${formatPercentage(share)} do recorte. ${formatCount(item.expenseCount)} despesas.`}
                  aria-describedby={isActive ? tooltipId : undefined}
                  onPointerEnter={() => setActiveId(item.id)}
                  onPointerLeave={(event) => {
                    if (!event.currentTarget.matches(':focus')) setActiveId(null);
                  }}
                  onFocus={() => setActiveId(item.id)}
                  onBlur={() => setActiveId(null)}
                >
                  <div className="financial-expense-bars__heading" aria-hidden="true">
                    <span className="financial-expense-bars__rank">{String(index + 1).padStart(2, '0')}</span>
                    <span className="financial-expense-bars__label">{item.label}</span>
                    <span className="financial-expense-bars__metrics">
                      <strong>{formatCompactCurrency(item.value)}</strong>
                      <small>{formatPercentage(share)} · {formatCount(item.expenseCount)} itens</small>
                    </span>
                  </div>
                  <div className="financial-expense-bars__track" aria-hidden="true">
                    <span
                      className="financial-expense-bars__fill"
                      style={{
                        width: `${(item.geometryValue / maximumValue) * 100}%`,
                        backgroundColor: item.color,
                        transform: `scaleX(${motionProgress})`,
                        transformOrigin: 'left center',
                      }}
                    />
                  </div>

                  {isActive && (
                    <FinancialDetailTooltip
                      id={tooltipId}
                      title={item.label}
                      rows={[
                        {
                          label: mode === 'planning' ? 'Planejado' : 'Realizado',
                          value: formatFullCurrency(item.value),
                          color: item.color,
                        },
                        { label: 'Participação', value: formatPercentage(share) },
                        { label: 'Despesas', value: formatCount(item.expenseCount) },
                        { label: '2025', value: formatFullCurrency(item.value2025Amount) },
                        { label: '2026', value: formatFullCurrency(item.value2026Amount) },
                        { label: 'Realizado', value: formatFullCurrency(item.realizedAmount) },
                      ]}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      accessibleTable={(
        <table>
          <caption>{title}. Todos os grupos.</caption>
          <thead>
            <tr>
              <th scope="col">{dimension === 'commission' ? 'Comissão' : 'Categoria'}</th>
              <th scope="col">Valor</th>
              <th scope="col">Participação</th>
              <th scope="col">Despesas</th>
              <th scope="col">2025</th>
              <th scope="col">2026</th>
              <th scope="col">Realizado</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((item) => (
              <tr key={item.id}>
                <th scope="row">{item.label}</th>
                <td>{formatFullCurrency(item.value)}</td>
                <td>{formatPercentage(totalValue > 0 ? (item.geometryValue / totalValue) * 100 : 0)}</td>
                <td>{formatCount(item.expenseCount)}</td>
                <td>{formatFullCurrency(item.value2025Amount)}</td>
                <td>{formatFullCurrency(item.value2026Amount)}</td>
                <td>{formatFullCurrency(item.realizedAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}

export interface ExpensePeriodComparisonChartProps extends BaseFinancialChartProps {
  data: ReadonlyArray<ExpenseGroupSummary>;
  forceMotion?: boolean;
  scaleMode?: 'portfolio' | 'relative';
}

export function ExpensePeriodComparisonChart({
  data,
  forceMotion = false,
  scaleMode = 'portfolio',
  title = '2025 × 2026 por categoria',
  summary = 'Comparação dos valores planejados em 2025 e 2026 para todas as categorias do recorte.',
  className,
  height = 560,
  mobileHeight = 470,
}: ExpensePeriodComparisonChartProps) {
  const reducedMotion = usePrefersReducedMotion();
  const motionEnabled = forceMotion || !reducedMotion;
  const tooltipBaseId = useId().replace(/:/g, '');
  const [activeId, setActiveId] = useState<string | null>(null);
  const chartData = useMemo(() => data.map((item, index) => ({
    ...item,
    id: item.key || `${item.label}-${index}`,
    value2025: Math.max(0, Number.isFinite(item.value2025Amount) ? item.value2025Amount : 0),
    value2026: Math.max(0, Number.isFinite(item.value2026Amount) ? item.value2026Amount : 0),
    originalIndex: index,
  })).sort((left, right) => (
    (right.value2025 + right.value2026) - (left.value2025 + left.value2026)
    || left.originalIndex - right.originalIndex
  )), [data]);
  const portfolioMaximum = Math.max(
    1,
    ...chartData.flatMap((item) => [item.value2025, item.value2026]),
  );
  const motionKey = chartData.map((item) => `${item.id}:${item.value2025}:${item.value2026}`).join('|');
  const motionProgress = useProgressiveChartMotion(740, motionKey, motionEnabled);

  if (chartData.length === 0) {
    return <FinancialStatePanel state="empty" title={`Sem dados para ${title}`} />;
  }

  return (
    <FinancialChartFrame
      title={title}
      summary={summary}
      className={cn(
        'financial-chart--expense-periods',
        'financial-expense-intelligence',
        className,
      )}
      height={height}
      mobileHeight={mobileHeight}
      interactiveCanvas
      chart={(
        <div
          className="financial-period-bars"
          data-force-motion={forceMotion ? 'true' : undefined}
          data-scale-mode={scaleMode}
        >
          <div className="financial-period-bars__legend" aria-hidden="true">
            <span><i className="financial-period-bars__marker--2025" /> 2025</span>
            <span><i className="financial-period-bars__marker--2026" /> 2026</span>
            <small>{scaleMode === 'relative' ? 'Escala por categoria' : 'Escala comum do portfólio'}</small>
          </div>
          <div className="financial-period-bars__rows" role="list" aria-label={title}>
            {chartData.map((item, index) => {
              const rowMaximum = scaleMode === 'relative'
                ? Math.max(1, item.value2025, item.value2026)
                : portfolioMaximum;
              const total = roundChartCurrency(item.value2025 + item.value2026);
              const share2025 = total > 0 ? (item.value2025 / total) * 100 : 0;
              const share2026 = total > 0 ? (item.value2026 / total) * 100 : 0;
              const isActive = activeId === item.id;
              const tooltipId = `${tooltipBaseId}-${index}-tooltip`;
              return (
                <div
                  key={item.id}
                  className="financial-period-bars__row"
                  data-active={isActive ? 'true' : undefined}
                  role="listitem"
                  tabIndex={0}
                  aria-label={`${item.label}. 2025: ${formatFullCurrency(item.value2025)}, ${formatPercentage(share2025)} do total da categoria. 2026: ${formatFullCurrency(item.value2026)}, ${formatPercentage(share2026)}. Total ${formatFullCurrency(total)}.`}
                  aria-describedby={isActive ? tooltipId : undefined}
                  onPointerEnter={() => setActiveId(item.id)}
                  onPointerLeave={(event) => {
                    if (!event.currentTarget.matches(':focus')) setActiveId(null);
                  }}
                  onFocus={() => setActiveId(item.id)}
                  onBlur={() => setActiveId(null)}
                >
                  <div className="financial-period-bars__heading" aria-hidden="true">
                    <span className="financial-period-bars__rank">{String(index + 1).padStart(2, '0')}</span>
                    <span className="financial-period-bars__label">{item.label}</span>
                    <strong>{formatCompactCurrency(total)}</strong>
                  </div>
                  <div className="financial-period-bars__pair" aria-hidden="true">
                    <span className="financial-period-bars__year">2025</span>
                    <span className="financial-period-bars__track">
                      <i
                        className="financial-period-bars__fill financial-period-bars__fill--2025"
                        style={{
                          width: `${(item.value2025 / rowMaximum) * 100}%`,
                          transform: `scaleX(${motionProgress})`,
                          transformOrigin: 'left center',
                        }}
                      />
                    </span>
                    <span className="financial-period-bars__value">{formatCompactCurrency(item.value2025)}</span>
                    <span className="financial-period-bars__year">2026</span>
                    <span className="financial-period-bars__track">
                      <i
                        className="financial-period-bars__fill financial-period-bars__fill--2026"
                        style={{
                          width: `${(item.value2026 / rowMaximum) * 100}%`,
                          transform: `scaleX(${motionProgress})`,
                          transformOrigin: 'left center',
                        }}
                      />
                    </span>
                    <span className="financial-period-bars__value">{formatCompactCurrency(item.value2026)}</span>
                  </div>

                  {isActive && (
                    <FinancialDetailTooltip
                      id={tooltipId}
                      title={item.label}
                      rows={[
                        { label: '2025', value: formatFullCurrency(item.value2025), color: chartColors.blue },
                        { label: 'Participação 2025', value: formatPercentage(share2025) },
                        { label: '2026', value: formatFullCurrency(item.value2026), color: chartColors.projected },
                        { label: 'Participação 2026', value: formatPercentage(share2026) },
                        { label: 'Total', value: formatFullCurrency(total) },
                        { label: 'Despesas', value: formatCount(item.expenseCount) },
                      ]}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      accessibleTable={(
        <table>
          <caption>{title}. Todas as categorias.</caption>
          <thead>
            <tr>
              <th scope="col">Categoria</th>
              <th scope="col">2025</th>
              <th scope="col">2026</th>
              <th scope="col">Total</th>
              <th scope="col">Despesas</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((item) => (
              <tr key={item.id}>
                <th scope="row">{item.label}</th>
                <td>{formatFullCurrency(item.value2025)}</td>
                <td>{formatFullCurrency(item.value2026)}</td>
                <td>{formatFullCurrency(roundChartCurrency(item.value2025 + item.value2026))}</td>
                <td>{formatCount(item.expenseCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}

const fundingSourceColors = {
  freeResource: chartColors.projected,
  municipalityPlan: chartColors.blue,
  rouanet: chartColors.gold,
} as const;

export interface ExpenseFundingStackedBarChartProps extends BaseFinancialChartProps {
  expenses: ReadonlyArray<FinancialExpense>;
  forceMotion?: boolean;
}

/**
 * Stacks only the three independent origin columns from the workbook. The realized
 * amount remains a separate reference and is never presented as the stack denominator.
 */
export function ExpenseFundingStackedBarChart({
  expenses,
  forceMotion = false,
  title = 'Origens registradas por comissão',
  summary = 'Participação das três colunas independentes de origem por comissão. A soma das colunas não é uma reconciliação do realizado.',
  className,
  height = 560,
  mobileHeight = 470,
}: ExpenseFundingStackedBarChartProps) {
  const reducedMotion = usePrefersReducedMotion();
  const motionEnabled = forceMotion || !reducedMotion;
  const tooltipBaseId = useId().replace(/:/g, '');
  const [activeId, setActiveId] = useState<string | null>(null);
  const chartData = useMemo(() => {
    const groups = new Map<string, {
      id: string;
      commission: string;
      expenseCount: number;
      realizedAmount: number;
      freeResourceAmount: number;
      municipalityPlanAmount: number;
      rouanetAmount: number;
    }>();

    expenses.forEach((expense) => {
      const current = groups.get(expense.commissionId) ?? {
        id: expense.commissionId,
        commission: expense.commission,
        expenseCount: 0,
        realizedAmount: 0,
        freeResourceAmount: 0,
        municipalityPlanAmount: 0,
        rouanetAmount: 0,
      };
      current.expenseCount += 1;
      current.realizedAmount += expense.realizedAmount;
      current.freeResourceAmount += expense.paidWithFreeResource;
      current.municipalityPlanAmount += expense.municipalityPlanAmount;
      current.rouanetAmount += expense.rouanetAmount;
      groups.set(expense.commissionId, current);
    });

    return Array.from(groups.values()).map((item, index) => {
      const freeResourceAmount = roundChartCurrency(item.freeResourceAmount);
      const municipalityPlanAmount = roundChartCurrency(item.municipalityPlanAmount);
      const rouanetAmount = roundChartCurrency(item.rouanetAmount);
      return {
        ...item,
        realizedAmount: roundChartCurrency(item.realizedAmount),
        freeResourceAmount,
        municipalityPlanAmount,
        rouanetAmount,
        registeredColumnsTotal: roundChartCurrency(
          freeResourceAmount + municipalityPlanAmount + rouanetAmount,
        ),
        originalIndex: index,
      };
    }).sort((left, right) => (
      right.registeredColumnsTotal - left.registeredColumnsTotal
      || right.realizedAmount - left.realizedAmount
      || left.originalIndex - right.originalIndex
    ));
  }, [expenses]);
  const scaleMaximum = Math.max(1, ...chartData.map((item) => item.registeredColumnsTotal));
  const motionKey = chartData.map((item) => (
    `${item.id}:${item.freeResourceAmount}:${item.municipalityPlanAmount}:${item.rouanetAmount}`
  )).join('|');
  const motionProgress = useProgressiveChartMotion(760, motionKey, motionEnabled);

  if (chartData.length === 0) {
    return <FinancialStatePanel state="empty" title={`Sem dados para ${title}`} />;
  }

  return (
    <FinancialChartFrame
      title={title}
      summary={summary}
      className={cn(
        'financial-chart--expense-funding-stack',
        'financial-expense-intelligence',
        className,
      )}
      height={height}
      mobileHeight={mobileHeight}
      interactiveCanvas
      chart={(
        <div
          className="financial-funding-stack"
          data-force-motion={forceMotion ? 'true' : undefined}
        >
          <div className="financial-funding-stack__legend">
            <span><i style={{ backgroundColor: fundingSourceColors.freeResource }} /> Recurso Livre</span>
            <span><i style={{ backgroundColor: fundingSourceColors.municipalityPlan }} /> Prefeitura / Plano</span>
            <span><i style={{ backgroundColor: fundingSourceColors.rouanet }} /> Lei Rouanet</span>
            <strong>Colunas independentes e não exaustivas</strong>
          </div>
          <div className="financial-funding-stack__rows" role="list" aria-label={title}>
            {chartData.map((item, index) => {
              const isActive = activeId === item.id;
              const tooltipId = `${tooltipBaseId}-${index}-tooltip`;
              const freeWidth = (Math.max(0, item.freeResourceAmount) / scaleMaximum) * 100;
              const municipalityWidth = (Math.max(0, item.municipalityPlanAmount) / scaleMaximum) * 100;
              const rouanetWidth = (Math.max(0, item.rouanetAmount) / scaleMaximum) * 100;
              return (
                <div
                  key={item.id}
                  className="financial-funding-stack__row"
                  data-active={isActive ? 'true' : undefined}
                  data-zero={item.registeredColumnsTotal === 0 ? 'true' : undefined}
                  role="listitem"
                  tabIndex={0}
                  aria-label={`${index + 1}ª posição, ${item.commission}. Recurso Livre ${formatFullCurrency(item.freeResourceAmount)}. Prefeitura ou Plano de Trabalho ${formatFullCurrency(item.municipalityPlanAmount)}. Lei Rouanet ${formatFullCurrency(item.rouanetAmount)}. Total indicativo das colunas ${formatFullCurrency(item.registeredColumnsTotal)}. Realizado de referência ${formatFullCurrency(item.realizedAmount)}. As colunas de origem são independentes e não exaustivas.`}
                  aria-describedby={isActive ? tooltipId : undefined}
                  onPointerEnter={() => setActiveId(item.id)}
                  onPointerLeave={(event) => {
                    if (!event.currentTarget.matches(':focus')) setActiveId(null);
                  }}
                  onFocus={() => setActiveId(item.id)}
                  onBlur={() => setActiveId(null)}
                >
                  <div className="financial-funding-stack__heading" aria-hidden="true">
                    <span className="financial-funding-stack__rank">{String(index + 1).padStart(2, '0')}</span>
                    <span className="financial-funding-stack__label">{item.commission}</span>
                    <span className="financial-funding-stack__metrics">
                      <strong>{item.registeredColumnsTotal > 0 ? formatCompactCurrency(item.registeredColumnsTotal) : 'Sem origem'}</strong>
                      <small>Realizado {formatCompactCurrency(item.realizedAmount)}</small>
                    </span>
                  </div>
                  <div className="financial-funding-stack__track" aria-hidden="true">
                    <i
                      className="financial-funding-stack__segment financial-funding-stack__segment--free"
                      style={{
                        left: 0,
                        width: `${freeWidth}%`,
                        transform: `scaleX(${motionProgress})`,
                        transformOrigin: 'left center',
                      }}
                    />
                    <i
                      className="financial-funding-stack__segment financial-funding-stack__segment--municipality"
                      style={{
                        left: `${freeWidth}%`,
                        width: `${municipalityWidth}%`,
                        transform: `scaleX(${motionProgress})`,
                        transformOrigin: 'left center',
                      }}
                    />
                    <i
                      className="financial-funding-stack__segment financial-funding-stack__segment--rouanet"
                      style={{
                        left: `${freeWidth + municipalityWidth}%`,
                        width: `${rouanetWidth}%`,
                        transform: `scaleX(${motionProgress})`,
                        transformOrigin: 'left center',
                      }}
                    />
                  </div>

                  {isActive && (
                    <FinancialDetailTooltip
                      id={tooltipId}
                      title={item.commission}
                      rows={[
                        { label: 'Recurso Livre', value: formatFullCurrency(item.freeResourceAmount), color: fundingSourceColors.freeResource },
                        { label: 'Prefeitura / Plano', value: formatFullCurrency(item.municipalityPlanAmount), color: fundingSourceColors.municipalityPlan },
                        { label: 'Lei Rouanet', value: formatFullCurrency(item.rouanetAmount), color: fundingSourceColors.rouanet },
                        { label: 'Total indicativo das colunas', value: formatFullCurrency(item.registeredColumnsTotal) },
                        { label: 'Realizado de referência', value: formatFullCurrency(item.realizedAmount) },
                        { label: 'Despesas no recorte', value: formatCount(item.expenseCount) },
                      ]}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <p className="financial-funding-stack__note">
            A barra compara apenas os valores informados nas três colunas de origem. Ela não representa uma partição contábil do total realizado.
          </p>
        </div>
      )}
      accessibleTable={(
        <table>
          <caption>{title}. Colunas independentes e não exaustivas; não reconciliam o realizado.</caption>
          <thead>
            <tr>
              <th scope="col">Comissão</th>
              <th scope="col">Recurso Livre</th>
              <th scope="col">Prefeitura / Plano</th>
              <th scope="col">Lei Rouanet</th>
              <th scope="col">Total indicativo das colunas</th>
              <th scope="col">Realizado de referência</th>
              <th scope="col">Despesas</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((item) => (
              <tr key={item.id}>
                <th scope="row">{item.commission}</th>
                <td>{formatFullCurrency(item.freeResourceAmount)}</td>
                <td>{formatFullCurrency(item.municipalityPlanAmount)}</td>
                <td>{formatFullCurrency(item.rouanetAmount)}</td>
                <td>{formatFullCurrency(item.registeredColumnsTotal)}</td>
                <td>{formatFullCurrency(item.realizedAmount)}</td>
                <td>{formatCount(item.expenseCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}

export interface BudgetStatusDonutChartProps extends BaseFinancialChartProps {
  budgets: ReadonlyArray<CommissionBudget>;
  forceMotion?: boolean;
}

export function BudgetStatusDonutChart({
  budgets,
  forceMotion = false,
  title = 'Composição do status orçamentário',
  summary = 'Quantidade e participação de comissões em cada faixa visual de utilização.',
  className,
  height,
  mobileHeight,
}: BudgetStatusDonutChartProps) {
  const statusOrder: readonly BudgetAttentionStatus[] = [
    'normal',
    'attention',
    'near-limit',
    'over-budget',
    'no-budget-cap',
  ];
  const distribution = statusOrder.map((status) => {
    const count = budgets.filter((budget) => budget.status === status).length;
    return {
      id: status,
      label: budgetStatusLabels[status],
      value: count,
      color: budgetStatusColors[status],
      detail: `${formatPercentage(budgets.length > 0 ? (count / budgets.length) * 100 : 0)} das comissões`,
    };
  });

  return (
    <FinancialDistributionDonutChart
      data={distribution}
      valueKind="count"
      title={title}
      summary={summary}
      centerLabel={budgets.length === 1 ? 'comissão' : 'comissões'}
      centerValue={budgets.length}
      forceMotion={forceMotion}
      sort="none"
      className={className}
      height={height}
      mobileHeight={mobileHeight}
    />
  );
}

export interface ScenarioComparisonChartProps extends BaseFinancialChartProps {
  data: ReadonlyArray<FinancialScenario>;
}

export function ScenarioComparisonChart({
  data,
  title = 'Comparação de cenários financeiros',
  summary = 'Comparação entre receita total, compromissos e resultado líquido — capacidade positiva ou déficit — nos cenários gerenciais.',
  className,
  height = 360,
  mobileHeight = 300,
}: ScenarioComparisonChartProps) {
  const reducedMotion = usePrefersReducedMotion();
  const chartData = data.map((item) => ({
    ...item,
    totalCommitments: Math.round((
      item.operatingExecution + item.historicalObligations + item.reserve
    ) * 100) / 100,
    netResult: item.negativeResult > 0 ? -Math.abs(item.negativeResult) : item.investmentCapacity,
  }));

  if (chartData.length === 0) {
    return <FinancialStatePanel state="empty" title={`Sem dados para ${title}`} />;
  }

  return (
    <FinancialChartFrame
      title={title}
      summary={summary}
      className={cn('financial-chart--scenario-comparison', className)}
      height={height}
      mobileHeight={mobileHeight}
      chart={(
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 16, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--financial-chart-grid, oklch(var(--border)))" />
            <ReferenceLine
              y={0}
              stroke="var(--financial-chart-axis, oklch(var(--muted-foreground)))"
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tickMargin={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickFormatter={formatCompactCurrency}
              width={76}
            />
            <Tooltip
              cursor={{ fill: 'var(--financial-chart-hover, oklch(var(--muted) / 0.45))' }}
              content={(
                <FinancialChartTooltip
                  valueLabels={{
                    totalRevenue: 'Receita total',
                    totalCommitments: 'Compromissos',
                    netResult: 'Resultado líquido',
                  }}
                />
              )}
            />
            <Legend
              formatter={(value) => {
                if (value === 'totalRevenue') return 'Receita total';
                if (value === 'totalCommitments') return 'Compromissos';
                return 'Capacidade / déficit';
              }}
            />
            <Bar
              dataKey="totalRevenue"
              name="totalRevenue"
              fill={chartColors.projected}
              radius={[5, 5, 0, 0]}
              isAnimationActive={!reducedMotion}
              animationDuration={360}
              animationEasing="ease-out"
            />
            <Bar
              dataKey="totalCommitments"
              name="totalCommitments"
              fill={chartColors.attention}
              radius={[5, 5, 0, 0]}
              isAnimationActive={!reducedMotion}
              animationDuration={360}
              animationEasing="ease-out"
            />
            <Bar
              dataKey="netResult"
              name="netResult"
              fill={chartColors.consolidated}
              radius={[5, 5, 0, 0]}
              isAnimationActive={!reducedMotion}
              animationDuration={360}
              animationEasing="ease-out"
            >
              {chartData.map((item) => (
                <Cell
                  key={item.id}
                  fill={item.netResult < 0 ? chartColors.danger : chartColors.consolidated}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      accessibleTable={(
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Cenário</th>
              <th scope="col">Receita total</th>
              <th scope="col">Compromissos</th>
              <th scope="col">Capacidade ou déficit</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((item) => (
              <tr key={item.id}>
                <th scope="row">{item.label}</th>
                <td>{formatFullCurrency(item.totalRevenue)}</td>
                <td>{formatFullCurrency(item.totalCommitments)}</td>
                <td>{formatFullCurrency(item.netResult)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}
