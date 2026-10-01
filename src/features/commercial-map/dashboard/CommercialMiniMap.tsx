import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Maximize, MapPinned } from 'lucide-react';
import { COMMERCIAL_PHASES, STATUS_CONFIG } from '../constants';
import { toCommercialPhase, type CommercialStatus } from '../types';
import { formatAreaSqmLabel, formatBrl } from '../utils/lotPricing2028';
import { resolveLotIdentity } from '../utils/lotIdentity';
import { buildCommercialMiniMapGeometry, buildCommercialMiniMapViewBox, type CommercialMiniMapItem, type MiniMapBounds, type MiniMapOutline } from './commercialDashboardGeometry';
import type { CommercialPavilionWayfindingMarkerKind } from '../utils/commercialPavilionWayfinding';

export type { CommercialMiniMapItem } from './commercialDashboardGeometry';
export interface DashboardAccessMarker {
  id: string;
  label: string;
  kind: CommercialPavilionWayfindingMarkerKind;
  position: readonly [number, number];
  outward: readonly [number, number];
}
export interface CommercialMiniMapProps {
  items: readonly CommercialMiniMapItem[];
  title: string;
  highlightedStatus?: CommercialStatus | null;
  onViewLot: (entityId: string) => void;
  className?: string;
  outlines?: readonly MiniMapOutline[];
  accesses?: readonly DashboardAccessMarker[];
  numbered?: boolean;
  hideStatusLegend?: boolean;
  selection?: { entityId: string | null; onChange: (id: string | null) => void };
}
const EMPTY_OUTLINES: readonly MiniMapOutline[] = [];
const EMPTY_ACCESSES: readonly DashboardAccessMarker[] = [];
const ACCESS_SYMBOL = { entrance: '↘', exit: '↗', bidirectional: '↔', emergency: '⚠', connection: '⇄' };
const ACCESS_LABEL = { entrance: 'Entrada', exit: 'Saída', bidirectional: 'Entrada e saída', emergency: 'Saída de emergência', connection: 'Conexão entre pavilhões' };
function identity(item: CommercialMiniMapItem) {
  const resolved = resolveLotIdentity(item.lot, item.entity, item.pavilion, item.areaName);
  return resolved.location || !item.blockCode ? resolved.full : [resolved.title, `Quadra ${item.blockCode}`, resolved.area].filter(Boolean).join(' · ');
}
function displayStatus(status: CommercialStatus): CommercialStatus {
  return status === 'UNAVAILABLE' ? status : toCommercialPhase(status);
}
function validValue(value: number | null): value is number {
  return value != null && Number.isFinite(value) && value >= 0;
}

