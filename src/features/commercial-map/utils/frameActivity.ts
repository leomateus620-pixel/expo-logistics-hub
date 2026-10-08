/** Explicit requests for the next animated frame, independent of camera motion.
 * No timers, React updates, GPU queries or allocations in the frame loop. */
export const COMMERCIAL_MAP_ANIMATION = { environment: 1, rain: 2, rides: 4, visit: 8 } as const;
export const COMMERCIAL_MAP_PRESENTATION_EVENT = 'commercial-map-presentation';
interface Activity { requested: number; path: 'direct' | 'post' | null; frames: number; presentationVisible: boolean }
const activity = new WeakMap<object, Activity>();
export function commercialMapFrameActivity(renderer: object): Activity {
  let value = activity.get(renderer);
  if (!value) { value = { requested: 0, path: null, frames: 0, presentationVisible: true }; activity.set(renderer, value); }
  return value;
}
export function requestCommercialMapAnimationFrame(renderer: object, invalidate: () => void, reason: number) {
  const value = commercialMapFrameActivity(renderer);
  if (!value.presentationVisible) return;
  value.requested |= reason;
  invalidate();
}
export function setCommercialMapPresentationVisible(renderer: object, visible: boolean) {
  const value = commercialMapFrameActivity(renderer);
  value.presentationVisible = visible;
  if (!visible) value.requested = 0;
}
export function isCommercialMapPresentationVisible(renderer: object) {
  return commercialMapFrameActivity(renderer).presentationVisible;
}
export function markCommercialMapPresentedFrame(renderer: object, path: 'direct' | 'post') {
  const value = commercialMapFrameActivity(renderer);
  value.path = path;
  value.frames += 1;
}
