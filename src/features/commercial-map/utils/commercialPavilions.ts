import type { MapEntity } from '../types';

export const COMMERCIAL_PAVILION_PUBLIC_IDENTIFIERS = [
  'B1',
  'B2',
  'B3',
  'B4',
  'B5',
  'B6',
  'B8',
  'B10',
] as const;

export type CommercialPavilionPublicIdentifier =
  (typeof COMMERCIAL_PAVILION_PUBLIC_IDENTIFIERS)[number];

export type CommercialPavilionVariant =
  | 'grand-portal'
  | 'dual-craft-hall'
  | 'sawtooth-industrial'
  | 'monitor-industrial'
  | 'stepped-market'
  | 'triple-portal'
  | 'garden-gallery'
  | 'agroindustry-market';

export type CommercialPavilionRoofProfile =
  | 'broad-gable'
  | 'twin-offset-gables'
  | 'northlight-sawtooth'
  | 'raised-monitor'
  | 'asymmetric-shed'
  | 'triple-gable'
  | 'clerestory-span'
  | 'longitudinal-gable';

export type CommercialPavilionEntrancePattern =
  | 'grand-central'
  | 'split-central-mass'
  | 'paired-offset'
  | 'side-service'
  | 'recessed-central'
  | 'triple-bays'
  | 'paired-end-bays'
  | 'paired-market-bays';

export interface CommercialPavilionBoundsDimensions {
  width: number;
  depth: number;
}

export interface CommercialPavilionDefinition {
  publicIdentifier: CommercialPavilionPublicIdentifier;
  pavilionNumber: 1 | 3 | 5 | 7 | 8 | 12 | 13 | 14;
  officialName: string;
  activity: string;
  variant: CommercialPavilionVariant;
  roofProfile: CommercialPavilionRoofProfile;
  entrancePattern: CommercialPavilionEntrancePattern;
  entranceCount: number;
  /** Local +Z is the public/front facade before this Y-axis rotation. */
  facingRadians: number;
  focusDirection: readonly [number, number, number];
  visualHeight: {
    scale: number;
    min: number;
    max: number;
  };
  facade: {
    entranceWidthRatio: number;
    entranceHeightRatio: number;
    centralMassRatio: number;
  };
}

export interface CommercialPavilionRect {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
}

export interface CommercialPavilionVolume extends CommercialPavilionRect {
  centerY: number;
  height: number;
}

export interface CommercialPavilionEntrance extends CommercialPavilionVolume {
  id: string;
  index: number;
}

export interface CommercialPavilionColumnPose {
  id: string;
  x: number;
  z: number;
  size: number;
  height: number;
  centerY: number;
}

export interface CommercialPavilionLayout {
  publicIdentifier: CommercialPavilionPublicIdentifier;
  variant: CommercialPavilionVariant;
  width: number;
  depth: number;
  height: number;
  exterior: {
    slab: {
      width: number;
      depth: number;
      height: number;
      centerY: number;
    };
    shell: {
      width: number;
      depth: number;
      height: number;
      centerY: number;
      frontZ: number;
      backZ: number;
    };
    roof: {
      profile: CommercialPavilionRoofProfile;
      width: number;
      depth: number;
      eaveY: number;
      ridgeY: number;
      rise: number;
      thickness: number;
      sectionCount: number;
    };
    facade: {
      frontZ: number;
      columnSize: number;
      dividerXs: number[];
      centralMass: CommercialPavilionVolume | null;
      entrances: CommercialPavilionEntrance[];
    };
    structure: {
      columnSize: number;
      columnHeight: number;
      columnCenterY: number;
      bayCountX: number;
      bayCountZ: number;
      columnXs: number[];
      columnZs: number[];
    };
  };
  interior: {
    floorY: number;
    perimeterInset: number;
    clearWidth: number;
    clearDepth: number;
    mainAisle: CommercialPavilionRect;
    crossAisles: CommercialPavilionRect[];
    exhibitBands: CommercialPavilionRect[];
    columns: CommercialPavilionColumnPose[];
  };
}

/**
 * Eight official pavilion footprints, one architectural family and no prefix
 * matching. In particular, pavilion 12 is B3; B12 is the Fenasoja
 * headquarters and intentionally does not belong to this registry.
 */
