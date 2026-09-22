import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { ChartNoAxesCombined, Clock3, RefreshCw, X } from 'lucide-react';
import type { CommercialMapData } from '../types';
import { CommercialMiniMap } from './CommercialMiniMap';
import { CommercialDashboardAreaChart, CommercialDashboardValueChart } from './CommercialDashboardCharts';
import { CommercialDashboardComparison } from './CommercialDashboardComparison';
import { CommercialSegmentDashboard } from './CommercialSegmentDashboard';
import { buildCommercialDashboardSnapshot } from './commercialDashboardAnalytics';
import { useDashboardStatusHighlight } from './useDashboardStatusHighlight';
import {
  formatDashboardArea,
  formatDashboardAreaWithCoverage,
  formatDashboardCurrency,
  formatDashboardInteger,
  formatDashboardPercentage,
} from './commercialDashboardFormatters';
import './commercial-dashboard.css';

export interface CommercialDashboardProps {
  data: Pick<CommercialMapData, 'entities' | 'lots'>;
  dataUpdatedAt: number;
  isFetching: boolean;
  onClose: () => void;
  onViewLot: (entityId: string) => void;
}

function Kpi({ label, value, detail, progress }: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  progress?: number | null;
}) {
  return <article className="commercial-dashboard-kpi">
    <span>{label}</span>
    <strong>{value}</strong>
    {detail && <small>{detail}</small>}
    {progress != null && <div className="commercial-dashboard-kpi-progress" aria-hidden="true">
      <i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
    </div>}
  </article>;
}

function displayedValue(value: number, lotCount: number, pricedLotCount: number): string {
  if (lotCount === 0 || pricedLotCount === 0) return '—';
  return formatDashboardCurrency(value, true);
}

