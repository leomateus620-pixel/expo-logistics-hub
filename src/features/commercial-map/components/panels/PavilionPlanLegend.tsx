import { memo, type CSSProperties } from 'react';
import type { CommercialPavilionModulePlan } from '../../utils/commercialPavilionModules';

const area = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

function moduleLabel(value: number) {
  return String(value).padStart(2, '0');
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
        <svg viewBox="0 0 100 100" role="img" aria-label="Diagrama simplificado dos setores e corredores">
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
          {plan.zones.map((zone) => (
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
        </svg>

        <dl>
          <div><dt>Módulos</dt><dd>{maximum}</dd></div>
          <div><dt>Identificação</dt><dd>{moduleLabel(1)}–{moduleLabel(maximum)}</dd></div>
          <div><dt>Área total</dt><dd>{area.format(plan.stats.totalAreaSquareMeters)} m²</dd></div>
          <div><dt>Área modular</dt><dd>{area.format(plan.stats.moduleAreaSquareMeters)} m²</dd></div>
        </dl>
      </div>

      <div className="commercial-pavilion-plan-groups" aria-label="Grupos de módulos">
        {plan.zones.map((zone) => (
          <span key={zone.id} title={zone.label}>
            <b>{moduleLabel(zone.numberRange[0])}–{moduleLabel(zone.numberRange[1])}</b>
            <small>{zone.label}</small>
          </span>
        ))}
      </div>

      <footer>
        <span><i aria-hidden="true" />Blocos numerados</span>
        <span><i aria-hidden="true" />Circulação</span>
        <small>Somente identificadores · expositores não exibidos</small>
      </footer>
    </section>
  );
});
