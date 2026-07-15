import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, Loader2, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { CalendarMonthView } from '@/components/cronograma-eventos/CalendarMonthView';
import {
  CategoryBoard,
  MeetingsBoard,
  OverviewBoard,
  UndatedBoard,
  YearBoard,
} from '@/components/cronograma-eventos/CronogramaBoards';
import { CronogramaCommandHeader } from '@/components/cronograma-eventos/CronogramaCommandHeader';
import { CronogramaFiltersBar } from '@/components/cronograma-eventos/CronogramaFiltersBar';
import {
  CronogramaTimelineBoard,
  CronogramaTimelineSkeleton,
} from '@/components/cronograma-eventos/CronogramaTimelineBoard';
import { CronogramaViewTabs, ViewContentTransition } from '@/components/cronograma-eventos/CronogramaViewTabs';
import { EventDrawer } from '@/components/cronograma-eventos/EventDrawer';
import { EventForm } from '@/components/cronograma-eventos/EventForm';
import { MobileCreateEventScreen } from '@/components/cronograma-eventos/mobile/MobileCreateEventScreen';
import { MobileCronogramaErrorBoundary } from '@/components/cronograma-eventos/mobile/MobileCronogramaErrorBoundary';
import { MobileCronogramaFilters } from '@/components/cronograma-eventos/mobile/MobileCronogramaFilters';
import { MobileCronogramaHeader } from '@/components/cronograma-eventos/mobile/MobileCronogramaHeader';
import { MobileCronogramaNavigation } from '@/components/cronograma-eventos/mobile/MobileCronogramaNavigation';
import { MobileCronogramaTimeline } from '@/components/cronograma-eventos/mobile/MobileCronogramaTimeline';
import { MobileEventScreen } from '@/components/cronograma-eventos/mobile/MobileEventScreen';
import { compareEventDates } from '@/components/cronograma-eventos/dateUtils';
import {
  adaptCronogramaEvent,
  visualEventToDraft,
  visualEventToSourceUpdates,
} from '@/components/cronograma-eventos/modelAdapter';
import type { CronogramaEvent, CronogramaFilters, CronogramaView } from '@/components/cronograma-eventos/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCronogramaEventHistory, useCronogramaEventos } from '@/hooks/useCronogramaEventos';
import {
  shouldReleaseClosedMobileSelection,
  useCronogramaMobilePresentation,
} from '@/hooks/useCronogramaMobilePresentation';
import {
  getClosestCycleYear,
  isCycleMonthKey,
  isCronogramaCycleYear,
  type CronogramaCycleYear,
} from '@/lib/cronograma-cycle';
import type { CronogramaEvent as SourceCronogramaEvent } from '@/lib/cronograma-eventos';
import { filterTimelineEvents } from '@/lib/cronograma-timeline';

const emptyFilters: CronogramaFilters = {
  query: '',
  year: 'all',
  month: 'all',
  category: 'all',
  status: 'all',
  priority: 'all',
  period: 'all',
  commission: 'all',
  owner: 'all',
  officialOnly: false,
  missingOwner: false,
  fromDate: '',
  toDate: '',
};

const cronogramaViews: CronogramaView[] = ['overview', 'timeline', 'calendar', 'year', 'category', 'meetings', 'undated'];

const cronogramaViewLabels: Record<CronogramaView, string> = {
  overview: 'Visão geral',
  timeline: 'Linha do tempo',
  calendar: 'Calendário',
  year: 'Por ano',
  category: 'Por categoria',
  meetings: 'Reuniões centrais',
  undated: 'Pendências sem data',
};

function isCronogramaView(value: string | null): value is CronogramaView {
  return Boolean(value && cronogramaViews.includes(value as CronogramaView));
}

