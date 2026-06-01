import { useCallback, useRef } from 'react';
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
  const ref = useRef<HTMLElement>(null);
  const rafRef = useRef<number | null>(null);

  const handleMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el) return;
    const x = e.clientX;
    const y = e.clientY;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const node = ref.current;
      if (!node) return;
      const r = node.getBoundingClientRect();
      const mx = ((x - r.left) / r.width) * 100;
      const my = ((y - r.top) / r.height) * 100;
      node.style.setProperty('--mx', `${mx}%`);
      node.style.setProperty('--my', `${my}%`);
    });
  }, []);

  return (
    <div
      className="commission-card-perspective portal-card-enter"
      style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}
    >
      <article
        ref={ref}
        onMouseMove={handleMove}
        className="commission-card-3d liquid-glass-card gold-accent group relative flex min-h-[258px] flex-col overflow-hidden rounded-[1.65rem] p-5 text-left text-foreground md:p-6"
      >
        <span className="commission-integration-link" aria-hidden="true" />

        {/* Base de cor da comissão */}
        <div
          className={cn(
            'absolute inset-x-0 top-0 h-36 overflow-hidden rounded-t-[1.65rem] bg-gradient-to-br opacity-95',
            module.accentClass,
          )}
          aria-hidden="true"
        />

        {/* Glow dourado seguindo o cursor (puro CSS via --mx/--my) */}
        <div className="commission-card-glow" aria-hidden="true" />

        {/* Linha dourada inferior */}
        <div
          className="absolute inset-x-5 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/45 to-transparent"
          aria-hidden="true"
        />

        {/* Header: ícone + status */}
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div
            className={cn(
              'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-lg ring-1 ring-white/30',
              module.visual?.iconBackground ?? 'bg-white/75 text-primary dark:bg-white/10',
            )}
          >
            <Icon className="h-7 w-7 drop-shadow-sm" aria-hidden="true" />
          </div>
          <span
            className={cn(
              'commission-status-pill inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-bold shadow-sm backdrop-blur-xl',
              statusClasses[status],
            )}
          >
            {statusLabels[status]}
          </span>
        </div>

        {/* Corpo */}
        <div className="relative z-10 mt-6 flex flex-1 flex-col">
          <div className="mb-1 flex items-center gap-1.5" aria-hidden="true">
            <span className="h-1 w-1 rounded-full bg-gold shadow-[0_0_10px_hsl(var(--gold)/0.85)]" />
            <span className="h-px w-9 bg-gradient-to-r from-gold/70 to-transparent" />
            <span className="h-1 w-1 rounded-full bg-primary/80" />
          </div>
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
            className="commission-action-button mt-auto h-12 w-full rounded-2xl font-bold shadow-lg shadow-primary/20 transition active:scale-[0.98]"
            variant={status === 'restricted' ? 'outline' : 'default'}
          >
            {actionLabel}
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </Button>
        </div>
      </article>
    </div>
  );
}
