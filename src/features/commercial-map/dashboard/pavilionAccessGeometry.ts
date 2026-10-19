import type { DashboardAccessMarker } from './CommercialMiniMap';
import type { CommercialMiniMapGeometry } from './commercialDashboardGeometry';

/** Presentation symbols only; the official anchors stay at their persisted coordinates. */
export function projectPavilionAccessMarkers(geometry: CommercialMiniMapGeometry, accesses: readonly DashboardAccessMarker[]) {
  const placed: Array<readonly [number, number]> = [];
  return accesses.map(marker => {
    const [x, y] = geometry.project(marker.position);
    const horizontal = Math.abs(marker.outward[0]) > Math.abs(marker.outward[1]);
    const length = Math.hypot(...marker.outward) || 1;
    let iconX = x + marker.outward[0] / length * 25, iconY = y + marker.outward[1] / length * 25;
    while (placed.some(([px, py]) => Math.abs(px - iconX) < 30 && Math.abs(py - iconY) < 30)) {
      if (horizontal) iconY += 32; else iconX += 32;
    }
    placed.push([iconX, iconY]);
    return { ...marker, x, y, iconX, iconY, horizontal,
      bounds: { minX: Math.min(x - 3, iconX - 14), maxX: Math.max(x + 3, iconX + 14),
        minY: Math.min(y - 3, iconY - 14), maxY: Math.max(y + 3, iconY + 14) } };
  });
}
