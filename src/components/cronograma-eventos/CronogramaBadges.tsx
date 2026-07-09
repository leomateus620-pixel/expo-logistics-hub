import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  priorityLabels,
  statusLabels,
  typeLabels,
  type CronogramaEvent,
} from '@/lib/cronograma-eventos';

export function CategoryBadge({ category, className }: { category: string; className?: string }) {
  const lower = category.toLocaleLowerCase('pt-BR');
  const tone = lower.includes('reuni')
    ? 'border-amber-300/70 bg-amber-50 text-amber-800 dark:bg-gold/15 dark:text-gold'
    : lower.includes('feira')
      ? 'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-300/30 dark:bg-indigo-500/15 dark:text-indigo-200'
      : lower.includes('feriado')
        ? 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-300/25 dark:bg-sky-500/15 dark:text-sky-200'
        : lower.includes('segurança')
          ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-300/25 dark:bg-red-500/15 dark:text-red-200'
          : lower.includes('limpeza')
            ? 'border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-300/25 dark:bg-cyan-500/15 dark:text-cyan-200'
            : lower.includes('mídia') || lower.includes('comunica') || lower.includes('patroc')
              ? 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-300/25 dark:bg-fuchsia-500/15 dark:text-fuchsia-200'
              : lower.includes('infra')
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-300/25 dark:bg-emerald-500/15 dark:text-emerald-200'
                : lower.includes('sem data') || lower.includes('pend')
                  ? 'border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-300/30 dark:bg-amber-500/15 dark:text-amber-200'
                  : 'border-primary/25 bg-primary/10 text-primary';

  return (
    <Badge variant="outline" className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', tone, className)}>
      {category}
    </Badge>
  );
}

export function StatusBadge({ status, className }: { status: CronogramaEvent['status']; className?: string }) {
  const tone = {
    planejado: 'border-primary/25 bg-primary/10 text-primary',
    em_andamento:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-300/30 dark:bg-emerald-500/15 dark:text-emerald-200',
    aguardando_definicao:
      'border-amber-300/70 bg-amber-50 text-amber-900 dark:border-amber-300/35 dark:bg-amber-500/15 dark:text-amber-200',
    aguardando_responsavel:
      'border-orange-300/70 bg-orange-50 text-orange-900 dark:border-orange-300/35 dark:bg-orange-500/15 dark:text-orange-200',
    concluido: 'border-green-200 bg-green-50 text-green-800 dark:border-green-300/30 dark:bg-green-500/15 dark:text-green-200',
    cancelado: 'border-red-200 bg-red-50 text-red-800 dark:border-red-300/30 dark:bg-red-500/15 dark:text-red-200',
  }[status];

  return (
    <Badge variant="outline" className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', tone, className)}>
      {statusLabels[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority, className }: { priority: CronogramaEvent['priority']; className?: string }) {
  const tone = {
    baixa: 'border-muted-foreground/20 bg-muted/40 text-muted-foreground',
    media: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-300/25 dark:bg-sky-500/15 dark:text-sky-200',
    alta: 'border-orange-300/70 bg-orange-50 text-orange-900 dark:border-orange-300/35 dark:bg-orange-500/15 dark:text-orange-200',
    critica: 'border-gold/45 bg-gold/20 text-amber-900 shadow-[0_0_18px_-8px_hsl(var(--gold))] dark:text-gold',
  }[priority];

  return (
    <Badge variant="outline" className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', tone, className)}>
      {priorityLabels[priority]}
    </Badge>
  );
}

export function TypeBadge({ type, className }: { type: CronogramaEvent['eventType']; className?: string }) {
  return (
    <Badge variant="secondary" className={cn('rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-bold text-foreground', className)}>
      {typeLabels[type]}
    </Badge>
  );
}
