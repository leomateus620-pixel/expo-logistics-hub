import type { CommercialLot, MapEntity } from '../types';
import {
  COMMERCIAL_MAP_TREES,
  type CommercialMapTree,
  type CommercialTreeQuadra,
} from '../data/commercialTrees';

export const COMMERCIAL_TREE_CANOPY_LOBES = 4;
export const COMMERCIAL_TREE_BRANCHES = 2;
/** Static ground shadow + trunk + branch + crown in the primary color pass. */
export const COMMERCIAL_TREE_LAYER_DRAW_CALL_BUDGET = 4;
/** Trunk + branch + crown in the shadow-map pass when full graphics are enabled. */
export const COMMERCIAL_TREE_LAYER_SHADOW_DRAW_CALL_BUDGET = 3;
const TREE_SURFACE_CLEARANCE = 0.004;
const FLAT_SURFACE_CLASSIFICATIONS = new Set([
  'ROAD',
  'PEDESTRIAN_PATH',
  'GREEN_AREA',
  'PARKING',
  'WATER',
  'QUADRA',
]);
const TREE_SURFACE_CLASSIFICATIONS = new Set([
  'SELLABLE_LOT',
  ...FLAT_SURFACE_CLASSIFICATIONS,
]);

function entityBlock(entity: MapEntity) {
  const metadataBlock = entity.metadata.block;
  if (typeof metadataBlock === 'string' && metadataBlock.trim()) {
    return metadataBlock.trim().toLocaleUpperCase('pt-BR');
  }
  return entity.publicIdentifier.match(/^QUADRA-([A-Z0-9]+)$/i)?.[1]?.toLocaleUpperCase('pt-BR') ?? null;
}

export function commercialTreeBlocksForScene(
  entities: readonly MapEntity[],
  lots: readonly CommercialLot[],
) {
  const blocks = new Set<CommercialTreeQuadra>();
  lots.forEach((lot) => {
    const block = lot.block?.toLocaleUpperCase('pt-BR');
    if (block === 'D' || block === 'I' || block === 'J' || block === 'E') blocks.add(block);
  });
  entities.forEach((entity) => {
    const block = entityBlock(entity);
    if (block === 'D' || block === 'I' || block === 'J' || block === 'E') blocks.add(block);
  });
  return blocks;
}

export function selectCommercialTreesForScene(
  entities: readonly MapEntity[],
  lots: readonly CommercialLot[],
) {
  const blocks = commercialTreeBlocksForScene(entities, lots);
  return COMMERCIAL_MAP_TREES.filter((tree) => tree.isVisible && blocks.has(tree.quadra));
}

export function resolveCommercialTreeLot(tree: CommercialMapTree, lots: readonly CommercialLot[]) {
  if (!tree.relatedLotId) return null;
  return lots.find((lot) => lot.publicIdentifier === tree.relatedLotId) ?? null;
}

function pointInPolygon(point: readonly [number, number], polygon: readonly (readonly [number, number])[]) {
  const onBoundary = polygon.some((start, index) => (
    distanceToSegment(point, start, polygon[(index + 1) % polygon.length]) <= 1e-6
  ));
  if (onBoundary) return true;
  let inside = false;
  polygon.forEach((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    if (
      (start[1] > point[1]) !== (end[1] > point[1])
      && point[0] < ((end[0] - start[0]) * (point[1] - start[1])) / (end[1] - start[1]) + start[0]
    ) inside = !inside;
  });
  return inside;
}

