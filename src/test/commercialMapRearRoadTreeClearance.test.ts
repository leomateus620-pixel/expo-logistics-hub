import { describe, expect, it } from 'vitest';
import { COMMERCIAL_MAP_TREES } from '@/features/commercial-map/data/commercialTrees';
import {
  OFFICIAL_REFERENCE_ENTITIES,
  OFFICIAL_REFERENCE_LOTS,
} from '@/features/commercial-map/data/officialReference2026';
import {
  REAR_PARKING_TREE_CANDIDATES,
  reconcileRearParkingTrees,
} from '@/features/commercial-map/data/rearParking';
import { buildRearPoleInstances, buildRearTreeInstances } from '@/features/commercial-map/data/rearParkEnvironment';
import {
  COMMERCIAL_ELECTRICAL_CONNECTIONS,
  COMMERCIAL_ELECTRICAL_NODES,
} from '@/features/commercial-map/data/electricalInfrastructure';
import { resolveElectricalNodePlacements } from '@/features/commercial-map/utils/electricalInfrastructure';
import { GENERATED_REAR_ROAD_SEGMENTS } from '@/features/commercial-map/data/rearParkRoadNetwork';
import { selectParkAccessCompatibleTreesForPresentation } from '@/features/commercial-map/data/parkAccessEnvironment';
import {
  buildRearRoadCorridorFootprints,
  distanceToPath,
} from '@/features/commercial-map/utils/rearRoadNetwork';
import {
  selectRearRoadCompatibleTreesForPresentation,
  treeIntersectsGeneratedRearRoadCorridor,
} from '@/features/commercial-map/utils/rearRoadTreeClearance';
import { selectCommercialTreesForScene } from '@/features/commercial-map/utils/treeLayer';

describe('rear-road rendered vegetation clearance', () => {
  it('filters only the canopies that cross generated pavement or shoulders without mutating the cadastral inventory', () => {
    const inventorySnapshot = JSON.stringify(COMMERCIAL_MAP_TREES);
    const canonicalSceneTrees = selectParkAccessCompatibleTreesForPresentation(
      selectCommercialTreesForScene(OFFICIAL_REFERENCE_ENTITIES, OFFICIAL_REFERENCE_LOTS),
    );
    const parkingTrees = reconcileRearParkingTrees(canonicalSceneTrees, OFFICIAL_REFERENCE_ENTITIES);
    const beforeRearRoadReconciliation = [...canonicalSceneTrees, ...parkingTrees];
    const presentedTrees = selectRearRoadCompatibleTreesForPresentation(beforeRearRoadReconciliation);
    const presentedIds = new Set(presentedTrees.map((tree) => tree.id));
    const removedIds = beforeRearRoadReconciliation
      .filter((tree) => !presentedIds.has(tree.id))
      .map((tree) => tree.id)
      .sort();
    const intersectingIds = beforeRearRoadReconciliation
      .filter((tree) => treeIntersectsGeneratedRearRoadCorridor(tree))
      .map((tree) => tree.id)
      .sort();

    expect(removedIds).toEqual(intersectingIds);
    expect(presentedTrees.every((tree) => !treeIntersectsGeneratedRearRoadCorridor(tree))).toBe(true);
    expect(JSON.stringify(COMMERCIAL_MAP_TREES)).toBe(inventorySnapshot);
  });

  it('filters only the three reconciled parking canopies inside the corrected corridor', () => {
    const parkingTrees = reconcileRearParkingTrees(COMMERCIAL_MAP_TREES, OFFICIAL_REFERENCE_ENTITIES);
    const collidingIds = parkingTrees
      .filter((tree) => treeIntersectsGeneratedRearRoadCorridor(tree))
      .map((tree) => tree.id);
    const presented = selectRearRoadCompatibleTreesForPresentation(parkingTrees);

    expect(parkingTrees).toHaveLength(26);
    expect(REAR_PARKING_TREE_CANDIDATES).toHaveLength(32);
    expect(collidingIds).toEqual([
      'tree-rear-parking-west-01',
      'tree-rear-parking-west-02',
      'tree-rear-parking-west-03',
    ]);
    expect(presented).toHaveLength(parkingTrees.length - collidingIds.length);
    expect(presented.every((tree) => !treeIntersectsGeneratedRearRoadCorridor(tree))).toBe(true);
  });

  it('keeps every instanced rear-environment canopy outside all generated pavement and shoulder footprints', () => {
    const footprints = buildRearRoadCorridorFootprints(GENERATED_REAR_ROAD_SEGMENTS, {
      includeShoulders: true,
    });
    const trees = buildRearTreeInstances();
    const collisions = trees.flatMap((tree, index) => footprints.flatMap((footprint) => (
      distanceToPath([tree.x, tree.z], footprint.centerline)
        <= footprint.halfWidth + tree.scale * 0.5
        ? [`rear-environment:${index}:${footprint.segmentId}`]
        : []
    )));

    expect(trees).toHaveLength(132);
    expect(collisions).toEqual([]);
  });

  it('retains all ambient poles outside every pavement and shoulder, including adjacent junction arms', () => {
    const footprints = buildRearRoadCorridorFootprints(undefined, { includeShoulders: true });
    const poles = buildRearPoleInstances();
    expect(poles).toHaveLength(7);
    expect(buildRearPoleInstances()).toEqual(poles);
    expect(poles.flatMap((pole, index) => footprints.flatMap((footprint) => (
      distanceToPath([pole.x, pole.z], footprint.centerline) <= footprint.halfWidth + 0.08
        ? [`${index}:${footprint.segmentId}`] : []
    )))).toEqual([]);
  });

  it('clears only the official poles still crossed by the corrected roads without changing records or links', () => {
    const inventory = JSON.stringify([COMMERCIAL_ELECTRICAL_NODES, COMMERCIAL_ELECTRICAL_CONNECTIONS]);
    const baseline = resolveElectricalNodePlacements(COMMERCIAL_ELECTRICAL_NODES, OFFICIAL_REFERENCE_ENTITIES);
    const corrected = resolveElectricalNodePlacements(COMMERCIAL_ELECTRICAL_NODES, OFFICIAL_REFERENCE_ENTITIES, true);
    const changed = corrected.filter((placement, index) => (
      placement.renderPosition.some((coordinate, axis) => coordinate !== baseline[index].renderPosition[axis])
    )).map(({ node }) => node.sourceMarkerId);
    expect(changed).toEqual([
      'pole-ref-145', 'pole-ref-225', 'pole-ref-295', 'pole-ref-296', 'pole-ref-297',
    ]);
    expect(corrected).toHaveLength(428);
    const footprints = buildRearRoadCorridorFootprints(undefined, { includeShoulders: true });
    expect(corrected.flatMap(({ node, renderPosition }) => footprints.flatMap((footprint) => (
      distanceToPath(renderPosition, footprint.centerline) <= footprint.halfWidth + node.radius + 0.05
        ? [`${node.sourceMarkerId}:${footprint.segmentId}`] : []
    )))).toEqual([]);
    expect(JSON.stringify([COMMERCIAL_ELECTRICAL_NODES, COMMERCIAL_ELECTRICAL_CONNECTIONS])).toBe(inventory);
    expect(resolveElectricalNodePlacements(COMMERCIAL_ELECTRICAL_NODES, OFFICIAL_REFERENCE_ENTITIES)).toEqual(baseline);
  });
});
