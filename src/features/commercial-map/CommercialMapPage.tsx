import { useEffect, useMemo, useState } from 'react';
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
  const mapQuery = useCommercialMap();
  const permissions = useMapPermissions();
  const { bootstrap, publish } = useMapMutations();
  const selectedEntityId = useCommercialMapStore((state) => state.selectedEntityId);
  const interiorEntityId = useCommercialMapStore((state) => state.interiorEntityId);
  const exitInterior = useCommercialMapStore((state) => state.exitInterior);
  const activePanel = useCommercialMapStore((state) => state.activePanel);
  const setActivePanel = useCommercialMapStore((state) => state.setActivePanel);
  const workspaceMode = useCommercialMapStore((state) => state.workspaceMode);
  const setWorkspaceMode = useCommercialMapStore((state) => state.setWorkspaceMode);
  const [webglAvailable] = useState(() => supportsWebGL());
  const [publishReason, setPublishReason] = useState('Publicação após revisão cartográfica e comercial');

  const data = mapQuery.data;
  const mapFilter = useMapEntityFilter(data?.entities ?? [], data?.lots ?? []);
  const selectedEntity = data?.entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const selectedLot = data?.lots.find((lot) => lot.entityId === selectedEntityId);

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
    <section className={`commercial-map-shell ${interiorEntityId ? 'is-interior' : ''}`} aria-label="Plataforma de gestão do mapa comercial">
      <header className="commercial-map-command-header">
        <div className="commercial-map-title-lockup">
          <div className="commercial-map-title-icon"><MapPinned /></div>
          <div>
            <span>Inteligência territorial e comercial</span>
            <h1>Mapa Comercial 2026</h1>
            <p>{data.project.name}</p>
          </div>
        </div>
        <div className="commercial-map-header-actions">
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

      <div className="commercial-map-viewport">
        {workspaceMode === 'create' ? (
          <LotCreationWorkspace project={data.project} calibration={data.calibration} layers={data.layers} entities={data.entities} />
        ) : workspaceMode === 'edit' && selectedEntity ? (
          <GeometryEditor entity={selectedEntity} calibration={data.calibration} />
        ) : workspaceMode === 'list' || !webglAvailable ? (
          <MapListView explorer={mapFilter} permissions={permissions} />
        ) : (
          <>
            <CommercialMapCanvas
              entities={data.entities}
              lots={data.lots}
              calibration={data.calibration}
              matchingEntityIds={mapFilter.matchingEntityIds}
              filtersActive={mapFilter.hasActiveCriteria}
            />
            {interiorEntityId ? (
              <div className="commercial-map-interior-navigation" aria-label="Navegação do interior da Sede Fenasoja">
                <Button variant="outline" onClick={exitInterior}><ArrowLeft />Voltar ao mapa</Button>
                <div>
                  <span>Visita interna · B12</span>
                  <strong>Sede Fenasoja / Comissão Central</strong>
                  <small>Arraste para observar os ambientes · role para aproximar</small>
                </div>
                <kbd>Esc</kbd>
              </div>
            ) : (
              <>
                <CommercialSummary lots={data.lots} />
                <MapToolbar permissions={permissions} hasSelection={Boolean(selectedEntity)} />
                <StatusLegend />
              </>
            )}

            {!interiorEntityId && data.lots.length === 0 && (
              <div className="commercial-map-onboarding-note">
                <Sparkles />
                <span><strong>Parque digitalizado, cadastro comercial protegido</strong>A base não contém lotes fictícios. Trace e valide cada unidade antes de ativar preços e vendas.</span>
              </div>
            )}

            {!interiorEntityId && activePanel === 'layers' && <LayersPanel layers={data.layers} entities={data.entities} permissions={permissions} />}
            {!interiorEntityId && activePanel === 'results' && <ResultsPanel explorer={mapFilter} />}
            {!interiorEntityId && activePanel === 'details' && selectedEntity && <EntityDetailsPanel entity={selectedEntity} lot={selectedLot} entities={data.entities} lots={data.lots} permissions={permissions} />}
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
