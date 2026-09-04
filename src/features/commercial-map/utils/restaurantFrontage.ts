import type { MapEntity } from '../types';
import { OPEN_GROUND_PRESENTATION_HEIGHT } from '../constants';
import { ROAD_INFRASTRUCTURE } from './roadInfrastructure';
import {
  FENASOJA_RESTAURANT_FRONTAGE_IDENTIFIER,
  FENASOJA_RESTAURANT_LAYOUT,
  FENASOJA_RESTAURANT_PUBLIC_IDENTIFIER,
} from './fenasojaRestaurant';

export type FrontagePoint = readonly [number, number];

export interface FrontageRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface FrontageBox {
  center: FrontagePoint;
  size: FrontagePoint;
}

export interface FrontageShrub {
  position: FrontagePoint;
  scale: number;
  variant: number;
}

export interface FrontageTree {
  position: FrontagePoint;
  canopyRadius?: number;
}

/**
 * Presentation-only refinement of the official Calçada do Arvoredo
 * (PEDESTRIAN_PATH rectPdf([2630, 3110, 2782, 3565])) in front of the unified
 * Restaurante. It never replaces the cadastral surface: the persisted pedestrian
 * mesh and its curbs remain the selectable owner; the smooth slab, joints,
 * planting and tree pits are layered just above it.
 */
export const RESTAURANT_FRONTAGE_LAYOUT = Object.freeze({
  revision: '2026.9-calcada-arvoredo-frontage.1',
  walkwayIdentifier: FENASOJA_RESTAURANT_FRONTAGE_IDENTIFIER,
  restaurantIdentifier: FENASOJA_RESTAURANT_PUBLIC_IDENTIFIER,
  slab: Object.freeze({
    /** Keeps the existing pedestrian curb visible as the slab border. */
    inset: ROAD_INFRASTRUCTURE.curbWidth * 0.72 + 0.02,
    topElevation: ROAD_INFRASTRUCTURE.pedestrianHeight + 0.013,
    thickness: 0.02,
    jointSpacing: 0.92,
    jointWidth: 0.014,
    jointLift: 0.0012,
  }),
  /** Entrance path stays below the lowest restaurant step (ground + 0.0165). */
  connector: Object.freeze({
    widthRatio: 0.3,
    topElevation: OPEN_GROUND_PRESENTATION_HEIGHT + 0.007,
    thickness: 0.012,
  }),
  lawn: Object.freeze({
    margin: 0.34,
    elevation: OPEN_GROUND_PRESENTATION_HEIGHT + 0.004,
  }),
  /** Clipped hedge line on the lawn side, outside the existing curb, opened at the entrance path. */
  hedge: Object.freeze({
    edgeOffset: 0.19,
    width: 0.15,
    height: 0.085,
    segmentLength: 0.66,
    gap: 0.1,
    openingMargin: 0.16,
    baseElevation: OPEN_GROUND_PRESENTATION_HEIGHT + 0.004,
  }),
  /**
   * Alameda Mercosul runs four PDF points beyond the walkway's road edge, so
   * the shrub strip stays inside the slab between the tree pits.
   */
  shrub: Object.freeze({
    edgeOffset: 0.17,
    spacing: 0.74,
    radius: 0.125,
    treeClearance: 0.42,
    baseElevation: ROAD_INFRASTRUCTURE.pedestrianHeight + 0.013,
  }),
  treePit: Object.freeze({
    size: 0.46,
    curbWidth: 0.035,
    elevation: ROAD_INFRASTRUCTURE.pedestrianHeight + 0.0148,
    slabTolerance: 0.1,
  }),
  roadClearance: 0.06,
  renderBudget: Object.freeze({
    maximumDrawCalls: 9,
    maximumJoints: 24,
    maximumShrubs: 26,
    maximumHedgeSegments: 18,
    maximumTreePits: 10,
  }),
  palette: Object.freeze({
    concrete: '#d3cfc6',
    joint: '#b3aea4',
    connector: '#c7c3b9',
    lawn: '#5b7a49',
    hedge: '#3b6841',
    shrub: '#4b7b4c',
    soil: '#5a4733',
    pitCurb: '#c9c4ba',
  }),
});

export interface RestaurantFrontagePlan {
  available: boolean;
  slab: FrontageRect | null;
  joints: readonly FrontageBox[];
  connector: FrontageRect | null;
  lawn: FrontageRect | null;
  hedges: readonly FrontageBox[];
  shrubs: readonly FrontageShrub[];
  treePits: readonly FrontagePoint[];
  diagnostics: {
    walkwayEntityId: string | null;
    restaurantEntityId: string | null;
    clippedByRoadIds: readonly string[];
    jointCount: number;
    hedgeSegmentCount: number;
    shrubCount: number;
    treePitCount: number;
    drawCalls: number;
    withinRenderBudget: boolean;
  };
}

