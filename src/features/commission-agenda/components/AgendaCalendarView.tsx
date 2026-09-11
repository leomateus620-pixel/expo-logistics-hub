import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgendaEventViewModel, AgendaMonthFilter } from '../types';
import { MONTH_LONG_LABELS, formatDayHeading, sortByChronology, toDateKey } from '../lib/agenda-presentation';
import { AgendaEventCompactCard } from './AgendaEventCard';
import { AgendaEmptyState } from './AgendaStates';
import { IconButton } from './primitives';

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export interface AgendaCalendarViewProps {
  events: AgendaEventViewModel[];
  year: number;
  /** When `'all'`, the calendar starts on the current month (or first event month). */
  month: AgendaMonthFilter;
  todayKey: string;
  onMonthChange?: (month: number) => void;
  onOpenEvent?: (event: AgendaEventViewModel) => void;
  className?: string;
}

export function AgendaCalendarView({ events, year, month, todayKey, onMonthChange, onOpenEvent, className }: AgendaCalendarViewProps) {
  const resolvedMonth = month === 'all'
    ? (Number(todayKey.slice(0, 4)) === year ? Number(todayKey.slice(5, 7)) : (events[0] ? Number(events[0].date.slice(5, 7)) : 1))
    : month;
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, AgendaEventViewModel[]>();
    for (const event of sortByChronology(events)) {
      const start = new Date(`${event.date}T12:00:00`);
      const end = new Date(`${event.endDate ?? event.date}T12:00:00`);
      for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const key = toDateKey(cursor);
        const list = map.get(key) ?? [];
        list.push(event);
        map.set(key, list);
      }
    }
    return map;
  }, [events]);

  const cells = useMemo(() => {
    const first = new Date(year, resolvedMonth - 1, 1);
    const startOffset = first.getDay();
    const start = new Date(year, resolvedMonth - 1, 1 - startOffset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return { key: toDateKey(date), day: date.getDate(), outside: date.getMonth() !== resolvedMonth - 1 };
    });
  }, [year, resolvedMonth]);

  const visibleCells = cells.slice(0, cells[35].outside && cells[35].day <= 7 ? 35 : 42);
  const activeDay = selectedDay && selectedDay.startsWith(`${year}-${String(resolvedMonth).padStart(2, '0')}`) ? selectedDay : null;
  const listEvents = activeDay
    ? eventsByDay.get(activeDay) ?? []
    : sortByChronology(events.filter((event) => event.date.startsWith(`${year}-${String(resolvedMonth).padStart(2, '0')}`)));

  const step = (delta: number) => {
    const next = resolvedMonth + delta;
    if (next < 1 || next > 12) return;
    setSelectedDay(null);
    onMonthChange?.(next);
  };

  return (
    <div className={cn('ws-card ua-calendar', className)}>
      <div className="ua-calendar__header">
        <IconButton icon={ChevronLeft} label="Mês anterior" onClick={() => step(-1)} disabled={resolvedMonth === 1} />
        <h3 className="ws-section-title" aria-live="polite">{MONTH_LONG_LABELS[resolvedMonth - 1]} <span className="ws-label" style={{ color: 'var(--ws-blue)' }}>{year}</span></h3>
        <IconButton icon={ChevronRight} label="Próximo mês" onClick={() => step(1)} disabled={resolvedMonth === 12} />
      </div>

      <div className="ua-calendar__grid" role="grid" aria-label={`Calendário de ${MONTH_LONG_LABELS[resolvedMonth - 1]} de ${year}`}>
        {WEEKDAYS.map((label, index) => <span key={`${label}-${index}`} className="ua-calendar__weekday ws-caption" role="columnheader">{label}</span>)}
        {visibleCells.map((cell) => {
          const dayEvents = eventsByDay.get(cell.key) ?? [];
          const statuses = Array.from(new Set(dayEvents.map((event) => event.status))).slice(0, 3);
          return (
            <button
              key={cell.key}
              type="button"
              role="gridcell"
              className="ua-calendar__day ws-focus"
              data-outside={cell.outside || undefined}
              data-today={cell.key === todayKey || undefined}
              aria-pressed={cell.key === activeDay}
              aria-label={`${formatDayHeading(cell.key)}${dayEvents.length ? `, ${dayEvents.length} eventos` : ''}`}
              disabled={cell.outside}
              onClick={() => setSelectedDay((current) => (current === cell.key ? null : cell.key))}
            >
              <span>{cell.day}</span>
              {statuses.length > 0 && (
                <span className="ua-calendar__dots" aria-hidden="true">
                  {statuses.map((status) => <span key={status} className="ua-calendar__dot" data-status={status} />)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid gap-1">
        <p className="ws-label px-1" style={{ color: 'var(--text-muted)' }}>
          {activeDay ? formatDayHeading(activeDay) : `Eventos de ${MONTH_LONG_LABELS[resolvedMonth - 1]}`}
        </p>
        {listEvents.length === 0 ? (
          <AgendaEmptyState compact title="Sem eventos neste período" detail="Escolha outro dia ou mês para ver os compromissos." />
        ) : (
          listEvents.map((event) => <AgendaEventCompactCard key={event.id} event={event} onOpen={onOpenEvent} />)
        )}
      </div>
    </div>
  );
}
