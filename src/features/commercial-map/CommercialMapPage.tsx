import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Box,
  DatabaseZap,
  Loader2,
  MapPinned,
  MapPinPlus,
  RefreshCw,
  Ruler,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCommercialMap, useFilteredMapEntities, useMapMutations, useMapPermissions } from './hooks/useCommercialMap';
import { useCommercialMapStore } from './state/useCommercialMapStore';
import { CommercialMapCanvas } from './components/canvas/CommercialMapCanvas';
import { MapToolbar } from './components/controls/MapToolbar';
import { GeometryEditor } from './components/editor/GeometryEditor';
import { LotCreationWorkspace } from './components/editor/LotCreationWorkspace';
import {
  CommercialSummary,
  EntityDetailsPanel,
  LayersPanel,
  MapListView,
  ResultsPanel,
  StatusLegend,
} from './components/panels/MapPanels';
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
  const activePanel = useCommercialMapStore((state) => state.activePanel);
  const setActivePanel = useCommercialMapStore((state) => state.setActivePanel);
  const workspaceMode = useCommercialMapStore((state) => state.workspaceMode);
  const setWorkspaceMode = useCommercialMapStore((state) => state.setWorkspaceMode);
  const [webglAvailable] = useState(() => supportsWebGL());
  const [publishReason, setPublishReason] = useState('Publicação após revisão cartográfica e comercial');

  const data = mapQuery.data;
  const filteredEntities = useFilteredMapEntities(data?.entities ?? [], data?.lots ?? []);
  const selectedEntity = data?.entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const selectedLot = data?.lots.find((lot) => lot.entityId === selectedEntityId);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        (document.querySelector('[aria-label="Buscar no mapa comercial"]') as HTMLInputElement | null)?.focus();
      }
      if (event.key === 'Escape') {
        setActivePanel(null);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [setActivePanel]);

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
    <section className="commercial-map-shell" aria-label="Plataforma de gestão do mapa comercial">
      <header className="commercial-map-command-header">
        <div className="commercial-map-title-lockup">
          <div className="commercial-map-title-icon"><MapPinned /></div>
          <div>
            <span>Inteligência territorial e comercial</span>
            <h1>Mapa Comercial</h1>
            <p>{data.project.name}</p>
          </div>
        </div>
        <div className="commercial-map-project-health">
          <div><BadgeCheck /><span><strong>Versão {data.project.activeVersion}</strong><small>{data.project.isPublished ? 'Publicada' : 'Rascunho controlado'}</small></span></div>
          <div className={data.calibration?.status === 'VALIDATED' ? 'is-valid' : 'is-warning'}><Ruler /><span><strong>{data.calibration?.status === 'VALIDATED' ? 'Calibrado' : 'Não calibrado'}</strong><small>{data.calibration?.status === 'VALIDATED' ? `${data.calibration.mapUnitsPerMeter?.toFixed(4)} un/m` : 'Área não validada'}</small></span></div>
          <div><ShieldCheck /><span><strong>{projectStats?.verified ?? 0} verificadas</strong><small>{projectStats?.review ?? 0} em revisão</small></span></div>
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
                <Button size="sm"><DatabaseZap />Iniciar implantação</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <div className="commercial-map-dialog-icon"><DatabaseZap /></div>
                  <AlertDialogTitle>Importar a base oficial como rascunho?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Serão criados o projeto, as camadas e somente as estruturas de alto nível identificadas na planta. Nada será publicado como lote comercial, nenhuma área será considerada oficial e todas as geometrias exigirão revisão.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => bootstrap.mutate()}>Criar base auditável</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </header>

      {data.sourceMessage && (
        <div className="commercial-map-source-banner" role="status">
          <AlertTriangle />
          <span><strong>{data.source === 'official-reference' ? 'Base oficial em preparação' : 'Projeto ainda não publicado'}</strong>{data.sourceMessage}</span>
          <Badge variant="outline">sem dados inventados</Badge>
        </div>
      )}

      <div className="commercial-map-viewport">
        {workspaceMode === 'create' ? (
          <LotCreationWorkspace project={data.project} calibration={data.calibration} layers={data.layers} entities={data.entities} />
        ) : workspaceMode === 'edit' && selectedEntity ? (
          <GeometryEditor entity={selectedEntity} calibration={data.calibration} />
        ) : workspaceMode === 'list' || !webglAvailable ? (
          <MapListView entities={filteredEntities} lots={data.lots} />
        ) : (
          <>
            <CommercialMapCanvas entities={filteredEntities} lots={data.lots} calibration={data.calibration} />
            <CommercialSummary lots={data.lots} />
            <MapToolbar permissions={permissions} hasSelection={Boolean(selectedEntity)} />
            <StatusLegend />

            {data.lots.length === 0 && (
              <div className="commercial-map-onboarding-note">
                <Sparkles />
                <span><strong>Parque digitalizado, cadastro comercial protegido</strong>A base não contém lotes fictícios. Trace e valide cada unidade antes de ativar preços e vendas.</span>
              </div>
            )}

            {activePanel === 'layers' && <LayersPanel layers={data.layers} entities={data.entities} permissions={permissions} />}
            {activePanel === 'results' && <ResultsPanel entities={filteredEntities} lots={data.lots} />}
            {activePanel === 'details' && selectedEntity && <EntityDetailsPanel entity={selectedEntity} lot={selectedLot} entities={data.entities} lots={data.lots} permissions={permissions} />}
            {activePanel === 'calibration' && <CalibrationPanel project={data.project} calibration={data.calibration} />}
          </>
        )}

        {!webglAvailable && workspaceMode !== 'edit' && (
          <div className="commercial-map-webgl-note"><Box /><span><strong>Modo 2D acessível ativado</strong>O navegador não disponibilizou WebGL 2. A tabela permanece totalmente operacional.</span></div>
        )}
      </div>
    </section>
  );
}
