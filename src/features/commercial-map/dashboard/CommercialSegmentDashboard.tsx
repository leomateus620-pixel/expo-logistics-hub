import { type CSSProperties } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { CommercialMiniMap } from './CommercialMiniMap';
import { CommercialDashboardAreaChart, CommercialDashboardValueChart } from './CommercialDashboardCharts';
import { useDashboardStatusHighlight } from './useDashboardStatusHighlight';
import {
  formatDashboardAreaWithCoverage,
  formatDashboardCurrency,
  formatDashboardInteger,
  formatDashboardPercentage,
} from './commercialDashboardFormatters';
import type { CommercialSegmentDashboardSnapshot } from './commercialDashboardTypes';

interface CommercialSegmentDashboardProps {
  snapshot: CommercialSegmentDashboardSnapshot;
  onViewLot: (entityId: string) => void;
}

function formattedKnownValue(value: number, pricedLotCount: number) {
  return pricedLotCount > 0 ? formatDashboardCurrency(value, true) : '—';
}

export function CommercialSegmentDashboard({ snapshot, onViewLot }: CommercialSegmentDashboardProps) {
  const { highlightedStatus, onHoverStatus, onToggleStatus } = useDashboardStatusHighlight();
  const segmentStyle = {
    '--dashboard-segment-accent': snapshot.segment.palette.surface,
    '--dashboard-segment-edge': snapshot.segment.palette.edge,
    '--dashboard-segment-soft': snapshot.segment.palette.accent,
  } as CSSProperties;

  return <section
    className="commercial-dashboard-segment"
    aria-labelledby={`commercial-dashboard-segment-${snapshot.segmentId}`}
    style={segmentStyle}
  >
    <header className="commercial-dashboard-segment-header">
      <div>
        <span className="commercial-dashboard-eyebrow">Segmento comercial</span>
        <h2 id={`commercial-dashboard-segment-${snapshot.segmentId}`}>{snapshot.segment.name}</h2>
      </div>
      <div className="commercial-dashboard-segment-lead" aria-label={snapshot.totalAreaSqm > 0
        ? `${formatDashboardPercentage(snapshot.soldAreaPercentage)} da área do segmento vendida`
        : 'Percentual pendente de metragem oficial'}>
        <strong>{snapshot.totalAreaSqm > 0 ? formatDashboardPercentage(snapshot.soldAreaPercentage) : '—'}</strong>
        <span>{snapshot.totalAreaSqm > 0 ? 'da área vendida' : 'área pendente'}</span>
      </div>
    </header>

    {snapshot.totalLots === 0 ? <div className="commercial-dashboard-segment-empty">
      Nenhum espaço comercial cadastrado neste segmento.
    </div> : <>
      <div className="commercial-dashboard-segment-counts" aria-label={`Situação de ${snapshot.segment.name}`}>
        <span><strong>{formatDashboardInteger(snapshot.totalLots)}</strong> lotes</span>
        <span><strong>{formatDashboardInteger(snapshot.soldLots)}</strong> vendidos</span>
        <span><strong>{formatDashboardInteger(snapshot.availableLots)}</strong> disponíveis</span>
        <span><strong>{formatDashboardInteger(snapshot.reservedLots)}</strong> reservados</span>
        <span><strong>{formatDashboardInteger(snapshot.negotiationLots)}</strong> em negociação</span>
      </div>

      <div className="commercial-dashboard-segment-grid">
        <div className="commercial-dashboard-segment-analysis">
          <div className="commercial-dashboard-segment-area-summary">
            <div><span>Área comercial</span><strong>{formatDashboardAreaWithCoverage(snapshot.totalAreaSqm, snapshot.commercialLots, snapshot.lotsWithoutOfficialArea, snapshot.commercialLots)}</strong></div>
            <div><span>Área vendida</span><strong>{formatDashboardAreaWithCoverage(snapshot.soldAreaSqm, snapshot.soldLots, snapshot.byStatus.SOLD.areaPendingCount, snapshot.commercialLots)}</strong></div>
            <div><span>Área disponível</span><strong>{formatDashboardAreaWithCoverage(snapshot.availableAreaSqm, snapshot.availableLots, snapshot.byStatus.AVAILABLE.areaPendingCount, snapshot.commercialLots)}</strong></div>
          </div>
          <div className="commercial-dashboard-segment-chart">
            <div className="commercial-dashboard-subheading"><strong>Ocupação por área</strong><span>Base: metragem oficial cadastrada</span></div>
            <CommercialDashboardAreaChart
              aggregate={snapshot}
              highlightedStatus={highlightedStatus}
              onHoverStatus={onHoverStatus}
              onToggleStatus={onToggleStatus}
              compact
            />
          </div>
          <CommercialDashboardValueChart
            aggregate={snapshot}
            highlightedStatus={highlightedStatus}
            onHoverStatus={onHoverStatus}
            onToggleStatus={onToggleStatus}
          />
          <div className="commercial-dashboard-segment-financials">
            <div>
              <span>Valor comercial vendido</span>
              <strong title={snapshot.byStatus.SOLD.pricedLotCount > 0 ? formatDashboardCurrency(snapshot.soldValue) : undefined}>
                {formattedKnownValue(snapshot.soldValue, snapshot.byStatus.SOLD.pricedLotCount)}
              </strong>
            </div>
            <div>
              <span>Potencial disponível</span>
              <strong title={snapshot.byStatus.AVAILABLE.pricedLotCount > 0 ? formatDashboardCurrency(snapshot.availableValue) : undefined}>
                {formattedKnownValue(snapshot.availableValue, snapshot.byStatus.AVAILABLE.pricedLotCount)}
              </strong>
            </div>
          </div>
          {snapshot.lotsWithoutOfficialArea > 0 && <p className="commercial-dashboard-data-note">
            {formatDashboardInteger(snapshot.lotsWithoutOfficialArea)} {snapshot.lotsWithoutOfficialArea === 1 ? 'lote sem metragem oficial' : 'lotes sem metragem oficial'}.
          </p>}
        </div>
        <div className="commercial-dashboard-segment-map">
          <div className="commercial-dashboard-subheading">
            <strong>Leitura espacial</strong>
            <span>Toque em um espaço para explorar <ArrowUpRight aria-hidden="true" /></span>
          </div>
          <CommercialMiniMap
            items={snapshot.records}
            title={`Mapa de ${snapshot.segment.name}`}
            highlightedStatus={highlightedStatus}
            onViewLot={onViewLot}
          />
        </div>
      </div>
    </>}
  </section>;
}
