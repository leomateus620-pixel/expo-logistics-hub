import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, CarFront, Check, ChevronDown, ChevronUp, Factory, FilterX, Layers3, PanelLeftClose, PanelLeftOpen, RotateCcw, Tractor } from 'lucide-react';
import { STATUS_CONFIG } from '../../constants';
import { commercialMapSegmentInventory, type CommercialMapSegmentId } from '../../data/commercialMapSegments';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type { CommercialLot, MapEntity } from '../../types';
import { ContextualMapLegend } from '../panels/ContextualMapLegend';
import './commercial-map-dock.css';

interface CommercialMapDockProps {
  entities: readonly MapEntity[];
  lots: readonly CommercialLot[];
  activeSegmentId: CommercialMapSegmentId | null;
  onSegmentSelect: (id: CommercialMapSegmentId) => void;
  onSegmentClear: () => void;
  scopeTitle?: string;
  isCommissionScope: boolean;
  interiorEntity?: MapEntity | null;
  matchingEntityIds?: ReadonlySet<string>;
  filtersActive?: boolean;
  moduleCard?: ReactNode;
}

const COMPACT_QUERY = '(max-width: 720px), (max-width: 950px) and (max-height: 520px)';

/** One contextual panel, rendered as a rail or a nonmodal sheet. */
export function CommercialMapDock({ entities, lots, activeSegmentId, onSegmentSelect, onSegmentClear,
  scopeTitle, isCommissionScope, interiorEntity = null, matchingEntityIds, filtersActive, moduleCard,
}: CommercialMapDockProps) {
  const dockExpanded = useCommercialMapStore((s) => s.dockExpanded);
  const setDockExpanded = useCommercialMapStore((s) => s.setDockExpanded);
  const selectedModuleId = useCommercialMapStore((s) => s.selectedModuleId);
  const selectedEntityId = useCommercialMapStore((s) => s.selectedEntityId);
  const activePanel = useCommercialMapStore((s) => s.activePanel);
  const mode = useCommercialMapStore((s) => s.workspaceMode);
  const exitInterior = useCommercialMapStore((s) => s.exitInterior);
  const statusFilters = useCommercialMapStore((s) => s.statusFilters);
  const clearStatuses = useCommercialMapStore((s) => s.clearStatuses);
  const [compact, setCompact] = useState(() => window.matchMedia(COMPACT_QUERY).matches);
  const [sheet, setSheet] = useState<'collapsed' | 'summary' | 'expanded'>('collapsed');
  const [interiorExpanded, setInteriorExpanded] = useState(true);
  const [moduleLegendOpen, setModuleLegendOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const dragStart = useRef<number | null>(null);
  const expanded = interiorEntity ? interiorExpanded : dockExpanded;
  const inventory = useMemo(() => commercialMapSegmentInventory(entities, lots).filter(({ segment }) =>
    segment.behavior.visibleByDefault || segment.behavior.interaction !== 'informational'), [entities, lots]);
  const activeSegment = inventory.find(({ segment }) => segment.id === activeSegmentId)?.segment;
  const interiorId = interiorEntity?.id;

  useEffect(() => {
    const query = window.matchMedia(COMPACT_QUERY);
    const sync = () => setCompact(query.matches);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    setSheet(interiorId ? 'summary' : 'collapsed');
    setInteriorExpanded(true);
  }, [interiorId]);
  useEffect(() => {
    if (selectedModuleId) setSheet('summary');
    setModuleLegendOpen(false);
  }, [interiorId, selectedModuleId]);
  useEffect(() => {
    if (compact && mode === 'list') setSheet('collapsed');
  }, [compact, mode]);
  useEffect(() => {
    const panel = panelRef.current;
    const expandDetails = () => { if (compact) setSheet('expanded'); };
    panel?.addEventListener('commercial-map-expand-context', expandDetails);
    return () => panel?.removeEventListener('commercial-map-expand-context', expandDetails);
  }, [compact]);
  // Report only the visible obstruction, without changing canvas size/lifecycle.
  useEffect(() => {
    const panel = panelRef.current;
    const shell = panel?.closest<HTMLElement>('.commercial-map-shell');
    if (!panel || !shell) return;
    const publish = () => {
      const height = compact && panel.getClientRects().length ? panel.getBoundingClientRect().height : 0;
      shell.style.setProperty('--commercial-map-context-sheet-height', `${height}px`);
      window.dispatchEvent(new Event('commercial-map-panel-resize'));
    };
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(panel);
    return () => { observer?.disconnect(); shell.style.removeProperty('--commercial-map-context-sheet-height'); };
  }, [compact, sheet, interiorEntity?.id, selectedModuleId, selectedEntityId, activePanel, mode]);

  const showContent = compact ? sheet !== 'collapsed' : expanded;
  const isModule = Boolean(interiorEntity && selectedModuleId && moduleCard);
  const returnButton = interiorEntity && <button type="button" className="commercial-map-dock__back"
    data-map-interior-back aria-keyshortcuts="Escape" onClick={exitInterior}>
    <ArrowLeft aria-hidden="true" /><span>Voltar ao mapa</span>
  </button>;
  const toggle = () => {
    if (compact) setSheet(sheet === 'expanded' ? 'summary' : 'expanded');
    else if (interiorEntity) setInteriorExpanded(!expanded);
    else setDockExpanded(!expanded);
  };
  const obscuredByDetails = compact && !interiorEntity && mode === '3d'
    && (activePanel === 'results' || (Boolean(selectedEntityId) && activePanel === 'details'));

  return <aside ref={panelRef} className={`commercial-map-dock ${compact ? 'is-mobile' : ''} ${expanded ? 'is-expanded' : 'is-compact'} ${interiorEntity ? 'is-context-interior' : ''}`}
    data-sheet-state={sheet} data-commercial-map-camera-obstruction hidden={Boolean(obscuredByDetails)} aria-label="Controles e resumo do mapa comercial"
    onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => event.stopPropagation()}>
    <div className="commercial-map-dock__head">
      {returnButton || <span className="commercial-map-dock__brand"><Layers3 aria-hidden="true" /><span>{compact && sheet === 'collapsed' ? activeSegment?.name ?? 'Segmentos e legenda' : 'Parque Fenasoja'}</span></span>}
      {compact && sheet !== 'collapsed' && <button type="button" className="commercial-map-dock__toggle" aria-label="Recolher painel do mapa" onClick={() => setSheet('collapsed')}><ChevronDown aria-hidden="true" /></button>}
      <button type="button" className="commercial-map-dock__toggle" onClick={toggle}
        aria-label={compact ? sheet === 'expanded' ? 'Resumir painel do mapa' : 'Expandir painel do mapa' : expanded ? 'Recolher painel do mapa' : 'Expandir painel do mapa'}
        aria-expanded={compact ? sheet === 'expanded' : expanded}>
        {compact ? sheet === 'expanded' ? <ChevronDown /> : <ChevronUp /> : expanded ? <PanelLeftClose /> : <PanelLeftOpen />}
      </button>
    </div>
    {compact && <div className="commercial-map-dock__drag" aria-hidden="true"
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        dragStart.current = event.clientY;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { dragStart.current = null; }}
      onLostPointerCapture={() => { dragStart.current = null; }}
      onPointerUp={(event) => {
        if (dragStart.current === null) return;
        const delta = event.clientY - dragStart.current; dragStart.current = null;
        if (Math.abs(delta) > 24) setSheet(delta < 0 ? 'expanded' : sheet === 'expanded' ? 'summary' : 'collapsed');
      }}><i /></div>}
    {showContent && <div className="commercial-map-dock__scroll">
      {!interiorEntity && !isCommissionScope && <section className="commercial-map-dock__segment-section" aria-label="Segmentos comerciais do parque">
        <div className="commercial-map-dock__segment-heading"><strong>Segmentos</strong><small>Selecione para explorar</small></div>
        <div className="commercial-map-dock__segments" role="group" aria-label="Filtrar mapa por segmento">
          {inventory.map(({ segment, lotCount }, index) => {
            const Icon = index === 0 ? Tractor : index === 1 ? Factory : CarFront;
            return <button key={segment.id} type="button" aria-pressed={activeSegmentId === segment.id}
              className={activeSegmentId === segment.id ? 'is-active' : ''} onClick={() => onSegmentSelect(segment.id)}
              disabled={segment.behavior.interaction !== 'filter-and-focus'} aria-controls="commercial-map-viewport">
              <Icon style={{ color: segment.palette.edge }} aria-hidden="true" />
              <span><strong>{segment.name}</strong><small>{lotCount} lotes</small></span>
              {activeSegmentId === segment.id && <Check aria-hidden="true" />}
            </button>;
          })}
        </div>
        <button type="button" className="commercial-map-dock__reset" disabled={!activeSegmentId} onClick={onSegmentClear}>
          <RotateCcw aria-hidden="true" />Limpar segmento
        </button>
        {statusFilters.length > 0 && <p className="commercial-map-dock__filter-note">{statusFilters.length} filtro(s) de situação ativo(s)</p>}
      </section>}
      {isModule ? <div className="commercial-map-dock__module">
        {moduleCard}
        <div className={`commercial-map-dock__module-legend${statusFilters.length && !moduleLegendOpen ? ' has-status-filter' : ''}`}>
          <details open={moduleLegendOpen} onToggle={(event) => {
            const open = event.currentTarget.open;
            setModuleLegendOpen(open);
            if (open) event.currentTarget.dispatchEvent(new Event('commercial-map-expand-context', { bubbles: true }));
          }}>
            <summary><span>Legenda do pavilhão{statusFilters.length > 0 && !moduleLegendOpen && <small>Filtro: {statusFilters.map((status) => STATUS_CONFIG[status].shortLabel).join(', ')}</small>}</span><ChevronDown aria-hidden="true" /></summary>
            {moduleLegendOpen && <ContextualMapLegend
              entities={entities} lots={lots} interiorEntity={interiorEntity} activeSegmentId={activeSegmentId}
              scopeTitle={scopeTitle} matchingEntityIds={matchingEntityIds} filtersActive={filtersActive}
              showHeading={false} />}
          </details>
          {statusFilters.length > 0 && !moduleLegendOpen && <button type="button" className="commercial-map-dock__module-clear-status"
            onClick={clearStatuses} aria-label="Limpar filtro de situação comercial" title="Limpar situação">
            <FilterX aria-hidden="true" />
          </button>}
        </div>
      </div> : <ContextualMapLegend
        entities={entities} lots={lots} interiorEntity={interiorEntity} activeSegmentId={activeSegmentId}
        scopeTitle={scopeTitle} matchingEntityIds={matchingEntityIds} filtersActive={filtersActive}
        compact={compact && sheet === 'summary'} />}
    </div>}
  </aside>;
}
