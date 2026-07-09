import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  Columns3,
  Flag,
  ListTodo,
  UsersRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  formatEventRange,
  getMonthLabel,
  groupByMonth,
  groupByYear,
  isCentralMeeting,
  isMainFenasojaEvent,
  type CronogramaEvent,
} from '@/lib/cronograma-eventos';
import type { CronogramaView } from './CronogramaViewTabs';
import { CategoryBadge } from './CronogramaBadges';
import {
  EventCompactCard,
  EventFeaturedCard,
  EventListRow,
  EventMiniCard,
  MeetingMiniCard,
  UndatedDecisionCard,
} from './EventCards';

const years = [2026, 2027, 2028] as const;

const yearNarratives: Record<2026 | 2027 | 2028, { title: string; text: string }> = {
  2026: {
    title: 'Estruturação inicial',
    text: 'Comissões, mídia, fornecedores e primeiras agendas externas.',
  },
  2027: {
    title: 'Consolidação',
    text: 'Contratações, parcerias, projetos e preparação operacional.',
  },
  2028: {
    title: 'Reta final e realização',
    text: 'Lançamentos, reuniões intensivas, feira e encerramento oficial.',
  },
};

interface BoardProps {
  events: CronogramaEvent[];
  onSelect: (event: CronogramaEvent) => void;
}

interface OverviewExecutivePanelProps extends BoardProps {
  onView: (view: CronogramaView) => void;
}

interface UndatedDecisionBoardProps extends BoardProps {
  onEdit: (event: CronogramaEvent) => void;
}

export function ViewTransition({ view, children }: { view: CronogramaView; children: ReactNode }) {
  return (
    <div key={view} className="animate-page-in">
      {children}
    </div>
  );
}

export function EmptyCronogramaState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-white/60 p-8 text-center backdrop-blur-xl">
      <p className="text-sm font-black text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  count,
  action,
  children,
  className,
}: {
  icon: typeof CalendarDays;
  title: string;
  count?: number;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('liquid-glass-card rounded-2xl p-3.5', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <h2 className="truncate text-base font-black tracking-tight text-foreground">{title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {typeof count === 'number' && (
            <span className="rounded-full bg-white/70 px-2 py-1 text-[11px] font-black text-muted-foreground shadow-sm">{count}</span>
          )}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}

function getTodayKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function getUpcomingEvents(events: CronogramaEvent[], limit: number) {
  const today = getTodayKey();
  const upcoming = events.filter((event) => event.startDate && event.startDate >= today && !isMainFenasojaEvent(event));
  const fallback = events.filter((event) => event.startDate && !isMainFenasojaEvent(event));
  return (upcoming.length ? upcoming : fallback).slice(0, limit);
}

function groupByCategory(events: CronogramaEvent[]) {
  const map = new Map<string, CronogramaEvent[]>();
  for (const event of events) {
    map.set(event.category, [...(map.get(event.category) ?? []), event]);
  }
  return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'pt-BR'));
}

function MonthAccordion({
  monthKey,
  events,
  onSelect,
  defaultOpen,
  compactLimit = 6,
}: {
  monthKey: string;
  events: CronogramaEvent[];
  onSelect: (event: CronogramaEvent) => void;
  defaultOpen?: boolean;
  compactLimit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const firstDate = events.find((event) => event.startDate)?.startDate;
  const monthLabel = monthKey.endsWith('sem-data') ? 'Sem data definida' : getMonthLabel(firstDate) ?? monthKey;
  const visible = expanded ? events : events.slice(0, compactLimit);
  const hidden = events.length - visible.length;

  return (
    <details
      className="group rounded-2xl border border-border/50 bg-white/60 p-2.5 shadow-sm backdrop-blur-xl open:bg-white/80"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-1 py-0.5 focus-ring [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-foreground">{monthLabel}</p>
          <p className="text-[11px] font-bold text-muted-foreground">{events.length} registros</p>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition group-open:rotate-180" />
      </summary>
      <div className="mt-2 space-y-2">
        {visible.map((event) => (
          <EventMiniCard key={event.id} event={event} onSelect={onSelect} />
        ))}
        {hidden > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(event) => {
              event.preventDefault();
              setExpanded(true);
            }}
            className="h-8 w-full rounded-xl text-xs font-bold"
          >
            Ver mais {hidden} eventos do mês
          </Button>
        )}
      </div>
    </details>
  );
}

