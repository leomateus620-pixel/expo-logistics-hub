import {
  BadgeCheck,
  CalendarClock,
  Route,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { CronogramaView } from './types';

const tabs: Array<{ value: CronogramaView; label: string; shortLabel: string; icon: LucideIcon }> = [
  { value: 'timeline', label: 'Linha do tempo', shortLabel: 'Timeline', icon: Route },
  { value: 'completed', label: 'Eventos concluídos', shortLabel: 'Concluídos', icon: BadgeCheck },
  { value: 'undated', label: 'Pendências', shortLabel: 'Pendências', icon: CalendarClock },
];

export function CronogramaViewTabs({
  activeView,
  onChange,
}: {
  activeView: CronogramaView;
  onChange: (view: CronogramaView) => void;
}) {
  const hasActiveTab = tabs.some((tab) => tab.value === activeView);
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    onChange(nextTab.value);
    document.getElementById(`cronograma-tab-${nextTab.value}`)?.focus();
  };

  return (
    <nav className="cronograma-view-nav" aria-label="Visões do cronograma">
      <div className="cronograma-view-track" role="tablist" aria-orientation="horizontal">
        {tabs.map((tab, index) => {
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
              tabIndex={active || (!hasActiveTab && index === 0) ? 0 : -1}
              onClick={() => onChange(tab.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
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
  ariaLabel,
}: {
  view: CronogramaView;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <section
      key={view}
      id="cronograma-view-panel"
      role="tabpanel"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : `cronograma-tab-${view}`}
      tabIndex={0}
      className="cronograma-view-transition min-h-[430px] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
    >
      {children}
    </section>
  );
}