export const COMMERCIAL_PAVILION_DEFINITIONS = {
  B1: {
    publicIdentifier: 'B1',
    pavilionNumber: 1,
    officialName: 'Pavilhão 1 — Comércio e serviços',
    activity: 'Comércio e serviços',
    variant: 'grand-portal',
    roofProfile: 'broad-gable',
    entrancePattern: 'grand-central',
    entranceCount: 1,
    facingRadians: Math.PI / 2,
    focusDirection: [0.92, 1.44, -0.92],
    visualHeight: { scale: 0.49, min: 2.35, max: 2.72 },
    facade: {
      entranceWidthRatio: 0.48,
      entranceHeightRatio: 0.64,
      centralMassRatio: 0,
    },
  },
  B2: {
    publicIdentifier: 'B2',
    pavilionNumber: 14,
    officialName: 'Pavilhão 14 — Artesanato e comércio',
    activity: 'Artesanato e comércio',
    variant: 'dual-craft-hall',
    roofProfile: 'twin-offset-gables',
    entrancePattern: 'split-central-mass',
    entranceCount: 2,
    facingRadians: Math.PI / 2,
    focusDirection: [0.94, 0.76, 0.12],
    visualHeight: { scale: 0.47, min: 2.25, max: 2.58 },
    facade: {
      entranceWidthRatio: 0.22,
      entranceHeightRatio: 0.56,
      centralMassRatio: 0.26,
    },
  },
  B3: {
    publicIdentifier: 'B3',
    pavilionNumber: 12,
    officialName: 'Pavilhão 12 — Indústria e comércio',
    activity: 'Indústria e comércio',
    variant: 'sawtooth-industrial',
    roofProfile: 'northlight-sawtooth',
    entrancePattern: 'paired-offset',
    entranceCount: 2,
    facingRadians: Math.PI,
    focusDirection: [0.04, 0.78, -0.95],
    visualHeight: { scale: 0.43, min: 2.48, max: 2.82 },
    facade: {
      entranceWidthRatio: 0.2,
      entranceHeightRatio: 0.54,
      centralMassRatio: 0,
    },
  },
  B4: {
    publicIdentifier: 'B4',
    pavilionNumber: 8,
    officialName: 'Pavilhão 8 — Indústria e comércio',
    activity: 'Indústria e comércio',
    variant: 'monitor-industrial',
    roofProfile: 'raised-monitor',
    entrancePattern: 'side-service',
    entranceCount: 1,
    facingRadians: Math.PI,
    focusDirection: [-0.06, 0.8, -0.95],
    visualHeight: { scale: 0.53, min: 2.1, max: 2.42 },
    facade: {
      entranceWidthRatio: 0.34,
      entranceHeightRatio: 0.58,
      centralMassRatio: 0,
    },
  },
  B5: {
    publicIdentifier: 'B5',
    pavilionNumber: 13,
    officialName: 'Pavilhão 13 — Comércio',
    activity: 'Comércio',
    variant: 'stepped-market',
    roofProfile: 'asymmetric-shed',
    entrancePattern: 'recessed-central',
    entranceCount: 1,
    facingRadians: Math.PI,
    focusDirection: [-0.14, 0.78, -0.94],
    visualHeight: { scale: 0.5, min: 2.08, max: 2.38 },
    facade: {
      entranceWidthRatio: 0.36,
      entranceHeightRatio: 0.52,
      centralMassRatio: 0,
    },
  },
  B6: {
    publicIdentifier: 'B6',
    pavilionNumber: 3,
    officialName: 'Pavilhão 3 — Comércio',
    activity: 'Comércio',
    variant: 'triple-portal',
    roofProfile: 'triple-gable',
    entrancePattern: 'triple-bays',
    entranceCount: 3,
    facingRadians: Math.PI,
    focusDirection: [-0.22, 0.76, -0.92],
    visualHeight: { scale: 0.47, min: 2.35, max: 2.68 },
    facade: {
      entranceWidthRatio: 0.2,
      entranceHeightRatio: 0.57,
      centralMassRatio: 0,
    },
  },
  B8: {
    publicIdentifier: 'B8',
    pavilionNumber: 5,
    officialName: 'Pavilhão 5 — Floriculturas',
    activity: 'Floriculturas',
    variant: 'garden-gallery',
    roofProfile: 'clerestory-span',
    entrancePattern: 'paired-end-bays',
    entranceCount: 2,
    facingRadians: 0,
    focusDirection: [0.12, 0.84, 0.96],
    visualHeight: { scale: 0.45, min: 2.2, max: 2.54 },
    facade: {
      entranceWidthRatio: 0.2,
      entranceHeightRatio: 0.58,
      centralMassRatio: 0,
    },
  },
  B10: {
    publicIdentifier: 'B10',
    pavilionNumber: 7,
    officialName: 'Pavilhão 7 — Agricultura familiar / soja e derivados',
    activity: 'Agricultura familiar / agroindústrias',
    variant: 'agroindustry-market',
    roofProfile: 'longitudinal-gable',
    entrancePattern: 'paired-market-bays',
    entranceCount: 2,
    facingRadians: 0,
    focusDirection: [0.08, 0.8, 0.98],
    visualHeight: { scale: 0.44, min: 2.22, max: 2.56 },
    facade: {
      entranceWidthRatio: 0.24,
      entranceHeightRatio: 0.56,
      centralMassRatio: 0,
    },
  },
} as const satisfies Readonly<
  Record<CommercialPavilionPublicIdentifier, CommercialPavilionDefinition>
