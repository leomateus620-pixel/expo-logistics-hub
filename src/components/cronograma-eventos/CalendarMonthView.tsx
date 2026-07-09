import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  formatEventRange,
  getMonthLabel,
  parseDateKey,
  type CronogramaEvent,
} from '@/lib/cronograma-eventos';
import { EventListRow } from './EventCards';

interface CalendarMonthViewProps {
  events: CronogramaEvent[];
  onSelect: (event: CronogramaEvent) => void;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function includesDay(event: CronogramaEvent, day: string) {
  if (!event.startDate) return false;
  const end = event.endDate ?? event.startDate;
  return event.startDate <= day && end >= day;
}

function eventTone(event: CronogramaEvent) {
  if (event.eventType === 'evento_principal') return 'bg-gold text-amber-950';
  if (event.eventType === 'reuniao') return 'bg-primary text-primary-foreground';
  if (!event.hasExactDate) return 'bg-amber-500 text-white';
  return 'bg-muted text-foreground';
}

export default function CalendarMonthView({ events, onSelect }: CalendarMonthViewProps) {
  const firstDated = events.find((event) => event.startDate)?.startDate ?? '2028-05-01';
  const initial = parseDateKey(firstDated) ?? new Date(Date.UTC(2028, 4, 1, 12));
  const [cursor, setCursor] = useState(() => new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth(), 1, 12)));
  const [selectedDay, setSelectedDay] = useState<string | null>(firstDated);

  const monthStart = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1, 12));
  const monthEnd = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0, 12));
  const startWeekday = monthStart.getUTCDay();
  const gridStart = new Date(monthStart);
  gridStart.setUTCDate(monthStart.getUTCDate() - startWeekday);

  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setUTCDate(gridStart.getUTCDate() + index);
    return day;
  });

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CronogramaEvent[]>();
    for (const day of days) {
      const key = dateKey(day);
      map.set(key, events.filter((event) => includesDay(event, key)));
    }
    return map;
  }, [days, events]);

  const selectedEvents = selectedDay ? eventsByDay.get(selectedDay) ?? [] : [];
  const monthPrefix = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
  const monthEvents = events.filter((event) => event.startDate?.startsWith(monthPrefix));

  const moveMonth = (delta: number) => {
    const next = new Date(cursor);
    next.setUTCMonth(cursor.getUTCMonth() + delta);
    setCursor(next);
    setSelectedDay(dateKey(next));
  };

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="liquid-glass-card rounded-2xl p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl bg-white/75" onClick={() => moveMonth(-1)} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-800 dark:text-gold">{cursor.getUTCFullYear()}</p>
            <h2 className="text-xl font-black text-foreground sm:text-2xl">{getMonthLabel(dateKey(monthStart))}</h2>
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl bg-white/75" onClick={() => moveMonth(1)} aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
          {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
            <div key={day} className="py-1.5">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const key = dateKey(day);
            const inMonth = day >= monthStart && day <= monthEnd;
            const dayEvents = eventsByDay.get(key) ?? [];
            const active = selectedDay === key;
            const hasMain = dayEvents.some((event) => event.eventType === 'evento_principal');
            const hasPeriod = dayEvents.some((event) => event.endDate && event.endDate !== event.startDate);

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDay(key)}
                className={cn(
                  'min-h-[88px] rounded-xl border p-2 text-left transition duration-200 focus-ring sm:min-h-[106px]',
                  inMonth ? 'border-border/50 bg-white/70 hover:border-primary/30 hover:bg-white/90' : 'border-transparent bg-white/25 opacity-45',
                  active && 'border-gold/55 bg-gold/15 shadow-[0_0_0_1px_hsl(var(--gold)/0.22)_inset]',
                  hasMain && 'border-gold/70 bg-gold/20',
                )}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className={cn('text-sm font-black tabular-nums text-foreground', active && 'text-amber-900')}>
                    {day.getUTCDate()}
                  </span>
                  {dayEvents.length > 0 && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-black text-primary">{dayEvents.length}</span>
                  )}
                </div>

                <div className="mt-2 space-y-1">
                  {dayEvents.slice(0, 2).map((event) => (
                    <span key={event.id} className={cn('block truncate rounded-md px-1.5 py-0.5 text-[9px] font-black', eventTone(event))}>
                      {event.title}
                    </span>
                  ))}
                  {dayEvents.length > 2 && <span className="block text-[9px] font-black text-muted-foreground">+{dayEvents.length - 2}</span>}
                  {hasPeriod && <span className="block h-1 rounded-full bg-gradient-to-r from-gold to-primary" />}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="space-y-3">
        <section className="liquid-glass-card rounded-2xl p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
              <CalendarDays className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Mês selecionado</p>
              <p className="text-lg font-black text-foreground">{monthEvents.length} eventos</p>
            </div>
          </div>
        </section>

        <section className="liquid-glass-card rounded-2xl p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-800 dark:text-gold">Dia selecionado</p>
          <h3 className="mt-1 text-base font-black text-foreground">
            {selectedDay ? formatEventRange({ startDate: selectedDay, endDate: null, hasExactDate: true }) : 'Selecione um dia'}
          </h3>
          <div className="mt-3 max-h-[620px] space-y-2 overflow-y-auto pr-1">
            {selectedEvents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 bg-white/60 p-5 text-center text-sm font-semibold text-muted-foreground">
                Nenhum evento neste dia.
              </div>
            ) : (
              selectedEvents.map((event) => <EventListRow key={event.id} event={event} onSelect={onSelect} />)
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
