import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { CommercialMapData } from '../types';
import type { LotPricingStage } from '../utils/lotPricing2028';
import { CommercialDashboardSpaces, type DashboardSpacesPresentationMemory, type CommercialDashboardSpacesMemory } from './CommercialDashboardSpaces';
import { buildCommercialDashboardSnapshot } from './commercialDashboardAnalytics';
import type { DashboardStatusSummary } from './commercialDashboardTypes';
import { formatDashboardAreaWithCoverage, formatDashboardCurrency, formatDashboardInteger, formatDashboardPercentage } from './commercialDashboardFormatters';
import { useSalesOrdersUiStore } from './salesOrders/useSalesOrdersUiStore';
import { CommercialSalesOrdersSection } from './salesOrders/CommercialSalesOrdersSection';
import { CommercialSalesProgress, type SalesProgressFill } from './CommercialSalesProgress';
import { OverviewInfo, type OverviewInfoFact } from './CommercialDashboardOverviewInfo';
import { CommercialDashboardAreaCard } from './CommercialDashboardAreaCard';
import { CommercialDashboardSalesSummary } from './CommercialDashboardSalesSummary';
import {
  AvailableLotGlyph, ConfirmedGlyph, ConfirmedSealGlyph, DashboardMarkGlyph, InventoryBaseGlyph,
  ModulesGlyph, PendingSignatureGlyph, ProcessGlyph, SyncActiveGlyph, SyncDoneGlyph,
} from './CommercialDashboardOverviewIcons';
import type { SaleOrderSummary } from './salesOrders/salesOrdersService';
import './commercial-dashboard.css';
import './commercial-dashboard-overview.css';
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

type OverviewInfoContent = Omit<Parameters<typeof OverviewInfo>[0], 'align'>;
type FinanceTone = 'confirmed' | 'open' | 'inventory';
type KpiTone = 'spaces' | 'open' | 'sold' | 'available' | 'area';

/** Stable per opening, cycling between openings; data refreshes never recompose the backgrounds. */
const OVERVIEW_COMPOSITIONS = ['a', 'b', 'c'] as const;
let overviewOpenings = 0;
const emptyScrollContainer = () => null;

/** Splits an existing formatter result into currency, number and compact unit without changing it. */
function OverviewAmount({ text }: { text: string }) {
  const match = /^R\$\s*(\S+)(?:\s+(mil|mi))?$/u.exec(text);
  if (!match) return <>{text}</>;
  return <>
    <span className="commercial-dashboard-overview-amount__lead">
      <span className="commercial-dashboard-overview-amount__currency">R$&nbsp;</span>
      <span className="commercial-dashboard-overview-amount__number">{match[1]}</span>
    </span>
    {match[2] && <span className="commercial-dashboard-overview-amount__unit"> {match[2]}</span>}
  </>;
}

function financeCoverage(lots: number, priced: number): string {
  if (lots === 0) return 'Nenhum lote';
  return priced < lots
    ? `Subtotal · ${formatDashboardInteger(priced)} de ${formatDashboardInteger(lots)} com valor`
    : `${formatDashboardInteger(lots)} de ${formatDashboardInteger(lots)} com valor`;
}

/** Absence and partial coverage stay visible; the detail lives in the info control. */
function financeQualifier(lots: number, priced: number): string | null {
  if (lots === 0) return 'Nenhum lote';
  if (priced === 0) return 'Sem valor';
  return priced < lots ? 'Parcial' : null;
}

