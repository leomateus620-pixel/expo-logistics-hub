import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { cn } from '@/lib/utils';
import type {
  BudgetAttentionStatus,
  FinancialScenario,
  FundingType,
  RevenueCategory,
} from '@/features/financial-management/types';
import { FinancialStatePanel } from './FinancialPrimitives';

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
    const scaleMaximum = Math.max(
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
