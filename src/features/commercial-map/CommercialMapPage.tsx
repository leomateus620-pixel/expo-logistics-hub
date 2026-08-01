import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Box,
  DatabaseZap,
  Loader2,
  MapPinned,
  MapPinPlus,
  RefreshCw,
  Ruler,
  Send,
  Sparkles,
  Tractor,
  Trees,
} from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCommercialMap, useMapEntityFilter, useMapMutations, useMapPermissions } from './hooks/useCommercialMap';
import { useCommercialMapStore } from './state/useCommercialMapStore';
import { CommercialMapCanvas } from './components/canvas/CommercialMapCanvas';
import { MapToolbar } from './components/controls/MapToolbar';
import { GeometryEditor } from './components/editor/GeometryEditor';
import { LotCreationWorkspace } from './components/editor/LotCreationWorkspace';
import {
  CommercialSummary,
  EntityDetailsPanel,
  LayersPanel,
  StatusLegend,
} from './components/panels/MapPanels';
import { MapListView, ResultsPanel } from './components/panels/EntityExplorer';
import { CalibrationPanel } from './components/panels/CalibrationPanel';
import { SegmentLegend } from './components/segments/SegmentLegend';
import { resolveStrategicLandmarkKind } from './utils/landmarks';
import { OFFICIAL_REFERENCE_REVISION } from './data/officialReference2026';
import {
  COMMERCIAL_MAP_SEGMENT_IDS,
  buildCommercialMapSegmentIndex,
  getCommercialMapSegment,
  type CommercialMapSegmentId,
} from './data/commercialMapSegments';
import {
  areaScopeFromSearchParams,
  isSegmentCompatibleWithAreaScope,
  scopeCommercialMapData,
  type CommercialMapAreaScope,
} from './utils/areaScope';
import { canUseTechnicalValidationOverlay } from './utils/technicalValidation';
import './commercial-map.css';

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
  } catch {
    return false;
  }
}

function MapPageSkeleton() {
  return (
    <div className="commercial-map-shell is-loading">
      <div className="commercial-map-page-loader"><Loader2 /><strong>Carregando mapa comercial</strong><span>Sincronizando projeto, camadas e situação dos lotes…</span></div>
    </div>
  );
}

