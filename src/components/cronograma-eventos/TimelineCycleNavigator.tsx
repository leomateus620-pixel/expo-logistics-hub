import { useEffect, useRef, type CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CronogramaCycleYear, CronogramaYearSummary } from '@/lib/cronograma-cycle';
import { CycleYearMark } from './CycleYearMark';

function eventCountLabel(count: number) {
  return `${count} ${count === 1 ? 'evento' : 'eventos'}`;
}

function accessibleYearLabel(summary: CronogramaYearSummary, selected: boolean, current: boolean) {
  const parts = [
    selected ? `${summary.year} selecionado` : `Selecionar ${summary.year}`,
    `etapa ${summary.stage}`,
    eventCountLabel(summary.total),
  ];
  if (summary.filtered !== summary.total) {
    parts.push(`${summary.filtered} correspondem aos filtros atuais`);
  }
  if (current) parts.push('ano atual');
  if (!summary.available) parts.push('ano indisponível');
  return `${parts.join(', ')}.`;
}

export function TimelineCycleNavigator({
  summaries,
  selectedYear,
  currentYear,
  onSelectYear,
}: {
  summaries: CronogramaYearSummary[];
  selectedYear: CronogramaCycleYear;
  currentYear: CronogramaCycleYear | null;
  onSelectYear: (year: CronogramaCycleYear) => void;
}) {
  const selectedIndex = Math.max(0, summaries.findIndex((summary) => summary.year === selectedYear));
  const selectedButtonRef = useRef<HTMLButtonElement>(null);
  const progress = summaries.length > 1 ? selectedIndex / (summaries.length - 1) : 0;

  useEffect(() => {
    if (!window.matchMedia('(max-width: 1179px)').matches) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    selectedButtonRef.current?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }, [selectedYear]);

  return (
    <aside
      className="cronograma-cycle-navigator"
      aria-labelledby="cronograma-cycle-title"
      style={{ '--cycle-progress': progress } as CSSProperties}
    >
      <header className="cronograma-cycle-heading">
        <div className="min-w-0">
          <p className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
            Progresso do ciclo
          </p>
          <h2 id="cronograma-cycle-title" className="mt-1 text-base font-black tracking-tight text-foreground">
            Ciclo 2026–2028
          </h2>
        </div>
        <span className="cronograma-cycle-step" aria-label={`Etapa ${selectedIndex + 1} de ${summaries.length}`}>
          {selectedIndex + 1}/{summaries.length}
        </span>
      </header>

      <ol className="cronograma-cycle-years" aria-label="Anos do planejamento institucional">
        {summaries.map((summary) => {
          const selected = summary.year === selectedYear;
          const current = summary.year === currentYear;
          const showFiltered = summary.filtered !== summary.total;
          return (
            <li key={summary.year} className="cronograma-cycle-year-item">
              <button
                ref={selected ? selectedButtonRef : undefined}
                type="button"
                disabled={!summary.available}
                onClick={() => onSelectYear(summary.year)}
                className={cn('cronograma-cycle-year focus-ring', selected && 'is-selected')}
                data-selected={selected || undefined}
                data-current={current || undefined}
                data-no-match={summary.available && !summary.hasMatches || undefined}
                aria-current={selected ? 'step' : undefined}
                aria-pressed={selected}
                aria-label={accessibleYearLabel(summary, selected, current)}
              >
                <span className="cronograma-cycle-node" aria-hidden="true">
                  {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="cronograma-cycle-year-copy">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <strong className="font-mono text-base leading-none tracking-tight">
                      <CycleYearMark year={summary.year} />
                    </strong>
                    {current && <span className="cronograma-cycle-current-label">Ano atual</span>}
                  </span>
                  <span className="cronograma-cycle-stage">{summary.stage}</span>
                </span>
                <span className="cronograma-cycle-count" aria-hidden="true">
                  <strong>{showFiltered ? `${summary.filtered} de ${summary.total}` : summary.total}</strong>
                  <span>{summary.total === 1 ? 'evento' : 'eventos'}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <p className="cronograma-cycle-support">
        O ano em destaque acompanha o período visível. Selecione uma etapa para ir ao primeiro mês relevante.
      </p>
    </aside>
  );
}
