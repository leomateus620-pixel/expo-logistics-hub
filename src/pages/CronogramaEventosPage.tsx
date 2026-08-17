import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BadgeCheck, CalendarDays, Loader2, RefreshCw } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarMonthView } from '@/components/cronograma-eventos/CalendarMonthView';
import { UndatedBoard } from '@/components/cronograma-eventos/CronogramaBoards';
import { CronogramaCycleBar } from '@/components/cronograma-eventos/CronogramaCycleBar';
import { CronogramaFiltersSlotProvider } from '@/components/cronograma-eventos/CronogramaFiltersSlot';
import { CronogramaCycleSlotProvider, CronogramaCycleSlotTarget } from '@/components/cronograma-eventos/CronogramaCycleSlot';

import { CronogramaFiltersTrigger } from '@/components/cronograma-eventos/CronogramaFiltersTrigger';
import { CronogramaSecondaryNav } from '@/components/cronograma-eventos/CronogramaSecondaryNav';
import { useCronogramaSearch } from '@/components/cronograma-eventos/CronogramaSearchContext';
import { useCronogramaShell } from '@/components/cronograma-eventos/CronogramaShellContext';

import {
  CronogramaTimelineBoard,
  CronogramaTimelineSkeleton,
} from '@/components/cronograma-eventos/CronogramaTimelineBoard';
import { ViewContentTransition } from '@/components/cronograma-eventos/CronogramaViewTabs';
import { EventDrawer } from '@/components/cronograma-eventos/EventDrawer';
import { EventForm } from '@/components/cronograma-eventos/EventForm';
import { MobileCreateEventScreen } from '@/components/cronograma-eventos/mobile/MobileCreateEventScreen';
import { MobileCronogramaErrorBoundary } from '@/components/cronograma-eventos/mobile/MobileCronogramaErrorBoundary';
import { MobileCronogramaFilters } from '@/components/cronograma-eventos/mobile/MobileCronogramaFilters';
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
import {
  CRONOGRAMA_VIEW_LABELS,
  resolveCronogramaView,
} from '@/components/cronograma-eventos/cronogramaViews';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCronogramaDashboardActivity } from '@/hooks/useCronogramaDashboardActivity';
import { useCronogramaDashboardData } from '@/hooks/useCronogramaDashboardData';
import { useCronogramaEventHistory, useCronogramaEventos } from '@/hooks/useCronogramaEventos';
import { useCronogramaWeeklySummary } from '@/hooks/useCronogramaWeeklySummary';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import {
  getHarvestEventKey,
  mergeHarvestCompletionSnapshots,
  useEventHarvestCompletion,
} from '@/hooks/useEventHarvestCompletion';
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
import type { DashboardDrilldown } from '@/lib/cronograma-dashboard-selectors';
import {
  buildCronogramaViewSearchParams,
  filterTimelineEvents,
  getTodayKey,
  partitionCronogramaEvents,
} from '@/lib/cronograma-timeline';
import '@/styles/cronograma-timeline-recovery.css';
import '@/styles/cronograma-timeline-flagship.css';
import '@/styles/cronograma-harvest-completion.css';
import '@/styles/cronograma-dashboard.css';
import '@/styles/agenda-meeting-intelligence.css';
import '@/styles/cronograma-refino.css';


