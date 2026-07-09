import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, WheelEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CronogramaCategoryMarker,
  CronogramaMetaBadge,
  CronogramaPriorityIndicator,
  CronogramaStatusIndicator,
} from './CronogramaBadges';
import { CRONOGRAMA_YEARS } from './cronogramaData';
import {
  dateKey,
  formatLongDate,
  formatShortDateRange,
  getDateParts,
  getDaysInMonth,
  getMonthLabel,
  getMonthStartOffset,
  parseDate,
} from './dateUtils';
import type { CronogramaEvent } from './types';

const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function dateFromKey(key: string): Date {
  return parseDate(key);
}

function keyFromDate(date: Date): string {
  return dateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

function getEventRange(event: CronogramaEvent): { start: Date; end: Date } | null {
  if (!event.date) return null;
  const start = dateFromKey(event.date);
  const rawEnd = event.endDate ? dateFromKey(event.endDate) : start;
  return {
    start,
    end: rawEnd < start ? start : rawEnd,
  };
}

function getEventDateKeys(event: CronogramaEvent): string[] {
  const range = getEventRange(event);
  if (!range) return [];

  const keys: string[] = [];
  const cursor = new Date(range.start);
  let guard = 0;

  while (cursor <= range.end && guard < 45) {
    keys.push(keyFromDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }

  return keys;
}

function eventIntersectsMonth(event: CronogramaEvent, year: number, month: number): boolean {
  const range = getEventRange(event);
  if (!range) return false;
  const monthStart = dateFromKey(dateKey(year, month, 1));
  const monthEnd = dateFromKey(dateKey(year, month, getDaysInMonth(year, month)));
  return range.start <= monthEnd && range.end >= monthStart;
}

export function CalendarMonthView({
  events,
  preferredYear,
  onOpen,
  onEdit,
}: {
  events: CronogramaEvent[];
  preferredYear?: number;
  onOpen: (event: CronogramaEvent) => void;
  onEdit?: (event: CronogramaEvent) => void;
}) {
  const initialYear = preferredYear || 2028;
  const initialEvent = useMemo(
    () => events.find((event) => event.year === initialYear && event.isMain && event.date)
      || events.find((event) => event.year === initialYear && event.date)
      || events.find((event) => event.date),
    [events, initialYear],
  );
  const initialParts = initialEvent ? getDateParts(initialEvent.date) : null;
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialParts?.month ?? 4);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (initialEvent?.date) return initialEvent.date;
    return dateKey(initialYear, 4, 1);
  });
  const [expanded, setExpanded] = useState(false);
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [yearPulse, setYearPulse] = useState(false);
  const wheelLock = useRef(false);

  useEffect(() => {
    if (!preferredYear || preferredYear === year) return;
    const nextDate = dateKey(preferredYear, month, Math.min(Number(selectedDate.slice(-2)) || 1, getDaysInMonth(preferredYear, month)));
    setYear(preferredYear);
    setSelectedDate(nextDate);
    setYearPulse(true);
    window.setTimeout(() => setYearPulse(false), 260);
  }, [preferredYear, year, month, selectedDate]);

  useEffect(() => {
    if (!expanded) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [expanded]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CronogramaEvent[]>();
    events.forEach((event) => {
      getEventDateKeys(event).forEach((key) => {
        const list = map.get(key) || [];
        list.push(event);
        map.set(key, list);
      });
    });
    map.forEach((list) => list.sort((a, b) => `${a.startTime || '99:99'}-${a.title}`.localeCompare(`${b.startTime || '99:99'}-${b.title}`)));
    return map;
  }, [events]);

  const monthEvents = useMemo(() => {
    return events
      .filter((event) => eventIntersectsMonth(event, year, month))
      .sort((a, b) => `${a.date}-${a.startTime || '99:99'}`.localeCompare(`${b.date}-${b.startTime || '99:99'}`));
  }, [events, year, month]);

  const dayEvents = eventsByDate.get(selectedDate) || [];
  const nextMonthEvent = monthEvents[0];

  const changeYear = (direction: -1 | 1) => {
    const currentIndex = CRONOGRAMA_YEARS.findIndex((item) => item === year);
    const fallbackIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = Math.min(Math.max(fallbackIndex + direction, 0), CRONOGRAMA_YEARS.length - 1);
    const nextYear = CRONOGRAMA_YEARS[nextIndex];
    if (nextYear === year) return;
    const selectedDay = Math.min(Number(selectedDate.slice(-2)) || 1, getDaysInMonth(nextYear, month));
    setYear(nextYear);
    setSelectedDate(dateKey(nextYear, month, selectedDay));
    setYearPulse(true);
    window.setTimeout(() => setYearPulse(false), 260);
  };

  const handleYearWheel = (event: WheelEvent<HTMLButtonElement>) => {
    if (wheelLock.current) return;
    const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (Math.abs(delta) < 8) return;
    event.preventDefault();
    wheelLock.current = true;
    changeYear(delta > 0 ? 1 : -1);
    window.setTimeout(() => {
      wheelLock.current = false;
    }, 220);
  };

  const changeMonth = (direction: -1 | 1) => {
    const nextMonth = month + direction;
    if (nextMonth < 0) {
      if (year > CRONOGRAMA_YEARS[0]) {
        setMonth(11);
        const nextYear = year - 1;
        setYear(nextYear);
        setSelectedDate(dateKey(nextYear, 11, 1));
      }
      return;
    }
    if (nextMonth > 11) {
      if (year < CRONOGRAMA_YEARS[CRONOGRAMA_YEARS.length - 1]) {
        setMonth(0);
        const nextYear = year + 1;
        setYear(nextYear);
        setSelectedDate(dateKey(nextYear, 0, 1));
      }
      return;
    }
    setMonth(nextMonth);
    setSelectedDate(dateKey(year, nextMonth, 1));
  };

  const renderWorkspace = (isExpanded: boolean) => (
    <CalendarWorkspace
      eventsByDate={eventsByDate}
      monthEvents={monthEvents}
      dayEvents={dayEvents}
      selectedDate={selectedDate}
      year={year}
      month={month}
      yearPulse={yearPulse}
      expanded={isExpanded}
      sideCollapsed={sideCollapsed}
      onSelectDate={setSelectedDate}
      onChangeMonth={changeMonth}
      onChangeYear={changeYear}
      onYearWheel={handleYearWheel}
      onOpen={onOpen}
      onEdit={onEdit}
      onExpand={() => setExpanded(true)}
      onExitExpand={() => setExpanded(false)}
      onToggleSide={() => setSideCollapsed((value) => !value)}
      nextMonthEvent={nextMonthEvent}
    />
  );

  return (
    <>
      {renderWorkspace(false)}
      {expanded && (
        <CalendarFullscreenMode onClose={() => setExpanded(false)}>
          {renderWorkspace(true)}
        </CalendarFullscreenMode>
      )}
    </>
  );
}

