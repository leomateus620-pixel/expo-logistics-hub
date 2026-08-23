import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type RefCallback,
} from 'react';
import { AlertTriangle, Network } from 'lucide-react';
import { FenasojaBrand } from '@/components/brand/FenasojaBrand';
import { CCPF_FULL_LABEL } from '../resolver';
import type { OrganizationalGraph, OrgNode } from '../types';
import {
  calculateOrganizationalLayout,
  findDirectionalNode,
  type OrgNavigationDirection,
} from '../layout/organizationalLayout';
import {
  useOrgGraphInteraction,
  type OrgGraphFilter,
  type OrgSearchResult,
} from '../hooks/useOrgGraphInteraction';
import { useOrgPerformanceTelemetry } from '../hooks/useOrgPerformanceTelemetry';
import { useOrgViewport } from '../hooks/useOrgViewport';
import { OrganizationalNode } from './OrganizationalNode';
import { OrgFilterBar, OrgSearch, OrgViewportControls } from './OrgControls';
import { PersonDetailPanel } from './PersonDetailPanel';
import { RelationshipLayer } from './RelationshipLayer';
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

const FINAL_FIT_DELAY_MS = 2600;

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
  const layout = useMemo(
    () => calculateOrganizationalLayout(renderableNodes, graph.edges),
    [graph.edges, renderableNodes],
  );
  const interaction = useOrgGraphInteraction({
    graph,
    initialSelectedNodeId,
    onSelectedNodeChange,
  });
  const {
    clearSelection,
    selectNode: commitSelection,
    selectedNodeId,
    setFilter,
    setHoveredNodeId,
    setKeyboardNodeId,
    setQuery,
    visualStateById,
  } = interaction;
  const nodeElements = useRef(new Map<string, HTMLButtonElement>());
  const nodeRefCallbacks = useRef(new Map<string, RefCallback<HTMLButtonElement>>());
  const fitGraph = useRef<() => void>(() => undefined);
  const finalFitTimer = useRef<number | null>(null);
  const cancelFinalFit = useCallback(() => {
    if (finalFitTimer.current === null) return;
    window.clearTimeout(finalFitTimer.current);
    finalFitTimer.current = null;
  }, []);
  const handleBackgroundPress = useCallback(() => {
    clearSelection();
    fitGraph.current();
  }, [clearSelection]);
  const viewport = useOrgViewport({
    bounds: layout.bounds,
    initialFocusPoint: layout.nodeById.get(graph.rootNodeId),
    onBackgroundPress: handleBackgroundPress,
  });
  const { camera, fit: fitViewport, focusPoint } = viewport;
  fitGraph.current = fitViewport;

  useEffect(() => {
    cancelFinalFit();
    if (!active || layout.nodes.length === 0) return undefined;
    finalFitTimer.current = window.setTimeout(() => {
      finalFitTimer.current = null;
      fitViewport();
    }, FINAL_FIT_DELAY_MS);
    return cancelFinalFit;
  }, [active, cancelFinalFit, fitViewport, layout.nodes.length]);

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

  const focusNode = useCallback((nodeId: string, preferredScale?: number) => {
    const position = layout.nodeById.get(nodeId);
    if (position) focusPoint(position, preferredScale);
  }, [focusPoint, layout.nodeById]);

  const selectNode = useCallback((nodeId: string) => {
    cancelFinalFit();
    commitSelection(nodeId);
    focusNode(nodeId);
  }, [cancelFinalFit, commitSelection, focusNode]);

  const closeDetails = useCallback(() => {
    const nodeId = selectedNodeId;
    clearSelection();
    if (!nodeId) return;
    window.requestAnimationFrame(() => {
      nodeElements.current.get(nodeId)?.focus({ preventScroll: true });
    });
  }, [clearSelection, selectedNodeId]);

  const handleNodeFocus = useCallback((nodeId: string) => {
    cancelFinalFit();
    setKeyboardNodeId(nodeId);
    setHoveredNodeId(nodeId);
  }, [cancelFinalFit, setHoveredNodeId, setKeyboardNodeId]);

  const handleNodeBlur = useCallback((nodeId: string) => {
    setHoveredNodeId((current) => current === nodeId ? null : current);
  }, [setHoveredNodeId]);

  const handleNodeKeyDown = useCallback((
    event: KeyboardEvent<HTMLButtonElement>,
    currentNodeId: string,
  ) => {
    const direction = ARROW_DIRECTIONS[event.key];
    if (direction) {
      cancelFinalFit();
      event.preventDefault();
      let candidate = findDirectionalNode(layout, currentNodeId, direction);
      const visited = new Set<string>();
      while (candidate && visualStateById.get(candidate.node.id)?.filtered) {
        if (visited.has(candidate.node.id)) {
          candidate = null;
          break;
        }
        visited.add(candidate.node.id);
        candidate = findDirectionalNode(layout, candidate.node.id, direction);
      }
      if (!candidate) return;
      setKeyboardNodeId(candidate.node.id);
      nodeElements.current.get(candidate.node.id)?.focus({ preventScroll: true });
      focusPoint(candidate, 0.82);
      return;
    }

    if (event.key === 'Home') {
      cancelFinalFit();
      event.preventDefault();
      const rootId = graph.rootNodeId || layout.nodes[0]?.node.id;
      if (!rootId) return;
      setKeyboardNodeId(rootId);
      nodeElements.current.get(rootId)?.focus({ preventScroll: true });
      focusNode(rootId);
      return;
    }

    if (event.key === 'Escape' && selectedNodeId) {
      event.preventDefault();
      event.stopPropagation();
      closeDetails();
    }
  }, [
    closeDetails,
    cancelFinalFit,
    focusNode,
    graph.rootNodeId,
    layout,
    focusPoint,
    selectedNodeId,
    setKeyboardNodeId,
    visualStateById,
  ]);

  const handleSearchResult = useCallback((result: OrgSearchResult) => {
    cancelFinalFit();
    setQuery('');
    commitSelection(result.id);
    setKeyboardNodeId(result.id);
    focusNode(result.id, 0.94);
    window.requestAnimationFrame(() => nodeElements.current.get(result.id)?.focus({ preventScroll: true }));
  }, [cancelFinalFit, commitSelection, focusNode, setKeyboardNodeId, setQuery]);

  const handleQueryChange = useCallback((value: string) => {
    cancelFinalFit();
    setQuery(value);
  }, [cancelFinalFit, setQuery]);

  const handleFilterChange = useCallback((filter: OrgGraphFilter) => {
    cancelFinalFit();
    setFilter(filter);
  }, [cancelFinalFit, setFilter]);

  useEffect(() => {
    if (!active || layout.nodes.length === 0) return undefined;
    const readyFrame = window.requestAnimationFrame(() => onReady?.());
    return () => window.cancelAnimationFrame(readyFrame);
  }, [active, layout.nodes.length, onReady]);

  const integrityWarningCount = useMemo(
    () => graph.anomalies.filter((item) => item.severity === 'warning').length,
    [graph.anomalies],
  );

  return (
    <div
      ref={performanceTelemetryRef}
      className="org-ecosystem__ready"
      data-active={active || undefined}
      data-camera-animating={viewport.isAnimating || undefined}
      data-camera-interacting={viewport.isInteracting || undefined}
      data-integrity-info-count={graph.anomalies.length - integrityWarningCount}
      data-integrity-warning-count={integrityWarningCount}
      data-layout-height={layout.bounds.height}
      data-layout-width={layout.bounds.width}
      data-viewport-scale={camera.scale.toFixed(3)}
      data-org-detail-open={interaction.selectedNode ? 'true' : undefined}
      aria-hidden={!active}
      onFocusCapture={cancelFinalFit}
      onPointerDownCapture={cancelFinalFit}
      onKeyDownCapture={(event) => {
        cancelFinalFit();
        if (event.key !== 'Escape' || !interaction.selectedNode) return;
        event.preventDefault();
        event.stopPropagation();
        closeDetails();
      }}
    >
      <header className="org-ecosystem__masthead" data-org-interactive>
        <div className="org-ecosystem__title">
          <FenasojaBrand
            className="org-ecosystem__brand"
            compact
            tone="dark"
          />
          <h1>ECOSSISTEMA ORGANIZACIONAL</h1>
        </div>
        <OrgSearch
          query={interaction.query}
          results={interaction.searchResults}
          onQueryChange={handleQueryChange}
          onResultSelect={handleSearchResult}
        />
      </header>

      <OrgFilterBar filter={interaction.filter} onFilterChange={handleFilterChange} />

      <div
        ref={viewport.viewportRef}
        className="org-viewport"
        role="group"
        aria-label="MAPA INTERATIVO DA ORGANIZAÇÃO FENASOJA 2028"
        aria-describedby="org-viewport-instructions"
        onPointerCancel={viewport.onPointerCancel}
        onPointerDown={(event) => {
          cancelFinalFit();
          viewport.onPointerDown(event);
        }}
        onPointerMove={viewport.onPointerMove}
        onPointerUp={viewport.onPointerUp}
        onWheel={(event) => {
          cancelFinalFit();
          viewport.onWheel(event);
        }}
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
            activeEdgeIds={interaction.activeEdgeIds}
            layout={layout}
            visualStateById={visualStateById}
          />
          <div className="org-viewport__nodes">
            {layout.nodes.map((position) => (
              <OrganizationalNode
                key={position.node.id}
                active={active}
                buttonRef={getNodeRef(position.node.id)}
                keyboardActive={active && interaction.keyboardNodeId === position.node.id}
                people={graph.people}
                position={position}
                state={visualStateById.get(position.node.id) ?? {
                  filtered: false,
                  hovered: false,
                  matched: false,
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

      <div className="org-level-legend" aria-label="LEGENDA DOS NÍVEIS ORGANIZACIONAIS" data-org-interactive>
        <span aria-label={`01 ${CCPF_FULL_LABEL}`} title={CCPF_FULL_LABEL}>
          <i data-level="1" />01 CCPF
        </span>
        <span><i data-level="2" />02 PRESIDÊNCIA</span>
        <span><i data-level="3" />03 COMISSÃO CENTRAL</span>
        <span><i data-level="4" />04 COMISSÕES E ASSESSORIAS</span>
      </div>

      <OrgViewportControls
        scale={viewport.camera.scale}
        selected={Boolean(interaction.selectedNode)}
        onFit={() => {
          cancelFinalFit();
          fitViewport();
        }}
        onFocusSelected={() => {
          cancelFinalFit();
          if (selectedNodeId) focusNode(selectedNodeId);
        }}
        onZoomIn={() => {
          cancelFinalFit();
          viewport.zoomBy(1.2);
        }}
        onZoomOut={() => {
          cancelFinalFit();
          viewport.zoomBy(1 / 1.2);
        }}
      />

      {interaction.selectedNode && (
        <PersonDetailPanel
          graph={graph}
          node={interaction.selectedNode}
          onClose={closeDetails}
        />
      )}

      <p className="org-ecosystem__selection-announcement" aria-live="polite">
        {interaction.selectedNode
          ? `${interaction.selectedNode.title} selecionada. Detalhes exibidos.`
          : 'Visão geral do ecossistema.'}
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
      <div className="org-ecosystem__atmosphere" aria-hidden="true" />
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
