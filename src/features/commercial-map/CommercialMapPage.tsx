import { commercialMapDiagnosticsEnabled } from './utils/performanceDiagnostics';
import { CommercialMapBootLoader } from './components/CommercialMapBootLoader';
import { useCommercialMapBootVisit } from './hooks/useCommercialMapBootVisit';
import { Profiler, lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Box,
  DatabaseZap,
  MapPinPlus,
  MousePointer2,
  RefreshCw,
  Rocket,
  Ruler,
  Send,
  SkipForward,
  Sparkles,
} from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  FULL_COMMERCIAL_MAP_SCOPE,
  useCommercialMap,
  useMapEntityFilter,
  useMapMutations,
  useMapPermissions,
} from './hooks/useCommercialMap';
import { useCommercialMapStore } from './state/useCommercialMapStore';
import { useVisitStore } from './visit/useVisitStore';
import { preloadCommercialMapCanvas } from './utils/preloadCanvas';
const CommercialMapCanvas = lazy(preloadCommercialMapCanvas);
const VisitHUD = lazy(() => import('./visit/VisitHUD'));
import { CommercialMapRendererStatus } from './components/CommercialMapRendererStatus';
import { MapToolbar } from './components/controls/MapToolbar';
import { CommercialMapTopBar } from './components/controls/CommercialMapTopBar';
import { CommercialMapDock } from './components/dock/CommercialMapDock';
import { CommercialMapHeaderTools } from './components/shell/CommercialMapHeaderTools';
import { SalesModeLayer } from './sales/components/SalesModeLayer';
const GeometryEditor = lazy(() => import('./components/editor/GeometryEditor').then((m) => ({ default: m.GeometryEditor })));
const LotCreationWorkspace = lazy(() => import('./components/editor/LotCreationWorkspace').then((m) => ({ default: m.LotCreationWorkspace })));
const EntityDetailsPanel = lazy(() => import('./components/panels/MapPanels').then((m) => ({ default: m.EntityDetailsPanel })));
const LayersPanel = lazy(() => import('./components/panels/MapPanels').then((m) => ({ default: m.LayersPanel })));
const MapListView = lazy(() => import('./components/panels/EntityExplorer').then((m) => ({ default: m.MapListView })));
const ResultsPanel = lazy(() => import('./components/panels/EntityExplorer').then((m) => ({ default: m.ResultsPanel })));
const CalibrationPanel = lazy(() => import('./components/panels/CalibrationPanel').then((m) => ({ default: m.CalibrationPanel })));
import { PavilionModuleCard } from './components/panels/PavilionModuleCard';
import { HydrologicalNetworkLegend } from './components/panels/HydrologicalNetworkLegend';
import { ParkingInspector } from './components/panels/ParkingInspector';
import { MapPanelBoundary } from './components/panels/MapPanelBoundary';
import { resolveStrategicLandmarkKind } from './utils/landmarks';
import { resolveCommercialPavilionModulePlan } from './utils/commercialPavilionModules';
import { OFFICIAL_REFERENCE_REVISION } from './data/officialReference2026';
import { REAR_PARKING_BLOCKS, rearParkingVisibleInArea, rearParkingLayerPresentation } from './data/rearParking';
import {
  COMMERCIAL_MAP_SEGMENT_IDS,
  getCommercialMapSegment,
  type CommercialMapSegmentDefinition,
  type CommercialMapSegmentId,
} from './data/commercialMapSegments';
import {
  areaScopeFromSearchParams,
  scopeCommercialMapData,
  type CommercialMapAreaScope,
} from './utils/areaScope';
import { canUseTechnicalValidationOverlay } from './utils/technicalValidation';
import { lunarLaunchPhaseLabel } from './utils/lunarLaunch';
import { recordCommercialMapProfiler } from './utils/profilerDiagnostics';
import { markCommercialMapStage } from './utils/performanceDiagnostics';
import { canHandleCommercialMapEscape } from './utils/contextualNavigation';
import type { CommercialMapData, CommercialMapQueryScope, MapPermissions } from './types';
import './commercial-map.css';
import './commercial-map-mobile.css';
import './visit/visit.css';