function CalendarWorkspace({
  eventsByDate,
  monthEvents,
  dayEvents,
  selectedDate,
  year,
  month,
  yearPulse,
  expanded,
  sideCollapsed,
  onSelectDate,
  onChangeMonth,
  onChangeYear,
  onYearWheel,
  onOpen,
  onEdit,
  onExpand,
  onExitExpand,
  onToggleSide,
  nextMonthEvent,
}: {
  eventsByDate: Map<string, CronogramaEvent[]>;
  monthEvents: CronogramaEvent[];
  dayEvents: CronogramaEvent[];
  selectedDate: string;
  year: number;
  month: number;
  yearPulse: boolean;
  expanded: boolean;
  sideCollapsed: boolean;
  onSelectDate: (date: string) => void;
  onChangeMonth: (direction: -1 | 1) => void;
  onChangeYear: (direction: -1 | 1) => void;
  onYearWheel: (event: WheelEvent<HTMLButtonElement>) => void;
  onOpen: (event: CronogramaEvent) => void;
  onEdit?: (event: CronogramaEvent) => void;
  onExpand: () => void;
  onExitExpand: () => void;
  onToggleSide: () => void;
  nextMonthEvent?: CronogramaEvent;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const startOffset = getMonthStartOffset(year, month);
  const cells = [
    ...Array.from({ length: startOffset }, (_, index) => ({ type: 'empty' as const, key: `empty-${index}` })),
    ...Array.from({ length: daysInMonth }, (_, index) => ({ type: 'day' as const, day: index + 1, key: `day-${index + 1}` })),
  ];
  const currentYearIndex = CRONOGRAMA_YEARS.findIndex((item) => item === year);

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[1.75rem] border border-white/60 bg-[linear-gradient(145deg,rgb(255_255_255/0.84),rgb(244_249_241/0.78)_58%,hsl(var(--gold)/0.10))] shadow-[0_24px_80px_-50px_rgb(21_62_39/0.62),inset_0_1px_0_rgb(255_255_255/0.72)]',
        expanded ? 'min-h-[calc(100vh-3.5rem)] p-4 sm:p-5' : 'p-4 sm:p-5',
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(hsl(var(--primary)/0.045)_1px,transparent_1px),linear-gradient(90deg,hsl(var(--primary)/0.035)_1px,transparent_1px)] bg-[size:42px_42px]" />
      <div className="relative space-y-4">
        <CalendarToolbar
          year={year}
          month={month}
          yearPulse={yearPulse}
          currentYearIndex={currentYearIndex}
          expanded={expanded}
          sideCollapsed={sideCollapsed}
          onChangeMonth={onChangeMonth}
          onChangeYear={onChangeYear}
          onYearWheel={onYearWheel}
          onExpand={onExpand}
          onExitExpand={onExitExpand}
          onToggleSide={onToggleSide}
        />

        <div
          className={cn(
            'grid gap-4',
            expanded
              ? sideCollapsed
                ? 'xl:grid-cols-1'
                : 'xl:grid-cols-[minmax(0,1fr)_360px]'
              : 'xl:grid-cols-[minmax(0,1.45fr)_360px]',
          )}
        >
          <div className="rounded-[1.35rem] border border-white/55 bg-white/58 p-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.64)] backdrop-blur-xl">
            <div className="grid grid-cols-7 gap-1.5 pb-2">
              {weekDays.map((day) => (
                <div key={day} className="px-2 py-1 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {day}
                </div>
              ))}
            </div>
            <div key={`${year}-${month}`} className="cronograma-calendar-month-enter grid grid-cols-7 gap-1.5">
              {cells.map((cell) => {
                if (cell.type === 'empty') {
                  return <div key={cell.key} className={cn('rounded-2xl', expanded ? 'min-h-[96px]' : 'min-h-[74px]')} />;
                }
                const key = dateKey(year, month, cell.day);
                const events = eventsByDate.get(key) || [];
                const selected = key === selectedDate;
                const hasMain = events.some((event) => event.isMain);
                const hasMeeting = events.some((event) => event.isCentralMeeting);
                return (
                  <div
                    key={cell.key}
                    className={cn(
                      'group relative flex flex-col overflow-hidden rounded-xl border text-left transition-[border-color,background-color,box-shadow] duration-200',
                      expanded ? 'min-h-[108px]' : 'min-h-[82px]',
                      selected
                        ? 'border-primary/38 bg-primary/[0.075] shadow-[0_14px_30px_-24px_hsl(var(--primary)/0.75),inset_0_1px_0_rgb(255_255_255/0.72)]'
                        : events.length
                          ? 'border-gold/24 bg-white/75 hover:border-gold/45 hover:bg-white'
                          : 'border-border/22 bg-white/36 hover:bg-white/62',
                    )}
                    role="group"
                    aria-label={`${cell.day} de ${getMonthLabel(month)} de ${year}, ${events.length} eventos`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectDate(key)}
                      className="flex w-full items-center justify-between gap-1 rounded-lg p-2 text-left focus-ring"
                      aria-label={`Selecionar ${cell.day} de ${getMonthLabel(month)} de ${year}`}
                    >
                      <span className={cn('font-mono text-sm font-black', selected ? 'text-primary' : 'text-foreground/78')}>{cell.day}</span>
                      <span className="flex items-center gap-1">
                        {hasMeeting && <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Reunião central" />}
                        {hasMain && <span className="h-1.5 w-1.5 rounded-full bg-gold" title="Marco principal" />}
                        {events.length > 0 && <span className="text-[10px] font-bold text-muted-foreground">{events.length}</span>}
                      </span>
                    </button>
                    <CalendarEventLayer events={events} expanded={expanded} onOpen={onOpen} />
                  </div>
                );
              })}
            </div>
          </div>

          {(!expanded || !sideCollapsed) && (
            <CalendarSidePanel
              monthEvents={monthEvents}
              dayEvents={dayEvents}
              selectedDate={selectedDate}
              nextMonthEvent={nextMonthEvent}
              onOpen={onOpen}
              onEdit={onEdit}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function CalendarToolbar({
  year,
  month,
  yearPulse,
  currentYearIndex,
  expanded,
  sideCollapsed,
  onChangeMonth,
  onChangeYear,
  onYearWheel,
  onExpand,
  onExitExpand,
  onToggleSide,
}: {
  year: number;
  month: number;
  yearPulse: boolean;
  currentYearIndex: number;
  expanded: boolean;
  sideCollapsed: boolean;
  onChangeMonth: (direction: -1 | 1) => void;
  onChangeYear: (direction: -1 | 1) => void;
  onYearWheel: (event: WheelEvent<HTMLButtonElement>) => void;
  onExpand: () => void;
  onExitExpand: () => void;
  onToggleSide: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <Button type="button" variant="outline" size="icon" onClick={() => onChangeMonth(-1)} className="h-10 w-10 rounded-full border-white/60 bg-white/58">
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only">Mês anterior</span>
        </Button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">{getMonthLabel(month)}</h2>
            <CalendarYearWheel
              year={year}
              pulse={yearPulse}
              canPrev={currentYearIndex > 0}
              canNext={currentYearIndex < CRONOGRAMA_YEARS.length - 1}
              onWheel={onYearWheel}
              onPrev={() => onChangeYear(-1)}
              onNext={() => onChangeYear(1)}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Passe o mouse no ano e role para alternar 2026, 2027 e 2028.</p>
        </div>
        <Button type="button" variant="outline" size="icon" onClick={() => onChangeMonth(1)} className="h-10 w-10 rounded-full border-white/60 bg-white/58">
          <ChevronRight className="h-4 w-4" />
          <span className="sr-only">Próximo mês</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <CronogramaMetaBadge icon={CalendarDays} tone="green">
          Modo planejamento
        </CronogramaMetaBadge>
        {expanded && (
          <Button type="button" variant="outline" size="sm" onClick={onToggleSide} className="h-9 rounded-full border-white/60 bg-white/60 px-3 text-xs">
            {sideCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
            {sideCollapsed ? 'Mostrar painel' : 'Recolher painel'}
          </Button>
        )}
        <Button
          type="button"
          variant={expanded ? 'default' : 'outline'}
          size="sm"
          onClick={expanded ? onExitExpand : onExpand}
          className={cn('h-9 rounded-full px-3 text-xs', !expanded && 'border-gold/28 bg-white/60 text-amber-950 hover:bg-gold/10')}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          {expanded ? 'Sair do expandido' : 'Expandir calendário'}
        </Button>
      </div>
    </div>
  );
}

function CalendarYearWheel({
  year,
  pulse,
  canPrev,
  canNext,
  onWheel,
  onPrev,
  onNext,
}: {
  year: number;
  pulse: boolean;
  canPrev: boolean;
  canNext: boolean;
  onWheel: (event: WheelEvent<HTMLButtonElement>) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gold/25 bg-white/62 p-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.64)]">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev}
        className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/55 transition hover:bg-primary/[0.08] hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"
        aria-label="Ano anterior"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onWheel={onWheel}
        className={cn(
          'h-7 min-w-[76px] rounded-full px-3 font-mono text-sm font-black text-primary transition-[transform,background-color,color,box-shadow] duration-200 hover:bg-gold/[0.12] hover:text-amber-950 focus-ring',
          pulse && 'scale-105 bg-gold/[0.15] text-amber-950 shadow-[0_0_0_5px_hsl(var(--gold)/0.08)]',
        )}
        aria-label={`Ano selecionado ${year}. Role para trocar o ano.`}
      >
        {year}
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        className="flex h-7 w-7 items-center justify-center rounded-full text-foreground/55 transition hover:bg-primary/[0.08] hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"
        aria-label="Próximo ano"
      >
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

function CalendarEventLayer({
  events,
  expanded,
  onOpen,
}: {
  events: CronogramaEvent[];
  expanded: boolean;
  onOpen: (event: CronogramaEvent) => void;
}) {
  if (events.length === 0) {
    return <span className="mt-auto h-1 rounded-full bg-transparent" />;
  }

  return (
    <span className="mt-2 flex flex-1 flex-col gap-1">
      {events.slice(0, expanded ? 3 : 2).map((event) => (
        <button
          type="button"
          key={event.id}
          onClick={() => onOpen(event)}
          className={cn(
            'block w-full truncate rounded-md border px-1.5 py-1 text-left text-[10px] font-semibold leading-none shadow-[inset_0_1px_0_rgb(255_255_255/0.55)] focus-ring',
            event.priority === 'critical'
              ? 'border-red-900/12 bg-red-50/85 text-red-950'
              : event.isCentralMeeting
                ? 'border-primary/12 bg-primary/[0.07] text-primary'
                : event.isMain
                  ? 'border-gold/24 bg-gold/[0.12] text-amber-950'
                  : 'border-border/28 bg-white/72 text-foreground/75',
          )}
        >
          {event.startTime && <span className="mr-1 font-mono">{event.startTime}</span>}
          {event.title}
        </button>
      ))}
      {events.length > (expanded ? 3 : 2) && (
        <span className="text-[10px] font-bold text-muted-foreground">+{events.length - (expanded ? 3 : 2)} eventos</span>
      )}
    </span>
  );
}

function CalendarSidePanel({
  monthEvents,
  dayEvents,
  selectedDate,
  nextMonthEvent,
  onOpen,
  onEdit,
}: {
  monthEvents: CronogramaEvent[];
  dayEvents: CronogramaEvent[];
  selectedDate: string;
  nextMonthEvent?: CronogramaEvent;
  onOpen: (event: CronogramaEvent) => void;
  onEdit?: (event: CronogramaEvent) => void;
}) {
  return (
    <aside className="space-y-3">
      <section className="rounded-[1.35rem] border border-white/55 bg-white/66 p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.64)] backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Mês selecionado</p>
            <h3 className="text-lg font-black tracking-tight text-foreground">{monthEvents.length} eventos</h3>
          </div>
          <CalendarDays className="h-5 w-5 text-gold" />
        </div>
        {nextMonthEvent ? (
          <button
            type="button"
            onClick={() => onOpen(nextMonthEvent)}
            className="w-full rounded-2xl border border-border/35 bg-white/58 p-3 text-left transition hover:border-gold/32 hover:bg-white focus-ring"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Próximo do mês</p>
            <p className="mt-1 text-sm font-bold leading-tight text-foreground">{nextMonthEvent.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatShortDateRange(nextMonthEvent.date, nextMonthEvent.endDate)} · {nextMonthEvent.startTime || 'horário a definir'}</p>
          </button>
        ) : (
          <EmptyCalendarState title="Sem eventos neste mês" text="Use a navegação por ano para localizar os marcos oficiais." />
        )}
      </section>

      <section className="rounded-[1.35rem] border border-white/55 bg-white/66 p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.64)] backdrop-blur-xl">
        <div className="mb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Dia selecionado</p>
          <h3 className="text-lg font-black tracking-tight text-foreground">{formatLongDate(selectedDate)}</h3>
        </div>

        {dayEvents.length === 0 ? (
          <EmptyCalendarState title="Nenhum evento neste dia" text="O dia fica livre no recorte filtrado atual." />
        ) : (
          <div className="space-y-2">
            {dayEvents.map((event) => (
              <div key={event.id} className="rounded-2xl border border-border/35 bg-white/58 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <CronogramaCategoryMarker category={event.category} />
                  <CronogramaStatusIndicator status={event.status} compact />
                </div>
                <button type="button" onClick={() => onOpen(event)} className="block w-full text-left text-sm font-bold leading-tight text-foreground hover:text-primary">
                  {event.title}
                </button>
                <p className="mt-1 text-xs text-muted-foreground">{event.startTime || 'horário a definir'} · {event.location || event.owner || 'local a definir'}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <CronogramaPriorityIndicator priority={event.priority} compact />
                  <div className="flex gap-1">
                    {onEdit && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(event)} className="h-7 rounded-full px-2 text-[11px]">
                        Editar
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="sm" onClick={() => onOpen(event)} className="h-7 rounded-full px-2 text-[11px] text-primary">
                      Abrir
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}

function EmptyCalendarState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/55 bg-white/38 p-4 text-center">
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function CalendarFullscreenMode({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="cronograma-calendar-expanded fixed inset-0 z-50 bg-emerald-950/35 p-2 backdrop-blur-xl sm:p-4" role="dialog" aria-modal="true" aria-label="Calendário expandido">
      <div className="h-full overflow-auto rounded-[2rem]">
        {children}
      </div>
    </div>
  );
}
