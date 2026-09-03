import { officialLocalPointToPdf, officialPdfPointToLocal } from './officialReference2026';
import {
  INTERCHANGE_ENVELOPES,
  REGIONAL_HIGHWAY_PALETTE,
  REGIONAL_HIGHWAY_PROFILE,
  br472MainlineXAt,
} from './regional-highways/contract';

/**
 * Trevo sul da BR-472 — Anexo 2.
 *
 * Four looping ramps that actually join the N–S carriageway and the E–W
 * collector, plus two modest yellow roundabouts on that collector (east and
 * west of the highway). N–S overpass, then the wide 90° westbound sweep.
 * Not a pair of isolated yellow eyes with a ring of slips.
 *
 * Parametric on `INTERCHANGE_ENVELOPES.seCloverleaf` so a closer BR-472 still
 * carries this trevo. The Portão 5 / A5 Y-trevo is untouched. The regional
 * mesh lives in the SE envelope (Anexo 2: south of the park, BR-472 at ~0.26
 * hub widths east).
 */
export const SE_CLOVERLEAF_REVISION = '2026.10-se-cloverleaf-anexo2.1';

export type SeCloverleafPoint = readonly [number, number];

export const SE_CLOVERLEAF_PUBLISHED_JOIN_SOURCE = Object.freeze([6146, 4400] as const);
export const SE_CLOVERLEAF_PUBLISHED_CENTER_SOURCE = Object.freeze([6146, 4987] as const);

const publishedJoinLocal = officialPdfPointToLocal(SE_CLOVERLEAF_PUBLISHED_JOIN_SOURCE);
const publishedCenterLocal = officialPdfPointToLocal(SE_CLOVERLEAF_PUBLISHED_CENTER_SOURCE);
const northOffset = publishedCenterLocal[1] - publishedJoinLocal[1];

export const SE_CLOVERLEAF_CENTER_LOCAL = INTERCHANGE_ENVELOPES.seCloverleaf.center;
export const SE_CLOVERLEAF_JOIN_LOCAL = Object.freeze([
  SE_CLOVERLEAF_CENTER_LOCAL[0],
  SE_CLOVERLEAF_CENTER_LOCAL[1] - northOffset,
] as const);

export const SE_CLOVERLEAF_JOIN_SOURCE = Object.freeze(
  officialLocalPointToPdf(SE_CLOVERLEAF_JOIN_LOCAL),
);
export const SE_CLOVERLEAF_CENTER_SOURCE = Object.freeze(
  officialLocalPointToPdf(SE_CLOVERLEAF_CENTER_LOCAL),
);

const envelope = INTERCHANGE_ENVELOPES.seCloverleaf as {
  center: readonly [number, number];
  headingRadians?: number;
};

export function seCloverleafHeadingRadians() {
  if (typeof envelope.headingRadians === 'number') return envelope.headingRadians;
  const [cx, cz] = SE_CLOVERLEAF_CENTER_LOCAL;
  return Math.atan2(br472MainlineXAt(cz + 1) - cx, 1);
}

const highwayWidth = REGIONAL_HIGHWAY_PROFILE.carriagewayWidth;
const highwayShoulder = REGIONAL_HIGHWAY_PROFILE.shoulderWidth;

const centerX = SE_CLOVERLEAF_CENTER_LOCAL[0];
const centerZ = SE_CLOVERLEAF_CENTER_LOCAL[1];
const joinZ = SE_CLOVERLEAF_JOIN_LOCAL[1];
const slipRadius = centerZ - joinZ;

export const SE_CLOVERLEAF_COLORS = Object.freeze({
  highway: REGIONAL_HIGHWAY_PALETTE.carriageway,
  ramp: REGIONAL_HIGHWAY_PALETTE.carriagewayGrain,
  shoulder: REGIONAL_HIGHWAY_PALETTE.shoulder,
  edgeLine: REGIONAL_HIGHWAY_PALETTE.edgeLine,
  roundabout: '#f5d031',
  grass: '#6f8a4e',
  concrete: '#b7b3a8',
});

export const SE_CLOVERLEAF_LAYOUT = Object.freeze({
  join: SE_CLOVERLEAF_JOIN_LOCAL,
  center: SE_CLOVERLEAF_CENTER_LOCAL,
  headingRadians: seCloverleafHeadingRadians(),
  highwayWidth,
  highwayShoulder,
  rampWidth: highwayWidth * 0.58,
  crossingWidth: highwayWidth * 0.86,
  loopRadius: 5.12,
  goreGap: 0.05,
  goreLength: 1.15,
  /** Collector RAB sits between the north and south leaves on each side. */
  roundaboutOffset: 6.45,
  roundaboutOuterRadius: 1.12,
  roundaboutIslandRadius: 0.46,
  roundaboutCurbWidth: 0.08,
  /** North handoff distance — keep the published join length for Agent 1. */
  slipRadius,
  overpassHalfSpan: 3.55,
  riseLength: 5.4,
  overpassHeight: 0.86,
  deckThickness: 0.1,
  gradeElevation: 0.034,
  shoulderDrop: 0.006,
  markingLift: 0.0045,
  roundaboutLift: 0.008,
  islandLift: 0.014,
  grassElevation: 0.0024,
  westTurnRadius: 13.2,
  westExtension: 24,
  westTurnStartOffset: 13.4,
} as const);

