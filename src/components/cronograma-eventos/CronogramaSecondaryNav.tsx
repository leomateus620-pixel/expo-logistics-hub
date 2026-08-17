import { memo } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CRONOGRAMA_VIEW_DEFINITIONS } from './cronogramaViews';
import type { CronogramaView } from './types';

interface CronogramaSecondaryNavProps {
  activeView: CronogramaView;
  onChange: (view: CronogramaView) => void;
}

const NAV_ORDER: CronogramaView[] = ['timeline', 'overview', 'undated', 'calendar'];

/** Discreet icon rail that keeps secondary views one click away from the timeline. */
export const CronogramaSecondaryNav = memo(function CronogramaSecondaryNav({
  activeView,
  onChange,
}: CronogramaSecondaryNavProps) {
  const items = NAV_ORDER
    .map((value) => CRONOGRAMA_VIEW_DEFINITIONS.find((view) => view.value === value))
    .filter(Boolean) as typeof CRONOGRAMA_VIEW_DEFINITIONS;

  return (
    <TooltipProvider delayDuration={220}>
      <nav className="cronograma-secondary-nav" aria-label="Visões do cronograma">
        {items.map((view) => {
          const Icon = view.icon;
          const active = activeView === view.value;
          return (
            <Tooltip key={view.value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onChange(view.value)}
                  className="cronograma-secondary-nav__item focus-ring"
                  data-active={active || undefined}
                  aria-current={active ? 'page' : undefined}
                  aria-label={view.label}
                >
                  <Icon aria-hidden="true" />
                  <span className="cronograma-secondary-nav__text">{view.shortLabel}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{view.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    </TooltipProvider>
  );
});