>;

function normalizePublicIdentifier(entity: Pick<MapEntity, 'publicIdentifier'>): string {
  return entity.publicIdentifier.trim().toLocaleUpperCase('pt-BR');
}

export function resolveCommercialPavilionDefinition(
  entity: Pick<MapEntity, 'publicIdentifier'>,
): CommercialPavilionDefinition | null {
  const publicIdentifier = normalizePublicIdentifier(entity);
  if (!COMMERCIAL_PAVILION_PUBLIC_IDENTIFIERS.includes(
    publicIdentifier as CommercialPavilionPublicIdentifier,
  )) {
    return null;
  }
  return COMMERCIAL_PAVILION_DEFINITIONS[
    publicIdentifier as CommercialPavilionPublicIdentifier
  ];
}

export function commercialPavilionSupportsInterior(
  entity: Pick<MapEntity, 'publicIdentifier'>,
): boolean {
  return resolveCommercialPavilionDefinition(entity) !== null;
}

export function commercialPavilionFacingRadians(
  entity: Pick<MapEntity, 'publicIdentifier'>,
): number {
  return resolveCommercialPavilionDefinition(entity)?.facingRadians ?? 0;
}

export function commercialPavilionFocusDirection(
  entity: Pick<MapEntity, 'publicIdentifier'>,
): readonly [number, number, number] | null {
  return resolveCommercialPavilionDefinition(entity)?.focusDirection ?? null;
}

/**
 * Converts world-aligned footprint dimensions into pavilion-local dimensions.
 * The model's facade is authored on local +Z, so odd quarter turns exchange
 * width and depth before the model is rotated back into world space.
 */
export function commercialPavilionModelBounds<
  Bounds extends CommercialPavilionBoundsDimensions,
