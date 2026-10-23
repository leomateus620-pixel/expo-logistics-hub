import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefCallback,
} from 'react';
import { AlertTriangle, Network } from 'lucide-react';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import type { OrganizationalGraph, OrgNode } from '../types';
import {
  calculateOrganizationalLayout,
  findDirectionalNode,
  type OrgNavigationDirection,
} from '../layout/organizationalLayout';
import {
  useOrgGraphInteraction,
  type OrgGraphFilter,
} from '../hooks/useOrgGraphInteraction';
import { useOrgPerformanceTelemetry } from '../hooks/useOrgPerformanceTelemetry';
import { useOrgPresentation } from '../hooks/useOrgPresentation';
import { useOrgViewport, type OrgViewportCamera, type ViewportSize } from '../hooks/useOrgViewport';
import { OrganizationalNode } from './OrganizationalNode';
import { OrgFilterBar, OrgViewportControls } from './OrgControls';
import { PersonDetailPanel } from './PersonDetailPanel';
import { RelationshipLayer } from './RelationshipLayer';
import { SoybeanAtmosphere } from './SoybeanAtmosphere';
import '../organizational-ecosystem.css';

export interface OrganizationalEcosystemProps {
  active?: boolean;
  className?: string;
  error?: Error | string | null;
  graph?: OrganizationalGraph | null;
  initialSelectedNodeId?: string | null;
  loading?: boolean;
  onReady?: () => void;
  onRetry?: () => void;
  onSelectedNodeChange?: (node: OrgNode | null) => void;
}

interface GraphReadyProps extends Omit<OrganizationalEcosystemProps, 'error' | 'graph' | 'loading'> {
  graph: OrganizationalGraph;
}

const ARROW_DIRECTIONS: Partial<Record<string, OrgNavigationDirection>> = {
  ArrowUp: 'up',
  ArrowRight: 'right',
  ArrowDown: 'down',
  ArrowLeft: 'left',
};

function hasRenderableOrganization(graph: OrganizationalGraph | null): graph is OrganizationalGraph {
  if (!graph) return false;
  const allowedNodeIds = new Set(graph.renderableNodeIds);
  const renderableNodes = graph.nodes.filter((node) => node.isRenderable && allowedNodeIds.has(node.id));
  if (renderableNodes.length === 0) return false;
  if (renderableNodes.length > 1) return true;

  const onlyNode = renderableNodes[0];
  if (onlyNode.id !== graph.rootNodeId) return true;
  return onlyNode.personIds.length > 0
    || onlyNode.responsibilities.length > 0
    || graph.edges.some((edge) => edge.sourceId === onlyNode.id || edge.targetId === onlyNode.id);
}

