export type WorkersLauncherSurface = 'portal' | 'map' | 'agenda';
const slots = new Map<WorkersLauncherSurface, HTMLElement>();
const listeners = new Set<() => void>();
export const subscribeWorkersLauncherPlacement = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const workersLauncherSlot = (surface: WorkersLauncherSurface | null) => surface ? slots.get(surface) ?? null : null;
export function registerWorkersLauncherSlot(surface: WorkersLauncherSurface, node: HTMLElement | null) {
  if (node) slots.set(surface, node); else slots.delete(surface);
  listeners.forEach(listener => listener());
}
