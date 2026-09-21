export const PUBLIC_NAVIGATION_SAVE_EVENT = 'public-map-save-navigation';
export interface PublicNavigation {
  savedAt: number;
  position?: [number, number, number];
  target?: [number, number, number];
  zoom?: number;
  selectedLotId?: string | null;
  viewMode?: 'map' | 'list';
}
const key = () => 'public-map-navigation:' + window.location.pathname;
export function readPublicNavigation(): PublicNavigation | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key()) ?? 'null') as PublicNavigation | null;
    if (!value || Date.now() - value.savedAt > 10 * 60_000) return null;
    for (const vector of [value.position, value.target]) if (vector && (vector.length !== 3 || !vector.every(Number.isFinite))) return null;
    if (value.zoom !== undefined && (!Number.isFinite(value.zoom) || value.zoom <= 0 || value.zoom > 10)) return null;
    return value;
  } catch { return null; }
}
export function takePublicNavigation() {
  const value = readPublicNavigation();
  try { sessionStorage.removeItem(key()); } catch { /* storage unavailable */ }
  return value;
}
export function savePublicNavigation(part: Partial<PublicNavigation>) {
  try { sessionStorage.setItem(key(), JSON.stringify({ ...readPublicNavigation(), ...part, savedAt: Date.now() })); } catch { /* storage unavailable */ }
}
