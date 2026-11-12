import polygonClipping, { type Polygon } from 'polygon-clipping';
import { describe, expect, it } from 'vitest';
import { COMMERCIAL_MAP_GROUND_ELEVATION } from '../features/commercial-map/constants';
import {
  ETNIAS_SITE_DRIVE,
  ETNIAS_SITE_FORECOURT,
  ETNIAS_SITE_LARGE_BUILDING,
  ETNIAS_SITE_PERIMETER,
  ETNIAS_SITE_SMALL_BUILDING,
  ETNIAS_SITE_TREES,
  etniasAdjacentSitePointToWorld,
  type SitePoint,
} from '../features/commercial-map/data/etniasAdjacentSite';
import { LATERAL_DISTRICT_BLOCKS, lateralDistrictPointToWorld } from '../features/commercial-map/data/lateralResidentialDistrict';
import { NATIONS_DISTRICT_LAYOUT } from '../features/commercial-map/data/nationsDistrict';
import { OFFICIAL_RENDERED_ENTITIES } from '../features/commercial-map/data/officialReference2026';
import { PARK_ACCESS_SPATIAL_PLAN } from '../features/commercial-map/data/parkAccessSpatialPlan';
import { buildEtniasAdjacentSiteGeometry } from '../features/commercial-map/utils/etniasAdjacentSiteGeometry';
import { pointInPolygon } from '../features/commercial-map/utils/spatialSurface';

function polygon(points: readonly SitePoint[]): Polygon {
  return [points.map(([x, z]) => [x, z])];
}

describe('terrain context beside the Etnias', () => {
  it('fits between Q5 and the Etnias and meets the existing avenue at one opening', () => {
    const site = polygon(ETNIAS_SITE_PERIMETER.map(etniasAdjacentSitePointToWorld));
    const residential = LATERAL_DISTRICT_BLOCKS.find((block) => block.id === 'Q5')!;
    expect(polygonClipping.intersection(site, polygon(residential.polygon.map(lateralDistrictPointToWorld)))).toEqual([]);
    expect(polygonClipping.intersection(site, polygon(NATIONS_DISTRICT_LAYOUT.grassBoundary))).toEqual([]);

    const avenue = OFFICIAL_RENDERED_ENTITIES.find((entity) => entity.publicIdentifier === 'AV-IMIGRANTES')!;
    const drive = polygon(ETNIAS_SITE_DRIVE.map(etniasAdjacentSitePointToWorld));
    const forecourt = polygon(ETNIAS_SITE_FORECOURT.map(etniasAdjacentSitePointToWorld));
    const gateArrival = PARK_ACCESS_SPATIAL_PLAN.roadSurfaces.find((surface) => surface.id === 'gate-3-arrival')!;
    expect(polygonClipping.intersection(forecourt, polygon(gateArrival.polygon))).toEqual([]);
    expect(polygonClipping.intersection(forecourt, avenue.geometry.coordinates)).toEqual([]);
    const intersections = polygonClipping.intersection(drive, avenue.geometry.coordinates);
    expect(intersections).toHaveLength(1);
    const z = intersections[0][0].map((point) => point[1]);
    expect(Math.max(...z) - Math.min(...z)).toBeCloseTo(0.012, 4);
  });

  it('covers the recessed footprint with a continuous multi-pitch roof', () => {
    const { roofEdge, roofFaces } = ETNIAS_SITE_SMALL_BUILDING;
    const horizontal = (vertices: typeof roofEdge) => polygon(vertices.map(([x, z]) => [x, z]));
    const polygons = roofFaces.map(horizontal);
    const [first, ...rest] = polygons;
    expect(polygonClipping.xor(horizontal(roofEdge), polygonClipping.union(first, ...rest))).toEqual([]);
    polygons.forEach((face, index) => {
      for (const other of polygons.slice(index + 1)) expect(polygonClipping.intersection(face, other)).toEqual([]);
    });

    for (const section of [...ETNIAS_SITE_LARGE_BUILDING, ETNIAS_SITE_SMALL_BUILDING]) {
      expect(section.roofEdge.every(([x, z]) => pointInPolygon([x, z], ETNIAS_SITE_PERIMETER))).toBe(true);
    }
    expect(ETNIAS_SITE_TREES.every(([x, z]) => pointInPolygon([x, z], ETNIAS_SITE_PERIMETER))).toBe(true);
  });

  it('generates finite static batches with foundations below the continuous ground', () => {
    const geometry = buildEtniasAdjacentSiteGeometry();
    try {
      for (const batch of Object.values(geometry)) {
        expect(batch.attributes.position.count).toBeGreaterThan(0);
        expect(batch.attributes.position.array.every(Number.isFinite)).toBe(true);
        expect(batch.attributes.normal.array.every(Number.isFinite)).toBe(true);
      }
      geometry.walls.computeBoundingBox();
      geometry.drive.computeBoundingBox();
      expect(geometry.walls.boundingBox!.min.y).toBeLessThan(COMMERCIAL_MAP_GROUND_ELEVATION);
      expect(geometry.drive.boundingBox!.max.y).toBeCloseTo(0.030, 4);
    } finally {
      Object.values(geometry).forEach((batch) => batch.dispose());
    }
  });
});
