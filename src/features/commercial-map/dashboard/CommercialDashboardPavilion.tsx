import { useCallback, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Building2, Download, Maximize2, PanelRightClose, PanelRightOpen, Settings2, X } from 'lucide-react';
import type { CommercialPavilionDashboardSnapshot } from './commercialDashboardTypes';
import { buildDashboardPavilionGeometry } from './commercialDashboardPavilionGeometry';
import { CommercialMiniMap, type MiniMapPresentationMemory } from './CommercialMiniMap';
import { getCommercialMiniMapGeometry } from './commercialDashboardGeometry';
import type { CommercialStatus } from '../types';
import { OverviewInfo } from './CommercialDashboardOverviewInfo';
import { usePavilionOccupancy } from './usePavilionOccupancy';
import { buildPavilionAnnotationLayout } from './pavilionAnnotationLayout';
import { buildOccupancyVisualScopes, buildPavilionOccupancyGroups, occupancyMatchesInventory, occupancyLotList, OCCUPANCY_STATE_LABEL, type OccupancyOrder, type PavilionOccupancy } from './pavilionOccupancy';
import './pavilion-occupancy.css';
import { projectPavilionAccessMarkers } from './pavilionAccessGeometry';

interface PavilionProps {
  snapshot: CommercialPavilionDashboardSnapshot;
  onViewLot: (id: string) => void;
  selection?: { entityId: string | null; onChange: (id: string | null) => void };
  highlightedStatus?: CommercialStatus | null;
  hideStatusLegend?: boolean;
  presentationMemory?: MiniMapPresentationMemory;
  projectId?: string;
  dataUpdatedAt?: number;
  canManageSales?: boolean;
  onOpenOrder?: (order: OccupancyOrder) => void;
}
function ConnectedPavilion(props: PavilionProps & { projectId: string }) {
  const occupancy = usePavilionOccupancy(props.projectId, props.snapshot, props.dataUpdatedAt ?? 0);
  return <PavilionWorkspace {...props} payload={occupancy.payload} exportBlocked={occupancy.isRefreshing} message={occupancy.message} onRetry={() => void occupancy.retry()} />;
}
export default function CommercialDashboardPavilion(props: PavilionProps) {
  return props.projectId && props.snapshot.entity ? <ConnectedPavilion {...props} projectId={props.projectId} />
    : <PavilionWorkspace {...props} message="Os vínculos empresariais exigem uma consulta autenticada do pavilhão." />;
}
/** Data and geometry live above the dialog. Only the presentation surface moves. */
export function PavilionWorkspace({ snapshot, onViewLot, selection, highlightedStatus, presentationMemory, hideStatusLegend = false,
  payload, message, onRetry, canManageSales, onOpenOrder, exportBlocked = false }: PavilionProps & { payload?: PavilionOccupancy; exportBlocked?: boolean; message?: string | null; onRetry?: () => void }) {
  const geometry = useMemo(() => buildDashboardPavilionGeometry(snapshot), [snapshot]);
  const projected = useMemo(() => getCommercialMiniMapGeometry(geometry.records, geometry.outlines, geometry.contentEnvelope), [geometry]);
  const accessBounds = useMemo(() => projectPavilionAccessMarkers(projected, geometry.accesses).map(marker => marker.bounds), [projected, geometry.accesses]);
  const coherentPayload = useMemo(() => payload && occupancyMatchesInventory(payload, snapshot.records.map(r => r.lot)) ? payload : undefined, [payload, snapshot.records]);
  const occupancyLots = coherentPayload?.lots, contractsAccessible = coherentPayload?.contractsAccessible;
  const groups = useMemo(() => occupancyLots ? buildPavilionOccupancyGroups({ lots: occupancyLots, contractsAccessible }) : [], [occupancyLots, contractsAccessible]);
  const [fullscreen, setFullscreen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showCompanies, setShowCompanies] = useState(true);
  const [showConnections, setShowConnections] = useState(true);
  const [filter, setFilter] = useState<'all' | 'SOLD' | 'SALE_OPEN'>('all');
  const [search, setSearch] = useState('');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [contractScopeId, setContractScopeId] = useState<string | null>(null);
  const [localSelection, setLocalSelection] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const memory = useRef<MiniMapPresentationMemory>(presentationMemory ?? {});
  const localEntityId = selection ? selection.entityId : localSelection;
  const selected = groups.find(group => group.items.some(item => item.entityId === localEntityId)) ?? groups.find(group => group.id === companyId) ?? null;
  const scopes = useMemo(() => buildOccupancyVisualScopes(groups), [groups]);
  const selectedScope = scopes.find(scope => localEntityId ? scope.items.some(item => item.entityId === localEntityId) : scope.id === contractScopeId) ?? null;
  const selectLot = useCallback((id: string | null) => {
    setCompanyId(null);
    setContractScopeId(null);
    if (selection) selection.onChange(id); else setLocalSelection(id);
  }, [selection]);
  const selectCompany = useCallback((id: string, scopeId?: string) => {
    const toggleOff = companyId === id && contractScopeId === (scopeId ?? null) && !localEntityId;
    setCompanyId(toggleOff ? null : id); setContractScopeId(toggleOff ? null : scopeId ?? null);
    if (selection) selection.onChange(null); else setLocalSelection(null);
    setPanelOpen(true);
  }, [selection, companyId, contractScopeId, localEntityId]);
  const visibleGroups = useMemo(() => groups.filter(group => group.name.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')))
    .map(group => filter === 'all' ? group : { ...group, items: group.items.filter(item => item.status === filter) }).filter(group => group.items.length), [groups, search, filter]);
  const layout = useMemo(() => showCompanies ? buildPavilionAnnotationLayout(projected, visibleGroups, selected?.id ?? null, 8, accessBounds, selectedScope?.id ?? null) : undefined,
    [projected, visibleGroups, selected?.id, selectedScope?.id, showCompanies, accessBounds]);
  const companyEntityIds = useMemo(() => selected ? new Set((selectedScope?.items ?? selected.items).map(item => item.entityId)) : undefined, [selected, selectedScope]);
  const items = useMemo(() => {
    const byEntity = new Map(groups.flatMap(group => group.items.map(item => [item.entityId, group] as const)));
    return geometry.records.map(record => {
      const group = byEntity.get(record.entity.id);
      return group ? { ...record, lot: { ...record.lot, currentBuyer: group.state === 'REVIEW' ? null : group.name, buyerConflict: group.state === 'REVIEW' } } : record;
    });
  }, [geometry.records, groups]);
  const hasReferenceDetails = geometry.referenceCount !== snapshot.totalLots || geometry.pending.length > 0;
  const restore = () => {
    setShowCompanies(true); setShowConnections(true); setFilter('all'); setSearch(''); setCompanyId(null); selectLot(null);
    document.querySelector<HTMLButtonElement>(`${fullscreen ? '.pavilion-fullscreen' : '[data-dashboard-pavilion="' + snapshot.definition.publicIdentifier + '"]'} .commercial-dashboard-map-fit`)?.click();
  };
  const exportPdf = async () => {
    if (!coherentPayload || exporting || exportBlocked) return;
    setExporting(true); setExportError(null);
    const source = { snapshot, payload: coherentPayload, geometry: projected, accesses: geometry.accesses };
    try {
      await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
      const { createPavilionPdf } = await import('./pavilionPdf');
      const pdf = await createPavilionPdf(source.snapshot, source.payload, source.geometry, source.accesses);
      pdf.save(`fenasoja-2028-pavilhao-${snapshot.definition.pavilionNumber}.pdf`);
    } catch (error) { setExportError(error instanceof Error ? error.message : 'Não foi possível gerar o PDF.'); }
    finally { setExporting(false); }
  };
  const options = <details className="pavilion-options" open={optionsOpen} onToggle={event => setOptionsOpen(event.currentTarget.open)}
    data-commercial-map-escape-priority={optionsOpen ? 'true' : undefined}
    onKeyDown={event => { if (event.key === 'Escape' && optionsOpen) { event.preventDefault(); event.stopPropagation(); setOptionsOpen(false); } }}>
    <summary><Settings2 aria-hidden="true" />Visualização</summary>
    <div><label><input type="checkbox" checked={showCompanies} onChange={e => setShowCompanies(e.target.checked)} />Mostrar empresas</label>
      <label><input type="checkbox" checked={showConnections} onChange={e => setShowConnections(e.target.checked)} />Mostrar conexões</label>
      <label>Situação comercial<select value={filter} onChange={e => { setFilter(e.target.value as typeof filter); selectLot(null); }}>
        <option value="all">Todos os espaços</option><option value="SOLD">Apenas vendidos</option><option value="SALE_OPEN">Apenas vendas em andamento</option>
      </select></label><button type="button" onClick={restore}>Restaurar visualização padrão</button></div>
  </details>;
  const panel = <aside className="pavilion-companies" aria-label="Expositores e vínculos contratuais" hidden={!panelOpen}>
    <label className="pavilion-search">Identificar empresa pelo nome<input type="search" value={search} onChange={e => { setSearch(e.target.value); selectLot(null); }} placeholder="Buscar expositor…" /></label>
    {selected && <article className="pavilion-company-detail" aria-live="polite">
      <header><span>Grupo {selected.marker}</span><button type="button" aria-label="Limpar seleção da empresa" onClick={() => { setCompanyId(null); selectLot(null); }}><X aria-hidden="true" /></button></header>
      <h4>{selected.name}</h4><p>{occupancyLotList(selected.items)}</p><strong>{OCCUPANCY_STATE_LABEL[selected.state]}</strong>
      {selectedScope?.kind === 'CONTRACT' && <p className="pavilion-selected-contract">{selectedScope.marker} · {selectedScope.label} · {selectedScope.items.length} lotes em destaque</p>}
      {!selected.verified && <p>Identidade não verificada. O agrupamento se limita ao pedido ou registro persistido.</p>}
      <details className="pavilion-company-contracts"><summary>Contratos e lotes vinculados</summary>
      {selected.orders.map(order => <div className="pavilion-order" key={order.id}>
        <strong>{order.orderId ? `Pedido ${order.orderId.slice(0, 8).toUpperCase()}` : 'Venda individual'}</strong>
        <span>{OCCUPANCY_STATE_LABEL[order.state]} · {occupancyLotList(order.items)}</span>
        {coherentPayload?.contractsAccessible ? order.contracts.length ? order.contracts.map(contract => <button type="button" className="pavilion-contract-choice" key={contract.id}
          aria-pressed={selectedScope?.id === `contract:${contract.id}`} onClick={() => selectCompany(selected.id, `contract:${contract.id}`)}>
          {scopes.find(scope => scope.id === `contract:${contract.id}`)?.marker} · Contrato {contract.number || 'sem número'} · {OCCUPANCY_STATE_LABEL[contract.state]} · {occupancyLotList(contract.items)}
        </button>) : <span>Sem contrato vinculado</span> : <span>Referências contratuais restritas</span>}
        {canManageSales && onOpenOrder && <button type="button" onClick={() => { setFullscreen(false); onOpenOrder(order); }}>Consultar venda e contratos</button>}
      </div>)}
      <div className="pavilion-linked-lots">{selected.items.map(item => <button type="button" key={item.lotId} onClick={() => selectLot(item.entityId)}>
        Lote {item.number ?? 'sem número'} · {OCCUPANCY_STATE_LABEL[item.state]}
      </button>)}</div>
      </details>
    </article>}
    <div className="pavilion-company-list">{visibleGroups.map(group => <button type="button" key={group.id} aria-pressed={selected?.id === group.id} onClick={() => selectCompany(group.id)}>
      <span className="pavilion-company-marker">{group.marker}</span><span><strong>{group.name}</strong><small>{occupancyLotList(group.items, 8)}</small>
        <small>{group.items.length} {group.items.length === 1 ? 'lote' : 'lotes'} · {OCCUPANCY_STATE_LABEL[group.state]}</small>{!group.verified && <small>Identidade não verificada</small>}</span>
    </button>)}</div>
    {coherentPayload && !visibleGroups.length && <p>Nenhum vínculo comercial neste filtro.</p>}
  </aside>;
  const content = <div className={`pavilion-plan-layout${panelOpen ? ' has-company-panel' : ''}`}>
    <div className="pavilion-plan-main">
      <CommercialMiniMap items={items} title={snapshot.definition.officialName}
        presentation="pavilion" className="commercial-dashboard-pavilion-plan" contentEnvelope={geometry.contentEnvelope}
        numberLabelPixels={fullscreen ? 14 : snapshot.definition.pavilionNumber === 1 ? 14 : 11}
        outlines={geometry.outlines} accesses={geometry.accesses} numbered onViewLot={onViewLot}
        selection={{ entityId: localEntityId, onChange: selectLot }} presentationMemory={memory.current}
        highlightedStatus={highlightedStatus} hideStatusLegend={fullscreen ? false : hideStatusLegend}
        annotationLayout={layout} selectedCompanyId={selected?.id} selectedAnnotationScopeId={selectedScope?.id} onSelectCompany={selectCompany} companyEntityIds={companyEntityIds}
        commercialFilter={filter} showAnnotationConnections={showConnections} />
      {coherentPayload && <p className="pavilion-topology-key"><span><i />Contorno por contrato</span><span><i className="is-unverified" />Vínculo sem abrangência contratual verificada</span></p>}
      {layout && layout.hiddenLabels > 0 && <p className="pavilion-density-note">{layout.hiddenLabels} conjuntos adicionais na lista de expositores. Selecione uma empresa ou contrato para identificar seus lotes na planta.</p>}
    </div>{panel}
  </div>;
  const actions = <><button type="button" onClick={() => setPanelOpen(open => !open)} aria-expanded={panelOpen}>
    {panelOpen ? <PanelRightClose aria-hidden="true" /> : <PanelRightOpen aria-hidden="true" />}Expositores ({groups.length})</button>{options}
    <button type="button" onClick={exportPdf} disabled={!coherentPayload || exporting || exportBlocked || projected.lots.length !== snapshot.totalLots}><Download aria-hidden="true" />{exporting ? 'Gerando PDF…' : 'Baixar planta em PDF'}</button></>;
  return <div className="pavilion-workspace" data-dashboard-pavilion={snapshot.definition.publicIdentifier}>
    {!snapshot.totalLots && <p className="commercial-dashboard-empty">Nenhum módulo comercial ativo carregado neste pavilhão.</p>}
    <Dialog.Root open={fullscreen} onOpenChange={setFullscreen}>
      <div className="pavilion-toolbar"><span className="pavilion-toolbar-title"><Building2 aria-hidden="true" />Ocupação comercial</span>
        <div>{!fullscreen && actions}<Dialog.Trigger asChild><button type="button" onClick={() => setPanelOpen(true)}><Maximize2 aria-hidden="true" />Tela cheia</button></Dialog.Trigger></div>
      </div>
      {message && <p className="pavilion-sync-message" role="status">{message}{onRetry && <button type="button" onClick={onRetry}>Atualizar vínculos</button>}</p>}
      {exportError && <p role="alert" className="pavilion-sync-message">{exportError}</p>}
      {!fullscreen && content}
      <Dialog.Portal><Dialog.Overlay className="pavilion-fullscreen-overlay" />
        <Dialog.Content className="pavilion-fullscreen pavilion-workspace" aria-describedby="pavilion-fullscreen-description"
          onEscapeKeyDown={event => { if (document.querySelector('.pavilion-fullscreen [data-commercial-map-escape-priority="true"]')) event.preventDefault(); }}>
          <header className="pavilion-fullscreen-header"><div><span className="pavilion-fullscreen-brand">FENASOJA <b>2028</b></span>
            <Dialog.Title>{snapshot.definition.officialName}</Dialog.Title><Dialog.Description id="pavilion-fullscreen-description">
              {snapshot.totalLots} lotes · {groups.filter(group => group.verified).length} expositores identificados · {groups.length} agrupamentos
            </Dialog.Description></div><Dialog.Close asChild><button type="button" className="pavilion-fullscreen-close"><X aria-hidden="true" />Fechar tela cheia</button></Dialog.Close></header>
          <div className="pavilion-toolbar"><div>{actions}</div></div>
          {message && <p role="status" className="pavilion-sync-message">{message}</p>}{exportError && <p role="alert">{exportError}</p>}
          {fullscreen && content}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    {hasReferenceDetails && <div className="commercial-dashboard-pavilion-reference-note">
      <OverviewInfo label={`Informações da referência de ${snapshot.definition.officialName}`}
        title="Referência da planta" lead="A planta mantém os espaços do cadastro ativo carregado."
        facts={[["Módulos na referência", geometry.referenceCount], ["Registros ativos carregados", snapshot.totalLots]]}
        note={geometry.pending.length ? geometry.pending.join(' ') : 'A referência e o cadastro carregado possuem contagens diferentes. Os indicadores usam somente o cadastro ativo.'} />
    </div>}
  </div>;
}
