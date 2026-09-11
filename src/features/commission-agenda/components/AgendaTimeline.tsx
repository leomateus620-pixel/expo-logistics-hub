import { cn } from '@/lib/utils';
import type { AgendaEventViewModel } from '../types';
import { formatDayHeading, groupEventsByMonth, type AgendaDayGroup, type AgendaMonthGroup } from '../lib/agenda-presentation';
import { AgendaEventCard, type AgendaEventCardActions } from './AgendaEventCard';

/* ─────────────────────────── Cabeçalho de dia ────────────────────────────── */

export interface AgendaDateHeaderProps {
  dateKey: string;
  todayKey?: string;
  count?: number;
  className?: string;
}

export function AgendaDateHeader({ dateKey, todayKey, count, className }: AgendaDateHeaderProps) {
  const isToday = dateKey === todayKey;
  return (
    <div className={cn('ua-day-heading', className)} data-today={isToday || undefined}>
      <span className="ws-label">{formatDayHeading(dateKey)}</span>
      {isToday && <span className="ua-day-heading__today">Hoje</span>}
      <span className="ua-day-heading__line" aria-hidden="true" />
      {typeof count === 'number' && count > 1 && <span className="ws-caption" style={{ color: 'var(--text-muted)' }}>{count} eventos</span>}
    </div>
  );
}

/* ─────────────────────────────── Grupo de dia ────────────────────────────── */

export interface AgendaDayGroupProps extends AgendaEventCardActions {
  group: AgendaDayGroup;
  unitId?: string;
  todayKey?: string;
  startIndex?: number;
}

export function AgendaDayGroupSection({ group, unitId, todayKey, startIndex = 0, ...actions }: AgendaDayGroupProps) {
  return (
    <section className="ua-day-group" aria-label={formatDayHeading(group.dateKey)}>
      <AgendaDateHeader dateKey={group.dateKey} todayKey={todayKey} count={group.events.length} />
      {group.events.map((event, index) => (
        <AgendaEventCard key={event.id} event={event} unitId={unitId} todayKey={todayKey} index={startIndex + index} {...actions} />
      ))}
    </section>
  );
}

/* ─────────────────────────────── Seção de mês ────────────────────────────── */

export interface AgendaTimelineSectionProps extends AgendaEventCardActions {
  month: AgendaMonthGroup;
  unitId?: string;
  todayKey?: string;
  startIndex?: number;
}

export function AgendaTimelineSection({ month, unitId, todayKey, startIndex = 0, ...actions }: AgendaTimelineSectionProps) {
  const [monthName, year] = month.label.split(' ');
  let offset = startIndex;
  return (
    <section className="ua-month-section" aria-labelledby={`ua-month-${month.monthKey}`} data-month={month.monthKey}>
      <header className="ua-month-section__header">
        <h2 id={`ua-month-${month.monthKey}`} className="ua-month-section__title">
          <span className="ws-section-title">{monthName}</span>
          <span className="ws-label">{year}</span>
        </h2>
        <span className="ua-month-section__count ws-meta-secondary">{month.total} {month.total === 1 ? 'evento' : 'eventos'}</span>
      </header>
      {month.days.map((day) => {
        const node = <AgendaDayGroupSection key={day.dateKey} group={day} unitId={unitId} todayKey={todayKey} startIndex={offset} {...actions} />;
        offset += day.events.length;
        return node;
      })}
    </section>
  );
}

/* ─────────────────────────────── Linha do tempo ──────────────────────────── */

export interface AgendaTimelineProps extends AgendaEventCardActions {
  events: AgendaEventViewModel[];
  unitId?: string;
  todayKey?: string;
  className?: string;
}

export function AgendaTimeline({ events, unitId, todayKey, className, ...actions }: AgendaTimelineProps) {
  const months = groupEventsByMonth(events);
  let offset = 0;
  return (
    <div className={cn('ua-timeline', className)} aria-label="Linha do tempo de eventos">
      {months.map((month) => {
        const node = <AgendaTimelineSection key={month.monthKey} month={month} unitId={unitId} todayKey={todayKey} startIndex={offset} {...actions} />;
        offset += month.total;
        return node;
      })}
    </div>
  );
}