function distanceToSegment(
  point: readonly [number, number],
  start: readonly [number, number],
  end: readonly [number, number],
) {
  const deltaX = end[0] - start[0];
  const deltaZ = end[1] - start[1];
  const squaredLength = deltaX ** 2 + deltaZ ** 2;
  if (squaredLength <= Number.EPSILON) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const projection = Math.max(0, Math.min(1, (
    (point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaZ
  ) / squaredLength));
  return Math.hypot(
    point[0] - (start[0] + projection * deltaX),
    point[1] - (start[1] + projection * deltaZ),
  );
}

function distanceToEntity(point: readonly [number, number], entity: MapEntity) {
  const polygon = entity.geometry.coordinates[0] ?? [];
  if (pointInPolygon(point, polygon)) return 0;
  return Math.min(...polygon.map((start, index) => (
    distanceToSegment(point, start, polygon[(index + 1) % polygon.length])
  )));
}

function surfacePriority(tree: CommercialMapTree, entity: MapEntity) {
  if (entity.publicIdentifier === tree.relatedLotId) return 0;
  if (tree.placement === 'SIDEWALK_EDGE' && entity.classification === 'PEDESTRIAN_PATH') return 0;
  if (tree.placement === 'STREET_EDGE' && entity.classification === 'ROAD') return 0;
  if (
    tree.placement === 'QUADRA_BORDER'
    && entity.classification === 'QUADRA'
    && entityBlock(entity) === tree.quadra
  ) return 0;
  if (entity.classification === 'SELLABLE_LOT') return 1;
  if (entity.classification === 'PEDESTRIAN_PATH') return 2;
  if (entity.classification === 'ROAD') return 3;
  if (entity.classification === 'QUADRA') return 4;
  return 5;
}

function commercialTreeSurfaceEntityAtPosition(
  tree: CommercialMapTree,
  point: readonly [number, number],
  entities: readonly MapEntity[],
) {
  const candidates = entities.filter((entity) => TREE_SURFACE_CLASSIFICATIONS.has(entity.classification));
  const containing = candidates
    .filter((entity) => pointInPolygon(point, entity.geometry.coordinates[0] ?? []))
    .sort((left, right) => surfacePriority(tree, left) - surfacePriority(tree, right));
  if (containing[0]) return containing[0];

  return candidates.reduce<MapEntity | null>((nearest, candidate) => {
    if (!nearest) return candidate;
    const candidateDistance = distanceToEntity(point, candidate);
    const nearestDistance = distanceToEntity(point, nearest);
    if (candidateDistance < nearestDistance - 1e-6) return candidate;
    if (
      Math.abs(candidateDistance - nearestDistance) <= 1e-6
      && surfacePriority(tree, candidate) < surfacePriority(tree, nearest)
    ) return candidate;
    return nearest;
  }, null);
}

function entitySurfaceElevation(entity: MapEntity) {
  const surface = FLAT_SURFACE_CLASSIFICATIONS.has(entity.classification);
  const height = surface
    ? Math.max(0.018, Math.min(entity.geometry.extrusionHeight, 0.08))
    : Math.max(0.025, entity.geometry.extrusionHeight);
  return entity.geometry.elevation + height + TREE_SURFACE_CLEARANCE;
}

export function commercialTreeGroundElevation(
  tree: CommercialMapTree,
  entities: readonly MapEntity[] = [],
) {
  return commercialTreeGroundElevationAtPosition(tree, tree.position, entities);
}

export function commercialTreeGroundElevationAtPosition(
  tree: CommercialMapTree,
  point: readonly [number, number],
  entities: readonly MapEntity[] = [],
) {
  const surfaceEntity = commercialTreeSurfaceEntityAtPosition(tree, point, entities);
  if (surfaceEntity) return entitySurfaceElevation(surfaceEntity);
  if (tree.placement === 'INSIDE_LOT' || tree.placement === 'LOT_EDGE') return 0.134;
  if (tree.placement === 'QUADRA_BORDER') return 0.029;
  if (tree.placement === 'SIDEWALK_EDGE') return 0.03;
  return 0.036;
}

export function commercialTreeInstanceBudget(treeCount: number, reducedGraphics = false) {
  const normalizedCount = Math.max(0, Math.floor(treeCount));
  const canopyLobes = reducedGraphics ? 3 : COMMERCIAL_TREE_CANOPY_LOBES;
  const drawCalls = normalizedCount > 0 ? COMMERCIAL_TREE_LAYER_DRAW_CALL_BUDGET : 0;
  const shadowDrawCalls = normalizedCount > 0 && !reducedGraphics
    ? COMMERCIAL_TREE_LAYER_SHADOW_DRAW_CALL_BUDGET
    : 0;
  return {
    treeCount: normalizedCount,
    drawCalls,
    shadowDrawCalls,
    maximumPassDrawCalls: drawCalls + shadowDrawCalls,
    trunkInstances: normalizedCount,
    branchInstances: normalizedCount * COMMERCIAL_TREE_BRANCHES,
    canopyInstances: normalizedCount * canopyLobes,
    shadowInstances: normalizedCount,
  };
}
