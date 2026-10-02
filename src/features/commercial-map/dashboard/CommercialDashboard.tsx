import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChartNoAxesCombined, Clock3, RefreshCw, X, LayoutGrid, PenLine, BadgeCheck, MapPinned, Ruler, Banknote, Wallet } from 'lucide-react';
import type { CommercialMapData } from '../types';
import { STATUS_CONFIG } from '../constants';
import type { LotPricingStage } from '../utils/lotPricing2028';
import { CommercialDashboardSpaces } from './CommercialDashboardSpaces';
import { buildCommercialDashboardSnapshot } from './commercialDashboardAnalytics';
import { formatDashboardAreaWithCoverage, formatDashboardCurrency, formatDashboardInteger, formatDashboardPercentage } from './commercialDashboardFormatters';
import { useSalesOrdersUiStore } from './salesOrders/useSalesOrdersUiStore';
import { CommercialSalesOrdersSection } from './salesOrders/CommercialSalesOrdersSection';
import type { SaleOrderSummary } from './salesOrders/salesOrdersService';
import './commercial-dashboard.css';
import './salesOrders/sales-orders.css';

export interface CommercialDashboardProps {
  data: Pick<CommercialMapData, 'entities' | 'lots'>;
  dataUpdatedAt: number;
  isFetching: boolean;
  onClose: () => void;
  onViewLot: (entityId: string) => void;
  projectId?: string;
  orgId?: string | null;
  canManageSales?: boolean;
  canManageContracts?: boolean;
  scrollContainer?: () => HTMLElement | null;
  onViewSale?: (record: SaleOrderSummary, lotIds: string[]) => void;
}

function Kpi({ label, value, detail, icon, color }: {
  label: string; value: ReactNode; detail: ReactNode; icon: ReactNode; color?: string;
}) {
  return <article className="commercial-dashboard-kpi" style={color ? { borderTopColor: color } : undefined}>
    <span>{icon}{label}</span><strong>{value}</strong><small>{detail}</small>
  </article>;
}

function PriceCoverage({ lots, priced, scope }: { lots: number; priced: number; scope: string }) {
  return <>{lots === 0 ? 'Nenhum lote neste indicador'
    : `${priced < lots ? 'Subtotal · ' : ''}${formatDashboardInteger(priced)} de ${formatDashboardInteger(lots)} com valor`}
    <span className="commercial-dashboard-finance-note">{scope}</span>
    <span className="commercial-dashboard-finance-note">Não é receita recebida</span></>;
}

