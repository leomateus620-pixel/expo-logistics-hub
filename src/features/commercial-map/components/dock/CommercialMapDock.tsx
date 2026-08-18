import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  ChevronRight,
  Focus,
  Layers3,
  List,
  Map as MapIcon,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  ScanSearch,
  Search,
  Settings2,
  SlidersHorizontal,
  SquareStack,
  Tags,
  Tractor,
  Trees,
  X,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CAMERA_PRESETS, STATUS_CONFIG } from '../../constants';
import {
  COMMERCIAL_MAP_SEGMENT_IDS,
  commercialMapSegmentInventory,
  type CommercialMapSegmentId,
} from '../../data/commercialMapSegments';
import { useCommercialMapStore, type CommercialMapDockSection } from '../../state/useCommercialMapStore';
import type { CameraPreset, CommercialLot, CommercialStatus, MapEntity, MapPermissions } from '../../types';
import type { CommercialMapAreaScope } from '../../utils/areaScope';
import { canUseTechnicalValidationOverlay } from '../../utils/technicalValidation';
import './commercial-map-dock.css';

const STATUS_ORDER: CommercialStatus[] = ['AVAILABLE', 'RESERVED', 'SOLD', 'BLOCKED', 'NOT_COMMERCIAL'];

interface CommercialMapDockProps {
  entities: readonly MapEntity[];
  lots: readonly CommercialLot[];
  areaScope: CommercialMapAreaScope;
  onAreaScopeChange: (scope: CommercialMapAreaScope) => void;
  activeSegmentId: CommercialMapSegmentId | null;
  onSegmentSelect: (segmentId: CommercialMapSegmentId) => void;
  onSegmentClear: () => void;
  permissions: MapPermissions;
  hasSelection: boolean;
  isCommissionScope: boolean;
  managementActions?: ReactNode;
}

