import { useMemo, useState } from 'react';
import { ArrowUpRight, MapPinned } from 'lucide-react';
import { STATUS_CONFIG } from '../constants';
import type { CommercialStatus } from '../types';
import { formatAreaSqmLabel, formatBrl, formatPricePerSqm } from '../utils/lotPricing2028';
import { resolveLotIdentity } from '../utils/lotIdentity';
import {
  buildCommercialMiniMapGeometry,
  type CommercialMiniMapItem,
} from './commercialDashboardGeometry';

export type { CommercialMiniMapItem } from './commercialDashboardGeometry';

export interface CommercialMiniMapProps {
  /** Supply only the records in this overview or canonical segment snapshot. */
  items: readonly CommercialMiniMapItem[];
  title: string;
  highlightedStatus?: CommercialStatus | null;
  onViewLot: (entityId: string) => void;
  className?: string;
}

const STATUS_ORDER: readonly CommercialStatus[] = [
  'SOLD', 'AVAILABLE', 'RESERVED', 'IN_NEGOTIATION', 'BLOCKED', 'UNAVAILABLE',
];

/** A lightweight SVG projection of the same cadastral lots already loaded by the 3D map. */
export function CommercialMiniMap({
  items,
  title,
  highlightedStatus = null,
  onViewLot,
  className = '',
}: CommercialMiniMapProps) {
  const geometry = useMemo(() => buildCommercialMiniMapGeometry(items), [items]);
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [keyboardEntityId, setKeyboardEntityId] = useState<string | null>(null);
  const keyboardStopId = keyboardEntityId && geometry.lotsByEntityId.has(keyboardEntityId)
    ? keyboardEntityId : geometry.lots[0]?.entity.id;
  const activeLot = geometry.lotsByEntityId.get(selectedEntityId ?? '')
    ?? geometry.lotsByEntityId.get(hoveredEntityId ?? '')
    ?? null;
  const activeSelected = activeLot?.entity.id === selectedEntityId;
  const statusCounts = useMemo(() => {
    const counts = new Map<CommercialStatus, number>();
    for (const { lot } of geometry.lots) counts.set(lot.status, (counts.get(lot.status) ?? 0) + 1);
    return counts;
  }, [geometry]);

  return (
    <section className={`min-w-0 ${className}`} aria-label={`Mini mapa comercial: ${title}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[0.72rem] font-semibold text-[color:var(--map-ink)]">
          <MapPinned className="h-4 w-4 text-[color:var(--map-forest)]" aria-hidden="true" />
          <span>{title}</span>
        </div>
        <span className="text-[0.65rem] text-[color:var(--map-muted)]">
          {geometry.lots.length} {geometry.lots.length === 1 ? 'lote posicionado' : 'lotes posicionados'}
        </span>
      </div>

      <div className="relative aspect-[5/3] min-h-48 w-full overflow-hidden rounded-xl border border-[color:rgba(32,77,51,0.08)] bg-[#f4f7f3]">
        {geometry.lots.length > 0 ? (
          <svg
            className="block h-full w-full"
            viewBox={geometry.viewBox}
            preserveAspectRatio="xMidYMid meet"
            role="group"
            aria-label={`Distribuição espacial de ${geometry.lots.length} lotes em ${title}, coloridos pela situação comercial`}
          >
            {geometry.lots.map(({ entity, lot, value, path }, index) => {
              const config = STATUS_CONFIG[lot.status];
              const isActive = activeLot?.entity.id === entity.id;
              const isDimmed = highlightedStatus !== null && highlightedStatus !== lot.status && !isActive;
              const identifier = resolveLotIdentity(lot, entity).full;
              const area = lot.officialAreaSqm != null && Number.isFinite(lot.officialAreaSqm) && lot.officialAreaSqm > 0
                ? formatAreaSqmLabel(lot.officialAreaSqm) : 'área oficial pendente';
              const price = value != null && Number.isFinite(value) ? formatBrl(value) : null;
              return (
                <path
                  key={entity.id}
                  d={path}
                  fill={config.color}
                  fillRule="evenodd"
                  stroke={isActive ? '#172e20' : config.border}
                  strokeWidth={isActive ? 3.5 : 1.3}
                  vectorEffect="non-scaling-stroke"
                  opacity={isDimmed ? 0.16 : 0.92}
                  style={{ cursor: 'pointer', transition: 'opacity 160ms ease' }}
                  role="button"
                  tabIndex={keyboardStopId === entity.id ? 0 : -1}
                  aria-pressed={selectedEntityId === entity.id}
                  aria-label={`${identifier}, ${area}, ${config.label}, ${price ?? 'valor não definido'}`}
                  data-entity-id={entity.id}
                  data-status={lot.status}
                  onMouseEnter={() => setHoveredEntityId(entity.id)}
                  onMouseLeave={() => setHoveredEntityId((current) => current === entity.id ? null : current)}
                  onFocus={() => {
                    setHoveredEntityId(entity.id);
                    setKeyboardEntityId(entity.id);
                  }}
                  onBlur={() => setHoveredEntityId((current) => current === entity.id ? null : current)}
                  onClick={() => {
                    setKeyboardEntityId(entity.id);
                    setSelectedEntityId((current) => current === entity.id ? null : entity.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedEntityId((current) => current === entity.id ? null : entity.id);
                    } else if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                      event.preventDefault();
                      const paths = event.currentTarget.ownerSVGElement?.querySelectorAll<SVGPathElement>('path[data-entity-id]');
                      const last = geometry.lots.length - 1;
                      const nextIndex = event.key === 'Home' ? 0
                        : event.key === 'End' ? last
                          : event.key === 'ArrowRight' || event.key === 'ArrowDown'
                            ? Math.min(last, index + 1) : Math.max(0, index - 1);
                      paths?.[nextIndex]?.focus();
                    }
                  }}
                />
              );
            })}
          </svg>
        ) : (
          <p className="grid h-full place-items-center px-6 text-center text-xs text-[color:var(--map-muted)]">
            {items.length === 0
              ? 'Nenhum espaço comercial cadastrado neste segmento.'
              : 'Nenhum lote com geometria cadastral válida neste recorte.'}
          </p>
        )}

        {activeLot && (
          <div
            className={`absolute bottom-3 right-3 w-[min(15rem,calc(100%-1.5rem))] rounded-xl border border-[#dce7dc] bg-white/95 p-3 text-left shadow-[0_8px_24px_rgba(24,50,30,0.12)] backdrop-blur-sm ${activeSelected ? '' : 'pointer-events-none'}`}
            role="status"
            aria-live="polite"
          >
            <strong className="block truncate text-sm font-bold text-[color:var(--map-ink)]">
              {resolveLotIdentity(activeLot.lot, activeLot.entity).full}
            </strong>
            <span className="mt-1 block text-xs text-[color:var(--map-muted)]">
              {activeLot.lot.officialAreaSqm != null
                && Number.isFinite(activeLot.lot.officialAreaSqm)
                && activeLot.lot.officialAreaSqm > 0
                ? formatAreaSqmLabel(activeLot.lot.officialAreaSqm)
                : 'Área oficial pendente'}
            </span>
            <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[color:var(--map-ink)]">
              <i
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: STATUS_CONFIG[activeLot.lot.status].color }}
                aria-hidden="true"
              />
              {STATUS_CONFIG[activeLot.lot.status].label}
            </span>
            {activeLot.lot.pricingMode === 'PRICE_PER_SQUARE_METER'
              && activeLot.lot.pricePerSqm != null
              && Number.isFinite(activeLot.lot.pricePerSqm) && (
                <span className="mt-1 block text-[0.7rem] text-[color:var(--map-muted)]">
                  {formatPricePerSqm(activeLot.lot.pricePerSqm)}
                </span>
              )}
            <span className="mt-1 block text-xs font-bold text-[color:var(--map-ink)]">
              {activeLot.value != null && Number.isFinite(activeLot.value)
                ? formatBrl(activeLot.value) : 'Valor não definido'}
            </span>
            {activeSelected && (
              <button
                type="button"
                className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg bg-[color:var(--map-forest)] px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--map-forest)]"
                onClick={() => onViewLot(activeLot.entity.id)}
              >
                Ver no mapa <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {geometry.lots.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5" aria-label="Legenda das situações comerciais">
          {STATUS_ORDER.filter((status) => statusCounts.has(status)).map((status) => (
            <span key={status} className="inline-flex items-center gap-1.5 text-[0.65rem] text-[color:var(--map-muted)]">
              <i className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_CONFIG[status].color }} aria-hidden="true" />
              {STATUS_CONFIG[status].shortLabel} {statusCounts.get(status)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
