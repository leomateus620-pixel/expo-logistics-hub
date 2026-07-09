import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Pencil,
  Plus,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  formatEventRange,
  isCentralMeeting,
  isMainFenasojaEvent,
  type CronogramaEvent,
} from '@/lib/cronograma-eventos';
import { CategoryBadge, PriorityBadge, StatusBadge, TypeBadge } from './CronogramaBadges';
import EventPeriodBar from './EventPeriodBar';

interface EventCardBaseProps {
  event: CronogramaEvent;
  onSelect: (event: CronogramaEvent) => void;
  className?: string;
}

function CommissionLabel({ event }: { event: CronogramaEvent }) {
  const label = event.commissionName ?? event.linkedCommissions?.map((commission) => commission.name).join(', ');
  if (!label) return null;

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground">
      <Users className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function EventFeaturedCard({ event, onSelect, className }: EventCardBaseProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-2xl border border-gold/45 bg-[linear-gradient(135deg,hsl(var(--gold)/0.22),hsl(var(--primary)/0.12)_42%,hsl(var(--card)/0.92))] p-4 shadow-[0_18px_60px_-34px_hsl(var(--primary)/0.65)]',
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent" />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <PriorityBadge priority="critica" />
            <TypeBadge type={event.eventType} />
            <StatusBadge status={event.status} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-800 dark:text-gold">
              Destaque institucional
            </p>
            <h2 className="mt-1 text-xl font-black leading-tight tracking-tight text-foreground sm:text-2xl">
              {event.title}
            </h2>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-foreground/80">
            <span className="inline-flex items-center gap-1.5 font-bold">
              <CalendarDays className="h-4 w-4 text-gold" />
              {formatEventRange(event)}
            </span>
            <CommissionLabel event={event} />
          </div>
          {event.description && <p className="line-clamp-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">{event.description}</p>}
        </div>

        <Button onClick={() => onSelect(event)} className="h-9 shrink-0 rounded-xl px-3 text-xs font-bold sm:text-sm">
          Abrir detalhes
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-3">
        <EventPeriodBar event={event} />
      </div>
    </section>
  );
}

export function EventCompactCard({ event, onSelect, className }: EventCardBaseProps) {
  const undated = !event.hasExactDate;
  const central = isCentralMeeting(event);

  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className={cn(
        'group w-full rounded-2xl border bg-card/80 p-3 text-left shadow-sm backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md active:translate-y-0 focus-ring',
        undated ? 'border-amber-300/50 bg-amber-50/90' : central ? 'border-gold/35 bg-gold/10' : 'border-border/50',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {undated && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-900">
                <AlertTriangle className="h-3 w-3" />
                Sem data
              </span>
            )}
            <TypeBadge type={event.eventType} />
            <StatusBadge status={event.status} />
          </div>
          <h3 className="line-clamp-2 text-sm font-black leading-snug text-foreground">{event.title}</h3>
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-semibold text-foreground/80">
          <CalendarDays className="h-3.5 w-3.5 text-gold" />
          {formatEventRange(event)}
          {event.time ? ` · ${event.time}` : ''}
        </span>
        <CommissionLabel event={event} />
      </div>
    </button>
  );
}

export function EventMiniCard({ event, onSelect, className }: EventCardBaseProps) {
  const main = isMainFenasojaEvent(event);
  const undated = !event.hasExactDate;

  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className={cn(
        'group grid min-h-[68px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-white/75 px-3 py-2 text-left shadow-sm backdrop-blur-xl transition duration-200 hover:border-primary/35 hover:bg-white/90 focus-ring',
        main && 'border-gold/50 bg-gold/10',
        undated && 'border-amber-300/55 bg-amber-50',
        !main && !undated && 'border-border/50',
        className,
      )}
    >
      <span
        className={cn(
          'h-9 w-1 rounded-full',
          main ? 'bg-gold' : undated ? 'bg-amber-500' : isCentralMeeting(event) ? 'bg-primary' : 'bg-muted-foreground/45',
        )}
      />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-black text-foreground/80">{formatEventRange(event)}</span>
          {event.time && <span className="text-[10px] font-bold text-muted-foreground">{event.time}</span>}
          {undated && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-900">Sem data</span>}
        </span>
        <span className="mt-0.5 block truncate text-sm font-black leading-tight text-foreground">{event.title}</span>
        <span className="mt-0.5 block truncate text-[11px] font-semibold text-muted-foreground">{event.category}</span>
      </span>
      <ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:text-primary" />
    </button>
  );
}

export function EventListRow({ event, onSelect, className }: EventCardBaseProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl border border-border/50 bg-white/75 px-3 py-2.5 text-left shadow-sm backdrop-blur-xl transition duration-200 hover:border-primary/35 hover:bg-white/90 focus-ring',
        !event.hasExactDate && 'border-amber-300/55 bg-amber-50/90',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={event.category} />
          <StatusBadge status={event.status} />
        </div>
        <p className="mt-1 truncate text-sm font-black text-foreground">{event.title}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-muted-foreground">
          <span>{formatEventRange(event)}</span>
          {event.time && <span>{event.time}</span>}
          <CommissionLabel event={event} />
        </div>
      </div>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
    </button>
  );
}

export function MeetingMiniCard({ event, onSelect, className }: EventCardBaseProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className={cn(
        'group flex min-h-[62px] w-full items-center gap-3 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-left transition duration-200 hover:border-primary/35 hover:bg-primary/15 focus-ring',
        event.sourceYear === 2028 && 'border-gold/35 bg-gold/10',
        className,
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/70 bg-white/75 text-primary shadow-sm">
        <Clock3 className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-foreground">{formatEventRange(event)}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] font-semibold text-muted-foreground">
          <span>{event.time ?? '18:30'}</span>
          {event.location && <span className="truncate">{event.location}</span>}
        </span>
      </span>
      {typeof event.daysRemaining === 'number' && (
        <span className="hidden rounded-full bg-white/80 px-2 py-1 text-[10px] font-black text-muted-foreground md:inline-flex">
          {event.daysRemaining}d
        </span>
      )}
    </button>
  );
}

interface UndatedDecisionCardProps extends EventCardBaseProps {
  onEdit: (event: CronogramaEvent) => void;
}

export function UndatedDecisionCard({ event, onSelect, onEdit, className }: UndatedDecisionCardProps) {
  return (
    <article
      className={cn(
        'rounded-2xl border border-amber-300/60 bg-amber-50/90 p-3 shadow-sm backdrop-blur-xl transition duration-200 hover:shadow-md',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-900">
            <AlertTriangle className="h-3 w-3" />
            Aguardando definição
          </span>
          <h3 className="mt-2 line-clamp-2 text-sm font-black leading-snug text-foreground">{event.title}</h3>
        </div>
        <PriorityBadge priority={event.priority} />
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <CategoryBadge category={event.category} />
        {event.commissionName && (
          <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            {event.commissionName}
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" className="h-8 rounded-xl bg-white/80 text-xs" onClick={() => onSelect(event)}>
          <CheckCircle2 className="h-3.5 w-3.5" />
          Detalhes
        </Button>
        <Button size="sm" className="h-8 rounded-xl text-xs" onClick={() => onEdit(event)}>
          <Pencil className="h-3.5 w-3.5" />
          Definir
        </Button>
      </div>
    </article>
  );
}

export function SubeventActionButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" className="h-8 rounded-xl bg-white/75 text-xs" onClick={onClick}>
      <Plus className="h-3.5 w-3.5" />
      Subevento
    </Button>
  );
}
