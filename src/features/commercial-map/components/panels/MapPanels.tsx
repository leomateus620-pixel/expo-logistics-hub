import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Combine,
  FileLock2,
  FileText,
  Focus,
  History,
  Info,
  Layers3,
  LockKeyhole,
  MapPinned,
  PencilLine,
  Ruler,
  SearchX,
  Scissors,
  ShieldAlert,
  ShoppingBag,
  Tag,
  UnlockKeyhole,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CLASSIFICATION_LABELS, STATUS_CONFIG, VERIFICATION_LABELS } from '../../constants';
import { useLotActivity, useLotContractVersions, useMapMutations } from '../../hooks/useCommercialMap';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import { polygonAreaMapUnits } from '../../utils/geometry';
import { normalizeMapEntityMetadata } from '../../utils/mapMetadata';
import type { CommercialLot, MapEntity, MapLayer, MapPermissions } from '../../types';
import { LotWorkflowDialog, type LotWorkflow } from '../commercial/LotWorkflowDialog';
import { LotStructureDialog, type LotStructureOperation } from '../commercial/LotStructureDialog';
import { LotEditDialog } from '../commercial/LotEditDialog';
import { EntityVerificationDialog } from '../commercial/EntityVerificationDialog';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

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

export function CommercialSummary({ lots }: { lots: CommercialLot[] }) {
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

  return (
    <div className="commercial-map-summary" aria-label="Resumo comercial">
      <div className="commercial-map-summary-primary">
        <strong>{lots.length}</strong>
        <span>lotes cadastrados</span>
      </div>
      {(['BLOCKED', 'AVAILABLE', 'RESERVED', 'IN_NEGOTIATION', 'SOLD'] as const).map((status) => (
        <button
          type="button"
          key={status}
          className={statusFilters.includes(status) ? 'is-active' : ''}
          onClick={() => toggleStatus(status)}
          aria-pressed={statusFilters.includes(status)}
        >
          <i style={{ background: STATUS_CONFIG[status].color }} />
          <strong>{totals.byStatus[status]}</strong>
          <span>{STATUS_CONFIG[status].shortLabel}</span>
        </button>
      ))}
      <div className="commercial-map-summary-value">
        <strong>{number.format(totals.availableArea)} m²</strong>
        <span>área oficial disponível</span>
      </div>
    </div>
  );
}

export function StatusLegend() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`commercial-map-legend ${expanded ? 'is-expanded' : ''}`}>
      <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <Info className="h-3.5 w-3.5" />
        Situações comerciais
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