export default function CronogramaEventosPage() {
  const cronograma = useCronogramaEventos();
  const viewportIsMobilePresentation = useCronogramaMobilePresentation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<CronogramaFilters>(emptyFilters);
  const [selectedEvent, setSelectedEvent] = useState<CronogramaEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerStartsEditing, setDrawerStartsEditing] = useState(false);
  const [selectedSourceUnavailable, setSelectedSourceUnavailable] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingCreatedEvent, setPendingCreatedEvent] = useState<CronogramaEvent | null>(null);
  const [presentationLock, setPresentationLock] = useState<boolean | null>(null);
  const overlayIsMobilePresentation = presentationLock ?? viewportIsMobilePresentation;
  // Preserve the trigger, scroll context and form tree during rotation. Overlay CSS
  // adapts the locked presentation to the physical viewport until the interaction closes.
  const contentIsMobilePresentation = overlayIsMobilePresentation;
  const drawerReturnFocusRef = useRef<HTMLElement>(null);
  const timelinePositionRef = useRef({ x: 0, y: 0 });
  const selectedPresenceRef = useRef({ id: '', seenInData: false });
  const overlayOpenRef = useRef({ drawer: false, create: false, filters: false });
  const activeView = isCronogramaView(searchParams.get('view'))
    ? searchParams.get('view') as CronogramaView
    : 'timeline';
  const requestedTimelineYear = isCronogramaCycleYear(searchParams.get('timelineYear'))
    ? Number(searchParams.get('timelineYear')) as CronogramaCycleYear
    : null;
  const requestedTimelineMonth = isCycleMonthKey(searchParams.get('timelineMonth'))
    ? searchParams.get('timelineMonth')
    : null;

  const setActiveView = (view: CronogramaView) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (view === 'timeline') next.delete('view');
      else next.set('view', view);
      return next;
    }, { replace: true });
  };

  const events = useMemo(() => cronograma.events.map(adaptCronogramaEvent), [cronograma.events]);
  const sourceById = useMemo(() => {
    const map = new Map<string, SourceCronogramaEvent>();
    cronograma.events.forEach((event) => {
      map.set(event.id, event);
      if (event.sourceKey) map.set(event.sourceKey, event);
    });
    return map;
  }, [cronograma.events]);
  const selectedSourceId = useMemo(() => {
    if (!selectedEvent) return null;
    return sourceById.get(selectedEvent.id)?.id
      ?? (selectedEvent.sourceKey ? sourceById.get(selectedEvent.sourceKey)?.id : null)
      ?? null;
  }, [selectedEvent, sourceById]);
  const eventHistory = useCronogramaEventHistory(selectedSourceId);

  useEffect(() => {
    overlayOpenRef.current.drawer = drawerOpen;
    overlayOpenRef.current.create = createOpen;
  }, [createOpen, drawerOpen]);

  useEffect(() => {
    if (!selectedEvent) {
      selectedPresenceRef.current = { id: '', seenInData: false };
      setSelectedSourceUnavailable(false);
      return;
    }
    if (selectedPresenceRef.current.id !== selectedEvent.id) {
      selectedPresenceRef.current = { id: selectedEvent.id, seenInData: false };
    }
    const freshEvent = events.find((event) => event.id === selectedEvent.id || event.sourceKey === selectedEvent.sourceKey);
    if (freshEvent) {
      selectedPresenceRef.current.seenInData = true;
      setSelectedSourceUnavailable(false);
      if (freshEvent !== selectedEvent) setSelectedEvent(freshEvent);
      return;
    }
    if (cronograma.isLoading || !selectedPresenceRef.current.seenInData) return;
    if (overlayIsMobilePresentation && drawerOpen) {
      setSelectedSourceUnavailable(true);
      return;
    }
    overlayOpenRef.current.drawer = false;
    setDrawerOpen(false);
    setDrawerStartsEditing(false);
    setSelectedSourceUnavailable(false);
    setSelectedEvent(null);
    const { x, y } = timelinePositionRef.current;
    window.setTimeout(() => window.scrollTo({ left: x, top: y, behavior: 'auto' }), 0);
    if (!overlayOpenRef.current.create && !overlayOpenRef.current.filters) {
      setPresentationLock(null);
    }
  }, [cronograma.isLoading, drawerOpen, events, overlayIsMobilePresentation, selectedEvent]);

  const filteredEvents = useMemo(
    () => filterTimelineEvents(events, filters).sort(compareEventDates),
    [events, filters],
  );
  const temporalFocusKey = useMemo(() => [
    filters.year,
    filters.month,
    filters.period,
    filters.fromDate,
    filters.toDate,
  ].join('|'), [filters.fromDate, filters.month, filters.period, filters.toDate, filters.year]);
  const mobileFocusKey = useMemo(() => [
    filters.query,
    filters.year,
    filters.month,
    filters.category,
    filters.status,
    filters.priority,
    filters.period,
    filters.commission,
    filters.owner,
    filters.officialOnly,
    filters.missingOwner,
    filters.fromDate,
    filters.toDate,
  ].join('|'), [filters]);
  const preferredTemporalYear = isCronogramaCycleYear(filters.year) ? filters.year : null;
  const mobileCreationYear = requestedTimelineYear
    ?? preferredTemporalYear
    ?? getClosestCycleYear(new Date().toISOString().slice(0, 10));

  const clearFilters = useCallback(() => setFilters(emptyFilters), []);
  const returnToFullCycle = useCallback(() => {
    setFilters((current) => ({
      ...current,
      year: 'all',
      month: 'all',
      period: 'all',
      fromDate: '',
      toDate: '',
    }));
  }, []);
  const handleTimelinePositionChange = useCallback(({
    year,
    month,
    replace,
  }: {
    year: CronogramaCycleYear;
    month: string | null;
    replace: boolean;
  }) => {
    setSearchParams((current) => {
      const currentYear = current.get('timelineYear');
      const currentMonth = current.get('timelineMonth');
      if (currentYear === String(year) && currentMonth === month) return current;

      const next = new URLSearchParams(current);
      next.set('timelineYear', String(year));
      if (month) next.set('timelineMonth', month);
      else next.delete('timelineMonth');
      return next;
    }, { replace });
  }, [setSearchParams]);

  const openEvent = useCallback((event: CronogramaEvent, edit = false) => {
    overlayOpenRef.current.drawer = true;
    setPresentationLock((current) => current ?? viewportIsMobilePresentation);
    timelinePositionRef.current = { x: window.scrollX, y: window.scrollY };
    if (document.activeElement instanceof HTMLElement) {
      drawerReturnFocusRef.current = document.activeElement;
    }
    setSelectedSourceUnavailable(false);
    setSelectedEvent(event);
    setDrawerStartsEditing(edit);
    setDrawerOpen(true);
  }, [viewportIsMobilePresentation]);

  const handleDrawerOpenChange = (open: boolean) => {
    overlayOpenRef.current.drawer = open;
    setDrawerOpen(open);
    if (!open) {
      setDrawerStartsEditing(false);
      const { x, y } = timelinePositionRef.current;
      const closingEventIdentity = selectedEvent?.sourceKey ?? selectedEvent?.id;
      window.setTimeout(() => {
        window.scrollTo({ left: x, top: y, behavior: 'auto' });
        if (overlayIsMobilePresentation) {
          setSelectedEvent((current) => (
            shouldReleaseClosedMobileSelection(
              overlayOpenRef.current.drawer,
              current?.sourceKey ?? current?.id,
              closingEventIdentity,
            ) ? null : current
          ));
        }
        if (!overlayOpenRef.current.create && !overlayOpenRef.current.drawer && !overlayOpenRef.current.filters) {
          setPresentationLock(null);
        }
      }, overlayIsMobilePresentation ? 230 : 0);
    }
  };

  const openCreate = () => {
    overlayOpenRef.current.create = true;
    setPresentationLock((current) => current ?? viewportIsMobilePresentation);
    cronograma.create.reset();
    setCreateOpen(true);
  };

  const handleCreateOpenChange = (open: boolean) => {
    overlayOpenRef.current.create = open;
    if (open) {
      openCreate();
      return;
    }
    setCreateOpen(false);
    window.setTimeout(() => {
      if (!overlayOpenRef.current.create && !overlayOpenRef.current.drawer && !overlayOpenRef.current.filters) {
        setPresentationLock(null);
      }
    }, overlayIsMobilePresentation ? 230 : 0);
  };

  const handleMobileFiltersOpenChange = useCallback((open: boolean) => {
    overlayOpenRef.current.filters = open;
    if (open) {
      setPresentationLock((current) => current ?? viewportIsMobilePresentation);
      return;
    }
    window.setTimeout(() => {
      if (!overlayOpenRef.current.create && !overlayOpenRef.current.drawer && !overlayOpenRef.current.filters) {
        setPresentationLock(null);
      }
    }, 230);
  }, [viewportIsMobilePresentation]);

  const handleSave = async (nextEvent: CronogramaEvent) => {
    const sourceEvent = sourceById.get(nextEvent.id)
      || (nextEvent.sourceKey ? sourceById.get(nextEvent.sourceKey) : undefined);
    if (sourceEvent) {
      const updated = await cronograma.update.mutateAsync({
        id: sourceEvent.id,
        updates: visualEventToSourceUpdates(nextEvent, sourceEvent),
      });
      setSelectedEvent(adaptCronogramaEvent(updated));
      return;
    }
    const created = await cronograma.create.mutateAsync(visualEventToDraft(nextEvent));
    setSelectedEvent(adaptCronogramaEvent(created));
  };

  const prepareNewEvent = (event: CronogramaEvent) => {
    const id = `custom-${Date.now()}`;
    return {
      ...event,
      id,
      sourceKey: `manual-${id}`,
      isOfficial: false,
      isMain: false,
    };
  };

  const handleCreate = (event: CronogramaEvent) => {
    const nextEvent = prepareNewEvent(event);
    cronograma.create.mutate(visualEventToDraft(nextEvent), {
      onSuccess: (sourceEvent) => {
        const createdEvent = adaptCronogramaEvent(sourceEvent);
        overlayOpenRef.current.create = false;
        setCreateOpen(false);
        openEvent(createdEvent);
      },
    });
  };

  const handleMobileCreate = async (event: CronogramaEvent) => {
    const created = await cronograma.create.mutateAsync(visualEventToDraft(prepareNewEvent(event)));
    const createdEvent = adaptCronogramaEvent(created);
    setPendingCreatedEvent(createdEvent);
  };

  useEffect(() => {
    if (createOpen || !pendingCreatedEvent) return;
    const timeout = window.setTimeout(() => {
      if (
        overlayOpenRef.current.create
        || overlayOpenRef.current.drawer
        || overlayOpenRef.current.filters
      ) {
        setPendingCreatedEvent(null);
        return;
      }
      setPendingCreatedEvent(null);
      if (pendingCreatedEvent.date && isCronogramaCycleYear(pendingCreatedEvent.year)) {
        handleTimelinePositionChange({
          year: pendingCreatedEvent.year,
          month: pendingCreatedEvent.date.slice(0, 7),
          replace: true,
        });
      }
      openEvent(pendingCreatedEvent);
    }, 230);
    return () => window.clearTimeout(timeout);
  }, [createOpen, handleTimelinePositionChange, openEvent, pendingCreatedEvent]);

  const preferredCalendarYear = filters.year === 'all' ? undefined : filters.year;

  const operationalContent = (
    <>
      <p className="sr-only" aria-live="polite">
        {filteredEvents.length} de {events.length} eventos exibidos na visão atual.
      </p>

      {cronograma.isSeedFallback && !cronograma.isLoading && (
        <div className="cronograma-sync-alert" role="alert">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Exibindo a base oficial consolidada</p>
            <p className="mt-0.5 text-xs opacity-80">A sincronização online não respondeu. Nenhum dado foi descartado.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => cronograma.refetch()}
            disabled={cronograma.isRefreshing}
            className="h-8 rounded-lg bg-white/70 text-xs"
          >
            {cronograma.isRefreshing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            Tentar novamente
          </Button>
        </div>
      )}

      {cronograma.isLoading && events.length === 0 ? (
        <CronogramaTimelineSkeleton />
      ) : (
        <ViewContentTransition
          view={activeView}
          ariaLabel={contentIsMobilePresentation ? cronogramaViewLabels[activeView] : undefined}
        >
          {activeView === 'overview' && (
            <OverviewBoard
              events={filteredEvents}
              onOpen={(event) => openEvent(event)}
              onEdit={(event) => openEvent(event, true)}
              onSwitchView={setActiveView}
            />
          )}

          {activeView === 'timeline' && (
            contentIsMobilePresentation ? (
              <MobileCronogramaTimeline
                events={filteredEvents}
                allEvents={events}
                onOpen={(event) => openEvent(event)}
                onClearFilters={clearFilters}
                onReturnToFullCycle={returnToFullCycle}
                onOpenUndated={() => setActiveView('undated')}
                requestedYear={requestedTimelineYear}
                requestedMonth={requestedTimelineMonth}
                temporalFocusKey={mobileFocusKey}
                preferredTemporalYear={preferredTemporalYear}
                onPositionChange={handleTimelinePositionChange}
              />
            ) : (
              <CronogramaTimelineBoard
                events={filteredEvents}
                allEvents={events}
                onOpen={(event) => openEvent(event)}
                onClearFilters={clearFilters}
                onReturnToFullCycle={returnToFullCycle}
                onOpenUndated={() => setActiveView('undated')}
                requestedYear={requestedTimelineYear}
                requestedMonth={requestedTimelineMonth}
                temporalFocusKey={temporalFocusKey}
                preferredTemporalYear={preferredTemporalYear}
                onPositionChange={handleTimelinePositionChange}
              />
            )
          )}

          {activeView === 'calendar' && (
            <CalendarMonthView
              events={filteredEvents}
              preferredYear={preferredCalendarYear}
              onOpen={(event) => openEvent(event)}
              onEdit={(event) => openEvent(event, true)}
            />
          )}

          {activeView === 'year' && (
            <YearBoard
              events={filteredEvents}
              onOpen={(event) => openEvent(event)}
              onEdit={(event) => openEvent(event, true)}
            />
          )}

          {activeView === 'category' && (
            <CategoryBoard events={filteredEvents} onOpen={(event) => openEvent(event)} />
          )}

          {activeView === 'meetings' && (
            <MeetingsBoard events={filteredEvents} onOpen={(event) => openEvent(event)} />
          )}

          {activeView === 'undated' && (
            <UndatedBoard
              events={filteredEvents}
              onOpen={(event) => openEvent(event)}
              onEdit={(event) => openEvent(event, true)}
            />
          )}
        </ViewContentTransition>
      )}
    </>
  );

  return (
    <main
      id="cronograma-main"
      className="cronograma-page min-h-screen pb-10"
      data-presentation={contentIsMobilePresentation ? 'mobile' : 'desktop'}
    >
      {contentIsMobilePresentation ? (
        <MobileCronogramaErrorBoundary
          resetKey={`${activeView}:${events.length}:${cronograma.isLoading ? 'loading' : 'ready'}`}
          onRetry={() => cronograma.refetch()}
        >
          <div className="cronograma-mobile-experience mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-3 overflow-x-clip px-3">
            <MobileCronogramaHeader
              events={events}
              onNewEvent={openCreate}
              onOpenUndated={() => setActiveView('undated')}
              canManage={cronograma.canManage}
            />
            <MobileCronogramaNavigation activeView={activeView} onChange={setActiveView} />
            <MobileCronogramaFilters
              filters={filters}
              events={events}
              onChange={setFilters}
              onClear={clearFilters}
              resultCount={filteredEvents.length}
              totalCount={events.length}
              syncing={cronograma.isRefreshing}
              onOverlayOpenChange={handleMobileFiltersOpenChange}
            />
            {operationalContent}
          </div>
        </MobileCronogramaErrorBoundary>
      ) : (
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-3 sm:px-5 2xl:px-8">
          <CronogramaCommandHeader
            events={events}
            onNewEvent={openCreate}
            onOpenUndated={() => setActiveView('undated')}
            canManage={cronograma.canManage}
          />

          <div className="cronograma-command-dock sticky top-[72px] z-20 space-y-2 py-2">
            <CronogramaViewTabs activeView={activeView} onChange={setActiveView} />
            <CronogramaFiltersBar
              filters={filters}
              events={events}
              onChange={setFilters}
              onClear={clearFilters}
              resultCount={filteredEvents.length}
              totalCount={events.length}
              syncing={cronograma.isRefreshing}
            />
          </div>

          {operationalContent}
        </div>
      )}

      {overlayIsMobilePresentation ? (
        <MobileCronogramaErrorBoundary
          resetKey={`${selectedEvent?.id ?? 'none'}:${drawerOpen ? 'open' : 'closed'}`}
          onRetry={() => handleDrawerOpenChange(false)}
        >
          <MobileEventScreen
            event={selectedEvent}
            open={drawerOpen}
            onOpenChange={handleDrawerOpenChange}
            onSave={handleSave}
            startInEdit={drawerStartsEditing}
            canManage={cronograma.canManage}
            returnFocusRef={drawerReturnFocusRef}
            history={eventHistory.entries}
            historyLoading={eventHistory.isLoading}
            historyError={eventHistory.error}
            canViewHistory={eventHistory.canViewHistory}
            sourceUnavailable={selectedSourceUnavailable}
          />
        </MobileCronogramaErrorBoundary>
      ) : (
        <EventDrawer
          event={selectedEvent}
          open={drawerOpen}
          onOpenChange={handleDrawerOpenChange}
          onSave={handleSave}
          startInEdit={drawerStartsEditing}
          canManage={cronograma.canManage}
          returnFocusRef={drawerReturnFocusRef}
          history={eventHistory.entries}
          historyLoading={eventHistory.isLoading}
          historyError={eventHistory.error}
          canViewHistory={eventHistory.canViewHistory}
        />
      )}

      {overlayIsMobilePresentation ? (
        <MobileCreateEventScreen
          open={createOpen}
          onOpenChange={handleCreateOpenChange}
          onSubmit={handleMobileCreate}
          isSaving={cronograma.create.isPending}
          submitError={cronograma.create.error instanceof Error ? cronograma.create.error.message : null}
          defaultYear={mobileCreationYear}
        />
      ) : (
        <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
          <DialogContent className="cronograma-create-dialog max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-gold" />
                Novo evento do cronograma
              </DialogTitle>
              <DialogDescription>
                Cadastre uma ação complementar no cronograma da organização. Os dados oficiais existentes permanecem preservados.
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto pr-1">
              <EventForm
                onSubmit={handleCreate}
                onCancel={() => handleCreateOpenChange(false)}
                submitLabel="Criar evento"
                isSaving={cronograma.create.isPending}
                submitError={cronograma.create.error instanceof Error ? cronograma.create.error.message : null}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </main>
  );
}
