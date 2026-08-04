import {
  Box,
  Building2,
  CarFront,
  Layers3,
  List,
  Map,
  Maximize2,
  ParkingCircle,
  Search,
  ScanSearch,
  SlidersHorizontal,
  SquareStack,
  Warehouse,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CAMERA_PRESETS } from '../../constants';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type { CameraPreset, MapPermissions } from '../../types';
import type { CommercialMapAreaScope } from '../../utils/areaScope';
import { canUseTechnicalValidationOverlay } from '../../utils/technicalValidation';

const presetIcons: Record<CameraPreset, typeof Map> = {
  overview: Map,
  top: SquareStack,
  isometric: Box,
  commercial: Building2,
  pavilions: Warehouse,
  parking: ParkingCircle,
  gates: CarFront,
  exporural: Map,
  'quadra-r': SquareStack,
  'quadra-s': SquareStack,
  semear: Building2,
};

export function MapToolbar({
  permissions,
  hasSelection,
  areaScope,
}: {
  permissions: MapPermissions;
  hasSelection: boolean;
  areaScope: CommercialMapAreaScope;
}) {
  const search = useCommercialMapStore((state) => state.search);
  const setSearch = useCommercialMapStore((state) => state.setSearch);
  const activePanel = useCommercialMapStore((state) => state.activePanel);
  const setActivePanel = useCommercialMapStore((state) => state.setActivePanel);
  const workspaceMode = useCommercialMapStore((state) => state.workspaceMode);
  const setWorkspaceMode = useCommercialMapStore((state) => state.setWorkspaceMode);
  const requestCameraPreset = useCommercialMapStore((state) => state.requestCameraPreset);
  const focusSelection = useCommercialMapStore((state) => state.focusSelection);
  const technicalValidationVisible = useCommercialMapStore((state) => state.technicalValidationVisible);
  const setTechnicalValidationVisible = useCommercialMapStore((state) => state.setTechnicalValidationVisible);
  const canUseTechnicalValidation = canUseTechnicalValidationOverlay(areaScope, permissions);
  const presets: CameraPreset[] = areaScope === 'exporural'
    ? ['exporural', 'top', 'isometric', 'quadra-r', 'quadra-s', 'semear']
    : ['overview', 'top', 'isometric'];

  return (
    <>
      <div className="commercial-map-search">
        <Search className="h-4 w-4" aria-hidden="true" />
        <Input
          data-commercial-map-search
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && search) {
              event.preventDefault();
              event.stopPropagation();
              setSearch('');
            } else if (event.key === 'Enter') {
              setActivePanel('results');
            }
          }}
          placeholder={areaScope === 'exporural' ? 'Lote, quadra, rua ou estrutura Exporural' : 'ID, nome, quadra, lote, rua ou empresa'}
          aria-label={areaScope === 'exporural' ? 'Buscar somente na Exporural' : 'Buscar no mapa comercial'}
          aria-keyshortcuts="Control+K Meta+K"
          autoComplete="off"
        />
        {search && <button type="button" className="commercial-map-search-clear" onClick={() => setSearch('')} aria-label="Limpar busca"><X /></button>}
        <kbd aria-hidden="true">Ctrl K</kbd>
      </div>

      <div className="commercial-map-toolbar" aria-label="Controles do mapa">
        {presets.map((preset) => {
          const Icon = presetIcons[preset];
          return (
            <Tooltip key={preset}>
              <TooltipTrigger asChild>
                <button type="button" onClick={() => requestCameraPreset(preset)} aria-label={CAMERA_PRESETS[preset].label}>
                  <Icon className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{CAMERA_PRESETS[preset].label}</TooltipContent>
            </Tooltip>
          );
        })}
        <span className="commercial-map-toolbar-separator" />
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={focusSelection} disabled={!hasSelection} aria-label="Centralizar seleção">
              <Maximize2 className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Centralizar seleção</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className={activePanel === 'layers' ? 'is-active' : ''} onClick={() => setActivePanel(activePanel === 'layers' ? null : 'layers')} aria-label="Camadas do mapa">
              <Layers3 className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Camadas</TooltipContent>
        </Tooltip>
        {canUseTechnicalValidation && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={technicalValidationVisible ? 'is-active' : ''}
                onClick={() => setTechnicalValidationVisible(!technicalValidationVisible)}
                aria-label="Validação técnica da Exporural"
                aria-pressed={technicalValidationVisible}
              >
                <ScanSearch className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {technicalValidationVisible ? 'Ocultar validação técnica' : 'Validar geometrias da Exporural'}
            </TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className={workspaceMode === 'list' ? 'is-active' : ''} onClick={() => setWorkspaceMode(workspaceMode === 'list' ? '3d' : 'list')} aria-label="Lista acessível de entidades">
              <List className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Lista e tabela</TooltipContent>
        </Tooltip>
      </div>

      <div className="commercial-map-actions">
        <Button variant="outline" size="sm" onClick={() => setActivePanel('results')}>
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
        </Button>
      </div>
    </>
  );
}
