/** Explicit requests for the next animated frame, independent of camera motion.
 * No timers, React updates, GPU queries or allocations in the frame loop. */
export const COMMERCIAL_MAP_ANIMATION = { environment: 1, rain: 2, rides: 4, visit: 8 } as const;
interface Activity { requested: number; path: 'direct' | 'post' | null; frames: number }
const activity = new WeakMap<object, Activity>();
export function commercialMapFrameActivity(renderer: object): Activity {
  let value = activity.get(renderer);
  if (!value) { value = { requested: 0, path: null, frames: 0 }; activity.set(renderer, value); }
  return value;
}
export function requestCommercialMapAnimationFrame(renderer: object, invalidate: () => void, reason: number) {
  commercialMapFrameActivity(renderer).requested |= reason;
  invalidate();
}
export function markCommercialMapPresentedFrame(renderer: object, path: 'direct' | 'post') {
  const value = commercialMapFrameActivity(renderer);
  value.path = path;
  value.frames += 1;
}
