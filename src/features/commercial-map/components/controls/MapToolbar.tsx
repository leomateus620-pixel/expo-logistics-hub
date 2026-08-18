import {
  Box,
  Building2,
  CarFront,
  Layers3,
  List,
  Map,
  Maximize2,
  MoreHorizontal,
  ParkingCircle,
  Search,
  ScanSearch,
  SlidersHorizontal,
  SquareStack,
  Trees,
  Warehouse,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEffect, useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CAMERA_PRESETS } from '../../constants';
import { COMMERCIAL_MAP_SEGMENT_IDS } from '../../data/commercialMapSegments';
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
  semear: Map,
};

export function MapToolbar({
  permissions,
  hasSelection,
  areaScope,
  isCommissionScope = false,
  showDesktopControls = false,
}: {
  permissions: MapPermissions;
  hasSelection: boolean;
  areaScope: CommercialMapAreaScope;
  isCommissionScope?: boolean;
  /** Desktop search and camera rail now live in the left dock. */
  showDesktopControls?: boolean;
}) {
  const [isCompactSearchOpen, setIsCompactSearchOpen] = useState(false);
  const compactSearchInputRef = useRef<HTMLInputElement>(null);
  const compactSearchTriggerRef = useRef<HTMLButtonElement>(null);
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
  const canUseTechnicalValidation = canUseTechnicalValidationOverlay(areaScope, permissions);
  const hasTreeLayer = areaScope === 'park' || areaScope === COMMERCIAL_MAP_SEGMENT_IDS.industry;
  const presets: CameraPreset[] = areaScope === 'exporural'
    ? ['exporural', 'top', 'isometric', 'quadra-r', 'quadra-s', 'semear']
    : ['overview', 'top', 'isometric'];
  const mobileResetPreset: CameraPreset = areaScope === 'exporural' ? 'exporural' : 'overview';
  const mobileSecondaryPresets = presets.filter((preset) => ![mobileResetPreset, 'top'].includes(preset));

  useEffect(() => {
    if (!isCompactSearchOpen) return undefined;
    const frame = window.requestAnimationFrame(() => compactSearchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isCompactSearchOpen]);

  useEffect(() => {
    const compactViewport = window.matchMedia('(max-width: 720px), (max-width: 950px) and (max-height: 520px)');
    const syncSearchMode = () => {
      if (!compactViewport.matches) setIsCompactSearchOpen(false);
    };
    compactViewport.addEventListener('change', syncSearchMode);
    return () => compactViewport.removeEventListener('change', syncSearchMode);
  }, []);

  const closeCompactSearch = (clear = false) => {
    if (clear) setSearch('');
    setIsCompactSearchOpen(false);
    window.requestAnimationFrame(() => compactSearchTriggerRef.current?.focus());
  };

  return (
    <>
      {showDesktopControls && <div className="commercial-map-search">
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
      </div>}

      {showDesktopControls && <div className="commercial-map-toolbar commercial-map-toolbar--desktop" aria-label="Controles do mapa">
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
        {hasTreeLayer && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={treesVisible ? 'is-active' : ''}
                onClick={() => setTreesVisible(!treesVisible)}
                aria-label={treesVisible ? 'Ocultar árvores' : 'Exibir árvores'}
                aria-pressed={treesVisible}
              >
                <Trees className="h-4 w-4" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{treesVisible ? 'Ocultar árvores' : 'Exibir árvores'}</TooltipContent>
          </Tooltip>
        )}
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
      </div>}

      <div className="commercial-map-toolbar-mobile" aria-label="Controles principais do mapa">
        <button
          type="button"
          className={cameraPreset === mobileResetPreset ? 'is-active' : ''}
          onClick={() => requestCameraPreset(mobileResetPreset)}
          aria-label={CAMERA_PRESETS[mobileResetPreset].label}
        >
          <Map aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cameraPreset === 'top' ? 'is-active' : ''}
          onClick={() => requestCameraPreset('top')}
          aria-label={CAMERA_PRESETS.top.label}
        >
          <SquareStack aria-hidden="true" />
        </button>
        <button
          type="button"
          className="commercial-map-toolbar-focus-selection"
          onClick={focusSelection}
          disabled={!hasSelection}
          aria-label="Centralizar seleção"
        >
          <Maximize2 aria-hidden="true" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Mais controles do mapa" aria-haspopup="menu">
              <MoreHorizontal aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={8} className="commercial-map-toolbar-menu">
            {mobileSecondaryPresets.map((preset) => {
              const Icon = presetIcons[preset];
              return (
                <DropdownMenuItem key={`mobile:${preset}`} onSelect={() => requestCameraPreset(preset)}>
                  <Icon aria-hidden="true" />
                  <span>{CAMERA_PRESETS[preset].label}</span>
                  {cameraPreset === preset && <i aria-hidden="true" />}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="commercial-map-toolbar-menu-focus-selection"
              disabled={!hasSelection}
              onSelect={focusSelection}
            >
              <Maximize2 aria-hidden="true" />
              <span>Centralizar seleção</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setActivePanel(activePanel === 'layers' ? null : 'layers')}>
              <Layers3 aria-hidden="true" />
              <span>{activePanel === 'layers' ? 'Fechar camadas' : 'Camadas do mapa'}</span>
            </DropdownMenuItem>
            {canUseTechnicalValidation && (
              <DropdownMenuItem onSelect={() => setTechnicalValidationVisible(!technicalValidationVisible)}>
                <ScanSearch aria-hidden="true" />
                <span>{technicalValidationVisible ? 'Ocultar validação' : 'Validação técnica'}</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => setWorkspaceMode(workspaceMode === 'list' ? '3d' : 'list')}>
              <List aria-hidden="true" />
              <span>{workspaceMode === 'list' ? 'Voltar ao mapa 3D' : 'Lista acessível'}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isCommissionScope && (
        <>
          {!isCompactSearchOpen && (
            <button
              ref={compactSearchTriggerRef}
              type="button"
              className={`commercial-map-commission-search-trigger ${search ? 'has-query' : ''}`}
              onClick={() => setIsCompactSearchOpen(true)}
              aria-label={search ? 'Abrir busca do segmento, filtro ativo' : 'Buscar neste segmento comercial'}
              aria-expanded={isCompactSearchOpen}
              aria-controls="commercial-map-commission-search"
              data-commercial-map-commission-search-trigger
            >
              <Search aria-hidden="true" />
            </button>
          )}
          {isCompactSearchOpen && (
            <form
              id="commercial-map-commission-search"
              className="commercial-map-commission-search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                setActivePanel('results');
                closeCompactSearch(false);
              }}
            >
              <Search aria-hidden="true" />
              <input
                ref={compactSearchInputRef}
                data-commercial-map-search
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return;
                  event.preventDefault();
                  event.stopPropagation();
                  closeCompactSearch(true);
                }}
                placeholder={areaScope === 'exporural' ? 'Lote, quadra, rua ou estrutura Exporural' : 'ID, nome, quadra, lote, rua ou empresa'}
                aria-label={areaScope === 'exporural' ? 'Buscar somente na Exporural' : 'Buscar neste segmento comercial'}
                autoComplete="off"
              />
              <button type="button" onClick={() => closeCompactSearch(true)} aria-label="Fechar e limpar busca">
                <X aria-hidden="true" />
              </button>
            </form>
          )}
        </>
      )}

      <div className="commercial-map-actions">
        <Button variant="outline" size="sm" onClick={() => setActivePanel('results')}>
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
        </Button>
      </div>
    </>
  );
}
