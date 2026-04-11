/**
 * GPS heading / bearing utilities
 */

/** Calculate bearing (0-360°) from point A to point B */
export function calculateHeading(
  prevLat: number, prevLng: number,
  currLat: number, currLng: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const dLng = toRad(currLng - prevLng);
  const lat1 = toRad(prevLat);
  const lat2 = toRad(currLat);

  const x = Math.sin(dLng) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return ((toDeg(Math.atan2(x, y)) % 360) + 360) % 360;
}

/** Smoothly interpolate between two headings (handles 0/360 wrap) */
export function smoothHeading(prev: number, next: number, factor = 0.3): number {
  let diff = next - prev;
  // Normalize to [-180, 180]
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return ((prev + diff * factor) % 360 + 360) % 360;
}

/** Minimum distance (meters) between two points to consider heading valid */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
