import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChartNoAxesCombined, Clock3, RefreshCw, X } from 'lucide-react';
import type { CommercialMapData } from '../types';
import { CommercialDashboardSpaces } from './CommercialDashboardSpaces';
import { CommercialDashboardLotChart, CommercialDashboardValueChart } from './CommercialDashboardCharts';
import { buildCommercialDashboardSnapshot } from './commercialDashboardAnalytics';
import { useDashboardStatusHighlight } from './useDashboardStatusHighlight';
import {
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

function focusDashboardSection(id: string) {
  const heading = document.getElementById(id);
  heading?.focus({ preventScroll: true });
  heading?.scrollIntoView({ block: 'start' });
}

export function CommercialDashboard({ data, dataUpdatedAt, isFetching, onClose, onViewLot }: CommercialDashboardProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [consolidatedOpen, setConsolidatedOpen] = useState(false);
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
      <nav className="commercial-dashboard-jump" aria-label="Navegar entre visões gerenciais">
        <button type="button" onClick={() => focusDashboardSection('dashboard-external-title')}>Áreas externas <strong>{formatDashboardInteger(snapshot.external.totalLots)}</strong></button>
        <button type="button" onClick={() => focusDashboardSection('dashboard-internal-title')}>Pavilhões internos <strong>{formatDashboardInteger(snapshot.internal.totalLots)}</strong></button>
      </nav>
      <section className="commercial-dashboard-kpis" aria-label="Indicadores comerciais principais">
        <Kpi
          label="Lotes comerciais"
          value={formatDashboardInteger(overall.commercialLots)}
          detail={overall.commercialLots === 0 ? 'Nenhum espaço comercial cadastrado' : 'Inventário comercial ativo'}
        />
        <Kpi
          label="Lotes vendidos"
          value={<>{formatDashboardInteger(overall.soldLots)} <em>/ {formatDashboardInteger(overall.commercialLots)}</em></>}
          detail="Do inventário comercial ativo"
          progress={overall.commercialLots > 0 ? overall.soldLotPercentage : null}
        />
        <Kpi
          label="% dos lotes vendidos"
          value={overall.commercialLots > 0 ? formatDashboardPercentage(overall.soldLotPercentage) : '—'}
          detail={overall.commercialLots > 0
            ? `${formatDashboardInteger(overall.soldLots)} de ${formatDashboardInteger(overall.commercialLots)} lotes`
            : 'Percentual pendente de inventário'}
          progress={overall.commercialLots > 0 ? overall.soldLotPercentage : null}
        />
        <Kpi
          label="Lotes disponíveis"
          value={formatDashboardInteger(overall.availableLots)}
          detail={overall.commercialLots > 0
            ? `${formatDashboardPercentage(overall.byStatus.AVAILABLE.lotPercentage)} do inventário comercial`
            : 'Percentual pendente de inventário'}
          progress={overall.commercialLots > 0 ? overall.byStatus.AVAILABLE.lotPercentage : null}
        />
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
        {snapshot.unclassifiedLots > 0 && <span>{formatDashboardInteger(snapshot.unclassifiedLots)} {snapshot.unclassifiedLots === 1 ? 'espaço com classificação pendente incluído' : 'espaços com classificação pendente incluídos'} na visão geral</span>}
      </div>}

      {snapshot.orphanLots > 0 && <p className="commercial-dashboard-pending">
        {snapshot.orphanLots} lotes sem entidade cadastral carregada, fora dos indicadores conforme o contrato atual do mapa.
      </p>}
      <details className="commercial-dashboard-scope-analysis commercial-dashboard-consolidated" onToggle={(event) => setConsolidatedOpen(event.currentTarget.open)}>
        <summary>Resumo consolidado · distribuição de todo o inventário</summary>
        {consolidatedOpen && <div className="commercial-dashboard-overview-grid">
          <CommercialDashboardLotChart aggregate={overall} highlightedStatus={highlightedStatus} onHoverStatus={onHoverStatus} onToggleStatus={onToggleStatus} />
          <CommercialDashboardValueChart aggregate={overall} highlightedStatus={highlightedStatus} onHoverStatus={onHoverStatus} onToggleStatus={onToggleStatus} />
        </div>}
      </details>
      <CommercialDashboardSpaces snapshot={snapshot} data={data} onViewLot={onViewLot} />

      <footer className="commercial-dashboard-footer">
        Fonte: cadastro comercial carregado pelo Mapa Comercial. Áreas usam apenas metragem oficial válida; valores representam preços comerciais cadastrados.
      </footer>
    </main>
  </div>;
}

export default CommercialDashboard;
