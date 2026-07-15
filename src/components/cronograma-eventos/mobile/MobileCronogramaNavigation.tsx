import {
  CalendarRange,
  Check,
  ChevronDown,
  Columns3,
  Layers3,
  ListChecks,
  Map,
  Network,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { CronogramaView } from '../types';

interface MobileCronogramaNavigationProps {
  activeView: CronogramaView;
  onChange: (view: CronogramaView) => void;
}

const primaryViews: Array<{ value: CronogramaView; label: string; icon: LucideIcon }> = [
  { value: 'timeline', label: 'Linha do tempo', icon: Network },
  { value: 'overview', label: 'Visão geral', icon: Map },
];

const secondaryViews: Array<{ value: CronogramaView; label: string; shortLabel: string; icon: LucideIcon }> = [
  { value: 'calendar', label: 'Calendário', shortLabel: 'Calendário', icon: CalendarRange },
  { value: 'year', label: 'Por ano', shortLabel: 'Por ano', icon: Columns3 },
  { value: 'category', label: 'Por categoria', shortLabel: 'Categorias', icon: Layers3 },
  { value: 'meetings', label: 'Reuniões centrais', shortLabel: 'Reuniões', icon: UsersRound },
  { value: 'undated', label: 'Pendências sem data', shortLabel: 'Pendências', icon: ListChecks },
];

export function MobileCronogramaNavigation({
  activeView,
  onChange,
}: MobileCronogramaNavigationProps) {
  const activeSecondary = secondaryViews.find((view) => view.value === activeView);

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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="cronograma-mobile-navigation-item cronograma-mobile-navigation-more"
            data-active={Boolean(activeSecondary) || undefined}
            aria-label={activeSecondary
              ? `Mais visualizações, atual: ${activeSecondary.label}`
              : 'Mais visualizações'}
          >
            {activeSecondary ? <activeSecondary.icon aria-hidden="true" /> : <CalendarRange aria-hidden="true" />}
            <span>{activeSecondary?.shortLabel ?? 'Mais'}</span>
            <ChevronDown className="cronograma-mobile-navigation-chevron" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="cronograma-mobile-navigation-menu"
        >
          <DropdownMenuLabel className="cronograma-mobile-navigation-menu-label">
            Mais visualizações
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {secondaryViews.map((view) => {
            const Icon = view.icon;
            const active = activeView === view.value;
            return (
              <DropdownMenuItem
                key={view.value}
                onSelect={() => onChange(view.value)}
                className="cronograma-mobile-navigation-menu-item"
                aria-current={active ? 'page' : undefined}
              >
                <Icon aria-hidden="true" />
                <span>{view.label}</span>
                {active && <Check className="cronograma-mobile-navigation-menu-check" aria-hidden="true" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}
