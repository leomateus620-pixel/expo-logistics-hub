import { useCallback, useRef, useState } from 'react';
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

interface TiltState {
  rx: number;
  ry: number;
  mx: number;
  my: number;
  hover: boolean;
  pressed: boolean;
}

const REST: TiltState = { rx: 1, ry: -1, mx: 50, my: 30, hover: false, pressed: false };
const MAX_TILT = 4;

export default function CommissionCard({ module, actionLabel = 'Acessar', index = 0, onAccess }: CommissionCardProps) {
  const Icon = module.icon;
  const status = module.status as CommissionStatus;
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState<TiltState>(REST);

  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setTilt((prev) => ({
      rx: (0.5 - py) * MAX_TILT,
      ry: (px - 0.5) * MAX_TILT,
      mx: px * 100,
      my: py * 100,
      hover: true,
      pressed: prev.pressed,
    }));
  }, []);

  const handleLeave = useCallback(() => setTilt(REST), []);
  const handleDown = useCallback(() => setTilt((p) => ({ ...p, pressed: true })), []);
  const handleUp = useCallback(() => setTilt((p) => ({ ...p, pressed: false })), []);

  const lift = tilt.hover ? 4 : 0;
  const pressZ = tilt.pressed ? -2 : 0;

  return (
    <div
      className="commission-card-perspective portal-card-enter"
      style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}
    >
      <article
        ref={ref}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onMouseDown={handleDown}
        onMouseUp={handleUp}
        className="commission-card-3d liquid-glass-card gold-accent group relative flex min-h-[258px] flex-col overflow-visible rounded-[1.65rem] p-5 text-left text-foreground md:p-6"
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translate3d(0, ${-lift}px, ${lift + pressZ}px)`,
          transition: tilt.hover
            ? 'transform 180ms cubic-bezier(0.22,1,0.36,1), box-shadow 240ms ease, border-color 240ms ease, filter 240ms ease'
            : 'transform 420ms cubic-bezier(0.22,1,0.36,1), box-shadow 420ms ease, border-color 420ms ease, filter 420ms ease',
          willChange: tilt.hover ? 'transform' : 'auto',
        }}
      >
        <span className="commission-integration-link" aria-hidden="true" />

        {/* Base de cor da comissão */}
        <div
          className={cn(
            'absolute inset-x-0 top-0 h-36 overflow-hidden rounded-[1.65rem] bg-gradient-to-br opacity-95',
            module.accentClass,
          )}
          aria-hidden="true"
          style={{ transform: 'translateZ(2px)' }}
        />

        {/* Halo radial que segue o cursor (sutil) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[1.65rem]"
          style={{
            background: `radial-gradient(60% 55% at ${tilt.mx}% ${tilt.my}%, hsl(var(--gold) / ${tilt.hover ? 0.14 : 0.0}), transparent 65%), radial-gradient(80% 70% at ${100 - tilt.mx}% ${100 - tilt.my}%, hsl(var(--primary) / ${tilt.hover ? 0.10 : 0.0}), transparent 70%)`,
            transition: 'background 220ms ease',
            transform: 'translateZ(1px)',
          }}
        />

        {/* Sombra de chão leve */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-8 left-1/2 h-16 -translate-x-1/2 rounded-full bg-black/40 blur-2xl"
          style={{
            width: tilt.hover ? '84%' : '78%',
            opacity: tilt.hover ? 0.32 : 0.22,
            transition: 'width 320ms ease, opacity 320ms ease',
          }}
        />

        {/* Linha dourada inferior */}
        <div
          className="absolute inset-x-5 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/45 to-transparent"
          aria-hidden="true"
        />

        {/* Header: ícone + status */}
        <div className="relative z-10 flex items-start justify-between gap-4" style={{ transform: 'translateZ(6px)' }}>
          <div
            className={cn(
              'commission-icon-3d flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-lg ring-1 ring-white/30',
              module.visual?.iconBackground ?? 'bg-white/75 text-primary dark:bg-white/10',
            )}
            style={{ transform: 'translateZ(10px)' }}
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
        <div className="relative z-10 mt-6 flex flex-1 flex-col" style={{ transform: 'translateZ(4px)' }}>
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
            style={{ transform: 'translateZ(2px)' }}
          >
            {actionLabel}
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </Button>
        </div>
      </article>
    </div>
  );
}
