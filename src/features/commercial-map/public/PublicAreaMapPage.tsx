import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, LayoutList, Map as MapIcon } from 'lucide-react';
import { useCommercialMapStore } from '../state/useCommercialMapStore';
import { useWebGLAvailability } from '../hooks/useWebGLAvailability';
import { preloadCommercialMapCanvas } from '../utils/preloadCanvas';
import { formatAreaSqmLabel } from '../utils/lotPricing2028';
import { COMMERCIAL_MAP_SEGMENT_IDS, type CommercialMapSegmentId } from '../data/commercialMapSegments';
import { getPublicArea } from './publicAreaRegistry';
import { findPavilionEntity } from './publicMapService';
import { usePublicCanvasLots, usePublicMapInventory, usePublicMapTelemetry } from './usePublicMapArea';
import { usePublicScopeRevision } from './usePublicScopeRevision';
import { useAppBuildFreshness } from './useAppBuildFreshness';
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
  const buildOutdated = useAppBuildFreshness();
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [lotGoneNotice, setLotGoneNotice] = useState(false);

  const selectedEntityId = useCommercialMapStore((state) => state.selectedEntityId);
  const selectedModuleId = useCommercialMapStore((state) => state.selectedModuleId);
  const enterInterior = useCommercialMapStore((state) => state.enterInterior);
  const setSelectedEntityId = useCommercialMapStore((state) => state.setSelectedEntityId);
  const setSelectedModuleId = useCommercialMapStore((state) => state.setSelectedModuleId);

  const data = inventory.data;
  const lots = useMemo(() => data?.lots ?? [], [data]);
  const canvasLots = usePublicCanvasLots(lots);
  const lotsByEntity = useMemo(() => new Map(lots.map((lot) => [lot.entityId, lot])), [lots]);
  const pavilionEntity = useMemo(
    () => (data ? findPavilionEntity(data.entities, data.scope.pavilionIdentifier) : null),
    [data],
  );
  const sceneSegmentId = segmentIdForScope(data?.scope.segmentSlug);

  useEffect(() => { track('area_visit', { once: 'area_visit', metadata: { slug } }); }, [slug, track]);

  useEffect(() => {
    if (!data) return;
    track('map_ready', { once: 'map_ready', metadata: { lots: data.scope.lotCount } });
    if (pavilionEntity) enterInterior(pavilionEntity.id);
  }, [data, enterInterior, pavilionEntity, track]);

  // O visitante nunca herda seleção de outra área.
  useEffect(() => () => {
    setSelectedEntityId(null);
    setSelectedModuleId(null);
  }, [setSelectedEntityId, setSelectedModuleId]);

  useEffect(() => {
    const entityId = selectedModuleId ?? selectedEntityId;
    const lot = entityId ? lotsByEntity.get(entityId) ?? null : null;
    if (!lot) return;
    setLotGoneNotice(false);
    setSelectedLotId(lot.id);
    track('lot_selected', { lotId: lot.id });
    track('lot_details_viewed', { lotId: lot.id });
  }, [lotsByEntity, selectedEntityId, selectedModuleId, track]);

  const selectedLot: PublicLot | null = useMemo(
    () => lots.find((lot) => lot.id === selectedLotId) ?? null,
    [lots, selectedLotId],
  );

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
        </div>
      </header>

      <div className="public-map-body">
        {inventory.isLoading && <p className="public-map-state" role="status">Carregando a área…</p>}

        {data && showMap && (
          <div className="public-map-canvas">
            <Suspense fallback={<p className="public-map-state" role="status">Preparando o mapa…</p>}>
              <CommercialMapCanvas
                entities={data.entities}
                lots={canvasLots}
                calibration={null}
                matchingEntityIds={EMPTY_MATCHES}
                filtersActive={false}
                sceneSegmentId={sceneSegmentId}
                sceneInteriorEntityId={pavilionEntity?.id ?? null}
                isolatedArea={sceneSegmentId}
              />
            </Suspense>
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
