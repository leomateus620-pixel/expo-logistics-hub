export const MIRANTE_PUBLIC_IDENTIFIER = 'D3';
export const MIRANTE_OFFICIAL_NAME = 'Espaço Mirante';
export const MIRANTE_ARENA_PUBLIC_IDENTIFIER = 'F';

/**
 * Incremental budgets for the purpose-built D3 renderer.
 *
 * These are ceilings, not promises about a particular device. The complete
 * commercial map remains the baseline and must be measured before and after.
 */
export const MIRANTE_RENDER_BUDGET = {
  detailDistanceMinimum: 24,
  detailDistanceMultiplier: 2.82,
  surfaceTextureSize: 256,
  overview: {
    maxDrawCalls: 5,
    maxTriangles: 5_000,
    maxMaterials: 5,
    maxTextures: 0,
    maxShadowCasters: 2,
    furnitureGroups: 0,
  },
  medium: {
    maxDrawCalls: 12,
    maxTriangles: 20_000,
    maxMaterials: 8,
    maxTextures: 2,
    maxShadowCasters: 4,
    furnitureGroups: 2,
  },
  selected: {
    maxDrawCalls: 24,
    maxTriangles: 50_000,
    maxMaterials: 10,
    maxTextures: 4,
    maxShadowCasters: 7,
    furnitureGroups: 4,
  },
  interior: {
    maxDrawCalls: 30,
    maxTriangles: 80_000,
    maxMaterials: 12,
    maxTextures: 4,
    maxShadowCasters: 7,
    maxRenderableNodes: 45,
    furnitureGroups: 4,
  },
  reduced: {
    maxDrawCalls: 18,
    maxTriangles: 35_000,
    maxMaterials: 8,
    maxTextures: 2,
    maxShadowCasters: 0,
    furnitureGroups: 2,
  },
} as const;

export interface MiranteBoundsDimensions {
  width: number;
  depth: number;
}

export interface MiranteEntityCenter {
  centerX: number;
  centerZ: number;
}

export type MiranteVector3 = [number, number, number];
export type MiranteFurnitureKind = 'table' | 'chair';
export type MiranteFurnitureFacing = 'arena' | 'table';

export interface MirantePlatformLayout {
  width: number;
  depth: number;
  topY: number;
  thickness: number;
  centerY: number;
}

export interface MiranteBaseLayout {
  width: number;
  depth: number;
  height: number;
  centerY: number;
  retainingThickness: number;
}

export interface MiranteRoofLayout {
  width: number;
  depth: number;
  eaveY: number;
  ridgeY: number;
  rise: number;
  overhangX: number;
  overhangZ: number;
  halfSpan: number;
  slopeLength: number;
  angle: number;
  thickness: number;
}

export interface MiranteStructureLayout {
  bayCount: number;
  bayInset: number;
  columnSize: number;
  columnHeight: number;
  columnCenterY: number;
  beamSize: number;
  trussMemberSize: number;
  purlinCount: number;
}

export interface MiranteRailingLayout {
  height: number;
  postSize: number;
  railSize: number;
  postSpacing: number;
  inset: number;
}

export interface MiranteAisleLayout {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  furnitureClearance: number;
}

export interface MiranteRampLayout {
  width: number;
  run: number;
  rise: number;
  slope: number;
  start: MiranteVector3;
  endpoint: MiranteVector3;
  center: MiranteVector3;
  rotationY: number;
  landingLength: number;
  guardrailHeight: number;
}

export interface MiranteStairLayout {
  width: number;
  run: number;
  rise: number;
  stepCount: number;
  stepRise: number;
  stepDepth: number;
  start: MiranteVector3;
  endpoint: MiranteVector3;
  center: MiranteVector3;
  rotationY: number;
  landingLength: number;
}

export interface MiranteAccessLayout {
  eastEdgeX: number;
  clearMinZ: number;
  clearMaxZ: number;
  ramp: MiranteRampLayout;
  stairs: MiranteStairLayout;
}

export interface MiranteFurnitureDimensions {
  tableSize: MiranteVector3;
  chairSize: MiranteVector3;
  rowCount: number;
}

export interface MiranteLayout {
  width: number;
  depth: number;
  height: number;
  platform: MirantePlatformLayout;
  base: MiranteBaseLayout;
  roof: MiranteRoofLayout;
  structure: MiranteStructureLayout;
  railings: MiranteRailingLayout;
  aisle: MiranteAisleLayout;
  access: MiranteAccessLayout;
  furniture: MiranteFurnitureDimensions;
}

