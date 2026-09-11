import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  AgendaCallbacks,
  AgendaDashboardViewModel,
  AgendaEventViewModel,
  AgendaFilterState,
  AgendaLoadState,
  AgendaMonthFilter,
  CommissionUnitViewModel,
  DocumentViewModel,
  EventHistoryEntry,
  PersonSummary,
  UnitSummary,
} from '../types';
import {
  buildDashboard,
  collectLocations,
  collectPeople,
  countActiveSecondaryFilters,
  countEventsByMonth,
  createDefaultFilters,
  filterEvents,
  getAvailableYears,
  getNextEvent,
  getTodayKey,
  isCompletedLike,
} from '../lib/agenda-presentation';
import { unitArticleLabel } from '../lib/workspace-navigation';
import { AgendaCalendarView } from './AgendaCalendarView';
import { AgendaMonthSelector, AgendaStatusTabs, AgendaToolbar, AgendaYearSelector } from './AgendaControls';
import { AgendaDashboard } from './AgendaDashboard';
import { AgendaFiltersSheet } from './AgendaFiltersSheet';
import { AgendaPageSkeleton } from './AgendaSkeleton';
import { AgendaErrorState, AgendaNoEventsState, AgendaSearchEmptyState } from './AgendaStates';
import { AgendaTimeline } from './AgendaTimeline';
import { DocumentsPanel } from './DocumentsPanel';
import { EventDetailSheet } from './EventDetail';
import { EventFormSheet, type AgendaEventDraft } from './EventFormShell';
import { WorkspaceButton } from './primitives';

export interface CommissionAgendaPageProps extends AgendaCallbacks {
  unit: CommissionUnitViewModel;
  events: AgendaEventViewModel[];
  documents?: DocumentViewModel[];
  /** When omitted the dashboard is derived from `events` and `documents`. */
  dashboard?: AgendaDashboardViewModel;
  state?: AgendaLoadState;
  /** ISO date used as "today" (defaults to the current date). */
  todayKey?: string;
  /** Options for the creation form. */
  peopleOptions?: PersonSummary[];
  unitOptions?: UnitSummary[];
  /** Presentation-only resolvers for the detail panel. */
  getEventDocuments?: (eventId: string) => DocumentViewModel[];
  getEventHistory?: (eventId: string) => EventHistoryEntry[];
  onSubmitEvent?: (draft: AgendaEventDraft, editing: AgendaEventViewModel | null) => void;
  /** Initial filter overrides (e.g. from the URL). */
  initialFilters?: Partial<AgendaFilterState>;
  className?: string;
}

/** Imperative surface used by the workspace header ("+ Criar evento"). */
export interface CommissionAgendaPageHandle {
  openCreate: () => void;
  openEvent: (event: AgendaEventViewModel) => void;
}

