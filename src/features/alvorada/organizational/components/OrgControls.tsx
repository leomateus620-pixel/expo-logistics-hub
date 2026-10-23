import {
  Badge,
  BriefcaseBusiness,
  Crown,
  Landmark,
  Layers3,
  LocateFixed,
  Minus,
  PanelsTopLeft,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { CCPF_FULL_LABEL } from '../resolver';
import type { OrgGraphFilter } from '../hooks/useOrgGraphInteraction';

interface OrgFilterBarProps {
  filter: OrgGraphFilter;
  compact?: boolean;
  onFilterChange: (filter: OrgGraphFilter) => void;
}

interface OrgViewportControlsProps {
  scale: number;
  fitLabel?: string;
  selected: boolean;
  onClearSelection?: () => void;
  onFit: () => void;
  onFocusSelected: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

const FILTERS = [
  { id: 'all', label: 'TODO O ECOSSISTEMA', icon: Layers3 },
  {
    id: 'ccp',
    label: 'CCPF',
    accessibleLabel: CCPF_FULL_LABEL,
    icon: Badge,
  },
  { id: 'executive', label: 'PRESIDÊNCIA', icon: Crown },
  { id: 'central-commission', label: 'COMISSÃO CENTRAL', icon: Landmark },
  { id: 'commission', label: 'COMISSÕES', icon: BriefcaseBusiness },
  { id: 'advisory', label: 'ASSESSORIAS', icon: PanelsTopLeft },
] satisfies Array<{
  id: OrgGraphFilter;
  label: string;
  accessibleLabel?: string;
  icon: typeof Layers3;
}>;

export function OrgFilterBar({ filter, compact = false, onFilterChange }: OrgFilterBarProps) {
  return (
    <nav className="org-filters" data-compact={compact || undefined} aria-label="Filtrar níveis organizacionais" data-org-interactive>
      {FILTERS.map((item) => {
        const FilterIcon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.accessibleLabel ?? item.label}
            aria-pressed={filter === item.id}
            title={item.accessibleLabel ?? item.label}
            onClick={() => onFilterChange(item.id)}
          >
            <FilterIcon aria-hidden="true" data-org-filter-icon />
            <span className="org-filter-label">{item.accessibleLabel ?? item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function OrgViewportControls({
  scale,
  fitLabel = 'Enquadrar todo o ecossistema',
  selected,
  onClearSelection,
  onFit,
  onFocusSelected,
  onZoomIn,
  onZoomOut,
}: OrgViewportControlsProps) {
  return (
    <div className="org-viewport-controls" data-org-interactive aria-label="Controles do mapa organizacional">
      {selected && onClearSelection && (
        <button type="button" className="org-viewport-controls__clear" onClick={onClearSelection} aria-label="Limpar seleção e restaurar visão geral" title="Limpar seleção e restaurar visão geral">
          <X aria-hidden="true" />
          <span>Limpar seleção</span>
        </button>
      )}
      <button type="button" onClick={onZoomOut} aria-label="Reduzir zoom" title="Reduzir zoom">
        <Minus aria-hidden="true" />
      </button>
      <output aria-label={`Zoom em ${Math.round(scale * 100)} por cento`}>
        {Math.round(scale * 100)}%
      </output>
      <button type="button" onClick={onZoomIn} aria-label="Aumentar zoom" title="Aumentar zoom">
        <Plus aria-hidden="true" />
      </button>
      <span className="org-viewport-controls__divider" aria-hidden="true" />
      <button type="button" onClick={onFit} aria-label={fitLabel} title={fitLabel}>
        <RotateCcw aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onFocusSelected}
        aria-label="Centralizar nó selecionado"
        title="Centralizar nó selecionado"
        disabled={!selected}
      >
        <LocateFixed aria-hidden="true" />
      </button>
    </div>
  );
}
