import { cn } from '@/lib/utils';
import { ReactNode, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  trend?: string;
  variant?: 'default' | 'primary' | 'accent' | 'success' | 'warning';
  to?: string;
  /** 0..1 — desenha barra de proporção sob o trend */
  progress?: number;
  /** Etiqueta inteligente (ex: "próximo em 45min") */
  smartLabel?: string;
  /** Indica atividade ao vivo — adiciona ponto pulsante */
  liveActive?: boolean;
  /** Contagem de itens urgentes — chip vermelho pulsante */
  urgentCount?: number;
}

const variantConfig = {
  default: {
    glow: 'rgba(160,160,160,0.18)',
    iconBg: 'from-muted/70 to-muted/30',
    iconColor: 'text-muted-foreground',
    ring: 'ring-border/40',
    progressFrom: 'hsl(var(--muted-foreground))',
    progressTo: 'hsl(var(--foreground))',
    accent: 'hsl(var(--muted-foreground))',
  },
  primary: {
    glow: 'hsl(var(--primary) / 0.32)',
    iconBg: 'from-primary/30 to-primary/5',
    iconColor: 'text-primary',
    ring: 'ring-primary/30',
    progressFrom: 'hsl(var(--primary))',
    progressTo: 'hsl(var(--gold))',
    accent: 'hsl(var(--primary))',
  },
  accent: {
    glow: 'hsl(var(--gold) / 0.34)',
    iconBg: 'from-[hsl(var(--gold)/0.35)] to-[hsl(var(--gold)/0.05)]',
    iconColor: 'text-gold',
    ring: 'ring-[hsl(var(--gold)/0.35)]',
    progressFrom: 'hsl(var(--gold))',
    progressTo: 'hsl(45 95% 70%)',
    accent: 'hsl(var(--gold))',
  },
  success: {
    glow: 'hsl(var(--success) / 0.32)',
    iconBg: 'from-[hsl(var(--success)/0.32)] to-[hsl(var(--success)/0.05)]',
    iconColor: 'text-success',
    ring: 'ring-[hsl(var(--success)/0.30)]',
    progressFrom: 'hsl(var(--success))',
    progressTo: 'hsl(var(--gold))',
    accent: 'hsl(var(--success))',
  },
  warning: {
    glow: 'hsl(var(--warning) / 0.32)',
    iconBg: 'from-[hsl(var(--warning)/0.32)] to-[hsl(var(--warning)/0.05)]',
    iconColor: 'text-warning',
    ring: 'ring-[hsl(var(--warning)/0.30)]',
    progressFrom: 'hsl(var(--warning))',
    progressTo: 'hsl(var(--destructive))',
    accent: 'hsl(var(--warning))',
  },
};

