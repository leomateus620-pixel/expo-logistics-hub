import { useId, useMemo, useState } from 'react';
import { ArrowUpRight, MapPinned } from 'lucide-react';
import { COMMERCIAL_PHASES, STATUS_CONFIG } from '../constants';
import { toCommercialPhase, type CommercialStatus, type CommercialPhase } from '../types';
import { formatAreaSqmLabel, formatBrl } from '../utils/lotPricing2028';
import { resolveLotIdentity } from '../utils/lotIdentity';
import { buildCommercialMiniMapGeometry, type CommercialMiniMapItem, type MiniMapOutline } from './commercialDashboardGeometry';
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

/** SVG only. Shapes, identifiers, status and selection use the same query snapshot. */
export function CommercialMiniMap({
  items, title, highlightedStatus = null, onViewLot, className = '',
  outlines = EMPTY_OUTLINES, accesses = EMPTY_ACCESSES, numbered = false, selection,
}: CommercialMiniMapProps) {
  const selectId = useId();
  const geometry = useMemo(() => buildCommercialMiniMapGeometry(items, outlines), [items, outlines]);
  const [hoveredEntityId, setHoveredEntityId] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string | null>>({});
  const selectedEntityId = selection ? selection.entityId : selections[title] ?? null;
  const select = selection?.onChange ?? ((id: string | null) => setSelections((current) => ({ ...current, [title]: id })));
  const [keyboardEntityId, setKeyboardEntityId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const keyboardStopId = keyboardEntityId && geometry.lotsByEntityId.has(keyboardEntityId) ? keyboardEntityId : geometry.lots[0]?.entity.id;
  const activeLot = items.find(({ entity }) => entity.id === selectedEntityId)
    ?? items.find(({ entity }) => entity.id === hoveredEntityId) ?? null;
  const activeSelected = activeLot?.entity.id === selectedEntityId;
  const statusCounts = useMemo(() => {
    const counts = new Map<CommercialPhase, number>();
    for (const { lot } of items) {
      const phase = toCommercialPhase(lot.status);
      counts.set(phase, (counts.get(phase) ?? 0) + 1);
    }
    return counts;
  }, [items]);
  const blocks = geometry.outlines.filter((outline) => outline.kind === 'block');
  const visibleLabels: Array<readonly [number, number]> = [];
  const accessPositions: Array<readonly [number, number]> = [];

  return <section className={`commercial-dashboard-minimap ${className}`} aria-label={`Mini mapa comercial: ${title}`}>
    <div className="commercial-dashboard-map-heading"><MapPinned aria-hidden="true" /><strong>{title}</strong>
      <span>{geometry.lots.length} {geometry.lots.length === 1 ? 'lote posicionado' : 'lotes posicionados'}</span></div>
    <div className="commercial-dashboard-map-tools">
      <label htmlFor={selectId}>Selecionar {numbered ? 'módulo' : 'lote'}</label>
      <select id={selectId} value={activeSelected ? selectedEntityId ?? '' : ''} onChange={(event) => select(event.target.value || null)}>
        <option value="">Escolha um espaço</option>
        {items.map((item) => <option key={item.lot.id} value={item.entity.id}>{identity(item)} · {STATUS_CONFIG[toCommercialPhase(item.lot.status)].label}</option>)}
      </select>
      <button type="button" aria-label={`Reduzir planta de ${title}`} disabled={zoom === 1} onClick={() => setZoom((value) => Math.max(1, value - 0.5))}>−</button>
      <button type="button" aria-label={`Ampliar planta de ${title}`} disabled={zoom === 3} onClick={() => setZoom((value) => Math.min(3, value + 0.5))}>+</button>
    </div>
    <div className="commercial-dashboard-map-scroll" tabIndex={0} aria-label={`Planta de ${title}; use as setas para navegar pelos espaços`}>
      <div style={{ width: `${zoom * 100}%`, minWidth: numbered ? 1000 * zoom : undefined }}>
        {geometry.bounds ? <svg className="commercial-dashboard-map-svg" viewBox="-50 -50 1100 700" role="group"
          aria-label={`Distribuição espacial de ${geometry.lots.length} lotes em ${title}, coloridos pela situação comercial`}>
          {geometry.outlines.filter(({ kind }) => kind !== 'block').map((outline) => <path key={outline.id} d={outline.path}
            fill={outline.color} fillOpacity=".035" fillRule="evenodd" stroke={outline.color} strokeWidth="3" vectorEffect="non-scaling-stroke"
            data-outline={outline.kind}><title>{outline.kind === 'segment' ? 'Contorno cadastral' : 'Pavilhão'} · {outline.label}</title></path>)}
          {geometry.lots.map((item, index) => {
            const { entity, lot, value, path } = item;
            const config = STATUS_CONFIG[toCommercialPhase(lot.status)];
            const isActive = activeLot?.entity.id === entity.id;
            const area = lot.officialAreaSqm != null && Number.isFinite(lot.officialAreaSqm) && lot.officialAreaSqm > 0 ? formatAreaSqmLabel(lot.officialAreaSqm) : 'área oficial pendente';
            return <path key={lot.id} d={path} fill={config.color} fillRule="evenodd" stroke={isActive ? '#172e20' : config.border}
              strokeWidth={isActive ? 3.5 : 1.3} vectorEffect="non-scaling-stroke"
              opacity={highlightedStatus && toCommercialPhase(highlightedStatus) !== toCommercialPhase(lot.status) && !isActive ? 0.16 : 0.92}
              role="button" tabIndex={keyboardStopId === entity.id ? 0 : -1} aria-pressed={selectedEntityId === entity.id}
              aria-label={`${identity(item)}, ${area}, ${config.label}, ${value == null ? 'valor não definido' : formatBrl(value)}`}
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
          {blocks.map((outline) => {
            const [x, y] = outline.labelPoint;
            if (visibleLabels.some(([otherX, otherY]) => Math.abs(otherX - x) < 120 && Math.abs(otherY - y) < 27)) return null;
            visibleLabels.push([x, y]);
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
          {accesses.map((marker) => {
            const [x, y] = geometry.project(marker.position);
            // Leaders retain official positions; icons stay outside the pavilion.
            const pavilion = geometry.outlines.find((outline) => outline.kind === 'pavilion');
            const projected = (pavilion?.coordinates[0] ?? []).map(geometry.project);
            const horizontal = Math.abs(marker.outward[0]) > Math.abs(marker.outward[1]);
            let iconX = horizontal && projected.length ? (marker.outward[0] > 0 ? Math.max(...projected.map(([px]) => px)) + 25 : Math.min(...projected.map(([px]) => px)) - 25) : x;
            let iconY = !horizontal && projected.length ? (marker.outward[1] > 0 ? Math.max(...projected.map(([, py]) => py)) + 25 : Math.min(...projected.map(([, py]) => py)) - 25) : y;
            while (accessPositions.some(([px, py]) => Math.abs(px - iconX) < 30 && Math.abs(py - iconY) < 30)) {
              if (horizontal) iconY += 32; else iconX += 32;
            }
            accessPositions.push([iconX, iconY]);
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
    <div className="commercial-dashboard-map-legend" aria-label="Legenda das situações comerciais">
       {COMMERCIAL_PHASES.filter((status) => statusCounts.has(status)).map((status) => <span key={status}>
        <i style={{ backgroundColor: STATUS_CONFIG[status].color }} />{STATUS_CONFIG[status].shortLabel} {statusCounts.get(status)}
      </span>)}
      {outlines.some(({ kind }) => kind === 'segment') && <span>━ Contorno cadastral da área</span>}
      {!!blocks.length && <span>┄ Limite de quadra</span>}
    </div>
    {!!accesses.length && <div className="commercial-dashboard-map-legend" aria-label="Legenda dos acessos">
      {[...new Set(accesses.map(({ kind }) => kind))].map((kind) => <span key={kind}>{ACCESS_SYMBOL[kind]} {ACCESS_LABEL[kind]}</span>)}
    </div>}
    {numbered && <p className="commercial-dashboard-data-note">Numeração do cadastro. Deslize a planta para explorar; use + para ampliar ou o seletor para escolher um módulo.</p>}
    {geometry.lots.length < items.length && <p className="commercial-dashboard-data-note">{items.length - geometry.lots.length} espaços sem geometria válida; incluídos nos indicadores e no seletor.</p>}
    <div className="commercial-dashboard-lot-detail" role="status" aria-live="polite">
      {activeLot ? <><strong>{identity(activeLot)}</strong>
         <span>{activeLot.lot.officialAreaSqm != null && Number.isFinite(activeLot.lot.officialAreaSqm) && activeLot.lot.officialAreaSqm > 0 ? formatAreaSqmLabel(activeLot.lot.officialAreaSqm) : 'Área oficial pendente'} · {STATUS_CONFIG[toCommercialPhase(activeLot.lot.status)].label}</span>
        <span>{activeLot.value == null ? 'Valor não definido' : formatBrl(activeLot.value)} · valor comercial cadastrado</span>
        {activeSelected && <button type="button" onClick={() => onViewLot(activeLot.entity.id)}>Ver no mapa <ArrowUpRight aria-hidden="true" /></button>}
      </> : <span>Selecione um espaço na planta ou na lista para consultar seus dados.</span>}
    </div>
  </section>;
}
