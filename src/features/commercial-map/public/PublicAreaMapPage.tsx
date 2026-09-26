import { Component, Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, Crosshair, LayoutList, Map as MapIcon } from 'lucide-react';
import { useSalesStore } from '../sales/useSalesSelection';
import { PUBLIC_NAVIGATION_SAVE_EVENT, readPublicNavigation, savePublicNavigation, takePublicNavigation } from './publicNavigation';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import { useWebGLAvailability } from '../hooks/useWebGLAvailability';
import { preloadCommercialMapCanvas } from '../utils/preloadCanvas';
import { claimCommercialMapBootVisit, releaseCommercialMapBootVisit } from '../utils/performanceDiagnostics';
import { formatAreaSqmLabel } from '../utils/lotPricing2028';
import { buildPavilionModuleCommercialIndex } from '../utils/pavilionModuleCommercial';
import { STATUS_CONFIG } from '../constants';
import { getPublicArea } from './publicAreaRegistry';
import { findPavilionEntity, PublicMapAccessError } from './publicMapService';
import { usePublicCanvasLots, usePublicMapContext, usePublicMapInventory, usePublicMapTelemetry } from './usePublicMapArea';
import { buildPublicInteractionScope, canInspectLot } from './publicInteractionScope';
import { createPublicExternalScenePolicy } from './publicScenePolicy';
import type { MapEntity } from '../types';
import { usePublicScopeRevision } from './usePublicScopeRevision';
import { usePublicAutoRefresh } from './usePublicAutoRefresh';
import { usePublicMapRenderState } from './usePublicMapRenderState';
import { PublicLotDetails } from './PublicLotDetails';
import { PublicLotList } from './PublicLotList';
import { PUBLIC_AVAILABILITY_LABEL, type PublicLot } from './publicMapTypes';
import './public-map.css';

const loadPublicCanvas = () => preloadCommercialMapCanvas({ prepareHeadquarters: false });
const EMPTY_MATCHES: ReadonlySet<string> = new Set();

class PublicCanvasBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function InvalidLink() {
  return <main className="public-map-shell public-map-invalid"><div>
    <AlertTriangle aria-hidden="true" /><h1>Link indisponível</h1>
    <p>Este endereço de consulta não está mais ativo. Solicite um novo link à organização da Fenasoja.</p>
  </div></main>;
}

/** A genuine link change owns a fresh scope. Query revalidation never changes this key. */
export default function PublicAreaMapPage() {
  const { slug = '', token = '' } = useParams<{ slug: string; token: string }>();
  return <PublicAreaMap key={slug + ':' + token} slug={slug} token={token} />;
}