function FinanceCard({ tone, label, icon, value, lots, priced, info }: {
  tone: FinanceTone; label: string; icon: ReactNode; value: number; lots: number; priced: number;
  info: Omit<OverviewInfoContent, 'facts'> & { facts?: readonly OverviewInfoFact[] };
}) {
  const exact = priced > 0 ? formatDashboardCurrency(value) : '—';
  const qualifier = financeQualifier(lots, priced);
  return <article className={`commercial-dashboard-overview-finance commercial-dashboard-overview-finance--${tone}`}>
    {tone === 'inventory' && <svg className="commercial-dashboard-overview-finance__contours" viewBox="0 0 260 150"
      preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
      <path d="M18 134C58 94 90 100 118 72S186 28 262 36L320 30" />
      <path d="M40 152C78 110 104 118 132 88S196 50 262 58L320 52" />
      <path d="M66 152C98 120 122 130 150 102S210 72 262 80L320 76" />
      <path d="M96 152C124 128 148 136 174 112S224 92 262 100L320 98" />
      <path d="M132 152C154 138 172 142 194 124S236 112 262 118L320 117" />
    </svg>}
    <header className="commercial-dashboard-overview-finance__heading">
      <span className="commercial-dashboard-overview-finance__badge" aria-hidden="true">{icon}</span>
      <span className="commercial-dashboard-overview-finance__title">{label}</span>
      {qualifier && <span className="commercial-dashboard-overview-qualifier">{qualifier}</span>}
      <OverviewInfo {...info} facts={[['Valor exato', exact], ['Cobertura', financeCoverage(lots, priced)], ...(info.facts ?? [])]} />
    </header>
    <strong className="commercial-dashboard-overview-finance__value">
      {priced > 0 ? <span className="commercial-dashboard-overview-amount" title={exact}>
        <OverviewAmount text={formatDashboardCurrency(value, true)} />
      </span> : '—'}
    </strong>
  </article>;
}

function OverviewKpi({ tone, label, icon, value, qualifier, info }: {
  tone: KpiTone; label: string; icon: ReactNode; value: ReactNode; qualifier?: string | null; info: OverviewInfoContent;
}) {
  return <article className={`commercial-dashboard-overview-kpi commercial-dashboard-overview-kpi--${tone}`}>
    <header className="commercial-dashboard-overview-kpi__heading">
      <span className="commercial-dashboard-overview-kpi__icon" aria-hidden="true">{icon}</span>
      <span className="commercial-dashboard-overview-kpi__label">{label}</span>
      {qualifier && <span className="commercial-dashboard-overview-qualifier">{qualifier}</span>}
      <OverviewInfo {...info} />
    </header>
    <strong className="commercial-dashboard-overview-kpi__value">{value}</strong>
  </article>;
}

function statusAreaFact(summary: DashboardStatusSummary, inventoryLots: number): string {
  const area = formatDashboardAreaWithCoverage(summary.areaSqm, summary.lotCount, summary.areaPendingCount, inventoryLots);
  const partial = summary.areaPendingCount > 0 && summary.areaPendingCount < summary.lotCount;
  return partial ? `${area} · ${formatDashboardInteger(summary.areaPendingCount)} sem área oficial` : area;
}

