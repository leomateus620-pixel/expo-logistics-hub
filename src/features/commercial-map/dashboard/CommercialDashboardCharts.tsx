import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { STATUS_CONFIG } from '../constants';
import type { CommercialStatus } from '../types';
import {
  formatDashboardArea,
  formatDashboardAreaWithCoverage,
  formatDashboardCurrency,
  formatDashboardInteger,
  formatDashboardPercentage,
} from './commercialDashboardFormatters';
import type { DashboardAggregate } from './commercialDashboardTypes';

const AREA_STATUSES: readonly CommercialStatus[] = [
  'SOLD', 'AVAILABLE', 'RESERVED', 'IN_NEGOTIATION', 'BLOCKED',
];

const VALUE_STATUSES: readonly CommercialStatus[] = [
  'SOLD', 'AVAILABLE', 'RESERVED', 'IN_NEGOTIATION',
];

interface ChartProps {
  aggregate: DashboardAggregate;
  highlightedStatus: CommercialStatus | null;
  onHoverStatus: (status: CommercialStatus | null) => void;
  onToggleStatus: (status: CommercialStatus) => void;
  compact?: boolean;
}

interface AreaChartRow {
  status: CommercialStatus;
  name: string;
  areaSqm: number;
  percentage: number;
  lotCount: number;
}

function canHover() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: hover)').matches;
}

export function CommercialDashboardAreaChart({
  aggregate,
  highlightedStatus,
  onHoverStatus,
  onToggleStatus,
  compact = false,
}: ChartProps) {
  // Five fixed status buckets come from the single analytics snapshot.
  const rows: AreaChartRow[] = AREA_STATUSES.flatMap((status) => {
    const summary = aggregate.byStatus[status];
    return summary.areaSqm > 0 ? [{
      status,
      name: STATUS_CONFIG[status].label,
      areaSqm: summary.areaSqm,
      percentage: summary.areaPercentage,
      lotCount: summary.lotCount,
    }] : [];
  });

  return (
    <div className={`commercial-dashboard-area-chart${compact ? ' is-compact' : ''}`}>
      {rows.length > 0 ? (
        <div className="commercial-dashboard-donut-layout">
          <div className="commercial-dashboard-donut" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="areaSqm"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="71%"
                  outerRadius="91%"
                  paddingAngle={1.3}
                  stroke="#f8faf7"
                  strokeWidth={2}
                  isAnimationActive={false}
                  onMouseEnter={(_, index) => { if (canHover()) onHoverStatus(rows[index]?.status ?? null); }}
                  onMouseLeave={() => { if (canHover()) onHoverStatus(null); }}
                  onClick={(_, index) => {
                    const status = rows[index]?.status ?? null;
                    if (status) onToggleStatus(status);
                  }}
                >
                  {rows.map((row) => (
                    <Cell
                      key={row.status}
                      fill={STATUS_CONFIG[row.status].color}
                      fillOpacity={highlightedStatus && highlightedStatus !== row.status ? 0.23 : 1}
                    />
                  ))}
                </Pie>
                <Tooltip
                  active={canHover() ? undefined : false}
                  content={({ active, payload }) => {
                    const row = active ? payload?.[0]?.payload as AreaChartRow | undefined : undefined;
                    if (!row) return null;
                    return <div className="commercial-dashboard-chart-tooltip">
                      <strong>{row.name}</strong>
                      <span>{formatDashboardArea(row.areaSqm)} · {formatDashboardPercentage(row.percentage)}</span>
                      <small>{formatDashboardInteger(row.lotCount)} {row.lotCount === 1 ? 'lote' : 'lotes'}</small>
                    </div>;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="commercial-dashboard-donut-center">
              <strong>{formatDashboardPercentage(aggregate.soldAreaPercentage)}</strong>
              <span>área vendida</span>
            </div>
          </div>
          <div className="commercial-dashboard-donut-detail">
            <strong>{formatDashboardArea(aggregate.soldAreaSqm)}</strong>
            <span>vendidos de {formatDashboardArea(aggregate.totalAreaSqm)} cadastrados</span>
          </div>
        </div>
      ) : (
        <div className="commercial-dashboard-chart-empty">Ainda não há metragem oficial válida para compor o gráfico de área.</div>
      )}

      <div className="commercial-dashboard-status-list" aria-label="Distribuição comercial por área e quantidade">
        {AREA_STATUSES.map((status) => {
          const summary = aggregate.byStatus[status];
          return <button
            key={status}
            type="button"
            className={highlightedStatus === status ? 'is-highlighted' : ''}
            onMouseEnter={() => { if (canHover()) onHoverStatus(status); }}
            onMouseLeave={() => { if (canHover()) onHoverStatus(null); }}
            onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) onHoverStatus(status); }}
            onBlur={() => onHoverStatus(null)}
            onClick={() => onToggleStatus(status)}
            aria-pressed={highlightedStatus === status}
            aria-label={`${STATUS_CONFIG[status].label}: ${formatDashboardAreaWithCoverage(summary.areaSqm, summary.lotCount, summary.areaPendingCount, aggregate.commercialLots)}, ${aggregate.totalAreaSqm > 0 ? formatDashboardPercentage(summary.areaPercentage) : 'percentual de área pendente'}, ${formatDashboardInteger(summary.lotCount)} lotes`}
          >
            <i style={{ backgroundColor: STATUS_CONFIG[status].color }} aria-hidden="true" />
            <span>{STATUS_CONFIG[status].label}</span>
            <strong>{aggregate.totalAreaSqm > 0 ? formatDashboardPercentage(summary.areaPercentage) : '—'}</strong>
            <small>{formatDashboardInteger(summary.lotCount)}</small>
          </button>;
        })}
      </div>
      {aggregate.byStatus.UNAVAILABLE.lotCount > 0 && <p className="commercial-dashboard-chart-exclusion">
        {formatDashboardInteger(aggregate.byStatus.UNAVAILABLE.lotCount)} {aggregate.byStatus.UNAVAILABLE.lotCount === 1 ? 'espaço indisponível' : 'espaços indisponíveis'} fora da área comercial ativa
        {aggregate.unavailableAreaSqm > 0 ? ` · ${formatDashboardArea(aggregate.unavailableAreaSqm)}` : ''}.
      </p>}
      <p className="commercial-dashboard-screen-reader-only">
        {aggregate.totalAreaSqm > 0
          ? `${formatDashboardPercentage(aggregate.soldAreaPercentage)} da área comercial cadastrada foi vendida. A área total considerada é ${formatDashboardArea(aggregate.totalAreaSqm)}.`
          : 'Percentual vendido pendente porque não há metragem oficial válida.'}
      </p>
    </div>
  );
}

