import { ShapeUtils, Vector2, type BufferGeometry } from 'three';
import { COMMERCIAL_MAP_GROUND_ELEVATION, OPEN_GROUND_PRESENTATION_HEIGHT } from '../constants';
import type { MapEntity } from '../types';
import { REAR_TERRAIN_PATCHES, sourcePolygonToLocal } from '../data/rearParkEnvironment';
import { clipContextPolygon } from '../data/commercialMapSpatialBounds';
import { TERRITORY_PATCHES } from '../data/territorialEnvironment';
import { GENERATED_REAR_ROAD_SEGMENTS, REPLACED_OFFICIAL_ROAD_IDENTIFIERS } from '../data/rearParkRoadNetwork';
import { buildRearRoadCorridorFootprints, rearRoadTerrainElevationAt } from '../utils/rearRoadNetwork';
import { buildRoadNetworkGeometries, disposeRoadNetworkGeometries, roadSurfaceHeight } from '../utils/roadInfrastructure';
import { resolveParkAccessEnvironmentPresentation } from '../data/parkAccessEnvironment';
import { PARK_ACCESS_INFRASTRUCTURE_INPUT } from '../utils/parkAccessSpatialPlanAdapter';
import { ARENA_FRONT_LAYOUT, sourceBoundsToLocal } from '../data/parkEnvironment';
import { arenaStairTreadElevation, arenaTerrainElevation, ARENA_TERRAIN_TOP_ELEVATION } from '../data/arenaTerrain';
import { NATIONS_DISTRICT_LAYOUT } from '../data/nationsDistrict';
import { ARENA_TERRAIN_CUTS } from '../data/arenaSectorZoning';
import { resolveOpenGroundProfile } from '../components/canvas/openGroundTextures';
import { REAR_PARKING_SURFACES, REAR_PARKING_ELEVATIONS } from '../data/rearParking';
import { TERRITORY_ROADS } from '../data/territorialRoads';
import { corridorPolygon, sampleTerritoryRoad, TERRITORY_ROAD_Y } from '../utils/territorialRoadGeometry';
import { VisitSpatialIndex, visitPointInRing, visitRingBounds } from './VisitSpatialIndex';
import { VISIT_CHARACTER_RADIUS, type VisitBounds, type VisitGroundSupport, type VisitGroundSurface, type VisitRing, type VisitVector3 } from './visitTypes';
import { buildExporuralLandscape, isExporuralLandscapeLot } from '../utils/exporuralLandscape';
import { buildQuadrasABEnvironmentPlan, quadrasABGroundVertexHeight } from '../utils/quadrasABEnvironment';
import { buildCommercialSiteEnvironmentPlan } from '../utils/commercialSiteEnvironment';
import { buildRestaurantFrontagePlan, RESTAURANT_FRONTAGE_LAYOUT } from '../utils/restaurantFrontage';

export function visitBoundsRing(bounds: VisitBounds): VisitRing {
  return [[bounds.minX, bounds.minZ], [bounds.maxX, bounds.minZ], [bounds.maxX, bounds.maxZ], [bounds.minX, bounds.maxZ]];
}

