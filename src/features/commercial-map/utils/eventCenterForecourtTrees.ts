import type { CommercialMapTree } from '../data/commercialTrees';

/** The eight existing trees in the row facing C1. A local visual refinement
 * requested during architectural review, not pruning/survey documentation.
 * IDs, positions, inventory, sales geometry and the rest of the park stay intact.
 */
export const EVENT_CENTER_FRONT_TREE_IDS = new Set([
  'tree-e-01',
  'tree-e-02',
  'tree-e-03',
  'tree-e-04',
  'tree-e-05',
  'tree-e-06',
  'tree-e-07',
  'tree-e-08',
]);
export function eventCenterForecourtTreeProfile(
  tree: Pick<CommercialMapTree, 'id' | 'trunkHeight' | 'crownHeight'>,
) {
  if (!EVENT_CENTER_FRONT_TREE_IDS.has(tree.id)) return null;
  const crownLift = tree.crownHeight * 0.3;
  const trunkHeight = tree.trunkHeight + tree.crownHeight * 0.4;
  return {
    trunkRadiusScale: 0.43,
    branchRadiusScale: 0.3,
    branchSpreadScale: 0.8,
    barkColor: '#6f675a',
    crownLift,
    crownScaleY: 0.65,
    crownScaleXZ: 0.72,
    wood: {
      trunkHeight,
      branches: [0, 1].map((index) => ({
        startY: trunkHeight * (0.82 + index * 0.06),
        endY: tree.trunkHeight + crownLift + tree.crownHeight * (0.41 + index * 0.06),
      })),
    },
  };
}
