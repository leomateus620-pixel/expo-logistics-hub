import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { CronogramaView } from './types';
import { CRONOGRAMA_VIEW_DEFINITIONS } from './cronogramaViews';

export function CronogramaViewTabs({
  activeView,
  onChange,
}: {
  activeView: CronogramaView;
  onChange: (view: CronogramaView) => void;
}) {
  const hasActiveTab = CRONOGRAMA_VIEW_DEFINITIONS.some((tab) => tab.value === activeView);
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % CRONOGRAMA_VIEW_DEFINITIONS.length;
    if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + CRONOGRAMA_VIEW_DEFINITIONS.length)
        % CRONOGRAMA_VIEW_DEFINITIONS.length;
    }
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = CRONOGRAMA_VIEW_DEFINITIONS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = CRONOGRAMA_VIEW_DEFINITIONS[nextIndex];
    onChange(nextTab.value);
    const nextElement = document.getElementById(`cronograma-tab-${nextTab.value}`);
    nextElement?.focus();
    nextElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <nav className="cronograma-view-nav" aria-label="Visões do cronograma">
      <div className="cronograma-view-track" role="tablist" aria-orientation="horizontal">
        {CRONOGRAMA_VIEW_DEFINITIONS.map((tab, index) => {
          const active = activeView === tab.value;
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              id={`cronograma-tab-${tab.value}`}
              type="button"
              role="tab"
              aria-label={tab.label}
              aria-selected={active}
              aria-controls="cronograma-view-panel"
              tabIndex={active || (!hasActiveTab && index === 0) ? 0 : -1}
              onClick={() => onChange(tab.value)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn('cronograma-view-tab focus-ring', active && 'is-active')}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="hidden xl:inline">{tab.label}</span>
              <span className="xl:hidden">{tab.shortLabel}</span>
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
