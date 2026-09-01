export const PAVILION_FOUR_SOY_KITCHEN_REVISION = '2026.4-b7.1';

export const PAVILION_FOUR_SOY_KITCHEN_SOURCES = [
  'docs/refs-pavilhao4-lado.jpg',
  'docs/refs-pavilhao4-frente.jpg',
] as const;

export const PAVILION_FOUR_SOY_KITCHEN_LAYOUT = {
  officialEntityIdentifier: 'B7',
  officialName: 'Pavilhão 4 — Cozinha da Soja',
  facingRadians: 0,
  focusDirection: [0.48, 0.46, 0.92] as const,
  referenceFrame: {
    facade: '+Z',
    longAxis: 'X',
    sourcePhotosRotationDegrees: 180,
  },
  footprintFill: {
    siteWidth: 0.98,
    siteDepth: 0.98,
    buildingWidth: 0.9,
    buildingDepth: 0.68,
    buildingCenterZ: -0.08,
  },
  infrastructure: {
    frontPoleSourceMarkerIds: ['pole-ref-216', 'pole-ref-218'] as const,
    facadeReceptionSourceMarkerId: 'transformer-ref-007',
    frontPoleSide: '+Z',
    facadeReceptionSide: '-X',
  },
  palette: {
    wall: '#dddcd4',
    accent: '#65402f',
    roof: '#9ba1a0',
    trim: '#eeeae0',
    dark: '#30383a',
    glass: '#4c5b5d',
    green: '#476340',
    white: '#f3f0e7',
    platform: '#754939',
    metal: '#697173',
  },
} as const;

export const PAVILION_FOUR_SOY_KITCHEN_RENDER_BUDGET = {
  overview: {
    maximumPrimaryDrawCalls: 15,
    maximumRenderedTriangles: 1_200,
  },
  detailed: {
    maximumPrimaryDrawCalls: 19,
    maximumRenderedTriangles: 3_000,
  },
  selected: {
    maximumPrimaryDrawCalls: 20,
    maximumRenderedTriangles: 4_300,
  },
  maximumShadowDrawCalls: 13,
} as const;

export interface PavilionFourSoyKitchenRenderDiagnostics {
  primaryDrawCalls: number;
  renderedTriangles: number;
  shadowDrawCalls: number;
  roofRibCount: number;
  brickJointCount: number;
  withinBudget: boolean;
}

export interface PavilionFourBounds {
  width: number;
  depth: number;
}

