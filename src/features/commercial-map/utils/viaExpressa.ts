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
 * Official 2026 cadastre for D2 — do not invent a second identifier.
 * Source line: ['D2', 'Via Expressa', 'ATTRACTION', 'structures',
 * [3760, 2650, 3900, 2825], { parent: 'G', height: 0.82, metadata: { explicitNotRoad: true } }]
 */
export const VIA_EXPRESSA_PUBLIC_IDENTIFIER = 'D2';
export const VIA_EXPRESSA_OFFICIAL_NAME = 'Via Expressa';
export const VIA_EXPRESSA_FRONT_HALL_IDENTIFIER = 'D1';
export const VIA_EXPRESSA_REVISION = '2026.9-d2-via-expressa.1';

/**
 * Axis-aligned official envelope. Width is east–west, depth is north–south.
 * Local +Z (facingRadians = 0) is due south, toward the long grey ribbed hall
 * immediately south of D2 (D1 Alameda Gastronômica). The photographed gable
 * with the VIA EXPRESSA sign looks that way. This is not a road.
 */
export const VIA_EXPRESSA_SOURCE_FOOTPRINT = [3760, 2650, 3900, 2825] as const;
const sourceCenter = [
  (VIA_EXPRESSA_SOURCE_FOOTPRINT[0] + VIA_EXPRESSA_SOURCE_FOOTPRINT[2]) / 2,
  (VIA_EXPRESSA_SOURCE_FOOTPRINT[1] + VIA_EXPRESSA_SOURCE_FOOTPRINT[3]) / 2,
] as const;

const D1_SOURCE_CENTER = [
  (3770 + 3920) / 2,
  (2885 + 3095) / 2,
] as const;

const worldCenter = toLocal(sourceCenter);
const targetWorldCenter = toLocal(D1_SOURCE_CENTER);

export const VIA_EXPRESSA_LAYOUT = Object.freeze({
  revision: VIA_EXPRESSA_REVISION,
  publicIdentifier: VIA_EXPRESSA_PUBLIC_IDENTIFIER,
  officialName: VIA_EXPRESSA_OFFICIAL_NAME,
  runtimeEntityId: 'reference:2026:d2',
  frontHallIdentifier: VIA_EXPRESSA_FRONT_HALL_IDENTIFIER,
  enclosure: 'open-frame' as const,
  localFrontAxis: '+Z' as const,
  longAxis: 'east-west' as const,
  /**
   * Cardinal south keeps the ridge on the short N–S axis so the wide gable
   * (and the sign) face D1, while the longer plan span stays east–west.
   */
  facingRadians: 0,
  /** Low pavilion: readable from the map, below neighbouring D1 flagpoles. */
  maximumVisualHeight: 1.16,
  sourceFootprint: VIA_EXPRESSA_SOURCE_FOOTPRINT,
  sourceCenter,
  worldCenter,
  targetWorldCenter,
  frontVector: [0, 1] as const,
  /**
   * Camera stays south of the gable, with a slight east bias so the lattice
   * columns read in depth against the corrugated roof.
   */
  focusDirection: [0.22, 0.4, 0.94] as const,
  footprintFill: Object.freeze({
    width: 0.92,
    depth: 0.5,
    centerZRatio: -0.14,
    gravelInset: 0.035,
  }),
  structure: Object.freeze({
    frameCount: 3,
    braceSegmentsPerColumn: 3,
    purlinCountPerSlope: 5,
    treeCountPerSide: 2,
    hasEnclosingWalls: false,
    sideWallHeight: 0,
    columnLattice: 'x-brace' as const,
    roofProfile: 'low-gable-corrugated' as const,
  }),
  palette: Object.freeze({
    wall: '#c9c4b8',
    accent: '#1b1d1f',
    roof: '#c5cac8',
    trim: '#d8dcd9',
    dark: '#2a2420',
    glass: '#6a7c7e',
    green: '#3c5a38',
    white: '#f3f0e8',
    platform: '#b0aaa0',
    metal: '#3a3532',
  }),
});

