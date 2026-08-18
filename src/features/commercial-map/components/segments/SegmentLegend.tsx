import { useEffect, useState } from 'react';
import { Check, ChevronUp, Focus, Layers3, RotateCcw, X } from 'lucide-react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
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
  variant?: 'full' | 'mobile';
}

export function SegmentLegend({
  entities,
  lots,
  activeSegmentId,
  onSelect,
  onClear,
  variant = 'full',
}: SegmentLegendProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const inventory = commercialMapSegmentInventory(entities, lots).filter(({ segment }) => (
    segment.behavior.visibleByDefault
    || segment.behavior.interaction !== 'informational'
  ));
  const activeSegment = COMMERCIAL_MAP_SEGMENTS.find((segment) => segment.id === activeSegmentId) ?? null;

  useEffect(() => {
    const compactViewport = window.matchMedia('(max-width: 720px), (max-width: 950px) and (max-height: 520px)');
    const syncDrawerMode = () => {
      if (!compactViewport.matches) setMobileOpen(false);
    };
    compactViewport.addEventListener('change', syncDrawerMode);
    return () => compactViewport.removeEventListener('change', syncDrawerMode);
  }, []);

  return (
    <>
      {variant === 'full' && <section className="commercial-map-segment-legend" aria-label="Segmentos comerciais do parque">
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
      </section>}

      <Drawer open={mobileOpen} onOpenChange={setMobileOpen} shouldScaleBackground={false}>
        <DrawerTrigger asChild>
          <button
            type="button"
            className={`commercial-map-segment-mobile-trigger ${activeSegment ? 'is-active' : ''}`}
            aria-label={activeSegment ? `Segmentos. ${activeSegment.name} em foco` : 'Abrir segmentos comerciais'}
          >
            <Layers3 aria-hidden="true" />
            <span>
              <strong>Segmentos</strong>
              <small>{activeSegment?.name ?? 'Todos'}</small>
            </span>
            <ChevronUp aria-hidden="true" />
          </button>
        </DrawerTrigger>
        <DrawerContent className="commercial-map-segment-drawer" aria-describedby="commercial-map-segment-drawer-description">
          <DrawerHeader className="commercial-map-segment-drawer-header">
            <div>
              <DrawerTitle>Segmentos comerciais</DrawerTitle>
              <DrawerDescription id="commercial-map-segment-drawer-description">
                Filtre e aproxime o mapa sem perder a navegação espacial.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <button type="button" aria-label="Fechar segmentos"><X aria-hidden="true" /></button>
            </DrawerClose>
          </DrawerHeader>
          <div className="commercial-map-segment-drawer-list" role="group" aria-label="Escolher segmento comercial">
            <button
              type="button"
              className={!activeSegment ? 'is-active' : ''}
              onClick={() => {
                onClear();
                setMobileOpen(false);
              }}
              aria-pressed={!activeSegment}
            >
              <i className="commercial-map-segment-all"><Layers3 aria-hidden="true" /></i>
              <span><strong>Todos os segmentos</strong><small>{lots.length} lotes no parque</small></span>
              {!activeSegment && <Check aria-hidden="true" />}
            </button>
            {inventory.map(({ segment, lotCount }) => {
              const active = segment.id === activeSegmentId;
              const interactive = segment.behavior.interaction === 'filter-and-focus';
              return (
                <button
                  key={`mobile:${segment.id}`}
                  type="button"
                  className={active ? 'is-active' : ''}
                  disabled={!interactive}
                  onClick={() => {
                    onSelect(segment.id);
                    setMobileOpen(false);
                  }}
                  aria-pressed={active}
                  aria-label={`${active ? 'Remover foco de' : interactive ? 'Focar' : 'Segmento'} ${segment.name}. ${lotCount} lotes.`}
                >
                  <i
                    className="commercial-map-segment-swatch"
                    style={{ background: segment.palette.accent, borderColor: segment.palette.edge }}
                    aria-hidden="true"
                  />
                  <span><strong>{segment.name}</strong><small>{lotCount} lotes</small></span>
                  {active && <Check aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
