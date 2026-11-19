import { EXPORURAL_SCENE_CORRECTIONS } from './exporuralSceneCorrections';

/** Offsets in scene units from the inventory trunk point and its live support. */
export type SpecimenKnot = readonly [x: number, y: number, z: number, radius: number];
export type SpecimenFoliageMass = readonly [
  x: number, y: number, z: number, radiusX: number, radiusY: number, radiusZ: number, tone: number,
];

interface SpecimenTreeProfile {
  barkPalette: readonly [string, string];
  foliagePalette: readonly [string, string, string, string];
  contactSize: readonly [number, number];
  limbs: readonly (readonly SpecimenKnot[])[];
  fineWood: readonly (readonly SpecimenKnot[])[];
  foliage: readonly SpecimenFoliageMass[];
}

export const ARVOREDO_LEANING_TREE_ID = 'tree-j-05';

// The slimmer trunks and gaps in IMG_1774 frame the portal. These silhouette
// scales follow three existing neighboring points in the same inventory row.
const ARVOREDO_TREE_VARIATION: Readonly<Partial<Record<string, { trunk: number; crown: number }>>> = {
  'tree-j-04': { trunk: .67, crown: .86 },
  'tree-j-06': { trunk: .69, crown: .83 },
  'tree-j-07': { trunk: .84, crown: .97 },
};

export function commercialArvoredoTreeVariation(id: string) {
  return ARVOREDO_TREE_VARIATION[id];
}

