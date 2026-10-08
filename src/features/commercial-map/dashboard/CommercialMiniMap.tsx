import { memo, useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ArrowUpRight, Maximize, MapPinned } from 'lucide-react';
import { COMMERCIAL_PHASES, STATUS_CONFIG } from '../constants';
import { toCommercialPhase, type CommercialStatus } from '../types';
import { formatAreaSqmLabel, formatBrl } from '../utils/lotPricing2028';
import { resolveLotIdentity } from '../utils/lotIdentity';
import { getCommercialMiniMapGeometry, buildCommercialMiniMapViewBox, commercialMiniMapNumberLabel, type CommercialMiniMapItem, type MiniMapBounds, type MiniMapOutline } from './commercialDashboardGeometry';
import type { CommercialPavilionWayfindingMarkerKind } from '../utils/commercialPavilionWayfinding';

export type { CommercialMiniMapItem } from './commercialDashboardGeometry';
export interface DashboardAccessMarker {
  id: string;
  label: string;
  kind: CommercialPavilionWayfindingMarkerKind;
  position: readonly [number, number];
  outward: readonly [number, number];
}
export interface MiniMapPresentationMemory {
  zoom?: number;
  scrollLeft?: number;
  scrollTop?: number;
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
  contentEnvelope?: MiniMapBounds;
  numberLabelPixels?: number;
  presentationMemory?: MiniMapPresentationMemory;
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

/** Transient interaction changes only the affected SVG paths. */
const MiniMapLotPath = memo(function MiniMapLotPath({
  entityId, path, status, label, active, selected, keyboardStop, dimmed, index, onHover, onFocusLot, onToggle, onNavigate,
}: {
  entityId: string; path: string; status: CommercialStatus; label: string;
  active: boolean; selected: boolean; keyboardStop: boolean; dimmed: boolean; index: number;
  onHover: (id: string | null) => void; onFocusLot: (id: string) => void;
  onToggle: (id: string, selected: boolean) => void;
  onNavigate: (event: KeyboardEvent<SVGPathElement>, index: number) => void;
}) {
  const config = STATUS_CONFIG[displayStatus(status)];
  return <path d={path} fill={config.color} fillRule="evenodd" stroke={active ? '#172e20' : config.border}
    strokeWidth={active ? 3.5 : 1.3} vectorEffect="non-scaling-stroke" opacity={dimmed && !active ? 0.16 : 0.92}
    role="button" tabIndex={keyboardStop ? 0 : -1} aria-pressed={selected} aria-label={label}
    data-entity-id={entityId} data-status={status}
    onMouseEnter={() => onHover(entityId)} onMouseLeave={() => onHover(null)}
    onFocus={() => onFocusLot(entityId)} onBlur={() => onHover(null)}
    onClick={() => onToggle(entityId, selected)} onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); onToggle(entityId, selected);
      } else onNavigate(event, index);
    }} />;
});

