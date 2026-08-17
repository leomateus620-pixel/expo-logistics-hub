import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { CronogramaCycleYear, CronogramaYearSummary } from '@/lib/cronograma-cycle';
import { cn } from '@/lib/utils';
import { useExclusiveMobileOverlay } from './mobileOverlayStore';
import '@/styles/cronograma-mobile-refit.css';

interface MobileCycleSwitcherProps {
  summaries: CronogramaYearSummary[];
  selectedYear: CronogramaCycleYear;
  currentYear: CronogramaCycleYear | null;
  onSelectYear: (year: CronogramaCycleYear) => void;
  className?: string;
}

/** Pílula compacta do ciclo: 2026 ▾ → lista curta com etapa e contagem. */
export function MobileCycleSwitcher({
  summaries,
  selectedYear,
  currentYear,
  onSelectYear,
  className,
}: MobileCycleSwitcherProps) {
  const [open, setOpen] = useExclusiveMobileOverlay('mobile-cycle');
  const selected = summaries.find((summary) => summary.year === selectedYear);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn('cronograma-mobile-switcher cronograma-mobile-switcher--cycle focus-ring', className)}
          data-open={open || undefined}
          aria-label={`${selectedYear}, etapa ${selected?.stage ?? 'ciclo oficial'}. Trocar ano`}
        >
          <strong>{selectedYear}</strong>
          {selected && <em>{selected.filtered === selected.total ? selected.total : `${selected.filtered}/${selected.total}`}</em>}
          <ChevronDown className="cronograma-mobile-switcher__chevron" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={8} className="cronograma-mobile-popover w-[14rem] p-2">
        <div className="cronograma-mobile-popover__list" role="group" aria-label="Ciclo 2026–2028">
          {summaries.map((summary) => (
            <button
              key={summary.year}
              type="button"
              disabled={!summary.available}
              onClick={() => {
                onSelectYear(summary.year);
                setOpen(false);
              }}
              className="cronograma-mobile-popover__item cronograma-mobile-popover__item--cycle focus-ring"
              data-active={summary.year === selectedYear || undefined}
              data-current={summary.year === currentYear || undefined}
              aria-pressed={summary.year === selectedYear}
            >
              <span className="cronograma-mobile-popover__year">
                <strong>{summary.year}</strong>
                <small>{summary.stage}</small>
              </span>
              <em>
                {summary.filtered === summary.total ? summary.total : `${summary.filtered}/${summary.total}`}
              </em>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
