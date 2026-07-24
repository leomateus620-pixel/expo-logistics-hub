import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, Loader2, RefreshCw } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  visualSubeventToSourceDraft,
  visualEventToDraft,
  visualEventToSourceUpdates,
} from '@/components/cronograma-eventos/modelAdapter';
import type {
  CronogramaEvent,
  CronogramaFilters,
  CronogramaSubevent,
  CronogramaSubeventInput,
  CronogramaView,
} from '@/components/cronograma-eventos/types';
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
import {
  FENASOJA_COUNTDOWN_ROUTE,
  consumeFenasojaCountdownLaunch,
  findFenasojaCountdownReturnFocus,
} from '@/lib/fenasoja-countdown-navigation';
import {
  buildCronogramaViewSearchParams,
  filterTimelineEvents,
  getTodayKey,
  partitionCronogramaEvents,
  resetCronogramaTemporalFilters,
} from '@/lib/cronograma-timeline';
import '@/styles/cronograma-timeline-recovery.css';
import '@/styles/cronograma-timeline-flagship.css';

const EventRelationshipWorkspace = lazy(async () => {
  const module = await import('@/components/cronograma-eventos/workspace/EventRelationshipWorkspace');
  return { default: module.EventRelationshipWorkspace };
});

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

const cronogramaViews: CronogramaView[] = ['overview', 'timeline', 'completed', 'calendar', 'year', 'category', 'meetings', 'undated'];
const primaryCronogramaViews: CronogramaView[] = ['timeline', 'completed', 'undated'];

const cronogramaViewLabels: Record<CronogramaView, string> = {
  overview: 'Visão geral',
  timeline: 'Linha do tempo',
  completed: 'Eventos concluídos',
  calendar: 'Calendário',
  year: 'Por ano',
  category: 'Por categoria',
  meetings: 'Reuniões centrais',
  undated: 'Pendências',
};

function isCronogramaView(value: string | null): value is CronogramaView {
  return Boolean(value && cronogramaViews.includes(value as CronogramaView));
}

function useCurrentCronogramaDay() {
  const [todayKey, setTodayKey] = useState(() => getTodayKey());

  useEffect(() => {
    const refreshDay = () => {
      const nextDay = getTodayKey();
      setTodayKey((currentDay) => currentDay === nextDay ? currentDay : nextDay);
    };
    const interval = window.setInterval(refreshDay, 60_000);
    window.addEventListener('focus', refreshDay);
    document.addEventListener('visibilitychange', refreshDay);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshDay);
      document.removeEventListener('visibilitychange', refreshDay);
    };
  }, []);

  return todayKey;
}

