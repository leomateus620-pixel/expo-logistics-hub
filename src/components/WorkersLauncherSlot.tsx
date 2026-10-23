import { useCallback } from 'react';
import { registerWorkersLauncherSlot, type WorkersLauncherSurface } from './workersLauncherPlacement';
import './workers-launcher.css';

/** Placement only: eligibility, unlock and the chat remain in one global launcher. */
export function WorkersLauncherSlot({ surface }: { surface: WorkersLauncherSurface }) {
  const ref = useCallback((node: HTMLSpanElement | null) => registerWorkersLauncherSlot(surface, node), [surface]);
  return <span ref={ref} className={`workers-launcher-slot workers-launcher-slot--${surface}`} data-workers-launcher-slot={surface} />;
}
