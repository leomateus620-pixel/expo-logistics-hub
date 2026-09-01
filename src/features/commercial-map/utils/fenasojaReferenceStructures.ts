/**
 * Parametric, view-only reconstruction contracts for the permanent structures
 * photographed in the September 2026 field set. The persisted map entities
 * remain the authority for identity, coordinates, footprint and interaction.
 * Map units are cartographic presentation units, not surveyed metres.
 */

export const FENASOJA_STRUCTURE_RECONSTRUCTION_REVISION = '2028.1-field-reference.2';

export const COOPERATIVISM_PUBLIC_IDENTIFIER = 'B28';
export const COOPERATIVISM_FRONT_ANCHOR_IDENTIFIER = 'Q-M-08';
export const COOPERATIVISM_FACING_RADIANS = 0;

export const GASTRONOMIC_ALAMEDA_PUBLIC_IDENTIFIER = 'D1';
export const GASTRONOMIC_ALAMEDA_FRONT_ANCHOR = 'ARENA_FRONT_STAIRS';
// D1 occupies a straight north-south official envelope. Its long facade must
// remain parallel to that envelope while local +Z points due east (+X world),
// toward the Arena access/stair sector. Do not skew the building toward the
// exact stair centroid: the field review confirms the real building is straight.
export const GASTRONOMIC_ALAMEDA_FACING_RADIANS = Math.PI / 2;
export const GASTRONOMIC_ALAMEDA_FLAGPOLE_COUNT = 17;

export const FENASOJA_STRUCTURE_REFERENCE_ASSETS = Object.freeze({
  currentCooperativism: Object.freeze({
    fileName: 'IMG_0064.jpeg',
    sha256: '2D79F22F5B7B2A67ED474ABECCBA0E4E33D13FDCAD4A2942BCBFF81CCD7349BA',
  }),
  currentGastronomicAlameda: Object.freeze({
    fileName: 'IMG_0065.jpeg',
    sha256: 'B3BA4785F3F0D36418C0FCC5A8B19F10A0E3EBDD791558590F2B2F29CDDB0A4D',
  }),
  realCooperativism: Object.freeze({
    fileName: 'IMG_9724.jpeg',
    sha256: 'F782652DEA2BDB20467133DDF2FE8D5314E0C2DE1BB8469B5684CCACA1AB6D8B',
  }),
  realGastronomicAlameda: Object.freeze({
    fileName: 'IMG_9699.jpeg',
    sha256: 'D3A72D48BBFF1E8256D3F3F789772E5FD317DA58707983E6E669F864954CB11C',
  }),
});

export interface ReferenceStructureBounds {
  width: number;
  depth: number;
}

export interface CooperativismLayout {
  width: number;
  depth: number;
  height: number;
  foundation: {
    width: number;
    depth: number;
    height: number;
    topY: number;
    frontApronDepth: number;
  };
  wall: {
    width: number;
    depth: number;
    height: number;
    centerY: number;
    frontZ: number;
  };
  roof: {
    width: number;
    depth: number;
    eaveY: number;
    ridgeY: number;
    rise: number;
    halfSpan: number;
    slopeLength: number;
    angle: number;
    thickness: number;
    ribCount: number;
  };
  facade: {
    recessDepth: number;
    entranceWidth: number;
    entranceHeight: number;
    entranceCenterY: number;
    signWidth: number;
    signHeight: number;
    signCenterY: number;
    sideWindowCount: number;
  };
}

