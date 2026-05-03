import { useEffect, useRef, useState } from 'react';

interface Options {
  /** Minimum px change between rAF samples to even consider a direction. */
  delta?: number;
  /** Minimum accumulated px in opposite direction before flipping `direction`. Prevents flicker from mobile address-bar adjustments. */
  minTravel?: number;
  /** Below this scrollY, force `direction = null` (treated as "at top"). */
  activateAfter?: number;
}

function readScrollTop(): number {
  if (typeof window === 'undefined') return 0;
  const y = Math.max(
    window.scrollY || 0,
    document.documentElement?.scrollTop || 0,
    (document.scrollingElement as HTMLElement | null)?.scrollTop || 0,
  );
  return y < 0 ? 0 : y; // ignore iOS overscroll
}

/**
 * Stable scroll direction detector.
 * - Single passive window listener.
 * - rAF throttled.
 * - Hysteresis via `minTravel`: only flips direction after enough travel
 *   in the opposite sense, killing the "shake" caused by mobile address-bar.
 */
export function useScrollDirection({
  delta = 24,
  minTravel = 60,
  activateAfter = 0,
}: Options = {}) {
  const [state, setState] = useState<{ direction: 'up' | 'down' | null; scrollY: number }>({
    direction: null,
    scrollY: 0,
  });

  const lastY = useRef(0);
  const dirRef = useRef<'up' | 'down' | null>(null);
  const travelRef = useRef(0); // accumulated travel in current candidate direction
  const candidateRef = useRef<'up' | 'down' | null>(null);
  const ticking = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = readScrollTop();
        const diff = y - lastY.current;

        if (Math.abs(diff) >= delta) {
          const instant: 'up' | 'down' = diff > 0 ? 'down' : 'up';

          if (instant === dirRef.current) {
            // same as committed direction → reset candidate accumulator
            candidateRef.current = null;
            travelRef.current = 0;
          } else {
            // accumulating opposite-direction travel
            if (candidateRef.current !== instant) {
              candidateRef.current = instant;
              travelRef.current = 0;
            }
            travelRef.current += Math.abs(diff);
            if (travelRef.current >= minTravel) {
              dirRef.current = instant;
              candidateRef.current = null;
              travelRef.current = 0;
            }
          }

          lastY.current = y;

          let committed = dirRef.current;
          if (committed === 'up' && y < activateAfter) committed = null;

          setState((prev) => {
            if (prev.direction === committed && Math.abs(prev.scrollY - y) < delta) return prev;
            return { direction: committed, scrollY: y };
          });
        } else {
          // Tiny noise — still update scrollY occasionally for consumers.
          setState((prev) => (Math.abs(prev.scrollY - y) >= delta ? { ...prev, scrollY: y } : prev));
        }
        ticking.current = false;
      });
    };

    lastY.current = readScrollTop();
    setState({ direction: null, scrollY: lastY.current });

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [delta, minTravel, activateAfter]);

  return state;
}
