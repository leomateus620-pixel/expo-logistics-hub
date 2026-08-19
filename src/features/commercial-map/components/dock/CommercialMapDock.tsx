import { Map as MapIcon, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type { CommercialLot } from '../../types';
import type { CommercialMapAreaScope } from '../../utils/areaScope';
import { CommercialSummary } from '../panels/MapPanels';
import './commercial-map-dock.css';

interface CommercialMapDockProps {
  lots: CommercialLot[];
  areaScope: CommercialMapAreaScope;
  segmentName?: string;
  isCommissionScope: boolean;
}

/** Left rail dedicated to reading the commercial summary of the active scope. */
export function CommercialMapDock({
  lots,
  areaScope,
  segmentName,
  isCommissionScope,
}: CommercialMapDockProps) {
  const expanded = useCommercialMapStore((state) => state.dockExpanded);
  const setExpanded = useCommercialMapStore((state) => state.setDockExpanded);
  const isExporural = areaScope === 'exporural';

  return (
    <aside
      className={`commercial-map-dock ${expanded ? 'is-expanded' : 'is-compact'}`}
      aria-label="Resumo comercial do mapa"
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
              aria-label={expanded ? 'Recolher resumo comercial' : 'Expandir resumo comercial'}
              aria-pressed={expanded}
            >
              {expanded ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
            </button>
          </TooltipTrigger>
          {!expanded && <TooltipContent side="right">Expandir resumo comercial</TooltipContent>}
        </Tooltip>
      </div>

      <div className="commercial-map-dock__scroll">
        <CommercialSummary
          lots={lots}
          scope={areaScope}
          segmentName={segmentName}
          variant="dock"
          compact={!expanded}
        />
      </div>
    </aside>
  );
}
