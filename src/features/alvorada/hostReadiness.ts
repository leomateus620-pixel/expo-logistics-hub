/** Geometry readiness, independent of GPU capability and the authored clock. */
export interface AlvoradaHostFrame { width: number; height: number }
export const isUsableAlvoradaFrame = (frame: AlvoradaHostFrame) => (
  Number.isFinite(frame.width) && Number.isFinite(frame.height)
  && frame.width >= 2 && frame.height >= 2
);

/**
 * Two consecutive visible animation frames must agree before the first mount.
 * Subsequent resizes report geometry without revoking the mount latch. A zero
 * box suspends presentation; it never creates a new Canvas or resets time.
 */
export function observeAlvoradaHost(
  element: HTMLElement,
  onFrame: (frame: AlvoradaHostFrame, usable: boolean) => void,
  onStable: () => void,
) {
  let frameId = 0;
  let last: AlvoradaHostFrame | null = null;
  let stable = false;
  let disposed = false;
  const measure = () => {
    frameId = 0;
    if (disposed) return;
    const rect = element.getBoundingClientRect();
    const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
    const usable = element.isConnected && isUsableAlvoradaFrame(next);
    onFrame(next, usable);
    if (!stable && usable && !document.hidden) {
      if (last && last.width === next.width && last.height === next.height) {
        stable = true;
        onStable();
      } else {
        frameId = requestAnimationFrame(measure);
      }
    }
    last = usable && !document.hidden ? next : null;
  };
  const schedule = () => {
    if (!frameId && !disposed) frameId = requestAnimationFrame(measure);
  };
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  observer?.observe(element);
  window.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  // Do not synchronously mount in a layout effect, before the host has painted.
  schedule();
  return () => {
    disposed = true;
    cancelAnimationFrame(frameId);
    observer?.disconnect();
    window.removeEventListener('resize', schedule);
    document.removeEventListener('visibilitychange', schedule);
  };
}
