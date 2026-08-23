import type { CommercialLot, MapEntity } from '../types';
import {
  COMMERCIAL_TREE_AREA_SCENE_ANCHORS,
  COMMERCIAL_MAP_TREES,
  type CommercialMapTree,
  type CommercialTreeArea,
  type CommercialTreeQuadra,
} from '../data/commercialTrees';
import {
  DEFAULT_FLAT_SURFACE_CLASSIFICATIONS,
  SPATIAL_EPSILON,
  distanceToEntity,
  entitySurfaceElevation,
  pointInPolygon,
} from './spatialSurface';

export const COMMERCIAL_TREE_CANOPY_LOBES = 7;
export const COMMERCIAL_TREE_REDUCED_CANOPY_LOBES = 3;
export const COMMERCIAL_TREE_BRANCHES = 2;
/** Static ground shadow + trunk + branch + crown in the primary color pass. */
export const COMMERCIAL_TREE_LAYER_DRAW_CALL_BUDGET = 4;
/** Trunk + branch + crown in the shadow-map pass when full graphics are enabled. */
export const COMMERCIAL_TREE_LAYER_SHADOW_DRAW_CALL_BUDGET = 3;
const TREE_SURFACE_CLEARANCE = 0.004;
const TREE_SURFACE_CLASSIFICATIONS = new Set([
  'SELLABLE_LOT',
  ...DEFAULT_FLAT_SURFACE_CLASSIFICATIONS,
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
  const areas = commercialTreeAreasForScene(entities, lots);
  return COMMERCIAL_MAP_TREES.filter((tree) => tree.isVisible && areas.has(tree.area));
}

export function commercialTreeAreasForScene(
  entities: readonly MapEntity[],
  lots: readonly CommercialLot[],
) {
  const areas = new Set<CommercialTreeArea>(commercialTreeBlocksForScene(entities, lots));
  const identifiers = new Set(entities.map((entity) => entity.publicIdentifier));
  (Object.keys(COMMERCIAL_TREE_AREA_SCENE_ANCHORS) as Array<Exclude<CommercialTreeArea, CommercialTreeQuadra>>)
    .forEach((area) => {
      if (COMMERCIAL_TREE_AREA_SCENE_ANCHORS[area].every((identifier) => identifiers.has(identifier))) {
        areas.add(area);
      }
    });
  return areas;
}

export function resolveCommercialTreeLot(tree: CommercialMapTree, lots: readonly CommercialLot[]) {
  if (!tree.relatedLotId) return null;
  return lots.find((lot) => lot.publicIdentifier === tree.relatedLotId) ?? null;
}

function surfacePriority(tree: CommercialMapTree, entity: MapEntity) {
  if (entity.publicIdentifier === tree.surfaceEntityIdentifier) return 0;
  if (entity.publicIdentifier === tree.relatedLotId) return 0;
  if (tree.placement === 'SIDEWALK_EDGE' && entity.classification === 'PEDESTRIAN_PATH') return 0;
  if (tree.placement === 'STREET_EDGE' && entity.classification === 'ROAD') return 0;
  if (
    (tree.placement === 'PARKING_ISLAND' || tree.placement === 'PARKING_EDGE')
    && entity.classification === 'PARKING'
  ) return 0;
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

  const anchoredSurface = tree.surfaceEntityIdentifier
    ? candidates.find((entity) => entity.publicIdentifier === tree.surfaceEntityIdentifier)
    : null;
  if (
    anchoredSurface
    && distanceToEntity(point, anchoredSurface) <= Math.max(0.75, tree.canopyRadius * 1.5)
  ) return anchoredSurface;

  if (
    tree.placement === 'LANDSCAPE_MASS'
    || tree.placement === 'BUILDING_EDGE'
    || tree.placement === 'OUTSIDE_COMMERCIAL_LOT'
  ) return null;

  return candidates.reduce<MapEntity | null>((nearest, candidate) => {
    if (!nearest) return candidate;
    const candidateDistance = distanceToEntity(point, candidate);
    const nearestDistance = distanceToEntity(point, nearest);
    if (candidateDistance < nearestDistance - SPATIAL_EPSILON) return candidate;
    if (
      Math.abs(candidateDistance - nearestDistance) <= SPATIAL_EPSILON
      && surfacePriority(tree, candidate) < surfacePriority(tree, nearest)
    ) return candidate;
    return nearest;
  }, null);
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
  if (surfaceEntity) return entitySurfaceElevation(surfaceEntity, { clearance: TREE_SURFACE_CLEARANCE });
  if (tree.placement === 'INSIDE_LOT' || tree.placement === 'LOT_EDGE') return 0.134;
  if (tree.placement === 'QUADRA_BORDER') return 0.029;
  if (tree.placement === 'SIDEWALK_EDGE') return 0.03;
  if (tree.placement === 'PARKING_ISLAND' || tree.placement === 'PARKING_EDGE') return 0.064;
  return 0.036;
}

export function commercialTreeInstanceBudget(treeCount: number, reducedGraphics = false) {
  const normalizedCount = Math.max(0, Math.floor(treeCount));
  const canopyLobes = reducedGraphics ? COMMERCIAL_TREE_REDUCED_CANOPY_LOBES : COMMERCIAL_TREE_CANOPY_LOBES;
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
