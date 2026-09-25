import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Combine,
  DoorOpen,
  FileLock2,
  FileText,
  History,
  Info,
  Layers3,
  LockKeyhole,
  Ruler,
  Scissors,
  ShieldAlert,
  ShoppingBag,
  ShoppingCart,
  Tag,
  UnlockKeyhole,
  X,
} from 'lucide-react';
import { toSalesEntry } from '../../sales/salesEntry';
import { useSalesStore } from '../../sales/useSalesSelection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CLASSIFICATION_LABELS, STATUS_CONFIG } from '../../constants';
import { useLotActivity, useLotContractVersions, useLotSaleHistory, useMapMutations } from '../../hooks/useCommercialMap';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { selectCommercialElectricalInfrastructureForScene } from '../../utils/electricalInfrastructure';
import { selectCommercialTreesForScene } from '../../utils/treeLayer';
import { polygonAreaMapUnits } from '../../utils/geometry';
import type { LotPricingStage } from '../../utils/lotPricing2028';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkSupportsInterior,
} from '../../utils/landmarks';
import { normalizeMapEntityMetadata } from '../../utils/mapMetadata';
import { resolveCommercialPavilionModulePlan } from '../../utils/commercialPavilionModules';
import type { CommercialMapAreaScope } from '../../utils/areaScope';
import type { CommercialLot, MapEntity, MapLayer, MapPermissions } from '../../types';
import { LotWorkflowDialog, type LotWorkflow } from '../commercial/LotWorkflowDialog';
import { LotStructureDialog, type LotStructureOperation } from '../commercial/LotStructureDialog';
import { PavilionPlanLegend } from './PavilionPlanLegend';
import { CompactDetailSheetControls } from './CompactDetailSheet';
import { LotPricing2028Panel } from './LotPricing2028Panel';
import { useCompactDetailSheet } from '../../hooks/useCompactDetailSheet';
import { getHistoryIdForEntity } from '../../history/bindings';
import { HistoryExperience } from '../../history/HistoryExperience';
import { LotSaleHistoryCard } from '../../sales/components/LotSaleHistoryCard';

const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const areaNumber = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

function saleStage(value: string | null | undefined): LotPricingStage | null {
  return value === 'RENOVACAO' || value === 'SEGUNDA_ETAPA' ? value : null;
}

function saleStageLabel(value: string | null | undefined) {
  return value === 'RENOVACAO' ? 'Renovação' : value === 'SEGUNDA_ETAPA' ? '2ª Etapa' : null;
}

