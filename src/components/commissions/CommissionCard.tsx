import { ArrowRight, ShieldCheck } from 'lucide-react';
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
  };
  actionLabel?: string;
  onAccess: () => void;
}

export default function CommissionCard({ module, actionLabel = 'Acessar', onAccess }: CommissionCardProps) {
  const Icon = module.icon;
  const status = module.status as CommissionStatus;

  return (
    <article className="liquid-glass-card gold-accent group relative flex min-h-[230px] flex-col overflow-hidden rounded-xl p-4 text-left md:p-5">
      <div className={cn('absolute inset-x-0 top-0 h-24 bg-gradient-to-br opacity-90', module.accentClass)} aria-hidden="true" />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/70 text-primary shadow-sm ring-1 ring-border/40 dark:bg-white/10">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
        <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold', statusClasses[status])}>
          {statusLabels[status]}
        </span>
      </div>

      <div className="relative z-10 mt-5 flex flex-1 flex-col">
        <h2 className="text-lg font-bold tracking-tight text-foreground">{module.name}</h2>
        <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{module.description}</p>
        {module.sensitive && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-200">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Modulo sensivel
          </div>
        )}
        <Button
          type="button"
          onClick={onAccess}
          className="mt-auto h-11 w-full rounded-xl font-semibold"
          variant={status === 'restricted' ? 'outline' : 'default'}
        >
          {actionLabel}
          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}
