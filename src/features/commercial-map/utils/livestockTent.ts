import { officialPdfPointToLocal } from '../data/officialReference2026';

type ReadonlyCoordinate = readonly [number, number];

const normalize2 = ([x, z]: ReadonlyCoordinate): ReadonlyCoordinate => {
  const length = Math.hypot(x, z);
  return length > 1e-9 ? [x / length, z / length] : [0, 1];
};

const toLocal = (point: ReadonlyCoordinate): ReadonlyCoordinate => {
  const [x, z] = officialPdfPointToLocal(point);
  return [x, z];
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Official 2026 cadastre for D4 — do not invent a second identifier.
 * Source line: ['D4', 'Tenda da Pecuária', 'LIVESTOCK_AREA', 'exporural',
 * [2925, 2525], { parent: 'N', width: 125, depth: 100, height: 0.74 }]
 */
export const LIVESTOCK_TENT_PUBLIC_IDENTIFIER = 'D4';
export const LIVESTOCK_TENT_OFFICIAL_NAME = 'Tenda da Pecuária';
export const LIVESTOCK_TENT_FRONT_LOT_IDENTIFIER = 'Q-Q-01';
export const LIVESTOCK_TENT_REVISION = '2026.9-d4-livestock-tent.1';

/**
 * Quadra Q lots 6..1 via addRow('Q', [6, 5, 4, 3, 2, 1], [2243, 2472, 2750, 2578]).
 * Lot 1 is the easternmost column. Uniform LOT_INSET does not move the centre.
 */
const QUADRA_Q_ROW_BOUNDS = [2243, 2472, 2750, 2578] as const;
const QUADRA_Q_LOT_NUMBERS = [6, 5, 4, 3, 2, 1] as const;

const sourceCenter = [2925, 2525] as const;
const sourceFootprint = [125, 100] as const;
const easternLotIndex = QUADRA_Q_LOT_NUMBERS.length - 1;
const lotColumnWidth = (QUADRA_Q_ROW_BOUNDS[2] - QUADRA_Q_ROW_BOUNDS[0])
  / QUADRA_Q_LOT_NUMBERS.length;
const targetSourceCenter = [
  QUADRA_Q_ROW_BOUNDS[0] + (easternLotIndex + 0.5) * lotColumnWidth,
  (QUADRA_Q_ROW_BOUNDS[1] + QUADRA_Q_ROW_BOUNDS[3]) / 2,
] as const;

const worldCenter = toLocal(sourceCenter);
const targetWorldCenter = toLocal(targetSourceCenter);
const frontVector = normalize2([
  targetWorldCenter[0] - worldCenter[0],
  targetWorldCenter[1] - worldCenter[1],
]);
const facingRadians = Math.atan2(frontVector[0], frontVector[1]);

export const LIVESTOCK_TENT_LAYOUT = Object.freeze({
  revision: LIVESTOCK_TENT_REVISION,
  publicIdentifier: LIVESTOCK_TENT_PUBLIC_IDENTIFIER,
  officialName: LIVESTOCK_TENT_OFFICIAL_NAME,
  runtimeEntityId: 'reference:2026:d4',
  frontLotIdentifier: LIVESTOCK_TENT_FRONT_LOT_IDENTIFIER,
  enclosure: 'open-frame' as const,
  localFrontAxis: '+Z' as const,
  /** Peaked tent stays below B9 and below the D4 facade-pole conductors. */
  maximumVisualHeight: 1.2,
  sourceCenter,
  sourceFootprint,
  targetSourceCenter,
  worldCenter,
  targetWorldCenter,
  frontVector,
  facingRadians,
  /**
   * Camera stays on the Q-Q-01 side (west) so the open gable reads against B9
   * behind the tent. A slight south bias reveals the portal-frame rhythm.
   */
  focusDirection: [-0.9, 0.4, 0.28] as const,
  footprintFill: Object.freeze({
    width: 0.94,
    depth: 0.94,
  }),
  structure: Object.freeze({
    frameCount: 5,
    purlinCountPerSlope: 3,
    railCountPerSide: 2,
    hasEnclosingWalls: false,
    sideWallHeight: 0,
  }),
  palette: Object.freeze({
    wall: '#d5c7a8',
    accent: '#c3925b',
    roof: '#ddd8cc',
    trim: '#c4bba8',
    dark: '#2a3538',
    glass: '#6a8688',
    green: '#3c694c',
    white: '#f2eee4',
    platform: '#8a8478',
    metal: '#445054',
  }),
});

export const LIVESTOCK_TENT_RENDER_BUDGET = {
  overview: {
    maximumPrimaryDrawCalls: 6,
    maximumRenderedTriangles: 700,
  },
  detailed: {
    maximumPrimaryDrawCalls: 11,
    maximumRenderedTriangles: 1_100,
  },
  focused: {
    maximumPrimaryDrawCalls: 12,
    maximumRenderedTriangles: 1_400,
  },
  maximumShadowDrawCalls: 6,
  identityTextureWidth: 512,
  identityTextureHeight: 128,
  detailDistanceMultiplier: 5.6,
} as const;

export interface LivestockTentBounds {
  width: number;
  depth: number;
}

export interface LivestockTentLayout {
  width: number;
  depth: number;
  height: number;
  fillWidth: number;
  fillDepth: number;
  platformHeight: number;
  eaveHeight: number;
  roofRise: number;
  roofHalfSpan: number;
  roofSlopeLength: number;
  roofAngle: number;
  roofThickness: number;
  roofDepth: number;
  ridgeWidth: number;
  columnSpan: number;
  columnThickness: number;
  beamThickness: number;
  frameCount: number;
  frameEndInset: number;
  railHeight: number;
  valanceHeight: number;
  frontZ: number;
  rearZ: number;
  hasEnclosingWalls: false;
  sideWallHeight: 0;
  architectureEnvelope: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
}

export interface LivestockTentRenderDiagnostics {
  primaryDrawCalls: number;
  renderedTriangles: number;
  shadowDrawCalls: number;
  frameCount: number;
  enclosingWallDrawCalls: number;
  withinBudget: boolean;
}

/**
 * Open livestock tent inside the official D4 envelope.
 *
 * Local +Z is the open gable. After the west yaw toward Q-Q-01, that gable
 * faces the easternmost lot of Quadra Q. The ridge runs front-to-back so the
 * long cadastral east-west span becomes tent depth, not a second copy of B9.
 */
export function createLivestockTentLayout(
  bounds: LivestockTentBounds,
  requestedHeight = livestockTentVisualHeight(bounds),
): LivestockTentLayout {
  const width = Math.max(1.15, finiteOr(bounds.width, 2.18));
  const depth = Math.max(1.15, finiteOr(bounds.depth, 2.73));
  const height = Math.max(1.02, finiteOr(requestedHeight, livestockTentVisualHeight({ width, depth })));
  const fillWidth = width * LIVESTOCK_TENT_LAYOUT.footprintFill.width;
  const fillDepth = depth * LIVESTOCK_TENT_LAYOUT.footprintFill.depth;
  const platformHeight = clamp(height * 0.032, 0.038, 0.052);
  const eaveHeight = height * 0.46;
  const roofRise = height - eaveHeight;
  const roofOverhang = clamp(Math.min(width, depth) * 0.018, 0.022, 0.04);
  const roofHalfSpan = fillWidth / 2 + roofOverhang;
  const roofSlopeLength = Math.hypot(roofHalfSpan, roofRise);
  const roofAngle = Math.atan2(roofRise, roofHalfSpan);
  const columnInset = clamp(fillWidth * 0.045, 0.055, 0.08);
  const columnSpan = Math.max(0.7, fillWidth - columnInset * 2);
  const columnThickness = clamp(Math.min(width, depth) * 0.026, 0.042, 0.058);
  const beamThickness = columnThickness * 0.78;
  const frameEndInset = clamp(fillDepth * 0.04, 0.05, 0.08);
  const roofDepth = fillDepth + roofOverhang * 2;
  const frontZ = fillDepth / 2;
  const rearZ = -fillDepth / 2;

  return {
    width,
    depth,
    height,
    fillWidth,
    fillDepth,
    platformHeight,
    eaveHeight,
    roofRise,
    roofHalfSpan,
    roofSlopeLength,
    roofAngle,
    roofThickness: clamp(height * 0.022, 0.032, 0.042),
    roofDepth,
    ridgeWidth: clamp(columnThickness * 1.8, 0.08, 0.12),
    columnSpan,
    columnThickness,
    beamThickness,
    frameCount: LIVESTOCK_TENT_LAYOUT.structure.frameCount,
    frameEndInset,
    railHeight: clamp(eaveHeight * 0.36, 0.24, 0.34),
    valanceHeight: clamp(eaveHeight * 0.17, 0.12, 0.18),
    frontZ,
    rearZ,
    hasEnclosingWalls: false,
    sideWallHeight: 0,
    architectureEnvelope: {
      minX: -fillWidth / 2,
      maxX: fillWidth / 2,
      minZ: rearZ,
      maxZ: frontZ,
    },
  };
}

export function livestockTentVisualHeight(bounds: LivestockTentBounds): number {
  const span = Math.min(finiteOr(bounds.width, 2.18), finiteOr(bounds.depth, 2.18));
  return clamp(span * 0.54, 1.08, LIVESTOCK_TENT_LAYOUT.maximumVisualHeight);
}

export function livestockTentFrontVector(): ReadonlyCoordinate {
  return LIVESTOCK_TENT_LAYOUT.frontVector;
}

export function livestockTentHeadingToTargetErrorRadians(): number {
  const expected = normalize2([
    targetWorldCenter[0] - worldCenter[0],
    targetWorldCenter[1] - worldCenter[1],
  ]);
  const dot = Math.min(
    1,
    Math.max(-1, frontVector[0] * expected[0] + frontVector[1] * expected[1]),
  );
  return Math.acos(dot);
}

export function livestockTentCardinalFacingRadians(
  yaw = LIVESTOCK_TENT_LAYOUT.facingRadians,
): number {
  return Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
}

/**
 * Quarter-turn yaw exchanges local width/depth so the open +Z gable fits the
 * official east-west D4 envelope after facing Q-Q-01.
 */
export function livestockTentModelBounds<Bounds extends LivestockTentBounds>(
  bounds: Bounds,
  yaw = LIVESTOCK_TENT_LAYOUT.facingRadians,
): Bounds {
  const cardinal = livestockTentCardinalFacingRadians(yaw);
  const quarterTurns = Math.round(cardinal / (Math.PI / 2));
  const snapped = quarterTurns * (Math.PI / 2);
  const isOddQuarterTurn = Math.abs(yaw - snapped) < 1e-8
    && Math.abs(quarterTurns) % 2 === 1;
  if (!isOddQuarterTurn) return bounds;
  return { ...bounds, width: bounds.depth, depth: bounds.width };
}

export function livestockTentFramePositions(layout: LivestockTentLayout): number[] {
  const usable = Math.max(0.2, layout.fillDepth - layout.frameEndInset * 2);
  const last = Math.max(1, layout.frameCount - 1);
  return Array.from(
    { length: layout.frameCount },
    (_, index) => -layout.fillDepth / 2 + layout.frameEndInset + usable * (index / last),
  );
}

/**
 * Static geometry accounting for focused tests. Repeated truss members are
 * instanced, so each material group remains one draw call.
 */
export function livestockTentRenderDiagnostics(
  detailed: boolean,
  focused = false,
): LivestockTentRenderDiagnostics {
  const frameCount = LIVESTOCK_TENT_LAYOUT.structure.frameCount;
  const columns = frameCount * 2;
  const rafters = frameCount * 2;
  const ties = frameCount;
  const webs = frameCount * 2;
  const kingPosts = frameCount;
  const longitudinalBeams = 3;
  const roofFaces = 2;
  const ridgeCaps = 1;
  const platform = 1;
  let instances = platform
    + columns
    + rafters
    + ties
    + webs
    + kingPosts
    + longitudinalBeams
    + roofFaces
    + ridgeCaps;
  let primaryDrawCalls = 5;
  let shadowDrawCalls = 4;

  if (detailed) {
    const valance = 2;
    const purlins = LIVESTOCK_TENT_LAYOUT.structure.purlinCountPerSlope * 2;
    const rails = LIVESTOCK_TENT_LAYOUT.structure.railCountPerSide * 2;
    const lights = Math.max(0, frameCount - 2);
    const sign = 2;
    instances += valance + purlins + rails + lights + sign;
    primaryDrawCalls += 5;
    shadowDrawCalls += 1;
  }

  if (focused) {
    instances += 12;
    primaryDrawCalls += 1;
  }

  const renderedTriangles = instances * 12;
  const budget = focused
    ? LIVESTOCK_TENT_RENDER_BUDGET.focused
    : detailed
      ? LIVESTOCK_TENT_RENDER_BUDGET.detailed
      : LIVESTOCK_TENT_RENDER_BUDGET.overview;

  return {
    primaryDrawCalls,
    renderedTriangles,
    shadowDrawCalls,
    frameCount,
    enclosingWallDrawCalls: 0,
    withinBudget: primaryDrawCalls <= budget.maximumPrimaryDrawCalls
      && renderedTriangles <= budget.maximumRenderedTriangles
      && shadowDrawCalls <= LIVESTOCK_TENT_RENDER_BUDGET.maximumShadowDrawCalls,
  };
}