/** SVG only. Shapes, identifiers, status and selection use the same query snapshot. */
export const CommercialMiniMap = memo(function CommercialMiniMap({
  items, title, highlightedStatus = null, onViewLot, className = '',
  outlines = EMPTY_OUTLINES, accesses = EMPTY_ACCESSES, numbered = false, hideStatusLegend = false, selection, contentEnvelope, numberLabelPixels = 11,
  presentationMemory,
}: CommercialMiniMapProps) {
  const selectId = useId();
  const geometry = useMemo(() => getCommercialMiniMapGeometry(items, outlines, contentEnvelope), [items, outlines, contentEnvelope]);
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string | null>>({});
  const selectedEntityId = selection ? selection.entityId : selections[title] ?? null;
  const onSelectionChange = selection?.onChange;
  const select = useCallback((id: string | null) => {
    if (onSelectionChange) onSelectionChange(id);
    else setSelections((current) => ({ ...current, [title]: id }));
  }, [onSelectionChange, title]);
  const [keyboardEntityId, setKeyboardEntityId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(presentationMemory?.zoom ?? 1);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const pendingRestore = useRef<{ zoom: number; scrollLeft: number; scrollTop: number } | null>(null);
  const fitToSpace = useCallback(() => {
    setZoom(1);
    if (viewportRef.current) {
      viewportRef.current.scrollLeft = 0;
      viewportRef.current.scrollTop = 0;
    }
  }, []);
  useLayoutEffect(() => {
    if (presentationMemory) {
      pendingRestore.current = { zoom: presentationMemory.zoom ?? 1,
        scrollLeft: presentationMemory.scrollLeft ?? 0, scrollTop: presentationMemory.scrollTop ?? 0 };
      setZoom(pendingRestore.current.zoom);
    } else fitToSpace();
    setHoveredEntityId(null);
    setKeyboardEntityId(null);
  }, [title, fitToSpace, presentationMemory]);
  useLayoutEffect(() => {
    const restore = pendingRestore.current;
    const viewport = viewportRef.current;
    // Apply scroll only once the matching zoom has reached the DOM. A scope
    // can reuse this component while its previous surface was still at 100%.
    if (!restore || zoom !== restore.zoom || !viewport) return;
    viewport.scrollLeft = restore.scrollLeft;
    viewport.scrollTop = restore.scrollTop;
    pendingRestore.current = null;
  }, [zoom, title, presentationMemory]);
  useLayoutEffect(() => {
    if (!presentationMemory || pendingRestore.current) return;
    presentationMemory.zoom = zoom;
    const viewport = viewportRef.current;
    return () => {
      if (viewport) {
        presentationMemory.scrollLeft = viewport.scrollLeft;
        presentationMemory.scrollTop = viewport.scrollTop;
      }
    };
  }, [presentationMemory, zoom]);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (typeof ResizeObserver === 'undefined') {
      const measure = () => {
        const { width, height } = viewport.getBoundingClientRect();
        setViewportSize({ width, height });
        fitToSpace();
      };
      measure();
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const initialRect = viewport.getBoundingClientRect();
    let previousWidth = initialRect.width;
    let previousHeight = initialRect.height;
    setViewportSize({ width: previousWidth, height: previousHeight });
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      // Border size stays stable when inspection zoom introduces scrollbars.
      const reportedBox = entry.borderBoxSize?.[0];
      const box = reportedBox && Number.isFinite(reportedBox.inlineSize) && Number.isFinite(reportedBox.blockSize) ? reportedBox : null;
      const rect = box ? null : viewport.getBoundingClientRect();
      const width = box?.inlineSize ?? (rect!.width || entry.contentRect.width);
      const height = box?.blockSize ?? (rect!.height || entry.contentRect.height);
      if (Math.abs(width - previousWidth) >= 2 || Math.abs(height - previousHeight) >= 2) {
        previousWidth = width;
        previousHeight = height;
        setViewportSize({ width, height });
        fitToSpace();
      }
    });
    observer.observe(viewport, { box: 'border-box' });
    return () => observer.disconnect();
  }, [fitToSpace]);
  const keyboardStopId = keyboardEntityId && geometry.lotsByEntityId.has(keyboardEntityId) ? keyboardEntityId : geometry.lots[0]?.entity.id;
  const itemsByEntityId = useMemo(() => {
    const index = new Map<string, CommercialMiniMapItem>();
    for (const item of items) if (!index.has(item.entity.id)) index.set(item.entity.id, item);
    return index;
  }, [items]);
  const activeLot = itemsByEntityId.get(selectedEntityId ?? '') ?? itemsByEntityId.get(hoveredEntityId ?? '') ?? null;
  const activeSelected = activeLot?.entity.id === selectedEntityId;
  const lotLabels = useMemo(() => new Map(items.map((item) => {
    const area = item.lot.officialAreaSqm != null && Number.isFinite(item.lot.officialAreaSqm) && item.lot.officialAreaSqm > 0
      ? formatAreaSqmLabel(item.lot.officialAreaSqm) : 'área oficial pendente';
    const name = identity(item);
    const statusLabel = STATUS_CONFIG[displayStatus(item.lot.status)].label;
    return [item.lot.id, { option: `${name} · ${statusLabel}`,
      accessible: `${name}, ${area}, ${statusLabel}${validValue(item.value) ? `, ${formatBrl(item.value)}, valor cadastral` : ''}` }];
  })), [items]);
  const options = useMemo(() => items.map((item) => <option key={item.lot.id} value={item.entity.id}>{lotLabels.get(item.lot.id)!.option}</option>), [items, lotLabels]);
  const focusLot = useCallback((id: string) => { setHoveredEntityId(id); setKeyboardEntityId(id); }, []);
  const toggleLot = useCallback((id: string, selected: boolean) => {
    setKeyboardEntityId(id); select(selected ? null : id);
  }, [select]);
  const lotCount = geometry.lots.length;
  const navigateLot = useCallback((event: KeyboardEvent<SVGPathElement>, index: number) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const paths = event.currentTarget.ownerSVGElement?.querySelectorAll<SVGPathElement>('path[data-entity-id]');
    const last = lotCount - 1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? last
      : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? Math.min(last, index + 1) : Math.max(0, index - 1);
    paths?.[next]?.focus();
  }, [lotCount]);
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
    const markers = accesses.map((marker) => {
      const [x, y] = geometry.project(marker.position);
      const horizontal = Math.abs(marker.outward[0]) > Math.abs(marker.outward[1]);
      // Keep the official access anchor. Short local leaders avoid letting an
      // unrelated far wall dictate the complete plant's fit.
      const directionLength = Math.hypot(...marker.outward) || 1;
      const iconX = x + marker.outward[0] / directionLength * 25;
      const iconY = y + marker.outward[1] / directionLength * 25;
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
  const blocks = useMemo(() => geometry.outlines.filter((outline) => outline.kind === 'block'), [geometry.outlines]);
  const supports = useMemo(() => geometry.outlines.filter((outline) => outline.kind === 'support'), [geometry.outlines]);
  const [, , viewBoxWidth, viewBoxHeight] = presentation.viewBox.split(' ').map(Number);
  const pixelsPerUnit = viewportSize.width > 0 && viewportSize.height > 0
    ? Math.min(viewportSize.width / viewBoxWidth, viewportSize.height / viewBoxHeight) * zoom : 1;
  const planStyle = { '--pavilion-content-aspect': viewBoxWidth / viewBoxHeight } as CSSProperties;
  const outlineLayer = useMemo(() => geometry.outlines.filter(({ kind }) => kind !== 'block').map((outline) => <path key={outline.id} d={outline.path}
    fill={outline.color} fillOpacity={outline.kind === 'support' ? '.12' : '.035'} fillRule="evenodd" stroke={outline.color} strokeWidth={outline.kind === 'support' ? '1.5' : '3'} vectorEffect="non-scaling-stroke"
    data-outline={outline.kind}><title>{outline.kind === 'segment' ? 'Contorno cadastral' : outline.kind === 'support' ? 'Apoio permanente' : 'Pavilhão'} · {outline.label}</title></path>), [geometry.outlines]);

  const decorationLayer = useMemo(() => <>
          {blocks.map((outline) => <path key={outline.id} d={outline.path} fill="none" stroke={outline.color} strokeDasharray="5 5"
            strokeWidth="1.5" vectorEffect="non-scaling-stroke" pointerEvents="none" data-outline="block" />)}
          {presentation.labels.map((outline) => {
            const [x, y] = outline.labelPoint;
            return <text key={outline.id} x={x} y={y - 9} textAnchor="middle" className="commercial-dashboard-block-label">{outline.label}</text>;
          })}
          {numbered && geometry.lots.map(({ lot, labelPoint, labelWidth, labelHeight }) => {
            if (!lot.lotNumber) return null;
            const { fontSize, vertical, fontPixels } = commercialMiniMapNumberLabel(lot.lotNumber, labelWidth, labelHeight, pixelsPerUnit, numberLabelPixels);
            return <text key={lot.id} x={labelPoint[0]} y={labelPoint[1]} textAnchor="middle" dominantBaseline="central"
              transform={vertical ? `rotate(-90 ${labelPoint[0]} ${labelPoint[1]})` : undefined}
              data-module-number={lot.lotNumber} data-label-font-px={fontPixels.toFixed(2)}
              style={{ fontSize, strokeWidth: Math.min(1.1, .7 / pixelsPerUnit) }} className="commercial-dashboard-module-number" aria-hidden="true">{lot.lotNumber}</text>;
          })}
          {supports.map((outline) => {
            const points = outline.coordinates[0].map(geometry.project);
            const width = Math.max(...points.map(([x]) => x)) - Math.min(...points.map(([x]) => x));
            const height = Math.max(...points.map(([, y]) => y)) - Math.min(...points.map(([, y]) => y));
            const x = (Math.min(...points.map(([px]) => px)) + Math.max(...points.map(([px]) => px))) / 2;
            let labelTop = Math.min(...points.map(([, py]) => py)) + 3;
            let labelBottom = Math.max(...points.map(([, py]) => py)) - 3;
            const left = Math.min(...points.map(([px]) => px)), right = Math.max(...points.map(([px]) => px));
            // Fit the support name into the free band inside its room, leaving
            // the official access anchor and symbol exactly where they are.
            for (const marker of presentation.markers) {
              if (marker.iconX + 14 < left || marker.iconX - 14 > right || marker.iconY + 14 < labelTop || marker.iconY - 14 > labelBottom) continue;
              if (labelBottom - marker.iconY - 18 > marker.iconY - 18 - labelTop) labelTop = marker.iconY + 18;
              else labelBottom = marker.iconY - 18;
            }
            const y = (labelTop + labelBottom) / 2;
            const lettersPerLine = Math.max(4, Math.floor((width * pixelsPerUnit - 6) / 5.6));
            const lines = outline.label.split(' ').reduce<string[]>((result, word) => {
              const last = result.length - 1;
              if (last >= 0 && `${result[last]} ${word}`.length <= lettersPerLine) result[last] += ` ${word}`;
              else result.push(word);
              return result;
            }, []);
            const fontSize = Math.max(.5, Math.min(10 / pixelsPerUnit, (width - 6) / (Math.max(...lines.map(line => line.length)) * .56),
              Math.min(height - 6, labelBottom - labelTop) / (lines.length * 1.25)));
            return <text key={outline.id} x={x} y={y - (lines.length - 1) * fontSize * .6} fontSize={fontSize} textAnchor="middle" dominantBaseline="central"
              className="commercial-dashboard-support-label" aria-hidden="true">
              {lines.map((line, index) => <tspan key={index} x={x} dy={index === 0 ? 0 : fontSize * 1.2}>{line}</tspan>)}
            </text>;
          })}
          {presentation.markers.map((marker) => {
            const { x, y, iconX, iconY } = marker;
            // Leaders retain official positions, even beside support wings.
            return <g key={marker.id} role="img" aria-label={`${ACCESS_LABEL[marker.kind]}: ${marker.label}`} data-access-kind={marker.kind}>
              <title>{ACCESS_LABEL[marker.kind]}: {marker.label}</title>
              <path d={`M ${x} ${y} L ${iconX} ${iconY}`} stroke="#315543" strokeWidth="1.5" fill="none" />
              <circle cx={x} cy={y} r="3" fill="#315543" />
              <rect x={iconX - 14} y={iconY - 14} width="28" height="28" rx="7" fill={marker.kind === 'emergency' ? '#9f2828' : '#214d37'} />
              <text x={iconX} y={iconY} fill="white" fontSize="22" textAnchor="middle" dominantBaseline="central">{ACCESS_SYMBOL[marker.kind]}</text>
            </g>;
          })}
  </>, [geometry, blocks, supports, presentation, numbered, pixelsPerUnit, numberLabelPixels]);

  return <section className={`commercial-dashboard-minimap ${className}`} style={planStyle} aria-label={`Mini mapa comercial: ${title}`}>
    <div className="commercial-dashboard-map-heading"><MapPinned aria-hidden="true" /><strong>{title}</strong>
      <span>{geometry.lots.length} {geometry.lots.length === 1 ? 'lote posicionado' : 'lotes posicionados'}</span></div>
    <div className="commercial-dashboard-map-tools">
      <label htmlFor={selectId}>Selecionar {numbered ? 'módulo' : 'lote'}</label>
      <select id={selectId} value={activeSelected ? selectedEntityId ?? '' : ''} onChange={(event) => select(event.target.value || null)}>
        <option value="">Escolha um espaço</option>
        {options}
      </select>
      <button type="button" className="commercial-dashboard-map-fit" aria-label={`Ajustar ao espaço: ${title}`} onClick={fitToSpace}><Maximize aria-hidden="true" />Ajustar ao espaço</button>
      <button type="button" aria-label={`Reduzir planta de ${title}`} disabled={zoom === 1} onClick={() => setZoom((value) => Math.max(1, value - 0.5))}>−</button>
      <button type="button" aria-label={`Ampliar planta de ${title}`} disabled={zoom === 3} onClick={() => setZoom((value) => Math.min(3, value + 0.5))}>+</button>
    </div>
    <div ref={viewportRef} className="commercial-dashboard-map-scroll" tabIndex={0} data-map-fit={zoom === 1} aria-label={`Planta de ${title}; use as setas para navegar pelos espaços`}>
      <div className="commercial-dashboard-map-surface" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
        {geometry.bounds ? <svg className="commercial-dashboard-map-svg" viewBox={presentation.viewBox} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" role="group"
          aria-label={`Distribuição espacial de ${geometry.lots.length} lotes em ${title}, coloridos pela situação comercial`}>
          {outlineLayer}
          {geometry.lots.map(({ entity, lot, path }, index) => <MiniMapLotPath key={lot.id}
            entityId={entity.id} path={path} status={lot.status} label={lotLabels.get(lot.id)!.accessible}
            active={activeLot?.entity.id === entity.id} selected={selectedEntityId === entity.id} keyboardStop={keyboardStopId === entity.id}
            dimmed={Boolean(highlightedStatus && displayStatus(highlightedStatus) !== displayStatus(lot.status))}
            index={index} onHover={setHoveredEntityId} onFocusLot={focusLot} onToggle={toggleLot} onNavigate={navigateLot} />)}
          {decorationLayer}
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
    {!!supports.length && <p className="commercial-dashboard-data-note commercial-dashboard-support-note">Apoios permanentes indicados na planta · não são espaços comerciais.</p>}
    {numbered && <p className="commercial-dashboard-data-note">Numeração do cadastro. Amplie para inspecionar ou use o seletor para consultar um módulo.</p>}
    {geometry.lots.length < items.length && <p className="commercial-dashboard-data-note">{items.length - geometry.lots.length} espaços sem geometria válida; incluídos nos indicadores e no seletor.</p>}
    <div className="commercial-dashboard-lot-detail" role="status" aria-live="polite">
      {activeLot ? <><strong>{identity(activeLot)}</strong>
         <span>{activeLot.lot.officialAreaSqm != null && Number.isFinite(activeLot.lot.officialAreaSqm) && activeLot.lot.officialAreaSqm > 0 ? formatAreaSqmLabel(activeLot.lot.officialAreaSqm) : 'Área oficial pendente'} · {STATUS_CONFIG[displayStatus(activeLot.lot.status)].label}</span>
        {validValue(activeLot.value) && <span>{formatBrl(activeLot.value)} · {activeLot.lot.status === 'SALE_OPEN' || activeLot.lot.status === 'SOLD' ? 'valor negociado gravado' : 'tabela oficial selecionada'}</span>}
        {activeSelected && <button type="button" onClick={() => onViewLot(activeLot.entity.id)}>Ver no mapa <ArrowUpRight aria-hidden="true" /></button>}
      </> : <span>Selecione um espaço na planta ou na lista para consultar seus dados.</span>}
    </div>
  </section>;
});
