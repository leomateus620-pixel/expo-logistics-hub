import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, ChartNoAxesCombined, Clock3, RefreshCw, X, LayoutGrid, PenLine, BadgeCheck, MapPinned, Ruler, Banknote, Wallet } from 'lucide-react';
import type { CommercialMapData } from '../types';
import { STATUS_CONFIG } from '../constants';
import type { LotPricingStage } from '../utils/lotPricing2028';
import { CommercialDashboardSpaces } from './CommercialDashboardSpaces';
import { buildCommercialDashboardSnapshot } from './commercialDashboardAnalytics';
import { formatDashboardAreaWithCoverage, formatDashboardCurrency, formatDashboardInteger, formatDashboardPercentage } from './commercialDashboardFormatters';
import { useSalesOrdersUiStore } from './salesOrders/useSalesOrdersUiStore';
import { CommercialSalesOrdersSection } from './salesOrders/CommercialSalesOrdersSection';
import { CommercialSalesProgress } from './CommercialSalesProgress';
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

function FinancialKpi({ label, value, lots, priced, icon, tone, context }: {
  label: string; value: number; lots: number; priced: number; icon: ReactNode;
  tone: 'confirmed' | 'open' | 'inventory'; context: string;
}) {
  return <article className={`commercial-dashboard-finance-card commercial-dashboard-finance-card--${tone}`}>
    <div className="commercial-dashboard-finance-card__heading">{icon}<span>{label}</span></div>
    <strong className="commercial-dashboard-finance-card__value">
      {priced > 0 ? <span title={formatDashboardCurrency(value)}>{formatDashboardCurrency(value, true)}</span> : '—'}
    </strong>
    <div className="commercial-dashboard-finance-card__foot">
      <span>{lots === 0 ? 'Nenhum lote' : priced < lots
        ? `Subtotal · ${formatDashboardInteger(priced)} de ${formatDashboardInteger(lots)} com valor`
        : `${formatDashboardInteger(lots)} de ${formatDashboardInteger(lots)} com valor`}</span>
      <span>{context}</span>
    </div>
  </article>;
}