export function CommercialDashboardValueChart({
  aggregate,
  highlightedStatus,
  onHoverStatus,
  onToggleStatus,
}: Omit<ChartProps, 'compact'>) {
  const rows = VALUE_STATUSES.flatMap((status) => {
    const summary = aggregate.byStatus[status];
    return summary.pricedLotCount > 0 ? [{ status, summary }] : [];
  });
  const maxValue = Math.max(...rows.map((row) => row.summary.value), 0);

  return <div className="commercial-dashboard-value-chart">
    <div className="commercial-dashboard-subheading">
      <strong>Distribuição do valor comercial</strong>
      <span>Valores cadastrais, não receita recebida</span>
    </div>
    {rows.length > 0 ? <div className="commercial-dashboard-value-bars">
      {rows.map(({ status, summary }) => <button
        key={status}
        type="button"
        className={highlightedStatus === status ? 'is-highlighted' : ''}
        onMouseEnter={() => { if (canHover()) onHoverStatus(status); }}
        onMouseLeave={() => { if (canHover()) onHoverStatus(null); }}
        onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) onHoverStatus(status); }}
        onBlur={() => onHoverStatus(null)}
        onClick={() => onToggleStatus(status)}
        aria-pressed={highlightedStatus === status}
        aria-label={`${STATUS_CONFIG[status].label}: ${formatDashboardCurrency(summary.value)} em ${formatDashboardInteger(summary.pricedLotCount)} lotes com valor`}
      >
        <span className="commercial-dashboard-value-bar-label"><i style={{ backgroundColor: STATUS_CONFIG[status].color }} aria-hidden="true" />{STATUS_CONFIG[status].label}</span>
        <span className="commercial-dashboard-value-bar-track"><i style={{ width: `${maxValue > 0 ? 100 * summary.value / maxValue : 0}%`, backgroundColor: STATUS_CONFIG[status].color }} /></span>
        <strong title={formatDashboardCurrency(summary.value)}>{formatDashboardCurrency(summary.value, true)}</strong>
      </button>)}
    </div> : <p className="commercial-dashboard-value-empty">Nenhum lote possui valor comercial definido para esta distribuição.</p>}
    {aggregate.lotsWithoutPrice > 0 && <p className="commercial-dashboard-data-note">
      {formatDashboardInteger(aggregate.lotsWithoutPrice)} {aggregate.lotsWithoutPrice === 1 ? 'espaço sem valor definido' : 'espaços sem valor definido'}.
    </p>}
  </div>;
}