import { useWebGLAvailability } from './hooks/useWebGLAvailability';
import { PublicInterestDialog } from './public/PublicInterestDialog';

function MapFeatureBoundary({ id, children }: { id: string; children: ReactNode }) {
  return <MapPanelBoundary resetKey={id} title="Ferramenta indisponível">
    <Suspense fallback={<aside role="status" className="commercial-map-panel commercial-map-details-skeleton">Carregando ferramenta…</aside>}>
      {children}
    </Suspense>
  </MapPanelBoundary>;
}

function MapPageSkeleton() {
  return (
    <div className="commercial-map-shell is-loading">
      <CommercialMapBootLoader force />
    </div>
  );
}

function EntityDetailsPanelSkeleton() {
  return (
    <aside
      className="commercial-map-panel commercial-map-details-panel commercial-map-details-skeleton"
      aria-label="Carregando detalhes da estrutura"
      aria-live="polite"
    >
      <div className="commercial-map-panel-header">
        <div>
          <span>Estrutura selecionada</span>
          <h2>Carregando detalhes…</h2>
        </div>
      </div>
      <div className="commercial-map-details-skeleton__content" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </aside>
  );
}

interface CommercialMapPageProps {
  scope?: CommercialMapQueryScope;
  /** Official fixtures for the DEV-only interface diagnostics route. */
  previewData?: CommercialMapData;
  previewWebGLUnavailable?: boolean;
}

function withPersistedCamera(
  segment: CommercialMapSegmentDefinition | null,
  data: CommercialMapData | undefined,
) {
  const camera = data?.scope?.mode === 'commission' ? data.scope.cameraConfig : null;
  const direction = camera?.direction;
  if (!segment || !Array.isArray(direction) || direction.length !== 3) return segment;

  return {
    ...segment,
    camera: {
      direction: direction.map(Number) as [number, number, number],
      padding: Number(camera.padding),
      minDistanceRatio: Number(camera.minDistanceRatio),
      maxDistanceRatio: Number(camera.maxDistanceRatio),
    },
  } satisfies CommercialMapSegmentDefinition;
}

const COMMISSION_READ_ONLY_PERMISSIONS: MapPermissions = {
  canView: true,
  canEdit: false,
  canEditGeometry: false,
  canManageLots: false,
  canManageSales: false,
  canManageContracts: false,
  canManageLayers: false,
  canViewMapAnalytics: false,
  isMapAdmin: false,
};

