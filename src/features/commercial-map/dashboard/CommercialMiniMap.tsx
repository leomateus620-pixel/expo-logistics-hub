import { memo, useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from 'react';
import { ArrowUpRight, Maximize, MapPinned } from 'lucide-react';
import { COMMERCIAL_PHASES, STATUS_CONFIG } from '../constants';
import { toCommercialPhase, type CommercialStatus } from '../types';
import { formatAreaSqmLabel, formatBrl } from '../utils/lotPricing2028';
import { resolveLotIdentity } from '../utils/lotIdentity';
import { getCommercialMiniMapGeometry, buildCommercialMiniMapViewBox, commercialMiniMapNumberLabel, type CommercialMiniMapItem, type MiniMapBounds, type MiniMapOutline } from './commercialDashboardGeometry';
import type { CommercialPavilionWayfindingMarkerKind } from '../utils/commercialPavilionWayfinding';
import { CommercialDashboardLotContextCard } from './CommercialDashboardLotContextCard';
import './commercial-dashboard-pavilion-inspection.css';
import { PavilionAnnotations } from './PavilionAnnotations';
import type { PavilionAnnotationLayout } from './pavilionAnnotationLayout';
import { projectPavilionAccessMarkers } from './pavilionAccessGeometry';

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
  /** Pavilion inspection is opt-in; external maps keep their established presentation. */
  presentation?: 'default' | 'pavilion';
  presentationMemory?: MiniMapPresentationMemory;
  annotationLayout?: PavilionAnnotationLayout;
  selectedCompanyId?: string | null;
  onSelectCompany?: (id: string, scopeId?: string) => void;
  contractEntityIds?: ReadonlySet<string>;
  companyEntityIds?: ReadonlySet<string>;
  commercialFilter?: 'all' | 'SOLD' | 'SALE_OPEN';
  showAnnotationConnections?: boolean;
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

function InspectionFrame({ enabled, frameRef, onMouseLeave, children }: { enabled: boolean; frameRef: RefObject<HTMLDivElement>; onMouseLeave: () => void; children: ReactNode }) {
  return enabled ? <div className="commercial-dashboard-pavilion-frame" ref={frameRef} onMouseLeave={onMouseLeave}>{children}</div> : <>{children}</>;
}

interface ContextPosition { left: number; top: number; anchorX?: number; anchorY?: number; placement: 'left' | 'right' | 'above' | 'below'; visible: boolean }

/** Transient interaction changes only the affected SVG paths. */
const MiniMapLotPath = memo(function MiniMapLotPath({
  entityId, path, status, label, active, selected, keyboardStop, dimmed, describedBy, index, companyMember, contractMember, lightStroke,
  onEnter, onLeave, onFocusLot, onBlurLot, onActivate, onNavigate,
}: {
  entityId: string; path: string; status: CommercialStatus; label: string;
  companyMember?: boolean; contractMember?: boolean; lightStroke?: boolean;
  active: boolean; selected: boolean; keyboardStop: boolean; dimmed: boolean; describedBy?: string; index: number;
  onEnter: (id: string, event: ReactMouseEvent<SVGPathElement>) => void;
  onLeave: () => void; onFocusLot: (id: string, origin: SVGPathElement) => void; onBlurLot: () => void;
  onActivate: (id: string, origin: SVGPathElement, selected: boolean) => void;
  onNavigate: (event: ReactKeyboardEvent<SVGPathElement>, index: number) => void;
}) {
  const config = STATUS_CONFIG[displayStatus(status)];
  const lineWidth = lightStroke ? (contractMember ? 1.5 : active ? 1.2 : .6) : (active ? 3.5 : 1.3);
  const opacity = dimmed && !active && !companyMember ? (lightStroke ? .4 : .16) : .92;
  return <path d={path} fill={config.color} fillRule="evenodd" stroke={contractMember ? '#9a652c' : active ? '#172e20' : config.border}
    strokeWidth={lineWidth} strokeDasharray={contractMember ? '3 2' : undefined} vectorEffect="non-scaling-stroke" opacity={opacity}
    role="button" tabIndex={keyboardStop ? 0 : -1} aria-pressed={selected} aria-label={label} aria-describedby={describedBy}
    data-entity-id={entityId} data-status={status} data-company-selected={companyMember || undefined} data-contract-selected={contractMember || undefined}
    onMouseEnter={(event) => onEnter(entityId, event)} onMouseLeave={onLeave}
    onFocus={(event) => onFocusLot(entityId, event.currentTarget)} onBlur={onBlurLot}
    onClick={(event) => onActivate(entityId, event.currentTarget, selected)} onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); onActivate(entityId, event.currentTarget, selected);
      } else onNavigate(event, index);
    }} />;
});

