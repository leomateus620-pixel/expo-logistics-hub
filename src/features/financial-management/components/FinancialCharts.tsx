import { useEffect, useId, useState, type ReactNode } from 'react';
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
}

function FinancialChartFrame({
  title,
  summary,
  className,
  height,
  mobileHeight,
  chart,
  accessibleTable,
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
        aria-hidden="true"
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
  const reducedMotion = usePrefersReducedMotion();
  const chartData = data.map((item) => ({ ...item }));

  if (chartData.length === 0) {
    return <FinancialStatePanel state="empty" title={`Sem dados para ${title}`} />;
  }

  return (
    <FinancialChartFrame
      title={title}
      summary={summary}
      className={cn('financial-chart--revenue-comparison', className)}
      height={height}
      mobileHeight={mobileHeight}
      chart={(
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 16, right: 12, bottom: 8, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--financial-chart-grid, oklch(var(--border)))" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              minTickGap={16}
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
                    projectedAmount: 'Projetado',
                    consolidatedAmount: 'Consolidado',
                  }}
                />
              )}
            />
            <Legend
              formatter={(value) => (value === 'projectedAmount' ? 'Projetado' : 'Consolidado')}
            />
            <Bar
              dataKey="projectedAmount"
              name="projectedAmount"
              fill={chartColors.projected}
              radius={[5, 5, 0, 0]}
              isAnimationActive={!reducedMotion}
              animationDuration={360}
              animationEasing="ease-out"
            />
            <Bar
              dataKey="consolidatedAmount"
              name="consolidatedAmount"
              fill={chartColors.consolidated}
              radius={[5, 5, 0, 0]}
              isAnimationActive={!reducedMotion}
              animationDuration={360}
              animationEasing="ease-out"
            />
          </BarChart>
        </ResponsiveContainer>
      )}
      accessibleTable={(
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Fonte</th>
              <th scope="col">Projetado</th>
              <th scope="col">Consolidado</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((item) => (
              <tr key={item.id ?? item.label}>
                <th scope="row">{item.label}</th>
                <td>{formatFullCurrency(item.projectedAmount)}</td>
                <td>{formatFullCurrency(item.consolidatedAmount)}</td>
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
  const reducedMotion = usePrefersReducedMotion();
  const chartData = data.map((item) => ({ ...item }));

  if (chartData.length === 0) {
    return <FinancialStatePanel state="empty" title={`Sem dados para ${title}`} />;
  }

  return (
    <FinancialChartFrame
      title={title}
      summary={summary}
      className={cn('financial-chart--revenue-composition', className)}
      height={height}
      mobileHeight={mobileHeight}
      chart={(
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 8, right: 20, bottom: 8, left: 12 }}
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
              dataKey="label"
              axisLine={false}
              tickLine={false}
              width={126}
              tickMargin={8}
              tickFormatter={(value: string) => abbreviateAxisLabel(value, 19)}
            />
            <Tooltip
              cursor={{ fill: 'var(--financial-chart-hover, oklch(var(--muted) / 0.45))' }}
              content={<FinancialChartTooltip valueLabels={{ amount: 'Valor projetado' }} />}
            />
            <Bar
              dataKey="amount"
              name="amount"
              fill={chartColors.projected}
              radius={[0, 6, 6, 0]}
              isAnimationActive={!reducedMotion}
              animationDuration={360}
              animationEasing="ease-out"
            >
              {chartData.map((item, index) => (
                <Cell
                  key={item.id ?? item.label}
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
              <th scope="col">Fonte</th>
              <th scope="col">Valor</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((item) => (
              <tr key={item.id ?? item.label}>
                <th scope="row">{item.label}</th>
                <td>{formatFullCurrency(item.amount)}</td>
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
}

export function CommissionBudgetUtilizationChart({
  data,
  title = 'Utilização do orçamento por comissão',
  summary = 'Comparação entre o teto e o valor orçado de cada comissão, com o percentual de utilização.',
  className,
  height = 440,
  mobileHeight = 340,
}: CommissionBudgetUtilizationChartProps) {
  const reducedMotion = usePrefersReducedMotion();
  const chartData = data.map((item) => ({ ...item }));

  if (chartData.length === 0) {
    return <FinancialStatePanel state="empty" title={`Sem dados para ${title}`} />;
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
              isAnimationActive={!reducedMotion}
              animationDuration={360}
              animationEasing="ease-out"
            />
            <Bar
              dataKey="budgetedAmount"
              name="budgetedAmount"
              fill={chartColors.consolidated}
              radius={[0, 5, 5, 0]}
              isAnimationActive={!reducedMotion}
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
}

export function FundingSourceChart({
  data,
  title = 'Valores registrados por origem',
  summary = 'Comparação dos valores registrados em cada coluna de origem; as colunas não formam uma partição exaustiva do total.',
  className,
  height = 340,
  mobileHeight = 300,
}: FundingSourceChartProps) {
  const reducedMotion = usePrefersReducedMotion();
  const chartData = data.map((item) => ({ ...item }));

  if (chartData.length === 0) {
    return <FinancialStatePanel state="empty" title={`Sem dados para ${title}`} />;
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
              isAnimationActive={!reducedMotion}
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
