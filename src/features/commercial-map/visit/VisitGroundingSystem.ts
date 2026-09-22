import { ShapeUtils, Vector2 } from 'three';
import { COMMERCIAL_MAP_GROUND_ELEVATION, OPEN_GROUND_PRESENTATION_HEIGHT } from '../constants';
import type { MapEntity } from '../types';
import { REAR_TERRAIN_PATCHES, sourcePolygonToLocal } from '../data/rearParkEnvironment';
import { clipContextPolygon } from '../data/commercialMapSpatialBounds';
import { TERRITORY_PATCHES } from '../data/territorialEnvironment';
import { GENERATED_REAR_ROAD_SEGMENTS } from '../data/rearParkRoadNetwork';
import { buildRearRoadCorridorFootprints, rearRoadTerrainElevationAt } from '../utils/rearRoadNetwork';
import { roadSurfaceHeight } from '../utils/roadInfrastructure';
import { resolveParkAccessEnvironmentPresentation } from '../data/parkAccessEnvironment';
import { PARK_ACCESS_INFRASTRUCTURE_INPUT } from '../utils/parkAccessSpatialPlanAdapter';
import { ARENA_FRONT_LAYOUT, sourceBoundsToLocal } from '../data/parkEnvironment';
import { arenaStairTreadElevation, arenaTerrainElevation } from '../data/arenaTerrain';
import { NATIONS_DISTRICT_LAYOUT } from '../data/nationsDistrict';
import { ARENA_TERRAIN_CUTS } from '../data/arenaSectorZoning';
import { resolveOpenGroundProfile } from '../components/canvas/openGroundTextures';
import { REAR_PARKING_SURFACES, REAR_PARKING_ELEVATIONS } from '../data/rearParking';
import { TERRITORY_ROADS } from '../data/territorialRoads';
import { corridorPolygon, sampleTerritoryRoad, TERRITORY_ROAD_Y } from '../utils/territorialRoadGeometry';
import { VisitSpatialIndex, visitPointInRing, visitRingBounds } from './VisitSpatialIndex';
import type { VisitBounds, VisitGroundSurface, VisitRing } from './visitTypes';

export function visitBoundsRing(bounds: VisitBounds): VisitRing {
  return [[bounds.minX, bounds.minZ], [bounds.maxX, bounds.minZ], [bounds.maxX, bounds.maxZ], [bounds.minX, bounds.maxZ]];
}

export function visitGroundSurface(id: string, polygon: VisitRing, height: VisitGroundSurface['height'], holes?: readonly VisitRing[]): VisitGroundSurface {
  return { id, polygon, height, holes, ...visitRingBounds(polygon) };
}

const ARENA_GROUND_BOUNDS = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.terrain.sourceBounds);
/** Same two planes per cell as ArenaFrontInfrastructure's PlaneGeometry. */
export function visitArenaTerrainHeight(x: number, z: number) {
  const bounds = ARENA_GROUND_BOUNDS;
  const { segmentsX, segmentsZ } = ARENA_FRONT_LAYOUT.terrain;
  const width = bounds.width / segmentsX, depth = bounds.depth / segmentsZ;
  const ix = Math.max(0, Math.min(segmentsX - 1, Math.floor((x - bounds.minX) / width)));
  const iz = Math.max(0, Math.min(segmentsZ - 1, Math.floor((z - bounds.minZ) / depth)));
  const x0 = bounds.minX + ix * width, z0 = bounds.minZ + iz * depth;
  const tx = (x - x0) / width, tz = (z - z0) / depth;
  const a = arenaTerrainElevation(x0, z0), b = arenaTerrainElevation(x0, z0 + depth), d = arenaTerrainElevation(x0 + width, z0);
  if (tx + tz <= 1) return a + tx * (d - a) + tz * (b - a);
  const c = arenaTerrainElevation(x0 + width, z0 + depth);
  return c + (1 - tx) * (b - c) + (1 - tz) * (d - c);
}

export class VisitGroundingSystem {
  readonly index: VisitSpatialIndex<VisitGroundSurface>;
  private readonly candidates: VisitGroundSurface[] = [];
  constructor(readonly surfaces: readonly VisitGroundSurface[], readonly fallback = COMMERCIAL_MAP_GROUND_ELEVATION) { this.index = new VisitSpatialIndex(surfaces, 3); }

