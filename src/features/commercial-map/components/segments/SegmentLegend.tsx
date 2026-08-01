import { Focus, Layers3, RotateCcw } from 'lucide-react';
import {
  COMMERCIAL_MAP_SEGMENTS,
  commercialMapSegmentInventory,
  type CommercialMapSegmentId,
} from '../../data/commercialMapSegments';
import type { CommercialLot, MapEntity } from '../../types';

interface SegmentLegendProps {
  entities: readonly MapEntity[];
  lots: readonly CommercialLot[];
  activeSegmentId: CommercialMapSegmentId | null;
  onSelect: (segmentId: CommercialMapSegmentId) => void;
  onClear: () => void;
}

export function SegmentLegend({
  entities,
  lots,
  activeSegmentId,
  onSelect,
  onClear,
}: SegmentLegendProps) {
  const inventory = commercialMapSegmentInventory(entities, lots).filter(({ segment }) => (
    segment.behavior.visibleByDefault
    || segment.behavior.interaction !== 'informational'
  ));
  const activeSegment = COMMERCIAL_MAP_SEGMENTS.find((segment) => segment.id === activeSegmentId) ?? null;

  return (
    <section className="commercial-map-segment-legend" aria-label="Segmentos comerciais do parque">
      <div className="commercial-map-segment-legend-heading">
        <span><Layers3 aria-hidden="true" />Segmentos</span>
        <small>{activeSegment ? `${activeSegment.name} em foco` : 'Selecione para filtrar e aproximar'}</small>
      </div>

      <div className="commercial-map-segment-list" role="group" aria-label="Filtrar mapa por segmento">
        {inventory.map(({ segment, lotCount }) => {
          const active = segment.id === activeSegmentId;
          const interactive = segment.behavior.interaction === 'filter-and-focus';
          return (
            <button
              key={segment.id}
              type="button"
              className={active ? 'is-active' : ''}
              onClick={() => onSelect(segment.id)}
              disabled={!interactive}
              aria-pressed={active}
              aria-controls="commercial-map-viewport"
              aria-label={`${active ? 'Remover foco de' : interactive ? 'Focar' : 'Segmento'} ${segment.name}. ${lotCount} lotes.`}
              title={segment.description}
            >
              <i
                className="commercial-map-segment-swatch"
                style={{
                  background: `linear-gradient(145deg, ${segment.palette.accent}, ${segment.palette.surface})`,
                  borderColor: segment.palette.edge,
                  boxShadow: active ? `0 0 0 3px ${segment.palette.accent}45` : undefined,
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
      </div>

      {activeSegment && (
        <button
          type="button"
          className="commercial-map-segment-reset"
          onClick={onClear}
          aria-label="Mostrar todos os segmentos"
        >
          <RotateCcw aria-hidden="true" />
          <span>Todos</span>
        </button>
      )}
    </section>
  );
}