function PanelHeader({ title, eyebrow, onClose }: { title: string; eyebrow: string; onClose: () => void }) {
  return (
    <div className="commercial-map-panel-header">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      <button type="button" onClick={onClose} aria-label="Fechar painel"><X className="h-4 w-4" /></button>
    </div>
  );
}
export function CommercialSummary({
  lots,
  scope = 'park',
  segmentName,
  variant = 'floating',
  compact = false,
}: {
  lots: CommercialLot[];
  scope?: CommercialMapAreaScope;
  segmentName?: string;
  /** `dock` renders the summary vertically inside the left rail. */
  variant?: 'floating' | 'dock';
  compact?: boolean;
}) {
  const toggleStatus = useCommercialMapStore((state) => state.toggleStatus);
  const statusFilters = useCommercialMapStore((state) => state.statusFilters);
  const totals = useMemo(() => {
    const byStatus = Object.fromEntries(Object.keys(STATUS_CONFIG).map((key) => [key, 0])) as Record<string, number>;
    let availableArea = 0;
    let soldValue = 0;
    lots.forEach((lot) => {
      byStatus[lot.status] += 1;
      if (lot.status === 'AVAILABLE') availableArea += lot.officialAreaSqm ?? 0;
      if (lot.status === 'SOLD') soldValue += lot.askingPrice ?? 0;
    });
    return { byStatus, availableArea, soldValue };
  }, [lots]);

  const isDock = variant === 'dock';
  const isCompact = isDock && compact;

  return (
    <div
      className={`commercial-map-summary${isDock ? ' is-dock' : ''}${isCompact ? ' is-compact' : ''}`}
      aria-label={segmentName
        ? `Resumo comercial de ${segmentName}`
        : scope === 'exporural' ? 'Resumo comercial da Exporural' : 'Resumo comercial'}
    >
      <div className="commercial-map-summary-primary">
        <strong>{lots.length}</strong>
        {!isCompact && (
          <span>{segmentName ? 'lotes no segmento' : scope === 'exporural' ? 'lotes Exporural' : 'lotes cadastrados'}</span>
        )}
      </div>
      {(['BLOCKED', 'AVAILABLE', 'RESERVED', 'IN_NEGOTIATION', 'SOLD'] as const).map((status) => {
        const button = (
          <button
            type="button"
            key={status}
            className={statusFilters.includes(status) ? 'is-active' : ''}
            onClick={() => toggleStatus(status)}
            aria-pressed={statusFilters.includes(status)}
            aria-label={`${STATUS_CONFIG[status].label}: ${totals.byStatus[status]} ${totals.byStatus[status] === 1 ? 'lote' : 'lotes'}`}
          >
            <i style={{ background: STATUS_CONFIG[status].color }} />
            <strong>{totals.byStatus[status]}</strong>
            {!isCompact && <span>{STATUS_CONFIG[status].shortLabel}</span>}
          </button>
        );

        if (!isCompact) return button;
        return (
          <Tooltip key={status}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side="right">
              {STATUS_CONFIG[status].label}: {totals.byStatus[status]}
            </TooltipContent>
          </Tooltip>
        );
      })}
      {!isCompact && (
        <div className="commercial-map-summary-value">
          <strong>{areaNumber.format(totals.availableArea)} m²</strong>
          <span>área oficial disponível</span>
        </div>
      )}
    </div>
  );
}