const EMPTY_PLAN: RestaurantFrontagePlan = Object.freeze({
  available: false,
  slab: null,
  joints: [],
  connector: null,
  lawn: null,
  hedges: [],
  shrubs: [],
  treePits: [],
  diagnostics: {
    walkwayEntityId: null,
    restaurantEntityId: null,
    clippedByRoadIds: [],
    jointCount: 0,
    hedgeSegmentCount: 0,
    shrubCount: 0,
    treePitCount: 0,
    drawCalls: 0,
    withinRenderBudget: true,
  },
});

function normalizedIdentifier(entity: Pick<MapEntity, 'publicIdentifier'>) {
  return entity.publicIdentifier.trim().toLocaleUpperCase('pt-BR');
}

export function frontageBounds(entity: Pick<MapEntity, 'geometry'>): FrontageRect | null {
  const points = entity.geometry.coordinates.flat().filter(([x, z]) => Number.isFinite(x) && Number.isFinite(z));
  if (points.length < 3) return null;
  return {
    minX: Math.min(...points.map(([x]) => x)),
    maxX: Math.max(...points.map(([x]) => x)),
    minZ: Math.min(...points.map(([, z]) => z)),
    maxZ: Math.max(...points.map(([, z]) => z)),
  };
}

function rectsIntersect(first: FrontageRect, second: FrontageRect) {
  return first.minX < second.maxX && first.maxX > second.minX
    && first.minZ < second.maxZ && first.maxZ > second.minZ;
}

function rectWidth(rect: FrontageRect) {
  return rect.maxX - rect.minX;
}

function rectDepth(rect: FrontageRect) {
  return rect.maxZ - rect.minZ;
}

