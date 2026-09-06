import { memo, useId, useMemo, type CSSProperties } from 'react';
import { ChevronDown, FilterX } from 'lucide-react';
import { STATUS_CONFIG } from '../../constants';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type { CommercialStatus } from '../../types';
import {
  deriveContextualMapSummary,
  resolveContextualMapScope,
  type ContextualAreaTotal,
  type ContextualMapScopeInput,
} from '../../utils/contextualMapSummary';
import type { CommercialPavilionModulePlan } from '../../utils/commercialPavilionModules';
import './contextual-map-legend.css';

const area = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const count = new Intl.NumberFormat('pt-BR');
const STATUS_ORDER: readonly CommercialStatus[] = ['AVAILABLE', 'RESERVED', 'IN_NEGOTIATION', 'SOLD', 'BLOCKED', 'UNAVAILABLE'];

export interface ContextualMapLegendProps extends ContextualMapScopeInput {
  matchingEntityIds?: ReadonlySet<string>;
  filtersActive?: boolean;
  compact?: boolean;
  className?: string;
  showHeading?: boolean;
}

/** Uses the official plan cells, including irregular footprints, only as a small overview. */
function PavilionPlanThumbnail({ plan }: { plan: CommercialPavilionModulePlan }) {
  const rects = [plan.boundary, ...plan.corridors, ...plan.supportSpaces, ...plan.cells];
  const extent = rects.reduce((bounds, rect) => ({
    minX: Math.min(bounds.minX, rect.centerX - rect.width / 2),
    minZ: Math.min(bounds.minZ, rect.centerZ - rect.depth / 2),
    maxX: Math.max(bounds.maxX, rect.centerX + rect.width / 2),
    maxZ: Math.max(bounds.maxZ, rect.centerZ + rect.depth / 2),
  }), { minX: 0, minZ: 0, maxX: 1, maxZ: 1 });
  const viewBox = [extent.minX - 0.03, extent.minZ - 0.03, extent.maxX - extent.minX + 0.06, extent.maxZ - extent.minZ + 0.06].join(' ');
  return (
    <svg className="commercial-context-plan" viewBox={viewBox} role="img" aria-label="Esquema dos módulos e corredores do pavilhão">
      <rect x={plan.boundary.centerX - plan.boundary.width / 2} y={plan.boundary.centerZ - plan.boundary.depth / 2} width={plan.boundary.width} height={plan.boundary.depth} fill="#e3e8e2" />
      {plan.corridors.map((rect) => <rect key={rect.id} x={rect.centerX - rect.width / 2} y={rect.centerZ - rect.depth / 2} width={rect.width} height={rect.depth} fill="#fbfcf8" />)}
      {plan.cells.map((cell) => cell.shape ? (
        <polygon key={cell.id} points={cell.shape.footprint.map(([x, z]) => `${x},${z}`).join(' ')} fill={plan.colorCue} stroke="#ffffff" strokeWidth="0.002" />
      ) : (
        <rect key={cell.id} x={cell.centerX - cell.width / 2} y={cell.centerZ - cell.depth / 2} width={cell.width} height={cell.depth} fill={plan.colorCue} stroke="#ffffff" strokeWidth="0.002" />
      ))}
      {plan.supportSpaces.map((rect) => <rect key={rect.id} x={rect.centerX - rect.width / 2} y={rect.centerZ - rect.depth / 2} width={rect.width} height={rect.depth} fill="#7a817b" />)}
    </svg>
  );
}

function OfficialArea({ label, value }: { label: string; value: ContextualAreaTotal }) {
  return <div>
    <dt>{label}</dt>
    <dd>{value.squareMeters === null ? 'Área não informada' : `${area.format(value.squareMeters)} m²`}</dd>
    {value.squareMeters !== null && value.missingCount > 0 && <small>Parcial · {value.informedCount} de {value.informedCount + value.missingCount} lotes com área</small>}
  </div>;
}