export function CommercialDashboard({ data, dataUpdatedAt, isFetching, onClose, onViewLot, projectId, orgId = null, canManageSales = false, canManageContracts = false, scrollContainer, onViewSale }: CommercialDashboardProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const salesEntryRef = useRef<HTMLButtonElement>(null);
  const overviewScrollRef = useRef(0);
  const area = useSalesOrdersUiStore((state) => state.area);
  const setArea = useSalesOrdersUiStore((state) => state.setArea);
  const salesAvailable = Boolean(projectId && onViewSale);
  const inSales = salesAvailable && area === 'sales';
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
    {createPortal(<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap" />, document.head)}
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
    <main className={`commercial-dashboard-content${inSales ? ' commercial-dashboard-content--sales' : ''}`}>
      {inSales && projectId && onViewSale ? <CommercialSalesOrdersSection projectId={projectId} orgId={orgId}
        canManageSales={canManageSales} canManageContracts={canManageContracts} data={data}
        scrollContainer={scrollContainer ?? (() => null)} onViewSale={onViewSale}
        onBack={() => {
          setArea('overview');
          requestAnimationFrame(() => {
            const container = scrollContainer?.();
            if (container) container.scrollTop = overviewScrollRef.current;
            salesEntryRef.current?.focus({ preventScroll: true });
          });
        }} /> : <>
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
      <section className="commercial-dashboard-financial-kpis" aria-label="Valores comerciais globais">
        <FinancialKpi label="Valor das vendas confirmadas" icon={<BadgeCheck aria-hidden="true" />} tone="confirmed"
          value={overall.soldValue} lots={overall.soldLots} priced={overall.byStatus.SOLD.pricedLotCount} context="Valor negociado confirmado" />
        <FinancialKpi label="Valor das vendas em andamento" icon={<Banknote aria-hidden="true" />} tone="open"
          value={overall.saleOpenValue} lots={overall.saleOpenLots} priced={overall.byStatus.SALE_OPEN.pricedLotCount} context="Aguardando assinatura" />
        <FinancialKpi label="Valor total comercial dos lotes" icon={<Wallet aria-hidden="true" />} tone="inventory"
          value={overall.totalKnownValue} lots={overall.commercialLots} priced={overall.knownValueLots} context="Vendas + tabela oficial" />
      </section>
      <CommercialSalesProgress aggregate={overall} />
      <p className="commercial-dashboard-finance-disclaimer">Valores de vendas não representam receita recebida.</p>
      <section className="commercial-dashboard-kpis" aria-label="Indicadores comerciais principais">
        <Kpi label="Espaços comerciais" icon={<LayoutGrid aria-hidden="true" />} value={formatDashboardInteger(overall.commercialLots)} detail="Inventário ativo" />
        <Kpi label="Lotes com venda em andamento" icon={<PenLine aria-hidden="true" />} color={STATUS_CONFIG.SALE_OPEN.color} value={formatDashboardInteger(overall.saleOpenLots)}
          detail={overall.commercialLots ? formatDashboardPercentage(overall.byStatus.SALE_OPEN.lotPercentage) : '—'} />
        <Kpi label="Lotes vendidos" icon={<BadgeCheck aria-hidden="true" />} color={STATUS_CONFIG.SOLD.color} value={formatDashboardInteger(overall.soldLots)}
          detail={<>{overall.commercialLots ? formatDashboardPercentage(overall.soldLotPercentage) : '—'} · {formatDashboardAreaWithCoverage(overall.soldAreaSqm, overall.soldLots, overall.byStatus.SOLD.areaPendingCount, overall.commercialLots)}</>} />
        <Kpi label="Lotes disponíveis" icon={<MapPinned aria-hidden="true" />} color={STATUS_CONFIG.AVAILABLE.color} value={formatDashboardInteger(overall.availableLots)}
          detail={<>{overall.commercialLots ? formatDashboardPercentage(overall.byStatus.AVAILABLE.lotPercentage) : '—'} · {formatDashboardAreaWithCoverage(overall.availableAreaSqm, overall.availableLots, overall.byStatus.AVAILABLE.areaPendingCount, overall.commercialLots)}</>} />
        <Kpi label="Área comercial" icon={<Ruler aria-hidden="true" />} value={formatDashboardAreaWithCoverage(overall.totalAreaSqm, overall.commercialLots, overall.lotsWithoutOfficialArea, overall.commercialLots)}
          detail={overall.lotsWithoutOfficialArea ? `${formatDashboardInteger(overall.lotsWithoutOfficialArea)} sem área oficial` : 'Área oficial cadastrada'} />
      </section>
      </div>
      {salesAvailable && <section className="commercial-dashboard-sales-entry" aria-label="Acesso a vendas e contratos">
        <div className="commercial-dashboard-sales-entry__icon" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 4h13l5 5v12M20 4v6h5M7 4v24h11M11 10h5M11 15h10M11 20h5" />
            <rect x="19" y="18" width="10" height="11" rx="2" />
            <path d="m22 23 2 2 3-4" />
          </svg>
        </div>
        <div className="commercial-dashboard-sales-entry__text"><h2>Vendas e contratos</h2><p>Pedidos, espaços, documentos e histórico comercial.</p></div>
        <button type="button" ref={salesEntryRef} onClick={() => {
          overviewScrollRef.current = scrollContainer?.()?.scrollTop ?? 0;
          setArea('sales');
          const container = scrollContainer?.();
          if (container) container.scrollTop = 0;
        }} aria-label="Acessar vendas e contratos">Acessar<ArrowUpRight aria-hidden="true" /></button>
      </section>}
      <CommercialDashboardSpaces snapshot={snapshot} data={data} onViewLot={onViewLot} />
      {snapshot.orphanLots > 0 && <div className="commercial-dashboard-integrity" role="note">
        <span>{snapshot.orphanLots} lotes sem entidade cadastral carregada, fora dos indicadores conforme o contrato atual do mapa.</span>
      </div>}
      <footer className="commercial-dashboard-footer">Fonte: cadastro carregado pelo Mapa Comercial · áreas oficiais válidas · atualização sincronizada com o mapa.</footer>
      </>}
    </main>
  </div>;
}

export default CommercialDashboard;