>(bounds: Bounds, facingRadians: number): Bounds {
  const quarterTurns = Math.round(facingRadians / (Math.PI / 2));
  const snappedRadians = quarterTurns * (Math.PI / 2);
  const isCardinalQuarterTurn = Math.abs(facingRadians - snappedRadians) < 1e-8
    && Math.abs(quarterTurns) % 2 === 1;
  if (!isCardinalQuarterTurn) return bounds;

  return {
    ...bounds,
    width: bounds.depth,
    depth: bounds.width,
  };
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function commercialPavilionVisualHeight(
  bounds: CommercialPavilionBoundsDimensions,
  definition: CommercialPavilionDefinition,
): number {
  const width = finitePositive(bounds.width, 1);
  const depth = finitePositive(bounds.depth, 1);
  const proportionalHeight = Math.sqrt(width * depth) * definition.visualHeight.scale;
  return clamp(
    proportionalHeight,
    definition.visualHeight.min,
    definition.visualHeight.max,
  );
}

function roofRiseRatio(profile: CommercialPavilionRoofProfile): number {
  if (profile === 'twin-offset-gables') return 0.23;
  if (profile === 'northlight-sawtooth') return 0.18;
  if (profile === 'raised-monitor') return 0.21;
  if (profile === 'asymmetric-shed') return 0.17;
  if (profile === 'triple-gable') return 0.25;
  if (profile === 'clerestory-span') return 0.21;
  if (profile === 'longitudinal-gable') return 0.19;
  return 0.2;
}

function roofSectionCount(profile: CommercialPavilionRoofProfile): number {
  if (profile === 'twin-offset-gables') return 2;
  if (profile === 'northlight-sawtooth') return 4;
  if (profile === 'raised-monitor') return 2;
  if (profile === 'triple-gable') return 3;
  if (profile === 'clerestory-span') return 2;
  return 1;
}

function evenlySpacedPositions(span: number, bayCount: number, inset: number): number[] {
  const safeBayCount = Math.max(1, Math.round(bayCount));
  const usableSpan = Math.max(0, span - inset * 2);
  return Array.from(
    { length: safeBayCount + 1 },
    (_, index) => -span / 2 + inset + usableSpan * (index / safeBayCount),
  );
}

function entranceCenters(
  definition: CommercialPavilionDefinition,
  shellWidth: number,
  centralMassWidth: number,
): number[] {
  if (definition.entrancePattern === 'split-central-mass') {
    const sideWidth = (shellWidth - centralMassWidth) / 2;
    return [
      -centralMassWidth / 2 - sideWidth / 2,
      centralMassWidth / 2 + sideWidth / 2,
    ];
  }
  if (definition.entrancePattern === 'paired-offset') {
    return [-shellWidth * 0.25, shellWidth * 0.25];
  }
  if (definition.entrancePattern === 'side-service') {
    return [shellWidth * 0.22];
  }
  if (definition.entrancePattern === 'triple-bays') {
    return [-shellWidth * 0.3, 0, shellWidth * 0.3];
  }
  if (definition.entrancePattern === 'paired-end-bays') {
    return [-shellWidth * 0.32, shellWidth * 0.32];
  }
  if (definition.entrancePattern === 'paired-market-bays') {
    return [-shellWidth * 0.22, shellWidth * 0.22];
  }
  return [0];
}

/**
 * A deterministic exterior/interior plan in pavilion-local coordinates.
 * Every X/Z extent is inset from, or equal to, the supplied official bounds;
 * renderer components can therefore add detail without changing cartography.
 */
export function createCommercialPavilionLayout(
  bounds: CommercialPavilionBoundsDimensions,
  definition: CommercialPavilionDefinition,
  requestedHeight = commercialPavilionVisualHeight(bounds, definition),
): CommercialPavilionLayout {
  const width = finitePositive(bounds.width, 1);
  const depth = finitePositive(bounds.depth, 1);
  const visualHeight = commercialPavilionVisualHeight({ width, depth }, definition);
  const height = Math.max(visualHeight, finitePositive(requestedHeight, visualHeight));
  const shortSide = Math.min(width, depth);
  const slabHeight = height * 0.038;
  const slabTopY = slabHeight;
  const wallInset = shortSide * 0.025;
  const shellWidth = width - wallInset * 2;
  const shellDepth = depth - wallInset * 2;
  const rise = height * roofRiseRatio(definition.roofProfile);
  const eaveY = height - rise;
  const shellHeight = eaveY - slabTopY;
  const shellCenterY = slabTopY + shellHeight / 2;
  const frontZ = shellDepth / 2;
  const backZ = -frontZ;
  const facadeDepth = Math.min(shellDepth * 0.035, shortSide * 0.04);
  const facadeColumnSize = shortSide * 0.045;
  const centralMassWidth = shellWidth * definition.facade.centralMassRatio;
  const entranceWidth = shellWidth * definition.facade.entranceWidthRatio;
  const entranceHeight = shellHeight * definition.facade.entranceHeightRatio;
  const entranceCenterXs = entranceCenters(definition, shellWidth, centralMassWidth);
  const entranceDepth = Math.max(facadeDepth, shortSide * 0.018);
  const entrances = entranceCenterXs.map((centerX, index): CommercialPavilionEntrance => ({
    id: `${definition.publicIdentifier}:entrance:${index + 1}`,
    index,
    centerX,
    centerY: slabTopY + entranceHeight / 2,
    centerZ: frontZ - entranceDepth / 2,
    width: entranceWidth,
    height: entranceHeight,
    depth: entranceDepth,
  }));
  const dividerXs = definition.entrancePattern === 'triple-bays'
    ? entrances.slice(0, -1).map((entrance, index) => (
      (entrance.centerX + entrances[index + 1].centerX) / 2
    ))
    : definition.entrancePattern === 'paired-offset'
      ? [0]
      : [];
  const centralMass = centralMassWidth > 0
    ? {
        centerX: 0,
        centerY: shellCenterY,
        centerZ: frontZ - facadeDepth / 2,
        width: centralMassWidth,
        height: shellHeight,
        depth: facadeDepth,
      }
    : null;

  const structureInset = shortSide * 0.07;
  const bayCountX = Math.round(clamp(shellWidth / 1.3, 2, 8));
  const bayCountZ = Math.round(clamp(shellDepth / 1.25, 3, 9));
  const columnXs = evenlySpacedPositions(shellWidth, bayCountX, structureInset);
  const columnZs = evenlySpacedPositions(shellDepth, bayCountZ, structureInset);
  const structureColumnSize = shortSide * 0.028;
  const structureColumnHeight = shellHeight * 0.96;
  const structureColumnCenterY = slabTopY + structureColumnHeight / 2;

  const perimeterInset = shortSide * 0.065;
  const clearWidth = shellWidth - perimeterInset * 2;
  const clearDepth = shellDepth - perimeterInset * 2;
  const mainAisle: CommercialPavilionRect = {
    centerX: 0,
    centerZ: 0,
    width: clearWidth * 0.24,
    depth: clearDepth,
  };
  const crossAisleDepth = clearDepth * 0.12;
  const crossAisleCount = clearDepth > clearWidth * 0.74 ? 2 : 1;
  const crossAisles = Array.from(
    { length: crossAisleCount },
    (_, index): CommercialPavilionRect => ({
      centerX: 0,
      centerZ: crossAisleCount === 1
        ? 0
        : (index === 0 ? -1 : 1) * clearDepth * 0.24,
      width: clearWidth,
      depth: crossAisleDepth,
    }),
  );
  const exhibitBandGap = clearWidth * 0.025;
  const exhibitBandWidth = (clearWidth - mainAisle.width) / 2 - exhibitBandGap;
  const exhibitBandCenter = mainAisle.width / 2 + exhibitBandGap + exhibitBandWidth / 2;
  const exhibitBands: CommercialPavilionRect[] = [-1, 1].map((side) => ({
    centerX: side * exhibitBandCenter,
    centerZ: 0,
    width: exhibitBandWidth,
    depth: clearDepth,
  }));
  const columnClearance = structureColumnSize * 0.8;
  const columns = columnXs.flatMap((x, xIndex) => columnZs.flatMap((z, zIndex) => {
    const insideMainAisle = Math.abs(x) < mainAisle.width / 2 + columnClearance;
    const insideCrossAisle = crossAisles.some((aisle) => (
      Math.abs(z - aisle.centerZ) < aisle.depth / 2 + columnClearance
    ));
    if (insideMainAisle || insideCrossAisle) return [];
    return [{
      id: `${definition.publicIdentifier}:column:${xIndex}:${zIndex}`,
      x,
      z,
      size: structureColumnSize,
      height: structureColumnHeight,
      centerY: structureColumnCenterY,
    }];
  }));

  return {
    publicIdentifier: definition.publicIdentifier,
    variant: definition.variant,
    width,
    depth,
    height,
    exterior: {
      slab: {
        width,
        depth,
        height: slabHeight,
        centerY: slabHeight / 2,
      },
      shell: {
        width: shellWidth,
        depth: shellDepth,
        height: shellHeight,
        centerY: shellCenterY,
        frontZ,
        backZ,
      },
      roof: {
        profile: definition.roofProfile,
        width: shellWidth,
        depth: shellDepth,
        eaveY,
        ridgeY: height,
        rise,
        thickness: height * 0.018,
        sectionCount: roofSectionCount(definition.roofProfile),
      },
      facade: {
        frontZ,
        columnSize: facadeColumnSize,
        dividerXs,
        centralMass,
        entrances,
      },
      structure: {
        columnSize: structureColumnSize,
        columnHeight: structureColumnHeight,
        columnCenterY: structureColumnCenterY,
        bayCountX,
        bayCountZ,
        columnXs,
        columnZs,
      },
    },
    interior: {
      floorY: slabTopY + height * 0.004,
      perimeterInset,
      clearWidth,
      clearDepth,
      mainAisle,
      crossAisles,
      exhibitBands,
      columns,
    },
  };
}