const TREE_SPECIMENS: Readonly<Partial<Record<string, SpecimenTreeProfile>>> = {
  // IMG_1764: low fork, broad asymmetric crown and visible scaffold limbs.
  // The crown reaches above the frontage of Gustavo Bessel. Its pole-facing
  // edge stops short of marker 146, without using the pole as an anchor.
  [EXPORURAL_SCENE_CORRECTIONS.tree.id]: {
    barkPalette: ['#504336', '#806b53'],
    foliagePalette: ['#a1ac70', '#8c9962', '#a4ad70', '#aaa269'],
    contactSize: [.31, .28],
    limbs: [
      [[0, -.012, 0, .111], [.018, .18, .018, .081], [.061, .34, .031, .070], [.122, .52, .055, .078], [.177, .75, .082, .063], [.21, 1.02, .08, .044], [.27, 1.33, .02, .029], [.22, 1.61, .08, .014], [.18, 1.91, .14, .003]],
      [[.056, .34, .028, .059], [-.14, .53, .065, .053], [-.37, .71, .09, .044], [-.64, .96, .16, .029], [-.92, 1.16, .21, .014], [-1.15, 1.36, .26, .003]],
      [[-.35, .70, .085, .035], [-.55, .88, -.084, .027], [-.74, 1.15, -.23, .016], [-.88, 1.54, -.31, .003]],
      [[.10, .48, .043, .058], [.32, .61, .025, .054], [.56, .76, -.085, .044], [.81, .88, -.24, .031], [1.09, .97, -.38, .018], [1.36, 1.13, -.43, .003]],
      [[.54, .75, -.08, .034], [.72, .98, -.17, .028], [.90, 1.18, -.25, .019], [1.10, 1.53, -.34, .003]],
      [[.16, .69, .074, .048], [.23, .88, .34, .037], [.37, 1.03, .56, .026], [.60, 1.26, .78, .015], [.65, 1.50, .86, .003]],
      [[.21, .95, .079, .034], [.11, 1.10, -.18, .026], [.01, 1.28, -.39, .019], [.16, 1.49, -.63, .009], [.20, 1.72, -.76, .003]],
      [[.23, 1.15, .05, .027], [.47, 1.33, .035, .021], [.70, 1.52, .005, .012], [.84, 1.82, .02, .002]],
      [[.14, .63, .064, .040], [-.02, .92, .29, .027], [-.13, 1.21, .50, .019], [-.25, 1.58, .69, .009], [-.34, 1.84, .73, .002]],
      [[.21, 1.01, .08, .03], [.01, 1.23, -.015, .019], [-.21, 1.42, -.03, .013], [-.34, 1.77, .03, .002]],
    ],
    fineWood: [
      [[0, .032, 0, .052], [-.061, .007, -.042, .037], [-.13, -.011, -.067, .003]],
      [[.013, .043, .016, .053], [.081, .01, .059, .030], [.152, -.014, .11, .003]],
      [[0, .051, .01, .046], [-.018, .018, .076, .026], [-.029, -.014, .145, .003]],
      [[-.63, .94, .16, .02], [-.89, 1.00, .38, .012], [-1.08, 1.12, .41, .002]],
      [[-.73, 1.12, -.22, .013], [-1.00, 1.24, -.27, .01], [-1.11, 1.44, -.29, .002]],
      [[.82, .89, -.24, .023], [.88, 1.05, -.53, .01], [.97, 1.29, -.68, .002]],
      [[1.10, .988, -.38, .012], [1.3, 1.10, -.30, .008], [1.41, 1.34, -.26, .002]],
      [[.58, 1.23, .76, .012], [.78, 1.36, .83, .01], [.88, 1.55, .85, .002]],
      [[.28, 1.32, .04, .021], [.49, 1.56, .29, .013], [.58, 1.80, .36, .002]],
      [[.21, 1.61, .08, .011], [.32, 1.83, .04, .008], [.47, 1.97, -.04, .002]],
      [[-.49, .83, .13, .023], [-.56, 1.06, .32, .018], [-.61, 1.26, .48, .010], [-.66, 1.46, .55, .002]],
      [[.50, .72, -.06, .030], [.64, .91, .03, .024], [.79, 1.10, .17, .013], [.98, 1.44, .37, .002]],
      [[.25, .92, .38, .025], [.17, 1.15, .57, .015], [.24, 1.29, .77, .009], [.29, 1.45, .94, .002]],
      [[.00, 1.27, -.38, .014], [-.20, 1.37, -.42, .010], [-.41, 1.49, -.49, .005], [-.54, 1.65, -.52, .002]],
      [[-.36, .69, .085, .030], [-.48, .83, -.09, .019], [-.56, .97, -.29, .010], [-.52, 1.27, -.45, .003]],
    ],
    foliage: [
      [-1.04, 1.36, .25, .33, .20, .39, 0], [-1.04, 1.14, .38, .29, .17, .25, 1],
      [-.87, 1.43, -.26, .37, .25, .32, 1], [-.68, 1.63, -.20, .36, .29, .39, 0],
      [-.63, 1.36, .49, .40, .25, .36, 2], [-.34, 1.74, .62, .40, .32, .39, 1],
      [-.43, 1.52, .14, .40, .24, .39, 0], [-.20, 1.89, .06, .36, .28, .32, 2],
      [.11, 1.97, .19, .43, .30, .36, 0], [.45, 2.02, -.05, .36, .24, .32, 2],
      [.22, 1.71, -.62, .36, .29, .42, 1], [-.16, 1.61, -.55, .32, .23, .30, 0],
      [.61, 1.76, .33, .35, .22, .33, 0], [.83, 1.70, .02, .36, .31, .38, 2],
      [.66, 1.45, .77, .42, .24, .35, 2], [.99, 1.47, .56, .30, .20, .27, 1],
      [1.11, 1.50, -.26, .37, .30, .37, 0], [1.30, 1.25, -.40, .37, .22, .31, 3],
      [.95, 1.22, -.62, .33, .19, .34, 1], [.59, 1.47, -.47, .34, .23, .35, 3],
    ],
  },
  // IMG_1769/1770/1773: broad horizontal foot and a tall fork, with the
  // lower limb pointing toward the portal. The row in the aerial inventory
  // locates this specimen approximately; its current pit is the fixed anchor.
  [ARVOREDO_LEANING_TREE_ID]: {
    barkPalette: ['#6b513c', '#ac9170'],
    foliagePalette: ['#a5b56a', '#b1bf72', '#92a359', '#bac170'],
    contactSize: [.255, .268],
    limbs: [
      [[0, -.012, 0, .132], [-.073, .034, .11, .133], [-.168, .074, .23, .128], [-.265, .135, .39, .117], [-.37, .22, .54, .106], [-.50, .37, .67, .084], [-.60, .62, .78, .067], [-.68, .94, .95, .049], [-.72, 1.28, 1.12, .027], [-.68, 1.66, 1.33, .004]],
      [[-.244, .123, .365, .094], [-.33, .30, .44, .091], [-.41, .57, .49, .083], [-.48, .86, .53, .069], [-.55, 1.14, .56, .053], [-.65, 1.49, .64, .039], [-.70, 1.87, .67, .024], [-.81, 2.18, .80, .015], [-.93, 2.56, .90, .003]],
      [[-.55, 1.12, .56, .044], [-.70, 1.31, .33, .037], [-.93, 1.53, .07, .031], [-1.12, 1.79, -.09, .020], [-1.25, 2.15, -.12, .003]],
      [[-.65, 1.44, .63, .034], [-.51, 1.63, .71, .028], [-.35, 1.91, .81, .017], [-.29, 2.28, 1.02, .003]],
      [[-.71, 1.24, 1.10, .025], [-.53, 1.42, 1.38, .021], [-.40, 1.65, 1.60, .015], [-.31, 1.98, 1.68, .003]],
      [[-.64, .89, .925, .035], [-.83, 1.07, 1.10, .029], [-1.08, 1.16, 1.29, .019], [-1.41, 1.40, 1.43, .003]],
      [[-.71, 1.88, .67, .019], [-.91, 2.04, .55, .016], [-1.12, 2.36, .44, .011], [-1.32, 2.67, .35, .003]],
    ],
    fineWood: [
      [[-.017, .031, .028, .062], [.066, .016, .073, .043], [.103, -.007, .103, .003]],
      [[-.022, .035, .032, .055], [-.068, .015, -.061, .038], [-.119, -.012, -.083, .003]],
      [[-.23, .11, .32, .069], [-.304, .109, .30, .054], [-.34, .081, .25, .037], [-.344, .066, .219, .029]],
      [[-.51, .39, .68, .052], [-.66, .47, .58, .041], [-.85, .55, .39, .021], [-1.05, .58, .22, .003]],
      [[-.45, .72, .52, .042], [-.63, .88, .45, .023], [-.72, 1.15, .46, .003]],
      [[-1.1, 1.80, -.08, .015], [-.95, 1.96, -.34, .009], [-1.02, 2.22, -.51, .003]],
      [[-.80, 2.14, .78, .014], [-.72, 2.4, 1.16, .011], [-.71, 2.58, 1.30, .003]],
      [[-.42, 1.63, 1.59, .013], [-.24, 1.83, 1.63, .007], [-.14, 2.08, 1.61, .002]],
    ],
    foliage: [
      [-.14, 2.05, 1.55, .35, .27, .39, 1], [-.49, 2.0, 1.57, .45, .29, .42, 0],
      [-.78, 1.78, 1.33, .41, .28, .36, 0], [-1.08, 1.53, 1.34, .44, .25, .36, 2],
      [-1.38, 1.54, 1.47, .38, .25, .33, 0], [-1.37, 1.85, 1.30, .36, .25, .36, 1],
      [-.22, 2.32, .97, .45, .31, .41, 2], [-.49, 2.43, .71, .39, .32, .39, 0],
      [-.71, 2.60, 1.14, .40, .34, .43, 0], [-.94, 2.60, .86, .43, .36, .45, 1],
      [-1.24, 2.69, .36, .41, .33, .37, 2], [-1.52, 2.48, .27, .34, .27, .40, 0],
      [-1.19, 2.18, -.13, .40, .30, .39, 1], [-.87, 2.20, -.41, .44, .29, .38, 0],
      [-.88, 2.31, .18, .41, .28, .43, 0], [-.50, 2.14, .26, .36, .29, .42, 2],
      [-.56, 2.77, .79, .32, .28, .38, 3], [-1.04, 2.92, .61, .42, .26, .37, 2],
      [-1.05, 2.26, 1.41, .37, .30, .42, 3], [-.68, 1.62, 1.05, .34, .27, .28, 1],
    ],
  },
};

