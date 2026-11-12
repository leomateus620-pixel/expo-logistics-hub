import { EXPORURAL_MAP_UNITS_PER_METER } from './exporuralReference2026';
import { officialPdfPointToLocal } from './officialReference2026';

// Approximate metres from the avenue frontage, across towards the Etnias (+X)
// and away from the avenue towards the field (+Z). See docs/validation/entorno-etnias.
export type SitePoint = readonly [x: number, z: number];
export type SiteRing = readonly SitePoint[];
export type RoofPoint = readonly [x: number, z: number, rise: number];

export interface SiteBuildingSection {
  wallTop: readonly RoofPoint[];
  eaves: number;
  roofEdge: readonly RoofPoint[];
  roofFaces: readonly (readonly RoofPoint[])[];
  finish: 'gray' | 'zinc' | 'hip' | 'slab';
}

const origin = officialPdfPointToLocal([3825, 4235]);
export const ETNIAS_SITE_METERS_TO_WORLD = EXPORURAL_MAP_UNITS_PER_METER;

export function etniasAdjacentSitePointToWorld([x, z]: SitePoint): SitePoint {
  return [origin[0] + x * ETNIAS_SITE_METERS_TO_WORLD, origin[1] + z * ETNIAS_SITE_METERS_TO_WORLD];
}

export const ETNIAS_SITE_PERIMETER: SiteRing = [
  [0, 0], [95.8, 0], [96.52, 104.38], [-0.55, 104.38],
];

type Bounds = readonly [left: number, front: number, right: number, back: number];
const rectangle = ([left, front, right, back]: Bounds): SiteRing => (
  [[left, front], [right, front], [right, back], [left, back]]
);

function roofSection(
  roof: Bounds,
  walls: Bounds,
  eaves: number,
  rise: number,
  ridge: 'x' | 'z',
  finish: SiteBuildingSection['finish'],
): SiteBuildingSection {
  const corners = (bounds: Bounds) => rectangle(bounds).map(([x, z]): RoofPoint => [x, z, 0]);
  const outline = (bounds: Bounds) => {
    const [a, b, c, d] = corners(bounds);
    const x = (a[0] + c[0]) / 2;
    const z = (a[1] + c[1]) / 2;
    const start: RoofPoint = ridge === 'x' ? [a[0], z, rise] : [x, a[1], rise];
    const end: RoofPoint = ridge === 'x' ? [b[0], z, rise] : [x, c[1], rise];
    return { corners: [a, b, c, d], start, end };
  };
  const edge = (bounds: Bounds) => {
    const { corners: [a, b, c, d], start, end } = outline(bounds);
    if (!rise) return [a, b, c, d];
    return ridge === 'x' ? [a, b, end, c, d, start] : [a, start, b, c, end, d];
  };
  const { corners: [a, b, c, d], start, end } = outline(roof);
  const roofFaces = !rise ? [[a, b, c, d]] : ridge === 'x'
    ? [[a, b, end, start], [start, end, c, d]]
    : [[a, start, end, d], [start, b, c, end]];
  return { wallTop: edge(walls), eaves, roofEdge: edge(roof), roofFaces, finish };
}

// The light metal run wraps the two gray wings. Roof bounds include overhangs.
// Wall bounds meet at the joints between the wings and the long rear volume.
export const ETNIAS_SITE_LARGE_BUILDING: readonly SiteBuildingSection[] = [
  roofSection([12.2, 31.5, 21.4, 37.7], [12.48, 31.8, 21.14, 37.62], 4.25, 0, 'z', 'slab'),
  roofSection([11.6, 37.5, 21.9, 56.2], [11.92, 37.62, 21.71, 56.12], 3.65, 0.58, 'z', 'gray'),
  roofSection([21.5, 37.6, 30.5, 44.5], [21.71, 37.86, 30.48, 44.4], 3.52, 0.24, 'x', 'gray'),
  roofSection([23.8, 33.5, 30.3, 37.88], [24.02, 33.76, 30.19, 37.86], 4.05, 0, 'z', 'slab'),
  roofSection([30.35, 31.4, 38.15, 47.6], [30.48, 31.72, 37.84, 47.52], 3.92, 0.63, 'z', 'gray'),
  roofSection([21.48, 44.24, 30.66, 56.34], [21.71, 44.4, 30.57, 56.12], 3.95, 0.78, 'z', 'zinc'),
  roofSection([30.54, 47.36, 38.25, 54.18], [30.57, 47.52, 37.96, 54.03], 3.75, 0.48, 'x', 'zinc'),
  roofSection([30.55, 53.95, 41.1, 56.37], [30.57, 54.03, 40.75, 56.12], 3.22, 0, 'x', 'slab'),
  roofSection([10.6, 56, 39.75, 63.4], [10.97, 56.12, 39.39, 63.06], 3.3, 0.84, 'x', 'gray'),
];