  /** Stable bound callback can be passed straight into collision movement. */
  heightAt = (x: number, z: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return this.fallback;
    this.index.query(x, z, x, z, this.candidates);
    let y = this.fallback;
    for (const surface of this.candidates) {
      if (!visitPointInRing(x, z, surface.polygon)) continue;
      let holeContains = false;
      if (surface.holes) for (const hole of surface.holes) if (visitPointInRing(x, z, hole)) { holeContains = true; break; }
      if (holeContains) continue;
      const height = typeof surface.height === 'number' ? surface.height : surface.height(x, z);
      if (Number.isFinite(height)) y = Math.max(y, height);
    }
    return y;
  };
}

/** Ground adapters read the same owner data as the scene. No second terrain or
 * collider mesh is allocated. Only rear terrain's existing triangles are kept. */
export function buildVisitGroundSurfaces(entities: readonly MapEntity[], includeContext = true): VisitGroundSurface[] {
  const surfaces: VisitGroundSurface[] = [];
  for (const entity of entities) {
    if (entity.isArchived || entity.geometry.coordinates[0]?.length < 3) continue;
    const classification = entity.classification;
    let height: number | null = null;
    if (classification === 'ROAD' || classification === 'PEDESTRIAN_PATH') height = entity.geometry.elevation + roadSurfaceHeight(entity);
    else if (classification === 'SELLABLE_LOT' || classification === 'INTERNAL_STAND') height = entity.geometry.elevation + Math.max(0.025, entity.geometry.extrusionHeight);
    else if (classification === 'GREEN_AREA' || classification === 'PARKING' || classification === 'FOOD_AREA' || classification === 'RURAL_EXHIBITION' || classification === 'LIVESTOCK_AREA') {
      // These parking polygons are pick surfaces; their grass is the existing
      // natural terrain, not their cadastral extrusion.
      if (entity.publicIdentifier === 'EST-EXP-VIS' || entity.publicIdentifier === 'EST-VIS') continue;
      const profile = resolveOpenGroundProfile(entity.publicIdentifier);
      height = entity.geometry.elevation + (profile ? profile.presentationHeight ?? OPEN_GROUND_PRESENTATION_HEIGHT
        : classification === 'GREEN_AREA' || classification === 'PARKING' ? Math.max(0.018, Math.min(entity.geometry.extrusionHeight, 0.08))
          : Math.max(0.025, entity.geometry.extrusionHeight));
    }
    if (height !== null) surfaces.push(visitGroundSurface(entity.id, entity.geometry.coordinates[0], height, entity.geometry.coordinates.slice(1)));
  }
  if (!includeContext) return surfaces;
  for (const patch of REAR_TERRAIN_PATCHES) {
    const polygon = clipContextPolygon(sourcePolygonToLocal(patch.sourcePolygon));
    const points = polygon.map(p => new Vector2(p[0], p[1]));
    ShapeUtils.triangulateShape(points, []).forEach((indices, index) => {
      const [a, b, c] = indices.map(i => polygon[i]);
      const ya = patch.baseElevation + rearRoadTerrainElevationAt(...a), yb = patch.baseElevation + rearRoadTerrainElevationAt(...b), yc = patch.baseElevation + rearRoadTerrainElevationAt(...c);
      const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(denominator) < 1e-10) return;
      surfaces.push(visitGroundSurface(`${patch.id}:${index}`, [a, b, c], (x, z) => {
        const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / denominator;
        const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / denominator;
        return u * ya + v * yb + (1 - u - v) * yc;
      }));
    });
  }
  for (const patch of TERRITORY_PATCHES) if (patch.kind !== 'water') surfaces.push(visitGroundSurface(patch.id, patch.ring, 0.015));
  for (const road of TERRITORY_ROADS) {
    const path = sampleTerritoryRoad(road), polygon = corridorPolygon(path, road.width)[0]?.[0];
    if (!polygon) continue;
    const count = path.length;
    for (let i = 0; i < count - 1; i++) surfaces.push(visitGroundSurface(`territory:${road.id}:${i}`, [polygon[i], polygon[i + 1], polygon[2 * count - i - 2], polygon[2 * count - i - 1]], TERRITORY_ROAD_Y));
  }
  if (entities.some(entity => entity.publicIdentifier === 'PAVILHAO-09')) for (const surface of REAR_PARKING_SURFACES) {
    surfaces.push(visitGroundSurface(`rear-parking:${surface.id}`, surface.polygon, REAR_PARKING_ELEVATIONS.ground));
  }
  const environment = resolveParkAccessEnvironmentPresentation(false, false);
  for (const surface of [...environment.environmentalSurfaces, ...environment.trailSurfaces]) surfaces.push(visitGroundSurface(surface.id, surface.polygon, surface.elevation, surface.holes));
  for (const surface of [...PARK_ACCESS_INFRASTRUCTURE_INPUT.roadSurfaces, ...PARK_ACCESS_INFRASTRUCTURE_INPUT.sidewalkSurfaces]) {
    surfaces.push(visitGroundSurface(surface.id, surface.polygon, surface.elevation ?? 0.04));
  }
  buildRearRoadCorridorFootprints(GENERATED_REAR_ROAD_SEGMENTS, { includeShoulders: false, samplesPerWorldUnit: 5 }).forEach((road, index) => {
    const count = road.centerline.length, base = GENERATED_REAR_ROAD_SEGMENTS[index].elevationOffset;
    // Spatially partition long ribbons into quads rather than scanning a full
    // highway's hundreds of vertices every time a visitor takes one step.
    for (let i = 0; i < count - 1; i++) {
      surfaces.push(visitGroundSurface(`${road.segmentId}:${i}`, [road.polygon[i], road.polygon[i + 1], road.polygon[2 * count - i - 2], road.polygon[2 * count - i - 1]], (x, z) => base + rearRoadTerrainElevationAt(x, z)));
    }
  });
  if (entities.some(entity => entity.publicIdentifier === 'F')) {
    const arena = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.terrain.sourceBounds);
    surfaces.push(visitGroundSurface('arena-terrain', visitBoundsRing(arena), visitArenaTerrainHeight, ARENA_TERRAIN_CUTS.map(cut => cut.polygon)));
    const plaza = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.plaza.sourceBounds);
    surfaces.push(visitGroundSurface('arena-plaza', visitBoundsRing(plaza), ARENA_FRONT_LAYOUT.plaza.elevation));
    const config = ARENA_FRONT_LAYOUT.stairs, stairs = sourceBoundsToLocal(config.sourceBounds);
    const stepRun = (stairs.width - config.lowerLandingDepth - config.upperLandingDepth - config.intermediateLandingSteps.length * config.intermediateLandingDepth) / config.stepCount;
    let cursor = stairs.maxX - config.lowerLandingDepth;
    for (let step = 1; step <= config.stepCount; step++) {
      const run = stepRun + (config.intermediateLandingSteps.includes(step as 6 | 12) ? config.intermediateLandingDepth : 0);
      surfaces.push(visitGroundSurface(`arena-stair:${step}`, visitBoundsRing({ minX: cursor - run, maxX: cursor, minZ: stairs.minZ, maxZ: stairs.maxZ }), arenaStairTreadElevation(step)));
      cursor -= run;
    }
    surfaces.push(visitGroundSurface('arena-upper-landing', visitBoundsRing({ ...stairs, maxX: cursor }), arenaStairTreadElevation(config.stepCount)));
  }
  if (entities.some(entity => entity.publicIdentifier === 'PORTICO-NACOES')) {
    const nations = NATIONS_DISTRICT_LAYOUT;
    for (const [id, polygon, y] of [['grass', nations.grassBoundary, 0.022], ['asphalt', nations.mainAsphalt, 0.062], ['paving', nations.civicPaving, 0.096], ['north', nations.northApproach, 0.062], ['south', nations.southApproach, 0.062], ['stage', nations.stageApron, 0.062]] as const) surfaces.push(visitGroundSurface(`nations:${id}`, polygon, y));
    for (const island of nations.islands) for (const scale of [1, island.insetScale]) {
      const x = island.center[0], z = island.center[1], w = island.width * scale / 2, d = island.depth * scale / 2, cx = w * 0.34, cz = d * 0.18;
      surfaces.push(visitGroundSurface(`nations:island:${island.id}:${scale}`, [[x - w + cx, z - d], [x + w - cx, z - d], [x + w, z - d + cz], [x + w, z + d - cz], [x + w - cx, z + d], [x - w + cx, z + d], [x - w, z + d - cz], [x - w, z - d + cz]], scale === 1 ? 0.136 : 0.172));
    }
  }
  return surfaces;
}
