import type { Coordinate } from '../types';
import { officialPdfPointToLocal } from '../data/officialReference2026';
import { FENASOJA_HEADQUARTERS_LAYOUT, headquartersOrientedEnvelope } from './headquarters';

type ReadonlyCoordinate = readonly [number, number];

const normalize2 = ([x, z]: ReadonlyCoordinate): ReadonlyCoordinate => {
  const length = Math.hypot(x, z);
  return length > 1e-9 ? [x / length, z / length] : [0, 1];
};

const sourceRectangle = (
  center: ReadonlyCoordinate,
  width: number,
  depth: number,
) => Object.freeze([
  Object.freeze([center[0] - width / 2, center[1] - depth / 2] as const),
  Object.freeze([center[0] + width / 2, center[1] - depth / 2] as const),
  Object.freeze([center[0] + width / 2, center[1] + depth / 2] as const),
  Object.freeze([center[0] - width / 2, center[1] + depth / 2] as const),
]);

const toLocal = (point: ReadonlyCoordinate): ReadonlyCoordinate => {
  const [x, z] = officialPdfPointToLocal(point);
  return [x, z];
};

/**
 * Same size-class rectangle as Casa Fenasoja / B12 (135×104), aligned on the
 * shared east-west axis. The centre sits further north so the south-facing
 * apron and roof stay clear of B12 after the buildings share a heading.
 */
const sourceCenter = [4105, 3562] as const;
const sourceFootprint = [135, 104] as const;

/**
 * Q-D-12 remains the neighbouring Quadra D lot west of the stage. It is not
 * the facing target: the previous D-12 heading left B13 crooked beside B12.
 */
const targetSourceCenter = [3897.4166666666665, 3550] as const;
const headquartersSourceCenter = FENASOJA_HEADQUARTERS_LAYOUT.sourceCenter;
const headquartersSourceFootprint = FENASOJA_HEADQUARTERS_LAYOUT.sourceFootprint;
const worldCenter = toLocal(sourceCenter);
const targetWorldCenter = toLocal(targetSourceCenter);
const headquartersWorldCenter = toLocal(headquartersSourceCenter);
/** Axis-aligned with Quadra B / Casa Fenasoja, not the old diagonal D-12 yaw. */
const facingRadians = 0;
const frontVector = normalize2([
  Math.sin(facingRadians),
  Math.cos(facingRadians),
]);

export const LACTALIS_STAGE_LAYOUT = Object.freeze({
  revision: '2026.9-lactalis-stage.2',
  publicIdentifier: 'B13',
  runtimeEntityId: 'reference:2026:b13',
  displayName: 'Palco Cultural Lactalis',
  sourceReferences: Object.freeze({
    currentRear: '4d5553bc-e7bb-4b7b-bea7-82b430272a8b.jpeg',
    currentFront: '19f56352-460e-4796-b9cb-a8430e2a168b.jpeg',
    satellite: 'WhatsApp Image 2026-08-30 at 23.40.19.jpeg',
    architecture: '4618B88E-96C4-4F78-98A2-6E21E6C254F2.jpeg',
  }),
  sourceCenter,
  sourceFootprint,
  sourceFootprintPolygon: sourceRectangle(sourceCenter, sourceFootprint[0], sourceFootprint[1]),
  worldCenter,
  targetIdentifier: 'Q-D-12',
  targetSourceCenter,
  targetWorldCenter,
  headquartersIdentifier: 'B12',
  headquartersSourceFootprint,
  headquartersWorldCenter,
  localFrontAxis: Object.freeze([0, 1] as const),
  frontVector,
  facingRadians,
  facingDegrees: facingRadians * 180 / Math.PI,
  /** Architecture stays inside the official selectable footprint after rotation. */
  architecture: Object.freeze({
    widthRatio: FENASOJA_HEADQUARTERS_LAYOUT.envelope.widthRatio,
    depthRatio: FENASOJA_HEADQUARTERS_LAYOUT.envelope.depthRatio,
    eaveHeight: 1.18,
    ridgeHeight: 1.82,
    columnThicknessRatio: 0.024,
    minimumColumnThickness: 0.042,
    roofThickness: 0.042,
    roofOverhangRatio: 0.045,
    platformHeight: 0.12,
    platformWidthRatio: 0.82,
    platformDepthRatio: 0.32,
    audienceApronDepth: 0.16,
    audienceApronWidthRatio: 0.82,
    footprintSafetyInset: 0.015,
    headquartersClearance: 0.045,
    floorThickness: 0.05,
    sideEnclosureDepthRatio: 0.44,
    fasciaDepth: 0.16,
    claddingThickness: 0.036,
  }),
  signage: Object.freeze({
    /** The reference board is a compact two-line panel, not a panoramic banner. */
    aspectRatio: 2.4,
    widthRatio: 0.26,
    centerAboveEave: 0.03,
  }),
  camera: Object.freeze({
    minimumDistance: 3.4,
    focusedDistance: 6.2,
    focusMinimumDirectionY: 0.28,
    /** Keeps the complete facade visible above the existing Quadra D canopy on narrow portrait canvases. */
    focusPortraitMinimumDirectionY: 0.48,
  }),
  palette: Object.freeze({
    cladding: '#c8ccca',
    claddingLight: '#dadddb',
    roof: '#b8bfbe',
    roofEdge: '#434b4e',
    frame: '#20282b',
    interior: '#31383a',
    platform: '#24292a',
    concrete: '#a9a79e',
    sign: '#16466e',
    lactalisBlue: '#0a4381',
    light: '#8bd483',
  }),
  renderBudget: Object.freeze({
    baseDrawCalls: 11,
    detailDrawCalls: 17,
    focusedDrawCalls: 22,
    independentCables: 0,
    textureAssets: 0,
  }),
});