export const SE_CLOVERLEAF_QUADRANTS = Object.freeze([
  Object.freeze({ id: 'ne', sx: 1, sz: -1, label: 'NE' }),
  Object.freeze({ id: 'se', sx: 1, sz: 1, label: 'SE' }),
  Object.freeze({ id: 'sw', sx: -1, sz: 1, label: 'SW' }),
  Object.freeze({ id: 'nw', sx: -1, sz: -1, label: 'NW' }),
] as const);

export type SeCloverleafQuadrantId = (typeof SE_CLOVERLEAF_QUADRANTS)[number]['id'];

export function seCloverleafNsMergeOffset() {
  return SE_CLOVERLEAF_LAYOUT.highwayWidth / 2
    + SE_CLOVERLEAF_LAYOUT.goreGap
    + SE_CLOVERLEAF_LAYOUT.rampWidth / 2;
}

export function seCloverleafEwMergeOffset() {
  return SE_CLOVERLEAF_LAYOUT.crossingWidth / 2
    + SE_CLOVERLEAF_LAYOUT.goreGap
    + SE_CLOVERLEAF_LAYOUT.rampWidth / 2;
}

export function seCloverleafLoopCenter(sx: number, sz: number): SeCloverleafPoint {
  return [
    centerX + sx * (seCloverleafNsMergeOffset() + SE_CLOVERLEAF_LAYOUT.loopRadius),
    centerZ + sz * (seCloverleafEwMergeOffset() + SE_CLOVERLEAF_LAYOUT.loopRadius),
  ];
}

export function seCloverleafRoundaboutCenter(side: -1 | 1): SeCloverleafPoint {
  return [centerX + side * SE_CLOVERLEAF_LAYOUT.roundaboutOffset, centerZ];
}

export const SE_CLOVERLEAF_ROUNDABOUTS = Object.freeze({
  west: seCloverleafRoundaboutCenter(-1),
  east: seCloverleafRoundaboutCenter(1),
} as const);

export const SE_CLOVERLEAF_ELEVATION_BANDS = Object.freeze({
  grass: SE_CLOVERLEAF_LAYOUT.grassElevation,
  shoulder: SE_CLOVERLEAF_LAYOUT.gradeElevation - SE_CLOVERLEAF_LAYOUT.shoulderDrop,
  grade: SE_CLOVERLEAF_LAYOUT.gradeElevation,
  roundabout: SE_CLOVERLEAF_LAYOUT.gradeElevation + SE_CLOVERLEAF_LAYOUT.roundaboutLift,
  island: SE_CLOVERLEAF_LAYOUT.gradeElevation + SE_CLOVERLEAF_LAYOUT.islandLift,
  markings: SE_CLOVERLEAF_LAYOUT.gradeElevation + SE_CLOVERLEAF_LAYOUT.markingLift,
  overpass: SE_CLOVERLEAF_LAYOUT.overpassHeight,
  deckSoffit: SE_CLOVERLEAF_LAYOUT.overpassHeight - SE_CLOVERLEAF_LAYOUT.deckThickness,
} as const);

export const SE_CLOVERLEAF_RENDER_BUDGET = Object.freeze({
  maximumPrimaryDrawCalls: 10,
  maximumTriangles: 28_000,
  maximumReducedTriangles: 14_000,
});

function westBoundZ() {
  return centerZ + SE_CLOVERLEAF_LAYOUT.westTurnStartOffset + SE_CLOVERLEAF_LAYOUT.westTurnRadius;
}

function westTerminusX() {
  return centerX - SE_CLOVERLEAF_LAYOUT.westTurnRadius - SE_CLOVERLEAF_LAYOUT.westExtension;
}

export function seCloverleafWestTerminusPoint(): SeCloverleafPoint {
  return [westTerminusX(), westBoundZ()];
}

export const SE_CLOVERLEAF_FOCUS_BOUNDS = Object.freeze({
  minX: westTerminusX() - highwayWidth,
  maxX: centerX + slipRadius + highwayWidth,
  minZ: joinZ - highwayWidth,
  maxZ: westBoundZ() + highwayWidth,
} as const);

export const SE_CLOVERLEAF_SCENE_SUPPORT_POINTS = Object.freeze([
  Object.freeze({ position: SE_CLOVERLEAF_JOIN_LOCAL, height: 1.2 }),
  Object.freeze({ position: SE_CLOVERLEAF_CENTER_LOCAL, height: SE_CLOVERLEAF_LAYOUT.overpassHeight + 0.5 }),
  Object.freeze({ position: SE_CLOVERLEAF_ROUNDABOUTS.west, height: 0.9 }),
  Object.freeze({ position: SE_CLOVERLEAF_ROUNDABOUTS.east, height: 0.9 }),
  Object.freeze({
    position: [westTerminusX(), westBoundZ()] as const,
    height: 1.1,
  }),
  Object.freeze({
    position: [centerX + slipRadius, centerZ] as const,
    height: 0.9,
  }),
  Object.freeze({
    position: [centerX, centerZ + slipRadius] as const,
    height: 1.1,
  }),
]);

export function seCloverleafIsSouthOfA5Trevo() {
  return SE_CLOVERLEAF_FOCUS_BOUNDS.minZ > 22;
}

export function seCloverleafIsEastOfParkCore() {
  return SE_CLOVERLEAF_CENTER_LOCAL[0] > 50;
}
