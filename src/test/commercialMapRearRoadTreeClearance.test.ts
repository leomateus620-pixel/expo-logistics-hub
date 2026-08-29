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
import { buildRearTreeInstances } from '@/features/commercial-map/data/rearParkEnvironment';
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

const EXPECTED_PRESENTATION_ONLY_REMOVALS = [
  'tree-d-09',
  'tree-e-01',
  'tree-e-02',
  'tree-e-03',
  'tree-e-04',
  'tree-e-05',
  'tree-e-06',
  'tree-e-07',
  'tree-e-08',
  'tree-e-14',
  'tree-nations-01',
  'tree-nations-02',
  'tree-nations-03',
  'tree-nations-05',
  'tree-nations-06',
  'tree-nations-07',
  'tree-parking-east-10',
  'tree-parking-east-14',
  'tree-parking-east-15',
] as const;

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

    expect(removedIds).toEqual([...EXPECTED_PRESENTATION_ONLY_REMOVALS].sort());
    expect(presentedTrees.every((tree) => !treeIntersectsGeneratedRearRoadCorridor(tree))).toBe(true);
    expect(JSON.stringify(COMMERCIAL_MAP_TREES)).toBe(inventorySnapshot);
  });

  it('preserves every reconciled rear-parking canopy because none intersects the new road corridor', () => {
    const parkingTrees = reconcileRearParkingTrees(COMMERCIAL_MAP_TREES, OFFICIAL_REFERENCE_ENTITIES);

    expect(parkingTrees).toHaveLength(26);
    expect(REAR_PARKING_TREE_CANDIDATES).toHaveLength(32);
    expect(parkingTrees.every((tree) => !treeIntersectsGeneratedRearRoadCorridor(tree))).toBe(true);
    expect(selectRearRoadCompatibleTreesForPresentation(parkingTrees)).toEqual(parkingTrees);
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

    expect(trees).toHaveLength(128);
    expect(collisions).toEqual([]);
  });
});