function CategoryEventLine({ event, onSelect }: { event: CronogramaEvent; onSelect: (event: CronogramaEvent) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className="group flex w-full items-center gap-2 rounded-xl border border-border/50 bg-white/75 px-2.5 py-2 text-left shadow-sm transition hover:border-primary/30 hover:bg-white/90 focus-ring"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-primary/75" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-black text-foreground">{event.title}</span>
        <span className="block truncate text-[10px] font-semibold text-muted-foreground">{formatEventRange(event)}</span>
      </span>
    </button>
  );
}

export function OverviewExecutivePanel({ events, onSelect, onView }: OverviewExecutivePanelProps) {
  const mainEvent = events.find(isMainFenasojaEvent);
  const upcoming = getUpcomingEvents(events, 6);
  const undated = events.filter((event) => !event.hasExactDate).slice(0, 4);
  const central = events.filter(isCentralMeeting).slice(0, 4);
  const byYear = groupByYear(events);
  const categoryGroups = groupByCategory(events).slice(0, 6);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_390px]">
        <div className="space-y-3">
          {mainEvent && <EventFeaturedCard event={mainEvent} onSelect={onSelect} />}

          <Panel
            icon={CalendarDays}
            title="Próximos eventos oficiais"
            count={upcoming.length}
            action={
              <Button variant="ghost" size="sm" className="h-8 rounded-xl text-xs font-bold" onClick={() => onView('timeline')}>
                Timeline
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            }
          >
            <div className="grid gap-2 lg:grid-cols-2">
              {upcoming.map((event) => (
                <EventCompactCard key={event.id} event={event} onSelect={onSelect} />
              ))}
            </div>
          </Panel>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <Panel icon={Columns3} title="Distribuição por ano">
              <div className="grid gap-2 sm:grid-cols-3">
                {years.map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => onView('year')}
                    className="rounded-2xl border border-border/50 bg-white/70 p-3 text-left shadow-sm transition hover:border-primary/30 hover:bg-white/90 focus-ring"
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-800 dark:text-gold">{yearNarratives[year].title}</p>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <span className="text-2xl font-black text-foreground">{year}</span>
                      <span className="text-sm font-black text-primary">{byYear[year]?.length ?? 0}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs font-semibold text-muted-foreground">{yearNarratives[year].text}</p>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel icon={BarChart3} title="Categorias principais">
              <div className="grid gap-2 sm:grid-cols-2">
                {categoryGroups.slice(0, 4).map(([category, categoryEvents]) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => onView('category')}
                    className="rounded-2xl border border-border/50 bg-white/70 p-3 text-left shadow-sm transition hover:border-primary/30 hover:bg-white/90 focus-ring"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <CategoryBadge category={category} />
                      <span className="text-sm font-black text-primary">{categoryEvents.length}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs font-black leading-snug text-foreground">{category}</p>
                  </button>
                ))}
              </div>
            </Panel>
          </div>
        </div>

        <aside className="space-y-3">
          <Panel
            icon={ListTodo}
            title="Pendências sem data"
            count={undated.length}
            action={
              <Button variant="ghost" size="sm" className="h-8 rounded-xl text-xs font-bold" onClick={() => onView('undated')}>
                Ver
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            }
          >
            <div className="space-y-2">
              {undated.map((event) => (
                <EventListRow key={event.id} event={event} onSelect={onSelect} />
              ))}
            </div>
          </Panel>

          <Panel
            icon={UsersRound}
            title="Reuniões da Central"
            count={central.length}
            action={
              <Button variant="ghost" size="sm" className="h-8 rounded-xl text-xs font-bold" onClick={() => onView('central')}>
                Agenda
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            }
          >
            <div className="space-y-2">
              {central.map((event) => (
                <MeetingMiniCard key={event.id} event={event} onSelect={onSelect} />
              ))}
            </div>
          </Panel>
        </aside>
      </div>

    </div>
  );
}

