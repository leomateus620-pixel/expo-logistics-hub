import { useMemo, type ReactNode } from 'react';
import {
  ChevronRight,
  Focus,
  Layers3,
  List,
  Map as MapIcon,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Tags,
  Tractor,
  Trees,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { STATUS_CONFIG } from '../../constants';
import {
  commercialMapSegmentInventory,
  type CommercialMapSegmentId,
} from '../../data/commercialMapSegments';
import { useCommercialMapStore, type CommercialMapDockSection } from '../../state/useCommercialMapStore';
import type { CommercialLot, CommercialStatus, MapEntity } from '../../types';
import type { CommercialMapAreaScope } from '../../utils/areaScope';
import { CommercialSummary } from '../panels/MapPanels';
import './commercial-map-dock.css';

const STATUS_ORDER: CommercialStatus[] = ['AVAILABLE', 'RESERVED', 'SOLD', 'BLOCKED'];

interface CommercialMapDockProps {
  entities: readonly MapEntity[];
  allLots: readonly CommercialLot[];
  lots: CommercialLot[];
  areaScope: CommercialMapAreaScope;
  onAreaScopeChange: (scope: CommercialMapAreaScope) => void;
  activeSegmentId: CommercialMapSegmentId | null;
  onSegmentSelect: (segmentId: CommercialMapSegmentId) => void;
  onSegmentClear: () => void;
  segmentName?: string;
  isCommissionScope: boolean;
  managementActions?: ReactNode;
}

/** Left rail hosting the commercial map controls and the summary of the active scope. */
export function CommercialMapDock({
  entities,
  allLots,
  lots,
  areaScope,
  onAreaScopeChange,
  activeSegmentId,
  onSegmentSelect,
  onSegmentClear,
  segmentName,
  isCommissionScope,
  managementActions,
}: CommercialMapDockProps) {
  const expanded = useCommercialMapStore((state) => state.dockExpanded);
  const setExpanded = useCommercialMapStore((state) => state.setDockExpanded);
  const section = useCommercialMapStore((state) => state.dockSection);
  const setSection = useCommercialMapStore((state) => state.setDockSection);
  const activePanel = useCommercialMapStore((state) => state.activePanel);
  const setActivePanel = useCommercialMapStore((state) => state.setActivePanel);
  const workspaceMode = useCommercialMapStore((state) => state.workspaceMode);
  const setWorkspaceMode = useCommercialMapStore((state) => state.setWorkspaceMode);
  const statusFilters = useCommercialMapStore((state) => state.statusFilters);
  const toggleStatus = useCommercialMapStore((state) => state.toggleStatus);
  const clearStatuses = useCommercialMapStore((state) => state.clearStatuses);

  const isExporural = areaScope === 'exporural';

  const inventory = useMemo(
    () => commercialMapSegmentInventory(entities, allLots).filter(({ segment }) => (
      segment.behavior.visibleByDefault || segment.behavior.interaction !== 'informational'
    )),
    [entities, allLots],
  );
  const activeSegment = inventory.find(({ segment }) => segment.id === activeSegmentId)?.segment ?? null;

  const renderSection = (
    id: CommercialMapDockSection,
    icon: ReactNode,
    label: string,
    hint: string,
    body: ReactNode,
    flagged = false,
  ) => {
    const open = expanded && section === id;
    const trigger = (
      <button
        type="button"
        className="commercial-map-dock__section-trigger"
        onClick={() => {
          if (!expanded) setExpanded(true);
          setSection(id);
        }}
        aria-expanded={open}
      >
        <span className="commercial-map-dock__section-icon">
          {icon}
          {flagged && <i aria-hidden="true" />}
        </span>
        {expanded && (
          <>
            <span className="commercial-map-dock__section-copy">
              <strong>{label}</strong>
              <small>{hint}</small>
            </span>
            <ChevronRight className="commercial-map-dock__section-chevron" aria-hidden="true" />
          </>
        )}
      </button>
    );

    return (
      <div key={id} className={`commercial-map-dock__section ${open ? 'is-open' : ''}`}>
        {expanded ? trigger : (
          <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        )}
        {open && <div className="commercial-map-dock__section-body">{body}</div>}
      </div>
    );
  };

  return (
    <aside
      className={`commercial-map-dock ${expanded ? 'is-expanded' : 'is-compact'}`}
      aria-label="Controles e resumo do mapa comercial"
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
              aria-label={expanded ? 'Recolher painel do mapa' : 'Expandir painel do mapa'}
              aria-pressed={expanded}
            >
              {expanded ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
            </button>
          </TooltipTrigger>
          {!expanded && <TooltipContent side="right">Expandir painel do mapa</TooltipContent>}
        </Tooltip>
      </div>

      <div className="commercial-map-dock__scroll">
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
          isExporural,
        )}

        {!isCommissionScope && renderSection(
          'segments',
          <Layers3 aria-hidden="true" />,
          'Segmentos',
          activeSegment ? activeSegment.name : `${inventory.length} segmentos`,
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
          Boolean(activeSegment),
        )}

        {renderSection(
          'filters',
          <SlidersHorizontal aria-hidden="true" />,
          'Situações comerciais',
          statusFilters.length > 0 ? `${statusFilters.length} filtro(s)` : 'Todas as situações',
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
          statusFilters.length > 0,
        )}

        {managementActions && renderSection(
          'management',
          <Settings2 aria-hidden="true" />,
          'Gestão',
          'Geometria, cadastro e base',
          <div className="commercial-map-dock__management">{managementActions}</div>,
        )}

        {renderSection(
          'view',
          <List aria-hidden="true" />,
          'Lista e tabela',
          workspaceMode === 'list' ? 'Modo lista ativo' : 'Mapa 3D ativo',
          <div className="commercial-map-dock__choices">
            <button
              type="button"
              className={workspaceMode === 'list' ? 'is-active' : ''}
              onClick={() => setWorkspaceMode(workspaceMode === 'list' ? '3d' : 'list')}
              aria-pressed={workspaceMode === 'list'}
            >
              <List aria-hidden="true" />{workspaceMode === 'list' ? 'Voltar ao mapa 3D' : 'Abrir lista e tabela'}
            </button>
          </div>,
          workspaceMode === 'list',
        )}

        <div className="commercial-map-dock__summary-slot">
          <CommercialSummary
            lots={lots}
            scope={areaScope}
            segmentName={segmentName}
            variant="dock"
            compact={!expanded}
          />
        </div>
      </div>
    </aside>
  );
}
