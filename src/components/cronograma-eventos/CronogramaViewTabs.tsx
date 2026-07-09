import {
  CalendarRange,
  Columns3,
  Layers3,
  ListChecks,
  Map,
  Network,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { CronogramaView } from './types';

const tabs: Array<{ value: CronogramaView; label: string; shortLabel: string; icon: LucideIcon }> = [
  { value: 'overview', label: 'Visão geral', shortLabel: 'Visão', icon: Map },
  { value: 'timeline', label: 'Linha do tempo', shortLabel: 'Timeline', icon: Network },
  { value: 'calendar', label: 'Calendário', shortLabel: 'Calendário', icon: CalendarRange },
  { value: 'year', label: 'Por ano', shortLabel: 'Anos', icon: Columns3 },
  { value: 'category', label: 'Por categoria', shortLabel: 'Categorias', icon: Layers3 },
  { value: 'meetings', label: 'Reuniões centrais', shortLabel: 'Reuniões', icon: UsersRound },
  { value: 'undated', label: 'Pendências sem data', shortLabel: 'Pendências', icon: ListChecks },
];

export function CronogramaViewTabs({
  activeView,
  onChange,
}: {
  activeView: CronogramaView;
  onChange: (view: CronogramaView) => void;
}) {
  return (
    <nav className="cronograma-view-nav" aria-label="Visões do cronograma">
      <div className="cronograma-view-track" role="tablist" aria-orientation="horizontal">
        {tabs.map((tab) => {
          const active = activeView === tab.value;
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              id={`cronograma-tab-${tab.value}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="cronograma-view-panel"
              onClick={() => onChange(tab.value)}
              className={cn('cronograma-view-tab focus-ring', active && 'is-active')}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function ViewContentTransition({
  view,
  children,
}: {
  view: CronogramaView;
  children: ReactNode;
}) {
  return (
    <section
      key={view}
      id="cronograma-view-panel"
      role="tabpanel"
      aria-labelledby={`cronograma-tab-${view}`}
      tabIndex={0}
      className="cronograma-view-transition min-h-[430px] focus-visible:outline-none"
    >
      {children}
    </section>
  );
}
