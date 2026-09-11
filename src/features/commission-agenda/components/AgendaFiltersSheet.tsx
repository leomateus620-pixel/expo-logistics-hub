import { Check, RotateCcw } from 'lucide-react';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import type { AgendaSecondaryFilters, EventStatus, PersonSummary } from '../types';
import { DEFAULT_SECONDARY_FILTERS, EVENT_STATUS_LABELS } from '../lib/agenda-presentation';
import { PersonAvatar, WorkspaceButton } from './primitives';
import { WorkspaceSheet } from './WorkspaceSheet';

const STATUS_OPTIONS: EventStatus[] = ['requested', 'confirmed', 'draft', 'rescheduled', 'completed', 'cancelled'];

const PERIOD_OPTIONS: Array<{ value: AgendaSecondaryFilters['period']; label: string }> = [
  { value: 'all', label: 'Todo o ano' },
  { value: 'week', label: 'Próximos 7 dias' },
  { value: '30days', label: 'Próximos 30 dias' },
  { value: 'quarter', label: 'Próximos 90 dias' },
];

export interface AgendaFiltersProps {
  value: AgendaSecondaryFilters;
  onChange: (value: AgendaSecondaryFilters) => void;
  people: PersonSummary[];
  locations: string[];
  resultCount?: number;
  onClose?: () => void;
}

function ChipGroup<T extends string>({ label, options, value, onSelect, render }: {
  label: string;
  options: T[];
  value: T;
  onSelect: (value: T) => void;
  render: (option: T) => React.ReactNode;
}) {
  return (
    <div className="ua-filters__group" role="group" aria-label={label}>
      <p className="ua-filters__group-title ws-label" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <div className="ua-chip-select">
        {options.map((option) => (
          <button key={option} type="button" className="ua-chip ws-focus" aria-pressed={value === option} onClick={() => onSelect(option)}>
            {render(option)}
            {value === option && <Check aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AgendaFilters({ value, onChange, people, locations, resultCount, onClose }: AgendaFiltersProps) {
  const set = <K extends keyof AgendaSecondaryFilters>(key: K, next: AgendaSecondaryFilters[K]) => onChange({ ...value, [key]: next });
  return (
    <div className="ua-filters">
      <ChipGroup
        label="Status"
        options={['all', ...STATUS_OPTIONS] as Array<EventStatus | 'all'>}
        value={value.status}
        onSelect={(next) => set('status', next)}
        render={(option) => (option === 'all' ? 'Todos' : EVENT_STATUS_LABELS[option])}
      />
      <ChipGroup
        label="Responsável"
        options={['all', ...people.map((person) => person.id)]}
        value={value.personId}
        onSelect={(next) => set('personId', next)}
        render={(option) => {
          if (option === 'all') return 'Todos';
          const person = people.find((item) => item.id === option);
          return person ? <><PersonAvatar person={person} size="xs" tone={value.personId === option ? 'dark' : 'light'} />{person.name}</> : option;
        }}
      />
      <ChipGroup
        label="Local"
        options={['all', ...locations]}
        value={value.location}
        onSelect={(next) => set('location', next)}
        render={(option) => (option === 'all' ? 'Todos' : option)}
      />
      <ChipGroup
        label="Período"
        options={PERIOD_OPTIONS.map((option) => option.value)}
        value={value.period}
        onSelect={(next) => set('period', next)}
        render={(option) => PERIOD_OPTIONS.find((item) => item.value === option)?.label ?? option}
      />
      <div className="ua-filters__footer">
        <WorkspaceButton variant="ghost" icon={RotateCcw} onClick={() => onChange({ ...DEFAULT_SECONDARY_FILTERS })}>Limpar</WorkspaceButton>
        <WorkspaceButton variant="primary" onClick={onClose}>
          {typeof resultCount === 'number' ? `Ver ${resultCount} ${resultCount === 1 ? 'evento' : 'eventos'}` : 'Aplicar'}
        </WorkspaceButton>
      </div>
    </div>
  );
}

export interface AgendaFiltersSheetProps extends AgendaFiltersProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Bottom sheet on mobile, side panel on desktop. */
export function AgendaFiltersSheet({ open, onOpenChange, ...props }: AgendaFiltersSheetProps) {
  const isMobile = useIsMobile();
  const close = () => onOpenChange(false);

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="unit-workspace ua-bottom-sheet">
          <div className="px-4 pt-3">
            <DrawerTitle className="ws-section-title" style={{ color: 'var(--text-primary)' }}>Filtros</DrawerTitle>
            <DrawerDescription className="ws-meta-secondary">Refine a agenda por status, responsável, local e período.</DrawerDescription>
          </div>
          <div className="ua-bottom-sheet__body">
            <AgendaFilters {...props} onClose={close} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <WorkspaceSheet open={open} onOpenChange={onOpenChange} eyebrow="Agenda" title="Filtros" description="Refine a agenda por status, responsável, local e período.">
      <AgendaFilters {...props} onClose={close} />
    </WorkspaceSheet>
  );
}