const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CronogramaDashboardBoard = lazy(async () => {
  const module = await import(
    '@/components/cronograma-eventos/dashboard/CronogramaDashboardBoard'
  );
  return { default: module.default };
});

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
  const { orgId, myRole } = useCurrentOrg();
  const { capSet } = useCapabilities();
  const viewportIsMobilePresentation = useCronogramaMobilePresentation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const todayKey = useCurrentCronogramaDay();
  const [filters, setFilters] = useState<CronogramaFilters>(emptyFilters);
  const headerSearch = useCronogramaSearch();
  const headerQuery = headerSearch?.query ?? '';
  useEffect(() => {
    setFilters((current) => (current.query === headerQuery ? current : { ...current, query: headerQuery }));
  }, [headerQuery]);

  const [selectedEvent, setSelectedEvent] = useState<CronogramaEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerStartsEditing, setDrawerStartsEditing] = useState(false);
  const [selectedSourceUnavailable, setSelectedSourceUnavailable] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingCreatedEvent, setPendingCreatedEvent] = useState<CronogramaEvent | null>(null);
  const [presentationLock, setPresentationLock] = useState<boolean | null>(null);
  const [completionAnnouncement, setCompletionAnnouncement] = useState('');
  const harvestCompletion = useEventHarvestCompletion();
  const overlayIsMobilePresentation = presentationLock ?? viewportIsMobilePresentation;
  // Preserve the trigger, scroll context and form tree during rotation. Overlay CSS
  // adapts the locked presentation to the physical viewport until the interaction closes.
  const contentIsMobilePresentation = overlayIsMobilePresentation;
  const drawerReturnFocusRef = useRef<HTMLElement>(null);
  const timelinePositionRef = useRef({ x: 0, y: 0 });
  const workspacePositionRef = useRef({ x: 0, y: 0 });
  const workspaceTransitionRef = useRef(false);
  const activeHarvestCountRef = useRef(0);
  const completionAnimationEventKeyRef = useRef<string | null>(null);
  const selectedPresenceRef = useRef({ id: '', seenInData: false });
  const overlayOpenRef = useRef({ drawer: false, create: false, filters: false });
  const activeView = resolveCronogramaView(searchParams);
  const requestedTimelineYear = isCronogramaCycleYear(searchParams.get('timelineYear'))
    ? Number(searchParams.get('timelineYear')) as CronogramaCycleYear
    : null;
  const requestedTimelineMonth = isCycleMonthKey(searchParams.get('timelineMonth'))
    ? searchParams.get('timelineMonth')
    : null;
  const deepLinkEvent = searchParams.get('event');
  const deepLinkSubevent = searchParams.get('subevent');
  const deepLinkMode = searchParams.get('mode') === 'edit' ? 'edit' : 'view';
  const setActiveView = (view: CronogramaView) => {
    setSearchParams((current) => {
      return buildCronogramaViewSearchParams(current, activeView, view);
    }, { replace: true });
  };

  const persistedEvents = useMemo(
    () => cronograma.events.map((event) => adaptCronogramaEvent(event, todayKey)),
    [cronograma.events, todayKey],
  );
  const events = useMemo(
    () => mergeHarvestCompletionSnapshots(persistedEvents, harvestCompletion.jobs),
    [harvestCompletion.jobs, persistedEvents],
  );
  const eventBuckets = useMemo(
    () => partitionCronogramaEvents(events, todayKey),
    [events, todayKey],
  );
  const eventsForView = useMemo(() => {
    if (filters.scopeEventIds?.length) return events;
    if (activeView === 'timeline') return eventBuckets.timeline;
    if (activeView === 'completed') return eventBuckets.completed;
    // Pendências: a exclusão de concluídos/cancelados é aplicada pelo board,
    // depois dos filtros globais — aqui a visão recebe o universo completo.
    return events;
  }, [activeView, eventBuckets, events, filters.scopeEventIds]);
  const workspaceIdentity = searchParams.get('workspace');
  const workspaceEvent = useMemo(() => (
    workspaceIdentity
      ? persistedEvents.find((event) => event.id === workspaceIdentity || event.sourceKey === workspaceIdentity) ?? null
      : null
  ), [persistedEvents, workspaceIdentity]);
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
  const meetingIntelligence = useMemo(() => {
    const hasCanonicalEvent = Boolean(
      orgId
      && selectedSourceId
      && UUID_PATTERN.test(selectedSourceId)
      && !cronograma.isSeedFallback
      && !selectedSourceUnavailable,
    );
    return {
      eventId: hasCanonicalEvent ? selectedSourceId : null,
      orgId,
      persistedEvent: hasCanonicalEvent,
      canRecord: hasCanonicalEvent && cronograma.canWriteEvents,
      canReview: hasCanonicalEvent && cronograma.canWriteEvents,
      canDelete: hasCanonicalEvent && (
        myRole === 'admin'
        || myRole === 'gestor'
        || capSet.has('meeting_intelligence_delete')
      ),
    };
  }, [
    capSet,
    cronograma.canWriteEvents,
    cronograma.isSeedFallback,
    myRole,
    orgId,
    selectedSourceId,
    selectedSourceUnavailable,
  ]);

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
    const freshEvent = persistedEvents.find((event) => event.id === selectedEvent.id || event.sourceKey === selectedEvent.sourceKey);
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
    if (!overlayOpenRef.current.create && !overlayOpenRef.current.filters && activeHarvestCountRef.current === 0) {
      setPresentationLock(null);
    }
  }, [cronograma.isLoading, drawerOpen, overlayIsMobilePresentation, persistedEvents, selectedEvent]);

  const filteredEvents = useMemo(
    () => filterTimelineEvents(eventsForView, filters, todayKey).sort(compareEventDates),
    [eventsForView, filters, todayKey],
  );
  const dashboardEventIds = useMemo(
    () => events.map((event) => event.id),
    [events],
  );
  const dashboardActivity = useCronogramaDashboardActivity(
    dashboardEventIds,
    activeView === 'overview',
  );
  const dashboardModel = useCronogramaDashboardData({
    events: filteredEvents,
    logs: dashboardActivity.logs,
    logStatus: dashboardActivity.status,
    todayKey,
  });
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

  // Deep-link from the personal weekly summary: ?week=me scopes the timeline
  // to the events linked to the authenticated user in the current week.
  const weeklySummary = useCronogramaWeeklySummary();
  const weekScopeRequested = searchParams.get('week') === 'me';
  const weeklySummaryReady = !weeklySummary.isLoading;
  const weeklyScopeSignature = weeklySummary.summary.eventIds.join('|');
  useEffect(() => {
    if (!weekScopeRequested || !weeklySummaryReady) return;
    const { window: weekWindow, eventIds } = weeklySummary.summary;
    setFilters({
      ...emptyFilters,
      fromDate: weekWindow.startKey,
      toDate: weekWindow.endKey,
      scopeEventIds: eventIds,
      scopeLabel: 'Minha semana',
    });
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('week');
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekScopeRequested, weeklySummaryReady, weeklyScopeSignature, setSearchParams]);

  const clearFilters = useCallback(() => {
    headerSearch?.setQuery('');
    setFilters(emptyFilters);
  }, [headerSearch]);

  const applyFilters = useCallback((next: CronogramaFilters) => {
    if (headerSearch && next.query !== headerSearch.query) headerSearch.setQuery(next.query);
    setFilters(next);
  }, [headerSearch]);


  const returnToFullCycle = useCallback(() => {
    setFilters((current) => ({
      ...current,
      year: 'all',
      month: 'all',
      period: 'all',
      fromDate: '',
      toDate: '',
      scopeEventIds: undefined,
      scopeLabel: undefined,
    }));
  }, []);
  const handleDashboardDrilldown = useCallback((drilldown: DashboardDrilldown) => {
    setFilters({
      ...emptyFilters,
      ...drilldown.filterPatch,
      scopeEventIds: drilldown.eventIds,
      scopeLabel: drilldown.label,
    });
    setSearchParams((current) => (
      buildCronogramaViewSearchParams(current, activeView, drilldown.view)
    ), { replace: true });
  }, [activeView, setSearchParams]);
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

  const openEvent = useCallback((
    event: CronogramaEvent,
    edit = false,
    completionAnimationEligible = false,
  ) => {
    overlayOpenRef.current.drawer = true;
    setPresentationLock((current) => current ?? viewportIsMobilePresentation);
    timelinePositionRef.current = { x: window.scrollX, y: window.scrollY };
    const activeTrigger = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    if (activeTrigger) drawerReturnFocusRef.current = activeTrigger;
    setSelectedSourceUnavailable(false);
    setSelectedEvent(event);
    completionAnimationEventKeyRef.current = activeView === 'timeline' && completionAnimationEligible
      ? getHarvestEventKey(event)
      : null;
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
  }, [activeView, setSearchParams, viewportIsMobilePresentation]);

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
    completionAnimationEventKeyRef.current = null;
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
      completionAnimationEventKeyRef.current = null;
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
        if (!overlayOpenRef.current.create && !overlayOpenRef.current.drawer && !overlayOpenRef.current.filters && activeHarvestCountRef.current === 0) {
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

  const shell = useCronogramaShell();
  const registerCreateAction = shell?.registerCreateAction;
  const canManageEvents = cronograma.canManage;
  const openCreateRef = useRef(openCreate);
  openCreateRef.current = openCreate;

  useEffect(() => {
    if (!registerCreateAction) return;
    registerCreateAction(canManageEvents ? () => openCreateRef.current() : null);
    return () => registerCreateAction(null);
  }, [registerCreateAction, canManageEvents]);


  const handleCreateOpenChange = (open: boolean) => {
    overlayOpenRef.current.create = open;
    if (open) {
      openCreate();
      return;
    }
    setCreateOpen(false);
    window.setTimeout(() => {
      if (!overlayOpenRef.current.create && !overlayOpenRef.current.drawer && !overlayOpenRef.current.filters && activeHarvestCountRef.current === 0) {
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
      if (!overlayOpenRef.current.create && !overlayOpenRef.current.drawer && !overlayOpenRef.current.filters && activeHarvestCountRef.current === 0) {
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

  const handleDeleteEvent = async (event: CronogramaEvent) => {
    const sourceEvent = sourceById.get(event.id)
      || (event.sourceKey ? sourceById.get(event.sourceKey) : undefined);
    const targetId = sourceEvent?.id ?? event.id;
    try {
      await cronograma.deleteEvent.mutateAsync(targetId);
      setSelectedEvent(null);
      toast.success('Evento excluído.', {
        description: `${event.title} foi removido do cronograma e da agenda dos usuários conectados.`,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível excluir o evento.',
      );
      throw error;
    }
  };


  const handleCompleteEvent = async (event: CronogramaEvent) => {
    if (!cronograma.canWriteEvents) {
      throw new Error(
        'A conclusão exige conexão com a base sincronizada. O evento foi mantido na Linha do tempo sem alterações.',
      );
    }
    const completionSnapshot = event.status === 'completed'
      && selectedEvent
      && getHarvestEventKey(selectedEvent) === getHarvestEventKey(event)
      ? selectedEvent
      : event;
    const shouldAnimate = completionAnimationEventKeyRef.current
      === getHarvestEventKey(completionSnapshot);

    if (!shouldAnimate) {
      setCompletionAnnouncement(`Salvando a conclusão de ${completionSnapshot.title}.`);
      try {
        await handleSave({ ...event, status: 'completed' });
        completionAnimationEventKeyRef.current = null;
        setCompletionAnnouncement(`${completionSnapshot.title} foi movido para Eventos concluídos.`);
        toast.success('Evento movido para Eventos concluídos.', {
          description: completionSnapshot.title,
          action: {
            label: 'Ver concluídos',
            onClick: () => setActiveView('completed'),
          },
        });
        return;
      } catch (error) {
        setCompletionAnnouncement(`A conclusão de ${completionSnapshot.title} não foi aplicada.`);
        throw error;
      }
    }

    if (!harvestCompletion.prepare(completionSnapshot)) {
      throw new Error('A conclusão deste evento já está em andamento. Aguarde a colheita terminar.');
    }

    activeHarvestCountRef.current += 1;
    completionAnimationEventKeyRef.current = null;
    setCompletionAnnouncement(`Salvando a conclusão de ${completionSnapshot.title}.`);
    try {
      await handleSave({ ...event, status: 'completed' });
      drawerReturnFocusRef.current = document.getElementById('cronograma-view-panel');
      setCompletionAnnouncement(`Conclusão de ${completionSnapshot.title} confirmada. Colheita em andamento.`);
      const duration = harvestCompletion.play(completionSnapshot, (completedEvent) => {
        activeHarvestCountRef.current = Math.max(0, activeHarvestCountRef.current - 1);
        setCompletionAnnouncement(`${completedEvent.title} foi movido para Eventos concluídos.`);
        if (
          activeHarvestCountRef.current === 0
          && !overlayOpenRef.current.create
          && !overlayOpenRef.current.drawer
          && !overlayOpenRef.current.filters
        ) {
          setPresentationLock(null);
        }
        toast.success('Evento movido para Eventos concluídos.', {
          description: completedEvent.title,
          action: {
            label: 'Ver concluídos',
            onClick: () => setActiveView('completed'),
          },
        });
      });
      if (duration === 0) {
        activeHarvestCountRef.current = Math.max(0, activeHarvestCountRef.current - 1);
        harvestCompletion.cancel(completionSnapshot);
      }
    } catch (error) {
      activeHarvestCountRef.current = Math.max(0, activeHarvestCountRef.current - 1);
      harvestCompletion.cancel(completionSnapshot);
      completionAnimationEventKeyRef.current = getHarvestEventKey(completionSnapshot);
      setCompletionAnnouncement(`A conclusão de ${completionSnapshot.title} não foi aplicada. O evento permanece na Linha do tempo.`);
      throw error;
    }
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
    if (!workspaceEvent || !subevent.id) {
      throw new Error('Não foi possível identificar este subevento. Atualize a página e tente novamente.');
    }
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
    if (!workspaceEvent || !subevent.id) {
      throw new Error('Não foi possível identificar este subevento. Atualize a página e tente novamente.');
    }
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
          ariaLabel={contentIsMobilePresentation
            ? CRONOGRAMA_VIEW_LABELS[activeView]
            : undefined}
        >
          {activeView === 'overview' && (
            <Suspense fallback={<DashboardLoadingState />}>
              <CronogramaDashboardBoard
                model={dashboardModel}
                logStatus={dashboardActivity.status}
                isFallback={cronograma.isSeedFallback}
                onOpenEvent={(event) => openEvent(event)}
                onDrilldown={handleDashboardDrilldown}
                onRetryActivity={() => {
                  void dashboardActivity.refetch();
                }}
              />
            </Suspense>
          )}

          {activeView === 'timeline' && (
            contentIsMobilePresentation ? (
              <MobileCronogramaTimeline
                events={filteredEvents}
                allEvents={events}
                onOpen={(event) => openEvent(event, false, true)}
                onClearFilters={clearFilters}
                onReturnToFullCycle={returnToFullCycle}
                onOpenUndated={() => setActiveView('undated')}
                requestedYear={requestedTimelineYear}
                requestedMonth={requestedTimelineMonth}
                temporalFocusKey={mobileFocusKey}
                preferredTemporalYear={preferredTemporalYear}
                onPositionChange={handleTimelinePositionChange}
                todayKey={todayKey}
                harvestJobs={harvestCompletion.jobs}
              />
            ) : (
              <CronogramaTimelineBoard
                events={filteredEvents}
                allEvents={events}
                selectedEventId={selectedEvent?.id ?? null}
                onOpen={(event) => openEvent(event, false, true)}
                onClearFilters={clearFilters}
                onReturnToFullCycle={returnToFullCycle}
                onOpenUndated={() => setActiveView('undated')}
                requestedYear={requestedTimelineYear}
                requestedMonth={requestedTimelineMonth}
                temporalFocusKey={temporalFocusKey}
                preferredTemporalYear={preferredTemporalYear}
                onPositionChange={handleTimelinePositionChange}
                todayKey={todayKey}
                harvestJobs={harvestCompletion.jobs}
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

          {activeView === 'undated' && (
            <UndatedBoard
              events={filteredEvents}
              todayKey={todayKey}
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
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {completionAnnouncement}
      </span>
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
          <CronogramaCycleSlotProvider>
            <div className="cronograma-mobile-experience mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-2.5 overflow-x-clip px-3">
              <div className="cronograma-mobile-command">
                <MobileCronogramaNavDrawer activeView={activeView} onChange={setActiveView} />
                <CronogramaCycleSlotTarget className="cronograma-mobile-cycle-slot" />
              </div>

              <MobileCronogramaFilters
                filters={filters}
                events={events}
                onChange={applyFilters}
                onClear={clearFilters}
                resultCount={filteredEvents.length}
                totalCount={eventsForView.length}
                syncing={cronograma.isRefreshing}
                onOverlayOpenChange={handleMobileFiltersOpenChange}
              />
              {operationalContent}
            </div>
          </CronogramaCycleSlotProvider>
        </MobileCronogramaErrorBoundary>
      ) : (
        <CronogramaCycleSlotProvider>
          <div className="cronograma-workbench mx-auto flex w-full max-w-[1680px] gap-4 px-3 sm:px-5 2xl:px-8">
            <CronogramaSideNav
              activeView={activeView}
              onChange={setActiveView}
              filters={(
                <CronogramaFiltersTrigger
                  filters={filters}
                  events={events}
                  onChange={applyFilters}
                  onClear={clearFilters}
                  resultCount={filteredEvents.length}
                  syncing={cronograma.isRefreshing}
                />
              )}
            />

            <div className="cronograma-workbench__content flex min-w-0 flex-1 flex-col gap-3">
              {activeView !== 'timeline' && activeView !== 'completed' && (
                <CronogramaCycleBar
                  label="Visão operacional"
                  title={CRONOGRAMA_VIEW_LABELS[activeView]}
                />
              )}

              {operationalContent}
            </div>
          </div>
        </CronogramaCycleSlotProvider>
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
            onComplete={handleCompleteEvent}
            onEditWorkspace={openWorkspace}
            onDelete={handleDeleteEvent}
            startInEdit={drawerStartsEditing}
            canManage={cronograma.canManage}
            canDelete={cronograma.canDeleteSubevents}
            returnFocusRef={drawerReturnFocusRef}
            history={eventHistory.entries}
            historyLoading={eventHistory.isLoading}
            historyError={eventHistory.error}
            canViewHistory={eventHistory.canViewHistory}
            sourceUnavailable={selectedSourceUnavailable}
            meetingIntelligence={meetingIntelligence}
          />
        </MobileCronogramaErrorBoundary>
      ) : (
        <EventDrawer
          event={selectedEvent}
          open={drawerOpen}
          onOpenChange={handleDrawerOpenChange}
          onSave={handleSave}
          onComplete={handleCompleteEvent}
          onEditWorkspace={openWorkspace}
          onDelete={handleDeleteEvent}
          startInEdit={drawerStartsEditing}
          canManage={cronograma.canManage}
          canDelete={cronograma.canDeleteSubevents}
          returnFocusRef={drawerReturnFocusRef}
          history={eventHistory.entries}
          historyLoading={eventHistory.isLoading}
          historyError={eventHistory.error}
          canViewHistory={eventHistory.canViewHistory}
          meetingIntelligence={meetingIntelligence}
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
            <DialogHeader className="cronograma-create-dialog__header">
              <DialogTitle className="cronograma-create-dialog__title">
                <span className="cronograma-create-dialog__badge" aria-hidden="true">
                  <CalendarDays />
                </span>
                Novo evento
              </DialogTitle>
              <DialogDescription className="sr-only">
                Formulário de cadastro de evento do cronograma.
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

function DashboardLoadingState() {
  return (
    <div className="grid gap-3" role="status" aria-label="Preparando Dashboard executivo">
      <div className="h-44 animate-pulse rounded-2xl border border-border/50 bg-white/65 motion-reduce:animate-none" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl border border-border/50 bg-white/65 motion-reduce:animate-none"
          />
        ))}
      </div>
      <span className="sr-only">Preparando indicadores, gráficos e análises do cronograma.</span>
    </div>
  );
}
