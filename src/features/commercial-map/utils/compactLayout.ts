/** Same breakpoint the dock uses to switch from the side rail to the bottom sheet. */
export const COMMERCIAL_MAP_COMPACT_QUERY = '(max-width: 720px), (max-width: 950px) and (max-height: 520px)';
export const COMMERCIAL_MAP_COMPACT_MAX_WIDTH = 720;

/**
 * Compact layout = no side dock: either the viewport media query matches or
 * the map shell itself is narrow. Read on demand (e.g. when a menu opens)
 * instead of subscribing, so header controls never re-render on resize.
 */
export function isCommercialMapCompactLayout(doc: Document = document) {
  const view = doc.defaultView;
  if (view?.matchMedia?.(COMMERCIAL_MAP_COMPACT_QUERY).matches) return true;
  const shell = doc.querySelector<HTMLElement>('.commercial-map-shell');
  const width = shell?.clientWidth ?? 0;
  return width > 0 && width <= COMMERCIAL_MAP_COMPACT_MAX_WIDTH;
}
