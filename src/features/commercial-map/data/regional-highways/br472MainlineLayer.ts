import { officialPdfPointToLocal } from '../officialReference2026';
import { REAR_OFFICIAL_ANCHORS } from '../../utils/rearSpatialCalibration';
import { NE_CLOVERLEAF_STUBS } from '../neCloverleafBr344Br472';
import {
  SE_CLOVERLEAF_CENTER_LOCAL,
  SE_CLOVERLEAF_JOIN_LOCAL,
  SE_CLOVERLEAF_LAYOUT,
  seCloverleafWestTerminusPoint,
} from '../seCloverleaf';
import {
  BR344_RESERVED_ALIGNMENT,
  INTERCHANGE_ENVELOPES,
  PARK_LOCAL_BOUNDS,
  REGIONAL_HIGHWAY_PROFILE,
  br472MainlineXAt,
  headingAlongPolyline,
  pointAlongPolyline,
  polylineLength,
  type LocalPoint,
  type RegionalHighwayLabel,
  type RegionalHighwayLayer,
  type RegionalHighwaySegment,
} from './contract';

/**
 * Exterior BR-472 — Integrator / Agent #1.
 *
 * N–S east of the hub at ~0.5 park widths, slight south-west diagonal, then
 * E–W south of the park. A pair of ramps aims at the inherited A5 trevo
 * without moving a single interior vertex.
 */

function xz(x: number, z: number): LocalPoint {
  return [x, z];
}

function point(z: number): LocalPoint {
  return xz(br472MainlineXAt(z), z);
}

const NE = INTERCHANGE_ENVELOPES.neCloverleaf.center;
const SE = INTERCHANGE_ENVELOPES.seCloverleaf.center;
const A5_JUNCTION = officialPdfPointToLocal(REAR_OFFICIAL_ANCHORS.br472Junction);
const A5_NORTH_RAMP = officialPdfPointToLocal(REAR_OFFICIAL_ANCHORS.br472NorthRampJunction);
const A5_SOUTH_RAMP = officialPdfPointToLocal(REAR_OFFICIAL_ANCHORS.br472SouthRampJunction);

const NORTH_TERMINUS_Z = NE[1] - 46;
const SOUTH_THROUGH_Z = SE[1] + 72;
const WEST_TERMINUS_X = PARK_LOCAL_BOUNDS.minX - 36;
const WEST_RUN_Z = SE[1] + 36;
const NE_NORTH = NE_CLOVERLEAF_STUBS.br472North.axis;
const NE_SOUTH = NE_CLOVERLEAF_STUBS.br472South.axis;
const SE_WEST = seCloverleafWestTerminusPoint();
const SE_SOUTH_Z = SE_CLOVERLEAF_CENTER_LOCAL[1] + SE_CLOVERLEAF_LAYOUT.slipRadius + 1.4;

/**
 * N–S corridor excluding the NE cloverleaf interior. Concatenated so park-latitude
 * tests still see a single polyline; drawn as two segments so the interchange
 * mesh is not double-stroked.
 */
export const BR472_NORTH_OF_NE_CENTERLINE = Object.freeze([
  point(NORTH_TERMINUS_Z),
  xz(NE_NORTH[0], NE_NORTH[1]),
] satisfies LocalPoint[]);

export const BR472_NE_TO_SE_CENTERLINE = Object.freeze([
  xz(NE_SOUTH[0], NE_SOUTH[1]),
  point(PARK_LOCAL_BOUNDS.minZ - 18),
  point(PARK_LOCAL_BOUNDS.minZ),
  point(0),
  xz(br472MainlineXAt(A5_JUNCTION[1]), A5_JUNCTION[1]),
  point(PARK_LOCAL_BOUNDS.maxZ),
  xz(SE_CLOVERLEAF_JOIN_LOCAL[0], SE_CLOVERLEAF_JOIN_LOCAL[1]),
] satisfies LocalPoint[]);

export const BR472_NORTH_SOUTH_CENTERLINE = Object.freeze([
  ...BR472_NORTH_OF_NE_CENTERLINE,
  ...BR472_NE_TO_SE_CENTERLINE,
] satisfies LocalPoint[]);

export const BR472_SOUTH_WEST_CENTERLINE = Object.freeze([
  xz(SE_WEST[0], SE_WEST[1]),
  xz(SE_WEST[0] - 18, WEST_RUN_Z - 4),
  xz(20, WEST_RUN_Z),
  xz(-24, WEST_RUN_Z + 1),
  xz(WEST_TERMINUS_X, WEST_RUN_Z + 2),
] satisfies LocalPoint[]);

export const BR472_SOUTH_THROUGH_CENTERLINE = Object.freeze([
  xz(br472MainlineXAt(SE_SOUTH_Z), SE_SOUTH_Z),
  xz(br472MainlineXAt(SE[1] + 24), SE[1] + 24),
  xz(br472MainlineXAt(SOUTH_THROUGH_Z), SOUTH_THROUGH_Z),
] satisfies LocalPoint[]);

function a5HookStem(): readonly LocalPoint[] {
  const startX = Math.max(
    REGIONAL_HIGHWAY_PROFILE.interiorClearanceX + REGIONAL_HIGHWAY_PROFILE.connectorWidth / 2,
    A5_JUNCTION[0] + 2.4,
  );
  const midX = (startX + br472MainlineXAt(A5_JUNCTION[1])) / 2;
  return Object.freeze([
    xz(startX, A5_JUNCTION[1]),
    xz(startX + (midX - startX) * 0.42, A5_JUNCTION[1] - 0.15),
    xz(midX, A5_JUNCTION[1] - 0.35),
  ] satisfies LocalPoint[]);
}

