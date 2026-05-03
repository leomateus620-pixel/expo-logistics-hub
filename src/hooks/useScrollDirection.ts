import { useEffect, useRef, useState } from 'react';

interface Options {
  delta?: number;
  activateAfter?: number;
}

/**
 * Lightweight scroll direction detector with rAF throttling and delta threshold.
 * Returns the current direction ('up' | 'down' | null) and current scrollY.
 */
export function useScrollDirection({ delta = 10, activateAfter = 0 }: Options = {}) {
  const [state, setState] = useState<{ direction: 'up' | 'down' | null; scrollY: number }>({
    direction: null,
    scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
  });

  const lastY = useRef(typeof window !== 'undefined' ? window.scrollY : 0);
  const ticking = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
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

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [delta, activateAfter]);

  return state;
}
