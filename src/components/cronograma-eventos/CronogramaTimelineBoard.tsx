import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { CronogramaStatusIndicator } from './CronogramaBadges';
import { CRONOGRAMA_YEARS } from './cronogramaData';
import { compareEventDates, formatShortDateRange, getDateParts, getMonthLabel } from './dateUtils';
import type { CronogramaEvent } from './types';

const timelinePhase: Record<number, { kicker: string; title: string; description: string }> = {
  2026: {
    kicker: 'Fundação do ciclo',
    title: 'Estruturação',
    description: 'Governança, referências externas e primeiras definições constroem a base do planejamento institucional.',
  },
  2027: {
    kicker: 'Integração operacional',
    title: 'Consolidação',
    description: 'As comissões aproximam entregas, contratos, infraestrutura e programação em uma cadência compartilhada.',
  },
  2028: {
    kicker: 'Reta final',
    title: 'Realização',
    description: 'A frequência aumenta, as decisões críticas convergem e o calendário desemboca na realização da Fenasoja 2028.',
  },
};

export function CronogramaTimelineBoard({
  events,
  onOpen,
}: {
  events: CronogramaEvent[];
  onOpen: (event: CronogramaEvent) => void;
}) {
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const [activeYear, setActiveYear] = useState<number>(CRONOGRAMA_YEARS[0]);
  const yearSections = useRef<Partial<Record<number, HTMLElement>>>({});
  const dated = useMemo(() => events.filter((event) => event.date).sort(compareEventDates), [events]);

  const grouped = useMemo(() => {
    const map = new Map<number, Map<number, CronogramaEvent[]>>();
    dated.forEach((event) => {
      const parts = getDateParts(event.date);
      if (!parts) return;
      if (!map.has(parts.year)) map.set(parts.year, new Map());
      const yearMap = map.get(parts.year)!;
      if (!yearMap.has(parts.month)) yearMap.set(parts.month, []);
      yearMap.get(parts.month)!.push(event);
    });
    return map;
  }, [dated]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActiveYear(Number((visible.target as HTMLElement).dataset.year));
      },
      { rootMargin: '-22% 0px -58% 0px', threshold: [0.18, 0.35, 0.55] },
    );

    CRONOGRAMA_YEARS.forEach((year) => {
      const section = yearSections.current[year];
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, [grouped]);

  const scrollToYear = (year: number) => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    yearSections.current[year]?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="cronograma-scroll-story">
      <aside className="cronograma-story-index" aria-label="Navegação temporal por ano">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Progressão do ciclo</p>
        <h2 className="mt-1 text-xl font-black tracking-tight text-foreground">Da estrutura à feira</h2>
        <div className="cronograma-story-years">
          {CRONOGRAMA_YEARS.map((year) => {
            const count = Array.from(grouped.get(year)?.values() || []).flat().length;
            return (
              <button
                key={year}
                type="button"
                onClick={() => scrollToYear(year)}
                className="cronograma-story-year focus-ring"
                data-active={activeYear === year}
                aria-current={activeYear === year ? 'step' : undefined}
              >
                <span className="cronograma-story-year-node" aria-hidden="true" />
                <span>
                  <strong className="block font-mono text-lg leading-none">{year}</strong>
                  <span className="mt-1 block text-[11px] font-medium text-muted-foreground">{timelinePhase[year].title}</span>
                </span>
                <span className="ml-auto font-mono text-xs font-bold text-muted-foreground">{count}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          O destaque acompanha a rolagem e mantém o ano atual visível sem interromper a consulta.
        </p>
      </aside>

      <div className="space-y-5">
        {CRONOGRAMA_YEARS.map((year) => {
          const months = grouped.get(year) || new Map<number, CronogramaEvent[]>();
          const yearEvents = Array.from(months.values()).flat();
          const phase = timelinePhase[year];
          const firstMonth = Array.from(months.keys())[0];
          return (
            <section
              key={year}
              ref={(node) => {
                if (node) yearSections.current[year] = node;
              }}
              data-year={year}
              data-active={activeYear === year}
              className="cronograma-story-section scroll-mt-40"
              aria-labelledby={`timeline-year-${year}`}
            >
              <header className="cronograma-story-section-header">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">{phase.kicker}</p>
                  <h3 id={`timeline-year-${year}`} className="mt-1 flex flex-wrap items-baseline gap-3 text-3xl font-black tracking-tight text-foreground">
                    <span className="font-mono">{year}</span>
                    <span className="text-base font-bold text-primary">{phase.title}</span>
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{phase.description}</p>
                </div>
                <div className="text-right">
                  <strong className="block font-mono text-2xl text-primary">{yearEvents.length}</strong>
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">eventos datados</span>
                </div>
              </header>

              <div className="cronograma-story-months">
                {Array.from(months.entries()).map(([month, monthEvents]) => {
                  const key = `${year}-${month}`;
                  const open = openMonths[key] ?? month === firstMonth;
                  return (
                    <section key={key} className="cronograma-story-month">
                      <button
                        type="button"
                        onClick={() => setOpenMonths((value) => ({ ...value, [key]: !open }))}
                        className="cronograma-story-month-trigger focus-ring"
                        aria-expanded={open}
                      >
                        <span>
                          <span className="block text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Mês {String(month + 1).padStart(2, '0')}</span>
                          <span className="text-lg font-black tracking-tight text-foreground">{getMonthLabel(month)}</span>
                        </span>
                        <span className="flex items-center gap-2 text-xs font-bold text-primary">
                          {monthEvents.length} eventos
                          {open ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
                        </span>
                      </button>
                      {open && (
                        <div className="cronograma-story-event-list">
                          {monthEvents.map((event) => (
                            <TimelineItem key={event.id} event={event} onOpen={onOpen} />
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
                {yearEvents.length === 0 && (
                  <div className="cronograma-empty-row">Nenhum evento datado atende aos filtros em {year}.</div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TimelineItem({ event, onOpen }: { event: CronogramaEvent; onOpen: (event: CronogramaEvent) => void }) {
  return (
    <button type="button" onClick={() => onOpen(event)} className="cronograma-timeline-item group focus-ring">
      <span className="cronograma-timeline-node" data-main={event.isMain} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-gold">
          {formatShortDateRange(event.date, event.endDate)} · {event.startTime || 'horário a definir'}
        </span>
        <span className="mt-1 block text-sm font-bold leading-tight text-foreground group-hover:text-primary">{event.title}</span>
        <span className="mt-1 block truncate text-[11px] text-muted-foreground">{event.commission || event.owner || event.location || 'Contexto em definição'}</span>
      </span>
      <CronogramaStatusIndicator status={event.status} compact />
    </button>
  );
}
