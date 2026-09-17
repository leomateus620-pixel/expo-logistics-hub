import { MIRANTE_COMPLEX } from '../data/miranteComplexReconstruction';

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
export type MiranteFurnitureKind = 'bench';
export type MiranteFurnitureFacing = 'arena';

/**
 * Cotas do sítio partilhadas com a escadaria da Arena e a estrutura lateral.
 * O deck é o terraço superior da escadaria; o passeio de Rua Brasília e o
 * lote Q-R-04 (onde a escada norte aterrissa) são as referências de contato.
 */
export interface MiranteSiteProfile {
  deckTopY: number;
  sidewalkY: number;
  northGroundY: number;
  /** Profundidade (unidades locais) reservada à escada de descida, na ponta -Z. */
  descentDepth: number;
}

const SOURCE_UNITS_TO_LOCAL = 120 / 5500;

export const MIRANTE_DEFAULT_SITE: MiranteSiteProfile = Object.freeze({
  deckTopY: MIRANTE_COMPLEX.levels.deck,
  sidewalkY: MIRANTE_COMPLEX.levels.sidewalk,
  northGroundY: MIRANTE_COMPLEX.levels.exporuralGround,
  descentDepth: (
    MIRANTE_COMPLEX.mirante.platformSourceMinZ - MIRANTE_COMPLEX.mirante.sourceBounds[1]
  ) * SOURCE_UNITS_TO_LOCAL,
});

export interface MirantePlatformLayout {
  width: number;
  depth: number;
  minZ: number;
  maxZ: number;
  centerZ: number;
  topY: number;
  thickness: number;
  centerY: number;
}

export interface MiranteBaseLayout {
  width: number;
  depth: number;
  height: number;
  centerY: number;
  centerZ: number;
  retainingThickness: number;
  /** Faixa pintada de branco no topo do muro de contenção, como no passeio real. */
  curbBandHeight: number;
  /** Quanto do muro fica exposto acima do passeio de Rua Brasília. */
  exposedAboveSidewalk: number;
}

export interface MiranteRoofLayout {
  width: number;
  depth: number;
  centerZ: number;
  eaveY: number;
  ridgeY: number;
  rise: number;
  overhangX: number;
  overhangZ: number;
  halfSpan: number;
  slopeLength: number;
  angle: number;
  thickness: number;
  fasciaHeight: number;
}

export interface MiranteStructureLayout {
  bayCount: number;
  bayInset: number;
  columnSize: number;
  columnInsetX: number;
  columnHeight: number;
  columnCenterY: number;
  beamSize: number;
  trussMemberSize: number;
  trussDepth: number;
  purlinCount: number;
}

export interface MiranteRailingLayout {
  height: number;
  postSize: number;
  railSize: number;
  postSpacing: number;
  inset: number;
  /** O lado sul segue contínuo para a plataforma da estrutura lateral. */
  openSouthEnd: true;
}

export interface MiranteAisleLayout {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  furnitureClearance: number;
}

export interface MiranteStairLayout {
  width: number;
  run: number;
  rise: number;
  stepCount: number;
  stepRise: number;
  stepDepth: number;
  /** Topo da escada, na borda norte da plataforma. */
  start: MiranteVector3;
  /** Pé da escada, no gramado da Exporural. */
  endpoint: MiranteVector3;
  center: MiranteVector3;
  rotationY: number;
  landingLength: number;
  cheekWallThickness: number;
}

export interface MiranteAccessLayout {
  /** Borda norte da plataforma: início da escada de descida. */
  northEdgeZ: number;
  /** Borda sul da plataforma: continuidade com a estrutura lateral coberta. */
  southEdgeZ: number;
  descentStairs: MiranteStairLayout;
  southConnectionY: number;
}

export interface MiranteFurnitureDimensions {
  benchSize: MiranteVector3;
  benchCount: number;
}

export interface MiranteServiceLayout {
  width: number;
  depth: number;
  height: number;
  center: MiranteVector3;
}

