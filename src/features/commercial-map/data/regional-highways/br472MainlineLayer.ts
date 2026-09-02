import { officialPdfPointToLocal } from '../officialReference2026';
import { REAR_OFFICIAL_ANCHORS } from '../../utils/rearSpatialCalibration';
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

export const BR472_NORTH_SOUTH_CENTERLINE = Object.freeze([
  point(NORTH_TERMINUS_Z),
  point(NE[1] - 28),
  xz(NE[0], NE[1]),
  point(NE[1] + 28),
  point(PARK_LOCAL_BOUNDS.minZ - 18),
  point(PARK_LOCAL_BOUNDS.minZ),
  point(0),
  xz(br472MainlineXAt(A5_JUNCTION[1]), A5_JUNCTION[1]),
  point(PARK_LOCAL_BOUNDS.maxZ),
  point(SE[1] - 22),
  xz(SE[0], SE[1]),
] satisfies LocalPoint[]);

export const BR472_SOUTH_WEST_CENTERLINE = Object.freeze([
  xz(SE[0], SE[1]),
  xz(SE[0] - 18, SE[1] + 10),
  xz(SE[0] - 48, WEST_RUN_Z - 6),
  xz(20, WEST_RUN_Z),
  xz(-24, WEST_RUN_Z + 1),
  xz(WEST_TERMINUS_X, WEST_RUN_Z + 2),
] satisfies LocalPoint[]);

export const BR472_SOUTH_THROUGH_CENTERLINE = Object.freeze([
  xz(SE[0], SE[1]),
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

const northSouth = BR472_NORTH_SOUTH_CENTERLINE;
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
    id: 'br472-exterior-north-south',
    highwayId: 'BR-472',
    kind: 'mainline',
    centerline: northSouth,
  }),
  Object.freeze({
    id: 'br472-exterior-south-west',
    highwayId: 'BR-472',
    kind: 'mainline',
    centerline: southWest,
  }),
  Object.freeze({
    id: 'br472-exterior-south-through',
    highwayId: 'BR-472',
    kind: 'stub',
    centerline: southThrough,
  }),
  Object.freeze({
    id: 'br472-a5-hook-stem',
    highwayId: 'BR-472',
    kind: 'connector',
    centerline: hookStem,
    carriagewayWidth: REGIONAL_HIGHWAY_PROFILE.connectorWidth,
    shoulderWidth: REGIONAL_HIGHWAY_PROFILE.connectorShoulderWidth,
  }),
  Object.freeze({
    id: 'br472-a5-hook-north',
    highwayId: 'BR-472',
    kind: 'ramp',
    centerline: hookNorth,
    carriagewayWidth: REGIONAL_HIGHWAY_PROFILE.connectorWidth,
    shoulderWidth: REGIONAL_HIGHWAY_PROFILE.connectorShoulderWidth,
  }),
  Object.freeze({
    id: 'br472-a5-hook-south',
    highwayId: 'BR-472',
    kind: 'ramp',
    centerline: hookSouth,
    carriagewayWidth: REGIONAL_HIGHWAY_PROFILE.connectorWidth,
    shoulderWidth: REGIONAL_HIGHWAY_PROFILE.connectorShoulderWidth,
  }),
]);

export const BR472_EXTERIOR_LABELS: readonly RegionalHighwayLabel[] = Object.freeze([
  labelOn('br472-label-north', northSouth, 0.18),
  labelOn('br472-label-a5', northSouth, 0.58),
  labelOn('br472-label-south-east', northSouth, 0.9),
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
  northSouth: northSouth,
  southWest: southWest,
  southThrough: southThrough,
  neAttachment: Object.freeze([NE[0], NE[1]] as const),
  seAttachment: Object.freeze([SE[0], SE[1]] as const),
  br344Crossing: Object.freeze([
    br472MainlineXAt(BR344_RESERVED_ALIGNMENT.z),
    BR344_RESERVED_ALIGNMENT.z,
  ] as const),
});