export const VIA_EXPRESSA_RENDER_BUDGET = {
  overview: {
    maximumPrimaryDrawCalls: 7,
    maximumRenderedTriangles: 1_400,
  },
  detailed: {
    maximumPrimaryDrawCalls: 13,
    maximumRenderedTriangles: 2_200,
  },
  focused: {
    maximumPrimaryDrawCalls: 15,
    maximumRenderedTriangles: 2_800,
  },
  maximumShadowDrawCalls: 7,
  identityTextureWidth: 512,
  identityTextureHeight: 128,
  detailDistanceMultiplier: 5.4,
} as const;

export interface ViaExpressaBounds {
  width: number;
  depth: number;
}

export interface ViaExpressaTreePose {
  x: number;
  z: number;
  height: number;
  canopyRadius: number;
  trunkRadius: number;
}

export interface ViaExpressaLayout {
  width: number;
  depth: number;
  height: number;
  fillWidth: number;
  fillDepth: number;
  centerZ: number;
  platformHeight: number;
  sidewalkHeight: number;
  sidewalkWidth: number;
  sidewalkDepth: number;
  gravelWidth: number;
  gravelDepth: number;
  eaveHeight: number;
  roofRise: number;
  roofHalfSpan: number;
  roofSlopeLength: number;
  roofAngle: number;
  roofThickness: number;
  roofDepth: number;
  ridgeWidth: number;
  columnSpan: number;
  columnChordGap: number;
  columnThickness: number;
  beamThickness: number;
  braceThickness: number;
  frameCount: number;
  frameEndInset: number;
  braceSegmentsPerColumn: number;
  purlinCountPerSlope: number;
  frontZ: number;
  rearZ: number;
  hasEnclosingWalls: false;
  sideWallHeight: 0;
  trees: readonly ViaExpressaTreePose[];
  architectureEnvelope: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
}

export interface ViaExpressaRenderDiagnostics {
  primaryDrawCalls: number;
  renderedTriangles: number;
  shadowDrawCalls: number;
  frameCount: number;
  enclosingWallDrawCalls: number;
  withinBudget: boolean;
}

/**
 * Open Via Expressa pavilion inside the official D2 envelope.
 *
 * Local +X is east (the long gable span). Local +Z is south, the photographed
 * front: a wide low corrugated gable with the VIA EXPRESSA sign, looking at D1.
 * The ridge runs front-to-back on the short N–S axis. Gravel occupies the
 * southern remainder of the AABB; side trees stay inside the official lot.
 */
