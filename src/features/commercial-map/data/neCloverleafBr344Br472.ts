import { MAP_REFERENCE_HEIGHT, MAP_REFERENCE_WIDTH } from '../constants';
import { officialPdfPointToLocal } from './officialReference2026';

/**
 * NE cloverleaf at BR-344 × BR-472 — isolated presentation mesh.
 *
 * Agent #3 of 4. Does not own the long BR-472 (Agent #1) or BR-344 (Agent #2)
 * mainlines. Short dual-carriageway stubs exist only so the ramps have
 * somewhere to land. Park interior, rear roads, Brasília, Ubiretama, Portão 5
 * and CommercialMapCanvas stay untouched.
 *
 * Placement: far north of the official park crop, on the extrapolated BR-472
 * bearing, where that N–S highway meets the E–W BR-344. Local +X is east,
 * local +Z is south.
 *
 * Mount (Agent #1 bounds, one-liners — this module does not edit the canvas):
 *   support points: ...NE_CLOVERLEAF_SCENE_SUPPORT_POINTS
 *   scene: <NeCloverleafInterchange reducedGraphics={reducedGraphics} />
 */

export const NE_CLOVERLEAF_REVISION = '2026.9-ne-cloverleaf-br344-br472.1';

export type LocalPoint = readonly [number, number];
export type SourcePoint = readonly [number, number];
export type NeCloverleafQuadrantId = 'nw' | 'ne' | 'se' | 'sw';

/** Official PDF point of the crossing. Y is north of the park crop (y < 900). */
export const NE_CLOVERLEAF_CENTER_SOURCE = [5936, -2100] as const satisfies SourcePoint;

/**
 * BR-472 cadastral north is [6046, 1300] with a slight eastward drift going
 * south (Δx/Δy ≈ 26/800). This center continues that bearing so Agent #1 can
 * extend a single N–S spline onto `stubs.br472South`.
 */
export const NE_CLOVERLEAF_CENTER_LOCAL = officialPdfPointToLocal(
  NE_CLOVERLEAF_CENTER_SOURCE,
) as LocalPoint;

export const NE_CLOVERLEAF_COLORS = Object.freeze({
  /** Dual-carriageway pavement — model stills use a vivid highway green. */
  highway: '#3db54a',
  highwayAccent: '#2f9a3c',
  shoulder: '#c4ae7e',
  markings: '#f4f1e4',
  /** Four small circular junctions from the model. */
  roundabout: '#f2d021',
  roundaboutInnerLine: '#f8e56a',
  island: '#3e4f2c',
  islandRim: '#d9d4c6',
  soffit: '#5e635a',
});

export const NE_CLOVERLEAF_LAYOUT = Object.freeze({
  revision: NE_CLOVERLEAF_REVISION,
  centerSource: NE_CLOVERLEAF_CENTER_SOURCE,
  centerLocal: NE_CLOVERLEAF_CENTER_LOCAL,
  /** Dual-carriageway half-spacing from interchange centre to lane centre. */
  medianWidth: 0.52,
  carriagewayWidth: 1.18,
  shoulderWidth: 0.28,
  /** Short stubs only — not the long federal mainlines. */
  stubLength: 11,
  roundaboutOuterRadius: 1.92,
  roundaboutIslandRadius: 0.74,
  roundaboutCurbWidth: 0.075,
  /** Axis offset of each yellow roundabout from the crossing. */
  quadrantOffset: 7.1,
  innerRampWidth: 0.94,
  innerRampShoulder: 0.2,
  outerRampWidth: 1.02,
  outerRampShoulder: 0.22,
  outerLoopRadius: 8.45,
  atGradeElevation: 0.034,
  roundaboutElevation: 0.049,
  overpassElevation: 0.54,
  overpassDeckHalfSpan: 3.35,
  markingLift: 0.0042,
  shoulderDrop: 0.006,
  junctionLift: 0.0018,
  soffitThickness: 0.085,
  identities: Object.freeze({
    br344: 'BR-344',
    br472: 'BR-472',
    crossing: 'BR-344 × BR-472',
  }),
});

export const NE_CLOVERLEAF_BUDGET = Object.freeze({
  maximumTriangles: 36_000,
  maximumBaseDrawCalls: 8,
  maximumStubLength: 12,
  minimumParkClearance: 40,
});

const [cx, cz] = NE_CLOVERLEAF_CENTER_LOCAL;
const halfSep = NE_CLOVERLEAF_LAYOUT.medianWidth / 2
  + NE_CLOVERLEAF_LAYOUT.carriagewayWidth / 2;
const stub = NE_CLOVERLEAF_LAYOUT.stubLength;

export const NE_CLOVERLEAF_HALF_SEPARATION = halfSep;