export function CommercialMapDock({
  entities,
  lots,
  areaScope,
  onAreaScopeChange,
  activeSegmentId,
  onSegmentSelect,
  onSegmentClear,
  permissions,
  hasSelection,
  isCommissionScope,
  managementActions,
}: CommercialMapDockProps) {
  const expanded = useCommercialMapStore((state) => state.dockExpanded);
  const setExpanded = useCommercialMapStore((state) => state.setDockExpanded);
  const section = useCommercialMapStore((state) => state.dockSection);
  const setSection = useCommercialMapStore((state) => state.setDockSection);
  const search = useCommercialMapStore((state) => state.search);
  const setSearch = useCommercialMapStore((state) => state.setSearch);
  const activePanel = useCommercialMapStore((state) => state.activePanel);
  const setActivePanel = useCommercialMapStore((state) => state.setActivePanel);
  const workspaceMode = useCommercialMapStore((state) => state.workspaceMode);
  const setWorkspaceMode = useCommercialMapStore((state) => state.setWorkspaceMode);
  const requestCameraPreset = useCommercialMapStore((state) => state.requestCameraPreset);
  const cameraPreset = useCommercialMapStore((state) => state.cameraPreset);
  const focusSelection = useCommercialMapStore((state) => state.focusSelection);
  const treesVisible = useCommercialMapStore((state) => state.treesVisible);
  const setTreesVisible = useCommercialMapStore((state) => state.setTreesVisible);
  const technicalValidationVisible = useCommercialMapStore((state) => state.technicalValidationVisible);
  const setTechnicalValidationVisible = useCommercialMapStore((state) => state.setTechnicalValidationVisible);
  const statusFilters = useCommercialMapStore((state) => state.statusFilters);
  const toggleStatus = useCommercialMapStore((state) => state.toggleStatus);
  const clearStatuses = useCommercialMapStore((state) => state.clearStatuses);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isExporural = areaScope === 'exporural';
  const canUseTechnicalValidation = !isCommissionScope
    && canUseTechnicalValidationOverlay(areaScope, permissions);
  const hasTreeLayer = areaScope === 'park' || areaScope === COMMERCIAL_MAP_SEGMENT_IDS.industry;
  const presets: CameraPreset[] = isExporural
    ? ['exporural', 'top', 'isometric', 'quadra-r', 'quadra-s']
    : ['overview', 'top', 'isometric'];

  const inventory = useMemo(
    () => commercialMapSegmentInventory(entities, lots).filter(({ segment }) => (
      segment.behavior.visibleByDefault || segment.behavior.interaction !== 'informational'
    )),
    [entities, lots],
  );

  useEffect(() => {
    if (expanded && section === 'search') {
      const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
      return () => window.cancelAnimationFrame(frame);
    }
    return undefined;
  }, [expanded, section]);

  const openSection = (next: CommercialMapDockSection) => {
    if (!expanded) {
      setExpanded(true);
      setSection(section === next ? next : next);
      return;
    }
    setSection(next);
  };

  const renderSection = (
    id: CommercialMapDockSection,
    icon: ReactNode,
    label: string,
    hint: string,
    body: ReactNode,
    badge?: string,
  ) => {
    const open = expanded && section === id;
    return (
      <section key={id} className={`commercial-map-dock__section ${open ? 'is-open' : ''}`}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="commercial-map-dock__section-trigger"
              onClick={() => openSection(id)}
              aria-expanded={open}
              aria-label={label}
            >
              <span className="commercial-map-dock__section-icon">
                {icon}
                {badge && <i aria-hidden="true" />}
              </span>
              {expanded && (
                <span className="commercial-map-dock__section-copy">
                  <strong>{label}</strong>
                  <small>{badge ?? hint}</small>
                </span>
              )}
              {expanded && <ChevronRight className="commercial-map-dock__section-chevron" aria-hidden="true" />}
            </button>
          </TooltipTrigger>
          {!expanded && <TooltipContent side="right">{label}</TooltipContent>}
        </Tooltip>
        {open && <div className="commercial-map-dock__section-body">{body}</div>}
      </section>
    );
  };

  const activeSegment = inventory.find(({ segment }) => segment.id === activeSegmentId)?.segment ?? null;

  return (
    <aside
      className={`commercial-map-dock ${expanded ? 'is-expanded' : 'is-compact'}`}
      aria-label="Controles do mapa comercial"
    >
      <div className="commercial-map-dock__head">
        {expanded && (
          <span className="commercial-map-dock__brand">
            <MapIcon aria-hidden="true" />
            <span>{isCommissionScope ? 'Segmento comercial' : isExporural ? 'Exporural' : 'Parque Fenasoja'}</span>
          </span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="commercial-map-dock__toggle"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? 'Recolher painel de controles' : 'Expandir painel de controles'}
              aria-pressed={expanded}
            >
              {expanded ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
            </button>
          </TooltipTrigger>
          {!expanded && <TooltipContent side="right">Expandir controles</TooltipContent>}
        </Tooltip>
      </div>

      <div className="commercial-map-dock__scroll">
        {renderSection(
          'search',
          <Search aria-hidden="true" />,
          'Busca',
          'ID, lote, quadra ou empresa',
          <form
            role="search"
            className="commercial-map-dock__search"
            onSubmit={(event) => {
              event.preventDefault();
              setActivePanel('results');
            }}
          >
            <Search aria-hidden="true" />
            <input
              ref={searchInputRef}
              data-commercial-map-search
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={isExporural ? 'Lote, quadra, rua ou estrutura' : 'ID, nome, quadra, lote ou empresa'}
              aria-label="Buscar no mapa comercial"
              aria-keyshortcuts="Control+K Meta+K"
              autoComplete="off"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca">
                <X aria-hidden="true" />
              </button>
            )}
          </form>,
          search ? 'Filtro ativo' : undefined,
        )}

        {!isCommissionScope && renderSection(
          'area',
          isExporural ? <Tractor aria-hidden="true" /> : <Trees aria-hidden="true" />,
          'Área do mapa',
          isExporural ? 'Exporural' : 'Parque completo',
          <div className="commercial-map-dock__choices" role="group" aria-label="Área exibida no mapa">
            <button
              type="button"
              className={!isExporural ? 'is-active' : ''}
              onClick={() => onAreaScopeChange('park')}
              aria-pressed={!isExporural}
            >
              <Trees aria-hidden="true" />Parque completo
            </button>
            <button
              type="button"
              className={isExporural ? 'is-active' : ''}
              onClick={() => onAreaScopeChange('exporural')}
              aria-pressed={isExporural}
            >
              <Tractor aria-hidden="true" />Exporural
            </button>
          </div>,
          isExporural ? 'Exporural' : 'Parque completo',
        )}

        {!isCommissionScope && renderSection(
          'segments',
          <Layers3 aria-hidden="true" />,
          'Segmentos',
          'Filtrar e aproximar',
          <div className="commercial-map-dock__segments" role="group" aria-label="Filtrar mapa por segmento">
            {inventory.map(({ segment, lotCount }) => {
              const active = segment.id === activeSegmentId;
              const interactive = segment.behavior.interaction === 'filter-and-focus';
              return (
                <button
                  key={segment.id}
                  type="button"
                  className={active ? 'is-active' : ''}
                  onClick={() => onSegmentSelect(segment.id)}
                  disabled={!interactive}
                  aria-pressed={active}
                  aria-controls="commercial-map-viewport"
                  title={segment.description}
                >
                  <i
                    style={{
                      background: `linear-gradient(145deg, ${segment.palette.accent}, ${segment.palette.surface})`,
                      borderColor: segment.palette.edge,
                    }}
                    aria-hidden="true"
                  />
                  <span>
                    <strong>{segment.name}</strong>
                    <small>{lotCount} lotes</small>
                  </span>
                  <Focus aria-hidden="true" />
                </button>
              );
            })}
            {activeSegment && (
              <button type="button" className="commercial-map-dock__reset" onClick={onSegmentClear}>
                <RotateCcw aria-hidden="true" />Mostrar todos os segmentos
              </button>
            )}
          </div>,
          activeSegment?.name,
        )}

        {renderSection(
          'view',
          <SquareStack aria-hidden="true" />,
          'Visualização',
          'Câmera, camadas e lista',
          <div className="commercial-map-dock__stack">
            <div className="commercial-map-dock__choices" role="group" aria-label="Enquadramentos de câmera">
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={cameraPreset === preset ? 'is-active' : ''}
                  onClick={() => requestCameraPreset(preset)}
                  aria-pressed={cameraPreset === preset}
                >
                  <MapIcon aria-hidden="true" />{CAMERA_PRESETS[preset].label}
                </button>
              ))}
            </div>
            <div className="commercial-map-dock__choices" role="group" aria-label="Camadas e modos">
              <button type="button" onClick={focusSelection} disabled={!hasSelection}>
                <Maximize2 aria-hidden="true" />Centralizar seleção
              </button>
              <button
                type="button"
                className={activePanel === 'layers' ? 'is-active' : ''}
                onClick={() => setActivePanel(activePanel === 'layers' ? null : 'layers')}
                aria-pressed={activePanel === 'layers'}
              >
                <Layers3 aria-hidden="true" />Camadas do mapa
              </button>
              {hasTreeLayer && (
                <button
                  type="button"
                  className={treesVisible ? 'is-active' : ''}
                  onClick={() => setTreesVisible(!treesVisible)}
                  aria-pressed={treesVisible}
                >
                  <Trees aria-hidden="true" />{treesVisible ? 'Ocultar árvores' : 'Exibir árvores'}
                </button>
              )}
              {canUseTechnicalValidation && (
                <button
                  type="button"
                  className={technicalValidationVisible ? 'is-active' : ''}
                  onClick={() => setTechnicalValidationVisible(!technicalValidationVisible)}
                  aria-pressed={technicalValidationVisible}
                >
                  <ScanSearch aria-hidden="true" />
                  {technicalValidationVisible ? 'Ocultar validação técnica' : 'Validação técnica'}
                </button>
              )}
              <button
                type="button"
                className={workspaceMode === 'list' ? 'is-active' : ''}
                onClick={() => setWorkspaceMode(workspaceMode === 'list' ? '3d' : 'list')}
                aria-pressed={workspaceMode === 'list'}
              >
                <List aria-hidden="true" />{workspaceMode === 'list' ? 'Voltar ao mapa 3D' : 'Lista e tabela'}
              </button>
            </div>
          </div>,
        )}

        {renderSection(
          'filters',
          <SlidersHorizontal aria-hidden="true" />,
          'Situações comerciais',
          'Filtrar por status do lote',
          <div className="commercial-map-dock__stack">
            <div className="commercial-map-dock__statuses" role="group" aria-label="Filtrar por situação comercial">
              {STATUS_ORDER.map((status) => {
                const config = STATUS_CONFIG[status];
                const active = statusFilters.includes(status);
                return (
                  <button
                    key={status}
                    type="button"
                    className={active ? 'is-active' : ''}
                    onClick={() => toggleStatus(status)}
                    aria-pressed={active}
                  >
                    <i style={{ background: config.color, borderColor: config.border }} aria-hidden="true" />
                    {config.label}
                  </button>
                );
              })}
            </div>
            <div className="commercial-map-dock__choices">
              <button type="button" onClick={() => setActivePanel(activePanel === 'results' ? null : 'results')}>
                <Tags aria-hidden="true" />
                {activePanel === 'results' ? 'Fechar resultados' : 'Abrir resultados e filtros'}
              </button>
              {statusFilters.length > 0 && (
                <button type="button" onClick={clearStatuses}>
                  <RotateCcw aria-hidden="true" />Limpar situações
                </button>
              )}
            </div>
          </div>,
          statusFilters.length ? `${statusFilters.length} ativo(s)` : undefined,
        )}

        {managementActions && renderSection(
          'management',
          <Settings2 aria-hidden="true" />,
          'Gestão',
          'Ferramentas administrativas',
          <div className="commercial-map-dock__management">{managementActions}</div>,
        )}
      </div>
    </aside>
  );
}