export function lactalisStageVisualHeight() {
  return LACTALIS_STAGE_LAYOUT.architecture.ridgeHeight;
}

export function lactalisStageFrontVector(): ReadonlyCoordinate {
  return LACTALIS_STAGE_LAYOUT.frontVector;
}

export function lactalisStageHeadingToHeadquartersErrorRadians() {
  const expected = 0;
  const delta = Math.abs(facingRadians - expected);
  return Math.min(delta, Math.PI * 2 - delta);
}

export function lactalisStageHeadingToTargetErrorRadians() {
  return lactalisStageHeadingToHeadquartersErrorRadians();
}

export function lactalisStageModelDimensions(
  footprintWidth: number,
  footprintDepth: number,
) {
  const requestedWidth = footprintWidth * LACTALIS_STAGE_LAYOUT.architecture.widthRatio;
  const requestedDepth = footprintDepth * LACTALIS_STAGE_LAYOUT.architecture.depthRatio;
  const inset = LACTALIS_STAGE_LAYOUT.architecture.footprintSafetyInset;
  const cosine = Math.cos(facingRadians);
  const sine = Math.sin(facingRadians);
  // Keep all new architecture north of B12. Do not edit the B12 cadastral polygon.
  const headquartersNorthEdge = toLocal([
    headquartersSourceCenter[0],
    headquartersSourceCenter[1] - headquartersSourceFootprint[1] / 2,
  ])[1] - worldCenter[1] - LACTALIS_STAGE_LAYOUT.architecture.headquartersClearance;
  const fits = (scale: number) => localPresentationFootprint(
    requestedWidth * scale,
    requestedDepth * scale,
  ).every(([x, z]) => (
    Math.abs(x * cosine + z * sine) <= footprintWidth / 2 - inset
    && Math.abs(-x * sine + z * cosine) <= footprintDepth / 2 - inset
    && -x * sine + z * cosine <= headquartersNorthEdge
  ));
  // Test the full rotated envelope, including roof thickness and gutters. The
  // front apron is asymmetric and cannot be covered by a body-only AABB check.
  let low = 0;
  let high = 1;
  if (fits(1)) low = 1;
  else for (let iteration = 0; iteration < 36; iteration += 1) {
    const candidate = (low + high) / 2;
    if (fits(candidate)) low = candidate;
    else high = candidate;
  }
  return Object.freeze({
    width: requestedWidth * low,
    depth: requestedDepth * low,
    height: LACTALIS_STAGE_LAYOUT.architecture.ridgeHeight,
    containmentScale: low,
  });
}

function officialFootprintDimensions() {
  const officialWidth = toLocal([sourceCenter[0] + sourceFootprint[0], sourceCenter[1]])[0] - worldCenter[0];
  const officialDepth = toLocal([sourceCenter[0], sourceCenter[1] + sourceFootprint[1]])[1] - worldCenter[1];
  return [officialWidth, officialDepth] as const;
}