export default function CommercialMapPage({ scope = FULL_COMMERCIAL_MAP_SCOPE, previewData, previewWebGLUnavailable = false }: CommercialMapPageProps) {
  useCommercialMapBootVisit();
  const [searchParams, setSearchParams] = useSearchParams();
  const isCommissionScope = scope.mode === 'commission';
  const lockedSegmentId = scope.mode === 'commission'
    ? scope.segmentId as CommercialMapSegmentId
    : null;
  // A segment is a presentation filter. Only commission permissions restrict data scope.
  const areaScope: CommercialMapAreaScope = lockedSegmentId ?? 'park';
  const isExporural = areaScope === 'exporural';
  const registeredScopedSegment = areaScope === 'park' ? null : getCommercialMapSegment(areaScope);
  const mapQuery = useCommercialMap(scope);
  const { available: webglAvailable, retry: retryWebGL, attempts: webglAttempts, canRetry: canRetryWebGL } = useWebGLAvailability(Boolean(previewData && previewWebGLUnavailable));
  useEffect(() => {
    markCommercialMapStage('route-mounted');
    // Start during the data wait. Catch speculative errors; lazy owns error UI.
    if (webglAvailable) void preloadCommercialMapCanvas().catch(() => undefined);
  }, [webglAvailable]);
  const resolvedPermissions = useMapPermissions();
  const isPreview = commercialMapDiagnosticsEnabled && Boolean(previewData);
  useEffect(() => { if (isPreview) markCommercialMapStage('fixture-data-ready'); }, [isPreview]);
  const permissions = isCommissionScope || isPreview ? COMMISSION_READ_ONLY_PERMISSIONS : resolvedPermissions;
  const { bootstrap, exporuralSync, publish } = useMapMutations();
  const selectedEntityId = useCommercialMapStore((state) => state.selectedEntityId);
  const visitEnabled = useVisitStore((state) => state.enabled);
  const interiorEntityId = useCommercialMapStore((state) => state.interiorEntityId);
  const exitInterior = useCommercialMapStore((state) => state.exitInterior);
  const activePanel = useCommercialMapStore((state) => state.activePanel);
  const setActivePanel = useCommercialMapStore((state) => state.setActivePanel);
  const workspaceMode = useCommercialMapStore((state) => state.workspaceMode);
  const workspaceBeforeVisit = useRef(workspaceMode);
  if (!visitEnabled) workspaceBeforeVisit.current = workspaceMode;
  const setWorkspaceMode = useCommercialMapStore((state) => state.setWorkspaceMode);
  const setTechnicalValidationVisible = useCommercialMapStore((state) => state.setTechnicalValidationVisible);
  const hydrologicalModeActive = useCommercialMapStore((state) => state.hydrologicalModeActive);
  const parkingInspectionOpen = useCommercialMapStore((state) => state.parkingInspectionOpen);
  const closeParkingInspection = useCommercialMapStore((state) => state.closeParkingInspection);
  const layerVisibility = useCommercialMapStore((state) => state.layerVisibility);
  const layerOpacity = useCommercialMapStore((state) => state.layerOpacity);
  const activeSegmentId = useCommercialMapStore((state) => state.activeSegmentId);
  const requestSegmentFocus = useCommercialMapStore((state) => state.requestSegmentFocus);
  const clearSegmentFocus = useCommercialMapStore((state) => state.clearSegmentFocus);
  const setSelectedEntityId = useCommercialMapStore((state) => state.setSelectedEntityId);
  const activateScope = useCommercialMapStore((state) => state.activateScope);
  const lunarLaunchPhase = useCommercialMapStore((state) => state.lunarLaunchPhase);
  const lunarLaunchReturning = useCommercialMapStore((state) => state.lunarLaunchReturning);
  const lunarLaunchReturnAvailable = useCommercialMapStore((state) => state.lunarLaunchReturnAvailable);
  const lunarLaunchPreviousPanel = useCommercialMapStore((state) => state.lunarLaunchPreviousPanel);
  const requestLunarLaunchSkip = useCommercialMapStore((state) => state.requestLunarLaunchSkip);
  const requestLunarLaunchReturn = useCommercialMapStore((state) => state.requestLunarLaunchReturn);
  const lastInteriorEntityId = useRef<string | null>(null);
  const [publishReason, setPublishReason] = useState('Publicação após revisão cartográfica e comercial');
  const technicalValidationAllowed = !isCommissionScope
    && canUseTechnicalValidationOverlay(areaScope, permissions);
  const mapScopeKey = scope.mode === 'commission'
    ? `commission:${scope.commissionId}:${scope.segmentId}`
    : 'full-map';
  const lunarLaunchActive = lunarLaunchPhase !== 'idle';
  const lunarCinematicUiActive = lunarLaunchActive || lunarLaunchReturning;
  const previousMapScope = useRef(mapScopeKey);

  useEffect(() => () => {
    const visit = useVisitStore.getState();
    if (visit.enabled) { visit.exit(); visit.finishExit(); }
  }, []);

  useEffect(() => {
    // A commission change replaces the authorized snapshot. Do not carry a
    // visitor or return selection from the previous scope into the new one.
    if (previousMapScope.current !== mapScopeKey && useVisitStore.getState().enabled) {
      useVisitStore.getState().exit();
      useVisitStore.getState().finishExit();
    }
    previousMapScope.current = mapScopeKey;
    activateScope(mapScopeKey, lockedSegmentId);
  }, [activateScope, lockedSegmentId, mapScopeKey]);

  useEffect(() => {
    if (isCommissionScope && lockedSegmentId && activeSegmentId !== lockedSegmentId) {
      activateScope(mapScopeKey, lockedSegmentId);
    }
  }, [activateScope, activeSegmentId, isCommissionScope, lockedSegmentId, mapScopeKey]);

  const data = isPreview ? previewData : mapQuery.data;
  const scopedSegment = useMemo(
    () => withPersistedCamera(registeredScopedSegment, data),
    [data, registeredScopedSegment],
  );
  const scopedData = useMemo(
    () => scopeCommercialMapData(
      { entities: data?.entities ?? [], lots: data?.lots ?? [] },
      areaScope,
    ),
    [areaScope, data?.entities, data?.lots],
  );
  const parkingAvailable = rearParkingVisibleInArea(areaScope) && !hydrologicalModeActive
    && rearParkingLayerPresentation(data?.entities ?? [], layerVisibility, layerOpacity).visible;
  useEffect(() => {
    if (!parkingAvailable && parkingInspectionOpen) closeParkingInspection();
  }, [closeParkingInspection, parkingAvailable, parkingInspectionOpen]);
  const mapFilter = useMapEntityFilter(scopedData.entities, scopedData.lots);
  // DOM controls commit the current selection first; scene styling can render
  // concurrently using the existing objects. React discards superseded results.
  const presentation = useMemo(() => ({
    activeSegmentId, interiorEntityId,
    matchingEntityIds: mapFilter.matchingEntityIds,
    filtersActive: mapFilter.hasActiveCriteria,
  }), [activeSegmentId, interiorEntityId, mapFilter.matchingEntityIds, mapFilter.hasActiveCriteria]);
  const scenePresentation = useDeferredValue(presentation);
  const selectedEntity = scopedData.entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const selectedLot = scopedData.lots.find((lot) => lot.entityId === selectedEntityId);
  const selectedKind = selectedEntity ? resolveStrategicLandmarkKind(selectedEntity) : null;
  const interiorEntity = data?.entities.find((entity) => entity.id === interiorEntityId) ?? null;
  const interiorKind = interiorEntity ? resolveStrategicLandmarkKind(interiorEntity) : null;
  const interiorPavilionPlan = interiorKind === 'commercial-pavilion' && interiorEntity
    ? resolveCommercialPavilionModulePlan(interiorEntity)
    : null;

  const handleSegmentClear = () => {
    if (isCommissionScope) return;
    clearSegmentFocus();
  };

  const handleSegmentSelect = (segmentId: CommercialMapSegmentId) => {
    if (isCommissionScope) return;
    if (segmentId === useCommercialMapStore.getState().activeSegmentId) handleSegmentClear();
    else requestSegmentFocus(segmentId);
  };

  // Preserve old links without keeping a second competing navigation state.
  useEffect(() => {
    if (isCommissionScope || !searchParams.has('area')) return;
    const legacyScope = areaScopeFromSearchParams(searchParams);
    if (legacyScope !== 'park') requestSegmentFocus(legacyScope);
    const next = new URLSearchParams(searchParams);
    next.delete('area');
    setSearchParams(next, { replace: true });
  }, [isCommissionScope, requestSegmentFocus, searchParams, setSearchParams]);

  useEffect(() => {
    if (selectedEntityId && !scopedData.entityIds.has(selectedEntityId)) setSelectedEntityId(null);
  }, [scopedData.entityIds, selectedEntityId, setSelectedEntityId]);

  useEffect(() => {
    if (!technicalValidationAllowed) setTechnicalValidationVisible(false);
  }, [setTechnicalValidationVisible, technicalValidationAllowed]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const visit = useVisitStore.getState();
      if (visit.enabled) {
        if (visit.activeInterior && canHandleCommercialMapEscape(event)) {
          event.preventDefault();
          visit.leaveInterior();
        }
        // Desktop visit input owns Escape outside an explicitly opened interior.
        // Hidden map search and panels must never steal keyboard focus here.
        return;
      }
      if (
        !lunarCinematicUiActive
        && (event.metaKey || event.ctrlKey)
        && event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault();
        const searchTarget = Array.from(
          document.querySelectorAll<HTMLInputElement>('[data-commercial-map-search]'),
        ).find((candidate) => candidate.offsetParent !== null);
        if (searchTarget) searchTarget.focus();
        else document.querySelector<HTMLButtonElement>(
          '[data-commercial-map-shell-search-trigger], [data-commercial-map-commission-search-trigger]',
        )?.click();
      }
      if (canHandleCommercialMapEscape(event)) {
        if (lunarLaunchActive) {
          event.preventDefault();
          event.stopPropagation();
          requestLunarLaunchSkip();
        } else if (interiorEntityId) exitInterior();
        else if (parkingInspectionOpen) closeParkingInspection();
        else setActivePanel(null);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [
    activePanel,
    closeParkingInspection,
    exitInterior,
    interiorEntityId,
    parkingInspectionOpen,
    lunarLaunchActive,
    lunarCinematicUiActive,
    requestLunarLaunchSkip,
    setActivePanel,
    workspaceMode,
  ]);

  useEffect(() => {
    if (interiorEntityId) {
      lastInteriorEntityId.current = interiorEntityId;
      const frame = window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(
        visitEnabled ? '[data-visit-leave-interior]' : '[data-map-interior-back]',
      )?.focus());
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
  }, [interiorEntityId, visitEnabled]);

  useEffect(() => {
    if (workspaceMode === 'edit' && !selectedEntity) setWorkspaceMode('3d');
  }, [selectedEntity, setWorkspaceMode, workspaceMode]);

  const projectStats = useMemo(() => {
    if (!data) return null;
    const verified = data.entities.filter((entity) => entity.verificationStatus === 'VERIFIED').length;
    return { verified, review: data.entities.length - verified };
  }, [data]);
  const publishReady = data?.calibration?.status === 'VALIDATED' && projectStats?.review === 0;
  const hasManagementActions = permissions.isMapAdmin
    || permissions.canManageLots
    || permissions.canEditGeometry
    || permissions.canViewMapAnalytics;
  if (!isPreview && mapQuery.isLoading) return <MapPageSkeleton />;
  if (!data) {
    return (
      <section className="commercial-map-shell" aria-label="Falha ao carregar o mapa comercial">
        <div className="commercial-map-page-error" role="alert">
          <AlertTriangle />
          <span>
            <strong>{isCommissionScope ? 'Segmento comercial indisponível' : 'Não foi possível sincronizar o mapa'}</strong>
            {isCommissionScope
              ? 'A configuração persistida ou a autorização desta comissão não pôde ser confirmada. Nenhum dado do parque completo foi carregado.'
              : 'A base local não substituiu silenciosamente uma falha de rede ou permissão. Tente novamente após verificar sua conexão.'}
          </span>
          <Button onClick={() => mapQuery.refetch()} disabled={mapQuery.isFetching}><RefreshCw className={mapQuery.isFetching ? 'animate-spin' : ''} />Tentar novamente</Button>
        </div>
      </section>
    );
  }

  const managementActions = hasManagementActions ? (
    <>
          {permissions.canViewMapAnalytics && <PublicInterestDialog />}
              {permissions.canEditGeometry && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setWorkspaceMode(workspaceMode === 'edit' ? '3d' : 'edit')}
                  disabled={!selectedEntity}
                >
                  <MousePointer2 />
                  {workspaceMode === 'edit' ? 'Sair da edição' : 'Editar geometria'}
                </Button>
              )}
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
                    <AlertDialogTitle>Aplicar a revisão Exporural 2026.4?</AlertDialogTitle>
                    <AlertDialogDescription>
                      A operação é limitada às Quadras R/S, suas sete ruas e seis apoios confirmados. Antes de escrever, o banco valida áreas, sobreposições e estruturas protegidas, cria um snapshot e preserva status, preços, reservas, vendas e contratos.
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
                      A sincronização importa 21 quadras, 262 lotes externos e 1.315 módulos neutros dos Pavilhões 1, 3, 5, 7, 8, 12, 13 e 14, além de vias e infraestrutura, sem copiar compradores. Os módulos entram bloqueados, sem preço e sem área individual; registros comerciais existentes e geometrias já validadas são preservados.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => bootstrap.mutate()}>Sincronizar como rascunho</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
              </AlertDialog>
            )}
    </>
  ) : null;

  return (
    <section
      className={`commercial-map-shell ${visitEnabled ? 'is-visit-mode' : ''} ${isCommissionScope ? 'is-commission-scope' : ''} ${isExporural ? 'is-exporural' : ''} ${areaScope === COMMERCIAL_MAP_SEGMENT_IDS.industry ? 'is-industry' : ''} ${hydrologicalModeActive ? 'is-hydrological-mode' : ''} ${parkingInspectionOpen ? 'is-parking-inspection' : ''} ${interiorEntityId ? 'is-interior' : ''} ${interiorKind === 'commercial-pavilion' ? 'is-commercial-pavilion-interior' : ''} ${interiorKind === 'livestock-pavilion' ? 'is-livestock-interior' : ''} ${interiorKind === 'mirante-pavilion' ? 'is-mirante-interior' : ''} ${selectedEntity ? 'has-selection' : ''} ${selectedKind === 'commercial-pavilion' || selectedKind === 'livestock-pavilion' || selectedKind === 'mirante-pavilion' ? 'has-architectural-selection' : ''} ${lunarCinematicUiActive ? 'is-lunar-launch-active' : ''} ${lunarLaunchReturnAvailable ? 'has-lunar-launch-return' : ''}`}
      aria-label="Plataforma de gestão do mapa comercial"
    >
      <CommercialMapHeaderTools
        managementActions={managementActions}
        salesAvailable={webglAvailable && data.source === 'database' && permissions.canManageSales}
        visitAvailable={webglAvailable && !interiorEntity && !lunarCinematicUiActive}
        visitEntityId={selectedLot && selectedEntity?.classification !== 'INTERNAL_STAND' ? selectedEntity?.id : undefined}
      />

      <div className="commercial-map-body">
        <div style={{ display: visitEnabled && !interiorEntity ? 'none' : 'contents' }} data-visit-preserved-dock>
        <CommercialMapDock
          entities={scopedData.entities}
          lots={scopedData.lots}
          activeSegmentId={activeSegmentId}
          onSegmentSelect={handleSegmentSelect}
          onSegmentClear={handleSegmentClear}
          scopeTitle={scopedSegment?.name}
          isCommissionScope={isCommissionScope}
          interiorEntity={interiorEntity}
          matchingEntityIds={mapFilter.matchingEntityIds}
          filtersActive={mapFilter.hasActiveCriteria}
          moduleCard={interiorPavilionPlan && interiorEntity ? <PavilionModuleCard
            embedded
            plan={interiorPavilionPlan}
            pavilion={interiorEntity}
            entities={data.entities}
            lots={data.lots}
            permissions={permissions}
            source={data.source}
            onSynchronize={() => bootstrap.mutate()}
            synchronizing={bootstrap.isPending}
          /> : null}
        />
        </div>

        <div id="commercial-map-viewport" className={`commercial-map-viewport${webglAvailable ? '' : ' is-webgl-fallback'}`}>

        {webglAvailable && workspaceMode === '3d' && permissions.canManageSales
          && (!visitEnabled || workspaceBeforeVisit.current === '3d') && (
          <div style={{ display: visitEnabled ? 'none' : 'contents' }} data-visit-preserved-sales>
          <SalesModeLayer projectId={data.project?.id ?? null} />
          </div>
        )}

        {webglAvailable && (
          <>
            <div
              className={`commercial-map-stage ${workspaceMode === '3d' ? '' : 'is-inactive'}`}
              aria-hidden={workspaceMode !== '3d'}
              data-canvas-lifecycle="persistent"
            >
              <Suspense fallback={<CommercialMapBootLoader force />}>
              <Profiler id="CommercialMapCanvas" onRender={recordCommercialMapProfiler}>
                <CommercialMapCanvas
                  active={workspaceMode === '3d'}
                  entities={scopedData.entities}
                  parkingOwnerEntities={data.entities}
                  siteEnvironmentEntities={data.entities}
                  lots={scopedData.lots}
                  calibration={data.calibration}
                  matchingEntityIds={scenePresentation.matchingEntityIds}
                  filtersActive={scenePresentation.filtersActive}
                  sceneSegmentId={scenePresentation.activeSegmentId}
                  sceneInteriorEntityId={scenePresentation.interiorEntityId}
                  isolatedArea={areaScope === 'park' ? null : areaScope}
                  segmentOverride={isCommissionScope ? scopedSegment : null}
                  technicalValidationAllowed={technicalValidationAllowed}
                />
              </Profiler>
              </Suspense>
              <CommercialMapRendererStatus />
              {visitEnabled && <Suspense fallback={<div role="status" style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', padding: '10px 16px', borderRadius: 12, background: '#fcfefaf0', zIndex: 42, fontSize: 12 }}>Preparando Modo Visita…</div>}>
                <VisitHUD />
              </Suspense>}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer"
                style={{position:'absolute',right:8,bottom:8,zIndex:5,fontSize:10,padding:'2px 5px',borderRadius:3,background:'#f5f7efdd',color:'#384b42'}}>
                Entorno © OpenStreetMap
              </a>
              <div
                className="commercial-map-lunar-launch-hud"
                data-phase={lunarLaunchPhase}
                aria-label={`Lançamento do Foguete Lunar: ${lunarLaunchPhaseLabel(lunarLaunchPhase)}`}
                hidden={!lunarLaunchActive}
              >
                  <div className="commercial-map-lunar-launch-status" role="status" aria-live="polite">
                    <span className="commercial-map-lunar-launch-mark" aria-hidden="true"><Rocket /></span>
                    <span>
                      <small>Foguete Lunar · experiência histórica</small>
                      <strong>{lunarLaunchPhaseLabel(lunarLaunchPhase)}</strong>
                    </span>
                  </div>
                  <div className="commercial-map-lunar-launch-progress" aria-hidden="true">
                    <i />
                  </div>
                  <button
                    type="button"
                    className="commercial-map-lunar-launch-skip"
                    onClick={requestLunarLaunchSkip}
                    aria-label="Pular animação e restaurar a vista anterior"
                    data-lunar-launch-skip
                  >
                    <SkipForward aria-hidden="true" />
                    <span>Pular animação</span>
                    <kbd>Esc</kbd>
                  </button>
              </div>
              {lunarLaunchReturning && (
                <div className="commercial-map-lunar-return-status" role="status" aria-live="polite">
                  Restaurando a vista anterior…
                </div>
              )}
              {lunarLaunchReturnAvailable && !lunarCinematicUiActive && !visitEnabled && (
                <button
                  type="button"
                  className="commercial-map-lunar-return"
                  onClick={requestLunarLaunchReturn}
                  data-lunar-launch-return
                >
                  <ArrowLeft aria-hidden="true" />
                  Voltar à vista anterior
                </button>
              )}
              {!interiorEntity && (
                <div style={{ display: visitEnabled ? 'none' : 'contents' }} data-visit-preserved-controls>
                  {!lunarCinematicUiActive && <CommercialMapTopBar
                    areaScope={areaScope}
                    permissions={permissions}
                    hasSelection={Boolean(selectedEntity)}
                    isCommissionScope={isCommissionScope}
                  />}

                  {!lunarCinematicUiActive && <MapToolbar
                    permissions={permissions}
                    hasSelection={Boolean(selectedEntity)}
                    areaScope={areaScope}
                    isCommissionScope={isCommissionScope}
                  />}
                  <div className="commercial-map-cinematic-legend">
                    {hydrologicalModeActive
                      ? <HydrologicalNetworkLegend />
                      : null}
                  </div>
                  {parkingAvailable && !lunarCinematicUiActive && (
                    <ParkingInspector blocks={REAR_PARKING_BLOCKS} />
                  )}
                </div>
              )}

              {!visitEnabled && !interiorEntityId && scopedData.lots.length === 0 && (
                <div className="commercial-map-onboarding-note">
                  <Sparkles />
                  <span><strong>Parque digitalizado, cadastro comercial protegido</strong>A base não contém lotes fictícios. Trace e valide cada unidade antes de ativar preços e vendas.</span>
                </div>
              )}
            </div>

            {!visitEnabled && workspaceMode === '3d' && !interiorEntityId && activePanel === 'layers' && (
              <MapFeatureBoundary id="layers">
              <LayersPanel
                layers={data.layers}
                entities={scopedData.entities}
                lots={scopedData.lots}
                permissions={permissions}
              />
              </MapFeatureBoundary>
            )}
            {!visitEnabled && workspaceMode === '3d' && !interiorEntityId && activePanel === 'results' && <MapFeatureBoundary id="results"><ResultsPanel explorer={mapFilter} /></MapFeatureBoundary>}
            {workspaceMode === '3d' && !interiorEntityId
              && selectedEntity
              && (activePanel === 'details' || lunarLaunchPreviousPanel === 'details')
              && (
                <div
                  className="commercial-map-details-panel-presence"
                  hidden={visitEnabled || activePanel !== 'details' || lunarCinematicUiActive}
                >
                  <MapPanelBoundary resetKey={selectedEntity.id}>
                    <Suspense fallback={<EntityDetailsPanelSkeleton />}>
                      <EntityDetailsPanel entity={selectedEntity} lot={selectedLot} entities={scopedData.entities} lots={scopedData.lots} permissions={permissions} />
                    </Suspense>
                  </MapPanelBoundary>
                </div>
              )}
            {!visitEnabled && workspaceMode === '3d' && !interiorEntityId && activePanel === 'calibration' && <MapFeatureBoundary id="calibration"><CalibrationPanel project={data.project} calibration={data.calibration} /></MapFeatureBoundary>}
          </>
        )}

        {!isPreview && mapQuery.isError && (
          <div className="commercial-map-sync-warning" role="status">
            <AlertTriangle />
            <span><strong>Atualização temporariamente indisponível</strong>O último mapa válido permanece ativo.</span>
            <Button size="sm" variant="outline" onClick={() => mapQuery.refetch()} disabled={mapQuery.isFetching}>
              <RefreshCw className={mapQuery.isFetching ? 'animate-spin' : ''} />
              Tentar novamente
            </Button>
          </div>
        )}

        {workspaceMode === 'create' && (
          <div className="commercial-map-workspace-layer">
            <MapFeatureBoundary id="create"><LotCreationWorkspace project={data.project} calibration={data.calibration} layers={data.layers} entities={scopedData.entities} /></MapFeatureBoundary>
          </div>
        )}
        {workspaceMode === 'edit' && selectedEntity && (
          <div className="commercial-map-workspace-layer">
            <MapFeatureBoundary id={selectedEntity.id}><GeometryEditor entity={selectedEntity} calibration={data.calibration} /></MapFeatureBoundary>
          </div>
        )}
        {(workspaceMode === 'list' || (!webglAvailable && workspaceMode === '3d')) && (
          <div className="commercial-map-workspace-layer is-list-view">
            <MapFeatureBoundary id="list"><MapListView explorer={mapFilter} permissions={permissions}
              sceneAvailable={webglAvailable} canRetry3D={canRetryWebGL}
              onRequest3D={() => { if (webglAvailable || retryWebGL()) setWorkspaceMode('3d'); }}
              contextTitle={interiorEntity?.name ?? getCommercialMapSegment(activeSegmentId)?.name ?? 'Parque Fenasoja'} /></MapFeatureBoundary>
          </div>
        )}

        {!webglAvailable && selectedEntity && activePanel === 'details' && (
          <MapFeatureBoundary id={selectedEntity.id}>
            <Suspense fallback={<EntityDetailsPanelSkeleton />}>
            <EntityDetailsPanel entity={selectedEntity} lot={selectedLot} entities={scopedData.entities}
              lots={scopedData.lots} permissions={permissions} sceneAvailable={false} />
            </Suspense>
          </MapFeatureBoundary>
        )}

        {!webglAvailable && workspaceMode !== 'edit' && (
          <div className="commercial-map-webgl-note" role="status"><Box /><span><strong>Modo 2D acessível ativado</strong>
            O navegador não disponibilizou WebGL 2. Consulte registros e detalhes pela tabela. A seleção múltipla de Vendas e os interiores exigem o mapa 3D.
            {webglAttempts > 0 && ` Verificação ${webglAttempts}/3: WebGL 2 continua indisponível.`}
          </span></div>
        )}
        </div>
      </div>
    </section>
  );
}