// The main ridge runs along the long axis. Valleys connect it to the two
// returns, leaving the entrance side recessed alongside the pale canopy.
const a: RoofPoint = [55.5, 34.6, 0];
const b: RoofPoint = [61.5, 34.6, 0];
const c: RoofPoint = [61.5, 36.6, 0];
const d: RoofPoint = [68.9, 36.6, 0];
const e: RoofPoint = [68.9, 57.2, 0];
const f: RoofPoint = [61.3, 57.2, 0];
const g: RoofPoint = [61.3, 59.9, 0];
const h: RoofPoint = [51.8, 59.9, 0];
const i: RoofPoint = [51.8, 52.3, 0];
const j: RoofPoint = [54.4, 49.2, 0];
const k: RoofPoint = [55.5, 45.4, 0];
const frontRidge: RoofPoint = [58.4, 38.3, 1.15];
const mainRidgeStart: RoofPoint = [62.2, 42.2, 2.1];
const mainRidgeEnd: RoofPoint = [62.2, 51.8, 2.1];
const rearRidge: RoofPoint = [57.0, 55.8, 1.22];

export const ETNIAS_SITE_SMALL_BUILDING: SiteBuildingSection = {
  wallTop: [
    [55.9, 35, 0], [61.15, 35, 0], [61.15, 37, 0], [68.52, 37, 0], [68.52, 56.82, 0],
    [60.92, 56.82, 0], [60.92, 59.52, 0], [52.18, 59.52, 0], [52.18, 52.45, 0],
    [54.76, 49.32, 0], [55.9, 45.5, 0],
  ],
  eaves: 3.25,
  roofEdge: [a, b, c, d, e, f, g, h, i, j, k],
  roofFaces: [
    [a, b, frontRidge], [b, c, mainRidgeStart, frontRidge], [c, d, mainRidgeStart],
    [d, e, mainRidgeEnd, mainRidgeStart], [e, f, mainRidgeEnd], [f, g, rearRidge, mainRidgeEnd],
    [g, h, rearRidge], [h, i, rearRidge], [i, j, mainRidgeEnd, rearRidge],
    [j, k, mainRidgeStart, mainRidgeEnd], [k, a, frontRidge, mainRidgeStart],
  ],
  finish: 'hip',
};

export const ETNIAS_SITE_ENTRY_CANOPY = {
  eaves: 2.65,
  roofEdge: [
    [52.95, 41.2, 0], [55.94, 41.2, 0], [55.94, 45.8, 0], [54.8, 49.55, 0],
    [52.18, 52.7, 0], [51.2, 51.85, 0], [53.05, 48.7, 0],
  ] satisfies readonly RoofPoint[],
  supports: [[53.2, 41.55], [51.8, 51.8]] satisfies readonly SitePoint[],
};

export const ETNIAS_SITE_OUTBUILDING = roofSection(
  [28.6, 68.6, 33.6, 73.0], [28.92, 68.89, 33.25, 72.69], 2.65, 0, 'x', 'slab',
);