export function commercialTreeSpecimenProfile(id: string) {
  return TREE_SPECIMENS[id];
}

/** One renderer owns each registered tree at every distance and quality. */
export function partitionCommercialTreeSpecimens<T extends { id: string }>(trees: readonly T[]) {
  const instances: T[] = [];
  const specimens: { tree: T; profile: SpecimenTreeProfile }[] = [];
  for (const tree of trees) {
    const profile = commercialTreeSpecimenProfile(tree.id);
    if (profile) specimens.push({ tree, profile });
    else instances.push(tree);
  }
  return { instances, specimens };
}

/** Short cylindrical slices follow the limb knots without blocking the
 * open space under a rising branch or around the pavement opening. */
export function commercialTreeSpecimenLimbColliders(profile: SpecimenTreeProfile) {
  return profile.limbs.flatMap(path => path.slice(1).flatMap((end, index) => {
    const start = path[index];
    const reach = Math.hypot(end[0] - start[0], end[2] - start[2]);
    const count = Math.max(1, Math.ceil(reach / Math.max(.06, (start[3] + end[3]) * .8)));
    return Array.from({ length: count }, (_, slice) => {
      const t = (slice + .5) / count;
      const [x, y, z, radius] = start.map((value, axis) => value + (end[axis] - value) * t);
      const halfHeight = Math.abs(end[1] - start[1]) / (2 * count) + radius * .65;
      return { x, z, radius: Math.hypot(radius, reach / (2 * count)), bottom: y - halfHeight, top: y + halfHeight };
    });
  }));
}

export type { SpecimenTreeProfile };
