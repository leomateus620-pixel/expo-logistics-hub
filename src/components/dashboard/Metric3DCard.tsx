import { ReactNode, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import MetricCardRotator from './MetricCardRotator';
import { Maximize2 } from 'lucide-react';

type Variant = 'primary' | 'accent' | 'success' | 'warning';

interface MetricScreen {
  label: string;
  value: string | number;
  hint?: string;
  smartTag?: string;
}

interface Props {
  title: string;
  icon: ReactNode;
  variant: Variant;
  screens: MetricScreen[];
  cta?: { label: string; onClick: () => void };
  onExpand?: () => void;
  liveActive?: boolean;
  /** sparkline data */
  spark?: number[];
}

const cfgMap: Record<Variant, { glow: string; iconBg: string; iconColor: string; ring: string; accent: string }> = {
  primary: { glow: 'hsl(var(--primary) / 0.32)', iconBg: 'from-primary/30 to-primary/5', iconColor: 'text-primary', ring: 'ring-primary/30', accent: 'hsl(var(--primary))' },
  accent: { glow: 'hsl(var(--gold) / 0.34)', iconBg: 'from-[hsl(var(--gold)/0.35)] to-[hsl(var(--gold)/0.05)]', iconColor: 'text-gold', ring: 'ring-[hsl(var(--gold)/0.35)]', accent: 'hsl(var(--gold))' },
  success: { glow: 'hsl(var(--success) / 0.32)', iconBg: 'from-[hsl(var(--success)/0.32)] to-[hsl(var(--success)/0.05)]', iconColor: 'text-success', ring: 'ring-[hsl(var(--success)/0.30)]', accent: 'hsl(var(--success))' },
  warning: { glow: 'hsl(var(--warning) / 0.32)', iconBg: 'from-[hsl(var(--warning)/0.32)] to-[hsl(var(--warning)/0.05)]', iconColor: 'text-warning', ring: 'ring-[hsl(var(--warning)/0.30)]', accent: 'hsl(var(--warning))' },
};

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const w = 60, h = 16;
  const step = w / Math.max(data.length - 1, 1);
  const pts = data.map((v, i) => `${i * step},${h - (v / max) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="opacity-70" aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts} />
    </svg>
  );
}

export default function Metric3DCard({ title, icon, variant, screens, cta, onExpand, liveActive, spark }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, mx: 50, my: 50, hover: false });
  const cfg = cfgMap[variant];

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setTilt({ x: (0.5 - py) * 10, y: (px - 0.5) * 10, mx: px * 100, my: py * 100, hover: true });
  }, []);
  const handleMouseLeave = useCallback(() => setTilt({ x: 0, y: 0, mx: 50, my: 50, hover: false }), []);

  return (
    <div className="[perspective:1400px] motion-reduce:[perspective:none]">
      <div
        ref={ref}
        className="relative rounded-2xl will-change-transform transition-[transform,box-shadow] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] motion-reduce:!transform-none"
        style={{
          transformStyle: 'preserve-3d',
          transform: tilt.hover ? `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateZ(8px)` : 'rotateX(2deg) rotateY(-1deg)',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Glow */}
        <div aria-hidden className="absolute -inset-1 rounded-3xl opacity-40 blur-xl pointer-events-none transition-opacity duration-300" style={{ background: `radial-gradient(60% 60% at ${tilt.mx}% ${tilt.my}%, ${cfg.glow}, transparent 70%)`, opacity: tilt.hover ? 0.9 : 0.4 }} />
        {/* Surface */}
        <div className={cn('relative rounded-2xl overflow-hidden bg-card/55 backdrop-blur-2xl backdrop-saturate-150 border border-border/40 ring-1 ring-inset', cfg.ring)}
          style={{ boxShadow: tilt.hover ? `0 14px 38px -10px ${cfg.glow}, inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 0.5px hsl(var(--gold) / 0.10)` : `0 4px 14px -6px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 0.5px hsl(var(--gold) / 0.07)` }}>
          {/* Top edge */}
          <div aria-hidden className="absolute inset-x-0 top-0 h-px pointer-events-none" style={{ background: `linear-gradient(90deg, transparent, ${cfg.accent}, transparent)`, opacity: 0.5 }} />
          {/* Left accent */}
          <div aria-hidden className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full pointer-events-none" style={{ background: `linear-gradient(180deg, ${cfg.accent}, ${cfg.accent}80)`, boxShadow: `0 0 10px ${cfg.glow}` }} />

          {/* Header */}
          <div className="relative p-4 pb-2 flex items-start justify-between gap-2" style={{ transform: 'translateZ(15px)' }}>
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">{title}</p>
              {liveActive && (
                <span className="relative inline-flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: cfg.accent }} />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: cfg.accent }} />
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {spark && <Sparkline data={spark} color={cfg.accent} />}
              <div className={cn('rounded-xl p-1.5 bg-gradient-to-br ring-1', cfg.iconBg, cfg.ring)}
                style={{ transform: tilt.hover ? 'translateZ(20px) scale(1.05)' : 'translateZ(8px)', boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 10px -3px ${cfg.glow}` }}>
                <div className={cn(cfg.iconColor)}>{icon}</div>
              </div>
            </div>
          </div>

          {/* Rotating content */}
          <div className="px-4 pb-3 min-h-[88px]" style={{ transform: 'translateZ(8px)' }}>
            <MetricCardRotator
              ariaLabel={`Métricas de ${title}`}
              screens={screens.map((s, i) => (
                <div key={i}>
                  <p className="text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-foreground" style={{ textShadow: tilt.hover ? `0 2px 12px ${cfg.glow}` : 'none' }}>
                    {s.value}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-[10px] font-semibold text-muted-foreground truncate">{s.label}</p>
                    {s.smartTag && (
                      <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md whitespace-nowrap" style={{ background: `${cfg.accent}1f`, color: cfg.accent }}>
                        {s.smartTag}
                      </span>
                    )}
                  </div>
                  {s.hint && <p className="text-[10px] text-muted-foreground/80 mt-0.5 truncate">{s.hint}</p>}
                </div>
              ))}
            />
          </div>

          {/* Footer CTAs */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-border/30 bg-muted/20">
            {cta ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); cta.onClick(); }}
                className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md hover:bg-foreground/5 transition-colors"
                style={{ color: cfg.accent }}
              >
                {cta.label}
              </button>
            ) : <span />}
            {onExpand && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onExpand(); }}
                aria-label={`Expandir detalhes de ${title}`}
                className="p-1 rounded-md hover:bg-foreground/5 transition-colors text-muted-foreground hover:text-foreground"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
