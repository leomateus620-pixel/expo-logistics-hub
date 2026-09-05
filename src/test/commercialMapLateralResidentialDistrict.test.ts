import { describe, expect, it } from 'vitest';
import { LATERAL_DISTRICT_BLOCKS, LATERAL_DISTRICT_REFERENCE_COUNTS, LATERAL_DISTRICT_ROADS,
  LATERAL_DISTRICT_VEGETATION, lateralDistrictPointToWorld, lateralDistrictWorldPointToLocal,
  lateralDistrictContainsWorldPoint } from '../features/commercial-map/data/lateralResidentialDistrict';
import { auditLateralResidentialRenderPlan, buildLateralResidentialRenderPlan,
  resolveResidentialDetailVisibility } from '../features/commercial-map/utils/lateralResidentialGeometry';
import { createResidentialRoof, createResidentialSharedAssets, createResidentialGround } from '../features/commercial-map/utils/lateralResidentialAssets';
import { pointInPolygon } from '../features/commercial-map/utils/spatialSurface';

const parcels = LATERAL_DISTRICT_BLOCKS.flatMap((block) => block.parcels);
function corners(center: readonly number[], size: readonly number[], rotation = 0, margin = 0) {
  return [-1, 1].flatMap((sx) => [-1, 1].map((sz) => {
    const x = sx * (size[0] / 2 + margin), z = sz * (size[1] / 2 + margin);
    return [center[0] + x * Math.cos(rotation) - z * Math.sin(rotation), center[1] + x * Math.sin(rotation) + z * Math.cos(rotation)] as const;
  }));
}
describe('satellite-registered lateral residential district', () => {
  it('retains five distinct urban units with sparse and institutional occupation', () => {
    expect(LATERAL_DISTRICT_BLOCKS).toHaveLength(5);
    expect(LATERAL_DISTRICT_REFERENCE_COUNTS.map((entry) => entry.occupiedParcels)).toEqual([2, 9, 11, 12, 8]);
    expect(parcels.filter((parcel) => parcel.use === 'vacant')).toHaveLength(3);
    expect(parcels.filter((parcel) => parcel.use === 'institutional')).toHaveLength(2);
    expect(parcels.filter((parcel) => parcel.pool)).toHaveLength(27);
    expect(LATERAL_DISTRICT_ROADS.map((road) => road.name)).toContain('Rua Fenasoja');
  });
  it('places the district only on the exterior side with reversible metre calibration', () => {
    for (const point of [[25,11], [160,70], [409,101]] as const) {
      const world = lateralDistrictPointToWorld(point);
      const local = lateralDistrictWorldPointToLocal(world);
      expect(local[0]).toBeCloseTo(point[0], 7); expect(local[1]).toBeCloseTo(point[1], 7);
      expect(world[1]).toBeGreaterThan(lateralDistrictPointToWorld([point[0],0])[1]);
      expect(lateralDistrictContainsWorldPoint(world)).toBe(true);
    }
    expect(lateralDistrictPointToWorld([200,20])[1] - lateralDistrictPointToWorld([200,10])[1]).toBeCloseTo(1.5, 8);
    expect(lateralDistrictContainsWorldPoint(lateralDistrictPointToWorld([200,-20]))).toBe(false);
  });
  it('keeps every parcel inside its block without overlapping neighboring parcels', () => {
    for (const block of LATERAL_DISTRICT_BLOCKS) for (const parcel of block.parcels) {
      const [a,b,c,d] = parcel.bounds;
      for (const point of [[a+.001,b+.001],[c-.001,b+.001],[c-.001,d-.001],[a+.001,d-.001]] as const)
        expect(pointInPolygon(point, block.polygon), `${parcel.id}: ${point}`).toBe(true);
      for (const other of block.parcels.filter((candidate) => candidate.id > parcel.id)) {
        const width = Math.min(c, other.bounds[2]) - Math.max(a, other.bounds[0]);
        const depth = Math.min(d, other.bounds[3]) - Math.max(b, other.bounds[1]);
        expect(width > .01 && depth > .01, `${parcel.id}/${other.id}`).toBe(false);
      }
    }
  });
  it('contains building eaves and pool decks within their own lots', () => {
    for (const parcel of parcels) {
      for (const object of [parcel.house, parcel.pool].filter(Boolean)) {
        const margin = object === parcel.pool ? .85 : .325;
        for (const point of corners(object!.center, object!.size, object!.rotation, margin)) {
          expect.soft(point[0], parcel.id).toBeGreaterThanOrEqual(parcel.bounds[0]);
          expect.soft(point[0], parcel.id).toBeLessThanOrEqual(parcel.bounds[2]);
          expect.soft(point[1], parcel.id).toBeGreaterThanOrEqual(parcel.bounds[1]);
          expect.soft(point[1], parcel.id).toBeLessThanOrEqual(parcel.bounds[3]);
        }
      }
      if (parcel.pool && parcel.house) {
        const house = parcel.house, pool = parcel.pool;
        const gapS = Math.abs(house.center[0]-pool.center[0]) - (house.size[0]+pool.size[0])/2;
        const gapT = Math.abs(house.center[1]-pool.center[1]) - (house.size[1]+pool.size[1])/2;
        expect.soft(Math.max(gapS,gapT), parcel.id).toBeGreaterThanOrEqual(.3);
      }
    }
  });
  it('uses a bounded deterministic instanced plan and never duplicates parcel planting', () => {
    const plan = buildLateralResidentialRenderPlan();
    expect(plan).toEqual(buildLateralResidentialRenderPlan());
    const audit = auditLateralResidentialRenderPlan(plan);
    expect(audit.nonFiniteTransforms).toEqual([]); expect(audit.nonPositiveScales).toEqual([]);
    expect(audit.duplicateInstanceIds).toEqual([]); expect(audit.typologies.length).toBeGreaterThanOrEqual(6);
    expect(audit.instances).toBeLessThan(4500); expect(audit.maximumDrawCalls).toBeLessThanOrEqual(80);
    expect(audit.realLightCount).toBe(0); expect(audit.poleCount).toBeGreaterThan(12);
    expect(audit.palmCount + audit.broadleafCount).toBe(LATERAL_DISTRICT_VEGETATION.length);
  });
  it('keeps roofs and ground upward-facing and shares reusable resources', () => {
    for (const hip of [true,false]) {
      const geometry = createResidentialRoof(hip);
      const normal = geometry.getAttribute('normal');
      for (let i=0;i<normal.count;i++) expect(normal.getY(i)).toBeGreaterThanOrEqual(-.00001);
      geometry.dispose();
    }
    const ground = createResidentialGround(buildLateralResidentialRenderPlan()[0].surfaces);
    expect(ground.getAttribute('normal').getY(0)).toBeGreaterThan(.99); ground.dispose();
    const assets = createResidentialSharedAssets();
    expect(assets.geometries.masonry).toBe(assets.geometries.detail);
    expect(assets.geometries.palm.getAttribute('position').count).toBeGreaterThan(assets.farPalm.getAttribute('position').count);
    assets.dispose();
  });
  it('applies hysteresis so small camera movements do not flicker details', () => {
    expect(resolveResidentialDetailVisibility(39,true,36,43)).toBe(true);
    expect(resolveResidentialDetailVisibility(39,false,36,43)).toBe(false);
    expect(resolveResidentialDetailVisibility(44,true,36,43)).toBe(false);
  });
});