export interface MiranteLayout {
  width: number;
  depth: number;
  height: number;
  site: MiranteSiteProfile;
  platform: MirantePlatformLayout;
  base: MiranteBaseLayout;
  roof: MiranteRoofLayout;
  structure: MiranteStructureLayout;
  railings: MiranteRailingLayout;
  aisle: MiranteAisleLayout;
  access: MiranteAccessLayout;
  furniture: MiranteFurnitureDimensions;
  service: MiranteServiceLayout;
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
  benches: MiranteFurniturePose[];
  all: MiranteFurniturePose[];
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roofClearance(width: number): number {
  return clamp(width * 0.23, 0.32, 0.36);
}

function roofRiseFor(width: number): number {
  return clamp(width * 0.037, 0.05, 0.06);
}

/**
 * The official map units are not calibrated metres. The visual height is the
 * ridge of a low canopy over a deck half a metre above the sidewalk (photo 9):
 * deck datum + column clearance + shallow gable rise. It reads like the
 * single-storey pavilions around it, never like a two-storey podium.
 */
export function miranteVisualHeight(
  bounds: MiranteBoundsDimensions,
  site: MiranteSiteProfile = MIRANTE_DEFAULT_SITE,
): number {
  const width = Math.max(0.6, finiteOr(bounds.width, 1.48));
  return site.deckTopY + roofClearance(width) + roofRiseFor(width);
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
 * open Arena side, -X toward Rua Brasília) and local Z follows the registered
 * longitudinal footprint (-Z toward the Exporural, +Z toward the covered
 * lateral structure). The footprint includes the descent stairs at -Z.
 */
export function createMiranteLayout(
  bounds: MiranteBoundsDimensions,
  requestedHeight = miranteVisualHeight(bounds),
  site: MiranteSiteProfile = MIRANTE_DEFAULT_SITE,
): MiranteLayout {
  const width = Math.max(1.0, finiteOr(bounds.width, 1.48));
  const depth = Math.max(3.2, finiteOr(bounds.depth, 6.72));
  const deckTopY = Math.max(site.sidewalkY, finiteOr(site.deckTopY, MIRANTE_DEFAULT_SITE.deckTopY));
  const height = Math.max(
    deckTopY + 0.26,
    finiteOr(requestedHeight, miranteVisualHeight({ width, depth }, site)),
  );

  const descentDepth = clamp(finiteOr(site.descentDepth, 0.87), 0.5, depth * 0.2);
  const platformMinZ = -depth / 2 + descentDepth;
  const platformMaxZ = depth / 2;
  const platformDepth = platformMaxZ - platformMinZ;
  const platformCenterZ = (platformMinZ + platformMaxZ) / 2;
  const slabThickness = clamp(width * 0.04, 0.05, 0.065);

  const roofRise = roofRiseFor(width);
  const eaveY = height - roofRise;
  const overhangX = clamp(width * 0.1, 0.12, 0.18);
  const overhangZ = clamp(platformDepth * 0.02, 0.1, 0.14);
  const halfSpan = width / 2 + overhangX;
  const bayInset = clamp(platformDepth * 0.03, 0.14, 0.2);
  const bayCount = Math.round(clamp(platformDepth / 0.72, 6, 10));
  const columnSize = clamp(width * 0.024, 0.03, 0.04);
  const columnInsetX = clamp(width * 0.075, 0.09, 0.13);
  const railingInset = clamp(width * 0.03, 0.035, 0.05);
  const railingHeight = clamp(height * 0.19, 0.095, 0.115);
  const aisleWidth = clamp(width * 0.34, 0.42, 0.56);
  const aisleMinX = -width / 2 + railingInset + 0.02;
  const furnitureClearance = clamp(width * 0.05, 0.06, 0.09);

  // Escada de descida: ocupa toda a largura da ponta norte, entre muretas
  // laterais, e desce do deck ao topo do lote Q-R-04.
  const cheekWallThickness = clamp(width * 0.04, 0.05, 0.07);
  const stairWidth = width - cheekWallThickness * 2;
  const stairRise = Math.max(0.03, deckTopY - finiteOr(site.northGroundY, 0.13));
  const stairStepCount = Math.max(4, Math.ceil(stairRise / 0.014));
  const stairStepRise = stairRise / stairStepCount;
  const stairLandingLength = clamp(descentDepth * 0.2, 0.12, 0.2);
  const stairRun = Math.max(0.3, descentDepth - stairLandingLength);
  const stairStepDepth = stairRun / stairStepCount;
  const stairTopZ = platformMinZ;
  const stairBottomZ = platformMinZ - stairRun;

  const platform: MirantePlatformLayout = {
    width,
    depth: platformDepth,
    minZ: platformMinZ,
    maxZ: platformMaxZ,
    centerZ: platformCenterZ,
    topY: deckTopY,
    thickness: slabThickness,
    centerY: deckTopY - slabThickness / 2,
  };
  const baseHeight = Math.max(0.05, deckTopY - slabThickness);
  const base: MiranteBaseLayout = {
    width: width - 0.02,
    depth: platformDepth - 0.02,
    height: baseHeight,
    centerY: baseHeight / 2,
    centerZ: platformCenterZ,
    retainingThickness: clamp(width * 0.05, 0.06, 0.09),
    curbBandHeight: clamp(deckTopY * 0.16, 0.024, 0.034),
    exposedAboveSidewalk: Math.max(0, deckTopY - site.sidewalkY),
  };
  const roof: MiranteRoofLayout = {
    width: width + overhangX * 2,
    depth: platformDepth + overhangZ * 2,
    centerZ: platformCenterZ,
    eaveY,
    ridgeY: height,
    rise: roofRise,
    overhangX,
    overhangZ,
    halfSpan,
    slopeLength: Math.hypot(halfSpan, roofRise),
    angle: Math.atan2(roofRise, halfSpan),
    thickness: clamp(width * 0.012, 0.014, 0.02),
    fasciaHeight: clamp(width * 0.035, 0.045, 0.06),
  };
  const structure: MiranteStructureLayout = {
    bayCount,
    bayInset,
    columnSize,
    columnInsetX,
    columnHeight: eaveY - deckTopY,
    columnCenterY: deckTopY + (eaveY - deckTopY) / 2,
    beamSize: clamp(width * 0.022, 0.028, 0.036),
    trussMemberSize: clamp(width * 0.012, 0.014, 0.02),
    trussDepth: clamp(width * 0.045, 0.055, 0.075),
    purlinCount: Math.round(clamp(width / 0.28, 4, 7)),
  };
  const railings: MiranteRailingLayout = {
    height: railingHeight,
    postSize: clamp(width * 0.012, 0.014, 0.02),
    railSize: clamp(width * 0.009, 0.011, 0.015),
    postSpacing: clamp(width * 0.2, 0.26, 0.34),
    inset: railingInset,
    openSouthEnd: true,
  };
  const aisle: MiranteAisleLayout = {
    minX: aisleMinX,
    maxX: aisleMinX + aisleWidth,
    minZ: platformMinZ + 0.1,
    maxZ: platformMaxZ - 0.1,
    width: aisleWidth,
    furnitureClearance,
  };
  const access: MiranteAccessLayout = {
    northEdgeZ: platformMinZ,
    southEdgeZ: platformMaxZ,
    descentStairs: {
      width: stairWidth,
      run: stairRun,
      rise: stairRise,
      stepCount: stairStepCount,
      stepRise: stairStepRise,
      stepDepth: stairStepDepth,
      start: [0, deckTopY, stairTopZ],
      endpoint: [0, deckTopY - stairRise, stairBottomZ],
      center: [0, deckTopY - stairRise / 2, (stairTopZ + stairBottomZ) / 2],
      rotationY: Math.PI,
      landingLength: stairLandingLength,
      cheekWallThickness,
    },
    southConnectionY: deckTopY,
  };
  const furniture: MiranteFurnitureDimensions = {
    benchSize: [
      clamp(width * 0.11, 0.13, 0.17),
      clamp(height * 0.12, 0.06, 0.075),
      clamp(width * 0.3, 0.38, 0.5),
    ],
    benchCount: Math.round(clamp(platformDepth / 1.15, 3, 6)),
  };
  const serviceWidth = clamp(width * 0.36, 0.42, 0.56);
  const serviceDepth = clamp(platformDepth * 0.1, 0.5, 0.64);
  const serviceHeight = Math.min(structure.columnHeight - 0.05, clamp(height * 0.45, 0.22, 0.27));
  const service: MiranteServiceLayout = {
    width: serviceWidth,
    depth: serviceDepth,
    height: serviceHeight,
    center: [
      -width / 2 + railingInset + 0.04 + serviceWidth / 2,
      deckTopY + serviceHeight / 2,
      platformMaxZ - bayInset - serviceDepth / 2,
    ],
  };

  return {
    width,
    depth,
    height,
    site: { ...site, deckTopY },
    platform,
    base,
    roof,
    structure,
    railings,
    aisle,
    access,
    furniture,
    service,
  };
}

/** Planos estruturais (pilares + treliças) ao longo da plataforma coberta. */
export function miranteStructuralBayPositions(layout: MiranteLayout): number[] {
  const usableDepth = Math.max(0.2, layout.platform.depth - layout.structure.bayInset * 2);
  return Array.from(
    { length: layout.structure.bayCount + 1 },
    (_, index) => (
      layout.platform.minZ
      + layout.structure.bayInset
      + usableDepth * (index / layout.structure.bayCount)
    ),
  );
}

/**
 * Bancos encostados ao guarda-corpo leste, voltados para a Arena (fotos 8 e
 * 9). O corredor oeste, a escada norte e o quiosque sul permanecem livres.
 */
export function createMiranteFurniturePlan(layout: MiranteLayout): MiranteFurniturePlan {
  const { benchSize, benchCount } = layout.furniture;
  const benchX = layout.width / 2 - layout.railings.inset - 0.03 - benchSize[0] / 2;
  const firstZ = layout.platform.minZ + layout.structure.bayInset + 0.2 + benchSize[2] / 2;
  const lastZ = layout.service.center[2] - layout.service.depth / 2 - 0.24 - benchSize[2] / 2;
  const span = Math.max(0, lastZ - firstZ);
  const benches: MiranteFurniturePose[] = [];

  for (let groupIndex = 0; groupIndex < benchCount; groupIndex += 1) {
    const ratio = benchCount === 1 ? 0.5 : groupIndex / (benchCount - 1);
    benches.push({
      id: `mirante:bench:${groupIndex}`,
      kind: 'bench',
      groupIndex,
      position: [benchX, layout.platform.topY + benchSize[1] / 2, firstZ + span * ratio],
      rotationY: 0,
      dimensions: [...benchSize],
      facing: 'arena',
      castsShadow: false,
    });
  }

  return { benches, all: [...benches] };
}