export default function StatCard({
  label, value, icon, trend, variant = 'default', to,
  progress, smartLabel, liveActive, urgentCount,
}: StatCardProps) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, mx: 50, my: 50, hover: false });
  const cfg = variantConfig[variant];

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    // ±7° tilt
    setTilt({
      x: (0.5 - py) * 14,
      y: (px - 0.5) * 14,
      mx: px * 100,
      my: py * 100,
      hover: true,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0, mx: 50, my: 50, hover: false });
  }, []);

  const numericValue = typeof value === 'number' ? value : parseInt(String(value), 10) || 0;
  const showProgressBar = typeof progress === 'number';
  const progressPct = showProgressBar ? Math.max(0, Math.min(1, progress!)) * 100 : 0;

  return (
    <div className="[perspective:1400px] motion-reduce:[perspective:none]">
      <div
        ref={ref}
        className={cn(
          'group relative rounded-2xl cursor-pointer outline-none',
          'transition-[transform,box-shadow] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
          'will-change-transform',
          to && 'active:scale-[0.97]',
          'motion-reduce:!transform-none',
        )}
        style={{
          transformStyle: 'preserve-3d',
          transform: tilt.hover
            ? `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateZ(8px)`
            : 'rotateX(2deg) rotateY(-1deg) translateZ(0)',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={to ? () => navigate(to) : undefined}
        tabIndex={to ? 0 : undefined}
        role={to ? 'link' : undefined}
        aria-label={to ? `${label}: ${value}` : undefined}
        onKeyDown={(e) => {
          if (to && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            navigate(to);
          }
        }}
      >
        {/* Layer 0 — Glow back (behind surface) */}
        <div
          aria-hidden
          className="absolute -inset-1 rounded-3xl opacity-40 group-hover:opacity-90 transition-opacity duration-300 blur-xl pointer-events-none"
          style={{
            background: `radial-gradient(60% 60% at ${tilt.mx}% ${tilt.my}%, ${cfg.glow}, transparent 70%)`,
            transform: 'translateZ(-20px)',
          }}
        />

        {/* Layer 1 — Glass surface */}
        <div
          className={cn(
            'relative rounded-2xl overflow-hidden',
            'bg-card/55 backdrop-blur-2xl backdrop-saturate-150',
            'border border-border/40',
            'ring-1 ring-inset', cfg.ring,
          )}
          style={{
            boxShadow: tilt.hover
              ? `0 14px 38px -10px ${cfg.glow}, 0 6px 16px -8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 0.5px hsl(var(--gold) / 0.10)`
              : `0 4px 14px -6px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 0.5px hsl(var(--gold) / 0.07)`,
            transform: 'translateZ(0)',
          }}
        >
          {/* Specular highlight following cursor */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{
              background: `radial-gradient(circle at ${tilt.mx}% ${tilt.my}%, rgba(255,255,255,0.14), transparent 55%)`,
            }}
          />

          {/* Top inner light edge */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-px pointer-events-none"
            style={{
              background: `linear-gradient(90deg, transparent, ${cfg.accent}, transparent)`,
              opacity: 0.5,
            }}
          />

          {/* Left vertical accent */}
          <div
            aria-hidden
            className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full pointer-events-none"
            style={{
              background: `linear-gradient(180deg, ${cfg.accent}, ${cfg.accent}80)`,
              boxShadow: `0 0 10px ${cfg.glow}`,
            }}
          />

          {/* Content */}
          <div className="relative p-4 min-h-[124px] flex flex-col" style={{ transform: 'translateZ(15px)', transformStyle: 'preserve-3d' }}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {label}
                  </p>
                  {liveActive && (
                    <span className="relative inline-flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: cfg.accent }} />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: cfg.accent }} />
                    </span>
                  )}
                </div>
                <p
                  className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground tabular-nums"
                  style={{
                    transform: 'translateZ(8px)',
                    textShadow: tilt.hover ? `0 2px 12px ${cfg.glow}` : 'none',
                    transition: 'text-shadow 220ms ease',
                  }}
                >
                  {value}
                </p>
                {trend && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground font-medium">{trend}</p>
                )}
              </div>

              {/* Icon — flutua na profundidade */}
              <div
                className={cn(
                  'relative rounded-xl p-2.5 bg-gradient-to-br ring-1 transition-transform duration-300',
                  cfg.iconBg, cfg.ring,
                )}
                style={{
                  transform: tilt.hover ? 'translateZ(28px) scale(1.08)' : 'translateZ(12px)',
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 6px 14px -4px ${cfg.glow}`,
                }}
              >
                {/* Pulse ring quando ativo */}
                {(liveActive || numericValue > 0) && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-xl animate-ping motion-reduce:hidden"
                    style={{ boxShadow: `0 0 0 2px ${cfg.glow}`, animationDuration: '2.4s' }}
                  />
                )}
                <div className={cn(cfg.iconColor, 'relative')} style={{ filter: `drop-shadow(0 2px 4px ${cfg.glow})` }}>
                  {icon}
                </div>
              </div>
            </div>

            {/* Smart status row */}
            {(() => {
              const hasUrgent = typeof urgentCount === 'number' && urgentCount > 0;
              const hasSmartRow = showProgressBar || !!smartLabel || hasUrgent;
              if (!hasSmartRow) return null;
              return (
                <div className="mt-auto pt-2.5 flex items-center gap-2" style={{ transform: 'translateZ(4px)' }}>
                  {showProgressBar && (
                    <div className="flex-1 h-1 rounded-full bg-muted/50 overflow-hidden ring-1 ring-inset ring-border/30">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${progressPct}%`,
                          background: `linear-gradient(90deg, ${cfg.progressFrom}, ${cfg.progressTo})`,
                          boxShadow: `0 0 6px ${cfg.glow}`,
                        }}
                      />
                    </div>
                  )}
                  {smartLabel && (
                    <span
                      className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md whitespace-nowrap"
                      style={{ background: `${cfg.accent}1f`, color: cfg.accent }}
                    >
                      {smartLabel}
                    </span>
                  )}
                  {hasUrgent && (
                    <span className="relative inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-destructive/15 text-destructive">
                      <span className="relative inline-flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75 animate-ping" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
                      </span>
                      {urgentCount} urgente{urgentCount! > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Smart link arrow */}
            {to && (
              <ArrowUpRight
                aria-hidden
                className="absolute top-3 right-3 w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-foreground transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                style={{ transform: tilt.hover ? 'translateZ(20px)' : 'translateZ(0)' }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
