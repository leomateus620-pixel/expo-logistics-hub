import { Vector4 } from 'three';
import type { Coordinate, MapEntity } from '../../types';
import { publicAvailability } from '../../public/publicAvailability';
import type { PublicLot } from '../../public/publicMapTypes';
import { hasRevisedExporuralNumbers, lotNumberAnchor } from '../../utils/exporuralRevisionPresentation';
import { lotPresentationTop } from '../../utils/externalLotPresentation';
import { lotPointClearance, safeLotAnchor } from '../../utils/soldLotPresentation';
import { orientationFootprintFits } from '../../utils/territorialOrientation';
import type { PublicLabelRect, PublicMapLabelLayout } from './publicMapLabelLayout';

export const PUBLIC_NUMBER_HEIGHT = 18;
const VIEWPORT_INSET = 2;
const SURFACE_OFFSET = 0.12; // Clears the selection/hover lift and status lines.
const STATUS_PRIORITY = { AVAILABLE: 0, SOLD: 1, UNAVAILABLE: 2 } as const;

export function readPublicLotNumbers(lots: readonly PublicLot[]) {
  const result = new Map<string, { text: string; status: ReturnType<typeof publicAvailability> }>();
  for (const lot of lots) {
    const text = typeof lot.lotNumber === 'string' ? lot.lotNumber.trim() : '';
    if (text && !result.has(lot.entityId)) result.set(lot.entityId, { text, status: publicAvailability(lot.availability) });
  }
  return result;
}

export function preparePublicLotNumberSurfaces(inventoryEntities: readonly MapEntity[], renderedEntities: readonly MapEntity[]) {
  const rendered = new Set(renderedEntities.map(entity => entity.id));
  return inventoryEntities.flatMap(entity => {
    if (!rendered.delete(entity.id)) return [];
    const rings = entity.geometry.coordinates;
    const elevation = lotPresentationTop(entity) + SURFACE_OFFSET;
    if (!Number.isFinite(elevation)) return [];
    const safe = safeLotAnchor(rings);
    if (!safe) return [];
    const preferred = hasRevisedExporuralNumbers(entity) ? lotNumberAnchor(entity) : undefined;
    const clearance = preferred ? lotPointClearance(preferred, rings) : 0;
    const [x, z] = preferred && clearance > 0 ? preferred : safe.point;
    return [{ entityId: entity.id, rings, x, z, elevation, clearance: clearance > 0 ? clearance : safe.clearance,
      visible: false, detailed: false,
      rect: { x0: 0, y0: 0, x1: 0, y1: 0 }, ndc: new Vector4(), depthSlopeX: 0, depthSlopeY: 0 }];
  });
}

export type PublicLotNumberSurface = ReturnType<typeof preparePublicLotNumberSurfaces>[number];

export function comparePublicLotNumbers(a: { entityId: string; status: keyof typeof STATUS_PRIORITY },
  b: { entityId: string; status: keyof typeof STATUS_PRIORITY }) {
  return STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] || a.entityId.localeCompare(b.entityId, 'en');
}

/** Pull a screen rectangle back onto the lot plane. This tests the actual
 * useful space around the anchor, including concavities and holes, even if
 * other parts of the lot extend past the viewport or through the near plane. */
export function createPublicLotNumberProjector() {
  const point = new Vector4();
  const signs = [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const;
  const corners: Coordinate[] = signs.map(() => [0, 0]);

  function fits(surface: PublicLotNumberSurface, frame: PublicMapLabelLayout, halfWidth: number, halfHeight: number) {
    const { ndc, depthSlopeX, depthSlopeY, clearance, rings } = surface;
    let insideClearance = true;
    for (const [index, [sx, sy]] of signs.entries()) {
      const dx = sx * halfWidth * 2 / frame.width;
      const dy = sy * halfHeight * 2 / frame.height;
      const depth = ndc.z + dx * depthSlopeX + dy * depthSlopeY;
      if (Math.abs(depth) >= 1) return false;
      point.set(ndc.x + dx, ndc.y + dy, depth, 1).applyMatrix4(frame.inverseProjection);
      if (point.w <= 0) return false;
      const x = point.x / point.w;
      const z = point.z / point.w;
      corners[index][0] = x;
      corners[index][1] = z;
      insideClearance &&= (x - surface.x) ** 2 + (z - surface.z) ** 2 < clearance ** 2;
    }
    return insideClearance || orientationFootprintFits(corners, rings);
  }

  return (surface: PublicLotNumberSurface, frame: PublicMapLabelLayout, width: number, selected: boolean) => {
    const ndc = surface.ndc.set(surface.x, surface.elevation, surface.z, 1).applyMatrix4(frame.projection);
    if (ndc.w <= 0 || Math.abs(ndc.z) >= ndc.w) return false;
    ndc.divideScalar(ndc.w);
    const halfWidth = width / 2;
    const halfHeight = PUBLIC_NUMBER_HEIGHT / 2;
    const x = (ndc.x + 1) * frame.width / 2;
    const y = (1 - ndc.y) * frame.height / 2;
    const rect = surface.rect;
    rect.x0 = x - halfWidth; rect.x1 = x + halfWidth;
    rect.y0 = y - halfHeight; rect.y1 = y + halfHeight;
    if (rect.x0 < VIEWPORT_INSET || rect.y0 < VIEWPORT_INSET
      || rect.x1 > frame.width - VIEWPORT_INSET || rect.y1 > frame.height - VIEWPORT_INSET) return false;

    // Clip-space plane (inverse-transpose of the camera matrix applied to
    // [0, 1, 0, -elevation]). Its depth is affine across the screen rectangle.
    const e = frame.inverseProjection.elements;
    const planeZ = e[9] - surface.elevation * e[11];
    if (Math.abs(planeZ) < 1e-8) return false;
    surface.depthSlopeX = -(e[1] - surface.elevation * e[3]) / planeZ;
    surface.depthSlopeY = -(e[5] - surface.elevation * e[7]) / planeZ;

    const inset = selected ? (surface.visible ? 0.5 : 1) : (surface.visible ? 1.5 : 3);
    if (!fits(surface, frame, halfWidth + inset, halfHeight + inset)) return false;

    // Near the lot, a conflicting company caption can yield. Use a separate
    // hysteresis band so the name does not alternate with its parcel numbers.
    const detailScale = surface.detailed ? 1.55 : 1.9;
    surface.detailed = fits(surface, frame, halfWidth * detailScale, halfHeight * detailScale);
    return true;
  };
}
