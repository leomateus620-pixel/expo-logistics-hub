import { Check, ChevronDown, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CRONOGRAMA_VIEW_DEFINITIONS } from '../cronogramaViews';
import type { CronogramaView } from '../types';

interface MobileCronogramaNavigationProps {
  activeView: CronogramaView;
  onChange: (view: CronogramaView) => void;
}

const primaryViews = CRONOGRAMA_VIEW_DEFINITIONS.slice(0, 3);
const secondaryViews = CRONOGRAMA_VIEW_DEFINITIONS.slice(3);

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
            aria-label={view.label}
            aria-current={active ? 'page' : undefined}
          >
            <Icon aria-hidden="true" />
            <span>{view.shortLabel}</span>
          </button>
        );
      })}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="cronograma-mobile-navigation-item cronograma-mobile-navigation-more"
            data-active={secondaryViews.some((view) => view.value === activeView) || undefined}
            aria-label="Abrir mais visões do cronograma"
          >
            <MoreHorizontal aria-hidden="true" />
            <span>Mais</span>
            <ChevronDown className="cronograma-mobile-navigation-chevron" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="cronograma-mobile-navigation-menu"
        >
          <DropdownMenuLabel className="cronograma-mobile-navigation-menu-label">
            Outras visões
          </DropdownMenuLabel>
          {secondaryViews.map((view) => {
            const Icon = view.icon;
            const active = activeView === view.value;
            return (
              <DropdownMenuItem
                key={view.value}
                onSelect={() => onChange(view.value)}
                className="cronograma-mobile-navigation-menu-item"
              >
                <Icon aria-hidden="true" />
                <span>{view.label}</span>
                {active && (
                  <Check
                    className="cronograma-mobile-navigation-menu-check"
                    aria-hidden="true"
                  />
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