export const ContextualMapLegend = memo(function ContextualMapLegend({
  entities,
  lots,
  interiorEntity = null,
  activeSegmentId = null,
  scopeTitle,
  matchingEntityIds,
  filtersActive = false,
  compact = false,
  className = '',
  showHeading = true,
}: ContextualMapLegendProps) {
  const headingId = useId();
  const statusFilters = useCommercialMapStore((state) => state.statusFilters);
  const toggleStatus = useCommercialMapStore((state) => state.toggleStatus);
  const clearStatuses = useCommercialMapStore((state) => state.clearStatuses);
  const scope = useMemo(() => resolveContextualMapScope({
    entities, lots, interiorEntity, activeSegmentId, scopeTitle,
  }), [entities, lots, interiorEntity, activeSegmentId, scopeTitle]);
  const summary = useMemo(() => deriveContextualMapSummary(scope, {
    statusFilters, matchingEntityIds, filtersActive,
  }), [scope, statusFilters, matchingEntityIds, filtersActive]);
  const statuses = <>
    <div className="commercial-context-status-heading">
      <span>Situação dos {scope.unit}</span>
      {statusFilters.length > 0 && (
        <button type="button" onClick={clearStatuses} aria-label="Limpar filtro de situação comercial">
          <FilterX aria-hidden="true" /><span>Limpar situação</span>
        </button>
      )}
    </div>
    <div className="commercial-context-statuses" role="group" aria-label="Filtrar por situação comercial">
      {STATUS_ORDER.map((status) => {
        const config = STATUS_CONFIG[status];
        const selected = statusFilters.includes(status);
        return <button
          key={status}
          type="button"
          className={selected ? 'is-selected' : ''}
          aria-pressed={selected}
          aria-label={`${config.label}: ${summary.byStatus[status]} ${scope.unit}`}
          onClick={() => toggleStatus(status)}
          style={{ '--status-color': config.color, '--status-border': config.border, '--status-surface': config.surface } as CSSProperties}
        >
          <i aria-hidden="true" /><span>{config.shortLabel}</span><strong>{count.format(summary.byStatus[status])}</strong>
        </button>;
      })}
    </div>
    {scope.unregisteredModuleCount > 0 && <p className="commercial-context-neutral"><i style={{ background: scope.plan?.colorCue }} aria-hidden="true" /><span>Sem situação cadastrada</span><strong>{count.format(scope.unregisteredModuleCount)}</strong></p>}
    {scope.nonCommercialCount > 0 && <p className="commercial-context-neutral"><i aria-hidden="true" /><span>Não comercial{scope.plan ? ' · apoios' : ' · estruturas'}</span><strong>{count.format(scope.nonCommercialCount)}</strong></p>}
    {scope.kind === 'interior' && scope.totalCount === 0 && <p className="commercial-context-note">Nenhum lote interno cadastrado neste local.</p>}
  </>;

  return <section
    className={`commercial-context-legend${compact ? ' is-compact' : ''} ${className}`.trim()}
    aria-label={`Legenda de ${scope.title}`}
    data-context-kind={scope.kind}
  >
    {showHeading && <header className="commercial-context-heading"><span>{scope.kind === 'interior' ? 'Interior' : scope.kind === 'segment' ? 'Segmento' : 'Mapa completo'}</span><h3 id={headingId}>{scope.title}</h3></header>}
    <div className="commercial-context-summary">
      {!compact && scope.plan && <PavilionPlanThumbnail plan={scope.plan} />}
      <div>
        <p><strong>{count.format(scope.totalCount)}</strong><span>{scope.unit} no {scope.kind === 'interior' ? 'interior' : scope.kind === 'segment' ? 'segmento' : 'parque'}</span></p>
        {summary.hasFilters && <small role="status">{count.format(summary.filteredCount)} de {count.format(scope.totalCount)} {scope.unit} correspondem aos filtros</small>}
        {scope.plan && !compact && <small>Identificação 01–{String(scope.plan.cells.length).padStart(2, '0')}</small>}
      </div>
    </div>
    {statusFilters.length > 0 && <p className="commercial-context-filter-note">Filtro: {statusFilters.map((status) => STATUS_CONFIG[status].shortLabel).join(', ')}</p>}
    {compact ? <details className="commercial-context-expand"><summary>Situações e legenda<ChevronDown aria-hidden="true" /></summary>{statuses}</details> : statuses}
    {!compact && <dl className="commercial-context-primary-area"><OfficialArea label="Área oficial dos lotes no escopo" value={summary.officialArea} /></dl>}
    <details className="commercial-context-expand" key={`${scope.kind}:${interiorEntity?.id ?? activeSegmentId ?? 'park'}`}>
      <summary>Áreas e informações<ChevronDown aria-hidden="true" /></summary>
      {compact && scope.plan && <PavilionPlanThumbnail plan={scope.plan} />}
      <dl className="commercial-context-areas">
        {compact && <OfficialArea label="Área oficial dos lotes no escopo" value={summary.officialArea} />}
        <OfficialArea label="Área oficial dos lotes disponíveis" value={summary.availableOfficialArea} />
        {scope.plan && <>
          <div><dt>Área total do pavilhão</dt><dd>{area.format(scope.plan.stats.totalAreaSquareMeters)} m²</dd></div>
          <div><dt>Área modular total</dt><dd>{area.format(scope.plan.stats.moduleAreaSquareMeters)} m²</dd></div>
          {scope.plan.stats.nominalModuleAreaSquareMeters !== undefined && <div><dt>Soma geométrica nominal</dt><dd>{area.format(scope.plan.stats.nominalModuleAreaSquareMeters)} m²</dd></div>}
          {scope.plan.stats.exhibitionAreaSquareMeters !== undefined && <div><dt>Área de exposição</dt><dd>{area.format(scope.plan.stats.exhibitionAreaSquareMeters)} m²</dd></div>}
          {scope.plan.stats.sourceDeclaredModuleCount !== undefined && <div><dt>Módulos declarados no croqui</dt><dd>{scope.plan.stats.sourceDeclaredModuleCount}</dd></div>}
        </>}
      </dl>
      {scope.plan && <>
        <p className="commercial-context-note">{scope.plan.stats.category}. As áreas do pavilhão e dos módulos têm bases distintas e não são somadas.</p>
        {scope.plan.supportSpaces.map((space) => <p className="commercial-context-note" key={space.id}>{space.label} · apoio não comercial</p>)}
        {scope.plan.documentDiscrepancies.map((note) => <p className="commercial-context-note" key={note}>Divergência documental: {note}</p>)}
      </>}
    </details>
  </section>;
});
