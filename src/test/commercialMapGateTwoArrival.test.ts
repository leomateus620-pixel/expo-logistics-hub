import { beforeAll, describe, expect, it } from 'vitest';
import polygonClipping from 'polygon-clipping';
import { OFFICIAL_REFERENCE_DATA, officialPdfPointToLocal } from '@/features/commercial-map/data/officialReference2026';
import { PARK_ACCESS_SPATIAL_PLAN } from '@/features/commercial-map/data/parkAccessSpatialPlan';
import { pointInPolygon } from '@/features/commercial-map/utils/spatialSurface';
import { buildVisitWorld, type VisitWorld } from '@/features/commercial-map/visit/VisitWorld';
import { resolveVisitSpawn } from '@/features/commercial-map/visit/VisitSpawnManager';

const gate = PARK_ACCESS_SPATIAL_PLAN.gates.gate2;
const entity = OFFICIAL_REFERENCE_DATA.entities.find(item => item.publicIdentifier === 'A2')!;
let world: VisitWorld;
beforeAll(() => { world = buildVisitWorld({ entities: OFFICIAL_REFERENCE_DATA.entities, trees: [], includeContext: true }); });

describe('A2 canonical arrival and continuous avenue connection', () => {
  it('arrives from the avenue looking through the right passage, not at the rear service wall', () => {
    const spawn = resolveVisitSpawn({ entityId: entity.id }, OFFICIAL_REFERENCE_DATA.entities, world);
    expect(spawn.position.x).toBeCloseTo(gate.anchor[0] + gate.width * .36, 5);
    expect(spawn.position.z).toBeGreaterThan(gate.anchor[1] + gate.depth / 2);
    expect(spawn.yaw).toBeCloseTo(0);
    expect(world.collisions.isFree(spawn.position)).toBe(true);
    const eye = { ...spawn.position, y: spawn.position.y + .243 };
    expect(world.cameraProbe(eye, { ...eye, z: gate.anchor[1] - gate.depth * .6 })).toBeGreaterThan(.999);
  });

  it('permits an actual swept walk across the complete covered passage', () => {
    const spawn = resolveVisitSpawn({ entityId: entity.id }, OFFICIAL_REFERENCE_DATA.entities, world);
    let position = { ...spawn.position };
    for (let step = 0; step < 100; step++) position = world.move(position, 0, -.015);
    expect(position.x).toBeCloseTo(spawn.position.x, 4);
    expect(position.z).toBeLessThan(gate.anchor[1] - gate.depth / 2);
    expect(world.collisions.isFree(position)).toBe(true);
  });

  it('grounds the feet on the real concrete apron top instead of the asphalt underneath', () => {
    const spawn = resolveVisitSpawn({ entityId: entity.id }, OFFICIAL_REFERENCE_DATA.entities, world);
    expect(spawn.position.y).toBeCloseTo(.044, 6);
    let position = { ...spawn.position };
    for (let step = 0; step < 52; step++) position = world.move(position, 0, -.015);
    expect(Math.abs(position.z - gate.anchor[1])).toBeLessThan(.02);
    expect(position.y).toBeCloseTo(.053, 6);
    expect(world.ground.heightAt(position.x, position.z)).toBeCloseTo(.053, 6);
  });

  it('extends the original apron to the exact avenue boundary with no overlapping road polygon', () => {
    const apron = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces.find(surface => surface.id === 'gate-2-apron')!;
    const avenue = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces.find(surface => surface.id === 'benvenuto-four-lane-axis')!;
    const mutable = (ring: typeof apron.polygon) => [ring.map(point => [point[0], point[1]] as [number, number])];
    expect(polygonClipping.intersection(mutable(apron.polygon), mutable(avenue.polygon))).toEqual([]);
    expect(apron.elevation).toBe(avenue.elevation);
    for (const source of [[1274, 4110], [1300, 4130], [1320, 4145]] as const) {
      expect(pointInPolygon(officialPdfPointToLocal(source), apron.polygon), source.join(',')).toBe(true);
    }
    const join = apron.polygon[2], corner = apron.polygon[3];
    for (const edgePoint of [join, corner]) {
      expect(avenue.polygon.some(point => point[0] === edgePoint[0] && point[1] === edgePoint[1])).toBe(true);
    }
    const middle = [(join[0] + corner[0]) / 2, (join[1] + corner[1]) / 2] as const;
    expect(pointInPolygon([middle[0], middle[1] - .0001], apron.polygon)).toBe(true);
    expect(pointInPolygon([middle[0], middle[1] + .0001], avenue.polygon)).toBe(true);
  });
});
