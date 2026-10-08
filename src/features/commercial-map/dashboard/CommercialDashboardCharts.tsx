import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { COMMERCIAL_PHASES, STATUS_CONFIG } from '../constants';
import { toCommercialPhase, type CommercialStatus, type CommercialPhase } from '../types';
import {
  formatDashboardArea,
  formatDashboardAreaWithCoverage,
  formatDashboardCurrency,
  formatDashboardInteger,
  formatDashboardPercentage,
} from './commercialDashboardFormatters';
import type { DashboardAggregate } from './commercialDashboardTypes';
import { OverviewInfo } from './CommercialDashboardOverviewInfo';
import { formatDashboardCommercialProgress } from './commercialDashboardProgress';

const AREA_STATUSES = COMMERCIAL_PHASES;
const VALUE_STATUSES = COMMERCIAL_PHASES.filter((status) => status !== 'BLOCKED');

function phaseSummary(aggregate: DashboardAggregate, phase: CommercialPhase) {
  const statuses = (Object.keys(aggregate.byStatus) as CommercialStatus[]).filter((status) =>
    status !== 'UNAVAILABLE' && toCommercialPhase(status) === phase);
  return statuses.reduce((total, status) => {
    const row = aggregate.byStatus[status];
    return {
      lotCount: total.lotCount + row.lotCount,
      areaSqm: total.areaSqm + row.areaSqm,
      value: total.value + row.value,
      areaPendingCount: total.areaPendingCount + row.areaPendingCount,
      pricePendingCount: total.pricePendingCount + row.pricePendingCount,
      pricedLotCount: total.pricedLotCount + row.pricedLotCount,
      lotPercentage: total.lotPercentage + row.lotPercentage,
      areaPercentage: total.areaPercentage + row.areaPercentage,
    };
  }, { lotCount: 0, areaSqm: 0, value: 0, areaPendingCount: 0, pricePendingCount: 0, pricedLotCount: 0, lotPercentage: 0, areaPercentage: 0 });
}

interface ChartProps {
  aggregate: DashboardAggregate;
  highlightedStatus: CommercialStatus | null;
  onHoverStatus: (status: CommercialStatus | null) => void;
  onToggleStatus: (status: CommercialStatus) => void;
  compact?: boolean;
  metric?: 'lots' | 'area';
}

interface LotChartRow {
  status: CommercialPhase;
  name: string;
  areaSqm: number;
  /** Share of commercial lot count — the dashboard's primary metric. */
  percentage: number;
  areaPercentage: number;
  lotCount: number;
}

interface LotChartProps extends ChartProps {
  /** The workspace presentation is opt-in; segment and financial charts keep their layout. */
  variant?: 'default' | 'workspace';
}

function canHover() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: hover)').matches;
}

