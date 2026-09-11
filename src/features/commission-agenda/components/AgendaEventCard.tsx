import { ArrowRight, ChevronRight, Edit3, FileText, History, MoreHorizontal, Paperclip } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { AgendaEventViewModel } from '../types';
import { formatLongDate, getEventDuration } from '../lib/agenda-presentation';
import {
  EventDateBadge,
  EventLocation,
  EventPeople,
  EventStatusBadge,
  EventTimeRange,
  IconButton,
  NextEventFlag,
  UnitBadgeList,
} from './primitives';

export interface AgendaEventCardActions {
  onOpen?: (event: AgendaEventViewModel) => void;
  onEdit?: (event: AgendaEventViewModel) => void;
  onOpenDocuments?: (event: AgendaEventViewModel) => void;
  onOpenHistory?: (event: AgendaEventViewModel) => void;
}

export interface AgendaEventCardProps extends AgendaEventCardActions {
  event: AgendaEventViewModel;
  /** Unit that owns the workspace — its chip is highlighted and ordered first. */
  unitId?: string;
  todayKey?: string;
  /** Hides the date badge when the parent already renders a day heading. */
  hideDate?: boolean;
  index?: number;
  className?: string;
}

export function AgendaEventCard({ event, unitId, todayKey, hideDate = false, index = 0, onOpen, onEdit, onOpenDocuments, onOpenHistory, className }: AgendaEventCardProps) {
  const isToday = todayKey ? event.date === todayKey : false;
  const duration = getEventDuration(event);
  const people = event.people ?? [];
  const units = event.units ?? [];

  return (
    <article
      className={cn('ws-card ua-event-card ua-rise', className)}
      data-status={event.status}
      data-next={event.isNext || undefined}
      data-today={isToday || undefined}
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
      aria-labelledby={`ua-event-title-${event.id}`}
    >
      <button
        type="button"
        className="ua-event-card__hit"
        onClick={() => onOpen?.(event)}
        aria-label={`Abrir ${event.title}, ${formatLongDate(event.date)}${event.startTime ? ` às ${event.startTime}` : ''}`}
      />

      {!hideDate && <EventDateBadge date={event.date} endDate={event.endDate} emphasis={event.isNext ? 'gold' : 'default'} />}

      <div className="ua-event-card__body">
        <div className="ua-event-card__top">
          <EventTimeRange startTime={event.startTime} endTime={event.endTime} duration={duration} />
          <span className="flex items-center gap-2">
            {event.isNext && <NextEventFlag />}
            <EventStatusBadge status={event.status} />
          </span>
        </div>

        <h3 id={`ua-event-title-${event.id}`} className="ua-event-card__title ws-event-title ws-clamp-2">{event.title}</h3>

        <div className="ua-event-card__meta">
          <EventPeople people={people} />
          <EventLocation location={event.location} />
        </div>

        <div className="ua-event-card__footer">
          <div className="ua-event-card__footer-left">
            <UnitBadgeList units={units} selfId={unitId} max={2} />
            {typeof event.documentCount === 'number' && event.documentCount > 0 && (
              <span className="ua-event-card__docs ws-caption" title={`${event.documentCount} documentos`}>
                <Paperclip aria-hidden="true" />
                {event.documentCount}
              </span>
            )}
          </div>
          <div className="ua-event-card__actions">
            <button type="button" className="ua-event-card__open ws-focus" onClick={() => onOpen?.(event)}>
              Ver evento
              <ArrowRight aria-hidden="true" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton icon={MoreHorizontal} label={`Mais ações para ${event.title}`} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                <DropdownMenuItem onSelect={() => onOpen?.(event)}><ArrowRight className="mr-2 h-4 w-4" />Abrir</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onEdit?.(event)}><Edit3 className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onOpenDocuments?.(event)}><FileText className="mr-2 h-4 w-4" />Documentos</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onOpenHistory?.(event)}><History className="mr-2 h-4 w-4" />Histórico</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="ua-event-card__chevron" aria-hidden="true"><ChevronRight /></span>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ───────────────────────────── Cartão compacto ───────────────────────────── */

export interface AgendaEventCompactCardProps {
  event: AgendaEventViewModel;
  onOpen?: (event: AgendaEventViewModel) => void;
  className?: string;
}

/** One-line row for previews (Visão geral, calendário, painel lateral). */
export function AgendaEventCompactCard({ event, onOpen, className }: AgendaEventCompactCardProps) {
  return (
    <button type="button" className={cn('ua-compact-event ws-focus', className)} onClick={() => onOpen?.(event)}>
      <EventDateBadge date={event.date} />
      <span className="min-w-0">
        <span className="ua-compact-event__title ws-meta" style={{ fontWeight: 600 }}>{event.title}</span>
        <span className="ua-compact-event__meta ws-caption" style={{ fontWeight: 500 }}>
          <EventStatusBadge status={event.status} size="sm" />
          {event.startTime && <span className="ua-compact-event__time">{event.startTime}{event.endTime ? ` → ${event.endTime}` : ''}</span>}
          {event.location && <span className="ua-compact-event__location">{event.location}</span>}
        </span>
      </span>
      <ChevronRight className="ua-compact-event__chevron" aria-hidden="true" />
    </button>
  );
}
