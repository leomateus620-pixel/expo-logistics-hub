import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarCheck2,
  ChevronDown,
  ChevronRight,
  Flag,
  Layers3,
  Route,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CronogramaCategoryMarker,
  CronogramaMetaBadge,
  CronogramaPriorityIndicator,
  CronogramaStatusIndicator,
  EventMetaLine,
} from './CronogramaBadges';
import {
  CategoryInsightCard,
  CronogramaEventCard,
  MeetingAgendaCard,
  UndatedDecisionCard,
  YearColumnHeader,
} from './EventCards';
import { CRONOGRAMA_YEARS, categoryLabels } from './cronogramaData';
import { compareEventDates, formatLongDateRange, formatShortDateRange, getDateParts, getMonthLabel } from './dateUtils';
import type { CronogramaCategory, CronogramaEvent, CronogramaView } from './types';

export function OverviewBoard({
  events,
  onOpen,
  onEdit,
  onSwitchView,
}: {
  events: CronogramaEvent[];
  onOpen: (event: CronogramaEvent) => void;
  onEdit: (event: CronogramaEvent) => void;
  onSwitchView: (view: CronogramaView) => void;
}) {
  const datedEvents = [...events].filter((event) => event.date).sort(compareEventDates);
  const main2028 = events.find((event) => event.id === 'fenasoja-2028-abertura') || datedEvents.find((event) => event.year === 2028 && event.isMain);
  const nextEvents = datedEvents.slice(0, 5);
  const undated = events.filter((event) => !event.date).slice(0, 3);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_420px]">
      <section className="space-y-4">
        {main2028 && (
          <article className="cronograma-main-event relative overflow-hidden p-5 sm:p-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,hsl(var(--primary)/0.16),transparent_32%),radial-gradient(circle_at_94%_20%,hsl(var(--gold)/0.18),transparent_28%)]" />
            <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-end">
              <div className="min-w-0">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <CronogramaMetaBadge icon={Sparkles} tone="gold">Marco principal</CronogramaMetaBadge>
                  <CronogramaMetaBadge icon={Flag} tone="green">Fenasoja 2028</CronogramaMetaBadge>
                </div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary/75">Destaque executivo</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">{main2028.title}</h2>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">{main2028.summary}</p>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <EventMetaLine event={main2028} />
                  <CronogramaPriorityIndicator priority={main2028.priority} />
                </div>
              </div>
              <div className="cronograma-main-date-panel p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Data oficial</p>
                <p className="mt-2 text-2xl font-black leading-tight text-primary">{formatLongDateRange(main2028.date, main2028.endDate)}</p>
                <Button type="button" onClick={() => onOpen(main2028)} className="mt-4 w-full rounded-full">
                  Abrir detalhes
                </Button>
              </div>
            </div>
          </article>
        )}

        <section className="cronograma-ledger p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Leitura rápida</p>
              <h2 className="text-xl font-black tracking-tight">Próximos eventos oficiais</h2>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => onSwitchView('timeline')} className="rounded-full text-xs">
              Ver linha do tempo
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="divide-y divide-border/40">
            {nextEvents.map((event, index) => (
              <CronogramaEventCard key={event.id} event={event} index={index} compact onOpen={onOpen} onEdit={onEdit} />
            ))}
          </div>
        </section>
      </section>

      <aside className="space-y-4">
        <section className="cronograma-ledger is-undated p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Central de decisão</p>
              <h2 className="text-xl font-black tracking-tight">Pendências sem data</h2>
            </div>
            <AlertCircle className="h-5 w-5 text-amber-800" />
          </div>
          <div className="space-y-3">
            {undated.map((event) => (
              <UndatedDecisionCard key={event.id} event={event} onOpen={onOpen} onEdit={onEdit} />
            ))}
          </div>
          <Button type="button" variant="outline" onClick={() => onSwitchView('undated')} className="mt-4 w-full rounded-full border-gold/25 bg-white/55 text-xs">
            Ver todas as pendências
          </Button>
        </section>
      </aside>
    </div>
  );
}