function PublicAreaMap({ slug, token }: { slug: string; token: string }) {
  const area = getPublicArea(slug);
  const usesParkContext = Boolean(area && area.kind !== 'PAVILION');
  const inventory = usePublicMapInventory(area ? slug : '', token);
  // Independent, authorized RPCs start together; no exterior is mounted with temporary bounds.
  const context = usePublicMapContext(usesParkContext ? slug : '', token);
  const track = usePublicMapTelemetry(area ? slug : '', token);
  const { available: webglAvailable } = useWebGLAvailability();
  usePublicScopeRevision(inventory.data ? slug : '', token, inventory.data?.revision, inventory.data?.contextRevision);
  // Reading during render must be repeatable if React retries a suspended mount.
  const [restoredNavigation] = useState(readPublicNavigation);
  useEffect(() => { takePublicNavigation(); }, []);
  const [viewMode, setViewMode] = useState<'map' | 'list'>(restoredNavigation?.viewMode ?? 'map');
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [lotGoneNotice, setLotGoneNotice] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [rendererAttempt, setRendererAttempt] = useState(0);
  // A failed lazy import may be retried explicitly without remounts on refetch.
  const CommercialMapCanvas = useMemo(() => { void rendererAttempt; return lazy(loadPublicCanvas); }, [rendererAttempt]);
  const selectedEntityId = useCommercialMapStore(state => state.selectedEntityId);
  const selectedModuleId = useCommercialMapStore(state => state.selectedModuleId);
  const cameraNavigating = useCommercialMapStore(state => state.cameraNavigating);
  const setSelectedEntityId = useCommercialMapStore(state => state.setSelectedEntityId);
  const setSelectedModuleId = useCommercialMapStore(state => state.setSelectedModuleId);
  const data = inventory.data;
  const lots = useMemo(() => data?.lots ?? [], [data?.lots]);
  const canvasLots = usePublicCanvasLots(lots);
  const lotsByEntity = useMemo(() => new Map(lots.map(lot => [lot.entityId, lot])), [lots]);
  const pavilionEntity = useMemo(() => data ? findPavilionEntity(data.entities, data.scope.pavilionIdentifier) : null, [data]);
  const inventoryEntities = data?.entities;
  const contextEntities = context.data?.entities;
  const sceneEntities = useMemo<MapEntity[]>(() => {
    if (!inventoryEntities) return [];
    if (!usesParkContext || !contextEntities) return inventoryEntities;
    const merged = new Map(contextEntities.map(entity => [entity.id, entity]));
    inventoryEntities.forEach(entity => merged.set(entity.id, entity));
    return [...merged.values()];
  }, [contextEntities, inventoryEntities, usesParkContext]);
  const interactionScope = useMemo(() => buildPublicInteractionScope(lots), [lots]);
  // Price/status revisions do not replace render policy, material variants or camera bounds.
  const policyRef = useRef<{ key: string; value: ReturnType<typeof createPublicExternalScenePolicy> }>();
  const policyKey = data ? JSON.stringify([data.scope.kind, data.entities.map(e => [e.id, e.geometry, e.classification, e.parentEntityId]), lots.map(lot => [lot.id, lot.entityId])]) : '';
  if (data && policyRef.current?.key !== policyKey) policyRef.current = { key: policyKey, value: createPublicExternalScenePolicy(data) };
  const publicScenePolicy = policyRef.current?.value ?? null;
  const lotIdByModuleKey = useMemo(() => {
    if (!pavilionEntity || !data) return new Map<string, string>();
    return new Map([...buildPavilionModuleCommercialIndex(pavilionEntity, data.entities, canvasLots)]
      .map(([key, record]) => [key, record.lot.id]));
  }, [canvasLots, data, pavilionEntity]);

  useLayoutEffect(() => {
    const owner = {};
    claimCommercialMapBootVisit(owner);
    const previous = useCommercialMapStore.getState();
    const previousSales = useSalesStore.getState().salesModeActive;
    useSalesStore.setState({ salesModeActive: false });
    previous.activateScope('public:' + slug, null);
    useCommercialMapStore.setState({ treesVisible: true, labelsVisible: true, salesPresentationActive: false,
      ...(usesParkContext ? { sunrisePhase: 'complete' as const } : {}) });
    setInitialized(true);
    return () => { useSalesStore.setState({ salesModeActive: previousSales }); useCommercialMapStore.setState(previous); releaseCommercialMapBootVisit(owner); };
  }, [slug, usesParkContext]);
  useEffect(() => { if (area) void loadPublicCanvas().catch(() => undefined); }, [area]);
  const authorized = Boolean(data);
  useEffect(() => { if (authorized) track('area_visit', { once: 'area_visit', metadata: { slug } }); }, [authorized, slug, track]);
  const enteredInterior = useRef<string | null>(null);
  useEffect(() => {
    if (!initialized || !pavilionEntity || enteredInterior.current === pavilionEntity.id) return;
    enteredInterior.current = pavilionEntity.id;
    useCommercialMapStore.getState().enterInterior(pavilionEntity.id);
  }, [initialized, pavilionEntity]);

  const sceneReady = initialized && Boolean(data) && (!usesParkContext || Boolean(context.data));
  const showMap = viewMode === 'map' && webglAvailable;
  const renderState = usePublicMapRenderState(sceneReady && webglAvailable, rendererAttempt);
  useEffect(() => {
    if (renderState === 'ready' && data) track('map_ready', { once: 'map_ready', metadata: { lots: data.scope.lotCount } });
  }, [data, renderState, track]);

  const lastSelection = useRef<string | null>(null);
  useEffect(() => {
    const lotId = (selectedModuleId ? lotIdByModuleKey.get(selectedModuleId) : null)
      ?? (canInspectLot(interactionScope, selectedEntityId) && selectedEntityId ? lotsByEntity.get(selectedEntityId)?.id : null) ?? null;
    if (!lotId || lotId === lastSelection.current) return;
    lastSelection.current = lotId;
    setSelectedLotId(lotId);
    setLotGoneNotice(false);
    track('lot_selected', { lotId });
    track('lot_details_viewed', { lotId });
  }, [interactionScope, lotIdByModuleKey, lotsByEntity, selectedEntityId, selectedModuleId, track]);
  const selectedLot = useMemo(() => lots.find(lot => lot.id === selectedLotId) ?? null, [lots, selectedLotId]);
  usePublicAutoRefresh(Boolean(selectedLot) || cameraNavigating);
  useEffect(() => {
    const save = () => savePublicNavigation({ selectedLotId, viewMode });
    window.addEventListener(PUBLIC_NAVIGATION_SAVE_EVENT, save);
    return () => window.removeEventListener(PUBLIC_NAVIGATION_SAVE_EVENT, save);
  }, [selectedLotId, viewMode]);
  const closeDetails = useCallback(() => {
    lastSelection.current = null;
    setSelectedLotId(null);
    setSelectedEntityId(null);
    setSelectedModuleId(null);
  }, [setSelectedEntityId, setSelectedModuleId]);
  useEffect(() => {
    if (selectedLotId && data && !lots.some(lot => lot.id === selectedLotId)) {
      closeDetails();
      setLotGoneNotice(true);
    }
  }, [closeDetails, data, lots, selectedLotId]);
  const selectFromList = (lot: PublicLot) => {
    if (pavilionEntity) {
      const module = [...lotIdByModuleKey].find(([, id]) => id === lot.id)?.[0];
      if (module) setSelectedModuleId(module);
    } else setSelectedEntityId(lot.entityId);
  };
  const refitArea = () => {
    closeDetails();
    useCommercialMapStore.getState().clearSegmentFocus();
  };
  const retry = () => { setRendererAttempt(n => n + 1); void inventory.refetch(); if (usesParkContext) void context.refetch(); };
  if (!area || !token || inventory.error instanceof PublicMapAccessError || context.error instanceof PublicMapAccessError) return <InvalidLink />;
  const fallback = <div className="public-map-stage" role="alert">
    <strong>Não foi possível preparar o mapa.</strong><p>A consulta dos lotes continua disponível na lista.</p>
    <div className="public-map-stage__actions"><button onClick={retry}>Tentar novamente</button><button onClick={() => setViewMode('list')}>Ver lista de lotes</button></div>
  </div>;
  return <main className="public-map-shell" data-area={slug} data-public-external={usesParkContext || undefined}>
    <header className="public-map-header">
      <div><h1>{data?.scope.name ?? area.name}</h1><p>{data ? `${data.scope.lotCount} lotes · ${formatAreaSqmLabel(data.scope.officialAreaSqm) ?? '—'} de metragem comercial` : 'Carregando…'}</p></div>
      <div className="public-map-view-switch" role="group" aria-label="Modo de visualização">
        <button type="button" aria-pressed={showMap} disabled={!webglAvailable} onClick={() => setViewMode('map')}><MapIcon aria-hidden="true" /><span>Mapa</span></button>
        <button type="button" aria-pressed={!showMap} onClick={() => setViewMode('list')}><LayoutList aria-hidden="true" /><span>Lista</span></button>
        {usesParkContext && showMap && <button type="button" className="public-map-refit" onClick={refitArea}><Crosshair aria-hidden="true" /><span>Reenquadrar área</span></button>}
      </div>
    </header>
    <div className="public-map-body">
      {!data && !inventory.isError && <div className="public-map-state" role="status">Carregando os lotes autorizados…</div>}
      {inventory.isError && <div className="public-map-state" role="alert"><p>Não foi possível consultar os dados agora. Verifique sua conexão.</p><button onClick={() => void inventory.refetch()}>Tentar novamente</button></div>}
      {data && usesParkContext && !context.data && showMap && <div className="public-map-state" role="status">
        <p>{context.isError ? 'Não foi possível carregar o contexto do parque.' : 'Preparando o contexto do parque…'}</p>
        {context.isError && <button onClick={() => void context.refetch()}>Tentar novamente</button>}
        <button onClick={() => setViewMode('list')}>Ver lista de lotes</button>
      </div>}
      {lotGoneNotice && <p className="public-map-notice" role="status">Este lote não está mais disponível para consulta nesta área.<button onClick={() => setLotGoneNotice(false)}>Entendi</button></p>}
      {sceneReady && webglAvailable && <div className={'public-map-canvas' + (!showMap ? ' is-concealed' : '')} aria-hidden={!showMap}>
        <PublicCanvasBoundary key={rendererAttempt} fallback={fallback}>
          <Suspense fallback={null}><CommercialMapCanvas entities={sceneEntities} lots={canvasLots} calibration={null} matchingEntityIds={EMPTY_MATCHES} filtersActive={false}
            sceneSegmentId={null} sceneInteriorEntityId={pavilionEntity?.id ?? null} isolatedArea={null}
            interactiveEntityIds={interactionScope.interactiveEntityIds} publicFocusEntityIds={usesParkContext ? publicScenePolicy?.interactiveEntityIds : null}
            publicScenePolicy={publicScenePolicy} initialPublicView={restoredNavigation} active={showMap} /></Suspense>
          {renderState !== 'ready' && <div className="public-map-stage" role="status" aria-live="polite">
            <span className="public-map-stage__spinner" aria-hidden="true" /><strong>{renderState === 'failed' ? 'Não foi possível desenhar o mapa neste dispositivo.' : renderState === 'slow' ? 'O mapa está demorando mais que o normal.' : 'Preparando o mapa da área…'}</strong>
            <div className="public-map-stage__actions">{renderState !== 'preparing' && <button onClick={retry}>Tentar novamente</button>}<button onClick={() => setViewMode('list')}>Ver lista de lotes</button></div>
          </div>}
        </PublicCanvasBoundary>
        {usesParkContext && renderState === 'ready' && <div className="public-map-legend" aria-label="Legenda de disponibilidade">
          {(['AVAILABLE','RESERVED','SOLD','BLOCKED'] as const).map(status => <span key={status}><i style={{background: STATUS_CONFIG[status].color}} />{PUBLIC_AVAILABILITY_LABEL[status === 'BLOCKED' ? 'UNAVAILABLE' : status]}</span>)}
          <span><i className="is-selection" />Selecionado</span><span><i className="is-context" />Contexto do parque</span>
        </div>}
      </div>}
      {data && !showMap && <PublicLotList lots={lots} selectedLotId={selectedLotId} onSelect={selectFromList} areaName={data.scope.name} />}
      {selectedLot && <PublicLotDetails lot={selectedLot} onClose={closeDetails} compact={usesParkContext} areaName={data?.scope.name} />}
    </div>
    <footer className="public-map-footer"><span>Fenasoja 2028 · Consulta pública do Mapa Comercial</span><span>Valores oficiais sujeitos a confirmação pela organização.</span></footer>
  </main>;
}
