import { useEffect, useRef, useState, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  screens: ReactNode[];
  intervalMs?: number;
  ariaLabel?: string;
}

/** Premium internal rotator: auto-advances 5s, pauses on hover/touch, supports swipe + dots. */
export default function MetricCardRotator({ screens, intervalMs = 5000, ariaLabel }: Props) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const reduced = useRef(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    if (paused || reduced.current || screens.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % screens.length), intervalMs);
    return () => clearInterval(t);
  }, [paused, screens.length, intervalMs]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
    setPaused(true);
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40) setIdx(i => (i + (dx < 0 ? 1 : -1) + screens.length) % screens.length);
    touchX.current = null;
    setTimeout(() => setPaused(false), 4000);
  };

  if (!screens.length) return null;
  return (
    <div
      className="relative w-full overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      aria-label={ariaLabel}
      aria-live="polite"
    >
      <div className="relative">
        {screens.map((s, i) => (
          <div
            key={i}
            className={cn(
              'transition-all duration-500 ease-out',
              i === idx ? 'opacity-100 translate-y-0 relative' : 'opacity-0 translate-y-2 absolute inset-0 pointer-events-none',
            )}
          >
            {s}
          </div>
        ))}
      </div>
      {screens.length > 1 && (
        <div className="flex items-center justify-center gap-1 mt-2" role="tablist">
          {screens.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={(e) => { e.stopPropagation(); setIdx(i); setPaused(true); setTimeout(() => setPaused(false), 4000); }}
              role="tab"
              aria-selected={i === idx}
              aria-label={`Ver tela ${i + 1}`}
              className={cn(
                'rounded-full transition-all duration-300',
                i === idx ? 'w-4 h-1 bg-foreground/70' : 'w-1 h-1 bg-foreground/25 hover:bg-foreground/50',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
