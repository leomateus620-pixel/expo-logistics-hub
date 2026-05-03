import { useEffect, useRef, useState, type RefObject } from 'react';

interface Options {
  delta?: number;
  activateAfter?: number;
  /** Optional scroll container. If null/undefined, uses window. */
  containerRef?: RefObject<HTMLElement | null>;
}

function readScrollTop(el?: HTMLElement | null): number {
  if (el && (el.scrollHeight > el.clientHeight)) return el.scrollTop;
  if (typeof window === 'undefined') return 0;
  // Use whichever reports the larger value (Safari quirks).
  return Math.max(
    window.scrollY || 0,
    document.documentElement?.scrollTop || 0,
    document.body?.scrollTop || 0,
    (document.scrollingElement as HTMLElement | null)?.scrollTop || 0,
  );
}

/**
 * Lightweight scroll direction detector with rAF throttling and delta threshold.
 * Listens on window AND on an optional container (covers Safari/iPhone quirks).
 */
export function useScrollDirection({ delta = 8, activateAfter = 0, containerRef }: Options = {}) {
  const [state, setState] = useState<{ direction: 'up' | 'down' | null; scrollY: number }>({
    direction: null,
    scrollY: 0,
  });

  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const container = containerRef?.current ?? null;

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = readScrollTop(container);
        const diff = y - lastY.current;
        if (Math.abs(diff) >= delta) {
          let dir: 'up' | 'down' | null = diff > 0 ? 'down' : 'up';
          if (dir === 'up' && y < activateAfter) dir = null;
          setState({ direction: dir, scrollY: y });
          lastY.current = y;
        } else {
          setState((s) => (s.scrollY === y ? s : { ...s, scrollY: y }));
        }
        ticking.current = false;
      });
    };

    // Init
    lastY.current = readScrollTop(container);
    setState({ direction: null, scrollY: lastY.current });

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    container?.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('scroll', onScroll, { capture: true } as any);
      container?.removeEventListener('scroll', onScroll);
    };
  }, [delta, activateAfter, containerRef]);

  return state;
}
