import { GENERATED_REAR_ROAD_SEGMENTS } from '../data/rearParkRoadNetwork';
import {
  buildRearRoadCorridorFootprints,
  distanceToPath,
  type RearRoadCorridorFootprint,
} from './rearRoadNetwork';

/**
 * A reconciliação é somente de apresentação: o inventário cartográfico das
 * árvores permanece imutável e reaparece em recortes onde a expansão viária
 * não é renderizada.
 */
export interface RearRoadClearanceTree {
  position: readonly [number, number];
  canopyRadius: number;
}

const GENERATED_REAR_CORRIDOR_FOOTPRINTS = Object.freeze(
  buildRearRoadCorridorFootprints(GENERATED_REAR_ROAD_SEGMENTS, {
    includeShoulders: true,
  }),
);

export function treeIntersectsGeneratedRearRoadCorridor(
  tree: RearRoadClearanceTree,
  footprints: readonly RearRoadCorridorFootprint[] = GENERATED_REAR_CORRIDOR_FOOTPRINTS,
) {
  return footprints.some((footprint) => (
    distanceToPath(tree.position, footprint.centerline)
      <= footprint.halfWidth + tree.canopyRadius
  ));
}

export function selectRearRoadCompatibleTreesForPresentation<
  Tree extends RearRoadClearanceTree,
>(trees: readonly Tree[]) {
  return trees.filter((tree) => !treeIntersectsGeneratedRearRoadCorridor(tree));
}