function GraphReady({
  active = true,
  graph,
  initialSelectedNodeId,
  onReady,
  onSelectedNodeChange,
}: GraphReadyProps) {
  const performanceTelemetryRef = useOrgPerformanceTelemetry(active);
  const renderableNodeIds = useMemo(() => new Set(graph.renderableNodeIds), [graph.renderableNodeIds]);
  const renderableNodes = useMemo(() => graph.nodes.filter((node) => (
    node.isRenderable && renderableNodeIds.has(node.id)
  )), [graph.nodes, renderableNodeIds]);
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: window.innerWidth, height: window.innerHeight });
  const [page, setPage] = useState(0);
  const [presentationKeyboardId, setPresentationKeyboardId] = useState<string | null>(null);
  const presentation = useOrgPresentation(active);
  const interaction = useOrgGraphInteraction({
    graph,
    initialSelectedNodeId,
    onSelectedNodeChange,
  });
  const layout = useMemo(
    () => calculateOrganizationalLayout(renderableNodes, graph.edges, {
      viewportWidth: viewportSize.width, viewportHeight: viewportSize.height,
      availableWidth: viewportSize.availableWidth, availableHeight: viewportSize.availableHeight,
      people: graph.people, filter: interaction.filter, page,
    }),
    [graph.edges, graph.people, renderableNodes, viewportSize, interaction.filter, page],
  );
  const {
    clearSelection,
    selectNode: commitSelection,
    selectedNodeId,
    setFilter,
    setHoveredNodeId,
    setKeyboardNodeId,
    visualStateById,
  } = interaction;
  const originGroup = useRef<string | null>(null);
  const cameraBeforeDetails = useRef<OrgViewportCamera | null>(null);
  const bottomControlsRef = useRef<HTMLDivElement>(null);
  const topControlsRef = useRef<HTMLDivElement>(null);
  const nodeElements = useRef(new Map<string, HTMLButtonElement>());
  const nodeRefCallbacks = useRef(new Map<string, RefCallback<HTMLButtonElement>>());
  const handleBackgroundPress = useCallback(() => {
    clearSelection();
  }, [clearSelection]);
  const viewport = useOrgViewport({
    bounds: layout.bounds,
    topControlsRef,
    bottomControlsRef,
    minimumInteractiveScale: layout.minimumScale,
    detailOpen: Boolean(interaction.selectedNode),
    resizeFocusPoint: selectedNodeId ? layout.nodeById.get(selectedNodeId) : null,
    onBackgroundPress: handleBackgroundPress,
    onViewportSizeChange: useCallback((size: ViewportSize) => {
      setViewportSize(previous => previous.width === size.width && previous.height === size.height
        && previous.availableWidth === size.availableWidth && previous.availableHeight === size.availableHeight ? previous : size);
    }, []),
  });
  const { camera, fit: fitViewport, focusPoint } = viewport;
  const modeKey = `${interaction.filter}:${layout.grouped}:${layout.page}:${viewportSize.width}:${viewportSize.height}:${viewportSize.availableHeight}`;
  const previousMode = useRef(modeKey);
  const measuredOnce = useRef(false);
  useEffect(() => {
    if (previousMode.current === modeKey) return;
    previousMode.current = modeKey;
    if (!measuredOnce.current) {
      if (viewportSize.availableHeight !== undefined) measuredOnce.current = true;
      return;
    }
    presentation.complete();
    fitViewport();
  }, [modeKey, fitViewport, presentation.complete, viewportSize.availableHeight]);

  const getNodeRef = useCallback((nodeId: string): RefCallback<HTMLButtonElement> => {
    const known = nodeRefCallbacks.current.get(nodeId);
    if (known) return known;
    const callback: RefCallback<HTMLButtonElement> = (element) => {
      if (element) nodeElements.current.set(nodeId, element);
      else nodeElements.current.delete(nodeId);
    };
    nodeRefCallbacks.current.set(nodeId, callback);
    return callback;
  }, []);

  const focusNode = useCallback((nodeId: string, preferredScale?: number, withPanel?: boolean) => {
    const position = layout.nodeById.get(nodeId);
    if (position) focusPoint(position, preferredScale, withPanel);
  }, [focusPoint, layout.nodeById]);

  const selectNode = useCallback((nodeId: string) => {
    presentation.complete();
    const item = layout.nodeById.get(nodeId);
    const groupFilter = item?.node.metadata.presentationFilter;
    if (groupFilter === 'commission' || groupFilter === 'advisory') {
      originGroup.current = nodeId;
      clearSelection(); setPresentationKeyboardId(null); setPage(0); setFilter(groupFilter);
      const first = renderableNodes.find(node => node.type === groupFilter)?.id;
      if (first) window.requestAnimationFrame(() => nodeElements.current.get(first)?.focus({ preventScroll: true }));
      return;
    }
    if (!interaction.selectedNode) cameraBeforeDetails.current = viewport.getCamera();
    commitSelection(nodeId);
    focusNode(nodeId, undefined, true);
  }, [commitSelection, focusNode, presentation.complete, layout.nodeById, clearSelection, setFilter, interaction.selectedNode, viewport.getCamera, renderableNodes]);

  const closeDetails = useCallback(() => {
    const nodeId = selectedNodeId;
    clearSelection();
    if (cameraBeforeDetails.current) viewport.restoreCamera(cameraBeforeDetails.current);
    if (!nodeId) return;
    window.requestAnimationFrame(() => {
      nodeElements.current.get(nodeId)?.focus({ preventScroll: true });
    });
  }, [clearSelection, selectedNodeId, viewport.restoreCamera]);

  const handleNodeFocus = useCallback((nodeId: string) => {
    setPresentationKeyboardId(nodeId);
    if (!nodeId.startsWith('presentation:')) setKeyboardNodeId(nodeId);
    setHoveredNodeId(nodeId);
  }, [setHoveredNodeId, setKeyboardNodeId]);

  const handleNodeBlur = useCallback((nodeId: string) => {
    setHoveredNodeId((current) => current === nodeId ? null : current);
  }, [setHoveredNodeId]);

  const handleNodeKeyDown = useCallback((
    event: KeyboardEvent<HTMLButtonElement>,
    currentNodeId: string,
  ) => {
    const direction = ARROW_DIRECTIONS[event.key];
    if (direction) {
      event.preventDefault();
      let candidate = findDirectionalNode(layout, currentNodeId, direction);
      const visited = new Set<string>();
      while (candidate && (candidate.context || visualStateById.get(candidate.node.id)?.filtered)) {
        if (visited.has(candidate.node.id)) {
          candidate = null;
          break;
        }
        visited.add(candidate.node.id);
        candidate = findDirectionalNode(layout, candidate.node.id, direction);
      }
      if (!candidate) return;
      setPresentationKeyboardId(candidate.node.id);
      if (!candidate.node.id.startsWith('presentation:')) setKeyboardNodeId(candidate.node.id);
      nodeElements.current.get(candidate.node.id)?.focus({ preventScroll: true });
      const currentCamera = viewport.getCamera();
      const targetX = candidate.x * currentCamera.scale + currentCamera.x;
      const targetY = candidate.y * currentCamera.scale + currentCamera.y;
      if (targetX < 24 || targetX > viewportSize.width - 24 || targetY < 100 || targetY > viewportSize.height - 80) focusPoint(candidate);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      const rootId = graph.rootNodeId || layout.nodes[0]?.node.id;
      if (!rootId) return;
      setKeyboardNodeId(rootId);
      window.requestAnimationFrame(() => nodeElements.current.get(rootId)?.focus({ preventScroll: true }));
      setPresentationKeyboardId(null); setPage(0); setFilter('all'); fitViewport();
      return;
    }

    if (event.key === 'Escape' && selectedNodeId) {
      event.preventDefault();
      event.stopPropagation();
      closeDetails();
    }
  }, [
    closeDetails,
    focusNode,
    graph.rootNodeId,
    layout,
    focusPoint,
    selectedNodeId,
    setKeyboardNodeId,
    visualStateById,
    viewport.getCamera, viewportSize, fitViewport, setFilter,
  ]);

  const handleFilterChange = useCallback((filter: OrgGraphFilter) => {
    presentation.complete(); clearSelection(); setPresentationKeyboardId(null); setPage(0); setFilter(filter);
  }, [setFilter, clearSelection, presentation.complete]);

  useEffect(() => {
    if (!active || layout.nodes.length === 0) return undefined;
    const readyFrame = window.requestAnimationFrame(() => onReady?.());
    return () => window.cancelAnimationFrame(readyFrame);
  }, [active, layout.nodes.length, onReady]);

  const presentationVisualStates = useMemo(() => new Map([...visualStateById].map(([id, state]) => [
    id, layout.nodeById.get(id)?.context ? { ...state, filtered: false, muted: false } : state,
  ])), [layout.nodeById, visualStateById]);

  const integrityWarningCount = useMemo(
    () => graph.anomalies.filter((item) => item.severity === 'warning').length,
    [graph.anomalies],
  );

  return (
    <div
      ref={performanceTelemetryRef}
      className="org-ecosystem__ready"
      data-active={active || undefined}
      data-presentation={presentation.presenting ? 'playing' : 'complete'}
      data-layout-mode={layout.grouped ? 'groups' : 'individual'}
      onPointerDownCapture={presentation.complete}
      onWheelCapture={presentation.complete}
      data-camera-animating={viewport.isAnimating || undefined}
      data-camera-interacting={viewport.isInteracting || undefined}
      data-integrity-info-count={graph.anomalies.length - integrityWarningCount}
      data-integrity-warning-count={integrityWarningCount}
      data-available-height={viewportSize.availableHeight}
      data-layout-height={layout.bounds.height}
      data-layout-width={layout.bounds.width}
      data-viewport-scale={camera.scale.toFixed(3)}
      data-selection-person={interaction.selectedPersonId ?? undefined}
      style={{ '--org-viewport-scale': camera.scale } as CSSProperties}
      data-org-detail-open={interaction.selectedNode ? 'true' : undefined}
      aria-hidden={!active}
      onKeyDownCapture={(event) => {
        if (event.key !== 'Escape') presentation.complete();
        if (event.key !== 'Escape' || !interaction.selectedNode) return;
        event.preventDefault();
        event.stopPropagation();
        closeDetails();
      }}
    >
      <div ref={topControlsRef} className="org-ecosystem__top-controls" data-org-interactive>
        <header className="org-ecosystem__masthead" data-org-interactive>
          <div className="org-ecosystem__title">
            <FenasojaBrand
              className="org-ecosystem__brand"
              compact
              tone="dark"
              markSrc="/alvorada/fenasoja-symbol-official.png"
            />
            <h1>Ecossistema</h1>
          </div>
        </header>
        <OrgFilterBar compact={viewportSize.width < 1150} filter={interaction.filter} onFilterChange={handleFilterChange} />
      </div>

      <div
        ref={viewport.viewportRef}
        className="org-viewport"
        role="group"
        aria-label="MAPA INTERATIVO DA ORGANIZAÇÃO FENASOJA 2028"
        aria-describedby="org-viewport-instructions"
        onPointerCancel={viewport.onPointerCancel}
        onPointerDown={viewport.onPointerDown}
        onPointerMove={viewport.onPointerMove}
        onPointerUp={viewport.onPointerUp}
        onWheel={viewport.onWheel}
      >
        <div
          className="org-viewport__world"
          style={{
            ...viewport.cameraStyle,
            width: layout.bounds.width,
            height: layout.bounds.height,
          }}
        >
          <RelationshipLayer
            active={active}
            presenting={presentation.presenting}
            activeEdgeIds={interaction.activeEdgeIds}
            selectionActive={Boolean(interaction.selectedNode)}
            layout={layout}
            visualStateById={presentationVisualStates}
          />
          <div className="org-viewport__nodes">
            {layout.nodes.map((position) => (
              <OrganizationalNode
                key={position.node.id}
                active={active}
                presenting={presentation.presenting}
                elapsed={presentation.elapsed}
                buttonRef={getNodeRef(position.node.id)}
                keyboardActive={active && ((presentationKeyboardId ?? interaction.keyboardNodeId) === position.node.id || (!layout.nodeById.has(presentationKeyboardId ?? interaction.keyboardNodeId ?? '') && position === layout.nodes[0]))}
                people={graph.people}
                selectedPersonId={interaction.selectedPersonId}
                position={position}
                state={position.context ? { filtered: false, hovered: false, muted: false, related: false, selected: false } : visualStateById.get(position.node.id) ?? {
                  filtered: false,
                  hovered: false,
                  muted: false,
                  related: false,
                  selected: false,
                }}
                onBlur={handleNodeBlur}
                onFocus={handleNodeFocus}
                onHover={setHoveredNodeId}
                onKeyDown={handleNodeKeyDown}
                onSelect={selectNode}
              />
            ))}
          </div>
        </div>
      </div>

      <p id="org-viewport-instructions" className="sr-only">
        Arraste para navegar, use a roda ou o gesto de pinça para ampliar. Com o teclado,
        use as setas para percorrer as estruturas, Enter para selecionar e Home para retornar ao CCPF.
      </p>

      {presentation.presenting && <button className="org-presentation-skip" data-org-interactive onClick={presentation.complete}>Pular apresentação</button>}
      <div className="org-bottom-bar" ref={bottomControlsRef} data-org-interactive>
        {interaction.filter !== 'all' && <button className="org-overview-return" onClick={() => { handleFilterChange('all'); window.requestAnimationFrame(() => { const id = originGroup.current ?? graph.rootNodeId; setPresentationKeyboardId(id); nodeElements.current.get(id)?.focus({ preventScroll: true }); }); }}>Ver todo o ecossistema</button>}
        {layout.pageCount > 1 && <nav className="org-pages" aria-label="Páginas de unidades">
          <button disabled={layout.page === 0} onClick={() => { clearSelection(); setPage(layout.page - 1); }}>Anterior</button>
          <span>{layout.page + 1} / {layout.pageCount} · {layout.unitCount} unidades</span>
          <button disabled={layout.page + 1 >= layout.pageCount} onClick={() => { clearSelection(); setPage(layout.page + 1); }}>Próxima</button>
        </nav>}

      <OrgViewportControls
        fitLabel={interaction.filter === 'all' ? 'Enquadrar todo o ecossistema' : 'Enquadrar visão atual'}
        scale={viewport.camera.scale}
        selected={Boolean(interaction.selectedNode)}
        onClearSelection={() => {
          clearSelection();
          fitViewport();
        }}
        onFit={fitViewport}
        onFocusSelected={() => {
          if (selectedNodeId) focusNode(selectedNodeId);
        }}
        onZoomIn={() => {
          viewport.zoomBy(1.2);
        }}
        onZoomOut={() => {
          viewport.zoomBy(1 / 1.2);
        }}
      />

      </div>

      {interaction.selectedNode && (
        <PersonDetailPanel
          graph={graph}
          node={interaction.selectedNode}
          selectedPersonId={interaction.selectedPersonId}
          onPersonSelect={(personId) => {
            if (selectedNodeId) commitSelection(selectedNodeId, personId);
          }}
          onClose={closeDetails}
        />
      )}

      <p className="org-ecosystem__selection-announcement" aria-live="polite">
        {interaction.selectedNode
          ? `${interaction.selectedNode.title} selecionada. Detalhes exibidos.`
          : interaction.filter === 'all' ? 'Visão geral do ecossistema.' : `${layout.unitCount || layout.nodes.filter(item => !item.context).length} estruturas. Página ${layout.page + 1} de ${layout.pageCount}.`}
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="org-ecosystem__state org-ecosystem__state--loading" role="status" aria-live="polite">
      <span className="org-ecosystem__loading-network" aria-hidden="true">
        <i /><i /><i /><i /><i />
      </span>
      <strong>CARREGANDO O ECOSSISTEMA</strong>
      <span>Validando vínculos e retratos institucionais</span>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="org-ecosystem__state org-ecosystem__state--error" role="alert">
      <AlertTriangle aria-hidden="true" />
      <strong>A estrutura organizacional não pôde ser carregada</strong>
      <span>Os dados do Portal permanecem protegidos. Tente novamente em instantes.</span>
      {onRetry && <button type="button" onClick={onRetry}>Tentar novamente</button>}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="org-ecosystem__state org-ecosystem__state--empty" role="status">
      <Network aria-hidden="true" />
      <strong>Estrutura em preparação</strong>
      <span>Nenhum vínculo organizacional de 2028 está disponível para exibição.</span>
    </div>
  );
}

export function OrganizationalEcosystem({
  active = true,
  className,
  error = null,
  graph = null,
  loading = false,
  initialSelectedNodeId,
  onReady,
  onRetry,
  onSelectedNodeChange,
}: OrganizationalEcosystemProps) {
  const hasContent = hasRenderableOrganization(graph);
  const state = loading ? 'loading' : error ? 'error' : hasContent ? 'ready' : 'empty';

  return (
    <section
      className={`org-ecosystem${className ? ` ${className}` : ''}`}
      data-active={active || undefined}
      data-state={state}
      aria-hidden={!active}
      aria-label="Ecossistema organizacional FENASOJA 2028"
    >
      <SoybeanAtmosphere active={active} />
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState onRetry={onRetry} />
      ) : hasContent ? (
        <GraphReady
          active={active}
          graph={graph}
          initialSelectedNodeId={initialSelectedNodeId}
          onReady={onReady}
          onSelectedNodeChange={onSelectedNodeChange}
        />
      ) : (
        <EmptyState />
      )}
    </section>
  );
}

export default OrganizationalEcosystem;
