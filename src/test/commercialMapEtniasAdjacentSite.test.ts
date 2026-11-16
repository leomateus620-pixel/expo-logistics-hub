import polygonClipping, { type Polygon } from 'polygon-clipping';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { COMMERCIAL_MAP_GROUND_ELEVATION } from '../features/commercial-map/constants';
import {
  ETNIAS_SITE_CIRCULAR_EQUIPMENT,
  ETNIAS_SITE_DRIVE,
  ETNIAS_SITE_FORECOURT,
  ETNIAS_SITE_LARGE_BUILDING,
  ETNIAS_SITE_METERS_TO_WORLD,
  ETNIAS_SITE_PERIMETER,
  ETNIAS_SITE_RBS_ENTRY,
  ETNIAS_SITE_SMALL_BUILDING,
  ETNIAS_SITE_TREES,
  ETNIAS_SITE_WALKS,
  etniasAdjacentSitePointToWorld,
  type SitePoint,
} from '../features/commercial-map/data/etniasAdjacentSite';
import { GATE_NINE_COMMUNICATION_TOWER } from '../features/commercial-map/data/gateNineCommunicationTower';
import { LATERAL_DISTRICT_BLOCKS, lateralDistrictPointToWorld } from '../features/commercial-map/data/lateralResidentialDistrict';
import { NATIONS_DISTRICT_LAYOUT } from '../features/commercial-map/data/nationsDistrict';
import { OFFICIAL_RENDERED_ENTITIES } from '../features/commercial-map/data/officialReference2026';
import { PARK_ACCESS_SPATIAL_PLAN } from '../features/commercial-map/data/parkAccessSpatialPlan';
import { buildEtniasAdjacentSiteGeometry } from '../features/commercial-map/utils/etniasAdjacentSiteGeometry';
import { buildEtniasRbsTowerGeometry, ETNIAS_RBS_TOWER } from '../features/commercial-map/utils/etniasRbsTowerGeometry';
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
      geometry.roofs.computeBoundingBox();
      geometry.drive.computeBoundingBox();
      expect(geometry.walls.boundingBox!.min.y).toBeLessThan(COMMERCIAL_MAP_GROUND_ELEVATION);
      expect(geometry.roofs.boundingBox!.max.y).toBeCloseTo(
        COMMERCIAL_MAP_GROUND_ELEVATION + ETNIAS_SITE_RBS_ENTRY.height * ETNIAS_SITE_METERS_TO_WORLD, 5,
      );
      expect(geometry.drive.boundingBox!.max.y).toBeCloseTo(0.030, 4);
    } finally {
      Object.values(geometry).forEach((batch) => batch.dispose());
    }
  });

  it('recesses the glazed entry and connects its landing to the existing walk', () => {
    const geometry = buildEtniasAdjacentSiteGeometry();
    const material = new MeshBasicMaterial();
    const walls = new Mesh(geometry.walls, material);
    const glass = new Mesh(geometry.glass, material);
    const walks = new Mesh(geometry.walks, material);
    const { centerX, frontZ } = ETNIAS_SITE_RBS_ENTRY;
    try {
      const ground = COMMERCIAL_MAP_GROUND_ELEVATION;
      const scale = ETNIAS_SITE_METERS_TO_WORLD;
      const [doorX, doorZ] = etniasAdjacentSitePointToWorld([centerX + 0.45, frontZ]);
      const entryRay = new Raycaster(new Vector3(doorX, ground + 1.8 * scale, doorZ - 0.3), new Vector3(0, 0, 1));
      const pane = entryRay.intersectObject(glass)[0];
      expect(pane.point.z).toBeGreaterThan(doorZ + scale);
      expect(entryRay.intersectObject(walls)[0].distance).toBeGreaterThan(pane.distance);

      const topAt = ([x, z]: SitePoint, mesh: Mesh) => {
        const [worldX, worldZ] = etniasAdjacentSitePointToWorld([x, z]);
        const ray = new Raycaster(new Vector3(worldX, 0.1, worldZ), new Vector3(0, -1, 0));
        return ray.intersectObject(mesh)[0].point.y;
      };
      const rampX = centerX - 0.92;
      const foot: SitePoint = [rampX, 28.02];
      expect(topAt(foot, walls)).toBeCloseTo(topAt(foot, walks), 2);
      expect(topAt([rampX, frontZ - 0.37], walls)).toBeCloseTo(topAt([rampX, frontZ - 0.35], walls), 3);
      expect(topAt([centerX, frontZ + 1], walls)).toBeCloseTo(ground + 0.58 * scale, 5);
    } finally {
      material.dispose();
      Object.values(geometry).forEach((batch) => batch.dispose());
    }
  });

  it('grounds the RBS mast at the provisional post and keeps three clear guy anchors', () => {
    const { center, height, guyAnchors } = ETNIAS_RBS_TOWER;
    expect(center).toEqual([47.3, 76.8]);
    const mastHeight = height * ETNIAS_SITE_METERS_TO_WORLD;
    expect(mastHeight / GATE_NINE_COMMUNICATION_TOWER.height).toBeCloseTo(1.11, 2);

    const roofs = [...ETNIAS_SITE_LARGE_BUILDING, ETNIAS_SITE_SMALL_BUILDING]
      .map(({ roofEdge }) => roofEdge.map(([x, z]): SitePoint => [x, z]));
    const obstacles = [...roofs, ETNIAS_SITE_DRIVE, ETNIAS_SITE_FORECOURT, ...ETNIAS_SITE_WALKS];
    const { tower, towerDetails } = buildEtniasRbsTowerGeometry();
    try {
      const ground = COMMERCIAL_MAP_GROUND_ELEVATION;
      const [x, z] = etniasAdjacentSitePointToWorld(center);
      expect(tower.boundingBox!.max.y).toBeCloseTo(ground + mastHeight, 5);
      expect(tower.boundingBox!.min.y).toBeLessThan(ground);
      for (const batch of [tower, towerDetails]) {
        for (const attribute of ['position', 'normal', 'color']) {
          expect(batch.attributes[attribute].count).toBeGreaterThan(0);
          expect(batch.attributes[attribute].array.every(Number.isFinite)).toBe(true);
        }
      }

      const solid = tower.attributes.position;
      const cables = towerDetails.attributes.position;
      const hasVertex = (vertices: typeof solid, worldX: number, worldZ: number, tolerance: number, below: number) => {
        for (let index = 0; index < vertices.count; index++) {
          if (vertices.getY(index) >= below) continue;
          if (Math.hypot(vertices.getX(index) - worldX, vertices.getZ(index) - worldZ) < tolerance) return true;
        }
        return false;
      };
      expect(hasVertex(solid, x, z, 0.26, ground)).toBe(true);
      expect(guyAnchors).toHaveLength(3);
      for (const [anchorX, anchorZ] of guyAnchors) {
        const clearance: SitePoint[] = [
          [anchorX - 0.75, anchorZ - 0.75], [anchorX + 0.75, anchorZ - 0.75],
          [anchorX + 0.75, anchorZ + 0.75], [anchorX - 0.75, anchorZ + 0.75],
        ];
        expect(clearance.every((point) => pointInPolygon(point, ETNIAS_SITE_PERIMETER))).toBe(true);
        for (const obstacle of obstacles) {
          expect(polygonClipping.intersection(polygon(clearance), polygon(obstacle))).toEqual([]);
        }
        for (const dish of ETNIAS_SITE_CIRCULAR_EQUIPMENT) {
          expect(Math.hypot(anchorX - dish.center[0], anchorZ - dish.center[1])).toBeGreaterThan(dish.radius + 0.75);
        }
        const [worldX, worldZ] = etniasAdjacentSitePointToWorld([anchorX, anchorZ]);
        expect(hasVertex(solid, worldX, worldZ, 0.11, ground)).toBe(true);
        expect(hasVertex(cables, worldX, worldZ, 0.11, ground + 0.09)).toBe(true);
      }
    } finally {
      tower.dispose();
      towerDetails.dispose();
    }
  });
});