export function CommercialDashboard({ data, dataUpdatedAt, isFetching, onClose, onViewLot, projectId, orgId = null, canManageSales = false, canManageContracts = false, scrollContainer, onViewSale }: CommercialDashboardProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [pricingStage, setPricingStage] = useState<LotPricingStage>('RENOVACAO');
  const snapshot = useMemo(() => buildCommercialDashboardSnapshot({ entities: data.entities, lots: data.lots }, pricingStage), [data.entities, data.lots, pricingStage]);
  const { overall } = snapshot;
  const updatedAtLabel = dataUpdatedAt > 0 && Number.isFinite(dataUpdatedAt)
    ? `Atualizado às ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(dataUpdatedAt)}`
    : 'Sincronização pendente';
  useEffect(() => {
    // Ao voltar do mapa, o foco é restaurado no controle de origem da venda.
    if (!useSalesOrdersUiStore.getState().originRecordId) closeButtonRef.current?.focus({ preventScroll: true });
  }, []);

  return <div className="commercial-dashboard">
    <header className="commercial-dashboard-header">
      <div className="commercial-dashboard-header-title">
        <div className="commercial-dashboard-mark" aria-hidden="true"><ChartNoAxesCombined /></div>
        <div><h1 id="commercial-dashboard-title">Dashboard Comercial</h1><span className="commercial-dashboard-event">Fenasoja 2028</span></div>
      </div>
      <div className="commercial-dashboard-header-actions">
        <span className="commercial-dashboard-sync" role="status">
          {isFetching ? <RefreshCw className="is-spinning" aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
          <span>{isFetching ? 'Atualizando · ' : ''}{updatedAtLabel}</span>
        </span>
        <button type="button" className="commercial-dashboard-close" onClick={onClose} ref={closeButtonRef} aria-label="Fechar Dashboard Comercial"><X aria-hidden="true" /><span>Fechar</span></button>
      </div>
    </header>
    <main className="commercial-dashboard-content">
      <div className="commercial-dashboard-global-label">
        <span className="commercial-dashboard-eyebrow">Visão global · todo o inventário comercial</span>
        <div className="commercial-dashboard-pricing-stage">
          <span>Tabela dos lotes sem venda</span>
          <div className="commercial-dashboard-metric" role="group" aria-label="Etapa dos preços oficiais">
            <button type="button" aria-pressed={pricingStage === 'RENOVACAO'} onClick={() => setPricingStage('RENOVACAO')}>Renovação</button>
            <button type="button" aria-pressed={pricingStage === 'SEGUNDA_ETAPA'} onClick={() => setPricingStage('SEGUNDA_ETAPA')}>2ª Etapa</button>
          </div>
        </div>
      </div>
      <div className="commercial-dashboard-indicators">
      <section className="commercial-dashboard-kpis" aria-label="Indicadores comerciais principais">
        <Kpi label="Espaços comerciais" icon={<LayoutGrid aria-hidden="true" />} value={formatDashboardInteger(overall.commercialLots)} detail="Inventário ativo · todos os recortes" />
        <Kpi label="Lotes com venda em andamento" icon={<PenLine aria-hidden="true" />} color={STATUS_CONFIG.SALE_OPEN.color} value={formatDashboardInteger(overall.saleOpenLots)}
          detail={<>{overall.commercialLots ? formatDashboardPercentage(overall.byStatus.SALE_OPEN.lotPercentage) : '—'} · aguardando assinatura</>} />
        <Kpi label="Lotes vendidos" icon={<BadgeCheck aria-hidden="true" />} color={STATUS_CONFIG.SOLD.color} value={formatDashboardInteger(overall.soldLots)}
          detail={<>{overall.commercialLots ? formatDashboardPercentage(overall.soldLotPercentage) : '—'} · {formatDashboardAreaWithCoverage(overall.soldAreaSqm, overall.soldLots, overall.byStatus.SOLD.areaPendingCount, overall.commercialLots)}</>} />
        <Kpi label="Lotes disponíveis" icon={<MapPinned aria-hidden="true" />} color={STATUS_CONFIG.AVAILABLE.color} value={formatDashboardInteger(overall.availableLots)}
          detail={<>{overall.commercialLots ? formatDashboardPercentage(overall.byStatus.AVAILABLE.lotPercentage) : '—'} · {formatDashboardAreaWithCoverage(overall.availableAreaSqm, overall.availableLots, overall.byStatus.AVAILABLE.areaPendingCount, overall.commercialLots)}</>} />
        <Kpi label="Área comercial" icon={<Ruler aria-hidden="true" />} value={formatDashboardAreaWithCoverage(overall.totalAreaSqm, overall.commercialLots, overall.lotsWithoutOfficialArea, overall.commercialLots)}
          detail={overall.lotsWithoutOfficialArea ? `${formatDashboardInteger(overall.lotsWithoutOfficialArea)} espaços sem metragem oficial válida` : 'Metragem oficial cadastrada'} />
      </section>
      <section className="commercial-dashboard-financial-kpis" aria-label="Valores comerciais globais">
        <Kpi label="Valor das vendas em andamento" icon={<Banknote aria-hidden="true" />} color={STATUS_CONFIG.SALE_OPEN.color}
          value={overall.byStatus.SALE_OPEN.pricedLotCount > 0 ? <span title={formatDashboardCurrency(overall.saleOpenValue)}>{formatDashboardCurrency(overall.saleOpenValue, true)}</span> : '—'}
          detail={<PriceCoverage lots={overall.saleOpenLots} priced={overall.byStatus.SALE_OPEN.pricedLotCount} scope="Valor negociado gravado · aguardando assinatura" />} />
        <Kpi label="Valor total comercial dos lotes" icon={<Wallet aria-hidden="true" />}
          value={overall.knownValueLots > 0 ? <span title={formatDashboardCurrency(overall.totalKnownValue)}>{formatDashboardCurrency(overall.totalKnownValue, true)}</span> : '—'}
          detail={<PriceCoverage lots={overall.commercialLots} priced={overall.knownValueLots} scope="Vendas gravadas + tabela oficial · inclui bloqueados e vendidos; exclui indisponíveis" />} />
      </section></div>
      {projectId && onViewSale && <CommercialSalesOrdersSection projectId={projectId} orgId={orgId}
        canManageSales={canManageSales} canManageContracts={canManageContracts} data={data}
        scrollContainer={scrollContainer ?? (() => null)} onViewSale={onViewSale} />}
      <CommercialDashboardSpaces snapshot={snapshot} data={data} onViewLot={onViewLot} />
      {snapshot.orphanLots > 0 && <div className="commercial-dashboard-integrity" role="note">
        <span>{snapshot.orphanLots} lotes sem entidade cadastral carregada, fora dos indicadores conforme o contrato atual do mapa.</span>
      </div>}
      <footer className="commercial-dashboard-footer">Fonte: cadastro carregado pelo Mapa Comercial · áreas oficiais válidas · atualização sincronizada com o mapa.</footer>
    </main>
  </div>;
}

export default CommercialDashboard;
