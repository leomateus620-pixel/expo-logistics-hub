import { useEffect, useState } from 'react';

interface MobileViewportState {
  height: number;
  offsetTop: number;
  keyboardOpen: boolean;
}

function readViewport(): MobileViewportState {
  const viewport = window.visualViewport;
  const height = Math.round(viewport?.height ?? window.innerHeight);
  const offsetTop = Math.round(viewport?.offsetTop ?? 0);
  return {
    height,
    offsetTop,
    keyboardOpen: height < window.innerHeight - 120,
  };
}

export function useMobileViewport() {
  const [viewport, setViewport] = useState<MobileViewportState>(() => (
    typeof window === 'undefined'
      ? { height: 0, offsetTop: 0, keyboardOpen: false }
      : readViewport()
  ));

  useEffect(() => {
    const visualViewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setViewport(readViewport()));
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    visualViewport?.addEventListener('resize', update);
    visualViewport?.addEventListener('scroll', update);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      visualViewport?.removeEventListener('resize', update);
      visualViewport?.removeEventListener('scroll', update);
    };
  }, []);

  return viewport;
}
