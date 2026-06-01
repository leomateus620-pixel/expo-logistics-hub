import { useCallback, useEffect, useRef } from 'react';
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
  actionLabel = 'Acessar',
  index = 0,
  expanded = false,
  onToggle,
  onAccess,
}: CommissionCardProps) {
  const Icon = module.icon;
  const status = module.status as CommissionStatus;
  const ref = useRef<HTMLButtonElement>(null);
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
      node.style.setProperty('--mx', `${((x - r.left) / r.width) * 100}%`);
      node.style.setProperty('--my', `${((y - r.top) / r.height) * 100}%`);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleClick = () => {
    onToggle?.();
  };

  const handleAccessClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAccess();
  };

  return (
    <div
      className="portal-card-enter"
      style={{ animationDelay: `${Math.min(index * 35, 280)}ms` }}
    >
      <button
        ref={ref}
        type="button"
        onClick={handleClick}
        onMouseMove={handleMove}
        aria-expanded={expanded}
        data-expanded={expanded}
        className={cn(
          'commission-island group relative w-full overflow-hidden text-left',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
        )}
      >
        {/* Accent bar lateral */}
        <span
          className={cn(
            'pointer-events-none absolute left-0 top-0 h-full w-[3px] rounded-l-[inherit] bg-gradient-to-b opacity-90',
            module.accentClass,
          )}
          aria-hidden="true"
        />

        {/* Glow dourado seguindo cursor */}
        <span className="commission-card-glow" aria-hidden="true" />

        {/* Header (sempre visível) */}
        <div className="relative z-10 flex items-center gap-3 px-4 py-3 sm:px-5">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-md ring-1 ring-white/30',
              module.visual?.iconBackground ?? 'bg-white/75 text-primary dark:bg-white/10',
            )}
          >
            <Icon className="h-5 w-5 drop-shadow-sm" aria-hidden="true" />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-bold tracking-tight text-foreground">
              {module.name}
            </h2>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-gold/75">
              Comissão
            </p>
          </div>

          <span
            className={cn(
              'commission-status-pill hidden shrink-0 items-center rounded-full border px-2.5 py-1 text-[10px] font-bold shadow-sm backdrop-blur-xl sm:inline-flex',
              statusClasses[status],
            )}
          >
            {statusLabels[status]}
          </span>

          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300',
              expanded && 'rotate-180 text-gold',
            )}
            aria-hidden="true"
          />
        </div>

        {/* Conteúdo expandido */}
        <div
          className={cn(
            'commission-island-body relative z-10 grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
            expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}
          aria-hidden={!expanded}
        >
          <div className="overflow-hidden">
            <div className="space-y-3 px-4 pb-4 sm:px-5">
              <div className="h-px w-full bg-gradient-to-r from-transparent via-gold/30 to-transparent" />

              <p className="text-sm leading-6 text-muted-foreground">
                {module.description}
              </p>

              {module.sensitive && (
                <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-200">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Módulo sensível
                </div>
              )}

              <Button
                type="button"
                onClick={handleAccessClick}
                className="commission-action-button h-11 w-full rounded-xl font-bold shadow-lg shadow-primary/20 transition active:scale-[0.98]"
                variant={status === 'restricted' ? 'outline' : 'default'}
              >
                {actionLabel}
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}