export function StatusLegend({ scope = 'park' }: { scope?: CommercialMapAreaScope }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`commercial-map-legend ${expanded ? 'is-expanded' : ''}`}>
      <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <Info className="h-3.5 w-3.5" />
        {scope === 'exporural' ? 'Legenda Exporural' : 'Situações comerciais'}
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      {expanded && (
        <div>
          {(Object.entries(STATUS_CONFIG) as Array<[keyof typeof STATUS_CONFIG, (typeof STATUS_CONFIG)[keyof typeof STATUS_CONFIG]]>).map(([key, config]) => (
            <span key={key} title={config.description}>
              <i style={{ background: config.color, borderColor: config.border }}>{config.symbol}</i>
              {config.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function LayersPanel({
  layers,
  entities,
  lots,
  permissions,
}: {
  layers: MapLayer[];
  entities: MapEntity[];
  lots: CommercialLot[];
  permissions: MapPermissions;
}) {
  const { layerLock } = useMapMutations();
  const setActivePanel = useCommercialMapStore((state) => state.setActivePanel);
  const layerVisibility = useCommercialMapStore((state) => state.layerVisibility);
  const layerOpacity = useCommercialMapStore((state) => state.layerOpacity);
  const setLayerVisibility = useCommercialMapStore((state) => state.setLayerVisibility);
  const setLayerOpacity = useCommercialMapStore((state) => state.setLayerOpacity);
  const labelsVisible = useCommercialMapStore((state) => state.labelsVisible);
  const setLabelsVisible = useCommercialMapStore((state) => state.setLabelsVisible);
  const treesVisible = useCommercialMapStore((state) => state.treesVisible);
  const setTreesVisible = useCommercialMapStore((state) => state.setTreesVisible);
  const referenceVisible = useCommercialMapStore((state) => state.referenceVisible);
  const referenceOpacity = useCommercialMapStore((state) => state.referenceOpacity);
  const setReferenceVisible = useCommercialMapStore((state) => state.setReferenceVisible);
  const setReferenceOpacity = useCommercialMapStore((state) => state.setReferenceOpacity);
  const reducedGraphics = useCommercialMapStore((state) => state.reducedGraphics);
  const setReducedGraphics = useCommercialMapStore((state) => state.setReducedGraphics);
  const counts = useMemo(() => entities.reduce<Record<string, number>>((acc, entity) => {
    acc[entity.layerId] = (acc[entity.layerId] ?? 0) + 1;
    return acc;
  }, {}), [entities]);
  const treeCount = useMemo(() => selectCommercialTreesForScene(entities, lots).length, [entities, lots]);
  const electricalInfrastructure = useMemo(
    () => selectCommercialElectricalInfrastructureForScene(entities, lots),
    [entities, lots],
  );
  const poleCount = electricalInfrastructure.nodes.filter((node) => node.type === 'POLE').length;
  const transformerCount = electricalInfrastructure.nodes.length - poleCount;
  const environmentAssetSummary = [
    treeCount > 0 ? `${treeCount} ${treeCount === 1 ? 'árvore' : 'árvores'}` : null,
    poleCount > 0 ? `${poleCount} ${poleCount === 1 ? 'poste' : 'postes'}` : null,
    transformerCount > 0
      ? `${transformerCount} ${transformerCount === 1 ? 'transformador' : 'transformadores'}`
      : null,
    electricalInfrastructure.connections.length > 0
      ? `${electricalInfrastructure.connections.length} ${electricalInfrastructure.connections.length === 1 ? 'trecho' : 'trechos'} de fiação aérea`
      : null,
  ].filter(Boolean).join(' · ');

  return (
    <aside className="commercial-map-panel commercial-map-layer-panel">
      <PanelHeader eyebrow="Composição visual" title="Camadas do parque" onClose={() => setActivePanel(null)} />
      <ScrollArea className="commercial-map-panel-scroll">
        <div className="commercial-map-panel-section">
          {layers.filter((layer) => layer.key !== 'reference' && (counts[layer.id] ?? 0) > 0).map((layer) => (
            <div className="commercial-map-layer-row" key={layer.id}>
              <Switch
                checked={layerVisibility[layer.id] !== false}
                onCheckedChange={(checked) => setLayerVisibility(layer.id, checked)}
                aria-label={`${layerVisibility[layer.id] === false ? 'Exibir' : 'Ocultar'} ${layer.name}`}
              />
              <i style={{ background: layer.color }} />
              <div><strong>{layer.name}</strong><span>{counts[layer.id] ?? 0} entidades</span></div>
              {permissions.canManageLayers ? (
                <button
                  type="button"
                  className="commercial-map-layer-lock"
                  disabled={layerLock.isPending || layer.id.startsWith('reference:')}
                  onClick={() => layerLock.mutate({ layerId: layer.id, isLocked: !layer.isLocked, reason: `${layer.isLocked ? 'Desbloqueio' : 'Bloqueio'} operacional pela central de camadas` })}
                  aria-label={`${layer.isLocked ? 'Desbloquear' : 'Bloquear'} ${layer.name}`}
                >
                  {layer.isLocked ? <LockKeyhole /> : <UnlockKeyhole />}
                </button>
              ) : layer.isLocked ? <LockKeyhole className="h-3.5 w-3.5 text-muted-foreground" aria-label="Camada bloqueada" /> : <span />}
              <div className="commercial-map-layer-opacity">
                <Slider value={[Math.round((layerOpacity[layer.id] ?? layer.opacity) * 100)]} min={10} max={100} step={5} onValueChange={([value]) => setLayerOpacity(layer.id, value / 100)} aria-label={`Opacidade de ${layer.name}`} />
              </div>
            </div>
          ))}
        </div>
        <div className="commercial-map-panel-section is-separated">
          <h3>Ambiente, referência e desempenho</h3>
          {environmentAssetSummary && (
            <label className="commercial-map-setting-row">
              <span>
                <strong>Árvores e rede elétrica</strong>
                <small>{environmentAssetSummary}</small>
              </span>
              <Switch
                checked={treesVisible}
                onCheckedChange={setTreesVisible}
                aria-label="Árvores e rede elétrica"
              />
            </label>
          )}
          <label className="commercial-map-setting-row">
            <span><strong>Referência oficial</strong><small>Calibração com textos incorporados</small></span>
            <Switch
              checked={referenceVisible}
              onCheckedChange={setReferenceVisible}
              aria-label="Referência oficial para calibração"
            />
          </label>
          {referenceVisible && (
            <div className="commercial-map-setting-slider">
              <span>Opacidade</span>
              <Slider value={[referenceOpacity * 100]} min={5} max={90} step={5} onValueChange={([value]) => setReferenceOpacity(value / 100)} />
              <b>{Math.round(referenceOpacity * 100)}%</b>
            </div>
          )}
          <label className="commercial-map-setting-row">
            <span><strong>Rótulos adaptativos</strong><small>Prioriza estruturas relevantes</small></span>
            <Switch checked={labelsVisible} onCheckedChange={setLabelsVisible} />
          </label>
          <label className="commercial-map-setting-row">
            <span><strong>Gráficos reduzidos</strong><small>Melhora o desempenho em celulares</small></span>
            <Switch checked={reducedGraphics} onCheckedChange={setReducedGraphics} />
          </label>
        </div>
      </ScrollArea>
    </aside>
  );
}

function DetailMetric({ icon: Icon, label, value, warning }: { icon: typeof Tag; label: string; value: string; warning?: boolean }) {
  return (
    <div className={`commercial-map-detail-metric ${warning ? 'is-warning' : ''}`}>
      <Icon className="h-4 w-4" />
      <span>{label}<strong>{value}</strong></span>
    </div>
  );
}

export function EntityDetailsPanel({ entity, lot, entities, lots, permissions, sceneAvailable = true }: { entity: MapEntity; lot?: CommercialLot; entities: MapEntity[]; lots: CommercialLot[]; permissions: MapPermissions; sceneAvailable?: boolean }) {
  const salesModeActive = useSalesStore((state) => state.salesModeActive) && sceneAvailable;
  const salesSelection = useSalesStore((state) => state.selection);
  const toggleSalesLot = useSalesStore((state) => state.toggleLot);
  const setSelectedEntityId = useCommercialMapStore((state) => state.setSelectedEntityId);
  const enterInterior = useCommercialMapStore((state) => state.enterInterior);
  const [workflow, setWorkflow] = useState<LotWorkflow>(null);
  const [structureOperation, setStructureOperation] = useState<LotStructureOperation>(null);
  const [historyEntityId, setHistoryEntityId] = useState<string | null>(null);
  const historyTriggerRef = useRef<HTMLButtonElement>(null);
  const historyId = getHistoryIdForEntity(entity);
  const historyOpen = historyEntityId === entity.id && historyId !== null;
  const sheet = useCompactDetailSheet(entity.id, historyOpen);
  const closeHistory = () => {
    setHistoryEntityId(null);
    requestAnimationFrame(() => historyTriggerRef.current?.focus({ preventScroll: true }));
  };
  const activity = useLotActivity(lot?.id ?? null);
  const saleHistory = useLotSaleHistory(lot?.id ?? null, lot?.status === 'SOLD');
  const contracts = useLotContractVersions(lot?.id ?? null, permissions.canManageContracts);
  const areaMapUnits = polygonAreaMapUnits(entity.geometry);
  const status = lot ? STATUS_CONFIG[lot.status] : null;
  const metadata = normalizeMapEntityMetadata(entity, lot);
  const structuralReady = lot ? ['AVAILABLE', 'BLOCKED', 'UNAVAILABLE'].includes(lot.status) : false;
  const landmarkKind = resolveStrategicLandmarkKind(entity);
  const pavilionPlan = landmarkKind === 'commercial-pavilion'
    ? resolveCommercialPavilionModulePlan(entity)
    : null;
  const usesInspectionCopy = landmarkKind === 'commercial-pavilion'
    || landmarkKind === 'livestock-pavilion'
    || landmarkKind === 'mirante-pavilion';

  // The panel is persistent, but commercial drafts belong to one entity only.
  // Close them before paint when selection changes; only the small forms below
  // are keyed, never the panel, scene or Canvas.
  useLayoutEffect(() => {
    setWorkflow(null);
    setStructureOperation(null);
    setHistoryEntityId(null);
  }, [entity.id]);

  return (
    <>
      <aside
        ref={sheet.panelRef}
        className="commercial-map-panel commercial-map-details-panel"
        data-sheet-state={sheet.sheetState}
        data-history-open={historyOpen}
        aria-label={`Detalhes de ${metadata.officialDisplayName}`}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
        onTouchEnd={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        {historyOpen && <>
          <div className="fenasoja-history-sheet-controls"><CompactDetailSheetControls sheet={sheet} /></div>
          <HistoryExperience key={entity.id} historyId={historyId} onClose={closeHistory} />
        </>}
        <div className="commercial-map-commercial-view" hidden={historyOpen}>
        <PanelHeader eyebrow={`${entity.publicIdentifier} · ${CLASSIFICATION_LABELS[entity.classification]}`} title={metadata.officialDisplayName} onClose={() => setSelectedEntityId(null)} />
        {historyId && <Button ref={historyTriggerRef} variant="outline" className="commercial-map-history-trigger" onClick={() => setHistoryEntityId(entity.id)}><BookOpen aria-hidden="true" />Conhecer a história</Button>}
        <div className="commercial-map-selection-summary" aria-label="Resumo da seleção">
          {status ? (
            <span className="commercial-map-status-pill" style={{ color: status.border, background: status.surface, borderColor: status.color }}>
              <b aria-hidden="true">{status.symbol}</b>{status.label}
            </span>
          ) : <Badge variant="outline">Não comercial</Badge>}
          <span>{pavilionPlan
            ? `${pavilionPlan.stats.moduleCount} módulos · ${number.format(pavilionPlan.stats.totalAreaSquareMeters)} m² de área total`
            : lot?.officialAreaSqm != null ? `${areaNumber.format(lot.officialAreaSqm)} m² de área oficial` : 'Área não informada'}</span>
        </div>
        <CompactDetailSheetControls sheet={sheet}>
          {sceneAvailable && strategicLandmarkSupportsInterior(entity) && (
            <Button className="commercial-map-selection-interior-action"
              onClick={() => enterInterior(entity.id)}
              data-commercial-map-interior-trigger={entity.id}
              aria-label={`${usesInspectionCopy ? 'Ver' : 'Visitar'} interior de ${metadata.officialDisplayName}`}>
              <DoorOpen className="h-4 w-4" />
              {usesInspectionCopy ? 'Ver interior' : 'Visitar interior'}
            </Button>
          )}
        </CompactDetailSheetControls>
        <ScrollArea className="commercial-map-panel-scroll">
          <div className="commercial-map-detail-hero">
            <p>{entity.description || 'Estrutura identificada na planta oficial da Fenasoja.'}</p>
          </div>

          {pavilionPlan && (
            <details className="commercial-map-selection-plan">
              <summary>Planta e áreas oficiais</summary>
              <PavilionPlanLegend plan={pavilionPlan} />
            </details>
          )}

          {lot?.status === 'SOLD' && (
            <section className="commercial-map-sale-confirmed" aria-label="Venda confirmada">
              <header><CheckCircle2 aria-hidden="true" /><span>Venda confirmada</span></header>
              <strong className="commercial-map-sale-confirmed__buyer">{saleHistory.data?.buyerName || lot.currentBuyer}</strong>
              <p>
                {saleHistory.data?.createdAt
                  ? `Vendido em ${dateTime.format(new Date(saleHistory.data.createdAt))}`
                  : lot.saleDate ? `Vendido em ${dateTime.format(new Date(`${lot.saleDate}T12:00:00-03:00`))}` : 'Data da venda não informada'}
              </p>
              <div>
                {saleStageLabel(saleHistory.data?.stage) && <span>{saleStageLabel(saleHistory.data?.stage)}</span>}
                {(saleHistory.data?.salespersonName || lot.salespersonName) && <span>Responsável: {saleHistory.data?.salespersonName || lot.salespersonName}</span>}
                {(saleHistory.data?.contractNumber || lot.activeContractNumber) && <span>Contrato: {saleHistory.data?.contractNumber || lot.activeContractNumber}</span>}
              </div>
            </section>
          )}

          {lot && <LotPricing2028Panel lotId={lot.id} officialAreaSqm={lot.officialAreaSqm} confirmedStage={lot.status === 'SOLD' ? saleStage(saleHistory.data?.stage) : null} />}

          <Tabs defaultValue="overview" className="commercial-map-detail-tabs">
            <TabsList>
              <TabsTrigger value="overview">Visão geral</TabsTrigger>
              <TabsTrigger value="history">Histórico</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <div className="commercial-map-detail-grid">
                <DetailMetric icon={Ruler} label="Área oficial" value={lot?.officialAreaSqm != null ? `${areaNumber.format(lot.officialAreaSqm)} m²` : 'Área não informada'} warning={!lot?.officialAreaSqm} />
                {lot && <DetailMetric icon={Building2} label="Bloco / lote" value={[lot.block, lot.lotNumber].filter(Boolean).join(' · ') || 'Não informado'} />}
                {lot?.levelLabel && <DetailMetric icon={Layers3} label="Piso / nível" value={lot.levelLabel} />}
                {!lot && <DetailMetric icon={Ruler} label="Área cartográfica" value={`${number.format(areaMapUnits)} un²`} warning={!entity.geometry.calibrationVersion} />}
              </div>

              {lot ? (
                <>
                  <div className="commercial-map-detail-section commercial-map-commercial-facts">
                    <h3>{lot.status === 'SOLD' ? 'Características do espaço' : 'Informações comerciais'}</h3>
                    <dl>
                      {entity.metadata.segmentName && <div><dt>Segmento</dt><dd>{String(entity.metadata.segmentName)}</dd></div>}
                      {lot.infrastructure.length > 0 && <div><dt>Infraestrutura</dt><dd>{lot.infrastructure.join(', ')}</dd></div>}
                      {lot.hasElectricity && <div><dt>Energia elétrica</dt><dd>Disponível</dd></div>}
                      {lot.hasWater && <div><dt>Água</dt><dd>Disponível</dd></div>}
                      {lot.hasInternet && <div><dt>Internet</dt><dd>Disponível</dd></div>}
                      {lot.isCorner && <div><dt>Posição</dt><dd>Lote de esquina</dd></div>}
                      {lot.isCovered && <div><dt>Cobertura</dt><dd>Área coberta</dd></div>}
                      {lot.status !== 'SOLD' && lot.reservationExpiresAt && <div><dt>Reserva até</dt><dd>{dateTime.format(new Date(lot.reservationExpiresAt))}</dd></div>}
                    </dl>
                  </div>
                  {permissions.canManageContracts && (lot.status === 'SOLD' || Boolean(contracts.data?.length)) && (
                    <section className="commercial-map-contract-action" aria-label="Contrato da venda">
                      <div className="commercial-map-contract-action__heading">
                        <FileLock2 aria-hidden="true" />
                        <span><strong>{contracts.data?.length ? 'Contrato anexado ✓' : 'Contrato da venda'}</strong>{!contracts.data?.length && <small>Adicione o documento referente à comercialização deste espaço.</small>}</span>
                      </div>
                      {contracts.isLoading && <p>Carregando documentos autorizados…</p>}
                      {contracts.isError && <p>Não foi possível gerar o acesso temporário aos documentos.</p>}
                      {contracts.data?.filter((contract) => !contract.supersededAt).map((contract) => (
                        <a href={contract.signedUrl} target="_blank" rel="noreferrer" key={contract.id}>
                          <FileText />
                          <span><strong>{contract.originalName}</strong><small>Visualizar · Versão {contract.version}</small></span>
                        </a>
                      ))}
                      <Button variant="outline" onClick={() => setWorkflow('contract')}><FileLock2 className="h-4 w-4" />{contracts.data?.length ? 'Substituir contrato' : '+ Anexar contrato'}</Button>
                    </section>
                  )}
                </>
              ) : (
                <div className="commercial-map-non-sellable">
                  <ShieldAlert className="h-5 w-5" />
                  <div><strong>Fora do fluxo de vendas</strong><p>Esta geometria foi classificada explicitamente como estrutura não comercial. Ela não pode receber reserva, preço ou contrato.</p></div>
                </div>
              )}

              <div className="commercial-map-detail-actions">
                {lot && permissions.canManageLots && structuralReady && (
                  <>
                    <Button variant="outline" onClick={() => setStructureOperation('split')}><Scissors className="h-4 w-4" />Dividir</Button>
                    <Button variant="outline" onClick={() => setStructureOperation('merge')}><Combine className="h-4 w-4" />Mesclar</Button>
                  </>
                )}
                {lot && permissions.canManageSales && ['AVAILABLE', 'IN_NEGOTIATION'].includes(lot.status) && (
                  <Button variant="outline" onClick={() => setWorkflow('reserve')}><CalendarClock className="h-4 w-4" />Reservar</Button>
                )}
                {lot && permissions.canManageSales && ['AVAILABLE', 'RESERVED'].includes(lot.status) && (
                  <Button variant="outline" onClick={() => setWorkflow('negotiate')}><Clock3 className="h-4 w-4" />Negociar</Button>
                )}
                {lot && permissions.canManageSales && ['AVAILABLE', 'RESERVED', 'IN_NEGOTIATION'].includes(lot.status) && (
                  salesModeActive ? (
                    <Button
                      variant={salesSelection.some((item) => item.lotId === lot.id) ? 'secondary' : 'default'}
                      onClick={() => toggleSalesLot(toSalesEntry(lot))}
                    >
                      <ShoppingCart className="h-4 w-4" />
                      {salesSelection.some((item) => item.lotId === lot.id) ? 'Na venda' : 'Adicionar à venda'}
                    </Button>
                  ) : (
                    <Button onClick={() => setWorkflow('sell')}><ShoppingBag className="h-4 w-4" />Marcar vendido</Button>
                  )
                )}
              </div>
            </TabsContent>
            <TabsContent value="history">
              <LotSaleHistoryCard sale={saleHistory.data} loading={saleHistory.isLoading} />
              <div className="commercial-map-activity">
                {!lot && <div className="commercial-map-empty compact"><History /><strong>Histórico disponível após a importação</strong></div>}
                {lot && activity.isLoading && <p>Carregando histórico auditável…</p>}
                {lot && !activity.isLoading && activity.data?.length === 0 && <div className="commercial-map-empty compact"><History /><strong>Nenhuma alteração registrada</strong></div>}
                {activity.data?.map((item) => (
                  <div key={item.id}>
                    <i><CheckCircle2 /></i>
                    <span><strong>{item.action.replace(/_/g, ' ')}</strong><small>{dateTime.format(new Date(item.createdAt))}{item.reason ? ` · ${item.reason}` : ''}</small></span>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </ScrollArea>
        </div>
      </aside>
      {lot && <LotWorkflowDialog key={`workflow:${lot.id}`} lot={lot} workflow={workflow} onClose={() => setWorkflow(null)} />}
      {lot && <LotStructureDialog key={`structure:${lot.id}`} operation={structureOperation} lot={lot} entity={entity} entities={entities} lots={lots} onClose={() => setStructureOperation(null)} />}
    </>
  );
}
