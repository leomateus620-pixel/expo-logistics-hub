import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import CalendarMonthView from '@/components/cronograma-eventos/CalendarMonthView';
import {
  CompactTimeline,
  CategoryCompactBoard,
  CentralMeetingsBoard,
  EmptyCronogramaState,
  OverviewExecutivePanel,
  SearchAwareEmpty,
  UndatedDecisionBoard,
  ViewTransition,
  YearCompactBoard,
} from '@/components/cronograma-eventos/CronogramaBoards';
import CronogramaCommandHeader from '@/components/cronograma-eventos/CronogramaCommandHeader';
import CronogramaFiltersBar from '@/components/cronograma-eventos/CronogramaFiltersBar';
import CronogramaViewTabs, { type CronogramaView } from '@/components/cronograma-eventos/CronogramaViewTabs';
import EventDrawer from '@/components/cronograma-eventos/EventDrawer';
import EventForm from '@/components/cronograma-eventos/EventForm';
import { useCronogramaEventos, type CronogramaEventDraft } from '@/hooks/useCronogramaEventos';
import {
  buildCronogramaKpis,
  defaultCronogramaFilters,
  filterCronogramaEvents,
  type CronogramaEvent,
  type CronogramaFilters,
} from '@/lib/cronograma-eventos';

function LoadingWorkspace() {
  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-28 rounded-2xl bg-white/60" />
      ))}
    </div>
  );
}

export default function CronogramaEventosPage() {
  const { events, isLoading, isSeedFallback, canManage, create, update } = useCronogramaEventos();
  const [filters, setFilters] = useState<CronogramaFilters>(defaultCronogramaFilters);
  const [view, setView] = useState<CronogramaView>('overview');
  const [selectedEvent, setSelectedEvent] = useState<CronogramaEvent | null>(null);
  const [formEvent, setFormEvent] = useState<CronogramaEvent | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const kpis = useMemo(() => buildCronogramaKpis(events), [events]);
  const filteredEvents = useMemo(() => filterCronogramaEvents(events, filters), [events, filters]);

  const openNew = () => {
    setFormEvent(null);
    setFormOpen(true);
  };

  const openEdit = (event: CronogramaEvent) => {
    setFormEvent(event);
    setFormOpen(true);
  };

  const handleSubmit = async (payload: Partial<CronogramaEvent> & Pick<CronogramaEvent, 'title' | 'category' | 'eventType'>) => {
    try {
      if (formEvent) {
        await update.mutateAsync({ id: formEvent.id, updates: payload });
        toast.success('Evento atualizado');
      } else {
        await create.mutateAsync(payload as CronogramaEventDraft);
        toast.success('Evento criado');
      }
      setFormOpen(false);
      setFormEvent(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Não foi possível salvar o evento';
      toast.error(message);
    }
  };

  const showUndated = () => {
    setFilters((current) => ({ ...current, dateMode: 'undated', month: 'sem-data' }));
    setView('undated');
  };

  const handleAddSubevent = (event: CronogramaEvent) => {
    setSelectedEvent(null);
    toast.info('Subeventos preparados para cadastro vinculado');
    openEdit(event);
  };

  const renderContent = () => {
    if (isLoading) return <LoadingWorkspace />;

    if (filteredEvents.length === 0) {
      return (
        <div className="space-y-3">
          <EmptyCronogramaState title="Nenhum evento encontrado" text="Ajuste os filtros para visualizar mais registros oficiais." />
          <SearchAwareEmpty events={events} />
        </div>
      );
    }

    if (view === 'overview') {
      return <OverviewExecutivePanel events={filteredEvents} onSelect={setSelectedEvent} onView={setView} />;
    }

    if (view === 'timeline') {
      return <CompactTimeline events={filteredEvents} onSelect={setSelectedEvent} />;
    }

    if (view === 'calendar') {
      return <CalendarMonthView events={filteredEvents} onSelect={setSelectedEvent} />;
    }

    if (view === 'year') {
      return <YearCompactBoard events={filteredEvents} onSelect={setSelectedEvent} />;
    }

    if (view === 'category') {
      return <CategoryCompactBoard events={filteredEvents} onSelect={setSelectedEvent} />;
    }

    if (view === 'central') {
      return <CentralMeetingsBoard events={filteredEvents} onSelect={setSelectedEvent} />;
    }

    return <UndatedDecisionBoard events={filteredEvents} onSelect={setSelectedEvent} onEdit={openEdit} />;
  };

  return (
    <div className="min-h-screen space-y-3 pb-8">
      <CronogramaCommandHeader
        total={kpis.total}
        byYear={kpis.byYear}
        centralMeetings={kpis.centralMeetings}
        undated={kpis.undated}
        isSeedFallback={isSeedFallback}
        onNew={openNew}
        onUndated={showUndated}
      />

      <div className="sticky top-2 z-20 space-y-2 rounded-[1.35rem] bg-background/75 pb-2 backdrop-blur-2xl">
        <CronogramaViewTabs value={view} onChange={setView} resultsCount={filteredEvents.length} />
        <CronogramaFiltersBar filters={filters} onChange={setFilters} events={events} resultsCount={filteredEvents.length} />
      </div>

      <main className="min-h-[520px]">
        <ViewTransition view={view}>{renderContent()}</ViewTransition>
      </main>

      <EventDrawer
        event={selectedEvent}
        open={!!selectedEvent}
        onOpenChange={(open) => !open && setSelectedEvent(null)}
        onEdit={(event) => {
          setSelectedEvent(null);
          openEdit(event);
        }}
        onAddSubevent={handleAddSubevent}
      />

      <EventForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setFormEvent(null);
        }}
        event={formEvent}
        onSubmit={handleSubmit}
        isSubmitting={create.isPending || update.isPending}
      />

      {!canManage && (
        <div className="fixed bottom-4 right-4 z-30 rounded-2xl border border-border/60 bg-card/95 px-4 py-3 text-xs font-semibold text-muted-foreground shadow-xl backdrop-blur-xl">
          Acesso em modo leitura
        </div>
      )}
    </div>
  );
}