export default function CronogramaEventosPage() {
  const cronograma = useCronogramaEventos();
  const viewportIsMobilePresentation = useCronogramaMobilePresentation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const todayKey = useCurrentCronogramaDay();
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
  const workspacePositionRef = useRef({ x: 0, y: 0 });
  const workspaceTransitionRef = useRef(false);
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
  const deepLinkEvent = searchParams.get('event');
  const deepLinkSubevent = searchParams.get('subevent');
  const deepLinkMode = searchParams.get('mode') === 'edit' ? 'edit' : 'view';
  const openCountdownExperience = useCallback(() => {
    navigate(FENASOJA_COUNTDOWN_ROUTE, {
      state: { fromCronograma: true },
    });
  }, [navigate]);

  useEffect(() => {
    const launchContext = consumeFenasojaCountdownLaunch();
    if (!launchContext) return;

    let focusFrame = 0;
    const scrollFrame = window.requestAnimationFrame(() => {
      focusFrame = window.requestAnimationFrame(() => {
        window.scrollTo({
          left: launchContext.scrollX,
          top: launchContext.scrollY,
          behavior: 'auto',
        });
        findFenasojaCountdownReturnFocus(launchContext.focusId)?.focus({
          preventScroll: true,
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(scrollFrame);
      if (focusFrame) window.cancelAnimationFrame(focusFrame);
    };
  }, []);

  const setActiveView = (view: CronogramaView) => {
    if (activeView !== view) {
      setFilters(resetCronogramaTemporalFilters);
    }
    setSearchParams((current) => {
      return buildCronogramaViewSearchParams(current, activeView, view);
    }, { replace: true });
  };

  const events = useMemo(
    () => cronograma.events.map((event) => adaptCronogramaEvent(event, todayKey)),
    [cronograma.events, todayKey],
  );
  const eventBuckets = useMemo(
    () => partitionCronogramaEvents(events, todayKey),
    [events, todayKey],
  );
  const eventsForView = useMemo(() => {
    if (activeView === 'timeline') return eventBuckets.timeline;
    if (activeView === 'completed') return eventBuckets.completed;
    if (activeView === 'undated') return eventBuckets.undated;
    return events;
  }, [activeView, eventBuckets, events]);
  const workspaceIdentity = searchParams.get('workspace');
  const workspaceEvent = useMemo(() => (
    workspaceIdentity
      ? events.find((event) => event.id === workspaceIdentity || event.sourceKey === workspaceIdentity) ?? null
      : null
  ), [events, workspaceIdentity]);
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
    () => filterTimelineEvents(eventsForView, filters, todayKey).sort(compareEventDates),
    [eventsForView, filters, todayKey],
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
    const identity = event.sourceKey ?? event.id;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (identity) next.set('event', identity);
      if (edit) next.set('mode', 'edit'); else next.delete('mode');
      next.delete('subevent');
      return next;
    }, { replace: true });
  }, [setSearchParams, viewportIsMobilePresentation]);

  // Deep-link sync: ?event=<id|sourceKey>&mode=view|edit&subevent=<id>
  useEffect(() => {
    if (!deepLinkEvent) return;
    if (cronograma.isLoading) return;
    const current = selectedEvent?.sourceKey ?? selectedEvent?.id;
    if (drawerOpen && current === deepLinkEvent) return;
    const match = events.find((event) => event.id === deepLinkEvent || event.sourceKey === deepLinkEvent);
    if (!match) return;
    openEvent(match, deepLinkMode === 'edit');
  }, [cronograma.isLoading, deepLinkEvent, deepLinkMode, drawerOpen, events, openEvent, selectedEvent]);


  const openWorkspace = useCallback((event: CronogramaEvent) => {
    workspaceTransitionRef.current = overlayIsMobilePresentation;
    workspacePositionRef.current = { x: window.scrollX, y: window.scrollY };
    overlayOpenRef.current.drawer = false;
    setDrawerOpen(false);
    setDrawerStartsEditing(false);
    setSelectedEvent(null);
    setSelectedSourceUnavailable(false);
    setPresentationLock(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('workspace', event.sourceKey ?? event.id);
      return next;
    });
    window.setTimeout(() => window.scrollTo({ left: 0, top: 0, behavior: 'auto' }), 0);
  }, [overlayIsMobilePresentation, setSearchParams]);

  const closeWorkspace = useCallback(() => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('workspace');
      return next;
    }, { replace: true });
    const { x, y } = workspacePositionRef.current;
    window.setTimeout(() => window.scrollTo({ left: x, top: y, behavior: 'auto' }), 0);
  }, [setSearchParams]);

  const handleDrawerOpenChange = (open: boolean) => {
    overlayOpenRef.current.drawer = open;
    setDrawerOpen(open);
    if (!open) {
      setDrawerStartsEditing(false);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.delete('event');
        next.delete('subevent');
        next.delete('mode');
        return next;
      }, { replace: true });
      const { x, y } = timelinePositionRef.current;
      const closingEventIdentity = selectedEvent?.sourceKey ?? selectedEvent?.id;
      window.setTimeout(() => {
        if (workspaceTransitionRef.current) {
          workspaceTransitionRef.current = false;
          return;
        }
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
      setSelectedEvent(adaptCronogramaEvent(updated, todayKey));
      return;
    }
    const created = await cronograma.create.mutateAsync(visualEventToDraft(nextEvent));
    setSelectedEvent(adaptCronogramaEvent(created, todayKey));
  };

  const handleCreateSubevent = async (input: CronogramaSubeventInput) => {
    if (!workspaceEvent) throw new Error('Evento principal não encontrado. Atualize a página e tente novamente.');
    const draft = visualSubeventToSourceDraft({
      title: input.title,
      description: input.description,
      date: input.date,
      endDate: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      owner: input.responsible,
      status: input.status,
      priority: 'medium',
      commissionSlug: input.commissionSlug || undefined,
      storage: 'relational',
    }, workspaceEvent.subevents?.length ?? 0);
    const result = await cronograma.createSubevent.mutateAsync({
      eventId: workspaceEvent.sourceKey ?? workspaceEvent.id,
      draft,
      requestId: input.requestId,
    });
    return result.mode;
  };

  const handleUpdateSubevent = async (subevent: CronogramaSubevent, input: CronogramaSubeventInput) => {
    if (!workspaceEvent || !subevent.id) throw new Error('A conexão selecionada não possui identidade persistente.');
    const draft = visualSubeventToSourceDraft({
      ...subevent,
      title: input.title,
      description: input.description,
      date: input.date,
      endDate: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      owner: input.responsible,
      status: input.status,
      commissionSlug: input.commissionSlug || undefined,
    }, subevent.sortOrder ?? 0);
    await cronograma.updateSubevent.mutateAsync({
      eventId: workspaceEvent.sourceKey ?? workspaceEvent.id,
      subeventId: subevent.id,
      draft,
    });
  };

  const handleRemoveSubevent = async (subevent: CronogramaSubevent) => {
    if (!workspaceEvent || !subevent.id) throw new Error('A conexão selecionada não possui identidade persistente.');
    await cronograma.deleteSubevent.mutateAsync({
      eventId: workspaceEvent.sourceKey ?? workspaceEvent.id,
      subeventId: subevent.id,
    });
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
        const createdEvent = adaptCronogramaEvent(sourceEvent, todayKey);
        overlayOpenRef.current.create = false;
        setCreateOpen(false);
        openEvent(createdEvent);
      },
    });
  };

  const handleMobileCreate = async (event: CronogramaEvent) => {
    const created = await cronograma.create.mutateAsync(visualEventToDraft(prepareNewEvent(event)));
    const createdEvent = adaptCronogramaEvent(created, todayKey);
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
        {filteredEvents.length} de {eventsForView.length} eventos exibidos na visão atual.
      </p>

      {(cronograma.isSeedFallback || cronograma.pendingRelationshipCount > 0) && !cronograma.isLoading && (
        <div className="cronograma-sync-alert" role={cronograma.isSeedFallback ? 'alert' : 'status'}>
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">
              {cronograma.pendingRelationshipCount > 0
                ? `${cronograma.pendingRelationshipCount} ${cronograma.pendingRelationshipCount === 1 ? 'conexão aguarda' : 'conexões aguardam'} sincronização`
                : 'Exibindo a base oficial consolidada'}
            </p>
            <p className="mt-0.5 text-xs opacity-80">
              {cronograma.pendingRelationshipCount > 0
                ? 'Os rascunhos estão preservados neste dispositivo e sairão da fila somente após confirmação do servidor.'
                : 'A sincronização online não respondeu. Nenhum dado foi descartado.'}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (cronograma.pendingRelationshipCount > 0) {
                void cronograma.retryRelationships().catch(() => undefined);
                return;
              }
              void cronograma.refetch();
            }}
            disabled={cronograma.isRefreshing || cronograma.isSyncingRelationships}
            className="h-8 rounded-lg bg-white/70 text-xs"
          >
            {cronograma.isRefreshing || cronograma.isSyncingRelationships
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            {cronograma.pendingRelationshipCount > 0 ? 'Sincronizar agora' : 'Tentar novamente'}
          </Button>
        </div>
      )}

      {cronograma.isLoading && events.length === 0 ? (
        <CronogramaTimelineSkeleton />
      ) : (
        <ViewContentTransition
          view={activeView}
          ariaLabel={contentIsMobilePresentation || !primaryCronogramaViews.includes(activeView)
            ? cronogramaViewLabels[activeView]
            : undefined}
        >
          {activeView === 'overview' && (
            <OverviewBoard
              events={filteredEvents}
              onOpen={(event) => openEvent(event)}
              onEdit={openWorkspace}
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
                todayKey={todayKey}
              />
            ) : (
              <CronogramaTimelineBoard
                events={filteredEvents}
                allEvents={events}
                selectedEventId={selectedEvent?.id ?? null}
                onOpen={(event) => openEvent(event)}
                onClearFilters={clearFilters}
                onReturnToFullCycle={returnToFullCycle}
                onOpenUndated={() => setActiveView('undated')}
                requestedYear={requestedTimelineYear}
                requestedMonth={requestedTimelineMonth}
                temporalFocusKey={temporalFocusKey}
                preferredTemporalYear={preferredTemporalYear}
                onPositionChange={handleTimelinePositionChange}
                todayKey={todayKey}
              />
            )
          )}

          {activeView === 'completed' && (
            contentIsMobilePresentation ? (
              <MobileCronogramaTimeline
                events={filteredEvents}
                allEvents={events}
                onOpen={(event) => openEvent(event)}
                onClearFilters={clearFilters}
                onReturnToFullCycle={returnToFullCycle}
                requestedYear={requestedTimelineYear}
                requestedMonth={requestedTimelineMonth}
                temporalFocusKey={mobileFocusKey}
                preferredTemporalYear={preferredTemporalYear}
                onPositionChange={handleTimelinePositionChange}
                todayKey={todayKey}
                variant="completed"
              />
            ) : (
              <CronogramaTimelineBoard
                events={filteredEvents}
                allEvents={events}
                selectedEventId={selectedEvent?.id ?? null}
                onOpen={(event) => openEvent(event)}
                onClearFilters={clearFilters}
                onReturnToFullCycle={returnToFullCycle}
                requestedYear={requestedTimelineYear}
                requestedMonth={requestedTimelineMonth}
                temporalFocusKey={temporalFocusKey}
                preferredTemporalYear={preferredTemporalYear}
                onPositionChange={handleTimelinePositionChange}
                todayKey={todayKey}
                variant="completed"
              />
            )
          )}

          {activeView === 'calendar' && (
            <CalendarMonthView
              events={filteredEvents}
              preferredYear={preferredCalendarYear}
              onOpen={(event) => openEvent(event)}
              onEdit={openWorkspace}
            />
          )}

          {activeView === 'year' && (
            <YearBoard
              events={filteredEvents}
              onOpen={(event) => openEvent(event)}
              onEdit={openWorkspace}
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
              onEdit={openWorkspace}
            />
          )}
        </ViewContentTransition>
      )}
    </>
  );

  return (
    <main
      id="cronograma-main"
      className={`cronograma-page min-h-screen ${workspaceIdentity ? '' : 'pb-10'}`}
      data-presentation={contentIsMobilePresentation ? 'mobile' : 'desktop'}
    >
      {workspaceIdentity ? (
        workspaceEvent ? (
          <Suspense fallback={<WorkspaceLoadingState />}>
            <EventRelationshipWorkspace
              event={workspaceEvent}
              onBack={closeWorkspace}
              onSaveEvent={handleSave}
              onCreateSubevent={handleCreateSubevent}
              onUpdateSubevent={handleUpdateSubevent}
              onRemoveSubevent={handleRemoveSubevent}
              canManage={cronograma.canManage}
              canDeleteSubevents={cronograma.canDeleteSubevents}
              relationshipsUnavailable={cronograma.relationshipSyncUnavailable}
              pendingRelationshipCount={cronograma.pendingRelationshipCount}
              failedRelationshipCount={cronograma.failedRelationshipCount}
              isSyncingRelationships={cronograma.isSyncingRelationships}
              onRetryRelationships={cronograma.retryRelationships}
            />
          </Suspense>
        ) : (
          <div className="flex min-h-[60vh] items-center justify-center" role="status">
            {cronograma.isLoading ? (
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Preparando workspace…
              </span>
            ) : (
              <div className="max-w-md rounded-2xl border border-border/50 bg-white p-6 text-center shadow-sm">
                <h1 className="text-lg font-black">Evento não encontrado</h1>
                <p className="mt-2 text-sm text-muted-foreground">O registro pode ter sido atualizado ou removido por outra pessoa.</p>
                <Button type="button" variant="outline" onClick={closeWorkspace} className="mt-4 rounded-xl">Voltar ao cronograma</Button>
              </div>
            )}
          </div>
        )
      ) : (
      <>
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
              onExpandCountdown={openCountdownExperience}
              canManage={cronograma.canManage}
              availability={cronograma.isLoading ? 'loading' : cronograma.isSeedFallback ? 'offline' : 'ready'}
            />
            <MobileCronogramaNavigation activeView={activeView} onChange={setActiveView} />
            <MobileCronogramaFilters
              filters={filters}
              events={events}
              onChange={setFilters}
              onClear={clearFilters}
              resultCount={filteredEvents.length}
              totalCount={eventsForView.length}
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
            onExpandCountdown={openCountdownExperience}
            canManage={cronograma.canManage}
            availability={cronograma.isLoading ? 'loading' : cronograma.isSeedFallback ? 'offline' : 'ready'}
          />

          <div className="cronograma-command-dock sticky top-[72px] z-20 space-y-2 py-2">
            <CronogramaViewTabs activeView={activeView} onChange={setActiveView} />
            <CronogramaFiltersBar
              filters={filters}
              events={events}
              onChange={setFilters}
              onClear={clearFilters}
              resultCount={filteredEvents.length}
              totalCount={eventsForView.length}
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
            onEditWorkspace={openWorkspace}
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
          onEditWorkspace={openWorkspace}
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
      </>
      )}
    </main>
  );
}

function WorkspaceLoadingState() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4" role="status">
      <div className="glass-panel flex items-center gap-3 rounded-2xl px-5 py-4 text-sm font-semibold text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
        Preparando conexões do evento…
      </div>
    </div>
  );
}
