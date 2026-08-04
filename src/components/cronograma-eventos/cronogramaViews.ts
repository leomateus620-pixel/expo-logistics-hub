import {
  BadgeCheck,
  CalendarClock,
  CalendarDays,
  LayoutDashboard,
  Route,
  type LucideIcon,
} from 'lucide-react';
import type { CronogramaView } from './types';

export interface CronogramaViewDefinition {
  value: CronogramaView;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

export const CRONOGRAMA_VIEW_DEFINITIONS: CronogramaViewDefinition[] = [
  { value: 'overview', label: 'Dashboard', shortLabel: 'Dashboard', icon: LayoutDashboard },
  { value: 'timeline', label: 'Linha do tempo', shortLabel: 'Timeline', icon: Route },
  { value: 'completed', label: 'Eventos concluídos', shortLabel: 'Concluídos', icon: BadgeCheck },
  { value: 'undated', label: 'Pendências', shortLabel: 'Pendências', icon: CalendarClock },
  { value: 'calendar', label: 'Calendário', shortLabel: 'Calendário', icon: CalendarDays },
];

export const CRONOGRAMA_VIEWS = CRONOGRAMA_VIEW_DEFINITIONS.map(({ value }) => value);

export const CRONOGRAMA_VIEW_LABELS = Object.fromEntries(
  CRONOGRAMA_VIEW_DEFINITIONS.map(({ value, label }) => [value, label]),
) as Record<CronogramaView, string>;

export const CRONOGRAMA_DEFAULT_VIEW: CronogramaView = 'timeline';

export function resolveCronogramaView(searchParams: URLSearchParams): CronogramaView {
  const requested = searchParams.get('view');
  if (requested && CRONOGRAMA_VIEWS.includes(requested as CronogramaView)) {
    return requested as CronogramaView;
  }
  return CRONOGRAMA_DEFAULT_VIEW;
}