/** SVG only. Shapes, identifiers, status and selection use the same query snapshot. */
export function CommercialMiniMap({
  items, title, highlightedStatus = null, onViewLot, className = '',
  outlines = EMPTY_OUTLINES, accesses = EMPTY_ACCESSES, numbered = false, hideStatusLegend = false, selection,
}: CommercialMiniMapProps) {
  const selectId = useId();
  const geometry = useMemo(() => buildCommercialMiniMapGeometry(items, outlines), [items, outlines]);
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string | null>>({});
  const selectedEntityId = selection ? selection.entityId : selections[title] ?? null;
  const select = selection?.onChange ?? ((id: string | null) => setSelections((current) => ({ ...current, [title]: id })));
  const [keyboardEntityId, setKeyboardEntityId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fitToSpace = useCallback(() => {
    setZoom(1);
    if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0;
      viewportRef.current.scrollTop = 0;
    }
  }, []);
  useLayoutEffect(() => {
    fitToSpace();
    setHoveredEntityId(null);
    setKeyboardEntityId(null);
  }, [title, fitToSpace]);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', fitToSpace);
      return () => window.removeEventListener('resize', fitToSpace);
    }
    const initialRect = viewport.getBoundingClientRect();
    let previousWidth = initialRect.width;
    let previousHeight = initialRect.height;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      // Border size stays stable when inspection zoom introduces scrollbars.
      const rect = viewport.getBoundingClientRect();
      const width = entry.borderBoxSize?.[0]?.inlineSize ?? (rect.width || entry.contentRect.width);
      const height = entry.borderBoxSize?.[0]?.blockSize ?? (rect.height || entry.contentRect.height);
      if (width !== previousWidth || height !== previousHeight) {
        previousWidth = width;
        previousHeight = height;
        fitToSpace();
      }
    });
    observer.observe(viewport, { box: 'border-box' });
    return () => observer.disconnect();
  }, [fitToSpace]);
  const keyboardStopId = keyboardEntityId && geometry.lotsByEntityId.has(keyboardEntityId) ? keyboardEntityId : geometry.lots[0]?.entity.id;
  const activeLot = items.find(({ entity }) => entity.id === selectedEntityId)
    ?? items.find(({ entity }) => entity.id === hoveredEntityId) ?? null;
  const activeSelected = activeLot?.entity.id === selectedEntityId;
  const statusCounts = useMemo(() => {
    const counts = new Map<CommercialStatus, number>();
    for (const { lot } of items) {
      const phase = displayStatus(lot.status);
      counts.set(phase, (counts.get(phase) ?? 0) + 1);
    }
    return counts;
  }, [items]);
  const presentation = useMemo(() => {
    const decorations: MiniMapBounds[] = [];
    const labels: typeof geometry.outlines = [];
    for (const outline of geometry.outlines.filter(({ kind }) => kind === 'block')) {
      const [x, y] = outline.labelPoint;
      if (labels.some(({ labelPoint: [otherX, otherY] }) => Math.abs(otherX - x) < 120 && Math.abs(otherY - y) < 27)) continue;
      labels.push(outline);
      const halfWidth = outline.label.length * 8;
      decorations.push({ minX: x - halfWidth - 4, maxX: x + halfWidth + 4, minY: y - 33, maxY: y - 1 });
    }
    const pavilion = geometry.outlines.find((outline) => outline.kind === 'pavilion');
    const projected = (pavilion?.coordinates[0] ?? []).map(geometry.project);
    const markers = accesses.map((marker) => {
      const [x, y] = geometry.project(marker.position);
      const horizontal = Math.abs(marker.outward[0]) > Math.abs(marker.outward[1]);
      const iconX = horizontal && projected.length ? (marker.outward[0] > 0 ? Math.max(...projected.map(([px]) => px)) + 25 : Math.min(...projected.map(([px]) => px)) - 25) : x;
      const iconY = !horizontal && projected.length ? (marker.outward[1] > 0 ? Math.max(...projected.map(([, py]) => py)) + 25 : Math.min(...projected.map(([, py]) => py)) - 25) : y;
      return { ...marker, x, y, iconX, iconY, horizontal };
    });
    const placed: Array<readonly [number, number]> = [];
    for (const marker of markers) {
      while (placed.some(([px, py]) => Math.abs(px - marker.iconX) < 30 && Math.abs(py - marker.iconY) < 30)) {
        if (marker.horizontal) marker.iconY += 32; else marker.iconX += 32;
      }
      placed.push([marker.iconX, marker.iconY]);
      decorations.push({ minX: Math.min(marker.x - 3, marker.iconX - 14), maxX: Math.max(marker.x + 3, marker.iconX + 14),
        minY: Math.min(marker.y - 3, marker.iconY - 14), maxY: Math.max(marker.y + 3, marker.iconY + 14) });
    }
    return { labels, markers, viewBox: buildCommercialMiniMapViewBox(geometry, decorations) };
  }, [geometry, accesses]);
  const blocks = geometry.outlines.filter((outline) => outline.kind === 'block');

  return <section className={`commercial-dashboard-minimap ${className}`} aria-label={`Mini mapa comercial: ${title}`}>
    <div className="commercial-dashboard-map-heading"><MapPinned aria-hidden="true" /><strong>{title}</strong>
      <span>{geometry.lots.length} {geometry.lots.length === 1 ? 'lote posicionado' : 'lotes posicionados'}</span></div>
    <div className="commercial-dashboard-map-tools">
      <label htmlFor={selectId}>Selecionar {numbered ? 'módulo' : 'lote'}</label>
      <select id={selectId} value={activeSelected ? selectedEntityId ?? '' : ''} onChange={(event) => select(event.target.value || null)}>
        <option value="">Escolha um espaço</option>
        {items.map((item) => <option key={item.lot.id} value={item.entity.id}>{identity(item)} · {STATUS_CONFIG[displayStatus(item.lot.status)].label}</option>)}
      </select>
      <button type="button" className="commercial-dashboard-map-fit" aria-label={`Ajustar ao espaço: ${title}`} onClick={fitToSpace}><Maximize aria-hidden="true" />Ajustar ao espaço</button>
      <button type="button" aria-label={`Reduzir planta de ${title}`} disabled={zoom === 1} onClick={() => setZoom((value) => Math.max(1, value - 0.5))}>−</button>
      <button type="button" aria-label={`Ampliar planta de ${title}`} disabled={zoom === 3} onClick={() => setZoom((value) => Math.min(3, value + 0.5))}>+</button>
    </div>
    <div ref={viewportRef} className="commercial-dashboard-map-scroll" tabIndex={0} data-map-fit={zoom === 1} aria-label={`Planta de ${title}; use as setas para navegar pelos espaços`}>
      <div className="commercial-dashboard-map-surface" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
        {geometry.bounds ? <svg className="commercial-dashboard-map-svg" viewBox={presentation.viewBox} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" role="group"
          aria-label={`Distribuição espacial de ${geometry.lots.length} lotes em ${title}, coloridos pela situação comercial`}>
          {geometry.outlines.filter(({ kind }) => kind !== 'block').map((outline) => <path key={outline.id} d={outline.path}
            fill={outline.color} fillOpacity=".035" fillRule="evenodd" stroke={outline.color} strokeWidth="3" vectorEffect="non-scaling-stroke"
            data-outline={outline.kind}><title>{outline.kind === 'segment' ? 'Contorno cadastral' : 'Pavilhão'} · {outline.label}</title></path>)}
          {geometry.lots.map((item, index) => {
            const { entity, lot, value, path } = item;
            const config = STATUS_CONFIG[displayStatus(lot.status)];
            const isActive = activeLot?.entity.id === entity.id;
            const area = lot.officialAreaSqm != null && Number.isFinite(lot.officialAreaSqm) && lot.officialAreaSqm > 0 ? formatAreaSqmLabel(lot.officialAreaSqm) : 'área oficial pendente';
            return <path key={lot.id} d={path} fill={config.color} fillRule="evenodd" stroke={isActive ? '#172e20' : config.border}
              strokeWidth={isActive ? 3.5 : 1.3} vectorEffect="non-scaling-stroke"
              opacity={highlightedStatus && displayStatus(highlightedStatus) !== displayStatus(lot.status) && !isActive ? 0.16 : 0.92}
              role="button" tabIndex={keyboardStopId === entity.id ? 0 : -1} aria-pressed={selectedEntityId === entity.id}
              aria-label={`${identity(item)}, ${area}, ${config.label}${validValue(value) ? `, ${formatBrl(value)}, valor cadastral` : ''}`}
              data-entity-id={entity.id} data-status={lot.status}
              onMouseEnter={() => setHoveredEntityId(entity.id)} onMouseLeave={() => setHoveredEntityId(null)}
              onFocus={() => { setHoveredEntityId(entity.id); setKeyboardEntityId(entity.id); }}
              onBlur={() => setHoveredEntityId(null)}
              onClick={() => { setKeyboardEntityId(entity.id); select(selectedEntityId === entity.id ? null : entity.id); }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault(); select(selectedEntityId === entity.id ? null : entity.id);
                } else if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                  event.preventDefault();
                  const paths = event.currentTarget.ownerSVGElement?.querySelectorAll<SVGPathElement>('path[data-entity-id]');
                  const last = geometry.lots.length - 1;
                  const next = event.key === 'Home' ? 0 : event.key === 'End' ? last
                    : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? Math.min(last, index + 1) : Math.max(0, index - 1);
                  paths?.[next]?.focus();
                }
              }} />;
          })}
          {blocks.map((outline) => <path key={outline.id} d={outline.path} fill="none" stroke={outline.color} strokeDasharray="5 5"
            strokeWidth="1.5" vectorEffect="non-scaling-stroke" pointerEvents="none" data-outline="block" />)}
          {presentation.labels.map((outline) => {
            const [x, y] = outline.labelPoint;
            return <text key={outline.id} x={x} y={y - 9} textAnchor="middle" className="commercial-dashboard-block-label">{outline.label}</text>;
          })}
          {numbered && geometry.lots.map(({ lot, labelPoint, labelWidth, labelHeight }) => {
            if (!lot.lotNumber) return null;
            const vertical = labelWidth < lot.lotNumber.length * 9 + 6 && labelHeight > labelWidth * 1.2;
            const along = vertical ? labelHeight : labelWidth;
            const across = vertical ? labelWidth : labelHeight;
            const fontSize = Math.max(1, Math.min(14, (along - 4) / (lot.lotNumber.length * 0.67), across - 4));
            return <text key={lot.id} x={labelPoint[0]} y={labelPoint[1]} textAnchor="middle" dominantBaseline="central"
              transform={vertical ? `rotate(-90 ${labelPoint[0]} ${labelPoint[1]})` : undefined}
              style={{ fontSize }} className="commercial-dashboard-module-number" aria-hidden="true">{lot.lotNumber}</text>;
          })}
          {presentation.markers.map((marker) => {
            const { x, y, iconX, iconY } = marker;
            // Leaders retain official positions; icons stay outside the pavilion.
            return <g key={marker.id} role="img" aria-label={`${ACCESS_LABEL[marker.kind]}: ${marker.label}`} data-access-kind={marker.kind}>
              <title>{ACCESS_LABEL[marker.kind]}: {marker.label}</title>
              <path d={`M ${x} ${y} L ${iconX} ${iconY}`} stroke="#315543" strokeWidth="1.5" fill="none" />
              <circle cx={x} cy={y} r="3" fill="#315543" />
              <rect x={iconX - 14} y={iconY - 14} width="28" height="28" rx="7" fill={marker.kind === 'emergency' ? '#9f2828' : '#214d37'} />
              <text x={iconX} y={iconY} fill="white" fontSize="22" textAnchor="middle" dominantBaseline="central">{ACCESS_SYMBOL[marker.kind]}</text>
            </g>;
          })}
        </svg> : <p className="commercial-dashboard-empty">Nenhuma geometria cadastral válida neste recorte.</p>}
      </div>
    </div>
    {!hideStatusLegend && <div className="commercial-dashboard-map-legend" aria-label="Legenda das situações comerciais">
       {[...COMMERCIAL_PHASES, 'UNAVAILABLE' as const].filter((status) => statusCounts.has(status)).map((status) => <span key={status}>
        <i style={{ backgroundColor: STATUS_CONFIG[status].color }} />{STATUS_CONFIG[status].label} {statusCounts.get(status)}
      </span>)}
      {outlines.some(({ kind }) => kind === 'segment') && <span>━ Contorno cadastral da área</span>}
      {!!blocks.length && <span>┄ Limite de quadra</span>}
    </div>}
    {!!accesses.length && <div className="commercial-dashboard-map-legend" aria-label="Legenda dos acessos">
      {[...new Set(accesses.map(({ kind }) => kind))].map((kind) => <span key={kind}>{ACCESS_SYMBOL[kind]} {ACCESS_LABEL[kind]}</span>)}
    </div>}
    {numbered && <p className="commercial-dashboard-data-note">Numeração do cadastro. Amplie para inspecionar ou use o seletor para consultar um módulo.</p>}
    {geometry.lots.length < items.length && <p className="commercial-dashboard-data-note">{items.length - geometry.lots.length} espaços sem geometria válida; incluídos nos indicadores e no seletor.</p>}
    <div className="commercial-dashboard-lot-detail" role="status" aria-live="polite">
      {activeLot ? <><strong>{identity(activeLot)}</strong>
         <span>{activeLot.lot.officialAreaSqm != null && Number.isFinite(activeLot.lot.officialAreaSqm) && activeLot.lot.officialAreaSqm > 0 ? formatAreaSqmLabel(activeLot.lot.officialAreaSqm) : 'Área oficial pendente'} · {STATUS_CONFIG[displayStatus(activeLot.lot.status)].label}</span>
        {validValue(activeLot.value) && <span>{formatBrl(activeLot.value)} · valor cadastral</span>}
        {activeSelected && <button type="button" onClick={() => onViewLot(activeLot.entity.id)}>Ver no mapa <ArrowUpRight aria-hidden="true" /></button>}
      </> : <span>Selecione um espaço na planta ou na lista para consultar seus dados.</span>}
    </div>
  </section>;
}