export function CommercialDashboard({ data, dataUpdatedAt, isFetching, onClose, onViewLot, projectId, orgId = null, canManageSales = false, canManageContracts = false, scrollContainer, onViewSale }: CommercialDashboardProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const salesEntryRef = useRef<HTMLButtonElement>(null);
  const presentationScopeId = projectId ?? data.entities[0]?.projectId ?? 'unscoped';
  // Keep only presentation state across sales navigation; maps remain unmounted.
  // A new project/organization receives fresh state before its first render.
  const presentation = useMemo(() => ({
    scope: `${orgId ?? ''}:${presentationScopeId}`,
    spaces: { current: null } as DashboardSpacesPresentationMemory & CommercialDashboardSpacesMemory,
    overview: { scrollTop: 0 },
  }), [orgId, presentationScopeId]);
  const { spaces: spacesMemory, overview: overviewMemory } = presentation;
  const currentOverviewMemory = useRef(overviewMemory);
  currentOverviewMemory.current = overviewMemory;
  const area = useSalesOrdersUiStore((state) => state.area);
  const setArea = useSalesOrdersUiStore((state) => state.setArea);
  const salesAvailable = Boolean(projectId && onViewSale);
  const inSales = salesAvailable && area === 'sales';
  const [pricingStage, setPricingStage] = useState<LotPricingStage>('RENOVACAO');
  const [composition] = useState(() => OVERVIEW_COMPOSITIONS[overviewOpenings++ % OVERVIEW_COMPOSITIONS.length]);
  const progressFillRef = useRef<SalesProgressFill | null>(null);
  const snapshot = useMemo(() => buildCommercialDashboardSnapshot({ entities: data.entities, lots: data.lots }, pricingStage), [data.entities, data.lots, pricingStage]);
  const { overall } = snapshot;
  const lotShare = (value: number) => overall.commercialLots ? `${formatDashboardPercentage(value)} dos espaços comerciais` : '—';
  const updatedAtLabel = dataUpdatedAt > 0 && Number.isFinite(dataUpdatedAt)
    ? `Atualizado às ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(dataUpdatedAt)}`
    : 'Sincronização pendente';
  useEffect(() => {
    // Ao voltar do mapa, o foco é restaurado no controle de origem da venda.
    if (!useSalesOrdersUiStore.getState().originRecordId) closeButtonRef.current?.focus({ preventScroll: true });
  }, []);

  return <div className="commercial-dashboard">
    {createPortal(<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap" />, document.head)}
    <header className="commercial-dashboard-overview-header">
      <div className="commercial-dashboard-overview-header__identity">
        <div className="commercial-dashboard-overview-header__mark" aria-hidden="true"><DashboardMarkGlyph /></div>
        <div className="commercial-dashboard-overview-header__titles">
          <h1 id="commercial-dashboard-title">Dashboard Comercial</h1>
          <span className="commercial-dashboard-overview-header__brand">
            <span className="commercial-dashboard-overview-header__brand-name">Fenasoja</span>
            <span className="commercial-dashboard-overview-header__brand-edition">2028</span>
          </span>
        </div>
      </div>
      <div className="commercial-dashboard-overview-header__actions">
        <span className="commercial-dashboard-overview-header__sync" role="status" data-fetching={isFetching ? 'true' : 'false'}>
          {isFetching ? <SyncActiveGlyph key="active" className="is-spinning" /> : <SyncDoneGlyph key="done" />}
          <span className="commercial-dashboard-overview-header__sync-text">
            {isFetching && <span className="commercial-dashboard-overview-header__sync-active">Atualizando<span aria-hidden="true"> · </span></span>}
            <span>{updatedAtLabel}</span>
          </span>
        </span>
        <button type="button" className="commercial-dashboard-overview-header__close" onClick={onClose} ref={closeButtonRef} aria-label="Fechar Dashboard Comercial"><X aria-hidden="true" /><span>Fechar</span></button>
      </div>
    </header>
    <main className={`commercial-dashboard-content${inSales ? ' commercial-dashboard-content--sales' : ''}`}>
      {inSales && projectId && onViewSale ? <CommercialSalesOrdersSection projectId={projectId} orgId={orgId}
        canManageSales={canManageSales} canManageContracts={canManageContracts} data={data}
        scrollContainer={scrollContainer ?? emptyScrollContainer} onViewSale={onViewSale}
        onBack={() => {
          setArea('overview');
          requestAnimationFrame(() => {
            if (currentOverviewMemory.current !== overviewMemory
              || useSalesOrdersUiStore.getState().area !== 'overview' || !salesEntryRef.current) return;
            const container = scrollContainer?.();
            if (container) container.scrollTop = overviewMemory.scrollTop;
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
      <div className="commercial-dashboard-overview" data-composition={composition}>
      <section className="commercial-dashboard-overview__finance" aria-label="Valores comerciais globais">
        <FinanceCard tone="confirmed" label="Valor das vendas confirmadas" icon={<ConfirmedSealGlyph />}
          value={overall.soldValue} lots={overall.soldLots} priced={overall.byStatus.SOLD.pricedLotCount}
          info={{ label: 'Informações sobre vendas confirmadas', title: 'Vendas confirmadas',
            lead: 'Soma do valor negociado das vendas confirmadas no fluxo comercial (situação Vendido).',
            note: 'Valor negociado confirmado. A confirmação comercial não equivale a recebimento financeiro.' }} />
        <FinanceCard tone="open" label="Valor das vendas em andamento" icon={<PendingSignatureGlyph />}
          value={overall.saleOpenValue} lots={overall.saleOpenLots} priced={overall.byStatus.SALE_OPEN.pricedLotCount}
          info={{ label: 'Informações sobre vendas em andamento', title: 'Vendas em andamento',
            lead: 'Soma do valor negociado das vendas registradas que ainda aguardam assinatura do contrato.',
            facts: [['Situação', 'Aguardando assinatura']],
            note: 'Venda em andamento não é receita realizada.' }} />
        <FinanceCard tone="inventory" label="Valor total comercial dos lotes" icon={<InventoryBaseGlyph />}
          value={overall.totalKnownValue} lots={overall.commercialLots} priced={overall.knownValueLots}
          info={{ label: 'Informações sobre o valor total comercial', title: 'Valor total comercial',
            lead: 'Base comercial conhecida do inventário: valor negociado das vendas somado à tabela oficial dos lotes sem venda.',
            facts: [['Composição', `Vendas + tabela oficial (${pricingStage === 'RENOVACAO' ? 'Renovação' : '2ª Etapa'})`]],
            note: 'Não é meta nem receita. Lotes sem valor registrado não são estimados.' }} />
      </section>
      <CommercialSalesProgress aggregate={overall} fillMemory={progressFillRef} />
      <section className="commercial-dashboard-overview__kpis" aria-label="Indicadores comerciais principais">
        <OverviewKpi tone="spaces" label="Espaços comerciais" icon={<ModulesGlyph />} value={formatDashboardInteger(overall.commercialLots)}
          info={{ label: 'Informações sobre espaços comerciais', title: 'Espaços comerciais',
            lead: 'Inventário ativo: lotes vendidos, em andamento, disponíveis, reservados, em negociação e bloqueados.',
            facts: [
              ['Reservados', formatDashboardInteger(overall.reservedLots)],
              ['Em negociação', formatDashboardInteger(overall.negotiationLots)],
              ['Bloqueados', formatDashboardInteger(overall.blockedLots)],
              ['Indisponíveis', `${formatDashboardInteger(overall.unavailableLots)} fora do inventário`],
            ] }} />
        <OverviewKpi tone="open" label="Lotes com venda em andamento" icon={<ProcessGlyph />} value={formatDashboardInteger(overall.saleOpenLots)}
          info={{ label: 'Informações sobre lotes com venda em andamento', title: 'Lotes com venda em andamento',
            lead: 'Lotes com venda registrada aguardando a confirmação da assinatura do contrato.',
            facts: [['Participação', lotShare(overall.byStatus.SALE_OPEN.lotPercentage)],
              ['Área oficial', statusAreaFact(overall.byStatus.SALE_OPEN, overall.commercialLots)]] }} />
        <OverviewKpi tone="sold" label="Lotes vendidos" icon={<ConfirmedGlyph />} value={formatDashboardInteger(overall.soldLots)}
          info={{ label: 'Informações sobre lotes vendidos', title: 'Lotes vendidos',
            lead: 'Lotes na situação Vendido, com venda confirmada no fluxo comercial.',
            facts: [['Participação', lotShare(overall.soldLotPercentage)],
              ['Área oficial', statusAreaFact(overall.byStatus.SOLD, overall.commercialLots)]] }} />
        <OverviewKpi tone="available" label="Lotes disponíveis" icon={<AvailableLotGlyph />} value={formatDashboardInteger(overall.availableLots)}
          info={{ label: 'Informações sobre lotes disponíveis', title: 'Lotes disponíveis',
            lead: 'Lotes liberados para proposta comercial.',
            facts: [['Participação', lotShare(overall.byStatus.AVAILABLE.lotPercentage)],
              ['Área oficial', statusAreaFact(overall.byStatus.AVAILABLE, overall.commercialLots)]] }} />
        <div className="commercial-dashboard-region-summary" aria-label="Área comercial e vendas">
          <CommercialDashboardAreaCard aggregate={overall} />
          {salesAvailable && projectId && <CommercialDashboardSalesSummary projectId={projectId}
            canManageSales={canManageSales} canManageContracts={canManageContracts} entryRef={salesEntryRef}
            onAccess={() => {
              overviewMemory.scrollTop = scrollContainer?.()?.scrollTop ?? 0;
              setArea('sales');
              const container = scrollContainer?.();
              if (container) container.scrollTop = 0;
            }} />}
        </div>
      </section>
      </div>
      <CommercialDashboardSpaces key={presentation.scope} snapshot={snapshot} data={data} onViewLot={onViewLot}
        presentationMemory={spacesMemory} stateMemory={spacesMemory} />
      {snapshot.orphanLots > 0 && <div className="commercial-dashboard-integrity" role="note">
        <span>{snapshot.orphanLots} lotes sem entidade cadastral carregada, fora dos indicadores conforme o contrato atual do mapa.</span>
      </div>}
      <footer className="commercial-dashboard-footer">Fonte: cadastro carregado pelo Mapa Comercial · áreas oficiais válidas · atualização sincronizada com o mapa.</footer>
      </>}
    </main>
  </div>;
}

export default CommercialDashboard;