export interface GastronomicAlamedaLayout {
  width: number;
  depth: number;
  visualHeight: number;
  platform: {
    width: number;
    depth: number;
    topY: number;
    thickness: number;
    centerY: number;
    centerZ: number;
    frontZ: number;
  };
  building: {
    width: number;
    depth: number;
    centerZ: number;
    frontZ: number;
    wallBaseY: number;
    wallHeight: number;
    wallCenterY: number;
    bayCount: number;
    columnRadius: number;
  };
  roof: {
    width: number;
    depth: number;
    eaveY: number;
    ridgeY: number;
    rise: number;
    halfSpan: number;
    slopeLength: number;
    angle: number;
    thickness: number;
    ribCount: number;
  };
  access: {
    stairWidth: number;
    stairRun: number;
    stepCount: number;
    stepRise: number;
    stepDepth: number;
    centerX: number;
    frontZ: number;
    rampWidth: number;
    rampCenterX: number;
    railingHeight: number;
  };
  flagpoles: {
    count: number;
    lineZ: number;
    minimumHeight: number;
    maximumHeight: number;
    radius: number;
    positionsX: readonly number[];
    heights: readonly number[];
  };
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function landmarkFrontVector(facingRadians: number): readonly [number, number] {
  return [Math.sin(facingRadians), Math.cos(facingRadians)];
}

/**
 * Fits a local rectangle inside axis-aligned persisted bounds after rotation.
 * This keeps D1's straight long axis inside its official north-south envelope
 * without spilling into Rua Brasília or neighbouring canonical geometry.
 */
export function fitRotatedStructureBounds<Bounds extends ReferenceStructureBounds>(
  bounds: Bounds,
  facingRadians: number,
): Bounds {
  const cosine = Math.abs(Math.cos(facingRadians));
  const sine = Math.abs(Math.sin(facingRadians));
  const determinant = cosine * cosine - sine * sine;
  if (Math.abs(determinant) < 1e-6) return bounds;
  const width = (bounds.width * cosine - bounds.depth * sine) / determinant;
  const depth = (bounds.depth * cosine - bounds.width * sine) / determinant;
  if (!Number.isFinite(width) || !Number.isFinite(depth) || width <= 0.2 || depth <= 0.2) {
    return bounds;
  }
  return { ...bounds, width, depth };
}

export function cooperativismVisualHeight(bounds: ReferenceStructureBounds): number {
  const longSide = Math.max(finiteOr(bounds.width, 4.8), finiteOr(bounds.depth, 1.95));
  return clamp(longSide * 0.55, 2.42, 2.72);
}

export function createCooperativismLayout(
  bounds: ReferenceStructureBounds,
  requestedHeight = cooperativismVisualHeight(bounds),
): CooperativismLayout {
  const width = Math.max(3.8, finiteOr(bounds.width, 4.8));
  const depth = Math.max(1.55, finiteOr(bounds.depth, 1.95));
  const height = clamp(finiteOr(requestedHeight, cooperativismVisualHeight({ width, depth })), 2.42, 2.72);
  const foundationHeight = clamp(width * 0.022, 0.085, 0.115);
  const foundationTopY = foundationHeight;
  const wallHeight = clamp(height * 0.46, 1.08, 1.24);
  const eaveY = foundationTopY + clamp(height * 0.245, 0.58, 0.68);
  const ridgeY = height;
  const halfSpan = width / 2 + clamp(width * 0.045, 0.18, 0.24);
  const rise = ridgeY - eaveY;
  const roofDepth = depth + clamp(depth * 0.14, 0.2, 0.3);
  const wallDepth = depth * 0.82;
  const frontZ = wallDepth / 2;
  const entranceHeight = clamp(wallHeight * 0.7, 0.75, 0.88);

  return {
    width,
    depth,
    height,
    foundation: {
      width: width * 1.025,
      depth: depth * 1.16,
      height: foundationHeight,
      topY: foundationTopY,
      frontApronDepth: depth * 0.22,
    },
    wall: {
      width: width * 0.72,
      depth: wallDepth,
      height: wallHeight,
      centerY: foundationTopY + wallHeight / 2,
      frontZ,
    },
    roof: {
      width: halfSpan * 2,
      depth: roofDepth,
      eaveY,
      ridgeY,
      rise,
      halfSpan,
      slopeLength: Math.hypot(halfSpan, rise),
      angle: Math.atan2(rise, halfSpan),
      thickness: clamp(width * 0.018, 0.065, 0.09),
      ribCount: Math.round(clamp(roofDepth / 0.17, 10, 16)),
    },
    facade: {
      recessDepth: clamp(depth * 0.055, 0.085, 0.12),
      entranceWidth: clamp(width * 0.17, 0.7, 0.84),
      entranceHeight,
      entranceCenterY: foundationTopY + entranceHeight / 2,
      signWidth: clamp(width * 0.31, 1.35, 1.62),
      signHeight: clamp(height * 0.19, 0.45, 0.52),
      signCenterY: foundationTopY + wallHeight + clamp(height * 0.12, 0.28, 0.34),
      sideWindowCount: 3,
    },
  };
}

export function gastronomicAlamedaVisualHeight(bounds: ReferenceStructureBounds): number {
  const longSide = Math.max(finiteOr(bounds.width, 3.25), finiteOr(bounds.depth, 4.58));
  // Includes the tall empty flagpoles, which are the highest real feature.
  return clamp(longSide * 0.69, 2.9, 3.28);
}

export function createGastronomicAlamedaLayout(
  bounds: ReferenceStructureBounds,
  requestedVisualHeight = gastronomicAlamedaVisualHeight(bounds),
): GastronomicAlamedaLayout {
  // The landmark wrapper solves the exact rotated rectangle inside the
  // canonical envelope, so local X is the long facade and local +Z points to
  // the Arena staircase without spilling into adjacent roads.
  const width = Math.max(4, finiteOr(bounds.width, 4.58));
  const depth = Math.max(2.3, finiteOr(bounds.depth, 2.47));
  const visualHeight = clamp(finiteOr(requestedVisualHeight, 3.1), 2.9, 3.28);
  const platformTopY = clamp(depth * 0.105, 0.29, 0.36);
  const platformThickness = clamp(depth * 0.038, 0.1, 0.13);
  const platformFrontZ = depth / 2 - depth * 0.045;
  const buildingDepth = depth * 0.58;
  const rearMargin = depth * 0.055;
  const buildingCenterZ = -depth / 2 + rearMargin + buildingDepth / 2;
  const buildingFrontZ = buildingCenterZ + buildingDepth / 2;
  const wallHeight = clamp(width * 0.205, 0.88, 1.02);
  const wallBaseY = platformTopY;
  const roofEaveY = wallBaseY + wallHeight;
  const roofRise = clamp(depth * 0.085, 0.23, 0.3);
  const roofHalfSpan = buildingDepth / 2 + clamp(depth * 0.055, 0.15, 0.2);
  // The fitted width already includes the roof silhouette; wall inset creates
  // the visible overhang while the roof itself stays inside the official lot.
  const roofWidth = width;
  const stepCount = 5;
  const stairRun = Math.min(depth * 0.25, 0.74);
  const poleLineZ = platformFrontZ - depth * 0.055;
  const poleSpan = width * 0.92;
  const leftPoleCount = 8;
  const rightPoleCount = GASTRONOMIC_ALAMEDA_FLAGPOLE_COUNT - leftPoleCount;
  const centralClearance = clamp(width * 0.115, 0.48, 0.58);
  const sidePolePositions = (count: number, start: number, end: number, phase: number) => (
    Array.from({ length: count }, (_, index) => {
      const normalized = count === 1 ? 0.5 : index / (count - 1);
      return start + (end - start) * normalized + Math.sin(index * 1.73 + phase) * width * 0.0018;
    })
  );
  const positionsX = [
    ...sidePolePositions(leftPoleCount, -poleSpan / 2, -centralClearance, 0.2),
    ...sidePolePositions(rightPoleCount, centralClearance, poleSpan / 2, 0.8),
  ];
  const minimumPoleHeight = visualHeight * 0.78;
  const maximumPoleHeight = visualHeight;
  const heights = positionsX.map((_, index) => {
    const deterministic = 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(index * 2.17 + 0.4));
    return clamp(visualHeight * deterministic, minimumPoleHeight, maximumPoleHeight);
  });

