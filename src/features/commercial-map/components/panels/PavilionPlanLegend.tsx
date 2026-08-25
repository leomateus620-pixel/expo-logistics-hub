import { memo, type CSSProperties } from 'react';
import type { CommercialPavilionModulePlan } from '../../utils/commercialPavilionModules';
import type {
  CommercialPavilionReferenceCellShape,
} from '../../data/commercialPavilionReference';

const area = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function moduleLabel(value: number) {
  return String(value).padStart(2, '0');
}

function moduleRangeLabel(range: readonly [number, number]) {
  return range[0] === range[1]
    ? moduleLabel(range[0])
    : `${moduleLabel(range[0])}–${moduleLabel(range[1])}`;
}

function irregularShapePath(shape: CommercialPavilionReferenceCellShape): string {
  if (shape.footprint.length < 3) return '';
  return `${shape.footprint.map(([x, z], index) => (
    `${index === 0 ? 'M' : 'L'}${x * 100} ${z * 100}`
  )).join(' ')} Z`;
}

function referenceShapeForCell(
  cell: CommercialPavilionModulePlan['cells'][number],
): CommercialPavilionReferenceCellShape | undefined {
  return cell.shape;
}

export const PavilionPlanLegend = memo(function PavilionPlanLegend({
  plan,
  variant = 'panel',
}: {
  plan: CommercialPavilionModulePlan;
  variant?: 'panel' | 'interior';
}) {
  const maximum = plan.stats.moduleCount;
  const accentStyle = { '--pavilion-plan-accent': plan.colorCue } as CSSProperties;
  const supportSpaces = plan.supportSpaces;
  const overviewRects = [
    plan.boundary,
    ...plan.corridors,
    ...plan.zones.map((zone) => zone.bounds),
    ...supportSpaces,
  ];
  const overviewExtent = overviewRects.reduce((extent, rect) => ({
    minX: Math.min(extent.minX, rect.centerX - rect.width / 2),
    minZ: Math.min(extent.minZ, rect.centerZ - rect.depth / 2),
    maxX: Math.max(extent.maxX, rect.centerX + rect.width / 2),
    maxZ: Math.max(extent.maxZ, rect.centerZ + rect.depth / 2),
  }), { minX: 0, minZ: 0, maxX: 1, maxZ: 1 });
  const overviewPadding = 0.015;
  const overviewViewBox = [
    (overviewExtent.minX - overviewPadding) * 100,
    (overviewExtent.minZ - overviewPadding) * 100,
    (overviewExtent.maxX - overviewExtent.minX + overviewPadding * 2) * 100,
    (overviewExtent.maxZ - overviewExtent.minZ + overviewPadding * 2) * 100,
  ].join(' ');
  const irregularModulePath = plan.cells
    .map((cell) => {
      const shape = referenceShapeForCell(cell);
      return shape ? irregularShapePath(shape) : '';
    })
    .filter(Boolean)
    .join(' ');
  const preciseZoneIds = new Set(
    plan.cells.filter((cell) => Boolean(cell.shape)).map((cell) => cell.zoneId),
  );
  const preciseRegularCells = plan.cells.filter((cell) => (
    preciseZoneIds.has(cell.zoneId) && !cell.shape
  ));

  return (
    <section
      className={`commercial-pavilion-plan-legend is-${variant}`}
      style={accentStyle}
      aria-label={`Legenda da planta interna do Pavilhão ${plan.stats.pavilionNumber}`}
      data-commercial-pavilion-plan={plan.publicIdentifier}
    >
      <header>
        <i aria-hidden="true" />
        <div>
          <span>Planta interna oficial</span>
          <strong>Pavilhão {plan.stats.pavilionNumber}</strong>
          <small>{plan.stats.category}</small>
        </div>
      </header>

      <div className="commercial-pavilion-plan-overview">
        <svg viewBox={overviewViewBox} role="img" aria-label="Diagrama simplificado dos setores e corredores">
          <rect
            className="commercial-pavilion-plan-boundary"
            x={(plan.boundary.centerX - plan.boundary.width / 2) * 100}
            y={(plan.boundary.centerZ - plan.boundary.depth / 2) * 100}
            width={plan.boundary.width * 100}
            height={plan.boundary.depth * 100}
            rx="2"
          />
          {plan.corridors.map((corridor) => (
            <rect
              key={corridor.id}
              className={`commercial-pavilion-plan-corridor is-${corridor.kind}`}
              x={(corridor.centerX - corridor.width / 2) * 100}
              y={(corridor.centerZ - corridor.depth / 2) * 100}
              width={corridor.width * 100}
              height={corridor.depth * 100}
              rx="1"
            />
          ))}
          {plan.zones.filter((zone) => !preciseZoneIds.has(zone.id)).map((zone) => (
            <rect
              key={zone.id}
              className="commercial-pavilion-plan-zone"
              x={(zone.bounds.centerX - zone.bounds.width / 2) * 100}
              y={(zone.bounds.centerZ - zone.bounds.depth / 2) * 100}
              width={zone.bounds.width * 100}
              height={zone.bounds.depth * 100}
              rx="1"
            />
          ))}
          {preciseRegularCells.map((cell) => (
            <rect
              key={cell.id}
              className="commercial-pavilion-plan-zone"
              x={(cell.centerX - cell.width / 2) * 100}
              y={(cell.centerZ - cell.depth / 2) * 100}
              width={cell.width * 100}
              height={cell.depth * 100}
              rx="1"
            />
          ))}
          {irregularModulePath && (
            <path
              className="commercial-pavilion-plan-irregular-modules"
              d={irregularModulePath}
            />
          )}
          {supportSpaces.length > 0 && (
            <g aria-label="Áreas permanentes de apoio não comercial">
              {supportSpaces.map((supportSpace) => (
                <rect
                  key={supportSpace.id}
                  className={`commercial-pavilion-plan-support-space is-${supportSpace.kind}`}
                  x={(supportSpace.centerX - supportSpace.width / 2) * 100}
                  y={(supportSpace.centerZ - supportSpace.depth / 2) * 100}
                  width={supportSpace.width * 100}
                  height={supportSpace.depth * 100}
                  rx="0.8"
                >
                  <title>{supportSpace.label} · apoio permanente não comercial</title>
                </rect>
              ))}
            </g>
          )}
        </svg>

        <dl>
          <div><dt>Módulos</dt><dd>{maximum}</dd></div>
          <div><dt>Identificação</dt><dd>{moduleLabel(1)}–{moduleLabel(maximum)}</dd></div>
          <div><dt>Área total</dt><dd>{area.format(plan.stats.totalAreaSquareMeters)} m²</dd></div>
          <div><dt>Área modular total</dt><dd>{area.format(plan.stats.moduleAreaSquareMeters)} m²</dd></div>
        </dl>
      </div>

      <div className="commercial-pavilion-plan-groups" aria-label="Sequências de módulos">
        {plan.legendNumberRanges.map((range) => (
          <span
            key={`${range[0]}-${range[1]}`}
            title={`${range[0] === range[1] ? 'Módulo' : 'Módulos'} ${moduleRangeLabel(range)}`}
          >
            <b>{moduleRangeLabel(range)}</b>
          </span>
        ))}
      </div>

      {supportSpaces.length > 0 && (
        <div
          className="commercial-pavilion-plan-support-spaces"
          aria-label="Áreas permanentes de apoio não comercial"
        >
          {supportSpaces.map((supportSpace) => (
            <span key={supportSpace.id}>
              <i className={`is-${supportSpace.kind}`} aria-hidden="true" />
              <b>{supportSpace.label}</b>
              <small>Não comercial</small>
            </span>
          ))}
        </div>
      )}

      <footer>
        <span className="is-modules"><i aria-hidden="true" />Módulos numerados</span>
        <span className="is-circulation"><i aria-hidden="true" />Circulação livre</span>
        {supportSpaces.length > 0 && (
          <span className="is-support"><i aria-hidden="true" />Apoio permanente</span>
        )}
        <small>Área individual não atribuída · expositores não vinculados</small>
      </footer>
    </section>
  );
});