export const ETNIAS_SITE_DRIVE: SiteRing = [
  [39.2, -0.08], [45.7, -0.08], [45.8, 7.2], [46.0, 16.3], [46.5, 25.5],
  [47.5, 33.4], [49.2, 42.0], [49.7, 47.0], [48.7, 49.2], [46.7, 48.1],
  [45.4, 41.1], [44.3, 33.8], [43.0, 26.2], [40.8, 16.6], [39.7, 7.2],
];

export const ETNIAS_SITE_FORECOURT: SiteRing = [
  [2.8, 15.5], [11.2, 14.2], [29.9, 14.0], [36.2, 7.5], [39.9, 7.8], [44.7, 16.0], [44.6, 27.05],
  [37.6, 27.9], [10.3, 27.9], [6.4, 36.1], [2.7, 35.3],
];

export const ETNIAS_SITE_WALKS: readonly SiteRing[] = [
  [[45.6, 33.4], [47.3, 33.9], [55.8, 42.1], [54.2, 43.5], [45.4, 35.8]],
  [[47, 45.7], [54.2, 44.2], [54.55, 45.8], [47.1, 47.35]],
  [[10.0, 26.8], [38.9, 26.8], [39.4, 31.5], [37.6, 31.5], [36.7, 28.8], [10.0, 28.8]],
  rectangle([12.6, 28.7, 19.1, 31.91]),
  rectangle([29.7, 71.9, 32.7, 76.65]),
];

// Positions follow the visible bases. Sizes and tilts are approximate.
export const ETNIAS_SITE_CIRCULAR_EQUIPMENT = [
  { center: [47.5, 67.6], radius: 1.55, height: 1.65, tilt: 0.42, heading: -0.45 },
  { center: [59.0, 72.9], radius: 1.43, height: 1.85, tilt: 0.34, heading: 0.25 },
  { center: [49.7, 81.2], radius: 1.9, height: 1.72, tilt: 0.28, heading: 0.75 },
] as const;
export const ETNIAS_SITE_VERTICAL_SUPPORT = { center: [47.3, 76.8], height: 8.5 } as const;

// [x, z, height, crown radius], in metres. Leave the centre and rear lawn open.
export const ETNIAS_SITE_FORECOURT_TREES = [
  [13.6, 18.0, 8.9, 4.8], [22.2, 19.4, 9.5, 5.4], [32.7, 17.4, 8.1, 4.8],
] as const;

export const ETNIAS_SITE_TREES = [
  // Avenue and the group on the west side of the access.
  [5.6, 9.7, 7.5, 3.7], [29.6, 10.8, 11, 5.1], [18.2, 24, 8.3, 4.3],
  ...ETNIAS_SITE_FORECOURT_TREES,
  [50.1, 4.6, 11.1, 5.4], [57.5, 5.7, 10.1, 6.1], [66.3, 5.2, 11.5, 6.6],
  [75.4, 5.1, 12.4, 7.4], [84.8, 5.7, 10.6, 6.3], [91.8, 6.4, 9.1, 5.6],
  [60.8, 11.4, 8.1, 5.2], [71.5, 12.2, 10.1, 5.9], [81.1, 12.9, 9.2, 5.3],
  // Side vegetation, set back from the walls and walks.
  [4.0, 43.2, 7.7, 4.3], [4.8, 52.1, 9.4, 5.0], [5.2, 61.7, 9.8, 5.4],
  [4.4, 68.9, 8.2, 4.7], [92.4, 29.5, 9.4, 5.2], [92.8, 39.6, 10.6, 6.0],
  [91.2, 48.8, 9.9, 5.4],
  // Field edge continues the existing trees behind Q5. Trunks stay in the site.
  [17.8, 101.9, 7.5, 4.4], [25.8, 100.0, 10.2, 5.6], [33.5, 102.8, 6.4, 3.6],
  [41.3, 100.5, 9.1, 5.3], [48.1, 102.8, 7.4, 4.4], [56.2, 99.7, 10.3, 5.1],
  [64.5, 97.9, 12.5, 6.4], [72.7, 100.2, 11.1, 6.2], [80.3, 103.4, 6.5, 4.4],
  [87.7, 103.1, 7.4, 4.7], [93.2, 101.2, 8.6, 5.0],
] as const;
