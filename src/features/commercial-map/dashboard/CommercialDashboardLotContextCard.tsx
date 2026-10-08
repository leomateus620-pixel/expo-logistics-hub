import { ArrowUpRight, Building2, Ruler, X } from 'lucide-react';
import { STATUS_CONFIG } from '../constants';
import { toCommercialPhase } from '../types';
import { formatAreaSqmLabel, formatBrl } from '../utils/lotPricing2028';
import { resolveLotIdentity } from '../utils/lotIdentity';
import { resolveLotTooltipPresentation } from '../utils/lotTooltipPresentation';
import { resolveDashboardLotValue } from './commercialDashboardAnalytics';
import type { CommercialMiniMapItem } from './commercialDashboardGeometry';

export interface CommercialDashboardLotContextCardProps {
  item: CommercialMiniMapItem;
  mode: 'preview' | 'selected';
  positionUnavailable?: boolean;
  onClose: () => void;
  onViewLot: (entityId: string) => void;
}

/** In-memory dashboard data only: opening this card never reads or writes a service. */
export function CommercialDashboardLotContextCard({ item, mode, positionUnavailable = false, onClose, onViewLot }: CommercialDashboardLotContextCardProps) {
  const { lot } = item;
  const identity = resolveLotIdentity(lot, item.entity, item.pavilion, item.areaName);
  const status = lot.status === 'UNAVAILABLE' ? lot.status : toCommercialPhase(lot.status);
  const sale = lot.status === 'SALE_OPEN' || lot.status === 'SOLD';
  const area = item.officialAreaSqm != null && Number.isFinite(item.officialAreaSqm) && item.officialAreaSqm > 0
    ? formatAreaSqmLabel(item.officialAreaSqm) : null;
  const negotiated = item.value != null && Number.isFinite(item.value) && item.value >= 0 ? formatBrl(item.value) : null;
  const buyer = lot.buyerConflict ? 'Identificação em conferência'
    : resolveLotTooltipPresentation(lot).buyerName ?? 'Identificação não informada';

  return <article className="commercial-dashboard-lot-context" data-mode={mode} data-lot-status={lot.status}
    aria-label={`Dados de ${identity.full}`}>
    <header className="commercial-dashboard-lot-context__heading">
      <div><strong>{identity.title}</strong>{identity.location && <span>{identity.location}</span>}</div>
      {mode === 'selected' && <button type="button" className="commercial-dashboard-lot-context__close" onClick={onClose}
        aria-label="Fechar dados do lote"><X aria-hidden="true" /></button>}
    </header>
    <div className="commercial-dashboard-lot-context__summary">
      <span className="commercial-dashboard-lot-context__status" style={{ color: STATUS_CONFIG[status].border, background: STATUS_CONFIG[status].surface }}>
        <i aria-hidden="true" style={{ background: STATUS_CONFIG[status].color }} />{STATUS_CONFIG[lot.status].label}
      </span>
      <span className="commercial-dashboard-lot-context__area"><Ruler aria-hidden="true" />{area ?? 'Área oficial pendente'}</span>
    </div>
    {positionUnavailable && <p className="commercial-dashboard-lot-context__position-note">Posição indisponível na planta</p>}
    {sale && <>
      <div className="commercial-dashboard-lot-context__sale-value"><span>Valor negociado do lote</span><strong>{negotiated ?? 'Valor indisponível'}</strong></div>
      <div className="commercial-dashboard-lot-context__buyer"><Building2 aria-hidden="true" /><div><span>Empresa / expositor</span><strong>{buyer}</strong></div></div>
    </>}
    {lot.status === 'AVAILABLE' && <dl className="commercial-dashboard-lot-context__prices">
      <div><dt>Renovação</dt><dd>{formatBrl(resolveDashboardLotValue(lot, 'RENOVACAO')) ?? 'Valor ainda não definido'}</dd></div>
      <div><dt>Segunda Etapa</dt><dd>{formatBrl(resolveDashboardLotValue(lot, 'SEGUNDA_ETAPA')) ?? 'Valor ainda não definido'}</dd></div>
    </dl>}
    {mode === 'selected' && <footer><button type="button" onClick={() => onViewLot(item.entity.id)}>Ver no mapa<ArrowUpRight aria-hidden="true" /></button></footer>}
  </article>;
}