export const CommissionAgendaPage = forwardRef<CommissionAgendaPageHandle, CommissionAgendaPageProps>(function CommissionAgendaPage({
  unit,
  events,
  documents = [],
  dashboard,
  state = 'ready',
  todayKey: todayKeyProp,
  peopleOptions,
  unitOptions,
  getEventDocuments,
  getEventHistory,
  onSubmitEvent,
  initialFilters,
  className,
  onCreateEvent,
  onOpenEvent,
  onEditEvent,
  onOpenDocuments,
  onOpenDocument,
  onDownloadDocument,
  onAddDocument,
  onFilterChange,
  onMonthChange,
  onYearChange,
  onRetry,
}, ref) {
  const todayKey = todayKeyProp ?? getTodayKey();
  const currentYear = Number(todayKey.slice(0, 4));
  const currentMonth = Number(todayKey.slice(5, 7));

  const [filters, setFilters] = useState<AgendaFilterState>(() => ({ ...createDefaultFilters(currentYear), ...initialFilters }));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<AgendaEventViewModel | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<AgendaEventViewModel | null>(null);

  useEffect(() => {
    onFilterChange?.(filters);
  }, [filters, onFilterChange]);

  const decoratedEvents = useMemo(() => {
    const next = getNextEvent(events, todayKey);
    return events.map((event) => ({ ...event, isNext: event.isNext ?? event.id === next?.id }));
  }, [events, todayKey]);

  const years = useMemo(() => getAvailableYears(decoratedEvents, currentYear), [decoratedEvents, currentYear]);
  const yearEvents = useMemo(() => decoratedEvents.filter((event) => event.date.startsWith(`${filters.year}-`)), [decoratedEvents, filters.year]);
  const monthCounts = useMemo(() => countEventsByMonth(decoratedEvents, filters.year), [decoratedEvents, filters.year]);
  const visibleEvents = useMemo(() => filterEvents(decoratedEvents, filters, todayKey), [decoratedEvents, filters, todayKey]);
  const resolvedDashboard = useMemo(() => dashboard ?? buildDashboard(decoratedEvents, documents.length, todayKey), [dashboard, decoratedEvents, documents.length, todayKey]);
  const people = useMemo(() => collectPeople(decoratedEvents), [decoratedEvents]);
  const locations = useMemo(() => collectLocations(decoratedEvents), [decoratedEvents]);

  const statusCounts = useMemo(() => {
    const scoped = filterEvents(decoratedEvents, { ...filters, status: 'all', search: '' }, todayKey);
    return {
      all: scoped.length,
      upcoming: scoped.filter((event) => event.date >= todayKey && !isCompletedLike(event, todayKey) && event.status !== 'cancelled').length,
      today: scoped.filter((event) => event.date <= todayKey && (event.endDate ?? event.date) >= todayKey).length,
      completed: scoped.filter((event) => isCompletedLike(event, todayKey)).length,
    };
  }, [decoratedEvents, filters, todayKey]);

  const activeSecondary = countActiveSecondaryFilters(filters.secondary);
  const hasAnyFilter = activeSecondary > 0 || filters.search.trim().length > 0 || filters.status !== 'all' || filters.month !== 'all';
  const unitLabel = unitArticleLabel(unit.type);

  const patch = useCallback((next: Partial<AgendaFilterState>) => setFilters((current) => ({ ...current, ...next })), []);
  const changeMonth = (month: AgendaMonthFilter) => { patch({ month }); onMonthChange?.(month); };
  const changeYear = (year: number) => { patch({ year, month: 'all' }); onYearChange?.(year); };
  const clearFilters = () => setFilters(createDefaultFilters(filters.year));

  const openEvent = (event: AgendaEventViewModel) => {
    setSelectedEvent(event);
    setDetailOpen(true);
    onOpenEvent?.(event);
  };
  const openCreate = () => {
    setEditingEvent(null);
    setFormOpen(true);
    onCreateEvent?.();
  };
  const openEdit = (event: AgendaEventViewModel) => {
    setEditingEvent(event);
    setDetailOpen(false);
    setFormOpen(true);
    onEditEvent?.(event);
  };
  const openDocuments = (event?: AgendaEventViewModel) => onOpenDocuments?.(event);
  const submitEvent = (draft: AgendaEventDraft) => {
    onSubmitEvent?.(draft, editingEvent);
    setFormOpen(false);
  };

  useImperativeHandle(ref, () => ({ openCreate, openEvent }));

  if (state === 'loading') {
    return <div className={cn('ua-page', className)}><AgendaPageSkeleton /></div>;
  }

  if (state === 'error') {
    return (
      <div className={cn('ua-page', className)}>
        <AgendaPageHeader unit={unit} count={0} />
        <AgendaErrorState onRetry={onRetry} />
      </div>
    );
  }

  const isEmptyAgenda = decoratedEvents.length === 0;

  return (
    <div className={cn('ua-page', className)}>
      <AgendaPageHeader unit={unit} count={decoratedEvents.length} nextEvent={resolvedDashboard.nextEvent} />

      <AgendaDashboard
        dashboard={resolvedDashboard}
        onOpenNextEvent={() => {
          const next = decoratedEvents.find((event) => event.id === resolvedDashboard.nextEvent?.id);
          if (next) openEvent(next);
        }}
        onOpenDocuments={() => openDocuments()}
      />

      {isEmptyAgenda ? (
        <AgendaNoEventsState unitLabel={unitLabel} onCreateEvent={openCreate} />
      ) : (
        <>
          <AgendaToolbar
            search={filters.search}
            onSearchChange={(search) => patch({ search })}
            activeFilters={activeSecondary}
            onOpenFilters={() => setFiltersOpen(true)}
            view={filters.view}
            onViewChange={(view) => patch({ view })}
          />

          <div className="ua-temporal">
            <div className="ua-temporal__row">
              <AgendaYearSelector years={years} value={filters.year} currentYear={currentYear} onChange={changeYear} />
              <span className="ws-meta-secondary hidden sm:inline">{yearEvents.length} {yearEvents.length === 1 ? 'evento' : 'eventos'} em {filters.year}</span>
            </div>
            <AgendaMonthSelector
              value={filters.month}
              onChange={changeMonth}
              counts={monthCounts}
              currentMonth={filters.year === currentYear ? currentMonth : null}
              totalCount={yearEvents.length}
            />
            <AgendaStatusTabs value={filters.status} onChange={(status) => patch({ status })} counts={statusCounts} />
          </div>

          <div className="ua-layout">
            <div className="min-w-0">
              {filters.view === 'calendar' ? (
                <AgendaCalendarView
                  events={visibleEvents}
                  year={filters.year}
                  month={filters.month}
                  todayKey={todayKey}
                  onMonthChange={changeMonth}
                  onOpenEvent={openEvent}
                />
              ) : visibleEvents.length === 0 ? (
                hasAnyFilter ? (
                  <AgendaSearchEmptyState onClear={clearFilters} />
                ) : (
                  <AgendaNoEventsState unitLabel={unitLabel} onCreateEvent={openCreate} />
                )
              ) : (
                <AgendaTimeline
                  events={visibleEvents}
                  unitId={unit.id}
                  todayKey={todayKey}
                  onOpen={openEvent}
                  onEdit={openEdit}
                  onOpenDocuments={openDocuments}
                  onOpenHistory={openEvent}
                />
              )}
            </div>

            <aside className="ua-layout__aside" aria-label="Atalhos da agenda">
              <DocumentsPanel
                documents={documents}
                unitLabel={unitLabel}
                limit={4}
                onOpenAll={() => openDocuments()}
                onAddDocument={onAddDocument}
                onOpenDocument={onOpenDocument}
                onDownloadDocument={onDownloadDocument}
              />
            </aside>
          </div>
        </>
      )}

      <AgendaFiltersSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        value={filters.secondary}
        onChange={(secondary) => patch({ secondary })}
        people={people}
        locations={locations}
        resultCount={visibleEvents.length}
      />

      <EventDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        event={selectedEvent}
        unitId={unit.id}
        unitLabel={unit.shortName ?? unit.name}
        todayKey={todayKey}
        documents={selectedEvent ? getEventDocuments?.(selectedEvent.id) ?? documents.filter((document) => document.eventId === selectedEvent.id) : []}
        history={selectedEvent ? getEventHistory?.(selectedEvent.id) ?? [] : []}
        onEdit={openEdit}
        onOpenDocuments={openDocuments}
        onOpenDocument={onOpenDocument}
        onDownloadDocument={onDownloadDocument}
        onAddDocument={() => onAddDocument?.()}
      />

      <EventFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        event={editingEvent}
        unitId={unit.id}
        unitLabel={unit.shortName ?? unit.name}
        peopleOptions={peopleOptions ?? people}
        unitOptions={unitOptions}
        onSubmit={submitEvent}
      />
    </div>
  );
});

/* ─────────────────────────── Cabeçalho da Agenda ─────────────────────────── */

export interface AgendaPageHeaderProps {
  unit: CommissionUnitViewModel;
  count: number;
  nextEvent?: AgendaDashboardViewModel['nextEvent'];
  onCreateEvent?: () => void;
}

export function AgendaPageHeader({ unit, count, nextEvent, onCreateEvent }: AgendaPageHeaderProps) {
  return (
    <header className="ua-header">
      <div className="min-w-0">
        <p className="ua-header__eyebrow ws-label">Agenda {unitArticleLabel(unit.type)}</p>
        <h2 className="ua-header__title ws-title">Linha do tempo</h2>
        <p className="ua-header__meta ws-meta-secondary">
          {count === 0 ? 'Nenhum evento cadastrado' : `${count} ${count === 1 ? 'evento' : 'eventos'} vinculados`}
          {nextEvent && <> · próximo em {nextEvent.date.slice(8, 10)}/{nextEvent.date.slice(5, 7)}</>}
        </p>
      </div>
      {onCreateEvent && (
        <WorkspaceButton variant="primary" icon={CalendarPlus} onClick={onCreateEvent} className="hidden md:inline-flex">Criar evento</WorkspaceButton>
      )}
    </header>
  );
}
