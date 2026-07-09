import { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CronogramaCommandHeader } from '@/components/cronograma-eventos/CronogramaCommandHeader';
import { CronogramaFiltersBar } from '@/components/cronograma-eventos/CronogramaFiltersBar';
import { CronogramaViewTabs, ViewContentTransition } from '@/components/cronograma-eventos/CronogramaViewTabs';
import {
  CategoryBoard,
  MeetingsBoard,
  OverviewBoard,
  UndatedBoard,
  YearBoard,
} from '@/components/cronograma-eventos/CronogramaBoards';
import { CronogramaTimelineBoard } from '@/components/cronograma-eventos/CronogramaTimelineBoard';
import { CalendarMonthView } from '@/components/cronograma-eventos/CalendarMonthView';
import { EventDrawer } from '@/components/cronograma-eventos/EventDrawer';
import { EventForm } from '@/components/cronograma-eventos/EventForm';
import { compareEventDates } from '@/components/cronograma-eventos/dateUtils';
import {
  adaptCronogramaEvent,
  visualEventToDraft,
  visualEventToSourceUpdates,
} from '@/components/cronograma-eventos/modelAdapter';
import type { CronogramaEvent, CronogramaFilters, CronogramaView } from '@/components/cronograma-eventos/types';
import { useCronogramaEventos } from '@/hooks/useCronogramaEventos';
import type { CronogramaEvent as SourceCronogramaEvent } from '@/lib/cronograma-eventos';

const emptyFilters: CronogramaFilters = {
  query: '',
  year: 'all',
  category: 'all',
  status: 'all',
  priority: 'all',
};

const cronogramaViews: CronogramaView[] = ['overview', 'timeline', 'calendar', 'year', 'category', 'meetings', 'undated'];

function isCronogramaView(value: string | null): value is CronogramaView {
  return Boolean(value && cronogramaViews.includes(value as CronogramaView));
}

export default function CronogramaEventosPage() {
  const cronograma = useCronogramaEventos();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<CronogramaFilters>(emptyFilters);
  const [selectedEvent, setSelectedEvent] = useState<CronogramaEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerStartsEditing, setDrawerStartsEditing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const activeView = isCronogramaView(searchParams.get('view')) ? searchParams.get('view') as CronogramaView : 'overview';

  const setActiveView = (view: CronogramaView) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (view === 'overview') next.delete('view');
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

  useEffect(() => {
    if (!selectedEvent) return;
    const freshEvent = events.find((event) => event.id === selectedEvent.id || event.sourceKey === selectedEvent.sourceKey);
    if (freshEvent && freshEvent !== selectedEvent) setSelectedEvent(freshEvent);
  }, [events, selectedEvent]);

  const filteredEvents = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return events
      .filter((event) => {
        if (filters.year !== 'all' && event.year !== filters.year) return false;
        if (filters.category !== 'all' && event.category !== filters.category) return false;
        if (filters.status !== 'all' && event.status !== filters.status) return false;
        if (filters.priority !== 'all' && event.priority !== filters.priority) return false;
        if (!query) return true;
        const haystack = [
          event.title,
          event.summary,
          event.location,
          event.owner,
          event.commission,
          event.pendingReason,
          event.decisionNeeded,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(query);
      })
      .sort(compareEventDates);
  }, [events, filters]);

  const openEvent = (event: CronogramaEvent, edit = false) => {
    setSelectedEvent(event);
    setDrawerStartsEditing(edit);
    setDrawerOpen(true);
  };

  const handleDrawerOpenChange = (open: boolean) => {
    setDrawerOpen(open);
    if (!open) {
      setDrawerStartsEditing(false);
    }
  };

  const handleSave = (nextEvent: CronogramaEvent) => {
    const sourceEvent = sourceById.get(nextEvent.id) || (nextEvent.sourceKey ? sourceById.get(nextEvent.sourceKey) : undefined);
    if (sourceEvent) {
      cronograma.update.mutate({
        id: sourceEvent.id,
        updates: visualEventToSourceUpdates(nextEvent, sourceEvent),
      });
    } else {
      cronograma.create.mutate(visualEventToDraft(nextEvent));
    }
    setSelectedEvent(nextEvent);
  };

  const handleCreate = (event: CronogramaEvent) => {
    const id = `custom-${Date.now()}`;
    const nextEvent = {
      ...event,
      id,
      sourceKey: `manual-${id}`,
      isOfficial: false,
      isMain: false,
    };
    cronograma.create.mutate(visualEventToDraft(nextEvent), {
      onSuccess: (sourceEvent) => {
        const createdEvent = adaptCronogramaEvent(sourceEvent);
        setCreateOpen(false);
        openEvent(createdEvent);
      },
    });
  };

  const preferredCalendarYear = filters.year === 'all' ? undefined : filters.year;

  return (
    <main className="cronograma-page min-h-screen pb-10">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-3 sm:px-5 2xl:px-8">
        <CronogramaCommandHeader
          events={events}
          onNewEvent={() => setCreateOpen(true)}
          onOpenUndated={() => setActiveView('undated')}
          canManage={cronograma.canManage}
        />

        <div className="cronograma-command-dock sticky top-[72px] z-20 space-y-2 py-2">
          <CronogramaViewTabs activeView={activeView} onChange={setActiveView} />
          <CronogramaFiltersBar
            filters={filters}
            onChange={setFilters}
            onClear={() => setFilters(emptyFilters)}
            resultCount={filteredEvents.length}
            totalCount={events.length}
          />
        </div>

        <p className="sr-only" aria-live="polite">
          {filteredEvents.length} de {events.length} eventos exibidos na visão atual.
        </p>

        <ViewContentTransition view={activeView}>
          {activeView === 'overview' && (
            <OverviewBoard
              events={filteredEvents}
              onOpen={(event) => openEvent(event)}
              onEdit={(event) => openEvent(event, true)}
              onSwitchView={setActiveView}
            />
          )}

          {activeView === 'timeline' && (
            <CronogramaTimelineBoard events={filteredEvents} onOpen={(event) => openEvent(event)} />
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
      </div>

      <EventDrawer
        event={selectedEvent}
        open={drawerOpen}
        onOpenChange={handleDrawerOpenChange}
        onSave={handleSave}
        startInEdit={drawerStartsEditing}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-gold" />
              Novo evento do cronograma
            </DialogTitle>
            <DialogDescription>
              Criação local para planejamento e apresentação do cronograma. Não altera dados operacionais existentes.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto pr-1">
            <EventForm
              onSubmit={handleCreate}
              onCancel={() => setCreateOpen(false)}
              submitLabel="Criar evento"
            />
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
