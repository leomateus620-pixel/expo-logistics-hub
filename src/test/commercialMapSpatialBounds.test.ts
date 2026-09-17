import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  COMMERCIAL_MAP_SPATIAL_BOUNDS as bounds, classifyCommercialMapPoint, clipContextRoad,
  clipContextPolygon, isProtectedCommercialMapRoad, spatialBoundsContain, commercialMapNavigationExtent,
} from '../features/commercial-map/data/commercialMapSpatialBounds';
import { TERRITORY_ROADS } from '../features/commercial-map/data/territorialRoads';
import { TERRITORY_BUILDINGS, TERRITORY_PATCHES, TERRITORY_TREES } from '../features/commercial-map/data/territorialEnvironment';
import { OFFICIAL_REFERENCE_DATA } from '../features/commercial-map/data/officialReference2026';
import { REAR_PARKING_SCENE_SUPPORT_POINTS } from '../features/commercial-map/data/rearParking';
import { LATERAL_DISTRICT_WORLD_BOUNDS } from '../features/commercial-map/data/lateralResidentialDistrict';
import { resolveCommercialMapCameraDistanceBounds, clampCommercialMapCameraPosition } from '../features/commercial-map/utils/viewport';

const before = JSON.parse(readFileSync('docs/validation/spatial-cleanup/before-inventory.json', 'utf8'));
describe('canonical Commercial Map spatial policy', () => {
  it('preserves every complete official entity, lot and calibration against main 42e89d1b', () => {
    const canonical = JSON.parse(readFileSync('docs/validation/spatial-cleanup/core-baseline.json', 'utf8'));
    const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    expect(OFFICIAL_REFERENCE_DATA.entities.map(e => ({ id: e.publicIdentifier, sha256: hash(e) }))).toEqual(canonical.entities);
    expect(hash(OFFICIAL_REFERENCE_DATA.lots)).toBe(canonical.lots);
    expect(hash(OFFICIAL_REFERENCE_DATA.calibration)).toBe(canonical.calibration);
  });
  it('contains every canonical park footprint, rear parking and authored lateral district', () => {
    for (const e of OFFICIAL_REFERENCE_DATA.entities) for (const point of e.geometry.coordinates.flat()) {
      expect(classifyCommercialMapPoint(point), e.publicIdentifier).toBe('CORE');
    }
    REAR_PARKING_SCENE_SUPPORT_POINTS.forEach(p => expect(classifyCommercialMapPoint(p.position)).toBe('CORE'));
    const d = LATERAL_DISTRICT_WORLD_BOUNDS;
    expect(classifyCommercialMapPoint([d.minX, d.minZ])).toBe('CORE');
    expect(classifyCommercialMapPoint([d.maxX, d.maxZ])).toBe('CORE');
    expect(classifyCommercialMapPoint([70, 20])).toBe('NEAR_CONTEXT');
    expect(classifyCommercialMapPoint([-140, 100])).toBe('REMOVABLE_FAR_CONTEXT');
  });
  it('preserves protected highway/access vertices and widths exactly, including distant junctions', () => {
    for (const road of before.roads.filter(isProtectedCommercialMapRoad)) {
      expect(TERRITORY_ROADS.find(r => r.id === road.id), road.id).toEqual(road);
    }
    expect(TERRITORY_ROADS.some(r => r.id === 'osm-321026944-0')).toBe(true);
    expect(TERRITORY_ROADS.some(r => r.id === 'arena-br472-access')).toBe(true);
    for (const road of before.roads.filter((r: { points: [number, number][] }) => r.points.every(p => spatialBoundsContain(bounds.nearContextBounds, p)))) {
      expect(TERRITORY_ROADS.find(r => r.id === road.id), road.id).toEqual(road);
    }
    for (const road of TERRITORY_ROADS.filter(r => !isProtectedCommercialMapRoad(r))) {
      road.points.forEach(p => expect(spatialBoundsContain(bounds.nearContextBounds, p), road.id).toBe(true));
    }
    expect(TERRITORY_ROADS.length).toBeLessThan(before.roads.length / 2);
  });
  it('clips crossing segments without discarding near streets or connecting separate fragments', () => {
    const result = clipContextRoad({ id: 'crossing', points: [[-150, 0], [150, 0]] as const });
    expect(result).toHaveLength(1);
    expect(result[0].points).toEqual([[bounds.nearContextBounds.minX, 0], [bounds.nearContextBounds.maxX, 0]]);
    const reentry = clipContextRoad({ id: 'reentry', points: [[0, 0], [150, 0], [150, 100], [0, 10]] as const });
    expect(reentry).toHaveLength(2);
    expect(clipContextRoad({ id: 'far', points: [[150, 0], [160, 30]] })).toEqual([]);
    expect(clipContextPolygon([[-10, 110], [10, 110], [10, 125], [-10, 125]])).toEqual([]);
  });
  it('never generates distant buildings, canopy instances or removable ponds', () => {
    expect(TERRITORY_BUILDINGS.length).toBeGreaterThan(5);
    expect(TERRITORY_BUILDINGS.length).toBeLessThan(before.buildings.length * .25);
    expect(TERRITORY_TREES.length).toBeGreaterThan(20);
    expect(TERRITORY_TREES.length).toBeLessThan(before.trees.length * .3);
    TERRITORY_BUILDINGS.forEach(b => {
      expect(classifyCommercialMapPoint(b.center, Math.hypot(...b.size) / 2), b.id).not.toBe('REMOVABLE_FAR_CONTEXT');
      expect(b).toEqual(before.buildings.find((p: { id: string }) => p.id === b.id));
    });
    TERRITORY_TREES.forEach(t => expect(classifyCommercialMapPoint(t.center, t.radius)).not.toBe('REMOVABLE_FAR_CONTEXT'));
    expect(TERRITORY_PATCHES.filter(p => p.kind === 'water')).toHaveLength(0);
    TERRITORY_PATCHES.forEach(p => p.ring.forEach(v => expect(spatialBoundsContain(bounds.nearContextBounds, v)).toBe(true)));
  });
  it.each([[1920,1080],[1366,768],[1024,768],[390,844],[844,390]])('fits the whole park and safe context at %sx%s and clamps excessive dolly', (width, height) => {
    const extent = commercialMapNavigationExtent({ ...bounds.coreBounds, maxHeight: 10 });
    const camera = resolveCommercialMapCameraDistanceBounds({ bounds: extent, verticalFovDegrees: 38, aspect: width / height });
    expect(camera.maxDistance).toBeGreaterThanOrEqual(camera.fittedDistance);
    expect(camera.maxDistance).toBeLessThan(camera.fittedDistance * 1.36);
    expect(camera.minDistance).toBeLessThan(extent.width / 4);
    const clamped = clampCommercialMapCameraPosition({ position: [0, 5000, 5000], target: [0, 0, 0], ...camera });
    expect(clamped.distance).toBe(camera.maxDistance);
  });
});
