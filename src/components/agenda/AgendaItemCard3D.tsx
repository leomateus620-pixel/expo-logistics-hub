import { useRef, useState, useCallback } from 'react';
import { MapPin, User, Users, Sun, Sunset, Moon, ChevronRight, Truck, CalendarClock, CheckCircle2, Car } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn, rawTime } from '@/lib/utils';
import { WeatherMiniSummary } from '@/components/weather/WeatherMiniSummary';

type Shift = 'manha' | 'tarde' | 'noite';

const shiftIcon: Record<Shift, typeof Sun> = { manha: Sun, tarde: Sunset, noite: Moon };
const shiftLabel: Record<Shift, string> = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };

// Differentiated accent gradients per shift — uses only project tokens + tonal HSL derivations
const shiftAccent: Record<Shift, string> = {
  manha: 'from-gold via-gold/85 to-[hsl(40_95%_60%)]',
  tarde: 'from-[hsl(28_90%_55%)] via-gold/75 to-primary/70',
  noite: 'from-primary via-primary/80 to-[hsl(220_55%_45%)]',
};

// Glow color per shift (used in box-shadow accents)
const shiftGlow: Record<Shift, string> = {
  manha: '0 0 16px hsl(var(--gold)/0.55), 0 0 6px hsl(40_95%_60%/0.45)',
  tarde: '0 0 14px hsl(28_90%_55%/0.5), 0 0 6px hsl(var(--gold)/0.4)',
  noite: '0 0 16px hsl(var(--primary)/0.55), 0 0 6px hsl(220_55%_45%/0.4)',
};

const shiftIconAnim: Record<Shift, string> = {
  manha: 'animate-icon-spin-slow',
  tarde: 'animate-icon-glide',
  noite: 'animate-pulse',
};

const transportStatusBadge: Record<string, { label: string; cls: string; icon?: typeof CheckCircle2 }> = {
  pendente: { label: 'Pendente', cls: 'bg-info/15 text-info border-info/30' },
  em_andamento: { label: 'Em trânsito', cls: 'bg-gold/20 text-gold border-gold/40 animate-gold-pulse' },
  concluido: { label: 'Concluído', cls: 'bg-success/15 text-success border-success/30', icon: CheckCircle2 },
};

export interface AgendaItemCard3DProps {
  item: any;
  shift: Shift;
  index: number;
  isCurrent: boolean;
  member?: { nome_exibicao?: string; cargo?: string; commission_id?: string } | null;
  commission?: { nome?: string } | null;
  onOpen: (item: any) => void;
}