export function visitGroundSurface(id: string, polygon: VisitRing, height: VisitGroundSurface['height'], holes?: readonly VisitRing[], maximumHeight?: number): VisitGroundSurface {
  return { id, polygon, height, holes, maximumHeight, ...visitRingBounds(polygon) };
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
  readonly maximumHeight: number;
  private readonly candidates: VisitGroundSurface[] = [];
  private readonly supportCandidates: VisitGroundSurface[] = [];
  private readonly support: VisitGroundSupport = { height: -Infinity, maximumRise: .12 };
  constructor(readonly surfaces: readonly VisitGroundSurface[], readonly fallback = COMMERCIAL_MAP_GROUND_ELEVATION, cellSize = 3) {
    this.index = new VisitSpatialIndex(surfaces, cellSize);
    let top = fallback;
    for (const surface of surfaces) top = Math.max(top, typeof surface.height === 'number' ? surface.height : surface.maximumHeight ?? Infinity);
    this.maximumHeight = top;
  }

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

  private considerSupport(surface: VisitGroundSurface, x: number, z: number, boundaryHole?: VisitRing) {
    if (surface.holes) for (const hole of surface.holes) {
      if (hole !== boundaryHole && visitPointInRing(x, z, hole)) return;
    }
    const height = typeof surface.height === 'number' ? surface.height : surface.height(x, z);
    if (!Number.isFinite(height) || height < this.support.height) return;
    this.support.maximumRise = height === this.support.height
      ? Math.max(this.support.maximumRise, surface.maximumStepRise ?? .12)
      : surface.maximumStepRise ?? .12;
    this.support.height = height;
  }

  private considerSupportBoundary(surface: VisitGroundSurface, ring: VisitRing, x: number, z: number, radiusSquared: number, hole?: VisitRing) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], b = ring[i], dx = b[0] - a[0], dz = b[1] - a[1];
      const lengthSquared = dx * dx + dz * dz;
      if (lengthSquared < 1e-16) continue;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / lengthSquared));
      const px = a[0] + dx * t, pz = a[1] + dz * t;
      if ((x - px) ** 2 + (z - pz) ** 2 <= radiusSquared) this.considerSupport(surface, px, pz, hole);
    }
  }

  /** Circular foot contact, not just a centre ray. The stable result is reused.
   * Narrow cadastral seams cannot swallow a body wider than the seam. Camera
   * and POI probes deliberately keep using the exact point height above. */
  supportAt = (x: number, z: number, radius = VISIT_CHARACTER_RADIUS): VisitGroundSupport => {
    this.support.height = this.fallback; this.support.maximumRise = .12;
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius)) return this.support;
    radius = Math.max(0, radius);
    this.index.query(x - radius, z - radius, x + radius, z + radius, this.supportCandidates);
    const radiusSquared = radius * radius;
    for (const surface of this.supportCandidates) {
      if (surface.supportAt) {
        const nested = surface.supportAt(x, z, radius);
        if (nested.height > this.support.height) { this.support.height = nested.height; this.support.maximumRise = nested.maximumRise; }
        else if (nested.height === this.support.height) this.support.maximumRise = Math.max(this.support.maximumRise, nested.maximumRise);
        continue;
      }
      if (visitPointInRing(x, z, surface.polygon)) this.considerSupport(surface, x, z);
      if (radius > 0) {
        this.considerSupportBoundary(surface, surface.polygon, x, z, radiusSquared);
        if (surface.holes) for (const hole of surface.holes) this.considerSupportBoundary(surface, hole, x, z, radiusSquared, hole);
      }
    }
    return this.support;
  };
}

/** POI cadence only: bounded height-field visibility for banks/terraces which
 * are walkable support rather than wall colliders. No renderer raycast. */
export function visitTerrainOccluded(ground: Pick<VisitGroundingSystem, 'heightAt'>, from: VisitVector3, to: VisitVector3) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const steps = Math.min(2048, Math.max(1, Math.ceil(Math.hypot(dx, dz) / .08)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (ground.heightAt(from.x + dx * t, from.z + dz * t) > from.y + dy * t + .003) return true;
  }
  return false;
}

/** Short camera booms need at most ~12 local samples, followed by a bounded
 * refinement only when hitting terrain. No temporary vectors/arrays/closures.
 * Functional surfaces without a proven ceiling intentionally disable the
 * aerial early-out rather than risk missing an unknown high surface. */
export function visitTerrainCameraFraction(ground: Pick<VisitGroundingSystem, 'heightAt'> & { maximumHeight?: number }, from: VisitVector3, to: VisitVector3, radius = .025, maximumFraction = 1) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  if (Math.min(from.y, from.y + dy * maximumFraction) - radius > (ground.maximumHeight ?? Infinity)) return maximumFraction;
  if (from.y - radius <= ground.heightAt(from.x, from.z)) return 0;
  const steps = Math.min(2048, Math.max(1, Math.ceil(Math.hypot(dx, dz) * maximumFraction / .06)));
  let previous = 0;
  for (let i = 1; i <= steps; i++) {
    const t = maximumFraction * i / steps;
    if (from.y + dy * t - radius <= ground.heightAt(from.x + dx * t, from.z + dz * t)) {
      let low = previous, high = t;
      for (let pass = 0; pass < 10; pass++) {
        const mid = (low + high) / 2;
        if (from.y + dy * mid - radius <= ground.heightAt(from.x + dx * mid, from.z + dz * mid)) high = mid;
        else low = mid;
      }
      return Math.max(0, low - .00008);
    }
    previous = t;
  }
  return maximumFraction;
}

/** Extract exact support planes from an existing source builder, then discard
 * its temporary BufferGeometry. Dense landscape detail has its own fine grid;
 * it does not flood the park-wide broad phase with thousands of tiny facets. */
