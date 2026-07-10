import {
  Box,
  Building2,
  CarFront,
  Layers3,
  List,
  Map,
  Maximize2,
  MousePointer2,
  ParkingCircle,
  Search,
  SlidersHorizontal,
  SquareStack,
  Warehouse,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CAMERA_PRESETS } from '../../constants';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type { CameraPreset, MapPermissions } from '../../types';

const presetIcons: Record<CameraPreset, typeof Map> = {
  overview: Map,
  top: SquareStack,
  isometric: Box,
  commercial: Building2,
  pavilions: Warehouse,
  parking: ParkingCircle,
  gates: CarFront,
};

export function MapToolbar({ permissions, hasSelection }: { permissions: MapPermissions; hasSelection: boolean }) {
  const search = useCommercialMapStore((state) => state.search);
  const setSearch = useCommercialMapStore((state) => state.setSearch);
  const activePanel = useCommercialMapStore((state) => state.activePanel);
  const setActivePanel = useCommercialMapStore((state) => state.setActivePanel);
  const workspaceMode = useCommercialMapStore((state) => state.workspaceMode);
  const setWorkspaceMode = useCommercialMapStore((state) => state.setWorkspaceMode);
  const requestCameraPreset = useCommercialMapStore((state) => state.requestCameraPreset);
  const focusSelection = useCommercialMapStore((state) => state.focusSelection);

  return (
    <>
      <div className="commercial-map-search">
        <Search className="h-4 w-4" aria-hidden="true" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar lote, bloco, empresa ou contrato"
          aria-label="Buscar no mapa comercial"
        />
        <kbd>⌘ K</kbd>
      </div>

      <div className="commercial-map-toolbar" aria-label="Controles do mapa">
        {(Object.keys(CAMERA_PRESETS) as CameraPreset[]).slice(0, 3).map((preset) => {
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
        {permissions.canEditGeometry && (
          <Button
            size="sm"
            className="commercial-map-edit-button"
            onClick={() => setWorkspaceMode(workspaceMode === 'edit' ? '3d' : 'edit')}
            disabled={!hasSelection}
          >
            <MousePointer2 className="h-4 w-4" />
            {workspaceMode === 'edit' ? 'Sair da edição' : 'Editar geometria'}
          </Button>
        )}
      </div>
    </>
  );
}
