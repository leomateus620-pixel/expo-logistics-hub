import { Profiler, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Box,
  DatabaseZap,
  Loader2,
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
import { CommercialMapCanvas } from './components/canvas/CommercialMapCanvas';
import { CommercialMapRendererStatus } from './components/CommercialMapRendererStatus';
import { MapToolbar } from './components/controls/MapToolbar';
import { CommercialMapTopBar } from './components/controls/CommercialMapTopBar';
import { CommercialMapDock } from './components/dock/CommercialMapDock';
import { GeometryEditor } from './components/editor/GeometryEditor';
import { LotCreationWorkspace } from './components/editor/LotCreationWorkspace';
import {
  EntityDetailsPanel,
  LayersPanel,
  StatusLegend,
} from './components/panels/MapPanels';
import { MapListView, ResultsPanel } from './components/panels/EntityExplorer';
import { CalibrationPanel } from './components/panels/CalibrationPanel';
import { PavilionModuleCard } from './components/panels/PavilionModuleCard';
import { PavilionPlanLegend } from './components/panels/PavilionPlanLegend';
import { HydrologicalNetworkLegend } from './components/panels/HydrologicalNetworkLegend';
import { ParkingInspector } from './components/panels/ParkingInspector';
import { MapPanelBoundary } from './components/panels/MapPanelBoundary';
import { SegmentLegend } from './components/segments/SegmentLegend';
import { resolveStrategicLandmarkKind } from './utils/landmarks';
import { resolveCommercialPavilionModulePlan } from './utils/commercialPavilionModules';
import { OFFICIAL_REFERENCE_REVISION } from './data/officialReference2026';
import { REAR_PARKING_BLOCKS, rearParkingVisibleInArea, rearParkingLayerPresentation } from './data/rearParking';
import {
  COMMERCIAL_MAP_SEGMENT_IDS,
  buildCommercialMapSegmentIndex,
  getCommercialMapSegment,
  type CommercialMapSegmentDefinition,
  type CommercialMapSegmentId,
} from './data/commercialMapSegments';
import {
  areaScopeFromSearchParams,
  isSegmentCompatibleWithAreaScope,
  scopeCommercialMapData,
  type CommercialMapAreaScope,
} from './utils/areaScope';
import { canUseTechnicalValidationOverlay } from './utils/technicalValidation';
import { lunarLaunchPhaseLabel } from './utils/lunarLaunch';
import { recordCommercialMapProfiler } from './utils/runtimeDiagnostics';
import type { CommercialMapData, CommercialMapQueryScope, MapPermissions } from './types';
import './commercial-map.css';
import './commercial-map-mobile.css';

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
  isMapAdmin: false,
};

