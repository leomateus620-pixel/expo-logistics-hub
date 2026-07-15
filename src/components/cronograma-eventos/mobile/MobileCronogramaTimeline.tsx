import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Layers3,
  ListChecks,
  MapPin,
  SearchX,
  Sparkles,
  UserRound,
} from 'lucide-react';
import type { TimelinePositionChange, TimelinePositionReason } from '@/hooks/useTimelineCycleNavigation';
import {
  buildCronogramaYearSummaries,
  CRONOGRAMA_CYCLE,
  getClosestCycleYear,
  getCurrentCycleYear,
  getFirstRelevantMonthForYear,
  isCronogramaCycleYear,
  type CronogramaCycleYear,
} from '@/lib/cronograma-cycle';
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
} from '../CronogramaBadges';
import { statusLabels } from '../cronogramaData';
import { compareEventDates, formatLongDate } from '../dateUtils';
import type { CronogramaEvent } from '../types';

const monthYearFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const monthShortFormatter = new Intl.DateTimeFormat('pt-BR', {
  month: 'short',
  timeZone: 'UTC',
});

const cycleMonths = CRONOGRAMA_CYCLE.flatMap(({ year }) => (
  Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`)
));

interface MobileCronogramaTimelineProps {
  events: CronogramaEvent[];
  allEvents?: CronogramaEvent[];
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
}

type MobileTimelinePosition = {
  year: CronogramaCycleYear;
  month: string;
};

function yearFromMonth(month: string | null | undefined): CronogramaCycleYear | null {
  if (!month || !/^20(?:26|27|28)-(?:0[1-9]|1[0-2])$/.test(month)) return null;
  return Number(month.slice(0, 4)) as CronogramaCycleYear;
}

function mobileMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  const label = monthYearFormatter.format(new Date(Date.UTC(year, month - 1, 1, 12)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function closestAvailableYear(
  preferred: CronogramaCycleYear,
  availableYears: CronogramaCycleYear[],
) {
  if (!availableYears.length || availableYears.includes(preferred)) return preferred;
  return availableYears
    .slice()
    .sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred))[0];
}

function resolveInitialPosition({
  requestedYear,
  requestedMonth,
  preferredTemporalYear,
  initialMonth,
  firstFilteredMonthByYear,
  firstCompleteMonthByYear,
  availableYears,
  todayKey,
}: {
  requestedYear: CronogramaCycleYear | null;
  requestedMonth: string | null;
  preferredTemporalYear: CronogramaCycleYear | null;
  initialMonth: string | null;
  firstFilteredMonthByYear: Record<CronogramaCycleYear, string | null>;
  firstCompleteMonthByYear: Record<CronogramaCycleYear, string | null>;
  availableYears: CronogramaCycleYear[];
  todayKey: string;
}): MobileTimelinePosition {
  const requestedMonthYear = yearFromMonth(requestedMonth);
  const initialYear = yearFromMonth(initialMonth);
  const preferredYear = requestedYear
    ?? requestedMonthYear
    ?? preferredTemporalYear
    ?? initialYear
    ?? getClosestCycleYear(todayKey);
  const year = closestAvailableYear(preferredYear, availableYears);
  const month = requestedMonthYear === year && requestedMonth
    ? requestedMonth
    : initialYear === year && initialMonth
      ? initialMonth
      : firstFilteredMonthByYear[year]
        ?? firstCompleteMonthByYear[year]
        ?? `${year}-01`;
  return { year, month };
}

export function MobileCronogramaTimeline({
  events,
  allEvents,
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
}: MobileCronogramaTimelineProps) {
  const completeEvents = allEvents ?? events;
  const todayKey = todayKeyOverride ?? getTodayKey();
  const grouped = useMemo(() => groupTimelineByMonth(events), [events]);
  const summaries = useMemo(
    () => buildCronogramaYearSummaries(completeEvents, events),
    [completeEvents, events],
  );
  const availableYears = useMemo(
    () => summaries.filter((summary) => summary.available).map((summary) => summary.year),
    [summaries],
  );
  const firstFilteredMonthByYear = useMemo(() => Object.fromEntries(
    CRONOGRAMA_CYCLE.map(({ year }) => [year, getFirstRelevantMonthForYear(events, year, todayKey)]),
  ) as Record<CronogramaCycleYear, string | null>, [events, todayKey]);
  const firstCompleteMonthByYear = useMemo(() => Object.fromEntries(
    CRONOGRAMA_CYCLE.map(({ year }) => [year, getFirstRelevantMonthForYear(completeEvents, year, todayKey)]),
  ) as Record<CronogramaCycleYear, string | null>, [completeEvents, todayKey]);
  const initialMonth = useMemo(
    () => getInitialTimelineMonth(events.length ? events : completeEvents, todayKey),
    [completeEvents, events, todayKey],
  );
  const firstMatchingYear = useMemo(
    () => events.find((event) => isCronogramaCycleYear(event.year))?.year ?? null,
    [events],
  );
  const [position, setPosition] = useState<MobileTimelinePosition>(() => resolveInitialPosition({
    requestedYear,
    requestedMonth,
    preferredTemporalYear,
    initialMonth,
    firstFilteredMonthByYear,
    firstCompleteMonthByYear,
    availableYears,
    todayKey,
  }));
  const requestedSignatureRef = useRef(`${requestedYear ?? ''}|${requestedMonth ?? ''}`);
  const temporalFocusRef = useRef(temporalFocusKey);
  const onPositionChangeRef = useRef(onPositionChange);

  useEffect(() => {
    onPositionChangeRef.current = onPositionChange;
  }, [onPositionChange]);

  const commitPosition = useCallback((
    year: CronogramaCycleYear,
    month: string | null,
    reason: TimelinePositionReason,
    replace: boolean,
  ) => {
    const resolvedYear = closestAvailableYear(year, availableYears);
    const resolvedMonth = yearFromMonth(month) === resolvedYear && month
      ? month
      : firstFilteredMonthByYear[resolvedYear]
        ?? firstCompleteMonthByYear[resolvedYear]
        ?? `${resolvedYear}-01`;
    setPosition({ year: resolvedYear, month: resolvedMonth });
    onPositionChangeRef.current?.({
      year: resolvedYear,
      month: resolvedMonth,
      reason,
      replace,
    });
  }, [availableYears, firstCompleteMonthByYear, firstFilteredMonthByYear]);

  useEffect(() => {
    const signature = `${requestedYear ?? ''}|${requestedMonth ?? ''}`;
    if (signature === requestedSignatureRef.current) return;
    requestedSignatureRef.current = signature;
    const monthYear = yearFromMonth(requestedMonth);
    const year = requestedYear ?? monthYear;
    if (!year) return;
    const resolvedYear = closestAvailableYear(year, availableYears);
    const month = monthYear === resolvedYear && requestedMonth
      ? requestedMonth
      : firstFilteredMonthByYear[resolvedYear]
        ?? firstCompleteMonthByYear[resolvedYear]
        ?? `${resolvedYear}-01`;
    setPosition({ year: resolvedYear, month });
  }, [availableYears, firstCompleteMonthByYear, firstFilteredMonthByYear, requestedMonth, requestedYear]);

  useEffect(() => {
    if (temporalFocusRef.current === temporalFocusKey) return;
    temporalFocusRef.current = temporalFocusKey;
    const preferredYear = preferredTemporalYear ?? yearFromMonth(initialMonth) ?? firstMatchingYear;
    if (!preferredYear) return;
    commitPosition(preferredYear, firstFilteredMonthByYear[preferredYear] ?? initialMonth, 'temporal-filter', true);
  }, [commitPosition, firstFilteredMonthByYear, firstMatchingYear, initialMonth, preferredTemporalYear, temporalFocusKey]);

  useEffect(() => {
    if (!availableYears.length || availableYears.includes(position.year)) return;
    commitPosition(position.year, null, 'reconcile', true);
  }, [availableYears, commitPosition, position.year]);

  const selectedSummary = summaries.find((summary) => summary.year === position.year) ?? summaries[0];
  const currentYear = getCurrentCycleYear(todayKey);
  const monthEvents = useMemo(
    () => [...(grouped.get(position.month) ?? [])].sort(compareEventDates),
    [grouped, position.month],
  );
  const monthSummary = useMemo(() => getMonthOperationalSummary(monthEvents), [monthEvents]);
  const snapshot = useMemo(() => getTimelineSnapshot(events, todayKey), [events, todayKey]);
  const selectedYearUndated = useMemo(
    () => events.filter((event) => event.year === position.year && !event.date),
    [events, position.year],
  );
  const monthIndex = cycleMonths.indexOf(position.month);
  const previousMonth = monthIndex > 0 ? cycleMonths[monthIndex - 1] : null;
  const nextMonth = monthIndex >= 0 && monthIndex < cycleMonths.length - 1 ? cycleMonths[monthIndex + 1] : null;
  const isCurrentMonth = position.month === todayKey.slice(0, 7);

  const selectYear = (year: CronogramaCycleYear) => {
    commitPosition(year, firstFilteredMonthByYear[year] ?? firstCompleteMonthByYear[year], 'year-select', false);
  };

  const goToMonth = (month: string) => {
    const year = yearFromMonth(month);
    if (!year) return;
    commitPosition(year, month, 'period-control', false);
  };

  const goToToday = () => {
    const year = getClosestCycleYear(todayKey);
    const todayMonth = yearFromMonth(todayKey.slice(0, 7)) === year
      ? todayKey.slice(0, 7)
      : firstFilteredMonthByYear[year] ?? firstCompleteMonthByYear[year];
    commitPosition(year, todayMonth, 'today', false);
  };

  return (
    <section className="cronograma-mobile-timeline" aria-label="Linha do tempo operacional móvel">
      <div className="cronograma-mobile-cycle" aria-labelledby="cronograma-mobile-cycle-title">
        <div className="cronograma-mobile-cycle-heading">
          <div>
            <p>Progressão do ciclo</p>
            <h2 id="cronograma-mobile-cycle-title">2026–2028</h2>
          </div>
          <span>{selectedSummary?.stage ?? 'Ciclo oficial'}</span>
        </div>

        <div className="cronograma-mobile-years" role="group" aria-label="Anos do planejamento institucional">
          {summaries.map((summary) => {
            const selected = summary.year === position.year;
            const current = summary.year === currentYear;
            return (
              <button
                key={summary.year}
                type="button"
                disabled={!summary.available}
                onClick={() => selectYear(summary.year)}
                className="cronograma-mobile-year"
                data-selected={selected || undefined}
                data-current={current || undefined}
                aria-pressed={selected}
                aria-label={`${summary.year}, etapa ${summary.stage}, ${summary.filtered === summary.total ? summary.total : `${summary.filtered} de ${summary.total}`} eventos${current ? ', ano atual' : ''}`}
              >
                <strong>{summary.year}</strong>
                <span>{summary.stage}</span>
                <small>{summary.filtered === summary.total ? summary.total : `${summary.filtered}/${summary.total}`} eventos</small>
              </button>
            );
          })}
        </div>
      </div>

      <nav className="cronograma-mobile-month-navigation" aria-label="Navegação entre meses">
        <button
          type="button"
          onClick={() => previousMonth && goToMonth(previousMonth)}
          disabled={!previousMonth}
          className="cronograma-mobile-month-button"
          aria-label="Mês anterior"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <div className="cronograma-mobile-month-context">
          <p>Período em foco</p>
          <h2>{mobileMonthLabel(position.month)}</h2>
          <span>{selectedSummary?.stage ?? position.year}</span>
        </div>
        <button
          type="button"
          onClick={() => nextMonth && goToMonth(nextMonth)}
          disabled={!nextMonth}
          className="cronograma-mobile-month-button"
          aria-label="Próximo mês"
        >
          <ChevronRight aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={goToToday}
          className="cronograma-mobile-today-button"
          data-current={isCurrentMonth || undefined}
        >
          <CalendarDays aria-hidden="true" />
          {isCurrentMonth ? 'Mês atual' : 'Ir para hoje'}
        </button>
      </nav>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {mobileMonthLabel(position.month)}, {monthEvents.length} {monthEvents.length === 1 ? 'evento' : 'eventos'}.
      </p>

      <div className="cronograma-mobile-month-summary">
        <div>
          <p>{mobileMonthLabel(position.month)}</p>
          <span>
            {monthSummary.total} {monthSummary.total === 1 ? 'evento' : 'eventos'} ·{' '}
            {monthSummary.completed} {monthSummary.completed === 1 ? 'concluído' : 'concluídos'}
          </span>
        </div>
        {monthSummary.overdue > 0 && <strong>{monthSummary.overdue} atrasados</strong>}
      </div>

      {monthEvents.length > 0 ? (
        <div className="cronograma-mobile-event-list">
          {monthEvents.map((event) => (
            <MobileTimelineEventCard
              key={event.id}
              event={event}
              todayKey={todayKey}
              isNextOfficial={snapshot.nextOfficialAction?.id === event.id}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : (
        <div className="cronograma-mobile-empty-month" role="status">
          <span className="cronograma-mobile-empty-icon"><SearchX aria-hidden="true" /></span>
          <h3>Nenhum evento neste mês</h3>
          <p>O período e os filtros foram preservados. Ajuste o recorte ou consulte o ciclo completo.</p>
          <div className="cronograma-mobile-empty-actions">
            {selectedYearUndated.length > 0 && onOpenUndated && (
              <button type="button" onClick={onOpenUndated}>
                <CalendarClock aria-hidden="true" />
                Ver sem data ({selectedYearUndated.length})
              </button>
            )}
            {onReturnToFullCycle && (
              <button type="button" onClick={onReturnToFullCycle}>Ver todo o ciclo</button>
            )}
            <button type="button" onClick={onClearFilters}>Limpar filtros</button>
          </div>
        </div>
      )}

      {monthEvents.length > 0 && selectedYearUndated.length > 0 && onOpenUndated && (
        <button type="button" onClick={onOpenUndated} className="cronograma-mobile-undated-link">
          <CalendarClock aria-hidden="true" />
          <span>
            <strong>{selectedYearUndated.length} {selectedYearUndated.length === 1 ? 'pendência' : 'pendências'} sem data</strong>
            <small>Consultar backlog de {position.year}</small>
          </span>
          <ChevronRight aria-hidden="true" />
        </button>
      )}
    </section>
  );
}

function MobileTimelineEventCard({
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
      className="cronograma-mobile-event-card"
      data-status={event.status}
      data-today={isToday || undefined}
      data-next={isNextOfficial || undefined}
      aria-label={`${event.title}. ${formatLongDate(event.date)}. Status ${statusLabels[event.status]}.`}
    >
      <span className="cronograma-mobile-event-date">
        <strong>{String(dateObject.getUTCDate()).padStart(2, '0')}</strong>
        <span>{monthShortFormatter.format(dateObject).replace('.', '')}</span>
        <small>{event.startTime || 'A definir'}</small>
      </span>

      <span className="cronograma-mobile-event-content">
        {(isNextOfficial || isToday) && (
          <span className="cronograma-mobile-event-highlights">
            {isNextOfficial && <span><Sparkles aria-hidden="true" />Próxima ação</span>}
            {isToday && <span>Hoje</span>}
          </span>
        )}

        <strong className="cronograma-mobile-event-title">{event.title}</strong>

        <span className="cronograma-mobile-event-badges">
          <CronogramaStatusIndicator status={event.status} />
          <CronogramaPriorityIndicator priority={event.priority} />
        </span>

        <span className="cronograma-mobile-event-category">
          <CronogramaCategoryMarker category={event.category} />
        </span>

        <span className="cronograma-mobile-event-metadata">
          {(event.owner || event.commission) && (
            <span>
              {event.owner ? <UserRound aria-hidden="true" /> : <Layers3 aria-hidden="true" />}
              <span>{event.owner || event.commission}</span>
            </span>
          )}
          {event.location && (
            <span>
              <MapPin aria-hidden="true" />
              <span>{event.location}</span>
            </span>
          )}
        </span>

        {progress.total > 0 && (
          <span className="cronograma-mobile-event-progress">
            <span aria-hidden="true"><span style={{ width: `${progress.percent}%` }} /></span>
            <small><ListChecks aria-hidden="true" />{progress.completed}/{progress.total}</small>
          </span>
        )}
      </span>

      <ChevronRight className="cronograma-mobile-event-chevron" aria-hidden="true" />
    </button>
  );
}
