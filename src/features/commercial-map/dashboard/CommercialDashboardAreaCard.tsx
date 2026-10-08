import type { CSSProperties } from 'react';
import type { DashboardAggregate } from './commercialDashboardTypes';
import { formatDashboardArea, formatDashboardAreaWithCoverage, formatDashboardInteger } from './commercialDashboardFormatters';
import { AreaMeasureGlyph } from './CommercialDashboardOverviewIcons';
import { OverviewInfo } from './CommercialDashboardOverviewInfo';
import { buildDashboardCommercialProgress, formatDashboardCommercialProgress } from './commercialDashboardProgress';

/** Presentation of the existing official-area snapshot; never estimates missing areas. */
export function CommercialDashboardAreaCard({ aggregate }: { aggregate: DashboardAggregate }) {
  const transactedLots = aggregate.saleOpenLots + aggregate.soldLots;
  const transactedPending = aggregate.byStatus.SALE_OPEN.areaPendingCount + aggregate.byStatus.SOLD.areaPendingCount;
  const numeratorAbsent = transactedLots > 0 && transactedPending === transactedLots;
  const progress = buildDashboardCommercialProgress({
    total: numeratorAbsent ? 0 : aggregate.totalAreaSqm,
    saleOpen: aggregate.saleOpenAreaSqm,
    sold: aggregate.soldAreaSqm,
  });
  const areaLabel = formatDashboardAreaWithCoverage(aggregate.totalAreaSqm, aggregate.commercialLots,
    aggregate.lotsWithoutOfficialArea, aggregate.commercialLots);
  const area = /^(\S+)\s+m²$/u.exec(areaLabel);
  const partial = aggregate.lotsWithoutOfficialArea > 0 && aggregate.lotsWithoutOfficialArea < aggregate.commercialLots;
  const percentageLabel = formatDashboardCommercialProgress(progress.percentage);
  const statusArea = (status: 'SALE_OPEN' | 'SOLD') => {
    const row = aggregate.byStatus[status];
    return formatDashboardAreaWithCoverage(row.areaSqm, row.lotCount, row.areaPendingCount, aggregate.commercialLots);
  };
  return <article className="commercial-dashboard-area-card" aria-label="Área comercial oficial">
    <header className="commercial-dashboard-area-card__heading">
      <span className="commercial-dashboard-area-card__icon" aria-hidden="true"><AreaMeasureGlyph /></span>
      <span className="commercial-dashboard-area-card__label">Área comercial</span>
      {partial && <span className="commercial-dashboard-area-card__qualifier">Parcial</span>}
      <OverviewInfo label="Informações sobre a área comercial" title="Área comercial"
        lead="Soma das áreas oficiais válidas do inventário comercial. Espaços indisponíveis ficam fora."
        facts={[
          ['Área oficial total', areaLabel],
          ['Em andamento', statusArea('SALE_OPEN')],
          ['Confirmada', statusArea('SOLD')],
          ['Área comercializada conhecida', numeratorAbsent ? 'Área pendente' : formatDashboardArea(aggregate.saleOpenAreaSqm + aggregate.soldAreaSqm)],
          ['Participação por metragem', progress.percentage === null ? 'Sem base de cálculo' : `${percentageLabel}${partial ? ' · cobertura parcial' : ''}`],
          ['Cobertura', aggregate.lotsWithoutOfficialArea ? `${formatDashboardInteger(aggregate.lotsWithoutOfficialArea)} sem área oficial` : 'Área oficial cadastrada'],
          ...(transactedPending ? [['Vendas sem metragem', formatDashboardInteger(transactedPending)] as const] : []),
        ]}
        note={progress.inconsistent ? 'A área comercializada supera a base oficial. A barra é limitada visualmente a 100%; o percentual informado preserva a inconsistência.'
          : 'Área em andamento + área confirmada ÷ área oficial total. Cobertura parcial usa somente as áreas oficiais conhecidas; não estima áreas ausentes nem utiliza valores financeiros.'} />
    </header>
    <strong key={areaLabel} className="commercial-dashboard-area-card__value">
      {area ? <>{area[1]}<span> m²</span></> : areaLabel}
    </strong>
    <div className="commercial-dashboard-area-card__progress-label">
      <span>Área comercializada</span>
      <span key={percentageLabel} className="commercial-dashboard-area-card__percentage">{progress.percentage === null ? 'Sem base de cálculo' : percentageLabel}</span>
    </div>
    <div className="commercial-dashboard-area-card__track" role="progressbar" aria-label="Área comercializada por metragem"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percentage === null ? undefined : Math.max(0, Math.min(100, progress.percentage))}
      aria-valuetext={progress.percentage === null ? 'Sem base de cálculo' : `${percentageLabel}${partial ? ', cobertura parcial' : ''}`}
      data-available={progress.percentage !== null} style={{ '--area-open': `${progress.saleOpenWidth}%`, '--area-sold': `${progress.soldWidth}%` } as CSSProperties}>
      <span className="commercial-dashboard-area-card__fill--open" />
      <span className="commercial-dashboard-area-card__fill--sold" />
    </div>
    <div className="commercial-dashboard-area-card__legend" aria-hidden="true"><span>Em andamento</span><span>Confirmada</span></div>
    {progress.inconsistent && <small className="commercial-dashboard-area-card__warning">Área comercializada acima da base oficial</small>}
  </article>;
}
