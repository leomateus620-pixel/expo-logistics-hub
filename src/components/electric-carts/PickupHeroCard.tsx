import { Zap, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';

interface Props {
  onClick: () => void;
  available: number;
  inUse: number;
}

/**
 * Hero CTA "Registrar Retirada" — Liquid Glass 3D card with pointer-driven tilt
 * and elastic spring snap-back. Adaptive to project palette (deep green + gold).
 */
export default function PickupHeroCard({ onClick, available, inUse }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, px: 50, py: 50, active: false });

  const handleMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const ry = (x - 0.5) * 12; // ±6°
    const rx = -(y - 0.5) * 10; // ±5°
    setTilt({ rx, ry, px: x * 100, py: y * 100, active: true });
  };

  const handleLeave = () => setTilt({ rx: 0, ry: 0, px: 50, py: 50, active: false });

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      aria-label="Registrar retirada de carrinho elétrico"
      onClick={onClick}
      onKeyDown={handleKey}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      style={{ perspective: '1200px' }}
      className="group relative w-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-3xl"
    >
      <div
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          transformStyle: 'preserve-3d',
          transition: tilt.active
            ? 'transform 120ms ease-out'
            : 'transform 520ms cubic-bezier(0.22, 1.4, 0.36, 1)',
        }}
        className={cn(
          'relative overflow-hidden rounded-3xl border border-primary/30',
          'bg-gradient-to-br from-primary/25 via-primary/10 to-accent/20',
          'backdrop-blur-2xl',
          'shadow-[0_20px_60px_-20px_hsl(var(--primary)/0.55),inset_0_1px_0_rgba(255,255,255,0.18)]',
          'min-h-[140px] sm:min-h-[160px]',
          'px-5 sm:px-7 py-5 sm:py-6 flex items-center gap-4 sm:gap-6',
          'active:scale-[0.985] motion-reduce:transform-none motion-reduce:transition-none'
        )}
      >
        {/* Pointer-following spotlight */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70 transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle at ${tilt.px}% ${tilt.py}%, hsl(var(--primary) / 0.28), transparent 55%)`,
          }}
        />
        {/* Halos */}
        <div className="pointer-events-none absolute -top-16 -right-10 w-56 h-56 blur-3xl opacity-70 bg-[radial-gradient(circle,hsl(var(--primary)/0.55),transparent_60%)] motion-safe:animate-halo-breath" />
        <div className="pointer-events-none absolute -bottom-20 -left-12 w-60 h-60 blur-3xl opacity-60 bg-[radial-gradient(circle,hsl(var(--accent)/0.45),transparent_60%)]" />
        {/* Glass sheen */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_55%)]" />
        {/* Shimmer sweep */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
          <div className="absolute top-0 -left-1/3 h-full w-1/3 bg-gradient-to-r from-transparent via-white/[0.10] to-transparent motion-safe:animate-cart-shimmer" />
        </div>

        {/* Icon pill — floats more (parallax) */}
        <div
          style={{ transform: 'translateZ(40px)' }}
          className="relative shrink-0 transition-transform"
        >
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center bg-gradient-to-br from-primary via-primary to-primary/70 text-primary-foreground shadow-[0_12px_32px_-8px_hsl(var(--primary)/0.7),inset_0_1px_0_rgba(255,255,255,0.25)]">
            <Zap className="w-8 h-8 sm:w-10 sm:h-10 drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]" />
            {available > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-80 motion-safe:animate-ping" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-accent border border-background" />
              </span>
            )}
          </div>
        </div>

        {/* Text — middle parallax */}
        <div
          style={{ transform: 'translateZ(24px)' }}
          className="relative flex-1 min-w-0"
        >
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.18em] text-primary/80">
            Toque para iniciar
          </p>
          <h2 className="text-xl sm:text-3xl font-extrabold tracking-tight leading-tight text-foreground">
            Registrar Retirada
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 truncate">
            <span className="font-semibold text-success">{available}</span> disponíveis
            <span className="opacity-50"> · </span>
            <span className="font-semibold text-accent">{inUse}</span> em uso
          </p>
        </div>

        {/* Chevron */}
        <div
          style={{ transform: 'translateZ(32px)' }}
          className="relative shrink-0 transition-transform"
        >
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-primary/15 border border-primary/30 backdrop-blur-sm flex items-center justify-center text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] group-hover:bg-primary/25 transition-all">
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 transition-transform duration-300 group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
