import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Box3, Group } from 'three';
import polygonClipping, { type Polygon } from 'polygon-clipping';
import { createSoyMachineFleet } from '@/features/commercial-map/harvest/models/soyMachines';
import { sampleSoyTruckPath, SOY_TRUCK_PATH_LENGTH } from '@/features/commercial-map/harvest/SoyHarvestScene';
import { sampleSoyCycle, sampleSoyWorkPath, soyTransportDistance } from '@/features/commercial-map/harvest/soyHarvestTimeline';
import { SOY_HARVEST_LAYOUT as layout } from '@/features/commercial-map/data/soyHarvestLayout';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';
import { COMMERCIAL_MAP_TREES } from '@/features/commercial-map/data/commercialTrees';
import { REAR_PARKING_ROWS, REAR_PARKING_CIRCULATION, reconcileRearParkingTrees } from '@/features/commercial-map/data/rearParking';
import { buildRearTreeInstances } from '@/features/commercial-map/data/rearParkEnvironment';
import { TERRITORY_BUILDINGS, TERRITORY_TREES } from '@/features/commercial-map/data/territorialEnvironment';
import { TERRITORY_ROADS } from '@/features/commercial-map/data/territorialRoads';
import { parkingBounds, parkingConvexHull, parkingCorridorPolygon, parkingDistanceToPolygon, parkingPolygonArea, type ParkingBounds, type ParkingPoint, type ParkingPolygon } from '@/features/commercial-map/utils/parkingGeometry';
import type { MapEntity } from '@/features/commercial-map/types';
import replay from '../../scripts/exporural/official-2026-10-20/replay-data.json';

// Match the current October review harness: replace old R/S parcels, not an
// overlay of stale and current cadastral rings that could hide a missed check.
const currentCodes = new Set(replay.after.entities.map(entity => entity.publicIdentifier));
const entities = [
  ...OFFICIAL_REFERENCE_DATA.entities.filter(entity => !currentCodes.has(entity.publicIdentifier)
    && !/^Q-[RS]-/.test(entity.publicIdentifier)
    && !['RUA-LESTE-EXPORURAL', 'RUA-UBIRETAMA-LATERAL-R55'].includes(entity.publicIdentifier)),
  ...replay.after.entities,
] as unknown as MapEntity[];
const protectedPolygons = [
  ...entities.filter(entity => entity.isSellable || ['ROAD', 'PAVILION', 'BUILDING', 'RESTROOM', 'LIVESTOCK_AREA', 'ATTRACTION'].includes(entity.classification))
    .map(entity => ({ id: entity.publicIdentifier, polygon: entity.geometry.coordinates[0] as ParkingPolygon })),
  ...[...REAR_PARKING_ROWS, ...REAR_PARKING_CIRCULATION].map(item => ({ id: item.id, polygon: item.polygon })),
].map(item => ({ ...item, bounds: parkingBounds(item.polygon) }));
const protectedTrees = [
  ...TERRITORY_TREES.map((tree, index) => ({ id: `territory-tree-${index}`, center: tree.center, radius: tree.radius })),
  ...[...COMMERCIAL_MAP_TREES, ...reconcileRearParkingTrees(COMMERCIAL_MAP_TREES, entities)]
    .map(tree => ({ id: tree.id, center: tree.position, radius: tree.canopyRadius })),
  ...buildRearTreeInstances().map((tree, index) => ({ id: `rear-tree-${index}`, center: [tree.x, tree.z] as ParkingPoint, radius: tree.scale })),
];
const polygon = (ring: ParkingPolygon): Polygon => [ring.map(point => [point[0], point[1]])];
const area = (polygons: ReturnType<typeof polygonClipping.intersection>) => polygons.reduce((sum, shape) => sum
  + shape.reduce((total, ring, index) => total + parkingPolygonArea(ring) * (index === 0 ? 1 : -1), 0), 0);
const overlaps = (a: ParkingBounds, b: ParkingBounds) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
function footprint(bounds: Box3, x: number, z: number, heading: number): ParkingPolygon {
  const cosine = Math.cos(heading), sine = Math.sin(heading);
  return [[bounds.min.x, bounds.min.z], [bounds.max.x, bounds.min.z], [bounds.max.x, bounds.max.z], [bounds.min.x, bounds.max.z]]
    .map(([localX, localZ]) => [x + cosine * localX + sine * localZ, z - sine * localX + cosine * localZ] as ParkingPoint);
}
function localBounds(group: Group) {
  group.position.set(0, 0, 0); group.rotation.set(0, 0, 0); group.updateMatrixWorld(true);
  return new Box3().setFromObject(group);
}
function exclusions(ring: ParkingPolygon) {
  const bounds = parkingBounds(ring), collisions: string[] = [];
  for (const item of protectedPolygons) if (overlaps(bounds, item.bounds)
    && area(polygonClipping.intersection(polygon(ring), polygon(item.polygon))) > 1e-7) collisions.push(item.id);
  for (const tree of protectedTrees) {
    if (tree.center[0] + tree.radius < bounds.minX || tree.center[0] - tree.radius > bounds.maxX
      || tree.center[1] + tree.radius < bounds.minZ || tree.center[1] - tree.radius > bounds.maxZ) continue;
    if (parkingDistanceToPolygon(tree.center, ring) < tree.radius - 1e-6) collisions.push(tree.id);
  }
  for (const building of TERRITORY_BUILDINGS) if (parkingDistanceToPolygon(building.center, ring) < Math.hypot(...building.size) / 2) collisions.push(building.id);
  return collisions;
}
beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
  fillStyle: '', font: '', fillRect: vi.fn(), fillText: vi.fn(),
} as unknown as CanvasRenderingContext2D); });
afterEach(() => vi.restoreAllMocks());

