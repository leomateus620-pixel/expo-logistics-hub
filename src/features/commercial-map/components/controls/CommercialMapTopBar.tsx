import {
  Box,
  Layers3,
  Maximize2,
  ScanSearch,
  Signpost,
  Sunrise,
  Tractor,
  Trees,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CAMERA_PRESETS } from '../../constants';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type { CameraPreset, MapPermissions } from '../../types';
import type { CommercialMapAreaScope } from '../../utils/areaScope';
import { canUseTechnicalValidationOverlay } from '../../utils/technicalValidation';
import { CommercialMapControlRail } from './CommercialMapControlRail';
import { SoyHarvestButton } from '../../harvest/SoyHarvestButton';
import {
  FenasojaFoldedMapIcon,
  FenasojaHydrologyIcon,
  FenasojaLayeredViewIcon,
  FenasojaMoonIcon,
  FenasojaRainIcon,
} from './FenasojaMapIcons';
import './commercial-map-topbar.css';

type ControlIcon = ComponentType<{ className?: string; strokeWidth?: number | string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

const PRESET_ICONS: Record<string, ControlIcon> = {
  overview: FenasojaFoldedMapIcon,
  exporural: Tractor,
  top: FenasojaLayeredViewIcon,
  isometric: Box,
  'quadra-r': Signpost,
  'quadra-s': Signpost,
};

interface CommercialMapTopBarProps {
  areaScope: CommercialMapAreaScope;
  permissions: MapPermissions;
  hasSelection: boolean;
  isCommissionScope: boolean;
  soyHarvestAvailable?: boolean;
}

/** Floating rail with the visualization controls of the 3D canvas. */
export function CommercialMapTopBar({
  areaScope,
  permissions,
  hasSelection,
  isCommissionScope,
  soyHarvestAvailable = false,
}: CommercialMapTopBarProps) {
  const activePanel = useCommercialMapStore((state) => state.activePanel);
  const setActivePanel = useCommercialMapStore((state) => state.setActivePanel);
  const requestCameraPreset = useCommercialMapStore((state) => state.requestCameraPreset);
  const cameraPreset = useCommercialMapStore((state) => state.cameraPreset);
  const focusSelection = useCommercialMapStore((state) => state.focusSelection);
  const treesVisible = useCommercialMapStore((state) => state.treesVisible);
  const setTreesVisible = useCommercialMapStore((state) => state.setTreesVisible);
  const hydrologicalModeActive = useCommercialMapStore((state) => state.hydrologicalModeActive);
  const toggleHydrologicalMode = useCommercialMapStore((state) => state.toggleHydrologicalMode);
  const sunrisePhase = useCommercialMapStore((state) => state.sunrisePhase);
  const requestSunrise = useCommercialMapStore((state) => state.requestSunrise);
  const nightModeActive = useCommercialMapStore((state) => state.nightModeActive);
  const toggleNightMode = useCommercialMapStore((state) => state.toggleNightMode);
  const rainModeActive = useCommercialMapStore((state) => state.rainModeActive);
  const toggleRainMode = useCommercialMapStore((state) => state.toggleRainMode);
  const technicalValidationVisible = useCommercialMapStore((state) => state.technicalValidationVisible);
  const setTechnicalValidationVisible = useCommercialMapStore((state) => state.setTechnicalValidationVisible);

  const isExporural = areaScope === 'exporural';
  const canUseTechnicalValidation = !isCommissionScope
    && canUseTechnicalValidationOverlay(areaScope, permissions);
  const presets: CameraPreset[] = isExporural
    ? ['exporural', 'top', 'isometric', 'quadra-r', 'quadra-s']
    : ['overview', 'top', 'isometric'];

  const renderAction = (
    key: string,
    Icon: ControlIcon,
    label: string,
    onClick: () => void,
    options: { active?: boolean; disabled?: boolean; hydrological?: boolean; night?: boolean; rain?: boolean } = {},
  ) => (
    <Tooltip key={key}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={`commercial-map-topbar__trigger ${options.active ? 'is-open' : ''} ${options.hydrological ? 'is-hydrological' : ''} ${options.night ? 'is-night' : ''} ${options.rain ? 'is-rain' : ''}`}
          onClick={onClick}
          disabled={options.disabled}
          aria-label={label}
          aria-pressed={options.active}
          data-commercial-map-control={key}
        >
          <Icon strokeWidth={1.8} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <CommercialMapControlRail
      className="commercial-map-topbar"
      label="Visualização do mapa comercial"
      nightModeActive={nightModeActive}
    >
      {presets.map((preset) => renderAction(
        preset,
        PRESET_ICONS[preset] ?? FenasojaFoldedMapIcon,
        CAMERA_PRESETS[preset].label,
        () => requestCameraPreset(preset),
        { active: cameraPreset === preset },
      ))}

      <span className="commercial-map-topbar__divider" aria-hidden="true" />

      {soyHarvestAvailable && <SoyHarvestButton className="commercial-map-topbar__trigger"/>}

      {renderAction('focus', Maximize2, 'Centralizar seleção', focusSelection, { disabled: !hasSelection })}

      {renderAction(
        'hydrological-network',
        FenasojaHydrologyIcon,
        hydrologicalModeActive ? 'Sair do modo Rede Hidrológica' : 'Ativar modo Rede Hidrológica',
        toggleHydrologicalMode,
        { active: hydrologicalModeActive, hydrological: true },
      )}

      {renderAction(
        'sunrise',
        Sunrise,
        sunrisePhase === 'running'
          ? 'Reiniciar Amanhecer'
          : sunrisePhase === 'complete'
            ? 'Rever Amanhecer'
            : 'Amanhecer',
        requestSunrise,
        { active: sunrisePhase === 'running' },
      )}

      {renderAction(
        'night-mode',
        FenasojaMoonIcon,
        nightModeActive ? 'Sair do Modo Noturno' : 'Ativar Modo Noturno',
        toggleNightMode,
        { active: nightModeActive, night: true },
      )}

      {renderAction(
        'rain-mode',
        FenasojaRainIcon,
        rainModeActive ? 'Desativar chuva' : 'Ativar chuva',
        toggleRainMode,
        { active: rainModeActive, rain: true },
      )}

      {renderAction(
        'layers',
        Layers3,
        'Camadas do mapa',
        () => setActivePanel(activePanel === 'layers' ? null : 'layers'),
        { active: activePanel === 'layers' },
      )}

      <span className="commercial-map-topbar__divider" aria-hidden="true" />

      {renderAction(
        'environment',
        Trees,
        treesVisible ? 'Ocultar árvores e rede elétrica' : 'Exibir árvores e rede elétrica',
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
    </CommercialMapControlRail>
  );
}
