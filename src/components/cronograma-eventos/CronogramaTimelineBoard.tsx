import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Layers3,
  ListChecks,
  MapPin,
  SearchX,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getInitialTimelineMonth,
  getMonthOperationalSummary,
  getSubeventProgress,
  getTimelineSnapshot,
  getTodayKey,
  groupTimelineByMonth,
} from '@/lib/cronograma-timeline';
import {
  CronogramaCategoryMarker,
  CronogramaPriorityIndicator,
  CronogramaStatusIndicator,
} from './CronogramaBadges';
import { statusLabels } from './cronogramaData';
import { formatLongDate, formatShortDateRange } from './dateUtils';
import type { CronogramaEvent } from './types';

const monthYearFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const monthShortFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'short',
  timeZone: 'UTC',
});

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  const label = monthYearFormatter.format(new Date(Date.UTC(year, month - 1, 1, 12)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function monthPhase(year: number) {
  if (year === 2026) return 'Estruturação';
  if (year === 2027) return 'Consolidação';
  return 'Realização';
}

export function CronogramaTimelineBoard({
  events,
  onOpen,
  onClearFilters,
}: {
  events: CronogramaEvent[];
  onOpen: (event: CronogramaEvent) => void;
  onClearFilters: () => void;
}) {
  const todayKey = getTodayKey();
  const grouped = useMemo(() => groupTimelineByMonth(events), [events]);
  const monthKeys = useMemo(() => Array.from(grouped.keys()), [grouped]);
  const initialMonth = useMemo(() => getInitialTimelineMonth(events, todayKey), [events, todayKey]);
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>(() => ({ [initialMonth]: true }));
  const [activeMonth, setActiveMonth] = useState(initialMonth);
  const monthRefs = useRef<Record<string, HTMLElement | null>>({});
  const positionedInitially = useRef(false);
  const snapshot = useMemo(() => getTimelineSnapshot(events, todayKey), [events, todayKey]);
  const undated = useMemo(() => events.filter((event) => !event.date), [events]);

  useEffect(() => {
    if (!monthKeys.length) return;
    if (!monthKeys.includes(activeMonth)) setActiveMonth(initialMonth);
    setOpenMonths((current) => current[initialMonth] ? current : { ...current, [initialMonth]: true });
  }, [activeMonth, initialMonth, monthKeys]);

  useEffect(() => {
    if (positionedInitially.current || !monthRefs.current[initialMonth]) return;
    const timer = window.setTimeout(() => {
      positionedInitially.current = true;
      monthRefs.current[initialMonth]?.scrollIntoView({ block: 'start', behavior: 'auto' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialMonth, monthKeys.length]);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveMonth((visible.target as HTMLElement).dataset.month ?? initialMonth);
    }, { rootMargin: '-38% 0px -50% 0px', threshold: [0.1, 0.35, 0.6] });
    monthKeys.forEach((key) => {
      const section = monthRefs.current[key];
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, [initialMonth, monthKeys]);

  const scrollToMonth = useCallback((monthKey: string) => {
    setOpenMonths((current) => ({ ...current, [monthKey]: true }));
    setActiveMonth(monthKey);
    window.setTimeout(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      monthRefs.current[monthKey]?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }, 0);
  }, []);

  const activeIndex = Math.max(0, monthKeys.indexOf(activeMonth));

  if (!events.length) {
    return <TimelineEmptyState onClear={onClearFilters} />;
  }

  return (
    <section className="cronograma-timeline-workspace" aria-label="Linha do tempo operacional">
      <nav className="cronograma-temporal-nav" aria-label="Navegação entre meses">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-muted-foreground">Período em foco</p>
          <p className="truncate text-lg font-black tracking-tight text-foreground">{monthLabel(activeMonth)}</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => scrollToMonth(initialMonth)}
            className="h-9 rounded-lg px-3 text-xs"
            aria-label="Ir para o mês atual"
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Ir para hoje</span>
            <span className="sm:hidden">Hoje</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={activeIndex <= 0}
            onClick={() => scrollToMonth(monthKeys[activeIndex - 1])}
            className="h-9 w-9 rounded-lg"
            aria-label="Período anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={activeIndex >= monthKeys.length - 1}
            onClick={() => scrollToMonth(monthKeys[activeIndex + 1])}
            className="h-9 w-9 rounded-lg"
            aria-label="Próximo período"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </nav>

      <div className="cronograma-month-stream">
        {monthKeys.map((key) => {
          const monthEvents = grouped.get(key) ?? [];
          const summary = getMonthOperationalSummary(monthEvents);
          const open = openMonths[key] ?? false;
          const [year] = key.split('-').map(Number);
          const isCurrent = key === todayKey.slice(0, 7);
          return (
            <section
              key={key}
              ref={(node) => { monthRefs.current[key] = node; }}
              data-month={key}
              data-current={isCurrent || undefined}
              data-active={activeMonth === key || undefined}
              className="cronograma-month-section"
              aria-labelledby={`cronograma-month-${key}`}
            >
              <button
                type="button"
                onClick={() => setOpenMonths((current) => ({ ...current, [key]: !open }))}
                className="cronograma-month-summary focus-ring"
                aria-expanded={open}
                aria-controls={`cronograma-month-events-${key}`}
              >
                <span className="cronograma-month-marker" aria-hidden="true">
                  <span>{key.slice(5)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong id={`cronograma-month-${key}`} className="text-base font-black tracking-tight text-foreground sm:text-lg">{monthLabel(key)}</strong>
                    <span className="rounded-full bg-primary/[0.06] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-primary">{monthPhase(year)}</span>
                    {isCurrent && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-amber-950">Mês atual</span>}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                    <span>{summary.total} eventos</span>
                    <span>{summary.completed} concluídos</span>
                    {summary.overdue > 0 && <span className="font-bold text-red-800">{summary.overdue} atrasados</span>}
                    {summary.pending > 0 && <span>{summary.pending} pendentes</span>}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs font-bold text-primary">
                  {open ? 'Recolher' : 'Ver mês'}
                  <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
                </span>
              </button>

              {open && (
                <div id={`cronograma-month-events-${key}`} className="cronograma-month-events">
                  {monthEvents.map((event) => (
                    <TimelineEventRow
                      key={event.id}
                      event={event}
                      todayKey={todayKey}
                      isNextOfficial={snapshot.nextOfficialAction?.id === event.id}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {undated.length > 0 && (
        <section className="cronograma-undated-section" aria-labelledby="cronograma-undated-title">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-900/10 px-4 py-3 sm:px-5">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-amber-900/70">Backlog institucional</p>
              <h3 id="cronograma-undated-title" className="mt-1 text-lg font-black tracking-tight text-foreground">Ações aguardando definição de data</h3>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 font-mono text-xs font-bold text-amber-950">{undated.length}</span>
          </header>
          <div className="divide-y divide-amber-900/10">
            {undated.slice(0, 8).map((event) => (
              <button key={event.id} type="button" onClick={() => onOpen(event)} className="cronograma-undated-action focus-ring">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" aria-hidden="true" />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-bold text-foreground">{event.title}</span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">{event.pendingReason || 'Aguardando agendamento institucional.'}</span>
                </span>
                <CronogramaPriorityIndicator priority={event.priority} compact />
              </button>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function TimelineEventRow({
  event,
  todayKey,
  isNextOfficial,
  onOpen,
}: {
  event: CronogramaEvent;
  todayKey: string;
  isNextOfficial: boolean;
  onOpen: (event: CronogramaEvent) => void;
}) {
  const progress = getSubeventProgress(event);
  const date = event.date!;
  const dateObject = new Date(`${date}T12:00:00Z`);
  const isToday = date === todayKey;

  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      className="cronograma-operational-event focus-ring"
      data-status={event.status}
      data-today={isToday || undefined}
      data-next={isNextOfficial || undefined}
      data-event-id={event.id}
      aria-label={`${event.title}. ${formatLongDate(event.date)}. Status ${statusLabels[event.status]}.`}
    >
      <span className="cronograma-event-date-block">
        <strong className="font-mono text-xl leading-none text-foreground">{String(dateObject.getUTCDate()).padStart(2, '0')}</strong>
        <span className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.13em] text-muted-foreground">
          {monthShortFormatter.format(dateObject).replace('.', '')}
        </span>
        <span className="mt-1 font-mono text-[9px] text-muted-foreground">{event.startTime || '—'}</span>
      </span>

      <span className="cronograma-event-rail" aria-hidden="true"><span /></span>

      <span className="min-w-0 flex-1 text-left">
        <span className="flex flex-wrap items-center gap-2">
          <strong className="text-sm font-black leading-snug text-foreground sm:text-[15px]">{event.title}</strong>
          {isNextOfficial && <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.1em] text-amber-950"><Sparkles className="h-3 w-3" />Próxima ação</span>}
          {isToday && <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.1em] text-white">Hoje</span>}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          <CronogramaCategoryMarker category={event.category} />
          {event.commission && <span className="inline-flex items-center gap-1"><Layers3 className="h-3 w-3" />{event.commission}</span>}
          {event.owner && <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" />{event.owner}</span>}
          {event.location && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3" /><span className="max-w-52 truncate">{event.location}</span></span>}
        </span>
        {progress.total > 0 && (
          <span className="mt-2 flex max-w-sm items-center gap-2">
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200" aria-hidden="true"><span className="block h-full rounded-full bg-primary" style={{ width: `${progress.percent}%` }} /></span>
            <span className="inline-flex items-center gap-1 font-mono text-[9px] font-bold text-muted-foreground"><ListChecks className="h-3 w-3" />{progress.completed}/{progress.total}</span>
          </span>
        )}
      </span>

      <span className="cronograma-event-state">
        <CronogramaStatusIndicator status={event.status} compact />
        <CronogramaPriorityIndicator priority={event.priority} compact />
      </span>
    </button>
  );
}

function TimelineEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <section className="cronograma-empty-state" role="status">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/[0.07] text-primary"><SearchX className="h-6 w-6" /></span>
      <div>
        <h2 className="text-lg font-black tracking-tight text-foreground">Nenhum evento corresponde aos filtros</h2>
        <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">A base continua disponível. Remova um ou mais filtros para voltar à sequência cronológica.</p>
      </div>
      <Button type="button" variant="outline" onClick={onClear} className="rounded-lg"><CircleAlert className="h-4 w-4" />Limpar filtros</Button>
    </section>
  );
}

export function CronogramaTimelineSkeleton() {
  return (
    <div className="space-y-3" aria-label="Carregando linha do tempo" aria-busy="true">
      <div className="h-16 animate-pulse rounded-xl border border-border/50 bg-white/70" />
      {[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl border border-border/50 bg-white/60" />)}
    </div>
  );
}