export function CommercialDashboard({ data, dataUpdatedAt, isFetching, onClose, onViewLot }: CommercialDashboardProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const { highlightedStatus, onHoverStatus, onToggleStatus } = useDashboardStatusHighlight();
  const snapshot = useMemo(
    () => buildCommercialDashboardSnapshot({ entities: data.entities, lots: data.lots }),
    [data.entities, data.lots],
  );
  const { overall } = snapshot;
  const pendingLotCount = overall.availableLots + overall.reservedLots + overall.negotiationLots;
  const pendingPricedLotCount = overall.byStatus.AVAILABLE.pricedLotCount
    + overall.byStatus.RESERVED.pricedLotCount
    + overall.byStatus.IN_NEGOTIATION.pricedLotCount;
  const pendingUnpricedLotCount = pendingLotCount - pendingPricedLotCount;
  const updatedAtLabel = dataUpdatedAt > 0 && Number.isFinite(dataUpdatedAt)
    ? `Atualizado às ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(dataUpdatedAt)}`
    : 'Sincronização pendente';

  useEffect(() => { closeButtonRef.current?.focus({ preventScroll: true }); }, []);

  return <div className="commercial-dashboard">
    <header className="commercial-dashboard-header">
      <div className="commercial-dashboard-header-title">
        <div className="commercial-dashboard-mark" aria-hidden="true"><ChartNoAxesCombined /></div>
        <div>
          <span className="commercial-dashboard-eyebrow">Gestão comercial · Fenasoja 2028</span>
          <h1 id="commercial-dashboard-title">Dashboard Comercial</h1>
          <p>Acompanhamento de comercialização dos espaços — Fenasoja 2028</p>
        </div>
      </div>
      <div className="commercial-dashboard-header-actions">
        <span className="commercial-dashboard-sync" role="status">
          {isFetching ? <RefreshCw className="is-spinning" aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
          <span>{isFetching ? 'Atualizando · ' : ''}{updatedAtLabel}</span>
        </span>
        <button type="button" className="commercial-dashboard-close" onClick={onClose} ref={closeButtonRef} aria-label="Fechar Dashboard Comercial">
          <X aria-hidden="true" /><span>Fechar</span>
        </button>
      </div>
    </header>

    <main className="commercial-dashboard-content">
      <section className="commercial-dashboard-kpis" aria-label="Indicadores comerciais principais">
        <Kpi
          label="Área comercial cadastrada"
          value={formatDashboardAreaWithCoverage(overall.totalAreaSqm, overall.commercialLots, overall.lotsWithoutOfficialArea, overall.commercialLots)}
          detail={overall.commercialLots === 0 ? 'Nenhum espaço comercial cadastrado' : 'Metragem oficial dos espaços em oferta'}
        />
        <Kpi
          label="Área vendida"
          value={formatDashboardAreaWithCoverage(overall.soldAreaSqm, overall.soldLots, overall.byStatus.SOLD.areaPendingCount, overall.commercialLots)}
          detail={overall.totalAreaSqm > 0 ? `${formatDashboardPercentage(overall.soldAreaPercentage)} do total comercial` : 'Percentual pendente de metragem oficial'}
          progress={overall.totalAreaSqm > 0 ? overall.soldAreaPercentage : null}
        />
        <Kpi
          label="Área disponível"
          value={formatDashboardAreaWithCoverage(overall.availableAreaSqm, overall.availableLots, overall.byStatus.AVAILABLE.areaPendingCount, overall.commercialLots)}
          detail={overall.totalAreaSqm > 0 ? `${formatDashboardPercentage(overall.byStatus.AVAILABLE.areaPercentage)} do total comercial` : 'Percentual pendente de metragem oficial'}
          progress={overall.totalAreaSqm > 0 ? overall.byStatus.AVAILABLE.areaPercentage : null}
        />
        <Kpi
          label="Lotes vendidos"
          value={<>{formatDashboardInteger(overall.soldLots)} <em>/ {formatDashboardInteger(overall.commercialLots)}</em></>}
          detail="Do inventário comercial ativo"
          progress={overall.commercialLots > 0 ? overall.soldLotPercentage : null}
        />
        <Kpi
          label="Valor comercial dos lotes vendidos"
          value={displayedValue(overall.soldValue, overall.soldLots, overall.byStatus.SOLD.pricedLotCount)}
          detail={overall.byStatus.SOLD.pricedLotCount === 0
            ? 'Nenhum valor vendido cadastrado'
            : overall.byStatus.SOLD.pricePendingCount > 0
              ? `Subtotal cadastrado · ${formatDashboardInteger(overall.byStatus.SOLD.pricePendingCount)} sem preço`
              : 'Valor cadastrado, não receita recebida'}
        />
        <Kpi
          label="Potencial comercial pendente"
          value={displayedValue(overall.pendingValue, pendingLotCount, pendingPricedLotCount)}
          detail={pendingPricedLotCount === 0
            ? 'Nenhum valor pendente cadastrado'
            : pendingUnpricedLotCount > 0
              ? `Subtotal cadastrado · ${formatDashboardInteger(pendingUnpricedLotCount)} sem preço`
              : 'Disponível, reservado e em negociação'}
        />
      </section>

      {(overall.lotsWithoutOfficialArea > 0 || overall.lotsWithoutPrice > 0 || snapshot.unclassifiedLots > 0) && <div className="commercial-dashboard-integrity" role="note">
        {overall.lotsWithoutOfficialArea > 0 && <span>{formatDashboardInteger(overall.lotsWithoutOfficialArea)} {overall.lotsWithoutOfficialArea === 1 ? 'espaço fora do cálculo de área' : 'espaços fora do cálculo de área'}</span>}
        {overall.lotsWithoutPrice > 0 && <span>{formatDashboardInteger(overall.lotsWithoutPrice)} {overall.lotsWithoutPrice === 1 ? 'espaço sem valor definido' : 'espaços sem valor definido'}</span>}
        {snapshot.unclassifiedLots > 0 && <span>{formatDashboardInteger(snapshot.unclassifiedLots)} {snapshot.unclassifiedLots === 1 ? 'espaço sem segmento' : 'espaços sem segmento'} incluído na visão geral</span>}
      </div>}

      <section className="commercial-dashboard-overview" aria-labelledby="commercial-dashboard-overview-title">
        <div className="commercial-dashboard-section-heading">
          <div>
            <span className="commercial-dashboard-eyebrow">Panorama do parque</span>
            <h2 id="commercial-dashboard-overview-title">Visão geral</h2>
          </div>
          <p>A área indisponível não compõe o percentual de comercialização.</p>
        </div>
        <div className="commercial-dashboard-overview-grid">
          <div className="commercial-dashboard-overview-analysis">
            <div className="commercial-dashboard-subheading"><strong>Distribuição por área</strong><span>Dados comerciais do próprio mapa</span></div>
            <CommercialDashboardAreaChart aggregate={overall} highlightedStatus={highlightedStatus} onHoverStatus={onHoverStatus} onToggleStatus={onToggleStatus} />
            <CommercialDashboardValueChart aggregate={overall} highlightedStatus={highlightedStatus} onHoverStatus={onHoverStatus} onToggleStatus={onToggleStatus} />
            <div className="commercial-dashboard-potential-breakdown" aria-label="Potencial por situação comercial">
              <div><span>Disponível</span><strong>{displayedValue(overall.availableValue, overall.availableLots, overall.byStatus.AVAILABLE.pricedLotCount)}</strong></div>
              <div><span>Reservado</span><strong>{displayedValue(overall.reservedValue, overall.reservedLots, overall.byStatus.RESERVED.pricedLotCount)}</strong></div>
              <div><span>Em negociação</span><strong>{displayedValue(overall.negotiationValue, overall.negotiationLots, overall.byStatus.IN_NEGOTIATION.pricedLotCount)}</strong></div>
            </div>
            {overall.blockedLots > 0 && <p className="commercial-dashboard-data-note">
              {formatDashboardInteger(overall.blockedLots)} {overall.blockedLots === 1 ? 'lote bloqueado' : 'lotes bloqueados'} contabilizados na área comercial, fora do potencial pendente.
            </p>}
          </div>
          <div className="commercial-dashboard-overview-map">
            <div className="commercial-dashboard-subheading"><strong>Onde estão os espaços</strong><span>Cores correspondem à situação comercial</span></div>
            <CommercialMiniMap
              items={overall.records}
              title="Mapa comercial geral da Fenasoja"
              highlightedStatus={highlightedStatus}
              onViewLot={onViewLot}
            />
          </div>
        </div>
      </section>

      <div className="commercial-dashboard-segments" aria-label="Indicadores por segmento comercial">
        {snapshot.segments.map((segment) => <CommercialSegmentDashboard
          key={segment.segmentId}
          snapshot={segment}
          onViewLot={onViewLot}
        />)}
      </div>

      <CommercialDashboardComparison segments={snapshot.segments} />

      <footer className="commercial-dashboard-footer">
        Fonte: cadastro comercial carregado pelo Mapa Comercial. Áreas usam apenas metragem oficial válida; valores representam preços comerciais cadastrados.
      </footer>
    </main>
  </div>;
}

export default CommercialDashboard;