export default function CommercialMapPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const areaScope = areaScopeFromSearchParams(searchParams);
  const isExporural = areaScope === 'exporural';
  const mapQuery = useCommercialMap();
  const permissions = useMapPermissions();
  const { bootstrap, exporuralSync, publish } = useMapMutations();
  const selectedEntityId = useCommercialMapStore((state) => state.selectedEntityId);
  const interiorEntityId = useCommercialMapStore((state) => state.interiorEntityId);
  const exitInterior = useCommercialMapStore((state) => state.exitInterior);
  const activePanel = useCommercialMapStore((state) => state.activePanel);
  const setActivePanel = useCommercialMapStore((state) => state.setActivePanel);
  const workspaceMode = useCommercialMapStore((state) => state.workspaceMode);
  const setWorkspaceMode = useCommercialMapStore((state) => state.setWorkspaceMode);
  const clearExplorerFilters = useCommercialMapStore((state) => state.clearExplorerFilters);
  const setTechnicalValidationVisible = useCommercialMapStore((state) => state.setTechnicalValidationVisible);
  const requestCameraPreset = useCommercialMapStore((state) => state.requestCameraPreset);
  const activeSegmentId = useCommercialMapStore((state) => state.activeSegmentId);
  const requestSegmentFocus = useCommercialMapStore((state) => state.requestSegmentFocus);
  const clearSegmentFocus = useCommercialMapStore((state) => state.clearSegmentFocus);
  const setSelectedEntityId = useCommercialMapStore((state) => state.setSelectedEntityId);
  const interiorBackButtonRef = useRef<HTMLButtonElement>(null);
  const lastInteriorEntityId = useRef<string | null>(null);
  const previousAreaScope = useRef<CommercialMapAreaScope>(areaScope);
  const initializedAreaScope = useRef(false);
  const [webglAvailable] = useState(() => supportsWebGL());
  const [publishReason, setPublishReason] = useState('Publicação após revisão cartográfica e comercial');
  const technicalValidationAllowed = canUseTechnicalValidationOverlay(areaScope, permissions);

  const data = mapQuery.data;
  const scopedData = useMemo(
    () => scopeCommercialMapData(
      { entities: data?.entities ?? [], lots: data?.lots ?? [] },
      areaScope,
    ),
    [areaScope, data?.entities, data?.lots],
  );
  const scopedSegmentIndex = useMemo(
    () => buildCommercialMapSegmentIndex(scopedData.entities, scopedData.lots),
    [scopedData.entities, scopedData.lots],
  );
  const activeSegment = getCommercialMapSegment(activeSegmentId);
  const summaryLots = useMemo(() => (
    activeSegment?.behavior.interaction === 'filter-and-focus' && activeSegmentId
      ? scopedData.lots.filter((lot) => scopedSegmentIndex.get(lot.entityId)?.id === activeSegmentId)
      : scopedData.lots
  ), [activeSegment?.behavior.interaction, activeSegmentId, scopedData.lots, scopedSegmentIndex]);
  const mapFilter = useMapEntityFilter(scopedData.entities, scopedData.lots);
  const selectedEntity = scopedData.entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const selectedLot = scopedData.lots.find((lot) => lot.entityId === selectedEntityId);
  const selectedKind = selectedEntity ? resolveStrategicLandmarkKind(selectedEntity) : null;
  const interiorEntity = data?.entities.find((entity) => entity.id === interiorEntityId) ?? null;
  const interiorKind = interiorEntity ? resolveStrategicLandmarkKind(interiorEntity) : null;

  const setAreaScope = (nextScope: CommercialMapAreaScope) => {
    if (nextScope === 'exporural' && activeSegmentId !== COMMERCIAL_MAP_SEGMENT_IDS.exporural) {
      clearSegmentFocus();
    }
    requestCameraPreset(nextScope === 'exporural' ? 'exporural' : 'overview');
    const next = new URLSearchParams(searchParams);
    if (nextScope === 'exporural') next.set('area', 'exporural');
    else next.delete('area');
    setSearchParams(next, { replace: false });
  };

  const handleSegmentSelect = (segmentId: CommercialMapSegmentId) => {
    if (segmentId === activeSegmentId) {
      clearSegmentFocus();
      if (workspaceMode !== 'list') requestCameraPreset(isExporural ? 'exporural' : 'overview');
      return;
    }

    requestSegmentFocus(segmentId);
    if (isExporural && segmentId !== COMMERCIAL_MAP_SEGMENT_IDS.exporural) {
      const next = new URLSearchParams(searchParams);
      next.delete('area');
      setSearchParams(next, { replace: false });
    }
  };

  const handleSegmentClear = () => {
    clearSegmentFocus();
    if (workspaceMode !== 'list') requestCameraPreset(isExporural ? 'exporural' : 'overview');
  };

  useEffect(() => {
    if (!initializedAreaScope.current) {
      initializedAreaScope.current = true;
      const compatibleSegment = isSegmentCompatibleWithAreaScope(activeSegmentId, areaScope);
      if (activeSegmentId && compatibleSegment) requestSegmentFocus(activeSegmentId);
      else if (areaScope === 'exporural') {
        if (activeSegmentId) clearSegmentFocus();
        requestCameraPreset('exporural');
      }
      return;
    }
    if (previousAreaScope.current === areaScope) return;
    previousAreaScope.current = areaScope;
    const focusedSegment = useCommercialMapStore.getState().activeSegmentId;
    const compatibleSegment = isSegmentCompatibleWithAreaScope(focusedSegment, areaScope);
    clearExplorerFilters();
    setSelectedEntityId(null);
    setActivePanel(null);
    setWorkspaceMode('3d');
    if (focusedSegment && compatibleSegment) requestSegmentFocus(focusedSegment);
    else requestCameraPreset(areaScope === 'exporural' ? 'exporural' : 'overview');
  }, [
    activeSegmentId,
    areaScope,
    clearSegmentFocus,
    clearExplorerFilters,
    requestCameraPreset,
    requestSegmentFocus,
    setActivePanel,
    setSelectedEntityId,
    setWorkspaceMode,
  ]);

  useEffect(() => {
    if (selectedEntityId && !scopedData.entityIds.has(selectedEntityId)) setSelectedEntityId(null);
  }, [scopedData.entityIds, selectedEntityId, setSelectedEntityId]);

  useEffect(() => {
    if (!technicalValidationAllowed) setTechnicalValidationVisible(false);
  }, [setTechnicalValidationVisible, technicalValidationAllowed]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const searchTarget = workspaceMode === 'list'
          ? document.querySelector('.commercial-map-list-view [data-commercial-map-search]')
          : activePanel === 'results'
            ? document.querySelector('.commercial-map-results-panel [data-commercial-map-search]')
            : document.querySelector('.commercial-map-search [data-commercial-map-search]');
        (searchTarget as HTMLInputElement | null)?.focus();
      }
      if (event.key === 'Escape' && !event.defaultPrevented) {
        if (interiorEntityId) exitInterior();
        else setActivePanel(null);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [activePanel, exitInterior, interiorEntityId, setActivePanel, workspaceMode]);

  useEffect(() => {
    if (interiorEntityId) {
      lastInteriorEntityId.current = interiorEntityId;
      const frame = window.requestAnimationFrame(() => interiorBackButtonRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }
    if (!lastInteriorEntityId.current) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const interiorTriggerId = lastInteriorEntityId.current;
      const trigger = Array.from(
        document.querySelectorAll<HTMLElement>('[data-commercial-map-interior-trigger]'),
      ).find((candidate) => (
        candidate.offsetParent !== null
        && candidate.dataset.commercialMapInteriorTrigger === interiorTriggerId
      ));
      trigger?.focus();
      lastInteriorEntityId.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [interiorEntityId]);

  useEffect(() => {
    if (workspaceMode === 'edit' && !selectedEntity) setWorkspaceMode('3d');
  }, [selectedEntity, setWorkspaceMode, workspaceMode]);

  const projectStats = useMemo(() => {
    if (!data) return null;
    const verified = data.entities.filter((entity) => entity.verificationStatus === 'VERIFIED').length;
    return { verified, review: data.entities.length - verified };
  }, [data]);
  const publishReady = data?.calibration?.status === 'VALIDATED' && projectStats?.review === 0;

  if (mapQuery.isLoading) return <MapPageSkeleton />;
  if (mapQuery.isError || !data) {
    return (
      <section className="commercial-map-shell" aria-label="Falha ao carregar o mapa comercial">
        <div className="commercial-map-page-error" role="alert">
          <AlertTriangle />
          <span><strong>Não foi possível sincronizar o mapa</strong>A base local não substituiu silenciosamente uma falha de rede ou permissão. Tente novamente após verificar sua conexão.</span>
          <Button onClick={() => mapQuery.refetch()} disabled={mapQuery.isFetching}><RefreshCw className={mapQuery.isFetching ? 'animate-spin' : ''} />Tentar novamente</Button>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`commercial-map-shell ${isExporural ? 'is-exporural' : ''} ${interiorEntityId ? 'is-interior' : ''} ${interiorKind === 'livestock-pavilion' ? 'is-livestock-interior' : ''} ${interiorKind === 'mirante-pavilion' ? 'is-mirante-interior' : ''} ${selectedKind === 'livestock-pavilion' || selectedKind === 'mirante-pavilion' ? 'has-architectural-selection' : ''}`}
      aria-label="Plataforma de gestão do mapa comercial"
    >
      <header className="commercial-map-command-header">
        <div className="commercial-map-title-lockup">
          <div className="commercial-map-title-icon"><MapPinned /></div>
          <div>
            <span>Gestão territorial e comercial · Fenasoja 2028</span>
            <h1>{isExporural ? 'Exporural' : 'Mapa Comercial'}</h1>
            <p>{isExporural ? 'Vista isolada · Quadras R e S · referência cadastral 2026' : `Referência cartográfica: ${data.project.name}`}</p>
          </div>
        </div>
        <nav className="commercial-map-view-selector" aria-label="Área exibida no mapa">
          <button
            type="button"
            className={!isExporural ? 'is-active' : ''}
            onClick={() => setAreaScope('park')}
            aria-pressed={!isExporural}
          >
            <Trees />Parque completo
          </button>
          <button
            type="button"
            className={isExporural ? 'is-active' : ''}
            onClick={() => setAreaScope('exporural')}
            aria-pressed={isExporural}
          >
            <Tractor />Exporural
          </button>
        </nav>
        <div className="commercial-map-header-actions">
          {data.source === 'database'
            && permissions.isMapAdmin
            && data.project.referenceRevision !== OFFICIAL_REFERENCE_REVISION
            && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm"><DatabaseZap />Persistir Exporural</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <div className="commercial-map-dialog-icon"><DatabaseZap /></div>
                    <AlertDialogTitle>Aplicar a revisão Exporural 2026.3?</AlertDialogTitle>
                    <AlertDialogDescription>
                      A operação é limitada às Quadras R/S, suas sete ruas e apoios confirmados. Antes de escrever, o banco valida áreas, sobreposições e estruturas protegidas, cria um snapshot e preserva status, preços, reservas, vendas e contratos.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={exporuralSync.isPending}
                      onClick={() => exporuralSync.mutate()}
                    >
                      Validar e versionar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          {permissions.isMapAdmin && (
            <Button variant="outline" size="sm" onClick={() => setActivePanel('calibration')}><Ruler />Calibrar</Button>
          )}
          {data.source === 'database' && permissions.canManageLots && (
            <Button size="sm" onClick={() => setWorkspaceMode('create')}><MapPinPlus />Cadastrar lote</Button>
          )}
          {data.source === 'database' && permissions.isMapAdmin && !data.project.isPublished && (
            <AlertDialog>
              <AlertDialogTrigger asChild><Button size="sm" variant="outline"><Send />Publicar versão</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <div className="commercial-map-dialog-icon"><Send /></div>
                  <AlertDialogTitle>Publicar o mapa para a equipe?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A publicação exige a calibração mais recente validada e todas as entidades ativas verificadas. O banco repete esses gates dentro da transação.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="commercial-map-publish-gates">
                  <span className={data.calibration?.status === 'VALIDATED' ? 'is-ready' : ''}><Ruler />Calibração {data.calibration?.status === 'VALIDATED' ? 'validada' : 'pendente'}</span>
                  <span className={projectStats?.review === 0 ? 'is-ready' : ''}><BadgeCheck />{projectStats?.review ?? 0} entidades pendentes</span>
                </div>
                <Textarea value={publishReason} onChange={(event) => setPublishReason(event.target.value)} rows={3} aria-label="Motivo da publicação" />
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction disabled={!publishReady || !publishReason.trim() || publish.isPending} onClick={() => publish.mutate({ projectId: data.project.id, reason: publishReason.trim() })}>Publicar nova versão</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {data.source === 'official-reference' && permissions.isMapAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm"><DatabaseZap />Implantar base 2026</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <div className="commercial-map-dialog-icon"><DatabaseZap /></div>
                  <AlertDialogTitle>Sincronizar a cartografia oficial 2026?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A sincronização importa 21 quadras, 262 lotes numerados, vias e infraestrutura sem copiar a lista lateral de compradores. Lotes novos entram bloqueados e sem preço ou área oficial; registros comerciais existentes e geometrias já validadas são preservados.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => bootstrap.mutate()}>Sincronizar como rascunho</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </header>

      {data.sourceMessage && (
        <div
          className={`commercial-map-source-notice is-${data.source}`}
          role="status"
          title={data.sourceMessage}
        >
          <AlertTriangle aria-hidden="true" />
          <strong>
            {data.source === 'official-reference'
              ? 'Referência oficial · somente leitura'
              : 'Estado da base persistida'}
          </strong>
          <span>{data.sourceMessage}</span>
        </div>
      )}

      {!interiorEntityId && workspaceMode !== 'edit' && workspaceMode !== 'create' && (
        <SegmentLegend
          entities={data.entities}
          lots={data.lots}
          activeSegmentId={activeSegmentId}
          onSelect={handleSegmentSelect}
          onClear={handleSegmentClear}
        />
      )}

      <div id="commercial-map-viewport" className="commercial-map-viewport">
        {workspaceMode === 'create' ? (
          <LotCreationWorkspace project={data.project} calibration={data.calibration} layers={data.layers} entities={scopedData.entities} />
        ) : workspaceMode === 'edit' && selectedEntity ? (
          <GeometryEditor entity={selectedEntity} calibration={data.calibration} />
        ) : workspaceMode === 'list' || !webglAvailable ? (
          <MapListView explorer={mapFilter} permissions={permissions} />
        ) : (
          <>
            <CommercialMapCanvas
              key={areaScope}
              entities={scopedData.entities}
              lots={scopedData.lots}
              calibration={data.calibration}
              matchingEntityIds={mapFilter.matchingEntityIds}
              filtersActive={mapFilter.hasActiveCriteria}
              isolatedArea={isExporural ? 'exporural' : null}
              technicalValidationAllowed={technicalValidationAllowed}
            />
            {interiorEntity ? (
              <div
                className="commercial-map-interior-navigation"
                role="navigation"
                aria-label={`Navegação do interior de ${interiorEntity.name}`}
              >
                <Button
                  ref={interiorBackButtonRef}
                  variant="outline"
                  onClick={exitInterior}
                  aria-label={`Voltar ao mapa a partir de ${interiorEntity.name}`}
                  aria-keyshortcuts="Escape"
                >
                  <ArrowLeft />Voltar ao mapa
                </Button>
                <div>
                  <span>Inspeção interna · {interiorEntity.publicIdentifier}</span>
                  <strong>{interiorEntity.name}</strong>
                  <small>
                    {interiorKind === 'livestock-pavilion'
                      ? 'Arraste para percorrer o corredor e as baias · role para aproximar'
                      : interiorKind === 'mirante-pavilion'
                        ? 'Arraste para observar o salão e a vista da Arena · role para aproximar'
                        : 'Arraste para observar os ambientes · role para aproximar'}
                  </small>
                </div>
                <kbd>Esc</kbd>
              </div>
            ) : (
              <>
                <CommercialSummary
                  lots={summaryLots}
                  scope={areaScope}
                  segmentName={activeSegment?.name}
                />
                <MapToolbar permissions={permissions} hasSelection={Boolean(selectedEntity)} areaScope={areaScope} />
                <StatusLegend scope={areaScope} />
              </>
            )}

            {!interiorEntityId && scopedData.lots.length === 0 && (
              <div className="commercial-map-onboarding-note">
                <Sparkles />
                <span><strong>Parque digitalizado, cadastro comercial protegido</strong>A base não contém lotes fictícios. Trace e valide cada unidade antes de ativar preços e vendas.</span>
              </div>
            )}

            {!interiorEntityId && activePanel === 'layers' && <LayersPanel layers={data.layers} entities={scopedData.entities} permissions={permissions} />}
            {!interiorEntityId && activePanel === 'results' && <ResultsPanel explorer={mapFilter} />}
            {!interiorEntityId && activePanel === 'details' && selectedEntity && <EntityDetailsPanel entity={selectedEntity} lot={selectedLot} entities={scopedData.entities} lots={scopedData.lots} permissions={permissions} />}
            {!interiorEntityId && activePanel === 'calibration' && <CalibrationPanel project={data.project} calibration={data.calibration} />}
          </>
        )}

        {!webglAvailable && workspaceMode !== 'edit' && (
          <div className="commercial-map-webgl-note"><Box /><span><strong>Modo 2D acessível ativado</strong>O navegador não disponibilizou WebGL 2. A tabela permanece totalmente operacional.</span></div>
        )}
      </div>
    </section>
  );
}
