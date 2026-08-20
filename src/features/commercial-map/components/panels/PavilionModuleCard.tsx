import { memo } from 'react';
import { X } from 'lucide-react';
import type { CommercialPavilionModulePlan } from '../../utils/commercialPavilionModules';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';

const area = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const ZONE_ROLE_LABEL: Record<string, string> = {
  perimeter: 'Faixa perimetral',
  island: 'Ilha central',
  gallery: 'Galeria',
  'market-run': 'Corredor de mercado',
};

/** Detail card for the module selected inside a pavilion interior. */
export const PavilionModuleCard = memo(function PavilionModuleCard({
  plan,
}: {
  plan: CommercialPavilionModulePlan;
}) {
  const selectedModuleId = useCommercialMapStore((state) => state.selectedModuleId);
  const setSelectedModuleId = useCommercialMapStore((state) => state.setSelectedModuleId);
  const cell = plan.cells.find((candidate) => candidate.id === selectedModuleId) ?? null;
  if (!cell) return null;
  const zone = plan.zones.find((candidate) => candidate.id === cell.zoneId) ?? null;

  return (
    <aside
      className="commercial-pavilion-module-card"
      style={{ '--pavilion-plan-accent': plan.colorCue } as React.CSSProperties}
      aria-label={`Módulo ${cell.label} do Pavilhão ${plan.stats.pavilionNumber}`}
      data-commercial-pavilion-module={cell.id}
    >
      <header>
        <div>
          <span>Módulo selecionado</span>
          <strong>Módulo {cell.label}</strong>
          <small>Pavilhão {plan.stats.pavilionNumber} · {plan.stats.category}</small>
        </div>
        <button
          type="button"
          onClick={() => setSelectedModuleId(null)}
          aria-label="Fechar detalhes do módulo"
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <dl>
        <div>
          <dt>Setor</dt>
          <dd>{zone?.label ?? 'Não informado'}</dd>
        </div>
        <div>
          <dt>Disposição</dt>
          <dd>{zone ? ZONE_ROLE_LABEL[zone.role] ?? zone.label : 'Não informado'}</dd>
        </div>
        <div>
          <dt>Área modular</dt>
          <dd>{area.format(plan.stats.moduleAreaSquareMeters)} m²</dd>
        </div>
        <div>
          <dt>Numeração</dt>
          <dd>{cell.number} de {plan.stats.moduleCount}</dd>
        </div>
      </dl>

      <footer>Identificação cartográfica oficial · expositores não exibidos</footer>
    </aside>
  );
});
