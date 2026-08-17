import { ChevronDown, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useCronogramaSideNavItems } from '../CronogramaSideNav';
import { useCronogramaShell } from '../CronogramaShellContext';
import type { CronogramaView } from '../types';
import { useExclusiveMobileOverlay } from './mobileOverlayStore';
import '@/styles/cronograma-mobile-refit.css';

interface MobileViewSwitcherProps {
  activeView: CronogramaView;
  onChange: (view: CronogramaView) => void;
  className?: string;
}

/** Seletor único de visão: ícone + nome da visão atual, com popover curto e sólido. */
export function MobileViewSwitcher({ activeView, onChange, className }: MobileViewSwitcherProps) {
  const items = useCronogramaSideNavItems();
  const shell = useCronogramaShell();
  const [open, setOpen] = useExclusiveMobileOverlay('mobile-view');
  const active = items.find((item) => item.value === activeView);
  const ActiveIcon = active?.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn('cronograma-mobile-switcher focus-ring', className)}
          data-open={open || undefined}
          aria-label={`Visão atual: ${active?.label ?? 'Linha do tempo'}. Trocar visão`}
        >
          {ActiveIcon && <ActiveIcon aria-hidden="true" />}
          <span>{active?.label ?? 'Linha do tempo'}</span>
          <ChevronDown className="cronograma-mobile-switcher__chevron" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={8} className="cronograma-mobile-popover w-[15rem] p-2">
        {shell?.createAction && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              shell.createAction?.();
            }}
            className="cronograma-mobile-popover__create focus-ring"
          >
            <Plus aria-hidden="true" />
            <span>Novo evento</span>
          </button>
        )}

        <nav className="cronograma-mobile-popover__list" aria-label="Visões da agenda">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.value === activeView;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
                className="cronograma-mobile-popover__item focus-ring"
                data-active={isActive || undefined}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </PopoverContent>
    </Popover>
  );
}