export function createViaExpressaLayout(
  bounds: ViaExpressaBounds,
  requestedHeight = viaExpressaVisualHeight(bounds),
): ViaExpressaLayout {
  const width = Math.max(2.2, finiteOr(bounds.width, 3.05));
  const depth = Math.max(2.4, finiteOr(bounds.depth, 3.82));
  const height = Math.max(
    0.96,
    finiteOr(requestedHeight, viaExpressaVisualHeight({ width, depth })),
  );
  const fillWidth = width * VIA_EXPRESSA_LAYOUT.footprintFill.width;
  const fillDepth = depth * VIA_EXPRESSA_LAYOUT.footprintFill.depth;
  const centerZ = depth * VIA_EXPRESSA_LAYOUT.footprintFill.centerZRatio;
  const gravelInset = Math.max(0.04, Math.min(width, depth) * VIA_EXPRESSA_LAYOUT.footprintFill.gravelInset);
  const platformHeight = clamp(height * 0.028, 0.032, 0.046);
  const sidewalkHeight = clamp(height * 0.038, 0.042, 0.058);
  const eaveHeight = height * 0.7;
  const roofRise = height - eaveHeight;
  const roofOverhangX = clamp(width * 0.012, 0.02, 0.032);
  const roofOverhangZ = clamp(depth * 0.01, 0.018, 0.03);
  const roofHalfSpan = fillWidth / 2 + roofOverhangX;
  const roofSlopeLength = Math.hypot(roofHalfSpan, roofRise);
  const roofAngle = Math.atan2(roofRise, roofHalfSpan);
  const columnInset = clamp(fillWidth * 0.035, 0.045, 0.07);
  const columnSpan = Math.max(0.85, fillWidth - columnInset * 2);
  const columnThickness = clamp(Math.min(width, depth) * 0.012, 0.016, 0.024);
  const columnChordGap = clamp(columnThickness * 3.4, 0.048, 0.07);
  const beamThickness = columnThickness * 1.15;
  const frameEndInset = clamp(fillDepth * 0.06, 0.055, 0.09);
  const roofDepth = fillDepth + roofOverhangZ * 2;
  const frontZ = centerZ + fillDepth / 2;
  const rearZ = centerZ - fillDepth / 2;
  const sidewalkWidth = fillWidth + columnChordGap * 0.8;
  const sidewalkDepth = fillDepth + roofOverhangZ * 0.6;
  const gravelWidth = width - gravelInset * 2;
  const gravelDepth = depth - gravelInset * 2;
  const treeCanopy = clamp(Math.min(width, depth) * 0.055, 0.12, 0.17);
  const treeHeight = clamp(height * 0.78, 0.72, 0.92);
  const sideX = width / 2 - treeCanopy - clamp(width * 0.02, 0.04, 0.07);
  const treeZFront = clamp(frontZ - fillDepth * 0.16, -depth / 2 + treeCanopy, depth / 2 - treeCanopy);
  const treeZRear = clamp(rearZ + fillDepth * 0.2, -depth / 2 + treeCanopy, depth / 2 - treeCanopy);
  const trees: ViaExpressaTreePose[] = [-1, 1].flatMap((side) => (
    [treeZFront, treeZRear].map((z, index) => ({
      x: side * sideX,
      z,
      height: treeHeight * (index === 0 ? 1 : 0.9),
      canopyRadius: treeCanopy * (index === 0 ? 1 : 0.88),
      trunkRadius: clamp(treeCanopy * 0.12, 0.018, 0.028),
    }))
  ));

  return {
    width,
    depth,
    height,
    fillWidth,
    fillDepth,
    centerZ,
    platformHeight,
    sidewalkHeight,
    sidewalkWidth,
    sidewalkDepth,
    gravelWidth,
    gravelDepth,
    eaveHeight,
    roofRise,
    roofHalfSpan,
    roofSlopeLength,
    roofAngle,
    roofThickness: clamp(height * 0.02, 0.028, 0.038),
    roofDepth,
    ridgeWidth: clamp(beamThickness * 2.1, 0.055, 0.085),
    columnSpan,
    columnChordGap,
    columnThickness,
    beamThickness,
    braceThickness: columnThickness * 0.72,
    frameCount: VIA_EXPRESSA_LAYOUT.structure.frameCount,
    frameEndInset,
    braceSegmentsPerColumn: VIA_EXPRESSA_LAYOUT.structure.braceSegmentsPerColumn,
    purlinCountPerSlope: VIA_EXPRESSA_LAYOUT.structure.purlinCountPerSlope,
    frontZ,
    rearZ,
    hasEnclosingWalls: false,
    sideWallHeight: 0,
    trees,
    architectureEnvelope: {
      minX: Math.min(-roofHalfSpan, -gravelWidth / 2, ...trees.map((tree) => tree.x - tree.canopyRadius)),
      maxX: Math.max(roofHalfSpan, gravelWidth / 2, ...trees.map((tree) => tree.x + tree.canopyRadius)),
      minZ: Math.min(rearZ - roofOverhangZ, -gravelDepth / 2, ...trees.map((tree) => tree.z - tree.canopyRadius)),
      maxZ: Math.max(frontZ + roofOverhangZ, gravelDepth / 2, ...trees.map((tree) => tree.z + tree.canopyRadius)),
    },
  };
}

export function viaExpressaVisualHeight(bounds: ViaExpressaBounds): number {
  const span = Math.min(finiteOr(bounds.width, 3.05), finiteOr(bounds.depth, 3.05));
  return clamp(span * 0.36, 1.02, VIA_EXPRESSA_LAYOUT.maximumVisualHeight);
}

export function viaExpressaFrontVector(): ReadonlyCoordinate {
  return VIA_EXPRESSA_LAYOUT.frontVector;
}

