import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, Crosshair, LayoutList, Map as MapIcon } from 'lucide-react';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import { useWebGLAvailability } from '../hooks/useWebGLAvailability';
import { preloadCommercialMapCanvas } from '../utils/preloadCanvas';
import { formatAreaSqmLabel } from '../utils/lotPricing2028';
import { buildPavilionModuleCommercialIndex } from '../utils/pavilionModuleCommercial';
import { COMMERCIAL_MAP_SEGMENT_IDS, type CommercialMapSegmentId } from '../data/commercialMapSegments';
import { getPublicArea } from './publicAreaRegistry';
import { findPavilionEntity } from './publicMapService';
import {
  usePublicCanvasLots,
  usePublicMapContext,
  usePublicMapInventory,
  usePublicMapTelemetry,
} from './usePublicMapArea';
import { buildPublicInteractionScope, canInspectLot } from './publicInteractionScope';
import type { MapEntity } from '../types';
import { usePublicScopeRevision } from './usePublicScopeRevision';
import { usePublicAutoRefresh } from './usePublicAutoRefresh';
import { usePublicMapRenderState } from './usePublicMapRenderState';
import { PublicLotDetails } from './PublicLotDetails';
import { PublicLotList } from './PublicLotList';
import type { PublicLot } from './publicMapTypes';
import './public-map.css';

const CommercialMapCanvas = lazy(preloadCommercialMapCanvas);

const EMPTY_MATCHES: ReadonlySet<string> = new Set();

function segmentIdForScope(segmentSlug: string | null | undefined): CommercialMapSegmentId | null {
  if (segmentSlug === 'exporural') return COMMERCIAL_MAP_SEGMENT_IDS.exporural;
  if (segmentSlug === 'industria-comercio-servicos') return COMMERCIAL_MAP_SEGMENT_IDS.industry;
  return null;
}

function InvalidLink() {
  return (
    <main className="public-map-shell public-map-invalid">
      <div>
        <AlertTriangle aria-hidden="true" />
        <h1>Link indisponível</h1>
        <p>Este endereço de consulta não está mais ativo. Solicite um novo link à organização da Fenasoja.</p>
      </div>
    </main>
  );
}