export interface MiranteFurniturePose {
  id: string;
  kind: MiranteFurnitureKind;
  groupIndex: number;
  position: MiranteVector3;
  rotationY: number;
  dimensions: MiranteVector3;
  facing: MiranteFurnitureFacing;
  castsShadow: boolean;
}

export interface MiranteFurniturePlan {
  tables: MiranteFurniturePose[];
  chairs: MiranteFurniturePose[];
  all: MiranteFurniturePose[];
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * The official map units are not calibrated metres. This height is therefore
 * a conservative visual ratio derived from the long side of the D3 footprint,
 * not a surveyed or code-compliance dimension.
 */
export function miranteVisualHeight(bounds: MiranteBoundsDimensions): number {
  const width = Math.max(0.2, finiteOr(bounds.width, 2.4));
  const depth = Math.max(0.2, finiteOr(bounds.depth, 8.5));
  return clamp(Math.max(width, depth) * 0.27, 2.16, 2.42);
}

/**
 * Unit direction in map X/Z from the Mirante center to the Arena center.
 * It informs camera and hospitality orientation without rotating or mutating
 * the official D3 footprint.
 */
export function miranteArenaFacingDirection(
  fromCenter: MiranteEntityCenter,
  toCenter: MiranteEntityCenter,
): readonly [number, number] {
  const deltaX = finiteOr(toCenter.centerX, 0) - finiteOr(fromCenter.centerX, 0);
  const deltaZ = finiteOr(toCenter.centerZ, 0) - finiteOr(fromCenter.centerZ, 0);
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance <= Number.EPSILON) return [1, 0];
  return [deltaX / distance, deltaZ / distance];
}

export function miranteArenaFacingRadians(
  fromCenter: MiranteEntityCenter,
  toCenter: MiranteEntityCenter,
): number {
  const [directionX, directionZ] = miranteArenaFacingDirection(fromCenter, toCenter);
  return Math.atan2(directionX, directionZ);
}

/**
 * Parametric D3 construction contract. Local X is west/east (+X toward the
 * open Arena side) and local Z follows the official longitudinal footprint.
 * Access dimensions intentionally remain illustrative while map calibration
 * and the built project's measured dimensions are unknown.
 */
