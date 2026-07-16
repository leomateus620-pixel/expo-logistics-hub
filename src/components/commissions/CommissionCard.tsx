import { ArrowRight, ChevronDown, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  statusClasses,
  statusLabels,
  type CommissionModule,
  type CommissionStatus,
} from '@/modules/commissions/commissionRegistry';

interface CommissionCardProps {
  module: Pick<CommissionModule, 'name' | 'description' | 'icon' | 'status' | 'accentClass'> & {
    sensitive?: boolean;
    visual?: Partial<CommissionModule['visual']>;
  };
  actionLabel?: string;
  index?: number;
  expanded?: boolean;
  onToggle?: () => void;
  onAccess: () => void;
}

export default function CommissionCard({
  module,
  actionLabel = 'Acessar módulo',
  index = 0,
  expanded = false,
  onToggle,
  onAccess,
}: CommissionCardProps) {
  const Icon = module.icon;
  const status = module.status as CommissionStatus;

  return (
    <article
      className={cn(
        'portal-card-enter liquid-glass-card overflow-hidden rounded-xl text-card-foreground',
        expanded ? 'border-primary/35 shadow-[var(--elevation-3)]' : 'border-border',
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="group flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors duration-150 hover:bg-accent/55 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
      >
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.78),var(--elevation-1)] transition-transform duration-200 group-hover:-translate-y-0.5',
            module.visual?.iconBackground,
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold tracking-tight text-foreground sm:text-[15px]">
            {module.name}
          </span>
          <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Comissão operacional
          </span>
        </span>

        <span
          className={cn(
            'hidden shrink-0 items-center rounded-md border px-2 py-1 text-[10px] font-bold sm:inline-flex',
            statusClasses[status],
          )}
        >
          {statusLabels[status]}
        </span>

        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            expanded && 'rotate-180 text-primary',
          )}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="animate-soft-rise">
          <div className="border-t border-border px-4 pb-4 pt-3 sm:px-5">
            <p className="text-sm leading-6 text-muted-foreground">{module.description}</p>

            {module.sensitive && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/8 px-3 py-2 text-xs font-semibold text-destructive">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Acesso sujeito a permissão específica
              </div>
            )}

            <Button
              type="button"
              onClick={onAccess}
              className="mt-4 h-10 w-full sm:w-auto"
              variant={status === 'restricted' ? 'outline' : 'default'}
            >
              {actionLabel}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