export function AgendaItemCard3D({ item, shift, index, isCurrent, member, commission, onOpen }: AgendaItemCard3DProps) {
  const cardRef = useRef<HTMLButtonElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, hover: false });
  const isTransport = item._source === 'transport';
  const ShiftIcon = shiftIcon[shift];

  const handleMouseMove = useCallback((ev: React.MouseEvent<HTMLButtonElement>) => {
    const el = cardRef.current;
    if (!el) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = el.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width;
    const y = (ev.clientY - rect.top) / rect.height;
    // ±10deg expressive tilt
    setTilt({ rx: (0.5 - y) * 10, ry: (x - 0.5) * 10, hover: true });
  }, []);

  const handleMouseEnter = useCallback(() => setTilt((t) => ({ ...t, hover: true })), []);
  const handleMouseLeave = useCallback(() => setTilt({ rx: 0, ry: 0, hover: false }), []);

  const statusBadge = isTransport ? transportStatusBadge[item._transportStatus] : null;
  const StatusIcon = statusBadge?.icon;

  // Drop shadow that follows the tilt direction
  const dropShadow = tilt.hover
    ? `drop-shadow(${tilt.ry * 0.6}px ${(-tilt.rx + 6) * 1.2}px 18px hsl(var(--primary)/0.4))`
    : 'none';

  return (
    <div
      className="group/card-wrap [perspective:1400px] motion-reduce:[perspective:none]"
      style={{
        animation: 'card-enter-3d 0.55s cubic-bezier(0.22,1,0.36,1) both',
        animationDelay: `${index * 60}ms`,
        filter: dropShadow,
        transition: 'filter 200ms ease-out',
      }}
    >
      <button
        ref={cardRef}
        type="button"
        onClick={() => onOpen(item)}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          'relative w-full text-left rounded-2xl overflow-hidden cursor-pointer outline-none',
          'transition-transform duration-200 ease-out will-change-transform',
          '[transform-style:preserve-3d] motion-reduce:[transform-style:flat]',
          'active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary/60',
        )}
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
        }}
      >
        {/* LAYER 1 — solid base + dual radial gradient (richer saturation) */}
        <div
          className={cn(
            'absolute inset-0 rounded-2xl',
            'bg-card/55 backdrop-blur-2xl',
            'border border-white/15',
          )}
          style={{
            boxShadow: isCurrent
              ? '0 1px 0 hsl(var(--gold)/0.3) inset, 0 0 0 1px hsl(var(--gold)/0.22) inset, 0 0 0 1px hsl(var(--primary)/0.4) inset, 0 22px 48px -20px hsl(var(--primary)/0.65), 0 8px 18px -8px hsl(0 0% 0%/0.45)'
              : '0 1px 0 hsl(0 0% 100%/0.1) inset, 0 0 0 1px hsl(var(--gold)/0.18) inset, 0 14px 32px -16px hsl(0 0% 0%/0.5), 0 4px 12px -6px hsl(0 0% 0%/0.35)',
          }}
        />
        {/* Radial overlay 1 (top-left primary glow) */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at top left, hsl(var(--primary)/0.28), transparent 55%)' }}
        />
        {/* Radial overlay 2 (bottom-right gold glow) */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at bottom right, hsl(var(--gold)/0.22), transparent 60%)' }}
        />

        {/* LAYER 2 — side accent light bar (per-shift identity) */}
        <div
          className={cn('absolute left-0 top-3 bottom-3 w-[6px] rounded-r-full bg-gradient-to-b', shiftAccent[shift])}
          style={{ boxShadow: shiftGlow[shift] }}
          aria-hidden
        />

        {/* LAYER 3 — diagonal shimmer on hover */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl motion-reduce:hidden" aria-hidden>
          <div className="absolute -inset-y-2 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/18 to-transparent opacity-0 group-hover/card-wrap:opacity-100 group-hover/card-wrap:animate-shimmer-diagonal" />
        </div>

        {/* LAYER 4 — content */}
        <div className="relative flex gap-3 p-4 pl-5">
          {/* Floating time block — jumps higher on hover */}
          <div
            className={cn(
              'relative flex flex-col items-center justify-center shrink-0 w-[72px] py-2.5 rounded-xl',
              'bg-gradient-to-b from-card/85 to-card/45 backdrop-blur-xl border border-white/18',
              'transition-transform duration-300 group-hover/card-wrap:[transform:translateZ(28px)]',
              'motion-reduce:transform-none',
            )}
            style={{
              boxShadow:
                '0 1px 0 hsl(0 0% 100%/0.12) inset, 0 0 0 1px hsl(var(--gold)/0.15) inset, 0 8px 16px -6px hsl(0 0% 0%/0.45)',
            }}
          >
            <span
              className="text-base font-mono font-bold leading-none tracking-tight text-foreground"
              style={{ textShadow: '0 0 10px hsl(var(--gold)/0.35)' }}
            >
              {rawTime(item.inicio_em)}
            </span>
            <span className="mt-1 text-[10px] font-mono text-muted-foreground/85">{rawTime(item.fim_em)}</span>
            <div className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/15 border border-primary/25">
              <ShiftIcon className={cn('w-2.5 h-2.5 text-gold', shiftIconAnim[shift], 'motion-reduce:animate-none')} />
              <span className="text-[8px] uppercase tracking-wider font-semibold text-foreground/85">{shiftLabel[shift]}</span>
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-start gap-2">
              {isTransport && (
                <div className="shrink-0 mt-0.5 w-6 h-6 rounded-lg bg-gradient-to-br from-primary/40 to-gold/25 border border-primary/35 flex items-center justify-center shadow-[0_0_10px_hsl(var(--primary)/0.35)]">
                  <Truck className="w-3 h-3 text-primary-foreground" />
                </div>
              )}
              <p className="text-sm font-semibold leading-snug text-foreground line-clamp-2 flex-1">{item.titulo}</p>
              <ChevronRight className="w-4 h-4 text-muted-foreground/60 shrink-0 transition-transform group-hover/card-wrap:translate-x-0.5 group-hover/card-wrap:text-gold" />
            </div>

            {item.descricao && <p className="text-xs text-muted-foreground/85 line-clamp-1">{item.descricao}</p>}

            <div className="flex items-center gap-2 flex-wrap pt-0.5">
              {item.local && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <MapPin className="w-3 h-3 text-gold/85" />
                  <span className="truncate max-w-[180px]">{item.local}</span>
                </span>
              )}
              {member && (
                <span className="inline-flex items-center gap-1 text-[10px] text-foreground/85">
                  <User className="w-3 h-3 text-foreground/75" />
                  {member.nome_exibicao}
                </span>
              )}
              {commission && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Users className="w-3 h-3" />
                  {commission.nome}
                </span>
              )}
              {!isTransport && item.tipo_tag && (
                <Badge variant="outline" className="text-[9px] py-0 h-4 bg-card/40 border-white/20 backdrop-blur">
                  {item.tipo_tag}
                </Badge>
              )}
              {isTransport && <WeatherMiniSummary transportId={item.id} />}
            </div>

            {/* Status row */}
            <div className="flex items-center gap-2 pt-1">
              {isCurrent && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success/15 border border-success/30 text-[9px] font-bold uppercase tracking-wider text-success">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 animate-ping motion-reduce:hidden" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                  </span>
                  Em andamento
                </span>
              )}
              {statusBadge && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider',
                    statusBadge.cls,
                  )}
                  style={{ boxShadow: '0 1px 0 hsl(0 0% 100%/0.08) inset, 0 4px 10px -4px hsl(0 0% 0%/0.4)' }}
                >
                  {StatusIcon && <StatusIcon className="w-2.5 h-2.5" />}
                  {statusBadge.label}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* LAYER 5 — top-edge highlight (more visible) */}
        <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-gold/55 to-transparent" aria-hidden />
      </button>
    </div>
  );
}

export function ShiftSectionHeader({ shift, count }: { shift: Shift; count: number }) {
  const Icon = shiftIcon[shift];
  return (
    <div className="flex items-center gap-2.5 mb-3 px-1">
      <div
        className={cn(
          'relative w-7 h-7 rounded-xl border border-white/15 flex items-center justify-center shadow-sm bg-gradient-to-br',
          shiftAccent[shift],
        )}
        style={{ boxShadow: shiftGlow[shift] }}
      >
        <Icon className="w-3.5 h-3.5 text-primary-foreground drop-shadow" />
      </div>
      <span className="text-xs font-bold uppercase tracking-[0.18em] bg-gradient-to-r from-primary-foreground via-foreground to-gold bg-clip-text text-transparent">
        {shiftLabel[shift]}
      </span>
      <div className={cn('flex-1 h-px bg-gradient-to-r to-transparent', shiftAccent[shift])} />
      <span className="text-[10px] font-mono text-muted-foreground tabular-nums">{count.toString().padStart(2, '0')}</span>
    </div>
  );
}

export const __agendaShiftMeta = { shiftIcon, shiftLabel };

// Re-export icon for parent use as CalendarClock alias if needed
export { CalendarClock };