function officialHeadquartersFootprintDimensions() {
  const officialWidth = toLocal([
    headquartersSourceCenter[0] + headquartersSourceFootprint[0],
    headquartersSourceCenter[1],
  ])[0] - headquartersWorldCenter[0];
  const officialDepth = toLocal([
    headquartersSourceCenter[0],
    headquartersSourceCenter[1] + headquartersSourceFootprint[1],
  ])[1] - headquartersWorldCenter[1];
  return [officialWidth, officialDepth] as const;
}

function localPresentationFootprint(width: number, depth: number): readonly ReadonlyCoordinate[] {
  const architecture = LACTALIS_STAGE_LAYOUT.architecture;
  const overhang = width * architecture.roofOverhangRatio;
  const pitch = Math.atan2(architecture.ridgeHeight - architecture.eaveHeight, width / 2 + overhang);
  const roofHalfWidth = width / 2 + overhang + architecture.roofThickness / 2 * Math.sin(pitch);
  // Gutters project 2.5% farther than the roofing at either longitudinal end.
  const roofHalfDepth = depth / 2 + overhang * 1.025;
  const apronHalfWidth = width * architecture.audienceApronWidthRatio / 2;
  const apronFront = depth / 2 + architecture.audienceApronDepth;
  return [
    [-roofHalfWidth, -roofHalfDepth],
    [roofHalfWidth, -roofHalfDepth],
    [roofHalfWidth, roofHalfDepth],
    [apronHalfWidth, roofHalfDepth],
    [apronHalfWidth, apronFront],
    [-apronHalfWidth, apronFront],
    [-apronHalfWidth, roofHalfDepth],
    [-roofHalfWidth, roofHalfDepth],
  ];
}

export function lactalisStageLocalToWorld(
  [x, z]: ReadonlyCoordinate,
  center: ReadonlyCoordinate = worldCenter,
): Coordinate {
  const cosine = Math.cos(facingRadians);
  const sine = Math.sin(facingRadians);
  return [center[0] + x * cosine + z * sine, center[1] - x * sine + z * cosine];
}

/** World-space envelope of every roof, gutter and apron corner, not just walls. */
export function lactalisStagePresentationFootprint(
  footprintWidth = officialFootprintDimensions()[0],
  footprintDepth = officialFootprintDimensions()[1],
  center: ReadonlyCoordinate = worldCenter,
): readonly Coordinate[] {
  const model = lactalisStageModelDimensions(footprintWidth, footprintDepth);
  return Object.freeze(localPresentationFootprint(model.width, model.depth)
    .map((point) => lactalisStageLocalToWorld(point, center)));
}

export function lactalisStageAudienceApronPolygon(): readonly Coordinate[] {
  const [officialWidth, officialDepth] = officialFootprintDimensions();
  const model = lactalisStageModelDimensions(officialWidth, officialDepth);
  const frontOffset = model.depth / 2;
  const apronDepth = LACTALIS_STAGE_LAYOUT.architecture.audienceApronDepth;
  const halfWidth = model.width * LACTALIS_STAGE_LAYOUT.architecture.audienceApronWidthRatio / 2;
  // Match the concrete mesh exactly: no validation-only trapezoid or gap.
  return Object.freeze([
    lactalisStageLocalToWorld([-halfWidth, frontOffset]),
    lactalisStageLocalToWorld([halfWidth, frontOffset]),
    lactalisStageLocalToWorld([halfWidth, frontOffset + apronDepth]),
    lactalisStageLocalToWorld([-halfWidth, frontOffset + apronDepth]),
  ]);
}

/** Visual body vs Casa Fenasoja — used to keep B13 in the same size class. */
export function lactalisStageHeadquartersSizeClass() {
  const [stageWidth, stageDepth] = officialFootprintDimensions();
  const [headquartersWidth, headquartersDepth] = officialHeadquartersFootprintDimensions();
  const stage = lactalisStageModelDimensions(stageWidth, stageDepth);
  const headquarters = headquartersOrientedEnvelope({
    width: headquartersWidth,
    depth: headquartersDepth,
  });
  return Object.freeze({
    stageWidth: stage.width,
    stageDepth: stage.depth,
    stageHeight: stage.height,
    headquartersWidth: headquarters.localWidth,
    headquartersDepth: headquarters.localDepth,
    widthRatio: stage.width / headquarters.localWidth,
    depthRatio: stage.depth / headquarters.localDepth,
    containmentScale: stage.containmentScale,
  });
}
