import {
  Box,
  Compass,
  Grid2x2,
  Layers3,
  Maximize2,
  ScanSearch,
  Signpost,
  Tractor,
  Trees,
  type LucideIcon,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CAMERA_PRESETS } from '../../constants';
import { COMMERCIAL_MAP_SEGMENT_IDS } from '../../data/commercialMapSegments';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type { CameraPreset, MapPermissions } from '../../types';
import type { CommercialMapAreaScope } from '../../utils/areaScope';
import { canUseTechnicalValidationOverlay } from '../../utils/technicalValidation';
import './commercial-map-topbar.css';

const PRESET_ICONS: Record<string, LucideIcon> = {
  overview: Compass,
  exporural: Tractor,
  top: Grid2x2,
  isometric: Box,
  'quadra-r': Signpost,
  'quadra-s': Signpost,
};

interface CommercialMapTopBarProps {
  areaScope: CommercialMapAreaScope;
  permissions: MapPermissions;
  hasSelection: boolean;
  isCommissionScope: boolean;
}

/** Floating rail with the visualization controls of the 3D canvas. */
export function CommercialMapTopBar({
  areaScope,
  permissions,
  hasSelection,
  isCommissionScope,
}: CommercialMapTopBarProps) {
  const activePanel = useCommercialMapStore((state) => state.activePanel);
  const setActivePanel = useCommercialMapStore((state) => state.setActivePanel);
  const requestCameraPreset = useCommercialMapStore((state) => state.requestCameraPreset);
  const cameraPreset = useCommercialMapStore((state) => state.cameraPreset);
  const focusSelection = useCommercialMapStore((state) => state.focusSelection);
  const treesVisible = useCommercialMapStore((state) => state.treesVisible);
  const setTreesVisible = useCommercialMapStore((state) => state.setTreesVisible);
  const technicalValidationVisible = useCommercialMapStore((state) => state.technicalValidationVisible);
  const setTechnicalValidationVisible = useCommercialMapStore((state) => state.setTechnicalValidationVisible);

  const isExporural = areaScope === 'exporural';
  const canUseTechnicalValidation = !isCommissionScope
    && canUseTechnicalValidationOverlay(areaScope, permissions);
  const hasTreeLayer = areaScope === 'park' || areaScope === COMMERCIAL_MAP_SEGMENT_IDS.industry;
  const presets: CameraPreset[] = isExporural
    ? ['exporural', 'top', 'isometric', 'quadra-r', 'quadra-s']
    : ['overview', 'top', 'isometric'];

  const renderAction = (
    key: string,
    Icon: LucideIcon,
    label: string,
    onClick: () => void,
    options: { active?: boolean; disabled?: boolean } = {},
  ) => (
    <Tooltip key={key}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={`commercial-map-topbar__trigger ${options.active ? 'is-open' : ''}`}
          onClick={onClick}
          disabled={options.disabled}
          aria-label={label}
          aria-pressed={options.active}
        >
          <Icon aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <div className="commercial-map-topbar" aria-label="Visualização do mapa comercial">
      {presets.map((preset) => renderAction(
        preset,
        PRESET_ICONS[preset] ?? Compass,
        CAMERA_PRESETS[preset].label,
        () => requestCameraPreset(preset),
        { active: cameraPreset === preset },
      ))}

      <span className="commercial-map-topbar__divider" aria-hidden="true" />

      {renderAction('focus', Maximize2, 'Centralizar seleção', focusSelection, { disabled: !hasSelection })}

      {renderAction(
        'layers',
        Layers3,
        'Camadas do mapa',
        () => setActivePanel(activePanel === 'layers' ? null : 'layers'),
        { active: activePanel === 'layers' },
      )}

      {hasTreeLayer && renderAction(
        'trees',
        Trees,
        treesVisible ? 'Ocultar árvores' : 'Exibir árvores',
        () => setTreesVisible(!treesVisible),
        { active: treesVisible },
      )}

      {canUseTechnicalValidation && renderAction(
        'validation',
        ScanSearch,
        technicalValidationVisible ? 'Ocultar validação técnica' : 'Validação técnica',
        () => setTechnicalValidationVisible(!technicalValidationVisible),
        { active: technicalValidationVisible },
      )}
    </div>
  );
}