export function visitGeometryGroundSurface(id: string, geometry: BufferGeometry, maximumStepRise?: number): VisitGroundSurface | null {
  const positions = geometry.getAttribute('position'), indices = geometry.index;
  const triangles: VisitGroundSurface[] = [];
  const count = indices?.count ?? positions.count;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i + 2 < count; i += 3) {
    const ai = indices ? indices.getX(i) : i, bi = indices ? indices.getX(i + 1) : i + 1, ci = indices ? indices.getX(i + 2) : i + 2;
    const ax = positions.getX(ai), az = positions.getZ(ai), ay = positions.getY(ai);
    const bx = positions.getX(bi), bz = positions.getZ(bi), by = positions.getY(bi);
    const cx = positions.getX(ci), cz = positions.getZ(ci), cy = positions.getY(ci);
    const denominator = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(denominator) < 1e-12) continue;
    const slopeX = ((by - ay) * (cz - az) - (cy - ay) * (bz - az)) / denominator;
    const slopeZ = ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / denominator;
    triangles.push({ ...visitGroundSurface(`${id}:${i / 3}`, [[ax, az], [bx, bz], [cx, cz]], (x, z) => ay + slopeX * (x - ax) + slopeZ * (z - az), undefined, Math.max(ay, by, cy)), maximumStepRise });
    minX = Math.min(minX, ax, bx, cx); maxX = Math.max(maxX, ax, bx, cx);
    minZ = Math.min(minZ, az, bz, cz); maxZ = Math.max(maxZ, az, bz, cz);
  }
  if (!triangles.length) return null;
  const detail = new VisitGroundingSystem(triangles, -Infinity, .2);
  return { ...visitGroundSurface(id, visitBoundsRing({ minX, maxX, minZ, maxZ }), detail.heightAt, undefined, detail.maximumHeight), supportAt: detail.supportAt };
}

/** Actual soil support behind the pilot's decorative grass blades. Keep the
 * canonical hard-surface masks and treatment exclusions, and interpolate the
 * same two triangles as QuadrasABEnvironmentLayer (not its styling token Y). */
export function buildVisitSiteGroundSurfaces(entities: readonly MapEntity[]): VisitGroundSurface[] {
  const quadras = buildQuadrasABEnvironmentPlan({ entities, preserveVisitGroundPlacement: true });
  const site = buildCommercialSiteEnvironmentPlan({ entities, preserveVisitGroundPlacement: true });
  const quadraSurfaces: VisitGroundSurface[] = [];
  for (const cell of quadras.cells) {
    const points = cell.polygon.map(([x, z]) => [Math.fround(x), Math.fround(z)] as const);
    const heights = cell.polygon.map(([x, z]) => Math.fround(quadrasABGroundVertexHeight(x, z)));
    for (const [ai, bi, ci] of [[0, 2, 1], [0, 3, 2]]) {
      const a = points[ai], b = points[bi], c = points[ci];
      const ay = heights[ai], by = heights[bi], cy = heights[ci];
      const denominator = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
      const slopeX = ((by - ay) * (c[1] - a[1]) - (cy - ay) * (b[1] - a[1])) / denominator;
      const slopeZ = ((b[0] - a[0]) * (cy - ay) - (c[0] - a[0]) * (by - ay)) / denominator;
      quadraSurfaces.push(visitGroundSurface(`${cell.id}:${bi}`, [a, b, c], (x, z) => ay + slopeX * (x - a[0]) + slopeZ * (z - a[1]), undefined, Math.max(ay, by, cy)));
    }
  }
  const siteSurfaces = site.cells.map(cell => visitGroundSurface(cell.id, cell.polygon, cell.elevation));
  const result: VisitGroundSurface[] = [];
  for (const [id, cells] of [['quadras-ab:support', quadraSurfaces], ['commercial-site:support', siteSurfaces]] as const) {
    if (!cells.length) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const cell of cells) {
      minX = Math.min(minX, cell.minX); maxX = Math.max(maxX, cell.maxX);
      minZ = Math.min(minZ, cell.minZ); maxZ = Math.max(maxZ, cell.maxZ);
    }
    const detail = new VisitGroundingSystem(cells, -Infinity, .4);
    result.push({ ...visitGroundSurface(id, visitBoundsRing({ minX, maxX, minZ, maxZ }), detail.heightAt, undefined, detail.maximumHeight), supportAt: detail.supportAt });
  }
  return result;
}

/** Ground adapters read the same owner data as the scene. No renderable terrain
 * or collider mesh remains allocated; only numeric support planes are retained. */