describe('actual machine envelopes on the October scene', () => {
  it('sweeps the complete truck on its runtime spline and playback timeline clear of protected geometry', () => {
    const fleet = createSoyMachineFleet(), bounds = localBounds(fleet.truck.group);
    const conflicts: unknown[] = [];
    // Arc-length samples cover the rapid final ellipse too. The actual timeline
    // samples additionally cover the exact departure and 48-second endpoint.
    const progresses = [...Array.from({ length: 501 }, (_, index) => index / 500),
      ...Array.from({ length: 401 }, (_, index) => soyTransportDistance(44 + index / 100, SOY_TRUCK_PATH_LENGTH) / SOY_TRUCK_PATH_LENGTH)].sort((a, b) => a - b);
    let previous: ParkingPolygon | null = null;
    for (const progress of progresses) {
      const pose = sampleSoyTruckPath(progress, { x: 0, z: 0, heading: 0 });
      const current = footprint(bounds, pose.x, pose.z, pose.heading);
      // Convex hull conservatively includes space between successive poses.
      const swept = previous ? parkingConvexHull([...previous, ...current]) : current;
      const hits = exclusions(swept);
      if (hits.length) conflicts.push({ progress, x: pose.x, z: pose.z, hits });
      previous = current;
    }
    fleet.dispose();
    expect(conflicts.slice(0, 8)).toEqual([]);
  });

  it('keeps the complete truck within the reserved headland, access corridor and destination asphalt', () => {
    const fleet = createSoyMachineFleet(), bounds = localBounds(fleet.truck.group);
    const road = TERRITORY_ROADS.find(item => item.id === layout.highwayId)!;
    const corridor = parkingCorridorPolygon(layout.truckPath, layout.truckLaneWidth);
    expect(exclusions(corridor)).toEqual([]);
    // Same continuous corridor polygon triangulated by SoyFieldStaticLayer.
    const ribbon = parkingCorridorPolygon(layout.truckPath.slice(0, 6), layout.truckLaneWidth);
    const allowed = polygonClipping.union(polygon(layout.envelope), polygon(ribbon),
      polygon(parkingCorridorPolygon(road.points, road.width)));
    const escaped: { progress: number; x: number; z: number; outside: number }[] = [];
    let previous: ParkingPolygon | null = null;
    for (let index = 0; index <= 500; index++) {
      const pose = sampleSoyTruckPath(index / 500, { x: 0, z: 0, heading: 0 });
      const ring = footprint(bounds, pose.x, pose.z, pose.heading);
      const swept = previous ? parkingConvexHull([...previous, ...ring]) : ring;
      const outside = area(polygonClipping.difference(polygon(swept), allowed));
      if (outside > 1e-6) escaped.push({ progress: index / 500, x: pose.x, z: pose.z, outside });
      previous = ring;
    }
    fleet.dispose();
    expect(escaped.sort((a, b) => b.outside - a.outside).slice(0, 8)).toEqual([]);
  });

  it('contains full planter, soybean header, open spray booms and articulated auger in the operating envelope', () => {
    const fleet = createSoyMachineFleet();
    const combine = localBounds(fleet.combine.group), sprayer = localBounds(fleet.sprayer.group);
    const failures: unknown[] = [];
    const check = (ring: ParkingPolygon, name: string, progress: number) => {
      const outside = area(polygonClipping.difference(polygon(ring), polygon(layout.envelope)));
      const hits = exclusions(ring);
      if (outside > 1e-6 || hits.length) failures.push({ name, progress, outside, hits });
    };
    for (let index = 0; index <= 300; index++) {
      const progress = index / 300, pose = sampleSoyWorkPath(progress);
      fleet.tractor.planterPivot.rotation.y = pose.working ? 0 : Math.sin((pose.distance % (18 + Math.PI * .9)) / .9) * .25;
      const tractor = localBounds(fleet.tractor.group);
      // Same implement offsets as SoyHarvestScene; full models include the
      // cutting platform and planter, not just vehicle centre points.
      check(footprint(tractor, pose.x + Math.sin(pose.heading) * .675, pose.z + Math.cos(pose.heading) * .675, pose.heading), 'tractor', progress);
      check(footprint(combine, pose.x - Math.sin(pose.heading) * .7485, pose.z - Math.cos(pose.heading) * .7485, pose.heading), 'combine', progress);
      check(footprint(sprayer, 43 + progress * 18, -54.5, Math.PI / 2), 'sprayer', progress);
    }
    for (let index = 0; index <= 70; index++) {
      const time = 37 + index / 10, sample = sampleSoyCycle(time);
      fleet.combine.augerPivot.rotation.y = sample.auger * Math.PI / 2;
      check(footprint(localBounds(fleet.combine.group), layout.finalPose.x, layout.finalPose.z, layout.finalPose.heading), 'auger', time);
    }
    fleet.dispose();
    expect(failures.slice(0, 8)).toEqual([]);
  });
});