export function LayersPanel({ layers, entities, permissions }: { layers: MapLayer[]; entities: MapEntity[]; permissions: MapPermissions }) {
  const { layerLock } = useMapMutations();
  const setActivePanel = useCommercialMapStore((state) => state.setActivePanel);
  const layerVisibility = useCommercialMapStore((state) => state.layerVisibility);
  const layerOpacity = useCommercialMapStore((state) => state.layerOpacity);
  const setLayerVisibility = useCommercialMapStore((state) => state.setLayerVisibility);
  const setLayerOpacity = useCommercialMapStore((state) => state.setLayerOpacity);
  const labelsVisible = useCommercialMapStore((state) => state.labelsVisible);
  const setLabelsVisible = useCommercialMapStore((state) => state.setLabelsVisible);
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
          <h3>Referência e desempenho</h3>
          <label className="commercial-map-setting-row">
            <span><strong>Mapa original</strong><small>Camada cartográfica temporária</small></span>
            <Switch checked={referenceVisible} onCheckedChange={setReferenceVisible} />
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

export function ResultsPanel({ entities, lots }: { entities: MapEntity[]; lots: CommercialLot[] }) {
  const setActivePanel = useCommercialMapStore((state) => state.setActivePanel);
  const setSelectedEntityId = useCommercialMapStore((state) => state.setSelectedEntityId);
  const statusFilters = useCommercialMapStore((state) => state.statusFilters);
  const toggleStatus = useCommercialMapStore((state) => state.toggleStatus);
  const lotByEntity = useMemo(() => new Map(lots.map((lot) => [lot.entityId, lot])), [lots]);
  return (
    <aside className="commercial-map-panel commercial-map-results-panel">
      <PanelHeader eyebrow="Busca e seleção" title={`${entities.length} resultados no mapa`} onClose={() => setActivePanel(null)} />
      <div className="commercial-map-filter-chips">
        {(Object.keys(STATUS_CONFIG) as Array<keyof typeof STATUS_CONFIG>).map((status) => (
          <button key={status} type="button" className={statusFilters.includes(status) ? 'is-active' : ''} onClick={() => toggleStatus(status)}>
            <i style={{ background: STATUS_CONFIG[status].color }} />{STATUS_CONFIG[status].shortLabel}
          </button>
        ))}
      </div>
      <ScrollArea className="commercial-map-panel-scroll">
        <div className="commercial-map-result-list">
          {entities.length === 0 && (
            <div className="commercial-map-empty"><SearchX /><strong>Nenhum resultado</strong><span>Ajuste a busca ou remova alguns filtros.</span></div>
          )}
          {entities.map((entity) => {
            const lot = lotByEntity.get(entity.id);
            const metadata = normalizeMapEntityMetadata(entity, lot);
            return (
              <button key={entity.id} type="button" onClick={() => setSelectedEntityId(entity.id)}>
                <i style={{ background: lot ? STATUS_CONFIG[lot.status].color : '#6e7f71' }}>{lot ? STATUS_CONFIG[lot.status].symbol : entity.publicIdentifier.slice(0, 2)}</i>
                <span><strong>{entity.publicIdentifier} · {metadata.officialDisplayName}</strong><small>{CLASSIFICATION_LABELS[entity.classification]}{lot ? ` · ${STATUS_CONFIG[lot.status].label}` : ''}</small></span>
                <ChevronRight className="h-4 w-4" />
              </button>
            );
          })}
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

export function EntityDetailsPanel({ entity, lot, entities, lots, permissions }: { entity: MapEntity; lot?: CommercialLot; entities: MapEntity[]; lots: CommercialLot[]; permissions: MapPermissions }) {
  const setSelectedEntityId = useCommercialMapStore((state) => state.setSelectedEntityId);
  const focusSelection = useCommercialMapStore((state) => state.focusSelection);
  const setWorkspaceMode = useCommercialMapStore((state) => state.setWorkspaceMode);
  const [workflow, setWorkflow] = useState<LotWorkflow>(null);
  const [structureOperation, setStructureOperation] = useState<LotStructureOperation>(null);
  const [editingLot, setEditingLot] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const activity = useLotActivity(lot?.id ?? null);
  const contracts = useLotContractVersions(lot?.id ?? null, permissions.canManageContracts);
  const areaMapUnits = polygonAreaMapUnits(entity.geometry);
  const status = lot ? STATUS_CONFIG[lot.status] : null;
  const metadata = normalizeMapEntityMetadata(entity, lot);
  const structuralReady = lot ? ['AVAILABLE', 'BLOCKED', 'UNAVAILABLE'].includes(lot.status) : false;

  return (
    <>
      <aside className="commercial-map-panel commercial-map-details-panel">
        <PanelHeader eyebrow={CLASSIFICATION_LABELS[entity.classification]} title={metadata.officialDisplayName} onClose={() => setSelectedEntityId(null)} />
        <ScrollArea className="commercial-map-panel-scroll">
          <div className="commercial-map-detail-hero">
            <div className="commercial-map-detail-code">{entity.publicIdentifier}</div>
            {status ? (
              <span className="commercial-map-status-pill" style={{ color: status.border, background: status.surface, borderColor: status.color }}>
                <b aria-hidden="true">{status.symbol}</b>{status.label}
              </span>
            ) : (
              <Badge variant="outline">Não comercial</Badge>
            )}
            <p>{entity.description || 'Estrutura identificada na planta oficial da Fenasoja.'}</p>
            <div className="commercial-map-verification">
              {entity.verificationStatus === 'VERIFIED' ? <BadgeCheck /> : <AlertTriangle />}
              <span><strong>{VERIFICATION_LABELS[entity.verificationStatus]}</strong><small>{entity.geometry.calibrationVersion ? `Calibração v${entity.geometry.calibrationVersion}` : 'Geometria não calibrada'}</small></span>
            </div>
          </div>

          <Tabs defaultValue="overview" className="commercial-map-detail-tabs">
            <TabsList>
              <TabsTrigger value="overview">Visão geral</TabsTrigger>
              <TabsTrigger value="history">Histórico</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <div className="commercial-map-detail-grid">
                <DetailMetric icon={Ruler} label="Área oficial" value={lot?.officialAreaSqm ? `${number.format(lot.officialAreaSqm)} m²` : 'Não validada'} warning={!lot?.officialAreaSqm} />
                <DetailMetric icon={MapPinned} label="Área cartográfica" value={`${number.format(areaMapUnits)} un²`} warning={!entity.geometry.calibrationVersion} />
                {lot && <DetailMetric icon={Tag} label="Preço solicitado" value={lot.askingPrice ? currency.format(lot.askingPrice) : 'A negociar'} />}
                {lot && <DetailMetric icon={Building2} label="Bloco / lote" value={[lot.block, lot.lotNumber].filter(Boolean).join(' · ') || 'Não informado'} />}
                {lot?.levelLabel && <DetailMetric icon={Layers3} label="Piso / nível" value={lot.levelLabel} />}
              </div>

              {lot ? (
                <>
                  <div className="commercial-map-detail-section">
                    <h3>Dados comerciais</h3>
                    <dl>
                      <div><dt>Expositor atual</dt><dd>{lot.currentBuyer || 'Nenhum vínculo ativo'}</dd></div>
                      <div><dt>Infraestrutura</dt><dd>{lot.infrastructure.length ? lot.infrastructure.join(', ') : 'Não informada'}</dd></div>
                      <div><dt>Reserva até</dt><dd>{lot.reservationExpiresAt ? dateTime.format(new Date(lot.reservationExpiresAt)) : 'Sem reserva ativa'}</dd></div>
                      <div><dt>Contrato</dt><dd>{lot.activeContractNumber || 'Não vinculado'}</dd></div>
                    </dl>
                  </div>
                  {permissions.canManageContracts && (
                    <div className="commercial-map-detail-section commercial-map-contract-list">
                      <h3>Documentos privados</h3>
                      {contracts.isLoading && <p>Carregando documentos autorizados…</p>}
                      {contracts.isError && <p>Não foi possível gerar o acesso temporário aos documentos.</p>}
                      {contracts.data?.length === 0 && <p>Nenhum contrato anexado a este lote.</p>}
                      {contracts.data?.map((contract) => (
                        <a href={contract.signedUrl} target="_blank" rel="noreferrer" key={contract.id}>
                          <FileText />
                          <span><strong>{contract.originalName}</strong><small>Versão {contract.version} · {(contract.fileSize / 1024 / 1024).toFixed(2)} MB{contract.supersededAt ? ' · substituído' : ' · ativo'}</small></span>
                          <FileLock2 />
                        </a>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="commercial-map-non-sellable">
                  <ShieldAlert className="h-5 w-5" />
                  <div><strong>Fora do fluxo de vendas</strong><p>Esta geometria foi classificada explicitamente como estrutura não comercial. Ela não pode receber reserva, preço ou contrato.</p></div>
                </div>
              )}

              <div className="commercial-map-detail-actions">
                <Button variant="outline" onClick={focusSelection}><Focus className="h-4 w-4" />Centralizar</Button>
                {permissions.isMapAdmin && <Button variant="outline" onClick={() => setVerificationOpen(true)}><BadgeCheck className="h-4 w-4" />{entity.verificationStatus === 'VERIFIED' ? 'Reabrir revisão' : 'Verificar entidade'}</Button>}
                {lot && permissions.canManageLots && <Button variant="outline" onClick={() => setEditingLot(true)}><PencilLine className="h-4 w-4" />Editar lote</Button>}
                {permissions.canEditGeometry && <Button variant="outline" onClick={() => setWorkspaceMode('edit')}><Ruler className="h-4 w-4" />Editar geometria</Button>}
                {lot && permissions.canManageLots && structuralReady && (
                  <>
                    <Button variant="outline" onClick={() => setStructureOperation('split')}><Scissors className="h-4 w-4" />Dividir</Button>
                    <Button variant="outline" onClick={() => setStructureOperation('merge')}><Combine className="h-4 w-4" />Mesclar</Button>
                  </>
                )}
                {lot && permissions.canManageSales && lot.status !== 'SOLD' && (
                  <>
                    <Button variant="outline" onClick={() => setWorkflow('reserve')}><CalendarClock className="h-4 w-4" />Reservar</Button>
                    <Button variant="outline" onClick={() => setWorkflow('negotiate')}><Clock3 className="h-4 w-4" />Negociar</Button>
                    <Button onClick={() => setWorkflow('sell')}><ShoppingBag className="h-4 w-4" />Marcar vendido</Button>
                  </>
                )}
                {lot && permissions.canManageContracts && <Button variant="outline" onClick={() => setWorkflow('contract')}><FileLock2 className="h-4 w-4" />Anexar contrato</Button>}
              </div>
            </TabsContent>
            <TabsContent value="history">
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
      </aside>
      {lot && <LotWorkflowDialog lot={lot} workflow={workflow} onClose={() => setWorkflow(null)} />}
      {lot && <LotStructureDialog operation={structureOperation} lot={lot} entity={entity} entities={entities} lots={lots} onClose={() => setStructureOperation(null)} />}
      {lot && <LotEditDialog lot={lot} open={editingLot} onClose={() => setEditingLot(false)} />}
      <EntityVerificationDialog entity={entity} open={verificationOpen} onClose={() => setVerificationOpen(false)} />
    </>
  );
}

export function MapListView({ entities, lots }: { entities: MapEntity[]; lots: CommercialLot[] }) {
  const setSelectedEntityId = useCommercialMapStore((state) => state.setSelectedEntityId);
  const setWorkspaceMode = useCommercialMapStore((state) => state.setWorkspaceMode);
  const lotByEntity = useMemo(() => new Map(lots.map((lot) => [lot.entityId, lot])), [lots]);
  return (
    <div className="commercial-map-list-view">
      <div className="commercial-map-list-heading">
        <div><span>Alternativa acessível ao mapa 3D</span><h2>Entidades do parque</h2><p>A seleção nesta tabela permanece sincronizada com a cena.</p></div>
        <Button variant="outline" onClick={() => setWorkspaceMode('3d')}><Layers3 className="h-4 w-4" />Voltar ao mapa</Button>
      </div>
      <div className="commercial-map-table-wrap">
        <table>
          <thead><tr><th>Identificação</th><th>Classificação</th><th>Situação</th><th>Área oficial</th><th>Verificação</th><th><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {entities.map((entity) => {
              const lot = lotByEntity.get(entity.id);
              const metadata = normalizeMapEntityMetadata(entity, lot);
              return (
                <tr key={entity.id}>
                  <td><strong>{entity.publicIdentifier}</strong><span>{metadata.officialDisplayName}</span></td>
                  <td>{CLASSIFICATION_LABELS[entity.classification]}</td>
                  <td>{lot ? <span className="commercial-map-table-status"><i style={{ background: STATUS_CONFIG[lot.status].color }} />{STATUS_CONFIG[lot.status].label}</span> : 'Não comercial'}</td>
                  <td>{lot?.officialAreaSqm ? `${number.format(lot.officialAreaSqm)} m²` : 'Área não validada'}</td>
                  <td>{VERIFICATION_LABELS[entity.verificationStatus]}</td>
                  <td><Button size="sm" variant="ghost" onClick={() => { setSelectedEntityId(entity.id); setWorkspaceMode('3d'); }}>Ver no mapa<ChevronRight className="h-4 w-4" /></Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
