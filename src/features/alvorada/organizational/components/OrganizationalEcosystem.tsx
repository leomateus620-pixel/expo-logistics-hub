import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type RefCallback,
} from 'react';
import { AlertTriangle, Network, Sparkles } from 'lucide-react';
import type { OrganizationalGraph, OrgNode } from '../types';
import {
  calculateOrganizationalLayout,
  findDirectionalNode,
  type OrgNavigationDirection,
} from '../layout/organizationalLayout';
import {
  useOrgGraphInteraction,
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
    setHoveredNodeId,
    setKeyboardNodeId,
    setQuery,
    visualStateById,
  } = interaction;
  const nodeElements = useRef(new Map<string, HTMLButtonElement>());
  const nodeRefCallbacks = useRef(new Map<string, RefCallback<HTMLButtonElement>>());
  const fitGraph = useRef<() => void>(() => undefined);
  const handleBackgroundPress = useCallback(() => {
    clearSelection();
    fitGraph.current();
  }, [clearSelection]);
  const viewport = useOrgViewport({
    bounds: layout.bounds,
    initialFocusPoint: layout.nodeById.get(graph.rootNodeId),
    onBackgroundPress: handleBackgroundPress,
  });
  const { camera, focusPoint } = viewport;
  fitGraph.current = viewport.fit;

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
    commitSelection(nodeId);
    focusNode(nodeId);
  }, [commitSelection, focusNode]);

  const closeDetails = useCallback(() => {
    const nodeId = selectedNodeId;
    clearSelection();
    if (!nodeId) return;
    window.requestAnimationFrame(() => {
      nodeElements.current.get(nodeId)?.focus({ preventScroll: true });
    });
  }, [clearSelection, selectedNodeId]);

  const handleNodeFocus = useCallback((nodeId: string) => {
    setKeyboardNodeId(nodeId);
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
    focusNode,
    graph.rootNodeId,
    layout,
    focusPoint,
    selectedNodeId,
    setKeyboardNodeId,
    visualStateById,
  ]);

  const handleSearchResult = useCallback((result: OrgSearchResult) => {
    setQuery('');
    commitSelection(result.id);
    setKeyboardNodeId(result.id);
    focusNode(result.id, 0.94);
    window.requestAnimationFrame(() => nodeElements.current.get(result.id)?.focus({ preventScroll: true }));
  }, [commitSelection, focusNode, setKeyboardNodeId, setQuery]);

  useEffect(() => {
    if (!active || layout.nodes.length === 0) return undefined;
    const readyFrame = window.requestAnimationFrame(() => onReady?.());
    return () => window.cancelAnimationFrame(readyFrame);
  }, [active, layout.nodes.length, onReady]);

  const authorityCounts = useMemo(() => ({
    central: layout.nodes.filter((item) => item.node.authorityLevel === 3).length,
    operational: layout.nodes.filter((item) => item.node.authorityLevel === 4).length,
    warnings: graph.anomalies.filter((item) => item.severity === 'warning').length,
  }), [graph.anomalies, layout.nodes]);

  return (
    <div
      ref={performanceTelemetryRef}
      className="org-ecosystem__ready"
      data-active={active || undefined}
      data-camera-animating={viewport.isAnimating || undefined}
      data-camera-interacting={viewport.isInteracting || undefined}
      data-integrity-info-count={graph.anomalies.length - authorityCounts.warnings}
      data-integrity-warning-count={authorityCounts.warnings}
      data-org-detail-open={interaction.selectedNode ? 'true' : undefined}
      aria-hidden={!active}
      onKeyDownCapture={(event) => {
        if (event.key !== 'Escape' || !interaction.selectedNode) return;
        event.preventDefault();
        event.stopPropagation();
        closeDetails();
      }}
    >
      <header className="org-ecosystem__masthead" data-org-interactive>
        <div className="org-ecosystem__title">
          <span><Sparkles aria-hidden="true" /> FENASOJA 2028</span>
          <h1>Ecossistema organizacional</h1>
          <p>
            {layout.nodes.length} estruturas · {authorityCounts.central} {authorityCounts.central === 1 ? 'central' : 'centrais'} · {authorityCounts.operational} operacionais
          </p>
        </div>
        <OrgSearch
          query={interaction.query}
          results={interaction.searchResults}
          onQueryChange={interaction.setQuery}
          onResultSelect={handleSearchResult}
        />
      </header>

      <OrgFilterBar filter={interaction.filter} onFilterChange={interaction.setFilter} />

      <div
        ref={viewport.viewportRef}
        className="org-viewport"
        role="group"
        aria-label="Mapa interativo da organização FENASOJA 2028"
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
        use as setas para percorrer as estruturas, Enter para selecionar e Home para retornar ao CCP.
      </p>

      <div className="org-authority-legend" aria-label="Legenda de autoridade" data-org-interactive>
        <span><i data-level="1" />01 CCP</span>
        <span><i data-level="2" />02 Presidência</span>
        <span><i data-level="3" />03 Central</span>
        <span><i data-level="4" />04 Comissões e Assessorias</span>
      </div>

      <OrgViewportControls
        scale={viewport.camera.scale}
        selected={Boolean(interaction.selectedNode)}
        onFit={viewport.fit}
        onFocusSelected={() => {
          if (selectedNodeId) focusNode(selectedNodeId);
        }}
        onZoomIn={() => viewport.zoomBy(1.2)}
        onZoomOut={() => viewport.zoomBy(1 / 1.2)}
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
      <strong>Conectando o ecossistema</strong>
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
