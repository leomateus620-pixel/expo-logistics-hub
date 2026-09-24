import { describe, expect, it } from 'vitest';
import { safeLotAnchor, lotPointClearance, placeSoldLock, soldLotSurfaceColor, isSoldLot } from '@/features/commercial-map/utils/soldLotPresentation';
import { createSoldLockGeometry } from '@/features/commercial-map/utils/soldLockGeometry';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { STATUS_CONFIG } from '@/features/commercial-map/constants';
import type { Coordinate } from '@/features/commercial-map/types';

const rectangle: Coordinate[] = [[0, 0], [10, 0], [10, 6], [0, 6]];
describe('official SOLD presentation', () => {
  it('uses only SOLD, including reversal to every other commercial status', () => {
    for (const status of ['AVAILABLE', 'SOLD', 'RESERVED', 'IN_NEGOTIATION', 'BLOCKED', 'UNAVAILABLE'] as const) {
      expect(isSoldLot(status)).toBe(status === 'SOLD');
      expect(soldLotSurfaceColor(status)).toBe(status === 'SOLD' ? STATUS_CONFIG.SOLD.color : null);
    }
  });
  it('finds an interior anchor in a concave C polygon whose centroid lies outside', () => {
    const c: Coordinate[] = [[0,0], [8,0], [8,1], [1,1], [1,7], [8,7], [8,8], [0,8]];
    const anchor = safeLotAnchor([c])!;
    expect(lotPointClearance(anchor.point, [c])).toBeGreaterThan(0.45);
    expect(lotPointClearance([4,4], [c])).toBeLessThan(0);
  });
  it('keeps the whole footprint away from holes and constructions', () => {
    const hole: Coordinate[] = [[3,2], [7,2], [7,4], [3,4]];
    const building: Coordinate[] = [[0,0], [2,0], [2,6], [0,6]];
    const placement = placeSoldLock({ id: 'lot', status: 'SOLD', geometry: { coordinates: [rectangle, hole], elevation: 2, extrusionHeight: 0.5 } }, [building])!;
    const [x,y,z] = placement.position;
    expect(lotPointClearance([x,z], [rectangle,hole], [building])).toBeGreaterThan(placement.scale * 0.7);
    expect(y).toBeCloseTo(2.543);
  });
  it('scales down for tiny/narrow lots instead of expanding beyond their boundaries', () => {
    for (const width of [0.01, 0.1, 1, 10, 100]) {
      const ring = rectangle.map(([x,z]) => [x * width, z * width] as Coordinate);
      const p = placeSoldLock({ id: 'lot', status: 'SOLD', geometry: { coordinates: [ring], elevation: 0, extrusionHeight: .025 } })!;
      expect(p.scale).toBeLessThanOrEqual(1.2);
      expect(p.scale * .7).toBeLessThan(p.clearance);
      expect(p.position[1]).toBeCloseTo(.043);
    }
  });
  it('rejects unusable geometry without placing a marker outside the lot', () => {
    expect(safeLotAnchor([])).toBeNull();
    expect(safeLotAnchor([[[0,0],[0,1],[0,2]]])).toBeNull();
    expect(safeLotAnchor([rectangle], [rectangle])).toBeNull();
    expect(safeLotAnchor([rectangle, [[NaN,0],[1,1],[2,0]]])).toBeNull();
  });
  it('respects an off-centre number-safe anchor and falls back if it is outside', () => {
    const surface = { id: 'module', status: 'SOLD' as const, geometry: { coordinates: [rectangle], elevation: 0, extrusionHeight: .02 } };
    const offset = placeSoldLock({ ...surface, preferredAnchor: [8, 3] })!;
    expect([offset.position[0], offset.position[2]]).toEqual([8, 3]);
    expect(offset.scale * .7).toBeLessThan(offset.clearance);
    const fallback = placeSoldLock({ ...surface, preferredAnchor: [12, 3] })!;
    expect(lotPointClearance([fallback.position[0], fallback.position[2]], [rectangle])).toBeGreaterThan(0);
  });
  it('fits all valid cadastral lot polygons in the canonical reference inventory', () => {
    const lotIds = new Set(OFFICIAL_REFERENCE_DATA.lots.map(lot => lot.entityId));
    const lots = OFFICIAL_REFERENCE_DATA.entities.filter(entity => lotIds.has(entity.id));
    expect(lots.length).toBeGreaterThan(100);
    for (const entity of lots) {
      const placement = placeSoldLock({ id: entity.id, status: 'SOLD', geometry: entity.geometry });
      expect(placement, entity.publicIdentifier).not.toBeNull();
      expect(placement!.scale * .7, entity.publicIdentifier).toBeLessThan(placement!.clearance);
    }
  });
  it('uses a single bounded low-poly vertex-coloured model without textures or groups', () => {
    const geometry = createSoldLockGeometry();
    expect(geometry.groups).toHaveLength(0);
    expect(geometry.getAttribute('position').count / 3).toBeLessThan(220);
    expect(geometry.getAttribute('color').count).toBe(geometry.getAttribute('position').count);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.y).toBeGreaterThanOrEqual(-0.000001);
    expect(geometry.boundingBox!.max.y).toBeLessThan(.26);
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) expect(Math.hypot(positions.getX(i), positions.getZ(i))).toBeLessThan(.7);
    geometry.dispose();
  });
});
