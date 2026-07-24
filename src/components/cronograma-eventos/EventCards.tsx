import {
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  Clock3,
  Edit3,
  MapPin,
  MoreHorizontal,
  Route,
  UsersRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CronogramaCategoryMarker,
  CronogramaPriorityIndicator,
  CronogramaStatusIndicator,
  EventMetaLine,
} from './CronogramaBadges';
import { categoryLabels } from './cronogramaData';
import { daysUntil, formatLongDateRange, formatShortDate, formatShortDateRange } from './dateUtils';
import type { CronogramaCategory, CronogramaEvent } from './types';

export function CronogramaEventCard({
  event,
  index = 0,
  compact = false,
  onOpen,
  onEdit,
}: {
  event: CronogramaEvent;
  index?: number;
  compact?: boolean;
  onOpen: (event: CronogramaEvent) => void;
  onEdit?: (event: CronogramaEvent) => void;
}) {
  const dateLabel = event.date ? formatShortDate(event.date) : 'Sem data';
  return (
    <article
      className={cn(
        'cronograma-event-row group',
        compact && 'is-compact',
        event.isMain && 'is-main',
        event.priority === 'critical' && 'is-critical',
      )}
      style={{ animationDelay: `${index * 35}ms` }}
    >
      <div className="cronograma-event-date" aria-label={dateLabel}>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {event.date ? event.year : 'Pendente'}
        </span>
        <span className="mt-1 text-sm font-black leading-tight text-foreground">{dateLabel}</span>
        {event.startTime && <span className="mt-1 font-mono text-[10px] font-semibold text-primary">{event.startTime}</span>}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <CronogramaCategoryMarker category={event.category} />
          {event.isOfficial && <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-gold">Oficial</span>}
          {event.isMain && <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-primary">Marco 2028</span>}
        </div>
        <button type="button" onClick={() => onOpen(event)} className="mt-1.5 block w-full text-left focus-ring">
          <h3 className={cn('text-balance font-bold leading-tight tracking-tight text-foreground group-hover:text-primary', compact ? 'text-sm' : 'text-base')}>
            {event.title}
          </h3>
        </button>
        {!compact && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{event.summary}</p>}
        <EventMetaLine event={event} dense className="mt-2" />
      </div>

      <div className="cronograma-event-actions">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <CronogramaStatusIndicator status={event.status} compact />
          {(event.priority === 'critical' || event.priority === 'high') && (
            <CronogramaPriorityIndicator priority={event.priority} compact />
          )}
        </div>
        <div className="mt-2 flex items-center justify-end gap-1">
          {onEdit && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onEdit(event)}
              className="h-8 rounded-lg px-2 text-xs text-foreground/62 hover:text-primary"
            >
              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden 2xl:inline">Editar</span>
            </Button>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onOpen(event)}
            className="h-8 w-8 rounded-lg text-primary hover:bg-primary/[0.08]"
            aria-label={`Abrir detalhes de ${event.title}`}
          >
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </article>
  );
}

export function CompactEventRow({
  event,
  onOpen,
}: {
  event: CronogramaEvent;
  onOpen: (event: CronogramaEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      className="cronograma-compact-row group focus-ring"
    >
      <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/[0.07] text-[11px] font-bold text-primary">
        {event.startTime || formatShortDate(event.date).slice(0, 2)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold leading-tight text-foreground">{event.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <CronogramaCategoryMarker category={event.category} label={false} />
          {formatShortDateRange(event.date, event.endDate)}
          {event.location && <span className="truncate">{event.location}</span>}
        </span>
      </span>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  );
}

export function MeetingAgendaCard({
  event,
  index,
  onOpen,
}: {
  event: CronogramaEvent;
  index: number;
  onOpen: (event: CronogramaEvent) => void;
}) {
  const remaining = daysUntil(event.date);
  return (
    <article
      className="cronograma-meeting-row group"
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <div className="absolute inset-y-5 left-0 w-1 rounded-r-full bg-gradient-to-b from-primary via-primary/65 to-gold" />
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/10 bg-primary/[0.07] text-primary">
          <UsersRound className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{event.year}</span>
            {event.isMain && <span className="rounded-full bg-gold/[0.12] px-2 py-1 text-[10px] font-bold text-amber-950">Reta final</span>}
          </div>
          <h3 className="font-bold leading-tight tracking-tight text-foreground">{event.title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{event.summary}</p>
          <div className="grid gap-2 text-xs text-foreground/70 sm:grid-cols-2">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5 text-gold" />
              {formatLongDateRange(event.date, event.endDate)} às {event.startTime}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              {event.location || 'Local a definir'}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-[11px] font-semibold text-muted-foreground">
              {remaining == null ? 'Data pendente' : remaining < 0 ? 'Reunião já realizada' : `${remaining} dias restantes`}
            </span>
            <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full px-2.5 text-xs" onClick={() => onOpen(event)}>
              Abrir pauta
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function UndatedDecisionCard({
  event,
  onOpen,
  onEdit,
}: {
  event: CronogramaEvent;
  onOpen: (event: CronogramaEvent) => void;
  onEdit?: (event: CronogramaEvent) => void;
}) {
  return (
    <article className="cronograma-undated-row group">
      <div className="absolute inset-y-4 left-0 w-1.5 rounded-r-full bg-amber-700/75" />
      <div className="space-y-3 pl-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CronogramaCategoryMarker category={event.category} />
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-900/75">Decisão pendente</span>
            </div>
            <h3 className="text-base font-bold leading-tight tracking-tight text-foreground">{event.title}</h3>
          </div>
          <CronogramaPriorityIndicator priority={event.priority} compact />
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{event.summary}</p>
        <div className="cronograma-decision-context">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-950/65">Motivo</p>
          <p className="mt-1 text-sm text-foreground/76">{event.pendingReason || 'Aguardando definição executiva.'}</p>
          {event.decisionNeeded && <p className="mt-2 text-xs font-medium text-primary">{event.decisionNeeded}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Route className="h-3.5 w-3.5" />
            {event.owner || event.commission || 'Responsável a definir'}
          </span>
          <div className="flex gap-1.5">
            <Button type="button" size="sm" variant="ghost" className="h-8 rounded-full px-2.5 text-xs" onClick={() => onOpen(event)}>
              Detalhes
            </Button>
            {onEdit && (
              <Button type="button" size="sm" className="h-8 rounded-full px-3 text-xs" onClick={() => onEdit(event)}>
                Definir data
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function CategoryInsightCard({
  category,
  events,
  onOpen,
}: {
  category: CronogramaCategory;
  events: CronogramaEvent[];
  onOpen: (event: CronogramaEvent) => void;
}) {
  const critical = events.filter((event) => event.priority === 'critical').length;
  const undated = events.filter((event) => !event.date).length;
  const next = [...events].filter((event) => event.date).sort((a, b) => `${a.date}-${a.startTime}`.localeCompare(`${b.date}-${b.startTime}`))[0];

  return (
    <section className="cronograma-category-ledger">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <CronogramaCategoryMarker category={category} className="mb-2" />
          <h3 className="text-lg font-bold tracking-tight">{categoryLabels[category]}</h3>
        </div>
        <div className="rounded-2xl border border-border/35 bg-white/58 px-3 py-2 text-right">
          <p className="text-xl font-black leading-none text-primary">{events.length}</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">itens</p>
        </div>
      </div>
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-primary/5 px-2 py-2">
          <p className="text-sm font-bold text-primary">{events.filter((event) => event.date).length}</p>
          <p className="text-[10px] text-muted-foreground">com data</p>
        </div>
        <div className="rounded-xl bg-red-50/80 px-2 py-2">
          <p className="text-sm font-bold text-red-800">{critical}</p>
          <p className="text-[10px] text-muted-foreground">críticos</p>
        </div>
        <div className="rounded-xl bg-gold/[0.08] px-2 py-2">
          <p className="text-sm font-bold text-amber-950">{undated}</p>
          <p className="text-[10px] text-muted-foreground">pendentes</p>
        </div>
      </div>
      {next && (
        <div className="mb-3 rounded-xl border border-border/35 bg-white/55 p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Próximo marco</p>
          <button type="button" onClick={() => onOpen(next)} className="mt-1 block w-full text-left text-sm font-semibold text-foreground hover:text-primary">
            {next.title}
          </button>
          <p className="mt-1 text-xs text-muted-foreground">{formatShortDateRange(next.date, next.endDate)} · {next.startTime || 'horário a definir'}</p>
        </div>
      )}
      <div className="space-y-2">
        {events.slice(0, 4).map((event) => (
          <CompactEventRow key={event.id} event={event} onOpen={onOpen} />
        ))}
        {events.length > 4 && (
          <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <MoreHorizontal className="h-4 w-4" />
            {events.length - 4} itens adicionais
          </div>
        )}
      </div>
    </section>
  );
}

export function YearColumnHeader({
  year,
  events,
}: {
  year: number;
  events: CronogramaEvent[];
}) {
  const dated = events.filter((event) => event.date).length;
  const critical = events.filter((event) => event.priority === 'critical').length;
  return (
    <div
      className={cn(
        'sticky top-0 z-10 mb-3 rounded-2xl border bg-white/88 p-3 backdrop-blur-xl shadow-[0_10px_30px_-24px_rgb(21_62_39/0.42)]',
        year === 2028 ? 'border-gold/35' : 'border-border/45',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {year === 2028 ? 'Ano da feira' : 'Ciclo oficial'}
          </p>
          <h3 className="text-2xl font-black tracking-tight text-foreground">{year}</h3>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-primary">{dated} datados</p>
          <p className="text-[11px] text-muted-foreground">{critical} críticos</p>
        </div>
      </div>
    </div>
  );
}