export function createMiranteLayout(
  bounds: MiranteBoundsDimensions,
  requestedHeight = miranteVisualHeight(bounds),
): MiranteLayout {
  const width = Math.max(1.6, finiteOr(bounds.width, 2.4));
  const depth = Math.max(4.8, finiteOr(bounds.depth, 8.5));
  const height = Math.max(2.1, finiteOr(requestedHeight, miranteVisualHeight({ width, depth })));

  const platformTopY = clamp(Math.min(width * 0.18, depth * 0.055), 0.36, 0.46);
  const platformThickness = clamp(width * 0.055, 0.11, 0.15);
  const roofRise = clamp(height * 0.135, 0.27, 0.36);
  const overhangX = clamp(width * 0.065, 0.13, 0.2);
  const overhangZ = clamp(depth * 0.028, 0.18, 0.28);
  const halfSpan = width / 2 + overhangX;
  const eaveY = height - roofRise;
  const bayInset = clamp(depth * 0.018, 0.12, 0.18);
  const bayCount = Math.round(clamp(depth / 1.05, 6, 10));
  const columnSize = clamp(width * 0.03, 0.06, 0.085);
  const railingInset = clamp(width * 0.03, 0.06, 0.085);
  const railingHeight = clamp(height * 0.2, 0.42, 0.5);
  const aisleWidth = clamp(width * 0.24, 0.52, 0.64);
  const longitudinalEndClearance = clamp(depth * 0.047, 0.34, 0.46);
  const aisleMinX = -width / 2 + railingInset + 0.02;
  const furnitureClearance = clamp(width * 0.05, 0.1, 0.14);

  // Persisted-neighbour review leaves the +X side as the only clear lateral
  // access edge. Small end offsets avoid the Q-R-04 and B17 overlap bands.
  const clearMinZ = -depth / 2 + Math.max(0.12, depth * 0.018);
  const clearMaxZ = depth / 2 - Math.max(0.95, depth * 0.16);
  const rampRise = platformTopY;
  const rampRun = Math.max(rampRise * 12, depth * 0.58);
  const rampWidth = clamp(width * 0.22, 0.5, 0.58);
  const rampEndpointZ = Math.min(
    clearMaxZ - Math.max(1.1, depth * 0.14),
    Math.max(depth * 0.1, clearMinZ + rampRun),
  );
  const rampStartZ = rampEndpointZ - rampRun;
  const eastEdgeX = width / 2;
  const rampCenterX = eastEdgeX + rampWidth / 2;
  const stairStepCount = Math.max(3, Math.ceil(platformTopY / 0.12));
  const stairStepDepth = clamp(width * 0.075, 0.16, 0.2);
  const stairRun = stairStepCount * stairStepDepth;
  const stairWidth = clamp(width * 0.25, 0.54, 0.64);
  const stairZ = Math.min(
    clearMaxZ - 0.38,
    rampEndpointZ + Math.max(1.1, depth * 0.145),
  );

  const platform: MirantePlatformLayout = {
    width,
    depth,
    topY: platformTopY,
    thickness: platformThickness,
    centerY: platformTopY - platformThickness / 2,
  };
  const base: MiranteBaseLayout = {
    width: width * 0.95,
    depth: depth * 0.92,
    height: Math.max(0.18, platformTopY - platformThickness),
    centerY: Math.max(0.18, platformTopY - platformThickness) / 2,
    retainingThickness: clamp(width * 0.045, 0.085, 0.12),
  };
  const roof: MiranteRoofLayout = {
    width: width + overhangX * 2,
    depth: depth + overhangZ * 2,
    eaveY,
    ridgeY: height,
    rise: roofRise,
    overhangX,
    overhangZ,
    halfSpan,
    slopeLength: Math.hypot(halfSpan, roofRise),
    angle: Math.atan2(roofRise, halfSpan),
    thickness: clamp(width * 0.018, 0.038, 0.05),
  };
  const structure: MiranteStructureLayout = {
    bayCount,
    bayInset,
    columnSize,
    columnHeight: eaveY - platformTopY,
    columnCenterY: platformTopY + (eaveY - platformTopY) / 2,
    beamSize: clamp(width * 0.028, 0.055, 0.075),
    trussMemberSize: clamp(width * 0.019, 0.038, 0.052),
    purlinCount: Math.round(clamp(depth / 0.62, 10, 18)),
  };
  const railings: MiranteRailingLayout = {
    height: railingHeight,
    postSize: clamp(width * 0.014, 0.028, 0.038),
    railSize: clamp(width * 0.011, 0.022, 0.032),
    postSpacing: clamp(width * 0.15, 0.32, 0.42),
    inset: railingInset,
  };
  const aisle: MiranteAisleLayout = {
    minX: aisleMinX,
    maxX: aisleMinX + aisleWidth,
    minZ: -depth / 2 + longitudinalEndClearance,
    maxZ: depth / 2 - longitudinalEndClearance,
    width: aisleWidth,
    furnitureClearance,
  };
  const access: MiranteAccessLayout = {
    eastEdgeX,
    clearMinZ,
    clearMaxZ,
    ramp: {
      width: rampWidth,
      run: rampRun,
      rise: rampRise,
      slope: rampRise / rampRun,
      start: [rampCenterX, 0, rampStartZ],
      endpoint: [rampCenterX, platformTopY, rampEndpointZ],
      center: [rampCenterX, platformTopY / 2, (rampStartZ + rampEndpointZ) / 2],
      rotationY: 0,
      landingLength: clamp(width * 0.3, 0.64, 0.78),
      guardrailHeight: railingHeight,
    },
    stairs: {
      width: stairWidth,
      run: stairRun,
      rise: platformTopY,
      stepCount: stairStepCount,
      stepRise: platformTopY / stairStepCount,
      stepDepth: stairStepDepth,
      start: [eastEdgeX + stairRun, 0, stairZ],
      endpoint: [eastEdgeX, platformTopY, stairZ],
      center: [eastEdgeX + stairRun / 2, platformTopY / 2, stairZ],
      rotationY: -Math.PI / 2,
      landingLength: clamp(width * 0.28, 0.6, 0.74),
    },
  };
  const furniture: MiranteFurnitureDimensions = {
    tableSize: [
      clamp(width * 0.2, 0.42, 0.5),
      clamp(height * 0.165, 0.35, 0.4),
      clamp(depth * 0.052, 0.38, 0.46),
    ],
    chairSize: [
      clamp(width * 0.112, 0.25, 0.29),
      clamp(height * 0.165, 0.35, 0.4),
      clamp(width * 0.116, 0.26, 0.3),
    ],
    rowCount: 4,
  };

  return {
    width,
    depth,
    height,
    platform,
    base,
    roof,
    structure,
    railings,
    aisle,
    access,
    furniture,
  };
}