export function TimelineBoard({
  events,
  onOpen,
}: {
  events: CronogramaEvent[];
  onOpen: (event: CronogramaEvent) => void;
}) {
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
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

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {CRONOGRAMA_YEARS.map((year) => {
        const months = grouped.get(year) || new Map();
        const yearEvents = Array.from(months.values()).flat();
        return (
          <section key={year} className="rounded-[1.75rem] border border-white/60 bg-white/60 p-3 shadow-[0_18px_58px_-44px_rgb(21_62_39/0.42),inset_0_1px_0_rgb(255_255_255/0.62)]">
            <YearColumnHeader year={year} events={yearEvents} />
            <div className="space-y-3">
              {Array.from(months.entries()).map(([month, monthEvents]) => {
                const key = `${year}-${month}`;
                const open = openMonths[key] ?? true;
                return (
                  <div key={key} className="relative rounded-2xl border border-border/35 bg-white/58 p-3">
                    <div className="absolute bottom-4 left-[1.08rem] top-12 w-px bg-gradient-to-b from-gold/55 via-primary/20 to-transparent" />
                    <button
                      type="button"
                      onClick={() => setOpenMonths((value) => ({ ...value, [key]: !open }))}
                      className="mb-3 flex w-full items-center justify-between gap-3 rounded-xl text-left focus-ring"
                    >
                      <span>
                        <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Mês</span>
                        <span className="text-lg font-black tracking-tight text-foreground">{getMonthLabel(month)}</span>
                      </span>
                      <span className="flex items-center gap-2 text-xs font-bold text-primary">
                        {monthEvents.length} eventos
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </span>
                    </button>
                    <div className={cn('grid gap-2 overflow-hidden transition-opacity duration-200', open ? 'max-h-[900px] opacity-100' : 'max-h-0 opacity-0')}>
                      {monthEvents.map((event) => (
                        <TimelineItem key={event.id} event={event} onOpen={onOpen} />
                      ))}
                    </div>
                  </div>
                );
              })}
              {yearEvents.length === 0 && <EmptyBoardState title={`Sem eventos em ${year}`} text="Ajuste os filtros para ampliar a visão." />}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TimelineItem({ event, onOpen }: { event: CronogramaEvent; onOpen: (event: CronogramaEvent) => void }) {
  return (
    <button type="button" onClick={() => onOpen(event)} className="group relative ml-5 block rounded-xl border border-border/32 bg-white/62 p-3 text-left transition hover:border-gold/35 hover:bg-white focus-ring">
      <span className="absolute -left-[1.68rem] top-4 h-3 w-3 rounded-full border-2 border-white bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.10)]" />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-gold">{formatShortDateRange(event.date, event.endDate)} · {event.startTime || 'horário a definir'}</p>
          <h4 className="mt-1 line-clamp-2 text-sm font-bold leading-tight text-foreground group-hover:text-primary">{event.title}</h4>
        </div>
        <CronogramaStatusIndicator status={event.status} compact />
      </div>
    </button>
  );
}

export function YearBoard({
  events,
  onOpen,
  onEdit,
}: {
  events: CronogramaEvent[];
  onOpen: (event: CronogramaEvent) => void;
  onEdit: (event: CronogramaEvent) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {CRONOGRAMA_YEARS.map((year) => {
        const yearEvents = events.filter((event) => event.year === year).sort(compareEventDates);
        const months = groupByMonth(yearEvents.filter((event) => event.date));
        return (
          <section key={year} className="max-h-[calc(100vh-180px)] overflow-auto rounded-[1.75rem] border border-white/60 bg-white/58 p-3 shadow-[0_18px_58px_-44px_rgb(21_62_39/0.42),inset_0_1px_0_rgb(255_255_255/0.62)]">
            <YearColumnHeader year={year} events={yearEvents} />
            <div className="space-y-3">
              {Array.from(months.entries()).map(([month, monthEvents]) => (
                <div key={`${year}-${month}`} className="rounded-2xl border border-border/35 bg-white/55 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="font-black tracking-tight text-foreground">{getMonthLabel(month)}</h4>
                    <span className="rounded-full bg-primary/[0.07] px-2 py-1 text-[10px] font-bold text-primary">{monthEvents.length}</span>
                  </div>
                  <div className="space-y-2">
                    {monthEvents.map((event, index) => (
                      <CronogramaEventCard key={event.id} event={event} index={index} compact onOpen={onOpen} onEdit={onEdit} />
                    ))}
                  </div>
                </div>
              ))}
              {yearEvents.filter((event) => !event.date).map((event) => (
                <UndatedDecisionCard key={event.id} event={event} onOpen={onOpen} onEdit={onEdit} />
              ))}
              {yearEvents.length === 0 && <EmptyBoardState title={`Sem itens em ${year}`} text="Nenhum evento atende aos filtros atuais." />}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function CategoryBoard({
  events,
  onOpen,
}: {
  events: CronogramaEvent[];
  onOpen: (event: CronogramaEvent) => void;
}) {
  const categories = Object.keys(categoryLabels) as CronogramaCategory[];
  return (
    <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
      {categories.map((category) => {
        const categoryEvents = events.filter((event) => event.category === category).sort(compareEventDates);
        if (categoryEvents.length === 0) return null;
        return <CategoryInsightCard key={category} category={category} events={categoryEvents} onOpen={onOpen} />;
      })}
    </div>
  );
}

export function MeetingsBoard({
  events,
  onOpen,
}: {
  events: CronogramaEvent[];
  onOpen: (event: CronogramaEvent) => void;
}) {
  const meetings = events.filter((event) => event.isCentralMeeting).sort(compareEventDates);
  const byYear = CRONOGRAMA_YEARS.map((year) => ({
    year,
    events: meetings.filter((event) => event.year === year),
  }));

  return (
    <div className="space-y-4">
      <section className="cronograma-board-heading p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Agenda institucional</p>
            <h2 className="text-2xl font-black tracking-tight">Reuniões centrais por ano</h2>
          </div>
          <CronogramaMetaBadge icon={CalendarCheck2} tone="green">{meetings.length} reuniões</CronogramaMetaBadge>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        {byYear.map(({ year, events: yearMeetings }) => (
          <section key={year} className="rounded-[1.75rem] border border-white/60 bg-white/58 p-3 shadow-[0_18px_58px_-44px_rgb(21_62_39/0.42),inset_0_1px_0_rgb(255_255_255/0.62)]">
            <YearColumnHeader year={year} events={yearMeetings} />
            <div className="space-y-3">
              {yearMeetings.map((event, index) => (
                <MeetingAgendaCard key={event.id} event={event} index={index} onOpen={onOpen} />
              ))}
              {yearMeetings.length === 0 && <EmptyBoardState title="Sem reunião central" text="Nenhuma reunião atende aos filtros atuais." />}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function UndatedBoard({
  events,
  onOpen,
  onEdit,
}: {
  events: CronogramaEvent[];
  onOpen: (event: CronogramaEvent) => void;
  onEdit: (event: CronogramaEvent) => void;
}) {
  const undated = events.filter((event) => !event.date);
  const byCategory = Object.keys(categoryLabels).map((category) => ({
    category: category as CronogramaCategory,
    events: undated.filter((event) => event.category === category),
  })).filter((group) => group.events.length > 0);

  return (
    <div className="space-y-4">
      <section className="cronograma-board-heading is-undated p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-950/65">Central de decisões pendentes</p>
            <h2 className="text-2xl font-black tracking-tight">Pendências sem data</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Itens sem data oficial continuam preservados, mas aparecem como decisões de planejamento em vez de alertas genéricos.
            </p>
          </div>
          <CronogramaMetaBadge icon={Route} tone="gold">{undated.length} decisões</CronogramaMetaBadge>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {byCategory.map(({ category, events: categoryEvents }) => (
          <section key={category} className="rounded-[1.75rem] border border-white/60 bg-white/58 p-4 shadow-[0_18px_58px_-44px_rgb(21_62_39/0.42),inset_0_1px_0_rgb(255_255_255/0.62)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <CronogramaCategoryMarker category={category} className="mb-2" />
                <h3 className="text-xl font-black tracking-tight">{categoryLabels[category]}</h3>
              </div>
              <span className="rounded-full bg-gold/[0.10] px-2.5 py-1 text-xs font-bold text-amber-950">{categoryEvents.length}</span>
            </div>
            <div className="space-y-3">
              {categoryEvents.map((event) => (
                <UndatedDecisionCard key={event.id} event={event} onOpen={onOpen} onEdit={onEdit} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function groupByMonth(events: CronogramaEvent[]) {
  const map = new Map<number, CronogramaEvent[]>();
  events.forEach((event) => {
    const parts = getDateParts(event.date);
    if (!parts) return;
    if (!map.has(parts.month)) map.set(parts.month, []);
    map.get(parts.month)!.push(event);
  });
  map.forEach((value) => value.sort(compareEventDates));
  return map;
}

function EmptyBoardState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/55 bg-white/38 p-5 text-center">
      <Layers3 className="mx-auto h-5 w-5 text-muted-foreground" />
      <p className="mt-2 text-sm font-bold text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}