function deterministicUnit(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function insetRect(rect: FrontageRect, inset: number): FrontageRect {
  return {
    minX: rect.minX + inset,
    maxX: rect.maxX - inset,
    minZ: rect.minZ + inset,
    maxZ: rect.maxZ - inset,
  };
}

/**
 * The official walkway rectangle overlaps the Rua Brasil band at its north end.
 * The asphalt surface owns that overlap, so the slab yields to every road that
 * spans the walkway instead of paving over the street.
 */
function clipRectByRoads(
  rect: FrontageRect,
  roads: readonly MapEntity[],
): { rect: FrontageRect; clippedBy: string[] } {
  const clippedBy: string[] = [];
  let result = { ...rect };
  const clearance = RESTAURANT_FRONTAGE_LAYOUT.roadClearance;
  roads.forEach((road) => {
    const bounds = frontageBounds(road);
    if (!bounds || !rectsIntersect(bounds, rect)) return;
    const spansX = bounds.minX <= rect.minX + 1e-6 && bounds.maxX >= rect.maxX - 1e-6;
    const spansZ = bounds.minZ <= rect.minZ + 1e-6 && bounds.maxZ >= rect.maxZ - 1e-6;
    const walkwayCenterZ = (rect.minZ + rect.maxZ) / 2;
    const walkwayCenterX = (rect.minX + rect.maxX) / 2;
    if (spansX) {
      if ((bounds.minZ + bounds.maxZ) / 2 < walkwayCenterZ) {
        result = { ...result, minZ: Math.max(result.minZ, bounds.maxZ + clearance) };
      } else {
        result = { ...result, maxZ: Math.min(result.maxZ, bounds.minZ - clearance) };
      }
      clippedBy.push(road.id);
    } else if (spansZ) {
      if ((bounds.minX + bounds.maxX) / 2 < walkwayCenterX) {
        result = { ...result, minX: Math.max(result.minX, bounds.maxX + clearance) };
      } else {
        result = { ...result, maxX: Math.min(result.maxX, bounds.minX - clearance) };
      }
      clippedBy.push(road.id);
    }
  });
  return { rect: result, clippedBy };
}

function buildJoints(slab: FrontageRect): FrontageBox[] {
  const { jointSpacing, jointWidth } = RESTAURANT_FRONTAGE_LAYOUT.slab;
  const longAxis: 'x' | 'z' = rectDepth(slab) >= rectWidth(slab) ? 'z' : 'x';
  const length = longAxis === 'z' ? rectDepth(slab) : rectWidth(slab);
  const span = longAxis === 'z' ? rectWidth(slab) : rectDepth(slab);
  const centerX = (slab.minX + slab.maxX) / 2;
  const centerZ = (slab.minZ + slab.maxZ) / 2;
  const count = Math.max(0, Math.floor(length / jointSpacing) - 1);
  const step = length / (count + 1);
  const joints: FrontageBox[] = [];
  for (let index = 1; index <= count; index += 1) {
    const offset = (longAxis === 'z' ? slab.minZ : slab.minX) + step * index;
    joints.push(longAxis === 'z'
      ? { center: [centerX, offset], size: [span - 0.02, jointWidth] }
      : { center: [offset, centerZ], size: [jointWidth, span - 0.02] });
  }
  joints.push(longAxis === 'z'
    ? { center: [centerX, centerZ], size: [jointWidth, length - 0.02] }
    : { center: [centerX, centerZ], size: [length - 0.02, jointWidth] });
  return joints.slice(0, RESTAURANT_FRONTAGE_LAYOUT.renderBudget.maximumJoints);
}

interface FrontageOrientation {
  /** Sign of the walkway relative to the restaurant along X (+1 = walkway east of the building). */
  side: 1 | -1;
}

function resolveOrientation(restaurant: FrontageRect, walkway: FrontageRect): FrontageOrientation | null {
  const restaurantCenterX = (restaurant.minX + restaurant.maxX) / 2;
  const walkwayCenterX = (walkway.minX + walkway.maxX) / 2;
  const overlapZ = Math.min(restaurant.maxZ, walkway.maxZ) - Math.max(restaurant.minZ, walkway.minZ);
  if (overlapZ <= 0) return null;
  return { side: walkwayCenterX >= restaurantCenterX ? 1 : -1 };
}

function buildConnector(
  restaurant: FrontageRect,
  walkway: FrontageRect,
  orientation: FrontageOrientation,
): FrontageRect | null {
  const width = rectDepth(restaurant) * RESTAURANT_FRONTAGE_LAYOUT.connector.widthRatio;
  const centerZ = (restaurant.minZ + restaurant.maxZ) / 2;
  const [from, to] = orientation.side === 1
    ? [restaurant.maxX - 0.02, walkway.minX]
    : [walkway.maxX, restaurant.minX + 0.02];
  if (to - from <= 0.05) return null;
  return { minX: from, maxX: to, minZ: centerZ - width / 2, maxZ: centerZ + width / 2 };
}

function buildLawn(
  restaurant: FrontageRect,
  walkway: FrontageRect,
  orientation: FrontageOrientation,
): FrontageRect {
  const margin = RESTAURANT_FRONTAGE_LAYOUT.lawn.margin;
  return orientation.side === 1
    ? { minX: restaurant.minX - margin, maxX: walkway.minX, minZ: restaurant.minZ - margin * 0.3, maxZ: restaurant.maxZ + margin * 1.5 }
    : { minX: walkway.maxX, maxX: restaurant.maxX + margin, minZ: restaurant.minZ - margin * 0.3, maxZ: restaurant.maxZ + margin * 1.5 };
}

function buildHedges(
  slab: FrontageRect,
  connector: FrontageRect | null,
  orientation: FrontageOrientation,
): FrontageBox[] {
  const hedge = RESTAURANT_FRONTAGE_LAYOUT.hedge;
  const x = orientation.side === 1
    ? slab.minX - hedge.edgeOffset
    : slab.maxX + hedge.edgeOffset;
  const openings = connector
    ? [{ from: connector.minZ - hedge.openingMargin, to: connector.maxZ + hedge.openingMargin }]
    : [];
  const segments: FrontageBox[] = [];
  const total = rectDepth(slab) - hedge.gap * 2;
  const count = Math.max(1, Math.floor(total / (hedge.segmentLength + hedge.gap)));
  const stride = total / count;
  for (let index = 0; index < count; index += 1) {
    const start = slab.minZ + hedge.gap + stride * index;
    const end = start + stride - hedge.gap;
    const center = (start + end) / 2;
    const blocked = openings.some((opening) => end > opening.from && start < opening.to);
    if (blocked) continue;
    segments.push({ center: [x, center], size: [hedge.width, end - start] });
  }
  return segments.slice(0, RESTAURANT_FRONTAGE_LAYOUT.renderBudget.maximumHedgeSegments);
}

function buildTreePits(slab: FrontageRect, trees: readonly FrontageTree[]): FrontagePoint[] {
  const tolerance = RESTAURANT_FRONTAGE_LAYOUT.treePit.slabTolerance;
  return trees
    .filter(({ position: [x, z] }) => (
      x >= slab.minX - tolerance && x <= slab.maxX + tolerance
      && z >= slab.minZ - tolerance && z <= slab.maxZ + tolerance
    ))
    .map(({ position }) => position)
    .sort((first, second) => first[1] - second[1] || first[0] - second[0])
    .slice(0, RESTAURANT_FRONTAGE_LAYOUT.renderBudget.maximumTreePits);
}

function buildShrubs(
  slab: FrontageRect,
  trees: readonly FrontageTree[],
  orientation: FrontageOrientation,
): FrontageShrub[] {
  const shrub = RESTAURANT_FRONTAGE_LAYOUT.shrub;
  const x = orientation.side === 1
    ? slab.maxX - shrub.edgeOffset
    : slab.minX + shrub.edgeOffset;
  const total = rectDepth(slab) - shrub.spacing;
  const count = Math.max(0, Math.floor(total / shrub.spacing));
  const shrubs: FrontageShrub[] = [];
  for (let index = 0; index <= count; index += 1) {
    const z = slab.minZ + shrub.spacing / 2 + (count > 0 ? (total * index) / count : total / 2);
    const clearOfTrees = trees.every(({ position: [treeX, treeZ] }) => (
      Math.hypot(treeX - x, treeZ - z) > shrub.treeClearance
    ));
    if (!clearOfTrees) continue;
    const noise = deterministicUnit(index + 1);
    shrubs.push({
      position: [x + (noise - 0.5) * 0.06, z + (deterministicUnit(index + 17) - 0.5) * 0.12],
      scale: 0.86 + noise * 0.34,
      variant: index % 3,
    });
  }
  return shrubs.slice(0, RESTAURANT_FRONTAGE_LAYOUT.renderBudget.maximumShrubs);
}

export interface RestaurantFrontagePlanInput {
  entities: readonly MapEntity[];
  trees?: readonly FrontageTree[];
}

export function buildRestaurantFrontagePlan({
  entities,
  trees = [],
}: RestaurantFrontagePlanInput): RestaurantFrontagePlan {
  const walkwayEntity = entities.find((entity) => (
    entity.classification === 'PEDESTRIAN_PATH'
    && normalizedIdentifier(entity) === RESTAURANT_FRONTAGE_LAYOUT.walkwayIdentifier
  ));
  const restaurantEntity = entities.find((entity) => (
    entity.classification === 'RESTAURANT'
    && normalizedIdentifier(entity) === RESTAURANT_FRONTAGE_LAYOUT.restaurantIdentifier
  ));
  const walkway = walkwayEntity ? frontageBounds(walkwayEntity) : null;
  const restaurant = restaurantEntity ? frontageBounds(restaurantEntity) : null;
  if (!walkwayEntity || !restaurantEntity || !walkway || !restaurant) return EMPTY_PLAN;
  const orientation = resolveOrientation(restaurant, walkway);
  if (!orientation) return EMPTY_PLAN;

  const roads = entities.filter((entity) => entity.classification === 'ROAD');
  const { rect: slab, clippedBy } = clipRectByRoads(
    insetRect(walkway, RESTAURANT_FRONTAGE_LAYOUT.slab.inset),
    roads,
  );
  if (rectWidth(slab) <= 0.3 || rectDepth(slab) <= 0.3) return EMPTY_PLAN;

  const joints = buildJoints(slab);
  const connector = buildConnector(restaurant, walkway, orientation);
  const { rect: lawn } = clipRectByRoads(buildLawn(restaurant, walkway, orientation), roads);
  const hedges = buildHedges(slab, connector, orientation);
  const treePits = buildTreePits(slab, trees);
  const shrubs = buildShrubs(slab, trees, orientation);
  // slab, joints, connector, lawn, hedges, shrubs, pit soil, pit curbs
  const drawCalls = 4 + (hedges.length ? 1 : 0) + (shrubs.length ? 1 : 0) + (treePits.length ? 2 : 0);

  return {
    available: true,
    slab,
    joints,
    connector,
    lawn,
    hedges,
    shrubs,
    treePits,
    diagnostics: {
      walkwayEntityId: walkwayEntity.id,
      restaurantEntityId: restaurantEntity.id,
      clippedByRoadIds: clippedBy,
      jointCount: joints.length,
      hedgeSegmentCount: hedges.length,
      shrubCount: shrubs.length,
      treePitCount: treePits.length,
      drawCalls,
      withinRenderBudget: drawCalls <= RESTAURANT_FRONTAGE_LAYOUT.renderBudget.maximumDrawCalls,
    },
  };
}

export function restaurantFrontageFacesWalkway(
  restaurant: Pick<MapEntity, 'geometry'>,
  walkway: Pick<MapEntity, 'geometry'>,
): boolean {
  const restaurantBounds = frontageBounds(restaurant);
  const walkwayBounds = frontageBounds(walkway);
  if (!restaurantBounds || !walkwayBounds) return false;
  const orientation = resolveOrientation(restaurantBounds, walkwayBounds);
  if (!orientation) return false;
  const frontVector = [
    Math.sin(FENASOJA_RESTAURANT_LAYOUT.facingRadians),
    Math.cos(FENASOJA_RESTAURANT_LAYOUT.facingRadians),
  ] as const;
  return Math.sign(Math.round(frontVector[0] * 1000)) === orientation.side
    && Math.abs(frontVector[1]) < 1e-6;
}