  return {
    width,
    depth,
    visualHeight,
    platform: {
      width: width * 0.985,
      depth: platformFrontZ - (-depth / 2 + depth * 0.035),
      topY: platformTopY,
      thickness: platformThickness,
      centerY: platformTopY - platformThickness / 2,
      centerZ: (-depth / 2 + depth * 0.035 + platformFrontZ) / 2,
      frontZ: platformFrontZ,
    },
    building: {
      width: width * 0.93,
      depth: buildingDepth,
      centerZ: buildingCenterZ,
      frontZ: buildingFrontZ,
      wallBaseY,
      wallHeight,
      wallCenterY: wallBaseY + wallHeight / 2,
      bayCount: 7,
      columnRadius: clamp(width * 0.009, 0.038, 0.05),
    },
    roof: {
      width: roofWidth,
      depth: roofHalfSpan * 2,
      eaveY: roofEaveY,
      ridgeY: roofEaveY + roofRise,
      rise: roofRise,
      halfSpan: roofHalfSpan,
      slopeLength: Math.hypot(roofHalfSpan, roofRise),
      angle: Math.atan2(roofRise, roofHalfSpan),
      thickness: clamp(width * 0.012, 0.052, 0.065),
      ribCount: Math.round(clamp(roofWidth / 0.18, 18, 28)),
    },
    access: {
      stairWidth: clamp(width * 0.19, 0.78, 0.92),
      stairRun,
      stepCount,
      stepRise: platformTopY / stepCount,
      stepDepth: stairRun / stepCount,
      centerX: 0,
      frontZ: platformFrontZ,
      rampWidth: clamp(width * 0.13, 0.54, 0.64),
      rampCenterX: -width * 0.39,
      railingHeight: clamp(wallHeight * 0.43, 0.4, 0.48),
    },
    flagpoles: {
      count: GASTRONOMIC_ALAMEDA_FLAGPOLE_COUNT,
      lineZ: poleLineZ,
      minimumHeight: minimumPoleHeight,
      maximumHeight: maximumPoleHeight,
      radius: clamp(width * 0.0042, 0.017, 0.022),
      positionsX,
      heights,
    },
  };
}
