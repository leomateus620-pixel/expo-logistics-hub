import type { CommercialMapTree } from '../data/commercialTrees';
import { isPavilion12FrontTreeId } from '../data/pavilion12FrontTrees';

/** Local Y coordinates above the existing ground support. Crown centres and
 * canonical tree positions remain unchanged. These three leaf-card canopies
 * need the stem and forks to penetrate the foliage instead of ending below it.
 */
export function commercialTreeWoodStructure(tree: Pick<CommercialMapTree, 'id' | 'trunkHeight' | 'crownHeight'>) {
  const connected = isPavilion12FrontTreeId(tree.id);
  const trunkHeight = tree.trunkHeight + (connected ? tree.crownHeight * 0.48 : 0);
  return {
    trunkHeight,
    branches: [0, 1].map(index => {
      const startY = trunkHeight * (0.58 + index * 0.08);
      return {
        startY,
        endY: connected
          ? tree.trunkHeight + tree.crownHeight * (0.38 + index * 0.05)
          : startY + tree.crownHeight * (0.34 + index * 0.045),
      };
    }),
  };
}
