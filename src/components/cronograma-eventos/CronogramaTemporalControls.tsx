import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCronogramaShell } from './CronogramaShellContext';

/** Compact "hoje / anterior / próximo" controls hoisted into the executive top bar. */
export function CronogramaTemporalControls({ className }: { className?: string }) {
  const shell = useCronogramaShell();
  const nav = shell?.temporalNav;
  if (!nav) return null;

  return (
    <div className={cn('cronograma-command-temporal', className)} role="group" aria-label="Navegação entre períodos">
      <button
        type="button"
        onClick={nav.goToToday}
        className="cronograma-command-temporal__today focus-ring"
        aria-label="Ir para o período de hoje"
      >
        <CalendarDays aria-hidden="true" />
        <span>Hoje</span>
      </button>
      <button
        type="button"
        onClick={() => nav.goToPrevious?.()}
        disabled={!nav.goToPrevious}
        className="cronograma-command-temporal__step focus-ring"
        aria-label="Período anterior"
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => nav.goToNext?.()}
        disabled={!nav.goToNext}
        className="cronograma-command-temporal__step focus-ring"
        aria-label="Próximo período"
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}
