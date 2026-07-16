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
 * and elastic spring snap-back. Compact, full-width, high-contrast info chips.
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
    const ry = (x - 0.5) * 8; // ±4°
    const rx = -(y - 0.5) * 6; // ±3°
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
      className="group relative w-full cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-2xl"
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
          'relative overflow-hidden rounded-2xl border border-primary/30',
          'bg-gradient-to-br from-primary/25 via-primary/10 to-accent/20',
          'backdrop-blur-2xl',
          'shadow-[0_16px_44px_-18px_oklch(var(--primary)/0.55),inset_0_1px_0_rgba(255,255,255,0.18)]',
          'min-h-[88px] sm:min-h-[112px]',
          'px-4 sm:px-6 py-3.5 sm:py-4 flex items-center gap-3 sm:gap-4',
          'active:scale-[0.985] motion-reduce:transform-none motion-reduce:transition-none'
        )}
      >
        {/* Pointer-following spotlight */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70 transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle at ${tilt.px}% ${tilt.py}%, oklch(var(--primary) / 0.28), transparent 55%)`,
          }}
        />
        {/* Halos */}
        <div className="pointer-events-none absolute -top-10 -right-8 w-40 h-40 blur-3xl opacity-70 bg-[radial-gradient(circle,oklch(var(--primary)/0.55),transparent_60%)] motion-safe:animate-halo-breath" />
        <div className="pointer-events-none absolute -bottom-12 -left-8 w-44 h-44 blur-3xl opacity-60 bg-[radial-gradient(circle,oklch(var(--accent)/0.45),transparent_60%)]" />
        {/* Glass sheen */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_55%)]" />
        {/* Shimmer sweep */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div className="absolute top-0 -left-1/3 h-full w-1/3 bg-gradient-to-r from-transparent via-white/[0.10] to-transparent motion-safe:animate-cart-shimmer" />
        </div>

        {/* Icon pill — floats more (parallax) */}
        <div
          style={{ transform: 'translateZ(28px)' }}
          className="relative shrink-0 transition-transform"
        >
          <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-primary via-primary to-primary/70 text-primary-foreground shadow-[0_10px_24px_-8px_oklch(var(--primary)/0.7),inset_0_1px_0_rgba(255,255,255,0.25)]">
            <Zap className="w-6 h-6 sm:w-7 sm:h-7 drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]" />
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
          style={{ transform: 'translateZ(16px)' }}
          className="relative flex-1 min-w-0"
        >
          <p className="hidden sm:block text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
            Toque para iniciar
          </p>
          <h2 className="text-base sm:text-xl font-extrabold tracking-tight leading-tight text-foreground">
            Registrar Retirada
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-success/15 text-success border border-success/40">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              {available} disponíveis
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-accent/20 text-accent-foreground dark:text-accent border border-accent/40">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              {inUse} em uso
            </span>
          </div>
        </div>

        {/* Chevron */}
        <div
          style={{ transform: 'translateZ(22px)' }}
          className="relative shrink-0 transition-transform"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary/15 border border-primary/30 backdrop-blur-sm flex items-center justify-center text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] group-hover:bg-primary/25 transition-all">
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300 group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