export const NE_CLOVERLEAF_QUADRANTS = Object.freeze([
  Object.freeze({ id: 'nw' as const, signX: -1 as const, signZ: -1 as const }),
  Object.freeze({ id: 'ne' as const, signX: 1 as const, signZ: -1 as const }),
  Object.freeze({ id: 'se' as const, signX: 1 as const, signZ: 1 as const }),
  Object.freeze({ id: 'sw' as const, signX: -1 as const, signZ: 1 as const }),
]);

export function neCloverleafRoundaboutCenter(id: NeCloverleafQuadrantId): LocalPoint {
  const quadrant = NE_CLOVERLEAF_QUADRANTS.find((entry) => entry.id === id)!;
  return [
    cx + quadrant.signX * NE_CLOVERLEAF_LAYOUT.quadrantOffset,
    cz + quadrant.signZ * NE_CLOVERLEAF_LAYOUT.quadrantOffset,
  ];
}

export const NE_CLOVERLEAF_ROUNDABOUT_CENTERS = Object.freeze(
  Object.fromEntries(
    NE_CLOVERLEAF_QUADRANTS.map((quadrant) => [
      quadrant.id,
      neCloverleafRoundaboutCenter(quadrant.id),
    ]),
  ) as Record<NeCloverleafQuadrantId, LocalPoint>,
);

/**
 * Landing points for Agents #1 (BR-472) and #2 (BR-344). Each stub is a dual
 * carriageway: two lane centres plus the median. Coordinates are local XZ.
 */
export const NE_CLOVERLEAF_STUBS = Object.freeze({
  br472North: Object.freeze({
    axis: [cx, cz - stub] as LocalPoint,
    westCarriageway: [cx - halfSep, cz - stub] as LocalPoint,
    eastCarriageway: [cx + halfSep, cz - stub] as LocalPoint,
    heading: [0, -1] as LocalPoint,
    owner: 'BR-472' as const,
  }),
  br472South: Object.freeze({
    axis: [cx, cz + stub] as LocalPoint,
    westCarriageway: [cx - halfSep, cz + stub] as LocalPoint,
    eastCarriageway: [cx + halfSep, cz + stub] as LocalPoint,
    heading: [0, 1] as LocalPoint,
    owner: 'BR-472' as const,
  }),
  br344West: Object.freeze({
    axis: [cx - stub, cz] as LocalPoint,
    northCarriageway: [cx - stub, cz - halfSep] as LocalPoint,
    southCarriageway: [cx - stub, cz + halfSep] as LocalPoint,
    heading: [-1, 0] as LocalPoint,
    owner: 'BR-344' as const,
  }),
  br344East: Object.freeze({
    axis: [cx + stub, cz] as LocalPoint,
    northCarriageway: [cx + stub, cz - halfSep] as LocalPoint,
    southCarriageway: [cx + stub, cz + halfSep] as LocalPoint,
    heading: [1, 0] as LocalPoint,
    owner: 'BR-344' as const,
  }),
});

export const NE_CLOVERLEAF_SCENE_SUPPORT_POINTS = Object.freeze([
  { position: [cx, cz] as const, height: NE_CLOVERLEAF_LAYOUT.overpassElevation + 0.6 },
  { position: NE_CLOVERLEAF_STUBS.br472North.axis, height: 0.8 },
  { position: NE_CLOVERLEAF_STUBS.br472South.axis, height: 0.8 },
  { position: NE_CLOVERLEAF_STUBS.br344West.axis, height: 0.8 },
  { position: NE_CLOVERLEAF_STUBS.br344East.axis, height: 0.8 },
  ...NE_CLOVERLEAF_QUADRANTS.map((quadrant) => ({
    position: neCloverleafRoundaboutCenter(quadrant.id),
    height: 0.7,
  })),
]);

export function neCloverleafLocalToSource([x, z]: LocalPoint): SourcePoint {
  const crop = { x: 600, y: 900, width: 5500, height: 4150 };
  return [
    ((x + MAP_REFERENCE_WIDTH / 2) / MAP_REFERENCE_WIDTH) * crop.width + crop.x,
    ((z + MAP_REFERENCE_HEIGHT / 2) / MAP_REFERENCE_HEIGHT) * crop.height + crop.y,
  ];
}

export function neCloverleafParkBounds() {
  return {
    minX: -MAP_REFERENCE_WIDTH / 2,
    maxX: MAP_REFERENCE_WIDTH / 2,
    minZ: -MAP_REFERENCE_HEIGHT / 2,
    maxZ: MAP_REFERENCE_HEIGHT / 2,
  } as const;
}

export function neCloverleafClearanceFromPark(point: LocalPoint) {
  const park = neCloverleafParkBounds();
  const dx = point[0] < park.minX
    ? park.minX - point[0]
    : point[0] > park.maxX
      ? point[0] - park.maxX
      : 0;
  const dz = point[1] < park.minZ
    ? park.minZ - point[1]
    : point[1] > park.maxZ
      ? point[1] - park.maxZ
      : 0;
  if (dx === 0 && dz === 0) return 0;
  if (dx === 0) return dz;
  if (dz === 0) return dx;
  return Math.hypot(dx, dz);
}
