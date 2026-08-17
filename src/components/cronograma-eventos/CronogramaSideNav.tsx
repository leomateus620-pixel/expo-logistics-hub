import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';
import { BadgeCheck, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CronogramaCycleSlotTarget } from './CronogramaCycleSlot';
import { useCronogramaShell } from './CronogramaShellContext';
import { CRONOGRAMA_VIEW_DEFINITIONS } from './cronogramaViews';
import type { CronogramaView } from './types';

const NAV_ORDER: CronogramaView[] = ['timeline', 'overview', 'undated', 'calendar'];
const STORAGE_KEY = 'cronograma:sidenav-collapsed';

export interface CronogramaSideNavItem {
  value: CronogramaView;
  label: string;
  icon: typeof BadgeCheck;
}

export function useCronogramaSideNavItems(): CronogramaSideNavItem[] {
  return NAV_ORDER
    .map((value) => CRONOGRAMA_VIEW_DEFINITIONS.find((view) => view.value === value))
    .filter(Boolean)
    .map((view) => ({ value: view!.value, label: view!.label, icon: view!.icon }))
    .concat([{ value: 'completed', label: 'Histórico concluído', icon: BadgeCheck }]);
}

interface CronogramaSideNavProps {
  activeView: CronogramaView;
  onChange: (view: CronogramaView) => void;
  filters?: ReactNode;
}

/** Compact left rail that concentrates views, cycle years and filters. */
export const CronogramaSideNav = memo(function CronogramaSideNav({
  activeView,
  onChange,
  filters,
}: CronogramaSideNavProps) {
  const items = useCronogramaSideNavItems();
  const shell = useCronogramaShell();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* storage indisponível */
    }
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((value) => !value), []);

  return (
    <TooltipProvider delayDuration={220}>
      <aside
        className="cronograma-sidenav"
        data-collapsed={collapsed || undefined}
        aria-label="Navegação da Agenda Fenasoja"
      >
        <div className="cronograma-sidenav__head">
          {!collapsed && <span className="cronograma-sidenav__eyebrow">Navegação</span>}
          <button
            type="button"
            onClick={toggle}
            className="cronograma-sidenav__toggle focus-ring"
            aria-label={collapsed ? 'Expandir navegação' : 'Recolher navegação'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
          </button>
        </div>

        {shell?.createAction && (
          <div className="cronograma-sidenav__primary">
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => shell.createAction?.()}
                    className="cronograma-sidenav__create focus-ring"
                    aria-label="Novo evento"
                  >
                    <Plus aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Novo evento</TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={() => shell.createAction?.()}
                className="cronograma-sidenav__create focus-ring"
              >
                <Plus aria-hidden="true" />
                <span>Novo evento</span>
              </button>
            )}
          </div>
        )}

        <nav className="cronograma-sidenav__group" aria-label="Visões do cronograma">
          {items.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.value;
            const button = (
              <button
                key={item.value}
                type="button"
                onClick={() => onChange(item.value)}
                className={cn('cronograma-sidenav__item focus-ring')}
                data-active={active || undefined}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
              >
                <Icon aria-hidden="true" />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );

            if (!collapsed) return button;
            return (
              <Tooltip key={item.value}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <div className="cronograma-sidenav__section">
          {!collapsed && <span className="cronograma-sidenav__eyebrow">Ciclo</span>}
          <CronogramaCycleSlotTarget className="cronograma-sidenav__cycle" />
        </div>

        {filters && (
          <div className="cronograma-sidenav__section cronograma-sidenav__filters">
            {!collapsed && <span className="cronograma-sidenav__eyebrow">Filtros</span>}
            {filters}
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
});