export function viaExpressaHeadingToTargetErrorRadians(): number {
  const expected = normalize2([
    targetWorldCenter[0] - worldCenter[0],
    targetWorldCenter[1] - worldCenter[1],
  ]);
  const front = VIA_EXPRESSA_LAYOUT.frontVector;
  const dot = Math.min(1, Math.max(-1, front[0] * expected[0] + front[1] * expected[1]));
  return Math.acos(dot);
}

export function viaExpressaCardinalFacingRadians(
  yaw = VIA_EXPRESSA_LAYOUT.facingRadians,
): number {
  return Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
}

/**
 * Facing is cardinal south, so the official east–west AABB already matches
 * local width/depth. Kept as an explicit helper for the landmark wrapper.
 */
export function viaExpressaModelBounds<Bounds extends ViaExpressaBounds>(
  bounds: Bounds,
  yaw = VIA_EXPRESSA_LAYOUT.facingRadians,
): Bounds {
  const cardinal = viaExpressaCardinalFacingRadians(yaw);
  const quarterTurns = Math.round(cardinal / (Math.PI / 2));
  const snapped = quarterTurns * (Math.PI / 2);
  const isOddQuarterTurn = Math.abs(yaw - snapped) < 1e-8
    && Math.abs(quarterTurns) % 2 === 1;
  if (!isOddQuarterTurn) return bounds;
  return { ...bounds, width: bounds.depth, depth: bounds.width };
}

export function viaExpressaFramePositions(layout: ViaExpressaLayout): number[] {
  const usable = Math.max(0.2, layout.fillDepth - layout.frameEndInset * 2);
  const last = Math.max(1, layout.frameCount - 1);
  return Array.from(
    { length: layout.frameCount },
    (_, index) => layout.rearZ + layout.frameEndInset + usable * (index / last),
  );
}

/**
 * Static geometry accounting for focused tests. Repeated truss members are
 * instanced, so each material group remains one draw call.
 */
export function viaExpressaRenderDiagnostics(
  detailed: boolean,
  focused = false,
): ViaExpressaRenderDiagnostics {
  const frameCount = VIA_EXPRESSA_LAYOUT.structure.frameCount;
  const columns = frameCount * 2;
  const chords = columns * 2;
  const braces = columns * VIA_EXPRESSA_LAYOUT.structure.braceSegmentsPerColumn * 2;
  const struts = columns * (VIA_EXPRESSA_LAYOUT.structure.braceSegmentsPerColumn + 1);
  const rafters = frameCount * 2;
  const kingPosts = frameCount;
  const webs = frameCount * 2;
  const eaveTies = frameCount;
  const longitudinalBeams = 3;
  const roofFaces = 2;
  const ridgeCaps = 1;
  const gravel = 1;
  const sidewalk = 1;
  let instances = gravel
    + sidewalk
    + chords
    + braces
    + struts
    + rafters
    + kingPosts
    + webs
    + eaveTies
    + longitudinalBeams
    + roofFaces
    + ridgeCaps;
  let primaryDrawCalls = 6;
  let shadowDrawCalls = 4;

  if (detailed) {
    const purlins = VIA_EXPRESSA_LAYOUT.structure.purlinCountPerSlope * 2;
    const bargeboards = 2;
    const trees = VIA_EXPRESSA_LAYOUT.structure.treeCountPerSide * 2 * 2;
    const sign = 2;
    instances += purlins + bargeboards + trees + sign;
    primaryDrawCalls += 5;
    shadowDrawCalls += 2;
  }

  if (focused) {
    instances += 10;
    primaryDrawCalls += 1;
  }

  const renderedTriangles = instances * 12;
  const budget = focused
    ? VIA_EXPRESSA_RENDER_BUDGET.focused
    : detailed
      ? VIA_EXPRESSA_RENDER_BUDGET.detailed
      : VIA_EXPRESSA_RENDER_BUDGET.overview;

  return {
    primaryDrawCalls,
    renderedTriangles,
    shadowDrawCalls,
    frameCount,
    enclosingWallDrawCalls: 0,
    withinBudget: primaryDrawCalls <= budget.maximumPrimaryDrawCalls
      && renderedTriangles <= budget.maximumRenderedTriangles
      && shadowDrawCalls <= VIA_EXPRESSA_RENDER_BUDGET.maximumShadowDrawCalls,
  };
}
