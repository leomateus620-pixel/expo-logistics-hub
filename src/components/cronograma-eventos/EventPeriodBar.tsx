import { Clock3 } from 'lucide-react';
import { getEventDurationDays, type CronogramaEvent } from '@/lib/cronograma-eventos';
import { cn } from '@/lib/utils';

export default function EventPeriodBar({ event, className }: { event: CronogramaEvent; className?: string }) {
  const days = getEventDurationDays(event);
  if (!event.startDate || days <= 1) return null;

  return (
    <div className={cn('rounded-xl border border-gold/20 bg-gold/10 p-2', className)}>
      <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-gold">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="h-3 w-3" />
          Período oficial
        </span>
        <span>{days} dias</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/20">
        <div className="h-full w-full rounded-full bg-gradient-to-r from-gold/40 via-gold to-primary/70 shadow-[0_0_18px_oklch(var(--gold)/0.35)]" />
      </div>
    </div>
  );
}