/** SVG only. Shapes, identifiers, status and selection use the same query snapshot. */
export const CommercialMiniMap = memo(function CommercialMiniMap({
  items, title, highlightedStatus = null, onViewLot, className = '',
  outlines = EMPTY_OUTLINES, accesses = EMPTY_ACCESSES, numbered = false, hideStatusLegend = false, selection, contentEnvelope, numberLabelPixels = 11,
  presentation: variant = 'default', presentationMemory,
  annotationLayout, selectedCompanyId = null, contractEntityIds, onSelectCompany, companyEntityIds, commercialFilter = 'all', showAnnotationConnections = true,
}: CommercialMiniMapProps) {
  const pavilionPresentation = variant === 'pavilion';
  const selectId = useId();
  const contextCardId = useId();
  const geometry = useMemo(() => getCommercialMiniMapGeometry(items, outlines, contentEnvelope), [items, outlines, contentEnvelope]);
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null);
  const [focusedEntityId, setFocusedEntityId] = useState<string | null>(null);
  const [dismissedEntityId, setDismissedEntityId] = useState<string | null>(null);
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
  const frameRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const contextRef = useRef<HTMLDivElement>(null);
  const contextOriginRef = useRef<HTMLElement | SVGElement | null>(null);
  const suppressNextFocusRef = useRef<string | null>(null);
  const pointerPreviewBlockedRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [pointerDismissal, setPointerDismissal] = useState(0);
  const [revealRevision, setRevealRevision] = useState(0);
  const [contextPosition, setContextPosition] = useState<ContextPosition | null>(null);
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
    setFocusedEntityId(null);
    setDismissedEntityId(null);
    setKeyboardEntityId(null);
    pointerPreviewBlockedRef.current = false;
    lastPointerRef.current = null;
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
  const contextEntityId = pavilionPresentation ? hoveredEntityId ?? focusedEntityId
    ?? (selectedEntityId !== dismissedEntityId ? selectedEntityId : null) : null;
  const contextRecord = contextEntityId ? itemsByEntityId.get(contextEntityId) ?? null : null;
  const contextLot = contextEntityId ? geometry.lotsByEntityId.get(contextEntityId) ?? null : null;
  const contextMode = contextEntityId === selectedEntityId && contextEntityId !== dismissedEntityId ? 'selected' : 'preview';
  const revealPavilionLot = useCallback((id: string) => {
    const target = geometry.lotsByEntityId.get(id);
    const viewport = viewportRef.current;
    const path = target && Array.from(svgRef.current?.querySelectorAll<SVGPathElement>('path[data-entity-id]') ?? [])
      .find((element) => element.dataset.entityId === id);
    const planLayout = viewport?.closest<HTMLElement>('.pavilion-plan-layout');
    if (planLayout && planLayout.scrollTop > 0) planLayout.scrollTop = 0;
    const matrix = path && typeof path.getScreenCTM === 'function' ? path.getScreenCTM() : null;
    if (target && viewport && matrix && path) {
      const bounds = viewport.getBoundingClientRect();
      const container = viewport.closest('.pavilion-plan-layout')?.getBoundingClientRect();
      // On a stacked mobile layout the outer panel can clip part of the map.
      const left = Math.max(bounds.left + viewport.clientLeft, container?.left ?? bounds.left);
      const top = Math.max(bounds.top + viewport.clientTop, container?.top ?? bounds.top);
      const width = Math.min(bounds.left + (viewport.clientWidth || bounds.width), container?.right ?? bounds.right) - left;
      const height = Math.min(bounds.top + (viewport.clientHeight || bounds.height), container?.bottom ?? bounds.bottom) - top;
      const [x, y] = target.labelPoint;
      const screenX = matrix.a * x + matrix.c * y + matrix.e;
      const screenY = matrix.b * x + matrix.d * y + matrix.f;
      let dx = screenX < left + 12 || screenX > left + width - 12 ? screenX - left - width / 2 : 0;
      let dy = screenY < top + 12 || screenY > top + height - 12 ? screenY - top - height / 2 : 0;
      // Keep the nearest selected annotation alongside its lot when both fit.
      // Distant clusters remain navigable without forcing a smaller zoom.
      const labels = Array.from(svgRef.current?.querySelectorAll<SVGGraphicsElement>('.pavilion-annotation-label[aria-pressed="true"]') ?? [])
        .map(label => label.getBoundingClientRect()).filter(rect => rect.width > 0)
        .sort((a, b) => Math.hypot(a.x + a.width / 2 - screenX, a.y + a.height / 2 - screenY)
          - Math.hypot(b.x + b.width / 2 - screenX, b.y + b.height / 2 - screenY));
      if (labels[0]) {
        const lotBox = path.getBoundingClientRect(), labelBox = labels[0];
        const minX = Math.min(lotBox.left, labelBox.left), maxX = Math.max(lotBox.right, labelBox.right);
        const minY = Math.min(lotBox.top, labelBox.top), maxY = Math.max(lotBox.bottom, labelBox.bottom);
        if (maxX - minX <= width - 24) dx = minX < left + 12 ? minX - left - 12 : maxX > left + width - 12 ? maxX - left - width + 12 : 0;
        if (maxY - minY <= height - 24) dy = minY < top + 12 ? minY - top - 12 : maxY > top + height - 12 ? maxY - top - height + 12 : 0;
      }
      viewport.scrollLeft += dx;
      viewport.scrollTop += dy;
      setRevealRevision((value) => value + 1);
    }
  }, [geometry.lotsByEntityId]);
  const choosePavilionLot = useCallback((id: string | null, origin: HTMLElement | SVGElement, reveal = false) => {
    contextOriginRef.current = origin;
    pointerPreviewBlockedRef.current = false;
    setDismissedEntityId(null);
    setHoveredEntityId(null);
    setFocusedEntityId(null);
    select(id);
    if (id && reveal) revealPavilionLot(id);
  }, [select, revealPavilionLot]);
  useLayoutEffect(() => {
    if (!pavilionPresentation) return;
    const id = selectedEntityId ?? companyEntityIds?.values().next().value;
    if (id) revealPavilionLot(id);
  }, [pavilionPresentation, selectedEntityId, companyEntityIds, revealPavilionLot, zoom]);
  const closeContext = useCallback((restoreOrigin = true) => {
    // Removing the card can expose a path directly beneath the stationary
    // pointer and synthesize mouseenter. Wait for real movement or an explicit
    // focus/click before allowing a new preview.
    pointerPreviewBlockedRef.current = true;
    setPointerDismissal((value) => value + 1);
    setDismissedEntityId(selectedEntityId ?? contextEntityId);
    setHoveredEntityId(null);
    setFocusedEntityId(null);
    const origin = contextOriginRef.current;
    if (origin?.isConnected && (restoreOrigin || contextRef.current?.contains(document.activeElement))) {
      suppressNextFocusRef.current = document.activeElement !== origin ? origin.getAttribute('data-entity-id') : null;
      origin.focus({ preventScroll: true });
    }
  }, [selectedEntityId, contextEntityId]);
  useLayoutEffect(() => {
    if (!pavilionPresentation || !pointerDismissal || !pointerPreviewBlockedRef.current) return;
    const point = lastPointerRef.current;
    const resume = (event: MouseEvent) => {
      if (!pointerPreviewBlockedRef.current) { document.removeEventListener('mousemove', resume); return; }
      if (point && point.x === event.clientX && point.y === event.clientY) return;
      pointerPreviewBlockedRef.current = false;
      document.removeEventListener('mousemove', resume);
      const path = event.target instanceof Element ? event.target.closest<SVGPathElement>('path[data-entity-id]') : null;
      if (path && frameRef.current?.contains(path)) setHoveredEntityId(path.dataset.entityId ?? null);
    };
    document.addEventListener('mousemove', resume);
    return () => document.removeEventListener('mousemove', resume);
  }, [pavilionPresentation, pointerDismissal]);
  const enterLot = useCallback((id: string, event: ReactMouseEvent<SVGPathElement>) => {
    if (pavilionPresentation && pointerPreviewBlockedRef.current) return;
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    setHoveredEntityId(id);
  }, [pavilionPresentation]);
  const leaveLot = useCallback(() => { if (!pavilionPresentation) setHoveredEntityId(null); }, [pavilionPresentation]);
  const focusLot = useCallback((id: string, origin: SVGPathElement) => {
    setKeyboardEntityId(id);
    if (!pavilionPresentation) { setHoveredEntityId(id); return; }
    setHoveredEntityId(null);
    contextOriginRef.current = origin;
    if (suppressNextFocusRef.current === id) { suppressNextFocusRef.current = null; return; }
    pointerPreviewBlockedRef.current = false;
    setFocusedEntityId(id);
  }, [pavilionPresentation]);
  const blurLot = useCallback(() => {
    if (pavilionPresentation) setFocusedEntityId(null); else setHoveredEntityId(null);
  }, [pavilionPresentation]);
  const activateLot = useCallback((id: string, origin: SVGPathElement, selected: boolean) => {
    setKeyboardEntityId(id);
    if (pavilionPresentation) choosePavilionLot(id, origin);
    else select(selected ? null : id);
  }, [pavilionPresentation, choosePavilionLot, select]);
  const lotCount = geometry.lots.length;
  const navigateLot = useCallback((event: ReactKeyboardEvent<SVGPathElement>, index: number) => {
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
    if (annotationLayout?.annotations.some(a => a.label)) {
      const [x, y, width, height] = annotationLayout.viewBox.split(' ').map(Number);
      decorations.push({ minX: x, minY: y, maxX: x + width, maxY: y + height });
    }
    const labels: typeof geometry.outlines = [];
    for (const outline of geometry.outlines.filter(({ kind }) => kind === 'block')) {
      const [x, y] = outline.labelPoint;
      if (labels.some(({ labelPoint: [otherX, otherY] }) => Math.abs(otherX - x) < 120 && Math.abs(otherY - y) < 27)) continue;
      labels.push(outline);
      const halfWidth = outline.label.length * 8;
      decorations.push({ minX: x - halfWidth - 4, maxX: x + halfWidth + 4, minY: y - 33, maxY: y - 1 });
    }
    const markers = projectPavilionAccessMarkers(geometry, accesses);
    decorations.push(...markers.map(marker => marker.bounds));
    return { labels, markers, viewBox: buildCommercialMiniMapViewBox(geometry, decorations) };
  }, [geometry, accesses, annotationLayout]);
  const blocks = geometry.outlines.filter((outline) => outline.kind === 'block');
  const supports = geometry.outlines.filter((outline) => outline.kind === 'support');
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

  useLayoutEffect(() => {
    if (!pavilionPresentation || !contextRecord) { setContextPosition(null); return; }
    const frame = frameRef.current, viewport = viewportRef.current, card = contextRef.current, svg = svgRef.current;
    if (!frame || !viewport || !card) return;
    const path = Array.from(svg?.querySelectorAll<SVGPathElement>('path[data-entity-id]') ?? [])
      .find((element) => element.dataset.entityId === contextRecord.entity.id);
    const measure = () => {
      const matrix = typeof path?.getScreenCTM === 'function' ? path.getScreenCTM() : svg?.getScreenCTM?.();
      const frameRect = frame.getBoundingClientRect(), viewportRect = viewport.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const width = frame.clientWidth || frameRect.width, height = frame.clientHeight || frameRect.height;
      if (!contextLot && width > 0 && height > 0) {
        // A selected record without a valid polygon remains inspectable. This
        // corner is a UI fallback, never an inferred location for the lot.
        setContextPosition((current) => current?.visible && current.anchorX == null && current.anchorY == null
          ? current : { left: 8, top: 8, placement: 'below', visible: true });
        return;
      }
      if (!matrix || width <= 0 || height <= 0 || cardRect.width <= 0 || cardRect.height <= 0) { setContextPosition(null); return; }
      if (!contextLot) return;
      const [x, y] = contextLot.labelPoint;
      const screenX = matrix.a * x + matrix.c * y + matrix.e;
      const screenY = matrix.b * x + matrix.d * y + matrix.f;
      const anchorX = screenX - frameRect.left, anchorY = screenY - frameRect.top;
      const viewportLeft = viewportRect.left + viewport.clientLeft, viewportTop = viewportRect.top + viewport.clientTop;
      const visible = screenX >= viewportLeft && screenX <= viewportLeft + (viewport.clientWidth || viewportRect.width)
        && screenY >= viewportTop && screenY <= viewportTop + (viewport.clientHeight || viewportRect.height);
      const gap = 12, inset = 8;
      const above = anchorY - gap - cardRect.height;
      const below = anchorY + gap;
      const right = anchorX + gap, leftSide = anchorX - gap - cardRect.width;
      const placement = right + cardRect.width <= width - inset ? 'right' : leftSide >= inset ? 'left'
        : above >= inset ? 'above' : below + cardRect.height <= height - inset ? 'below'
        : anchorY > height / 2 ? 'above' : 'below';
      const sidePlacement = placement === 'left' || placement === 'right';
      const left = Math.max(inset, Math.min(placement === 'right' ? right : placement === 'left' ? leftSide : anchorX - cardRect.width / 2, width - cardRect.width - inset));
      const top = Math.max(inset, Math.min(sidePlacement ? anchorY - cardRect.height / 2 : placement === 'above' ? above : below, height - cardRect.height - inset));
      setContextPosition((current) => current && current.visible === visible && current.placement === placement
        && Math.abs(current.left - left) < .25 && Math.abs(current.top - top) < .25
        && current.anchorX != null && current.anchorY != null
        && Math.abs(current.anchorX - anchorX) < .25 && Math.abs(current.anchorY - anchorY) < .25
        ? current : { left, top, anchorX, anchorY, placement, visible });
    };
    measure();
    viewport.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(frame);
    observer?.observe(card);
    return () => { viewport.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); observer?.disconnect(); };
  }, [pavilionPresentation, contextRecord, contextLot, contextMode, zoom, viewportSize.width, viewportSize.height, presentation.viewBox, revealRevision]);

  useLayoutEffect(() => {
    if (!pavilionPresentation || !contextRecord || !contextPosition?.visible) return;
    // A pointer preview may open while focus remains outside the plan. It
    // still owns the first Escape, without intercepting another nested popup.
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      const target = event.target instanceof Element ? event.target : document.activeElement;
      const nested = target?.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-commercial-map-escape-priority="true"]');
      if (nested && !nested.contains(frameRef.current) && !contextRef.current?.contains(target)) return;
      event.preventDefault(); event.stopPropagation(); closeContext(false);
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [pavilionPresentation, contextRecord, contextPosition?.visible, closeContext]);

  const tools = <div className="commercial-dashboard-map-tools">
    <label htmlFor={selectId}>Selecionar {numbered ? 'módulo' : 'lote'}</label>
    <select id={selectId} value={pavilionPresentation ? selectedEntityId ?? '' : activeSelected ? selectedEntityId ?? '' : ''}
      onChange={(event) => pavilionPresentation ? choosePavilionLot(event.target.value || null, event.currentTarget, true) : select(event.target.value || null)}>
      <option value="">Escolha um espaço</option>
      {options}
    </select>
    <button type="button" className="commercial-dashboard-map-fit" aria-label={`Ajustar ao espaço: ${title}`} onClick={fitToSpace}><Maximize aria-hidden="true" />Ajustar ao espaço</button>
    <button type="button" aria-label={`Reduzir planta de ${title}`} disabled={zoom === 1} onClick={() => setZoom((value) => Math.max(1, value - 0.5))}>−</button>
    <button type="button" aria-label={`Ampliar planta de ${title}`} disabled={zoom === 3} onClick={() => setZoom((value) => Math.min(3, value + 0.5))}>+</button>
  </div>;

  return <section className={`commercial-dashboard-minimap${pavilionPresentation ? ' commercial-dashboard-minimap--pavilion' : ''} ${className}`}
    style={planStyle} aria-label={`Mini mapa comercial: ${title}`} onKeyDownCapture={pavilionPresentation ? (event) => {
      if (event.key !== 'Escape' || !contextRecord) return;
      event.preventDefault(); event.stopPropagation(); closeContext(false);
    } : undefined}>
    {!pavilionPresentation && <div className="commercial-dashboard-map-heading"><MapPinned aria-hidden="true" /><strong>{title}</strong>
      <span>{geometry.lots.length} {geometry.lots.length === 1 ? 'lote posicionado' : 'lotes posicionados'}</span></div>}
    {!pavilionPresentation && tools}
    <InspectionFrame enabled={pavilionPresentation} frameRef={frameRef} onMouseLeave={() => setHoveredEntityId(null)}>
    <div ref={viewportRef} className="commercial-dashboard-map-scroll" tabIndex={0} data-map-fit={zoom === 1} aria-label={`Planta de ${title}; use as setas para navegar pelos espaços`}>
      <div className="commercial-dashboard-map-surface" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}>
        {geometry.bounds ? <svg ref={svgRef} className="commercial-dashboard-map-svg" viewBox={presentation.viewBox} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" role="group"
          aria-label={`Distribuição espacial de ${geometry.lots.length} lotes em ${title}, coloridos pela situação comercial`}>
          {outlineLayer}
          {geometry.lots.map(({ entity, lot, path }, index) => <MiniMapLotPath key={lot.id}
            entityId={entity.id} path={path} status={lot.status} label={lotLabels.get(lot.id)!.accessible}
            active={pavilionPresentation ? selectedEntityId === entity.id || contextEntityId === entity.id : activeLot?.entity.id === entity.id}
            companyMember={companyEntityIds?.has(entity.id)} contractMember={contractEntityIds?.has(entity.id)} lightStroke={pavilionPresentation}
            selected={selectedEntityId === entity.id} keyboardStop={keyboardStopId === entity.id}
            describedBy={pavilionPresentation && contextLot?.entity.id === entity.id && contextPosition?.visible ? contextCardId : undefined}
            dimmed={Boolean((highlightedStatus && displayStatus(highlightedStatus) !== displayStatus(lot.status))
              || (commercialFilter !== 'all' && lot.status !== commercialFilter)
              || (companyEntityIds?.size && !companyEntityIds.has(entity.id)))}
            index={index} onEnter={enterLot} onLeave={leaveLot} onFocusLot={focusLot} onBlurLot={blurLot} onActivate={activateLot} onNavigate={navigateLot} />)}
          {decorationLayer}
          {annotationLayout && onSelectCompany && <PavilionAnnotations layout={annotationLayout} selectedId={selectedCompanyId}
            connections={showAnnotationConnections} onSelect={onSelectCompany} />}
        </svg> : <p className="commercial-dashboard-empty">Nenhuma geometria cadastral válida neste recorte.</p>}
      </div>
    </div>
    {pavilionPresentation && contextRecord && <div ref={contextRef} id={contextCardId} className="commercial-dashboard-pavilion-context-anchor"
      role={contextMode === 'preview' ? 'tooltip' : undefined}
      data-mode={contextMode} data-lot-id={contextRecord.lot.id} data-placement={contextPosition?.placement}
      data-anchor-kind={contextLot ? 'lot' : 'unpositioned'}
      data-anchor-x={contextPosition?.anchorX} data-anchor-y={contextPosition?.anchorY}
      data-commercial-map-escape-priority={contextPosition?.visible ? 'true' : undefined}
      aria-hidden={!contextPosition?.visible} style={{ left: contextPosition?.left ?? 0, top: contextPosition?.top ?? 0, visibility: contextPosition?.visible ? 'visible' : 'hidden' }}
      onMouseEnter={(event) => {
        lastPointerRef.current = { x: event.clientX, y: event.clientY };
        if (contextMode === 'preview') setHoveredEntityId(contextRecord.entity.id);
      }}
      onMouseLeave={() => { if (contextMode === 'preview') setHoveredEntityId(null); }}
      onPointerDown={(event) => {
        lastPointerRef.current = { x: event.clientX, y: event.clientY };
        event.stopPropagation();
      }} onClick={(event) => event.stopPropagation()}>
      <CommercialDashboardLotContextCard item={contextRecord} mode={contextMode} positionUnavailable={!contextLot} onClose={() => closeContext()} onViewLot={onViewLot} />
    </div>}
    </InspectionFrame>
    {pavilionPresentation && tools}
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
    {numbered && !pavilionPresentation && <p className="commercial-dashboard-data-note">Numeração do cadastro. Amplie para inspecionar ou use o seletor para consultar um módulo.</p>}
    {geometry.lots.length < items.length && <p className="commercial-dashboard-data-note">{items.length - geometry.lots.length} espaços sem geometria válida; incluídos nos indicadores e no seletor.</p>}
    {!pavilionPresentation && <div className="commercial-dashboard-lot-detail" role="status" aria-live="polite">
      {activeLot ? <><strong>{identity(activeLot)}</strong>
         <span>{activeLot.lot.officialAreaSqm != null && Number.isFinite(activeLot.lot.officialAreaSqm) && activeLot.lot.officialAreaSqm > 0 ? formatAreaSqmLabel(activeLot.lot.officialAreaSqm) : 'Área oficial pendente'} · {STATUS_CONFIG[displayStatus(activeLot.lot.status)].label}</span>
        {validValue(activeLot.value) && <span>{formatBrl(activeLot.value)} · {activeLot.lot.status === 'SALE_OPEN' || activeLot.lot.status === 'SOLD' ? 'valor negociado gravado' : 'tabela oficial selecionada'}</span>}
        {activeSelected && <button type="button" onClick={() => onViewLot(activeLot.entity.id)}>Ver no mapa <ArrowUpRight aria-hidden="true" /></button>}
      </> : <span>Selecione um espaço na planta ou na lista para consultar seus dados.</span>}
    </div>}
  </section>;
});
