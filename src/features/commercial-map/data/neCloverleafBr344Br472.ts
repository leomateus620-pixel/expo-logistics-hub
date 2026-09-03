import { MAP_REFERENCE_HEIGHT, MAP_REFERENCE_WIDTH } from '../constants';
import { officialLocalPointToPdf } from './officialReference2026';
import {
  BR472_DIAGONAL_DX_PER_DZ,
  INTERCHANGE_ENVELOPES,
  REGIONAL_HIGHWAY_PALETTE,
  REGIONAL_HIGHWAY_PROFILE,
  br472MainlineXAt,
} from './regional-highways/contract';

/**
 * NE cloverleaf at BR-344 × BR-472 — isolated presentation mesh.
 *
 * Anexo 2 typology: classic cloverleaf. Four inner 270° looping ramps
 * (one per quadrant) plus four outer right-turn slips. Four small yellow
 * roundabouts at the inner corners. BR-344 overpass over at-grade BR-472.
 *
 * Placement is parametric on `INTERCHANGE_ENVELOPES.neCloverleaf` so a closer
 * BR-472 still carries this trevo. Dual-carriageway stubs use the shared
 * regional family (green / tan / yellow) without owning the long mainlines.
 */

export const NE_CLOVERLEAF_REVISION = '2026.10-ne-cloverleaf-anexo2.1';

export type LocalPoint = readonly [number, number];
export type SourcePoint = readonly [number, number];
export type NeCloverleafQuadrantId = 'nw' | 'ne' | 'se' | 'sw';

/**
 * Slice #118 published PDF [5936, -2100] ≈ local (56.42, -110.73), too close
 * to the park east edge. Folded onto the regional NE envelope (Anexo 2
 * distance: BR-472 at ~0.26 hub widths east; BR-344 2.25× hub height north).
 */
export const NE_CLOVERLEAF_PUBLISHED_CENTER_SOURCE = [5936, -2100] as const satisfies SourcePoint;

export const NE_CLOVERLEAF_CENTER_LOCAL = INTERCHANGE_ENVELOPES.neCloverleaf.center;

export const NE_CLOVERLEAF_CENTER_SOURCE = officialLocalPointToPdf(
  NE_CLOVERLEAF_CENTER_LOCAL,
) as SourcePoint;

const envelope = INTERCHANGE_ENVELOPES.neCloverleaf as {
  center: readonly [number, number];
  headingRadians?: number;
};

/** BR-472 bearing at the envelope (0 = +Z south). Falls back to the diagonal contract. */
export function neCloverleafHeadingRadians() {
  if (typeof envelope.headingRadians === 'number') return envelope.headingRadians;
  return Math.atan2(BR472_DIAGONAL_DX_PER_DZ, 1);
}

export const NE_CLOVERLEAF_COLORS = Object.freeze({
  highway: REGIONAL_HIGHWAY_PALETTE.carriageway,
  highwayAccent: REGIONAL_HIGHWAY_PALETTE.carriagewayGrain,
  shoulder: REGIONAL_HIGHWAY_PALETTE.shoulder,
  markings: '#f4f1e4',
  edgeLine: REGIONAL_HIGHWAY_PALETTE.edgeLine,
  roundabout: '#f2d021',
  roundaboutInnerLine: '#f8e56a',
  island: '#3e4f2c',
  islandRim: '#d9d4c6',
  soffit: '#6a6e66',
  barrier: '#8b8d84',
});

/**
 * Dual-carriageway family matches the thinned regional profile so the
 * overpass stubs land flush with BR-344 / BR-472.
 */
export const NE_CLOVERLEAF_LAYOUT = Object.freeze({
  revision: NE_CLOVERLEAF_REVISION,
  centerSource: NE_CLOVERLEAF_CENTER_SOURCE,
  centerLocal: NE_CLOVERLEAF_CENTER_LOCAL,
  headingRadians: neCloverleafHeadingRadians(),
  medianWidth: REGIONAL_HIGHWAY_PROFILE.medianWidth,
  carriagewayWidth: REGIONAL_HIGHWAY_PROFILE.dualCarriagewayWidth,
  shoulderWidth: REGIONAL_HIGHWAY_PROFILE.shoulderWidth,
  edgeLineWidth: REGIONAL_HIGHWAY_PROFILE.edgeLineWidth,
  stubLength: 12,
  roundaboutOuterRadius: 1.18,
  roundaboutIslandRadius: 0.46,
  roundaboutCurbWidth: 0.07,
  /** Inner-corner RABs, nestled between the two mainlines inside each leaf. */
  quadrantOffset: 3.05,
  innerRampWidth: REGIONAL_HIGHWAY_PROFILE.dualCarriagewayWidth,
  innerRampShoulder: REGIONAL_HIGHWAY_PROFILE.shoulderWidth * 0.72,
  outerRampWidth: REGIONAL_HIGHWAY_PROFILE.dualCarriagewayWidth * 0.96,
  outerRampShoulder: REGIONAL_HIGHWAY_PROFILE.shoulderWidth * 0.68,
  loopRadius: 5.05,
  goreGap: 0.055,
  goreLength: 1.18,
  atGradeElevation: 0.034,
  roundaboutElevation: 0.046,
  overpassElevation: 0.54,
  overpassDeckHalfSpan: 3.15,
  markingLift: 0.0042,
  shoulderDrop: 0.006,
  junctionLift: 0.0016,
  soffitThickness: 0.08,
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

export function neCloverleafMergeOffset() {
  return halfSep
    + NE_CLOVERLEAF_LAYOUT.carriagewayWidth / 2
    + NE_CLOVERLEAF_LAYOUT.goreGap
    + NE_CLOVERLEAF_LAYOUT.innerRampWidth / 2;
}

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

export function neCloverleafLoopCenter(id: NeCloverleafQuadrantId): LocalPoint {
  const quadrant = NE_CLOVERLEAF_QUADRANTS.find((entry) => entry.id === id)!;
  const merge = neCloverleafMergeOffset();
  return [
    cx + quadrant.signX * (merge + NE_CLOVERLEAF_LAYOUT.loopRadius),
    cz + quadrant.signZ * (merge + NE_CLOVERLEAF_LAYOUT.loopRadius),
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

function br472PointAt(z: number): LocalPoint {
  return [br472MainlineXAt(z), z];
}

/**
 * Landing points for the BR-472 / BR-344 mainlines. BR-472 stubs sit on the
 * live bearing (`br472MainlineXAt`) so a closer diagonal still meets flush.
 */
export const NE_CLOVERLEAF_STUBS = Object.freeze({
  br472North: Object.freeze({
    axis: br472PointAt(cz - stub) as LocalPoint,
    westCarriageway: [br472PointAt(cz - stub)[0] - halfSep, cz - stub] as LocalPoint,
    eastCarriageway: [br472PointAt(cz - stub)[0] + halfSep, cz - stub] as LocalPoint,
    heading: [0, -1] as LocalPoint,
    owner: 'BR-472' as const,
  }),
  br472South: Object.freeze({
    axis: br472PointAt(cz + stub) as LocalPoint,
    westCarriageway: [br472PointAt(cz + stub)[0] - halfSep, cz + stub] as LocalPoint,
    eastCarriageway: [br472PointAt(cz + stub)[0] + halfSep, cz + stub] as LocalPoint,
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
  return officialLocalPointToPdf([x, z]);
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
