import { memo } from 'react';
import type { CronogramaCycleYear, CronogramaYearSummary } from '@/lib/cronograma-cycle';
import { cn } from '@/lib/utils';

interface CronogramaCycleChipsProps {
  summaries: CronogramaYearSummary[];
  selectedYear: CronogramaCycleYear;
  currentYear: CronogramaCycleYear | null;
  onSelectYear: (year: CronogramaCycleYear) => void;
}

/** Compact cycle selector that replaces the former vertical progress sidebar. */
export const CronogramaCycleChips = memo(function CronogramaCycleChips({
  summaries,
  selectedYear,
  currentYear,
  onSelectYear,
}: CronogramaCycleChipsProps) {
  return (
    <div className="cronograma-cycle-chips" role="group" aria-label="Ciclo 2026–2028">
      {summaries.map((summary) => {
        const selected = summary.year === selectedYear;
        const showFiltered = summary.filtered !== summary.total;
        return (
          <button
            key={summary.year}
            type="button"
            disabled={!summary.available}
            onClick={() => onSelectYear(summary.year)}
            className={cn('cronograma-cycle-chip focus-ring', selected && 'is-selected')}
            data-selected={selected || undefined}
            data-current={summary.year === currentYear || undefined}
            aria-pressed={selected}
            aria-label={`${summary.year}, etapa ${summary.stage}, ${summary.total} eventos`}
            title={`${summary.stage} · ${showFiltered ? `${summary.filtered} de ${summary.total}` : summary.total} eventos`}
          >
            <strong>{summary.year}</strong>
            <span>{showFiltered ? `${summary.filtered}/${summary.total}` : summary.total}</span>
          </button>
        );
      })}
    </div>
  );
});