export function buildVisitGroundSurfaces(entities: readonly MapEntity[], includeContext = true, siteEnvironmentEntities: readonly MapEntity[] = entities): VisitGroundSurface[] {
  const surfaces: VisitGroundSurface[] = [];
  for (const entity of entities) {
    if (entity.isArchived || entity.geometry.coordinates[0]?.length < 3) continue;
    // D1 is classified FOOD_AREA, but its cadastral extrusion is a picking
    // volume. The Alameda adapter supplies the actual split floor and stairs.
    if (entity.publicIdentifier === 'D1') continue;
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
    if (height !== null) {
      const surface = visitGroundSurface(entity.id, entity.geometry.coordinates[0], height, entity.geometry.coordinates.slice(1));
      // Commercial lots are intentionally raised visualization slabs, not
      // walls. This allowance belongs only to their authored support; it never
      // raises the obstacle step height or makes roofs climbable.
      if (classification === 'SELLABLE_LOT' || classification === 'INTERNAL_STAND') surface.maximumStepRise = Math.min(.25, Math.max(.12, height - COMMERCIAL_MAP_GROUND_ELEVATION));
      surfaces.push(surface);
    }
  }
  const frontage = buildRestaurantFrontagePlan({ entities });
  if (frontage.available) {
    for (const [kind, rect, height] of [
      ['slab', frontage.slab, RESTAURANT_FRONTAGE_LAYOUT.slab.topElevation],
      ['lawn', frontage.lawn, RESTAURANT_FRONTAGE_LAYOUT.lawn.elevation],
      ['connector', frontage.connector, RESTAURANT_FRONTAGE_LAYOUT.connector.topElevation],
    ] as const) if (rect) surfaces.push(visitGroundSurface(`restaurant-frontage:${kind}`, visitBoundsRing(rect), height));
  }
  // Preserve the road owner's generated junctions and small curb tops too.
  // Only numerical facets survive; temporary source buffers are all disposed.
  const roadEntities = entities.filter(entity => !entity.isArchived
    && (entity.classification === 'ROAD' || entity.classification === 'PEDESTRIAN_PATH')
    && (!includeContext || !REPLACED_OFFICIAL_ROAD_IDENTIFIERS.includes(entity.publicIdentifier)));
  if (roadEntities.length) {
    const roads = buildRoadNetworkGeometries(roadEntities, { suppressedSurfaceIdentifiers: includeContext ? ['AV-BENVENUTO-CONTI', 'AV-TUPARENDI'] : undefined });
    try {
      for (const key of ['intersections', 'curbs', 'gutters'] as const) {
        const geometry = roads[key];
        if (!geometry) continue;
        // A .026 authored curb above the .112 base-to-asphalt presentation
        // rise is still walkable; the physical wall allowance stays .045.
        const surface = visitGeometryGroundSurface(`road-detail:${key}`, geometry, key === 'curbs' ? .15 : undefined);
        if (surface) surfaces.push(surface);
      }
    } finally { disposeRoadNetworkGeometries(roads); }
  }
  if (entities.some(isExporuralLandscapeLot)) {
    const landscape = buildExporuralLandscape(entities);
    for (const key of ['borders', 'slopes', 'terrace'] as const) {
      const geometry = landscape[key];
      if (!geometry) continue;
      try {
        const surface = visitGeometryGroundSurface(`exporural:${key}`, geometry);
        if (surface) surfaces.push(surface);
      } finally { geometry.dispose(); }
    }
  }
  if (!includeContext) return surfaces;
  surfaces.push(...buildVisitSiteGroundSurfaces(siteEnvironmentEntities));
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
      }, undefined, Math.max(ya, yb, yc)));
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
      surfaces.push(visitGroundSurface(`${road.segmentId}:${i}`, [road.polygon[i], road.polygon[i + 1], road.polygon[2 * count - i - 2], road.polygon[2 * count - i - 1]], (x, z) => base + rearRoadTerrainElevationAt(x, z), undefined, base + .003));
    }
  });
  if (entities.some(entity => entity.publicIdentifier === 'F')) {
    const arena = sourceBoundsToLocal(ARENA_FRONT_LAYOUT.terrain.sourceBounds);
    surfaces.push(visitGroundSurface('arena-terrain', visitBoundsRing(arena), visitArenaTerrainHeight, ARENA_TERRAIN_CUTS.map(cut => cut.polygon), ARENA_TERRAIN_TOP_ELEVATION + .012));
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