/** Consulta pública de uma única área do Mapa Comercial. Sem carrinho, sem reserva. */
export default function PublicAreaMapPage() {
  const { slug = '', token = '' } = useParams<{ slug: string; token: string }>();
  const area = getPublicArea(slug);
  const inventory = usePublicMapInventory(area ? slug : '', token);
  const track = usePublicMapTelemetry(area ? slug : '', token);
  const { available: webglAvailable } = useWebGLAvailability();
  usePublicScopeRevision(area ? slug : '', token);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [lotGoneNotice, setLotGoneNotice] = useState(false);

  const selectedEntityId = useCommercialMapStore((state) => state.selectedEntityId);
  const selectedModuleId = useCommercialMapStore((state) => state.selectedModuleId);
  const enterInterior = useCommercialMapStore((state) => state.enterInterior);
  const setSelectedEntityId = useCommercialMapStore((state) => state.setSelectedEntityId);
  const setSelectedModuleId = useCommercialMapStore((state) => state.setSelectedModuleId);
  const clearSegmentFocus = useCommercialMapStore((state) => state.clearSegmentFocus);

  const data = inventory.data;
  const lots = useMemo(() => data?.lots ?? [], [data]);
  const canvasLots = usePublicCanvasLots(lots);
  const lotsByEntity = useMemo(() => new Map(lots.map((lot) => [lot.entityId, lot])), [lots]);
  const pavilionEntity = useMemo(
    () => (data ? findPavilionEntity(data.entities, data.scope.pavilionIdentifier) : null),
    [data],
  );
  const sceneSegmentId = segmentIdForScope(data?.scope.segmentSlug);
  // Links de pavilhão mantêm a visualização dedicada do pavilhão, sem entorno.
  const usesParkContext = Boolean(data) && !data?.scope.pavilionIdentifier;
  const context = usePublicMapContext(usesParkContext ? slug : '', token);

  // Contexto visual do parque + entidades oficiais do escopo. O escopo sempre
  // prevalece: nenhum dado do entorno sobrescreve o que o link entrega.
  const sceneEntities = useMemo<MapEntity[]>(() => {
    if (!data) return [];
    if (!usesParkContext || !context.data) return data.entities;
    const merged = new Map<string, MapEntity>();
    context.data.entities.forEach((entity) => merged.set(entity.id, entity));
    data.entities.forEach((entity) => merged.set(entity.id, entity));
    return [...merged.values()];
  }, [context.data, data, usesParkContext]);

  const interactionScope = useMemo(() => buildPublicInteractionScope(lots), [lots]);
  const parkContextActive = usesParkContext && Boolean(context.data);

  /**
   * Pavilhões: o clique devolve a identificação visual do módulo
   * (ex.: `B1:module:063`), que não é o identificador da entidade. A cadeia
   * oficial módulo → entidade → lote autorizado é resolvida aqui.
   */
  const lotIdByModuleKey = useMemo(() => {
    if (!pavilionEntity || !data) return new Map<string, string>();
    const index = buildPavilionModuleCommercialIndex(pavilionEntity, data.entities, canvasLots);
    return new Map([...index].map(([moduleKey, record]) => [moduleKey, record.lot.id]));
  }, [canvasLots, data, pavilionEntity]);

  const refitArea = useCallback(() => {
    clearSegmentFocus();
    setSelectedEntityId(null);
    setSelectedModuleId(null);
  }, [clearSegmentFocus, setSelectedEntityId, setSelectedModuleId]);

  // O visitante nunca herda estado de outra área: ao entrar no link, o escopo
  // do mapa começa limpo (sem interior, seleção ou foco anteriores).
  useEffect(() => {
    const store = useCommercialMapStore.getState();
    store.exitInterior?.();
    store.clearSegmentFocus();
    store.setSelectedEntityId(null);
    store.setSelectedModuleId(null);
    return () => {
      const cleanup = useCommercialMapStore.getState();
      cleanup.exitInterior?.();
      cleanup.setSelectedEntityId(null);
      cleanup.setSelectedModuleId(null);
    };
  }, [slug]);

  useEffect(() => { track('area_visit', { once: 'area_visit', metadata: { slug } }); }, [slug, track]);

  // Entrar no interior do pavilhão acontece uma única vez por link: atualizações
  // do inventário não podem limpar a seleção nem mover a câmera do visitante.
  const enteredInteriorFor = useRef<string | null>(null);
  useEffect(() => {
    if (!pavilionEntity) return;
    if (enteredInteriorFor.current === pavilionEntity.id) return;
    enteredInteriorFor.current = pavilionEntity.id;
    enterInterior(pavilionEntity.id);
  }, [enterInterior, pavilionEntity]);

  const mapVisible = viewMode === 'map' && webglAvailable && Boolean(data);
  const renderState = usePublicMapRenderState(mapVisible);

  // "Mapa pronto" só depois da imagem apresentada e da interação liberada.
  useEffect(() => {
    if (renderState !== 'ready' || !data) return;
    track('map_ready', { once: 'map_ready', metadata: { lots: data.scope.lotCount } });
  }, [data, renderState, track]);

  useEffect(() => {
    const moduleLotId = selectedModuleId ? lotIdByModuleKey.get(selectedModuleId) ?? null : null;
    // Segunda verificação do mesmo contrato: mesmo que algo selecione uma
    // entidade do entorno, nenhuma ficha comercial é aberta.
    const entityLot = canInspectLot(interactionScope, selectedEntityId)
      ? (selectedEntityId ? lotsByEntity.get(selectedEntityId) ?? null : null)
      : null;
    const lotId = moduleLotId ?? entityLot?.id ?? null;
    if (!lotId) return;
    setLotGoneNotice(false);
    setSelectedLotId(lotId);
    track('lot_selected', { lotId });
    track('lot_details_viewed', { lotId });
  }, [interactionScope, lotIdByModuleKey, lotsByEntity, selectedEntityId, selectedModuleId, track]);

  const selectedLot: PublicLot | null = useMemo(
    () => lots.find((lot) => lot.id === selectedLotId) ?? null,
    [lots, selectedLotId],
  );

  // Publicação de código nova é aplicada sozinha, nunca com a ficha aberta.
  usePublicAutoRefresh(Boolean(selectedLot));

  // O lote aberto pode ser arquivado, excluído ou movido para outra área: a
  // ficha fecha com aviso, sem manter dado antigo nem buscar fora do escopo.
  useEffect(() => {
    if (!selectedLotId || !data) return;
    if (lots.some((lot) => lot.id === selectedLotId)) return;
    setSelectedLotId(null);
    setSelectedEntityId(null);
    setSelectedModuleId(null);
    setLotGoneNotice(true);
  }, [data, lots, selectedLotId, setSelectedEntityId, setSelectedModuleId]);

  const closeDetails = () => {
    setSelectedLotId(null);
    setSelectedEntityId(null);
    setSelectedModuleId(null);
  };

  const selectFromList = (lot: PublicLot) => {
    setLotGoneNotice(false);
    setSelectedLotId(lot.id);
    track('lot_selected', { lotId: lot.id });
    track('lot_details_viewed', { lotId: lot.id });
  };

  if (!area) return <InvalidLink />;
  if (inventory.isError) return <InvalidLink />;

  const showMap = viewMode === 'map' && webglAvailable;

  return (
    <main className="public-map-shell" data-area={slug}>
      <header className="public-map-header">
        <div>
          <h1>{data?.scope.name ?? area.name}</h1>
          <p>
            {data ? `${data.scope.lotCount} lotes` : 'Carregando…'}
            {data && ` · ${formatAreaSqmLabel(data.scope.officialAreaSqm) ?? '—'} de metragem comercial`}
          </p>
        </div>
        <div className="public-map-view-switch" role="group" aria-label="Modo de visualização">
          <button
            type="button"
            aria-pressed={showMap}
            disabled={!webglAvailable}
            onClick={() => setViewMode('map')}
          >
            <MapIcon aria-hidden="true" /><span>Mapa</span>
          </button>
          <button type="button" aria-pressed={viewMode === 'list' || !webglAvailable} onClick={() => setViewMode('list')}>
            <LayoutList aria-hidden="true" /><span>Lista</span>
          </button>
          {parkContextActive && showMap && (
            <button type="button" className="public-map-refit" onClick={refitArea}>
              <Crosshair aria-hidden="true" /><span>Reenquadrar área</span>
            </button>
          )}
        </div>
      </header>

      <div className="public-map-body">
        {inventory.isLoading && <p className="public-map-state" role="status">Carregando a área…</p>}

        {lotGoneNotice && (
          <p className="public-map-notice" role="status">
            Este lote não está mais disponível para consulta nesta área.
            <button type="button" onClick={() => setLotGoneNotice(false)}>Entendi</button>
          </p>
        )}

        {data && showMap && (
          <div className="public-map-canvas">
            <Suspense fallback={null}>
              <CommercialMapCanvas
                entities={sceneEntities}
                lots={canvasLots}
                calibration={null}
                matchingEntityIds={EMPTY_MATCHES}
                filtersActive={false}
                sceneSegmentId={sceneSegmentId}
                sceneInteriorEntityId={pavilionEntity?.id ?? null}
                isolatedArea={parkContextActive ? null : sceneSegmentId}
                interactiveEntityIds={interactionScope.interactiveEntityIds}
                publicFocusEntityIds={interactionScope.interactiveEntityIds}
              />
            </Suspense>

            {renderState !== 'ready' && (
              <div className="public-map-stage" role="status" aria-live="polite">
                <span className="public-map-stage__spinner" aria-hidden="true" />
                <strong>
                  {renderState === 'failed'
                    ? 'Não foi possível desenhar o mapa neste dispositivo.'
                    : renderState === 'slow'
                      ? 'O mapa está demorando mais que o normal.'
                      : 'Preparando o mapa da área…'}
                </strong>
                {renderState !== 'preparing' && (
                  <div className="public-map-stage__actions">
                    <button type="button" onClick={() => window.location.reload()}>Tentar novamente</button>
                    <button type="button" onClick={() => setViewMode('list')}>Ver lista de lotes</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {data && !showMap && (
          <PublicLotList lots={lots} selectedLotId={selectedLotId} onSelect={selectFromList} />
        )}

        {selectedLot && <PublicLotDetails lot={selectedLot} onClose={closeDetails} />}
      </div>

      <footer className="public-map-footer">
        <span>Fenasoja 2028 · Consulta pública do Mapa Comercial</span>
        <span>Valores oficiais sujeitos a confirmação pela organização.</span>
      </footer>
    </main>
  );
}
