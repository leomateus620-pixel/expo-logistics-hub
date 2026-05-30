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
    visual?: Partial<CommissionModule['visual']>;
  };
  actionLabel?: string;
  index?: number;
  onAccess: () => void;
}

export default function CommissionCard({ module, actionLabel = 'Acessar', index = 0, onAccess }: CommissionCardProps) {
  const Icon = module.icon;
  const status = module.status as CommissionStatus;

  return (
    <article
      className="portal-card-enter liquid-glass-card gold-accent interactive-lift group relative flex min-h-[258px] flex-col overflow-hidden rounded-3xl p-5 text-left text-foreground premium-shadow md:p-6"
      style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}
    >
      <div className={cn('absolute inset-x-0 top-0 h-32 bg-gradient-to-br opacity-95', module.accentClass)} aria-hidden="true" />
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/20 blur-3xl transition group-hover:scale-125" aria-hidden="true" />
      <div className="absolute inset-x-5 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent" aria-hidden="true" />

      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-lg ring-1 ring-white/30', module.visual?.iconBackground ?? 'bg-white/75 text-primary dark:bg-white/10')}>
          <Icon className="h-7 w-7 drop-shadow-sm" aria-hidden="true" />
        </div>
        <span className={cn('inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-bold shadow-sm backdrop-blur-xl', statusClasses[status])}>
          {statusLabels[status]}
        </span>
      </div>

      <div className="relative z-10 mt-6 flex flex-1 flex-col">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-gold/80">Comissão</p>
        <h2 className="mt-2 text-xl font-black tracking-tight text-foreground">{module.name}</h2>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{module.description}</p>
        {module.sensitive && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-200">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Módulo sensível
          </div>
        )}
        <Button
          type="button"
          onClick={onAccess}
          className="mt-auto h-12 w-full rounded-2xl font-bold shadow-lg shadow-primary/15 transition active:scale-[0.98]"
          variant={status === 'restricted' ? 'outline' : 'default'}
        >
          {actionLabel}
          <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}