export function CompactTimeline({ events, onSelect }: BoardProps) {
  const byYear = groupByYear(events);

  return (
    <div className="grid gap-3 xl:grid-cols-3">
      {years.map((year) => {
        const yearEvents = byYear[year] ?? [];
        const dated = yearEvents.filter((event) => event.hasExactDate);
        const undated = yearEvents.filter((event) => !event.hasExactDate);
        const monthGroups = Object.entries(groupByMonth(dated)).sort(([a], [b]) => a.localeCompare(b));

        return (
          <section key={year} className="liquid-glass-card rounded-2xl p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-800 dark:text-gold">Linha do tempo</p>
                <h2 className="text-2xl font-black text-foreground">{year}</h2>
              </div>
              <span className="rounded-full bg-white/70 px-2 py-1 text-[11px] font-black text-muted-foreground">{yearEvents.length}</span>
            </div>

            <div className="space-y-2">
              {monthGroups.map(([monthKey, monthEvents], index) => (
                <MonthAccordion
                  key={monthKey}
                  monthKey={monthKey}
                  events={monthEvents}
                  onSelect={onSelect}
                  defaultOpen={index === 0 || monthKey === '2028-05'}
                  compactLimit={5}
                />
              ))}
              {undated.length > 0 && (
                <MonthAccordion
                  monthKey={`${year}-sem-data`}
                  events={undated}
                  onSelect={onSelect}
                  defaultOpen={false}
                  compactLimit={5}
                />
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function YearCompactBoard({ events, onSelect }: BoardProps) {
  const byYear = groupByYear(events);

  return (
    <div className="grid gap-3 xl:grid-cols-3">
      {years.map((year) => {
        const yearEvents = byYear[year] ?? [];
        const central = yearEvents.filter(isCentralMeeting).length;
        const undated = yearEvents.filter((event) => !event.hasExactDate).length;
        const monthGroups = Object.entries(groupByMonth(yearEvents)).sort(([a], [b]) => a.localeCompare(b));

        return (
          <section key={year} className="liquid-glass-card rounded-2xl p-3">
            <div className={cn('mb-3 rounded-2xl border p-3', year === 2028 ? 'border-gold/45 bg-gold/10' : 'border-border/50 bg-white/60')}>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-800 dark:text-gold">{yearNarratives[year].title}</p>
              <div className="mt-1 flex items-end justify-between gap-3">
                <h2 className="text-3xl font-black text-foreground">{year}</h2>
                <span className="rounded-full bg-white/75 px-2 py-1 text-xs font-black text-primary">{yearEvents.length} registros</span>
              </div>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-muted-foreground">{yearNarratives[year].text}</p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-black text-muted-foreground">
                <span className="rounded-full bg-white/75 px-2 py-1">{central} reuniões</span>
                <span className="rounded-full bg-white/75 px-2 py-1">{undated} sem data</span>
              </div>
            </div>

            <div className="space-y-2">
              {monthGroups.map(([monthKey, monthEvents], index) => (
                <MonthAccordion
                  key={monthKey}
                  monthKey={monthKey}
                  events={monthEvents}
                  onSelect={onSelect}
                  defaultOpen={index === 0 || monthKey === '2028-05'}
                  compactLimit={4}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function CategoryCompactBoard({ events, onSelect }: BoardProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const groups = useMemo(() => groupByCategory(events), [events]);

  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {groups.map(([category, categoryEvents]) => {
        const open = expanded[category];
        const visible = open ? categoryEvents : categoryEvents.slice(0, 3);
        const undated = categoryEvents.filter((event) => !event.hasExactDate).length;

        return (
          <section key={category} className="liquid-glass-card rounded-2xl p-3">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1.5">
                <CategoryBadge category={category} />
                <h2 className="line-clamp-2 text-base font-black leading-tight text-foreground">{category}</h2>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-2xl font-black text-primary">{categoryEvents.length}</p>
                {undated > 0 && <p className="text-[10px] font-black text-amber-800">{undated} sem data</p>}
              </div>
            </div>

            <div className="space-y-2">
              {visible.map((event) => (
                <CategoryEventLine key={event.id} event={event} onSelect={onSelect} />
              ))}
            </div>

            {categoryEvents.length > 3 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 h-8 w-full rounded-xl text-xs font-bold"
                onClick={() => setExpanded((current) => ({ ...current, [category]: !open }))}
              >
                {open ? 'Compactar categoria' : `Ver todos (${categoryEvents.length})`}
              </Button>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function CentralMeetingsBoard({ events, onSelect }: BoardProps) {
  const central = events.filter(isCentralMeeting);
  const byYear = groupByYear(central);

  return (
    <div className="space-y-3">
      <section className="liquid-glass-card rounded-2xl p-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-800 dark:text-gold">Agenda institucional</p>
            <h2 className="mt-1 text-xl font-black text-foreground">Reuniões da Comissão Central</h2>
          </div>
          <div className="grid gap-2 text-xs font-bold text-muted-foreground sm:grid-cols-3 lg:min-w-[560px]">
            <span className="rounded-xl border border-border/50 bg-white/70 px-3 py-2">Local: Sala dos Voluntários</span>
            <span className="rounded-xl border border-border/50 bg-white/70 px-3 py-2">Horário: 18h30</span>
            <span className="rounded-xl border border-border/50 bg-white/70 px-3 py-2">{central.length} reuniões oficiais</span>
          </div>
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-3">
        {years.map((year) => (
          <section key={year} className={cn('liquid-glass-card rounded-2xl p-3', year === 2028 && 'border-gold/45')}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Ano</p>
                <h2 className="text-2xl font-black text-foreground">{year}</h2>
              </div>
              <span className="rounded-full bg-white/70 px-2 py-1 text-[11px] font-black text-muted-foreground">
                {(byYear[year] ?? []).length} reuniões
              </span>
            </div>
            <div className="space-y-2">
              {(byYear[year] ?? []).map((event) => (
                <MeetingMiniCard key={event.id} event={event} onSelect={onSelect} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function UndatedDecisionBoard({ events, onSelect, onEdit }: UndatedDecisionBoardProps) {
  const undated = events.filter((event) => !event.hasExactDate);
  const groups = useMemo(() => groupByCategory(undated), [undated]);

  if (undated.length === 0) {
    return <EmptyCronogramaState title="Nenhuma pendência sem data" text="Os filtros atuais não retornaram eventos aguardando definição de data." />;
  }

  return (
    <div className="space-y-3">
      <section className="liquid-glass-card rounded-2xl border-amber-300/45 bg-amber-50/60 p-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-300/65 bg-amber-100 text-amber-900">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-800">Central de decisão</p>
              <h2 className="mt-1 text-xl font-black text-foreground">Pendências sem data</h2>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                Atividades oficiais preservadas das planilhas e aguardando data, responsável ou comissão final.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-white/80 px-3 py-1 text-sm font-black text-amber-900">{undated.length} pendências</span>
        </div>
      </section>

      <section className="liquid-glass-card rounded-2xl p-3">
        <div className="mb-3 flex flex-wrap gap-2">
          {groups.slice(0, 8).map(([category, categoryEvents]) => (
            <span key={category} className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-white/75 px-2.5 py-1 text-[11px] font-black text-muted-foreground">
              <span className="text-amber-900">{categoryEvents.length}</span>
              {category}
            </span>
          ))}
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {undated.map((event) => (
            <UndatedDecisionCard key={event.id} event={event} onSelect={onSelect} onEdit={onEdit} />
          ))}
        </div>
      </section>
    </div>
  );
}

export function SearchAwareEmpty({ events }: { events: CronogramaEvent[] }) {
  const undated = events.filter((event) => !event.hasExactDate).length;
  const central = events.filter(isCentralMeeting).length;

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-2xl border border-border/50 bg-white/70 p-3">
        <Flag className="h-5 w-5 text-gold" />
        <p className="mt-2 text-sm font-black">Fenasoja 2028</p>
        <p className="text-xs font-semibold text-muted-foreground">Evento principal preservado no seed oficial.</p>
      </div>
      <div className="rounded-2xl border border-border/50 bg-white/70 p-3">
        <UsersRound className="h-5 w-5 text-primary" />
        <p className="mt-2 text-sm font-black">{central} reuniões</p>
        <p className="text-xs font-semibold text-muted-foreground">Reuniões centrais continuam estruturadas.</p>
      </div>
      <div className="rounded-2xl border border-amber-300/55 bg-amber-50 p-3">
        <ListTodo className="h-5 w-5 text-amber-800" />
        <p className="mt-2 text-sm font-black">{undated} sem data</p>
        <p className="text-xs font-semibold text-muted-foreground">Pendências oficiais continuam disponíveis.</p>
      </div>
    </div>
  );
}