function a5NorthMerge(): readonly LocalPoint[] {
  const stem = a5HookStem();
  const mergeZ = (A5_NORTH_RAMP[1] + PARK_LOCAL_BOUNDS.minZ) / 2;
  return Object.freeze([
    stem[stem.length - 1],
    xz(stem[stem.length - 1][0] + 14, A5_JUNCTION[1] - 8),
    xz(br472MainlineXAt(mergeZ) - 0.2, mergeZ),
    point(mergeZ - 6),
  ] satisfies LocalPoint[]);
}

function a5SouthMerge(): readonly LocalPoint[] {
  const stem = a5HookStem();
  const mergeZ = (A5_SOUTH_RAMP[1] + PARK_LOCAL_BOUNDS.maxZ) / 2;
  return Object.freeze([
    stem[stem.length - 1],
    xz(stem[stem.length - 1][0] + 13, A5_JUNCTION[1] + 9),
    xz(br472MainlineXAt(mergeZ) - 0.2, mergeZ),
    point(mergeZ + 6),
  ] satisfies LocalPoint[]);
}

function labelOn(
  id: string,
  path: readonly LocalPoint[],
  t: number,
): RegionalHighwayLabel {
  const distance = polylineLength(path) * t;
  const position = pointAlongPolyline(path, distance);
  return Object.freeze({
    id,
    text: 'BR-472',
    position,
    headingRadians: headingAlongPolyline(path, distance),
  });
}

const northOfNe = BR472_NORTH_OF_NE_CENTERLINE;
const neToSe = BR472_NE_TO_SE_CENTERLINE;
const southWest = BR472_SOUTH_WEST_CENTERLINE;
const southThrough = BR472_SOUTH_THROUGH_CENTERLINE;
const hookStem = a5HookStem();
const hookNorth = a5NorthMerge();
const hookSouth = a5SouthMerge();

export const BR472_A5_HOOK = Object.freeze({
  stem: hookStem,
  northMerge: hookNorth,
  southMerge: hookSouth,
  aim: Object.freeze({
    junction: A5_JUNCTION,
    northRamp: A5_NORTH_RAMP,
    southRamp: A5_SOUTH_RAMP,
  }),
});

export const BR472_EXTERIOR_SEGMENTS: readonly RegionalHighwaySegment[] = Object.freeze([
  Object.freeze({
    id: 'br472-exterior-north-of-ne',
    highwayId: 'BR-472' as const,
    kind: 'mainline' as const,
    centerline: northOfNe,
  }),
  Object.freeze({
    id: 'br472-exterior-ne-to-se',
    highwayId: 'BR-472' as const,
    kind: 'mainline' as const,
    centerline: neToSe,
  }),
  Object.freeze({
    id: 'br472-exterior-south-west',
    highwayId: 'BR-472' as const,
    kind: 'mainline' as const,
    centerline: southWest,
  }),
  Object.freeze({
    id: 'br472-exterior-south-through',
    highwayId: 'BR-472' as const,
    kind: 'stub' as const,
    centerline: southThrough,
  }),
  Object.freeze({
    id: 'br472-a5-hook-stem',
    highwayId: 'BR-472' as const,
    kind: 'connector' as const,
    centerline: hookStem,
    carriagewayWidth: REGIONAL_HIGHWAY_PROFILE.connectorWidth,
    shoulderWidth: REGIONAL_HIGHWAY_PROFILE.connectorShoulderWidth,
  }),
  Object.freeze({
    id: 'br472-a5-hook-north',
    highwayId: 'BR-472' as const,
    kind: 'ramp' as const,
    centerline: hookNorth,
    carriagewayWidth: REGIONAL_HIGHWAY_PROFILE.connectorWidth,
    shoulderWidth: REGIONAL_HIGHWAY_PROFILE.connectorShoulderWidth,
  }),
  Object.freeze({
    id: 'br472-a5-hook-south',
    highwayId: 'BR-472' as const,
    kind: 'ramp' as const,
    centerline: hookSouth,
    carriagewayWidth: REGIONAL_HIGHWAY_PROFILE.connectorWidth,
    shoulderWidth: REGIONAL_HIGHWAY_PROFILE.connectorShoulderWidth,
  }),
]);

export const BR472_EXTERIOR_LABELS: readonly RegionalHighwayLabel[] = Object.freeze([
  labelOn('br472-label-north', northOfNe, 0.45),
  labelOn('br472-label-a5', neToSe, 0.48),
  labelOn('br472-label-south-east', neToSe, 0.88),
  labelOn('br472-label-south-west', southWest, 0.62),
  labelOn('br472-label-south-through', southThrough, 0.72),
]);

export const REGIONAL_HIGHWAY_LAYER: RegionalHighwayLayer = Object.freeze({
  id: 'br472-exterior-mainline',
  agent: 'integrator',
  segments: BR472_EXTERIOR_SEGMENTS,
  labels: BR472_EXTERIOR_LABELS,
});

export const BR472_EXTERIOR_MAINLINE = Object.freeze({
  northSouth: BR472_NORTH_SOUTH_CENTERLINE,
  northOfNe: northOfNe,
  neToSe: neToSe,
  southWest: southWest,
  southThrough: southThrough,
  neAttachment: Object.freeze([NE[0], NE[1]] as const),
  seAttachment: Object.freeze([SE[0], SE[1]] as const),
  br344Crossing: Object.freeze([
    br472MainlineXAt(BR344_RESERVED_ALIGNMENT.z),
    BR344_RESERVED_ALIGNMENT.z,
  ] as const),
});
