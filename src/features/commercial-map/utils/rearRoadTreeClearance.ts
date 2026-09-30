import { GENERATED_REAR_ROAD_SEGMENTS } from '../data/rearParkRoadNetwork';
import { territoryRoadClearance } from './territorialRoadGeometry';
import { UBIRETAMA_PRESENTATION_HANDOFF, isUbiretamaPresentationSegment, type UbiretamaRoadPresentation } from './ubiretamaRoadPresentation';
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
  presentation?: UbiretamaRoadPresentation | null,
) {
  const scopedPresentation = presentation && tree.position[1] < UBIRETAMA_PRESENTATION_HANDOFF[1] ? presentation : null;
  return territoryRoadClearance(tree.position, scopedPresentation) <= tree.canopyRadius || footprints.some((footprint) => (
    !(scopedPresentation && isUbiretamaPresentationSegment(footprint.segmentId)) &&
    distanceToPath(tree.position, footprint.centerline)
      <= footprint.halfWidth + tree.canopyRadius
  ));
}

export function selectRearRoadCompatibleTreesForPresentation<
  Tree extends RearRoadClearanceTree,
>(trees: readonly Tree[], presentation?: UbiretamaRoadPresentation | null) {
  return trees.filter((tree) => !treeIntersectsGeneratedRearRoadCorridor(tree, undefined, presentation));
}
