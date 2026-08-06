import { useCronogramaFiltersSlot } from './CronogramaFiltersSlot';

/**
 * Compact navy surface that mirrors the cycle navigator shell, used on the views
 * that do not render the timeline (Dashboard, Calendário, Pendências).
 */
export function CronogramaCycleBar({ label = 'Visão operacional', title }: { label?: string; title: string }) {
  const filtersSlot = useCronogramaFiltersSlot();

  return (
    <section className="cronograma-cycle-navigator cronograma-cycle-bar" aria-label="Comando da visão">
      <header className="cronograma-cycle-heading">
        {filtersSlot && <div className="cronograma-cycle-filter-slot">{filtersSlot}</div>}
        <div className="min-w-0">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <h2 className="mt-1 text-base font-black tracking-tight text-foreground">{title}</h2>
        </div>
      </header>
    </section>
  );
}
