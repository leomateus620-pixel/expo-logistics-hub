import { useEffect, useState, type ReactNode } from 'react';
import { PanelLeft, Plus } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCronogramaSideNavItems } from '../CronogramaSideNav';
import { useCronogramaShell } from '../CronogramaShellContext';
import type { CronogramaView } from '../types';

interface MobileCronogramaNavDrawerProps {
  activeView: CronogramaView;
  onChange: (view: CronogramaView) => void;
  children?: ReactNode;
}

/** Slide-in navigation used on mobile so the timeline keeps the whole viewport. */
export function MobileCronogramaNavDrawer({
  activeView,
  onChange,
  children,
}: MobileCronogramaNavDrawerProps) {
  const items = useCronogramaSideNavItems();
  const shell = useCronogramaShell();
  const [open, setOpen] = useState(false);
  const active = items.find((item) => item.value === activeView);

  useEffect(() => {
    setOpen(false);
  }, [activeView]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cronograma-mobile-nav-trigger focus-ring"
        aria-label="Abrir navegação do cronograma"
        aria-haspopup="dialog"
      >
        <PanelLeft aria-hidden="true" />
        <span>{active?.label ?? 'Navegação'}</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="cronograma-mobile-nav-sheet w-[17rem] p-0">
          <SheetHeader className="px-4 pb-2 pt-4 text-left">
            <SheetTitle className="text-base font-black tracking-tight">Navegação</SheetTitle>
          </SheetHeader>

          {shell?.createAction && (
            <div className="cronograma-sidenav__primary px-3 pb-3">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  shell.createAction?.();
                }}
                className="cronograma-sidenav__create focus-ring"
              >
                <Plus aria-hidden="true" />
                <span>Novo evento</span>
              </button>
            </div>
          )}

          <nav className="cronograma-sidenav__group px-3 pb-3" aria-label="Visões do cronograma">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  className="cronograma-sidenav__item focus-ring"
                  data-active={isActive || undefined}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {children && <div className="cronograma-mobile-nav-sheet__extra px-3 pb-5">{children}</div>}
        </SheetContent>
      </Sheet>
    </>
  );
}