export function CommercialDashboardLotChart({
  aggregate,
  highlightedStatus,
  onHoverStatus,
  onToggleStatus,
  compact = false,
  metric = 'lots',
  variant = 'default',
}: LotChartProps) {
  const workspace = variant === 'workspace';
  const formatPercentage = workspace ? formatDashboardCommercialProgress : formatDashboardPercentage;
  const soldAreaPending = aggregate.byStatus.SOLD.areaPendingCount;
  const soldPercentage = metric === 'area'
    ? (aggregate.totalAreaSqm > 0 && !(aggregate.soldLots > 0 && soldAreaPending === aggregate.soldLots) ? aggregate.soldAreaPercentage : null)
    : (aggregate.commercialLots > 0 ? aggregate.soldLotPercentage : null);
  const workspaceSummary = metric === 'area'
    ? (soldPercentage === null
      ? (aggregate.totalAreaSqm > 0
        ? 'Percentual da área vendida pendente porque a metragem oficial dos lotes vendidos não está cadastrada.'
        : 'Percentual da área vendida pendente porque não há base de área oficial válida.')
      : `${formatPercentage(soldPercentage)} da área oficial conhecida foi classificada como vendida: ${formatDashboardAreaWithCoverage(aggregate.soldAreaSqm, aggregate.soldLots, soldAreaPending, aggregate.commercialLots)} de ${formatDashboardArea(aggregate.totalAreaSqm)}.${aggregate.lotsWithoutOfficialArea > 0 ? ' Cobertura de área parcial.' : ''}`)
    : (aggregate.commercialLots > 0
      ? `${formatPercentage(soldPercentage)} dos lotes comerciais foram vendidos: ${formatDashboardInteger(aggregate.soldLots)} de ${formatDashboardInteger(aggregate.commercialLots)}.`
      : 'Percentual vendido pendente porque não há lotes comerciais cadastrados.');
  // The four displayed phases group legacy operational states without rewriting them.
  const rows: LotChartRow[] = AREA_STATUSES.flatMap((status) => {
    const summary = phaseSummary(aggregate, status);
    return summary.lotCount > 0 ? [{
      status,
      name: STATUS_CONFIG[status].label,
      areaSqm: summary.areaSqm,
      percentage: summary.lotPercentage,
      areaPercentage: summary.areaPercentage,
      lotCount: summary.lotCount,
    }] : [];
  });

  return (
    <div className={`commercial-dashboard-area-chart${compact ? ' is-compact' : ''}${workspace ? ' commercial-dashboard-area-chart--workspace' : ''}`} data-metric={workspace ? metric : undefined}>
      {workspace && <div className="commercial-dashboard-workspace-chart-info">
        <OverviewInfo label="Informações da distribuição comercial" title="Como ler a distribuição"
          lead={metric === 'area'
            ? 'O gráfico e a lista mostram a área oficial conhecida por situação. O centro indica somente a área classificada como vendida.'
            : 'O gráfico e a lista mostram a quantidade de lotes por situação. O centro indica somente os lotes classificados como vendidos.'}
          facts={[
            ['Base de lotes comerciais', formatDashboardInteger(aggregate.commercialLots)],
            ['Área oficial conhecida', formatDashboardAreaWithCoverage(aggregate.totalAreaSqm, aggregate.commercialLots, aggregate.lotsWithoutOfficialArea, aggregate.commercialLots)],
            ['Lotes sem área oficial', formatDashboardInteger(aggregate.lotsWithoutOfficialArea)],
            ['Indisponíveis fora da base', formatDashboardInteger(aggregate.unavailableLots)],
          ]}
          note={<>{aggregate.lotsWithoutOfficialArea > 0 && 'Cobertura parcial: percentuais de área usam somente a metragem oficial conhecida; área ausente não equivale a zero. '}
            {aggregate.commercialLots === 0 && 'Não há base comercial para calcular percentuais. '}
            {metric === 'area' && aggregate.totalAreaSqm <= 0 && 'Não há área oficial positiva para calcular percentuais de área. '}
            Bloqueados participam da base comercial. Indisponíveis permanecem na planta e ficam fora dos percentuais.
            {' '}Selecione uma situação para destacá-la na planta, preservando todos os espaços e totais.</>} />
      </div>}
      {rows.length > 0 && (metric === 'lots' || aggregate.totalAreaSqm > 0) ? (
        <div className="commercial-dashboard-donut-layout">
          <div className="commercial-dashboard-donut" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey={metric === 'area' ? 'areaSqm' : 'lotCount'}
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
                    const row = active ? payload?.[0]?.payload as LotChartRow | undefined : undefined;
                    if (!row) return null;
                    const summary = phaseSummary(aggregate, row.status);
                    const areaValue = formatDashboardAreaWithCoverage(row.areaSqm, row.lotCount, summary.areaPendingCount, aggregate.commercialLots);
                    if (workspace) return <div className="commercial-dashboard-chart-tooltip">
                      <strong>{row.name}</strong>
                      <span>{metric === 'area' ? areaValue : `${formatDashboardInteger(row.lotCount)} ${row.lotCount === 1 ? 'lote' : 'lotes'}`} · {formatPercentage(metric === 'area' ? row.areaPercentage : row.percentage)}</span>
                      {metric === 'area' && summary.areaPendingCount > 0 && <small>{formatDashboardInteger(summary.areaPendingCount)} sem área oficial · subtotal conhecido</small>}
                    </div>;
                    return <div className="commercial-dashboard-chart-tooltip">
                      <strong>{row.name}</strong>
                      <span>{formatDashboardInteger(row.lotCount)} {row.lotCount === 1 ? 'lote' : 'lotes'} · {formatDashboardPercentage(metric === 'area' ? row.areaPercentage : row.percentage)} {metric === 'area' ? 'da área' : 'dos lotes'}</span>
                      <small>{formatDashboardAreaWithCoverage(row.areaSqm, row.lotCount, phaseSummary(aggregate, row.status).areaPendingCount, aggregate.commercialLots)}</small>
                    </div>;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="commercial-dashboard-donut-center">
              <strong>{workspace ? formatPercentage(soldPercentage) : formatDashboardPercentage(metric === 'area' ? aggregate.soldAreaPercentage : aggregate.soldLotPercentage)}</strong>
              <span>{metric === 'area' ? 'área vendida' : 'lotes vendidos'}</span>
            </div>
          </div>
          {!workspace && <div className="commercial-dashboard-donut-detail">
            <strong>{formatDashboardInteger(aggregate.soldLots)} de {formatDashboardInteger(aggregate.commercialLots)} lotes</strong>
            <span>{aggregate.totalAreaSqm > 0
              ? `${formatDashboardPercentage(aggregate.soldAreaPercentage)} da área · ${formatDashboardArea(aggregate.soldAreaSqm)} de ${formatDashboardArea(aggregate.totalAreaSqm)}`
              : 'Área oficial pendente de cadastro'}</span>
          </div>}
        </div>
      ) : (
        <div className="commercial-dashboard-chart-empty">{metric === 'area' && aggregate.commercialLots > 0 ? 'Área oficial pendente de cadastro para compor o gráfico.' : 'Ainda não há lotes comerciais cadastrados para compor o gráfico.'}</div>
      )}

      <div className="commercial-dashboard-status-list" aria-label="Distribuição comercial por quantidade de lotes e área">
        {workspace ? <div className="commercial-dashboard-legend-heading">
          <span aria-hidden="true">Situação</span>
          <span aria-hidden="true">{metric === 'area' ? 'Área oficial' : 'Lotes'}</span><span aria-hidden="true">%</span>
        </div> : <div className="commercial-dashboard-legend-heading" aria-hidden="true"><span>Situação</span><span>Lotes</span><span>Área oficial</span><span>% {metric === 'area' ? 'área' : 'lotes'}</span></div>}
        {AREA_STATUSES.map((status) => {
          const summary = phaseSummary(aggregate, status);
          const areaValue = formatDashboardAreaWithCoverage(summary.areaSqm, summary.lotCount, summary.areaPendingCount, aggregate.commercialLots);
          const selectedPercentage = metric === 'area'
            ? (aggregate.totalAreaSqm > 0 && !(summary.lotCount > 0 && summary.areaPendingCount === summary.lotCount) ? summary.areaPercentage : null)
            : (aggregate.commercialLots > 0 ? summary.lotPercentage : null);
          const selectedValue = metric === 'area' ? areaValue : formatDashboardInteger(summary.lotCount);
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
            aria-label={workspace
              ? `${STATUS_CONFIG[status].label}: ${selectedValue}${metric === 'lots' ? ' lotes' : ''}, ${selectedPercentage === null ? 'sem base de cálculo' : `${formatPercentage(selectedPercentage)} ${metric === 'area' ? 'da área oficial conhecida' : 'dos lotes comerciais'}`}${summary.areaPendingCount ? `, ${summary.areaPendingCount} sem área oficial` : ''}`
              : `${STATUS_CONFIG[status].label}: ${formatDashboardInteger(summary.lotCount)} lotes, ${aggregate.commercialLots > 0 ? formatDashboardPercentage(summary.lotPercentage) : 'percentual pendente'} dos lotes, ${formatDashboardAreaWithCoverage(summary.areaSqm, summary.lotCount, summary.areaPendingCount, aggregate.commercialLots)}, ${aggregate.totalAreaSqm > 0 ? formatDashboardPercentage(summary.areaPercentage) : 'percentual pendente'} da área${summary.areaPendingCount ? `, ${summary.areaPendingCount} sem área oficial` : ''}`}
          >
            <i style={{ backgroundColor: STATUS_CONFIG[status].color }} aria-hidden="true" />
            <span>{STATUS_CONFIG[status].label}</span>
            {workspace ? <><strong className="commercial-dashboard-workspace-legend-value">{selectedValue}</strong>
              <small>{formatPercentage(selectedPercentage)}</small></> : <><strong>{formatDashboardInteger(summary.lotCount)}</strong>
            <span className="commercial-dashboard-legend-area">{formatDashboardAreaWithCoverage(summary.areaSqm, summary.lotCount, summary.areaPendingCount, aggregate.commercialLots)}
              {summary.areaPendingCount > 0 && <small>{summary.areaPendingCount} sem área</small>}
            </span>
            <small>{metric === 'area' ? (aggregate.totalAreaSqm > 0 ? formatDashboardPercentage(summary.areaPercentage) : '—') : (aggregate.commercialLots > 0 ? formatDashboardPercentage(summary.lotPercentage) : '—')}</small></>}
          </button>;
        })}
        {aggregate.unavailableLots > 0 && <button type="button" className={`commercial-dashboard-legend-unavailable${highlightedStatus === 'UNAVAILABLE' ? ' is-highlighted' : ''}`}
          aria-pressed={highlightedStatus === 'UNAVAILABLE'} onClick={() => onToggleStatus('UNAVAILABLE')}
          onMouseEnter={() => { if (canHover()) onHoverStatus('UNAVAILABLE'); }} onMouseLeave={() => { if (canHover()) onHoverStatus(null); }}
          onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) onHoverStatus('UNAVAILABLE'); }} onBlur={() => onHoverStatus(null)}
          aria-label={workspace
            ? `Indisponível: ${metric === 'area' ? formatDashboardAreaWithCoverage(aggregate.unavailableAreaSqm, aggregate.unavailableLots, aggregate.byStatus.UNAVAILABLE.areaPendingCount, aggregate.totalLots) : `${formatDashboardInteger(aggregate.unavailableLots)} lotes`}, fora dos percentuais comerciais`
            : `Indisponível: ${formatDashboardInteger(aggregate.unavailableLots)} lotes, fora dos percentuais comerciais, ${formatDashboardAreaWithCoverage(aggregate.unavailableAreaSqm, aggregate.unavailableLots, aggregate.byStatus.UNAVAILABLE.areaPendingCount, aggregate.totalLots)}`}>
          <i style={{ backgroundColor: STATUS_CONFIG.UNAVAILABLE.color }} aria-hidden="true" /><span>Indisponível</span>
          {workspace ? <strong className="commercial-dashboard-workspace-legend-value">{metric === 'area' ? formatDashboardAreaWithCoverage(aggregate.unavailableAreaSqm, aggregate.unavailableLots, aggregate.byStatus.UNAVAILABLE.areaPendingCount, aggregate.totalLots) : formatDashboardInteger(aggregate.unavailableLots)}</strong>
            : <><strong>{formatDashboardInteger(aggregate.unavailableLots)}</strong>
              <span className="commercial-dashboard-legend-area">{formatDashboardAreaWithCoverage(aggregate.unavailableAreaSqm, aggregate.unavailableLots, aggregate.byStatus.UNAVAILABLE.areaPendingCount, aggregate.totalLots)}</span></>}<small>Fora do %</small>
        </button>}
      </div>
      {!workspace && aggregate.byStatus.UNAVAILABLE.lotCount > 0 && <p className="commercial-dashboard-chart-exclusion">
        {formatDashboardInteger(aggregate.byStatus.UNAVAILABLE.lotCount)} {aggregate.byStatus.UNAVAILABLE.lotCount === 1 ? 'espaço fora da área comercial ativa' : 'espaços fora da área comercial ativa'}
        {aggregate.unavailableAreaSqm > 0 ? ` · ${formatDashboardArea(aggregate.unavailableAreaSqm)}` : ''}.
      </p>}
      <p className="commercial-dashboard-screen-reader-only">
        {workspace ? workspaceSummary : aggregate.commercialLots > 0
          ? `${formatDashboardPercentage(aggregate.soldLotPercentage)} dos lotes comerciais foram vendidos: ${formatDashboardInteger(aggregate.soldLots)} de ${formatDashboardInteger(aggregate.commercialLots)}.`
          : 'Percentual vendido pendente porque não há lotes comerciais cadastrados.'}
      </p>
    </div>
  );
}

/** @deprecated Nome anterior mantido para importações existentes. */
export const CommercialDashboardAreaChart = CommercialDashboardLotChart;

export function CommercialDashboardValueChart({
  aggregate,
  highlightedStatus,
  onHoverStatus,
  onToggleStatus,
}: Omit<ChartProps, 'compact'>) {
  const rows = VALUE_STATUSES.flatMap((status) => {
    const summary = phaseSummary(aggregate, status);
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