export default function CommercialMapPage({ scope = FULL_COMMERCIAL_MAP_SCOPE }: CommercialMapPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isCommissionScope = scope.mode === 'commission';
  const lockedSegmentId = scope.mode === 'commission'
    ? scope.segmentId as CommercialMapSegmentId
    : null;
  const areaScope = lockedSegmentId ?? areaScopeFromSearchParams(searchParams);
  const isExporural = areaScope === 'exporural';
  const registeredScopedSegment = areaScope === 'park' ? null : getCommercialMapSegment(areaScope);
  const mapQuery = useCommercialMap(scope);
  const resolvedPermissions = useMapPermissions();
  const permissions = isCommissionScope ? COMMISSION_READ_ONLY_PERMISSIONS : resolvedPermissions;
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
  const hydrologicalModeActive = useCommercialMapStore((state) => state.hydrologicalModeActive);
  const parkingInspectionOpen = useCommercialMapStore((state) => state.parkingInspectionOpen);
  const closeParkingInspection = useCommercialMapStore((state) => state.closeParkingInspection);
  const layerVisibility = useCommercialMapStore((state) => state.layerVisibility);
  const layerOpacity = useCommercialMapStore((state) => state.layerOpacity);
  const requestCameraPreset = useCommercialMapStore((state) => state.requestCameraPreset);
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
  const interiorBackButtonRef = useRef<HTMLButtonElement>(null);
  const lastInteriorEntityId = useRef<string | null>(null);
  const previousAreaScope = useRef<CommercialMapAreaScope>(areaScope);
  const initializedAreaScope = useRef(false);
  const [webglAvailable] = useState(() => supportsWebGL());
  const [publishReason, setPublishReason] = useState('Publicação após revisão cartográfica e comercial');
  const technicalValidationAllowed = !isCommissionScope
    && canUseTechnicalValidationOverlay(areaScope, permissions);
  const mapScopeKey = scope.mode === 'commission'
    ? `commission:${scope.commissionId}:${scope.segmentId}`
    : 'full-map';
  const lunarLaunchActive = lunarLaunchPhase !== 'idle';
  const lunarCinematicUiActive = lunarLaunchActive || lunarLaunchReturning;

  useEffect(() => {
    activateScope(mapScopeKey, lockedSegmentId);
  }, [activateScope, lockedSegmentId, mapScopeKey]);

  useEffect(() => {
    if (isCommissionScope && lockedSegmentId && activeSegmentId !== lockedSegmentId) {
      activateScope(mapScopeKey, lockedSegmentId);
    }
  }, [activateScope, activeSegmentId, isCommissionScope, lockedSegmentId, mapScopeKey]);

  const data = mapQuery.data;
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
  const scopedSegmentIndex = useMemo(
    () => buildCommercialMapSegmentIndex(scopedData.entities, scopedData.lots),
    [scopedData.entities, scopedData.lots],
  );
  const parkingAvailable = rearParkingVisibleInArea(areaScope) && !hydrologicalModeActive
    && rearParkingLayerPresentation(data?.entities ?? [], layerVisibility, layerOpacity).visible;
  useEffect(() => {
    if (!parkingAvailable && parkingInspectionOpen) closeParkingInspection();
  }, [closeParkingInspection, parkingAvailable, parkingInspectionOpen]);
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
  const interiorPavilionPlan = interiorKind === 'commercial-pavilion' && interiorEntity
    ? resolveCommercialPavilionModulePlan(interiorEntity)
    : null;

  const setAreaScope = (nextScope: CommercialMapAreaScope) => {
    if (isCommissionScope) return;
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
    if (isCommissionScope) return;
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
    if (isCommissionScope) return;
    clearSegmentFocus();
    if (workspaceMode !== 'list') requestCameraPreset(isExporural ? 'exporural' : 'overview');
  };

  useEffect(() => {
    if (isCommissionScope) return;
    if (!initializedAreaScope.current) {
      initializedAreaScope.current = true;
      const compatibleSegment = isSegmentCompatibleWithAreaScope(activeSegmentId, areaScope);
      if (activeSegmentId && compatibleSegment) requestSegmentFocus(activeSegmentId);
      else if (areaScope !== 'park') {
        if (activeSegmentId) clearSegmentFocus();
        requestSegmentFocus(areaScope);
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
    else if (areaScope !== 'park') requestSegmentFocus(areaScope);
    else requestCameraPreset('overview');
  }, [
    activeSegmentId,
    areaScope,
    clearSegmentFocus,
    clearExplorerFilters,
    isCommissionScope,
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
      if (event.key === 'Escape' && !event.defaultPrevented) {
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
  const hasManagementActions = permissions.isMapAdmin
    || permissions.canManageLots
    || permissions.canEditGeometry;
  const scopeTitle = scopedSegment?.name ?? (isExporural ? 'Exporural' : 'Parque completo');
  const scopeDescription = scopedSegment
    ? scopedSegment.description
    : `Referência cartográfica: ${data?.project.name ?? 'Fenasoja 2028'}`;

  if (mapQuery.isLoading) return <MapPageSkeleton />;
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
      className={`commercial-map-shell ${isCommissionScope ? 'is-commission-scope' : ''} ${isExporural ? 'is-exporural' : ''} ${areaScope === COMMERCIAL_MAP_SEGMENT_IDS.industry ? 'is-industry' : ''} ${hydrologicalModeActive ? 'is-hydrological-mode' : ''} ${parkingInspectionOpen ? 'is-parking-inspection' : ''} ${interiorEntityId ? 'is-interior' : ''} ${interiorKind === 'commercial-pavilion' ? 'is-commercial-pavilion-interior' : ''} ${interiorKind === 'livestock-pavilion' ? 'is-livestock-interior' : ''} ${interiorKind === 'mirante-pavilion' ? 'is-mirante-interior' : ''} ${selectedEntity ? 'has-selection' : ''} ${selectedKind === 'commercial-pavilion' || selectedKind === 'livestock-pavilion' || selectedKind === 'mirante-pavilion' ? 'has-architectural-selection' : ''} ${lunarCinematicUiActive ? 'is-lunar-launch-active' : ''} ${lunarLaunchReturnAvailable ? 'has-lunar-launch-return' : ''}`}
      aria-label="Plataforma de gestão do mapa comercial"
    >
      {!lunarCinematicUiActive && !isCommissionScope && !interiorEntityId && workspaceMode !== 'edit' && workspaceMode !== 'create' && (
        <SegmentLegend
          entities={data.entities}
          lots={data.lots}
          activeSegmentId={activeSegmentId}
          onSelect={handleSegmentSelect}
          onClear={handleSegmentClear}
          variant="mobile"
        />
      )}

      <div className="commercial-map-body">
        <CommercialMapDock
          entities={data.entities}
          allLots={data.lots}
          lots={summaryLots}
          areaScope={areaScope}
          onAreaScopeChange={setAreaScope}
          activeSegmentId={activeSegmentId}
          onSegmentSelect={handleSegmentSelect}
          onSegmentClear={handleSegmentClear}
          segmentName={activeSegment?.name ?? scopedSegment?.name}
          isCommissionScope={isCommissionScope}
          managementActions={managementActions}
        />


        <div id="commercial-map-viewport" className="commercial-map-viewport">

        {webglAvailable && (
          <>
            <div
              className={`commercial-map-stage ${workspaceMode === '3d' ? '' : 'is-inactive'}`}
              aria-hidden={workspaceMode !== '3d'}
              data-canvas-lifecycle="persistent"
            >
              <Profiler id="CommercialMapCanvas" onRender={recordCommercialMapProfiler}>
                <CommercialMapCanvas
                  active={workspaceMode === '3d'}
                  entities={scopedData.entities}
                  parkingOwnerEntities={data.entities}
                  siteEnvironmentEntities={data.entities}
                  lots={scopedData.lots}
                  calibration={data.calibration}
                  matchingEntityIds={mapFilter.matchingEntityIds}
                  filtersActive={mapFilter.hasActiveCriteria}
                  isolatedArea={areaScope === 'park' ? null : areaScope}
                  segmentOverride={isCommissionScope ? scopedSegment : null}
                  technicalValidationAllowed={technicalValidationAllowed}
                />
              </Profiler>
              <CommercialMapRendererStatus />
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
              {lunarLaunchReturnAvailable && !lunarCinematicUiActive && (
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
              {interiorEntity ? (
                <>
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
                      <span>
                        {interiorKind === 'commercial-pavilion' ? 'Planta interna oficial' : 'Inspeção interna'} · {' '}
                        {interiorPavilionPlan
                          ? `Pavilhão ${interiorPavilionPlan.stats.pavilionNumber}`
                          : interiorEntity.publicIdentifier}
                      </span>
                      <strong>{interiorEntity.name}</strong>
                      <small>
                        {interiorKind === 'commercial-pavilion'
                          ? 'Arraste para percorrer · use pinça ou roda para aproximar e girar'
                          : interiorKind === 'livestock-pavilion'
                          ? 'Arraste para percorrer o corredor e as baias · role para aproximar'
                          : interiorKind === 'mirante-pavilion'
                            ? 'Arraste para observar o salão e a vista da Arena · role para aproximar'
                            : 'Arraste para observar os ambientes · role para aproximar'}
                      </small>
                    </div>
                    <kbd>Esc</kbd>
                  </div>
                  {interiorPavilionPlan && (
                    <>
                      <PavilionPlanLegend plan={interiorPavilionPlan} variant="interior" />
                      <StatusLegend />
                      <PavilionModuleCard
                        plan={interiorPavilionPlan}
                        pavilion={interiorEntity}
                        entities={data.entities}
                        lots={data.lots}
                        permissions={permissions}
                        source={data.source}
                        onSynchronize={() => bootstrap.mutate()}
                        synchronizing={bootstrap.isPending}
                      />
                    </>
                  )}
                </>
              ) : (
                <>
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
                      : <StatusLegend scope={areaScope} />}
                  </div>
                  {parkingAvailable && !lunarCinematicUiActive && (
                    <ParkingInspector blocks={REAR_PARKING_BLOCKS} />
                  )}
                </>
              )}

              {!interiorEntityId && scopedData.lots.length === 0 && (
                <div className="commercial-map-onboarding-note">
                  <Sparkles />
                  <span><strong>Parque digitalizado, cadastro comercial protegido</strong>A base não contém lotes fictícios. Trace e valide cada unidade antes de ativar preços e vendas.</span>
                </div>
              )}
            </div>

            {workspaceMode === '3d' && !interiorEntityId && activePanel === 'layers' && (
              <Suspense fallback={null}>
              <LayersPanel
                layers={data.layers}
                entities={scopedData.entities}
                lots={scopedData.lots}
                permissions={permissions}
              />
              </Suspense>
            )}
            {workspaceMode === '3d' && !interiorEntityId && activePanel === 'results' && <Suspense fallback={null}><ResultsPanel explorer={mapFilter} /></Suspense>}
            {workspaceMode === '3d' && !interiorEntityId
              && selectedEntity
              && (activePanel === 'details' || lunarLaunchPreviousPanel === 'details')
              && (
                <div
                  className="commercial-map-details-panel-presence"
                  hidden={activePanel !== 'details' || lunarCinematicUiActive}
                >
                  <MapPanelBoundary resetKey={selectedEntity.id}>
                    <Suspense fallback={<EntityDetailsPanelSkeleton />}>
                      <EntityDetailsPanel entity={selectedEntity} lot={selectedLot} entities={scopedData.entities} lots={scopedData.lots} permissions={permissions} />
                    </Suspense>
                  </MapPanelBoundary>
                </div>
              )}
            {workspaceMode === '3d' && !interiorEntityId && activePanel === 'calibration' && <CalibrationPanel project={data.project} calibration={data.calibration} />}
          </>
        )}

        {mapQuery.isError && (
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
            <LotCreationWorkspace project={data.project} calibration={data.calibration} layers={data.layers} entities={scopedData.entities} />
          </div>
        )}
        {workspaceMode === 'edit' && selectedEntity && (
          <div className="commercial-map-workspace-layer">
            <GeometryEditor entity={selectedEntity} calibration={data.calibration} />
          </div>
        )}
        {(workspaceMode === 'list' || (!webglAvailable && workspaceMode === '3d')) && (
          <div className="commercial-map-workspace-layer is-list-view">
            <MapListView explorer={mapFilter} permissions={permissions} />
          </div>
        )}

        {!webglAvailable && workspaceMode !== 'edit' && (
          <div className="commercial-map-webgl-note"><Box /><span><strong>Modo 2D acessível ativado</strong>O navegador não disponibilizou WebGL 2. A tabela permanece totalmente operacional.</span></div>
        )}
        </div>
      </div>
    </section>
  );
}