export function miranteStructuralBayPositions(layout: MiranteLayout): number[] {
  const usableDepth = Math.max(0.2, layout.depth - layout.structure.bayInset * 2);
  return Array.from(
    { length: layout.structure.bayCount + 1 },
    (_, index) => (
      -layout.depth / 2
      + layout.structure.bayInset
      + usableDepth * (index / layout.structure.bayCount)
    ),
  );
}

/**
 * Four restrained hospitality groups occupy the east half. Each group keeps
 * two primary chairs facing +X toward the Arena and one companion chair
 * oriented to the table. The west longitudinal aisle and both east access
 * endpoints remain free.
 */
export function createMiranteFurniturePlan(layout: MiranteLayout): MiranteFurniturePlan {
  const { tableSize, chairSize, rowCount } = layout.furniture;
  const groupHalfDepth = tableSize[2] / 2 + chairSize[2] + 0.12;
  const firstRowZ = -layout.depth / 2 + layout.railings.inset + groupHalfDepth;
  const lastRowZ = Math.min(
    layout.access.ramp.endpoint[2] - groupHalfDepth - 0.42,
    layout.access.stairs.endpoint[2] - groupHalfDepth - 0.72,
  );
  const rowSpan = Math.max(0, lastRowZ - firstRowZ);
  const tableCenterX = Math.min(
    layout.width / 2 - layout.railings.inset - tableSize[0] / 2 - 0.12,
    Math.max(
      layout.width * 0.14,
      layout.aisle.maxX
        + layout.aisle.furnitureClearance
        + chairSize[0]
        + tableSize[0] / 2,
    ),
  );
  const arenaChairX = (
    tableCenterX
    - tableSize[0] / 2
    - chairSize[0] / 2
    - 0.08
  );
  const pairedChairOffsetZ = chairSize[2] * 0.62;
  const companionChairOffsetZ = tableSize[2] / 2 + chairSize[2] / 2 + 0.09;
  const tables: MiranteFurniturePose[] = [];
  const chairs: MiranteFurniturePose[] = [];

  for (let groupIndex = 0; groupIndex < rowCount; groupIndex += 1) {
    const ratio = rowCount === 1 ? 0.5 : groupIndex / (rowCount - 1);
    const rowZ = firstRowZ + rowSpan * ratio;
    const tableY = layout.platform.topY + tableSize[1] / 2;
    const chairY = layout.platform.topY + chairSize[1] / 2;

    tables.push({
      id: `mirante:table:${groupIndex}`,
      kind: 'table',
      groupIndex,
      position: [tableCenterX, tableY, rowZ],
      rotationY: groupIndex % 2 === 0 ? 0.018 : -0.018,
      dimensions: [...tableSize],
      facing: 'arena',
      castsShadow: false,
    });

    chairs.push(
      {
        id: `mirante:chair:${groupIndex}:arena-north`,
        kind: 'chair',
        groupIndex,
        position: [arenaChairX, chairY, rowZ - pairedChairOffsetZ],
        rotationY: Math.PI / 2 + (groupIndex % 2 === 0 ? 0.035 : -0.028),
        dimensions: [...chairSize],
        facing: 'arena',
        castsShadow: false,
      },
      {
        id: `mirante:chair:${groupIndex}:arena-south`,
        kind: 'chair',
        groupIndex,
        position: [arenaChairX, chairY, rowZ + pairedChairOffsetZ],
        rotationY: Math.PI / 2 + (groupIndex % 2 === 0 ? -0.026 : 0.032),
        dimensions: [...chairSize],
        facing: 'arena',
        castsShadow: false,
      },
      {
        id: `mirante:chair:${groupIndex}:companion`,
        kind: 'chair',
        groupIndex,
        position: [tableCenterX, chairY, rowZ + companionChairOffsetZ],
        rotationY: Math.PI,
        dimensions: [...chairSize],
        facing: 'table',
        castsShadow: false,
      },
    );
  }

  return {
    tables,
    chairs,
    all: [...tables, ...chairs],
  };
}
