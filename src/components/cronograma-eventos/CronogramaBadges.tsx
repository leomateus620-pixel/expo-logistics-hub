import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Flag,
  Layers3,
  ShieldAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  categoryLabels,
  categoryTone,
  priorityLabels,
  statusLabels,
} from './cronogramaData';
import type {
  CronogramaCategory,
  CronogramaEvent,
  CronogramaPriority,
  CronogramaStatus,
} from './types';
import { formatShortDateRange, formatWeekday } from './dateUtils';

const statusMeta: Record<CronogramaStatus, { icon: LucideIcon; className: string; dot: string }> = {
  confirmed: {
    icon: CheckCircle2,
    className: 'text-emerald-800',
    dot: 'bg-emerald-600',
  },
  planned: {
    icon: Clock3,
    className: 'text-primary',
    dot: 'bg-primary',
  },
  in_definition: {
    icon: CircleDashed,
    className: 'text-amber-900',
    dot: 'bg-amber-600',
  },
  blocked: {
    icon: ShieldAlert,
    className: 'text-red-900',
    dot: 'bg-red-700',
  },
};

const priorityMeta: Record<CronogramaPriority, { className: string; rail: string }> = {
  critical: {
    className: 'text-red-950 bg-red-50/90 border-red-900/15',
    rail: 'bg-red-700',
  },
  high: {
    className: 'text-amber-950 bg-amber-50/85 border-amber-900/15',
    rail: 'bg-amber-700',
  },
  medium: {
    className: 'text-slate-800 bg-slate-50/90 border-slate-900/10',
    rail: 'bg-slate-500',
  },
  low: {
    className: 'text-emerald-900 bg-emerald-50/80 border-emerald-900/10',
    rail: 'bg-emerald-600',
  },
};

export function CronogramaMetaBadge({
  children,
  icon: Icon,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  icon?: LucideIcon;
  tone?: 'neutral' | 'gold' | 'green' | 'danger';
  className?: string;
}) {
  const toneClass = {
    neutral: 'border-border/45 bg-white/55 text-foreground/72',
    gold: 'border-gold/24 bg-gold/[0.08] text-amber-950',
    green: 'border-primary/15 bg-primary/5 text-primary',
    danger: 'border-red-900/15 bg-red-50/80 text-red-950',
  }[tone];

  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold leading-none tracking-[0.01em]',
        toneClass,
        className,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function CronogramaStatusIndicator({
  status,
  compact = false,
}: {
  status: CronogramaStatus;
  compact?: boolean;
}) {
  const meta = statusMeta[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-semibold leading-none',
        compact ? 'text-[10px]' : 'text-[11px]',
        meta.className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full shadow-[0_0_0_3px_rgb(255_255_255/0.72)]', meta.dot)} />
      {statusLabels[status]}
    </span>
  );
}

export function CronogramaPriorityIndicator({
  priority,
  compact = false,
}: {
  priority: CronogramaPriority;
  compact?: boolean;
}) {
  const meta = priorityMeta[priority];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 overflow-hidden rounded-md border font-semibold leading-none',
        compact ? 'h-6 pr-2 text-[10px]' : 'h-7 pr-2.5 text-[11px]',
        meta.className,
      )}
    >
      <span className={cn('h-full w-1.5 rounded-l-full', meta.rail)} />
      {priority === 'critical' && <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
      {priorityLabels[priority]}
    </span>
  );
}

export function CronogramaCategoryMarker({
  category,
  label = true,
  className,
}: {
  category: CronogramaCategory;
  label?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-[11px] font-semibold text-foreground/72', className)}>
      <span className={cn('h-3.5 w-0.5 rounded-full', categoryTone[category])} />
      {label && categoryLabels[category]}
    </span>
  );
}

export function EventMetaLine({
  event,
  dense = false,
  className,
}: {
  event: CronogramaEvent;
  dense?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground', className)}>
      <span className="inline-flex items-center gap-1.5 font-medium text-foreground/72">
        <Flag className="h-3.5 w-3.5 text-gold" aria-hidden="true" />
        {formatShortDateRange(event.date, event.endDate)}
        {event.startTime && <span className="font-mono text-[11px] text-foreground/62">{event.startTime}</span>}
      </span>
      {!dense && (
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          {formatWeekday(event.date)}
        </span>
      )}
      {event.commission && (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Layers3 className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="truncate">{event.commission}</span>
        </span>
      )}
    </div>
  );
}

export function EventIdentityStrip({
  event,
  className,
}: {
  event: CronogramaEvent;
  className?: string;
}) {
  return (
    <div className={cn('absolute inset-y-4 left-0 flex w-1.5 overflow-hidden rounded-r-full bg-primary/20', className)}>
      <span
        className={cn(
          'block h-full w-full',
          event.priority === 'critical' ? 'bg-red-700' : event.isMain ? 'bg-gold' : categoryTone[event.category],
        )}
      />
    </div>
  );
}

export function EventBadgesRow({ event, compact = false }: { event: CronogramaEvent; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <CronogramaStatusIndicator status={event.status} compact={compact} />
      {(event.priority === 'critical' || !compact) && (
        <CronogramaPriorityIndicator priority={event.priority} compact={compact} />
      )}
      {event.isMain && (
        <CronogramaMetaBadge icon={Flag} tone="gold" className={compact ? 'h-6 px-2 text-[10px]' : undefined}>
          Marco 2028
        </CronogramaMetaBadge>
      )}
    </div>
  );
}
