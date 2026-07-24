import {
  BadgeCheck,
  CalendarClock,
  Route,
  type LucideIcon,
} from 'lucide-react';
import type { CronogramaView } from '../types';

interface MobileCronogramaNavigationProps {
  activeView: CronogramaView;
  onChange: (view: CronogramaView) => void;
}

const primaryViews: Array<{ value: CronogramaView; label: string; icon: LucideIcon }> = [
  { value: 'timeline', label: 'Linha do tempo', icon: Route },
  { value: 'completed', label: 'Concluídos', icon: BadgeCheck },
  { value: 'undated', label: 'Pendências', icon: CalendarClock },
];

export function MobileCronogramaNavigation({
  activeView,
  onChange,
}: MobileCronogramaNavigationProps) {
  return (
    <nav className="cronograma-mobile-navigation" aria-label="Visões do cronograma">
      {primaryViews.map((view) => {
        const Icon = view.icon;
        const active = activeView === view.value;
        return (
          <button
            key={view.value}
            type="button"
            onClick={() => onChange(view.value)}
            className="cronograma-mobile-navigation-item"
            data-active={active || undefined}
            aria-current={active ? 'page' : undefined}
          >
            <Icon aria-hidden="true" />
            <span>{view.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