export interface PavilionFourSoyKitchenLayout {
  width: number;
  depth: number;
  visualHeight: number;
  site: {
    width: number;
    depth: number;
    height: number;
  };
  building: {
    width: number;
    depth: number;
    centerZ: number;
    foundationHeight: number;
    eaveY: number;
    ridgeY: number;
    frontZ: number;
    rearZ: number;
  };
  roof: {
    width: number;
    depth: number;
    rise: number;
    halfRun: number;
    slopeLength: number;
    pitch: number;
    thickness: number;
    ribCount: number;
  };
  upperBand: {
    centerY: number;
    height: number;
  };
  windows: {
    centersX: readonly number[];
    width: number;
    height: number;
    centerY: number;
    louverCount: number;
  };
  slidingDoor: {
    sideX: number;
    centerZ: number;
    width: number;
    height: number;
    centerY: number;
    ribCount: number;
  };
  pergola: {
    width: number;
    depth: number;
    frontZ: number;
    postHeight: number;
    postSize: number;
    rafterCount: number;
  };
  sign: {
    width: number;
    height: number;
    centerY: number;
    z: number;
  };
  landscape: {
    plantCentersX: readonly number[];
    z: number;
    trunkHeight: number;
    leafLength: number;
  };
  cornerTower: {
    centerX: number;
    centerZ: number;
    width: number;
    height: number;
    memberSize: number;
  };
  architectureEnvelope: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * B7 keeps its official footprint; only the local architectural presentation is
 * derived here. Local +Z is the photographed public facade toward Quadra G.
 */
export function createPavilionFourSoyKitchenLayout(
  bounds: PavilionFourBounds,
  requestedVisualHeight = pavilionFourSoyKitchenVisualHeight(bounds),
): PavilionFourSoyKitchenLayout {
  const width = Math.max(1.8, finiteOr(bounds.width, 3.7));
  const depth = Math.max(0.9, finiteOr(bounds.depth, 1.55));
  const visualHeight = Math.max(
    1.55,
    finiteOr(requestedVisualHeight, pavilionFourSoyKitchenVisualHeight({ width, depth })),
  );
  const siteWidth = width * PAVILION_FOUR_SOY_KITCHEN_LAYOUT.footprintFill.siteWidth;
  const siteDepth = depth * PAVILION_FOUR_SOY_KITCHEN_LAYOUT.footprintFill.siteDepth;
  const buildingWidth = width
    * PAVILION_FOUR_SOY_KITCHEN_LAYOUT.footprintFill.buildingWidth;
  const buildingDepth = depth
    * PAVILION_FOUR_SOY_KITCHEN_LAYOUT.footprintFill.buildingDepth;
  const buildingCenterZ = depth
    * PAVILION_FOUR_SOY_KITCHEN_LAYOUT.footprintFill.buildingCenterZ;
  const foundationHeight = clamp(depth * 0.045, 0.055, 0.075);
  const ridgeY = clamp(visualHeight * 0.79, 1.34, 1.46);
  const roofRise = clamp(ridgeY * 0.115, 0.15, 0.19);
  const eaveY = ridgeY - roofRise;
  const roofOverhang = clamp(depth * 0.045, 0.055, 0.075);
  const roofHalfRun = buildingDepth / 2 + roofOverhang;
  const roofDepth = roofHalfRun * 2;
  const roofWidth = buildingWidth + roofOverhang * 2;
  const roofSlopeLength = Math.hypot(roofHalfRun, roofRise);
  const frontZ = buildingCenterZ + buildingDepth / 2;
  const rearZ = buildingCenterZ - buildingDepth / 2;
  const bandHeight = clamp((eaveY - foundationHeight) * 0.22, 0.22, 0.28);
  const windowWidth = clamp(buildingWidth * 0.112, 0.34, 0.42);
  const windowHeight = clamp((eaveY - foundationHeight) * 0.34, 0.38, 0.46);
  const pergolaWidth = buildingWidth * 0.58;
  const pergolaDepth = Math.min(
    depth / 2 - frontZ - 0.045,
    clamp(depth * 0.19, 0.24, 0.3),
  );
  const pergolaFrontZ = frontZ + pergolaDepth;
  const towerWidth = clamp(width * 0.04, 0.12, 0.16);
  const towerCenterX = -buildingWidth / 2 + towerWidth * 0.58;
  const towerCenterZ = rearZ + towerWidth * 0.72;

  return {
    width,
    depth,
    visualHeight,
    site: {
      width: siteWidth,
      depth: siteDepth,
      height: 0.055,
    },
    building: {
      width: buildingWidth,
      depth: buildingDepth,
      centerZ: buildingCenterZ,
      foundationHeight,
      eaveY,
      ridgeY,
      frontZ,
      rearZ,
    },
    roof: {
      width: roofWidth,
      depth: roofDepth,
      rise: roofRise,
      halfRun: roofHalfRun,
      slopeLength: roofSlopeLength,
      pitch: Math.atan2(roofRise, roofHalfRun),
      thickness: 0.045,
      ribCount: 22,
    },
    upperBand: {
      centerY: eaveY - bandHeight / 2,
      height: bandHeight,
    },
    windows: {
      centersX: [-0.39, -0.2, 0.2, 0.39].map((ratio) => ratio * buildingWidth),
      width: windowWidth,
      height: windowHeight,
      centerY: foundationHeight + windowHeight * 0.72,
      louverCount: 6,
    },
    slidingDoor: {
      sideX: buildingWidth / 2 + 0.014,
      centerZ: buildingCenterZ - buildingDepth * 0.04,
      width: buildingDepth * 0.46,
      height: (eaveY - foundationHeight) * 0.58,
      centerY: foundationHeight + (eaveY - foundationHeight) * 0.29,
      ribCount: 7,
    },
    pergola: {
      width: pergolaWidth,
      depth: pergolaDepth,
      frontZ: pergolaFrontZ,
      postHeight: eaveY * 0.72,
      postSize: 0.075,
      rafterCount: 7,
    },
    sign: {
      width: buildingWidth * 0.35,
      height: clamp(eaveY * 0.16, 0.19, 0.23),
      centerY: eaveY * 0.56,
      z: frontZ + 0.035,
    },
    landscape: {
      plantCentersX: [-0.43, -0.3, 0.31, 0.43].map((ratio) => ratio * buildingWidth),
      z: frontZ + Math.min(pergolaDepth * 0.45, 0.12),
      trunkHeight: 0.16,
      leafLength: clamp(depth * 0.2, 0.24, 0.32),
    },
    cornerTower: {
      centerX: towerCenterX,
      centerZ: towerCenterZ,
      width: towerWidth,
      height: eaveY * 0.98,
      memberSize: 0.018,
    },
    architectureEnvelope: {
      minX: -siteWidth / 2,
      maxX: siteWidth / 2,
      minZ: -siteDepth / 2,
      maxZ: siteDepth / 2,
    },
  };
}

/** The pole tops, not the low roof, define B7's label/focus clearance. */
export function pavilionFourSoyKitchenVisualHeight(bounds: PavilionFourBounds): number {
  const width = Math.max(1.8, finiteOr(bounds.width, 3.7));
  return clamp(width * 0.48, 1.72, 1.82);
}

/** Conservative static accounting for the instanced procedural renderer. */
export function pavilionFourSoyKitchenRenderDiagnostics(
  showDetail: boolean,
  showFocusDetail: boolean,
): PavilionFourSoyKitchenRenderDiagnostics {
  const detailed = showDetail || showFocusDetail;
  const level = showFocusDetail ? 'selected' : detailed ? 'detailed' : 'overview';
  const primaryDrawCalls = showFocusDetail ? 20 : detailed ? 19 : 15;
  const renderedTriangles = showFocusDetail ? 3_660 : detailed ? 2_340 : 960;
  const shadowDrawCalls = detailed ? 13 : 12;
  const budget = PAVILION_FOUR_SOY_KITCHEN_RENDER_BUDGET[level];

  return {
    primaryDrawCalls,
    renderedTriangles,
    shadowDrawCalls,
    roofRibCount: detailed ? 44 : 0,
    brickJointCount: showFocusDetail ? 104 : 0,
    withinBudget: primaryDrawCalls <= budget.maximumPrimaryDrawCalls
      && renderedTriangles <= budget.maximumRenderedTriangles
      && shadowDrawCalls <= PAVILION_FOUR_SOY_KITCHEN_RENDER_BUDGET.maximumShadowDrawCalls,
  };
}
