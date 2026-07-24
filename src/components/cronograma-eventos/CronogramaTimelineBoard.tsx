import { useCallback, useMemo } from 'react';
import {
  BadgeCheck,
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
import { useTimelineCycleNavigation, type TimelinePositionChange } from '@/hooks/useTimelineCycleNavigation';
import {
  buildCronogramaYearSummaries,
  CRONOGRAMA_CYCLE,
  getCronogramaCycleStage,
  getCurrentCycleYear,
  getFirstRelevantMonthForYear,
  type CronogramaCycleYear,
} from '@/lib/cronograma-cycle';
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
import { formatLongDate } from './dateUtils';
import { TimelineCycleNavigator } from './TimelineCycleNavigator';
import type { CronogramaEvent } from './types';

const monthYearFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const NOOP = () => undefined;
type TimelineVariant = 'timeline' | 'completed';

const monthShortFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'short',
  timeZone: 'UTC',
});

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  const label = monthYearFormatter.format(new Date(Date.UTC(year, month - 1, 1, 12)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function CronogramaTimelineBoard({
  events,
  allEvents,
  selectedEventId = null,
  onOpen,
  onClearFilters,
  onReturnToFullCycle,
  onOpenUndated,
  requestedYear = null,
  requestedMonth = null,
  temporalFocusKey = 'all',
  preferredTemporalYear = null,
  onPositionChange,
  todayKey: todayKeyOverride,
  variant = 'timeline',
}: {
  events: CronogramaEvent[];
  allEvents?: CronogramaEvent[];
  selectedEventId?: string | null;
  onOpen: (event: CronogramaEvent) => void;
  onClearFilters: () => void;
  onReturnToFullCycle?: () => void;
  onOpenUndated?: () => void;
  requestedYear?: CronogramaCycleYear | null;
  requestedMonth?: string | null;
  temporalFocusKey?: string;
  preferredTemporalYear?: CronogramaCycleYear | null;
  onPositionChange?: (change: TimelinePositionChange) => void;
  todayKey?: string;
  variant?: TimelineVariant;
}) {
  const completeEvents = allEvents ?? events;
  const returnToFullCycle = onReturnToFullCycle ?? onClearFilters;
  const openUndated = onOpenUndated ?? NOOP;
  const todayKey = todayKeyOverride ?? getTodayKey();
  const grouped = useMemo(() => groupTimelineByMonth(events), [events]);
  const monthKeys = useMemo(() => Array.from(grouped.keys()), [grouped]);
  const monthKeysByYear = useMemo(() => Object.fromEntries(
    CRONOGRAMA_CYCLE.map(({ year }) => [
      year,
      monthKeys.filter((key) => key.startsWith(`${year}-`)),
    ]),
  ) as Record<CronogramaCycleYear, string[]>, [monthKeys]);
  const summaries = useMemo(
    () => buildCronogramaYearSummaries(completeEvents, events),
    [completeEvents, events],
  );
  const firstMonthByYear = useMemo(() => Object.fromEntries(
    CRONOGRAMA_CYCLE.map(({ year }) => [year, getFirstRelevantMonthForYear(events, year, todayKey)]),
  ) as Record<CronogramaCycleYear, string | null>, [events, todayKey]);
  const availableYears = useMemo(
    () => summaries.filter((summary) => summary.available).map((summary) => summary.year),
    [summaries],
  );
  const initialMonth = useMemo(
    () => monthKeys.length ? getInitialTimelineMonth(events, todayKey) : null,
    [events, monthKeys.length, todayKey],
  );
  const snapshot = useMemo(() => getTimelineSnapshot(events, todayKey), [events, todayKey]);
  const undated = useMemo(() => events.filter((event) => !event.date), [events]);
  const navigation = useTimelineCycleNavigation({
    monthKeys,
    firstMonthByYear,
    availableYears,
    initialMonth,
    requestedYear,
    requestedMonth,
    todayKey,
    temporalFocusKey,
    preferredTemporalYear,
    onPositionChange,
  });
  const currentYear = getCurrentCycleYear(todayKey);
  const selectedSummary = summaries.find((summary) => summary.year === navigation.selectedYear)!;
  const focusedLabel = navigation.focusedMonth
    ? monthLabel(navigation.focusedMonth)
    : `${navigation.selectedYear} · ${selectedSummary.stage}`;
  const reflectEventMonth = navigation.reflectEventMonth;

  const openTimelineEvent = useCallback((event: CronogramaEvent) => {
    if (event.date) reflectEventMonth(event.date.slice(0, 7));
    onOpen(event);
  }, [onOpen, reflectEventMonth]);

  return (
    <section
      className="cronograma-timeline-shell"
      data-variant={variant}
      aria-label={variant === 'completed' ? 'Eventos concluídos por período' : 'Linha do tempo operacional'}
    >
      <TimelineCycleNavigator
        summaries={summaries}
        selectedYear={navigation.selectedYear}
        currentYear={currentYear}
        onSelectYear={navigation.selectYear}
      />

      <div className="cronograma-timeline-workspace">
        <nav
          className="cronograma-temporal-nav"
          aria-label={variant === 'completed' ? 'Navegação do histórico concluído' : 'Navegação entre períodos'}
        >
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-muted-foreground">
              {variant === 'completed' ? 'Arquivo em foco' : 'Período em foco'}
            </p>
            <p className="truncate text-lg font-black tracking-tight text-foreground">{focusedLabel}</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={navigation.goToToday}
              className="h-9 rounded-lg px-3 text-xs"
              aria-label="Ir para o período de hoje"
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Ir para hoje</span>
              <span className="sm:hidden">Hoje</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!navigation.previousMonth}
              onClick={() => navigation.previousMonth && navigation.goToMonth(navigation.previousMonth)}
              className="h-9 w-9 rounded-lg"
              aria-label="Período anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!navigation.nextMonth}
              onClick={() => navigation.nextMonth && navigation.goToMonth(navigation.nextMonth)}
              className="h-9 w-9 rounded-lg"
              aria-label="Próximo período"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </nav>

        <p className="sr-only" aria-live="polite" aria-atomic="true">
          Ano em foco {navigation.selectedYear}, etapa {selectedSummary.stage}.
        </p>

        <div className="cronograma-month-stream">
          {CRONOGRAMA_CYCLE.map(({ year }) => {
            const yearMonthKeys = monthKeysByYear[year];
            const focusedMonthMissing = navigation.selectedYear === year
              && (!navigation.focusedMonth || !grouped.has(navigation.focusedMonth));
            const placeholderKey = focusedMonthMissing
              ? navigation.focusedMonth ?? `${year}-00`
              : null;
            const streamKeys = placeholderKey
              ? [...yearMonthKeys, placeholderKey].sort()
              : yearMonthKeys;

            return (
              <section
                key={year}
                className="cronograma-year-stream"
                data-year={year}
                aria-label={`${year}, etapa ${getCronogramaCycleStage(year).stage}`}
              >
                {streamKeys.map((key) => {
                  if (key === placeholderKey) {
                    const keyForObserver = navigation.focusedMonth ? `month:${navigation.focusedMonth}` : `year:${year}`;
                    return (
                      <TimelineYearEmptyState
                        key={`empty-${key}`}
                        focusKey={keyForObserver}
                        registerFocusNode={navigation.registerFocusNode}
                        summary={selectedSummary}
                        focusedMonth={navigation.focusedMonth}
                        onClearFilters={onClearFilters}
                        onReturnToFullCycle={returnToFullCycle}
                        onOpenUndated={openUndated}
                      />
                    );
                  }

                  const monthEvents = grouped.get(key) ?? [];
                  const summary = getMonthOperationalSummary(monthEvents);
                  const open = navigation.expandedMonths[key] ?? false;
                  const [monthYear] = key.split('-').map(Number);
                  const isCurrent = key === todayKey.slice(0, 7);
                  return (
                    <section
                      key={key}
                      ref={(node) => navigation.registerFocusNode(`month:${key}`, node)}
                      data-focus-key={`month:${key}`}
                      data-month={key}
                       data-current={isCurrent || undefined}
                       data-active={navigation.focusedMonth === key || undefined}
                       data-open={open || undefined}
                      className="cronograma-month-section"
                      aria-labelledby={`cronograma-month-${key}`}
                    >
                      <button
                        type="button"
                        onClick={() => navigation.toggleMonth(key)}
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
                            <span className="rounded-full bg-primary/[0.06] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-primary">{getCronogramaCycleStage(monthYear).stage}</span>
                            {variant === 'completed' && <span className="cronograma-archive-month-label">Histórico</span>}
                            {isCurrent && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.12em] text-amber-950">Mês atual</span>}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                            {variant === 'completed' ? (
                              <>
                                <span>{summary.total} registros históricos</span>
                                <span>{summary.completed} concluídos manualmente</span>
                              </>
                            ) : (
                              <>
                                <span>{summary.total} eventos</span>
                                <span>{summary.completed} concluídos</span>
                                {summary.overdue > 0 && <span className="font-bold text-red-800">{summary.overdue} atrasados</span>}
                                {summary.pending > 0 && <span>{summary.pending} pendentes</span>}
                              </>
                            )}
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
                              selected={selectedEventId === event.id}
                              todayKey={todayKey}
                              isNextOfficial={variant === 'timeline' && snapshot.nextOfficialAction?.id === event.id}
                              variant={variant}
                              onOpen={openTimelineEvent}
                            />
                          ))}
                        </div>
                      )}
                    </section>
                  );
                })}
              </section>
            );
          })}
        </div>

        {undated.length > 0 && (
          <section
            className="cronograma-undated-section"
            data-variant={variant}
            aria-labelledby="cronograma-undated-title"
          >
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-900/10 px-4 py-3 sm:px-5">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-amber-900/70">
                  {variant === 'completed' ? 'Arquivo sem data' : 'Backlog institucional'}
                </p>
                <h3 id="cronograma-undated-title" className="mt-1 text-lg font-black tracking-tight text-foreground">
                  {variant === 'completed' ? 'Concluídos sem data registrada' : 'Ações aguardando definição de data'}
                </h3>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 font-mono text-xs font-bold text-amber-950">{undated.length}</span>
            </header>
            <div className="divide-y divide-amber-900/10">
              {undated.slice(0, 8).map((event) => (
                <button key={event.id} type="button" onClick={() => openTimelineEvent(event)} className="cronograma-undated-action focus-ring">
                  {variant === 'completed'
                    ? <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" aria-hidden="true" />
                    : <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" aria-hidden="true" />}
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-sm font-bold text-foreground">{event.title}</span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {variant === 'completed'
                        ? 'Concluído manualmente sem data histórica registrada.'
                        : event.pendingReason || 'Aguardando agendamento institucional.'}
                    </span>
                  </span>
                  <CronogramaPriorityIndicator priority={event.priority} compact />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}

function TimelineYearEmptyState({
  focusKey,
  registerFocusNode,
  summary,
  focusedMonth,
  onClearFilters,
  onReturnToFullCycle,
  onOpenUndated,
}: {
  focusKey: string;
  registerFocusNode: (key: string, node: HTMLElement | null) => void;
  summary: ReturnType<typeof buildCronogramaYearSummaries>[number];
  focusedMonth: string | null;
  onClearFilters: () => void;
  onReturnToFullCycle: () => void;
  onOpenUndated: () => void;
}) {
  const focusedMonthLabel = focusedMonth ? monthLabel(focusedMonth) : null;
  let title = `Nenhum evento encontrado em ${summary.year} com os filtros atuais.`;
  let description = 'Os filtros foram preservados. Ajuste o recorte ou escolha outro ano no ciclo.';

  if (!summary.available) {
    title = `Ainda não há eventos cadastrados em ${summary.year}.`;
    description = 'A etapa continua visível no ciclo e será habilitada quando receber eventos.';
  } else if (summary.undatedFiltered > 0 && summary.datedFiltered === 0) {
    title = `${summary.undatedFiltered} ${summary.undatedFiltered === 1 ? 'evento atende' : 'eventos atendem'} aos filtros, mas ${summary.undatedFiltered === 1 ? 'ainda não possui' : 'ainda não possuem'} data.`;
    description = `Consulte as pendências sem data de ${summary.year} ou mantenha os filtros para escolher outra etapa.`;
  } else if (focusedMonthLabel && summary.datedFiltered > 0) {
    title = `Nenhum evento encontrado em ${focusedMonthLabel} com os filtros atuais.`;
    description = `Há outros meses disponíveis em ${summary.year}; use os controles de período para continuar a navegação.`;
  }

  return (
    <section
      ref={(node) => registerFocusNode(focusKey, node)}
      data-focus-key={focusKey}
      className="cronograma-empty-state cronograma-year-empty-state"
      role="status"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/[0.07] text-primary">
        <SearchX className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-black tracking-tight text-foreground">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="cronograma-year-empty-actions">
        {summary.undatedFiltered > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={onOpenUndated} className="rounded-lg">
            <CalendarClock className="h-4 w-4" />Ver sem data
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onReturnToFullCycle} className="rounded-lg">
          Ver todo o ciclo
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClearFilters} className="rounded-lg text-primary">
          <CircleAlert className="h-4 w-4" />Limpar filtros
        </Button>
      </div>
    </section>
  );
}

function TimelineEventRow({
  event,
  selected,
  todayKey,
  isNextOfficial,
  variant,
  onOpen,
}: {
  event: CronogramaEvent;
  selected: boolean;
  todayKey: string;
  isNextOfficial: boolean;
  variant: TimelineVariant;
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
      data-selected={selected || undefined}
      data-variant={variant}
      data-derived-complete={variant === 'completed' && event.status !== 'completed' || undefined}
      data-event-id={event.id}
      aria-pressed={selected}
      aria-label={`${event.title}. ${formatLongDate(event.date)}. Status ${statusLabels[event.status]}.${variant === 'completed' ? ' Classificado em eventos concluídos.' : ''}`}
    >
      <span className="cronograma-event-date-block">
        <strong className="font-mono text-xl leading-none text-foreground">{String(dateObject.getUTCDate()).padStart(2, '0')}</strong>
        <span className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.13em] text-muted-foreground">
          {monthShortFormatter.format(dateObject).replace('.', '')}
        </span>
        <span className="cronograma-event-time">{event.startTime || '—'}</span>
      </span>

      <span className="cronograma-event-rail" aria-hidden="true"><span /></span>

      <span className="min-w-0 flex-1 text-left">
        <span className="flex flex-wrap items-center gap-2">
          <strong className="text-sm font-black leading-snug text-foreground sm:text-[15px]">{event.title}</strong>
          {isNextOfficial && <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.1em] text-amber-950"><Sparkles className="h-3 w-3" />Próxima ação</span>}
          {isToday && <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.1em] text-white">Hoje</span>}
          {variant === 'completed' && (
            <span className="cronograma-archive-state">
              {event.status === 'completed' ? 'Concluído' : 'Encerrado por data'}
            </span>
          )}
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

export function CronogramaTimelineSkeleton() {
  return (
    <div className="space-y-3" aria-label="Carregando linha do tempo" aria-busy="true">
      <div className="h-16 animate-pulse rounded-xl border border-border/50 bg-white/70" />
      {[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-xl border border-border/50 bg-white/60" />)}
    </div>
  );
}
