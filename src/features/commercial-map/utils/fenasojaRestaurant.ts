import type { Coordinate, MapEntity } from '../types';
import { OPEN_GROUND_PRESENTATION_HEIGHT } from '../constants';
import { withoutClosingPoint } from './geometry';

/**
 * Official 2026 cadastre keeps two legend codes on the same building:
 * ['C2', 'Restaurante Central', 'RESTAURANT', 'food', [2420, 3185, 2600, 3335]]
 * ['C3', 'Pizzaria', 'RESTAURANT', 'food', [2420, 3335, 2600, 3470]]
 * The satellite reference shows one elongated built mass whose front faces the
 * Calçada do Arvoredo. Presentation unifies both codes under C2 without
 * touching persisted rows; the absorbed identifier remains searchable.
 */
export const FENASOJA_RESTAURANT_PUBLIC_IDENTIFIER = 'C2';
export const FENASOJA_RESTAURANT_ABSORBED_IDENTIFIER = 'C3';
export const FENASOJA_RESTAURANT_PRESENTATION_NAME = 'Restaurante';
export const FENASOJA_RESTAURANT_FRONTAGE_IDENTIFIER = 'CALCADA-ARVOREDO';
export const FENASOJA_RESTAURANT_REVISION = '2026.9-c2-restaurante-unificado.1';

/** Two adjacent cadastral rectangles may carry sub-point rounding after persistence. */
const UNIFICATION_GAP_TOLERANCE = 0.12;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

export const FENASOJA_RESTAURANT_LAYOUT = Object.freeze({
  revision: FENASOJA_RESTAURANT_REVISION,
  publicIdentifier: FENASOJA_RESTAURANT_PUBLIC_IDENTIFIER,
  absorbedPublicIdentifier: FENASOJA_RESTAURANT_ABSORBED_IDENTIFIER,
  presentationName: FENASOJA_RESTAURANT_PRESENTATION_NAME,
  officialSourceNames: ['Restaurante Central', 'Pizzaria'] as const,
  frontagePublicIdentifier: FENASOJA_RESTAURANT_FRONTAGE_IDENTIFIER,
  runtimeEntityId: 'reference:2026:c2',
  absorbedRuntimeEntityId: 'reference:2026:c3',
  localFrontAxis: '+Z' as const,
  /**
   * The Calçada do Arvoredo lies on the +x side of the footprint (PDF x 2630+).
   * A quarter turn maps the model's +Z front onto world +X, so the long axis of
   * the building follows world Z exactly as the merged cadastral rectangle does.
   */
  facingRadians: Math.PI / 2,
  /** Camera approaches from the walkway so the covered entrance reads first. */
  focusDirection: [0.9, 0.46, 0.24] as const,
  /** Above the 1.05 cadastral extrusion even for the raw C2 half; ridge ≈ 7.5–8.8 m. */
  minimumVisualHeight: 1.1,
  maximumVisualHeight: 1.3,
  /** Plinth and steps start on the visible ground plane instead of inside it. */
  groundElevation: OPEN_GROUND_PRESENTATION_HEIGHT + 0.002,
  footprintFill: Object.freeze({ width: 0.985, depth: 0.985 }),
  frontPillarCount: 4,
  palette: Object.freeze({
    wall: '#e3ddd0',
    accent: '#8e8f8b',
    roof: '#9da2a4',
    trim: '#f1eee6',
    dark: '#3a3f41',
    glass: '#4d6469',
    green: '#3f7047',
    white: '#f4f2eb',
    platform: '#b9b4a9',
    metal: '#6c7274',
  }),
});

export const FENASOJA_RESTAURANT_RENDER_BUDGET = {
  overview: { maximumPrimaryDrawCalls: 20 },
  detailed: { maximumPrimaryDrawCalls: 24 },
  focused: { maximumPrimaryDrawCalls: 28 },
  detailDistanceMultiplier: 4.8,
} as const;

export interface FenasojaRestaurantBounds {
  width: number;
  depth: number;
}

/**
 * One-storey dining hall with a pitched roof: eave about 3.5 m, ridge near 7 m
 * at the 0.147 world-units-per-metre scene scale. Bounded so persisted
 * geometry cannot inflate the mass into a pavilion-sized silhouette.
 */
export function fenasojaRestaurantVisualHeight(bounds: FenasojaRestaurantBounds): number {
  const shortSide = Math.min(finiteOr(bounds.width, 3.9), finiteOr(bounds.depth, 6.2));
  return clamp(
    shortSide * 0.3,
    FENASOJA_RESTAURANT_LAYOUT.minimumVisualHeight,
    FENASOJA_RESTAURANT_LAYOUT.maximumVisualHeight,
  );
}

export interface FenasojaRestaurantLayout {
  width: number;
  depth: number;
  height: number;
  groundElevation: number;
  slabWidth: number;
  slabDepth: number;
  slabHeight: number;
  bodyWidth: number;
  bodyDepth: number;
  bodyCenterZ: number;
  bodyFrontZ: number;
  bodyBackZ: number;
  wallHeight: number;
  plinthHeight: number;
  roofWidth: number;
  roofDepth: number;
  roofRise: number;
  eaveHeight: number;
  ridgeHeight: number;
  canopyWidth: number;
  canopyDepth: number;
  canopyRearHeight: number;
  canopyFrontHeight: number;
  canopyFrontZ: number;
  canopySlopeRadians: number;
  pillarSize: number;
  pillarHeight: number;
  pillarZ: number;
  pillarXs: readonly number[];
  doorWidth: number;
  doorHeight: number;
  terraceFrontZ: number;
  stepDepth: number;
  frontWindowXs: readonly number[];
  porchWindowXs: readonly number[];
  rearWindowXs: readonly number[];
  windowWidth: number;
  windowHeight: number;
  serviceWidth: number;
  serviceDepth: number;
  serviceHeight: number;
  serviceCenterX: number;
  serviceCenterZ: number;
}

export function createFenasojaRestaurantLayout(
  bounds: FenasojaRestaurantBounds,
  requestedHeight = fenasojaRestaurantVisualHeight(bounds),
): FenasojaRestaurantLayout {
  const width = Math.max(2.4, finiteOr(bounds.width, 6.2));
  const depth = Math.max(1.6, finiteOr(bounds.depth, 3.9));
  const height = clamp(
    finiteOr(requestedHeight, fenasojaRestaurantVisualHeight(bounds)),
    FENASOJA_RESTAURANT_LAYOUT.minimumVisualHeight * 0.8,
    FENASOJA_RESTAURANT_LAYOUT.maximumVisualHeight,
  );
  const slabHeight = 0.05;
  const slabWidth = width * FENASOJA_RESTAURANT_LAYOUT.footprintFill.width;
  const slabDepth = depth * FENASOJA_RESTAURANT_LAYOUT.footprintFill.depth;
  const bodyWidth = width * 0.94;
  const bodyDepth = depth * 0.6;
  // Hall pushed back so the covered frontage and terrace fit on the plinth;
  // the rear service annex still ends inside the slab.
  const bodyCenterZ = -depth * 0.11;
  const bodyFrontZ = bodyCenterZ + bodyDepth / 2;
  const bodyBackZ = bodyCenterZ - bodyDepth / 2;
  const wallHeight = height * 0.44;
  const roofRise = height * 0.36;
  const eaveHeight = slabHeight + wallHeight;
  const canopyWidth = width * 0.58;
  const canopyDepth = depth * 0.2;
  const canopyRearHeight = eaveHeight - 0.02;
  const canopyFrontHeight = slabHeight + wallHeight * 0.78;
  const canopyFrontZ = bodyFrontZ + canopyDepth;
  const pillarSize = Math.max(0.055, width * 0.012);
  const pillarInset = pillarSize * 0.9;
  const pillarZ = canopyFrontZ - pillarInset;
  const pillarSpan = canopyWidth - pillarSize * 1.4;
  const pillarXs = Array.from(
    { length: FENASOJA_RESTAURANT_LAYOUT.frontPillarCount },
    (_, index) => -pillarSpan / 2 + (pillarSpan * index) / (FENASOJA_RESTAURANT_LAYOUT.frontPillarCount - 1),
  );
  return {
    width,
    depth,
    height,
    groundElevation: FENASOJA_RESTAURANT_LAYOUT.groundElevation,
    slabWidth,
    slabDepth,
    slabHeight,
    bodyWidth,
    bodyDepth,
    bodyCenterZ,
    bodyFrontZ,
    bodyBackZ,
    wallHeight,
    plinthHeight: Math.min(0.08, wallHeight * 0.16),
    roofWidth: bodyWidth,
    roofDepth: bodyDepth + depth * 0.12,
    roofRise,
    eaveHeight,
    ridgeHeight: eaveHeight + roofRise,
    canopyWidth,
    canopyDepth,
    canopyRearHeight,
    canopyFrontHeight,
    canopyFrontZ,
    canopySlopeRadians: Math.atan2(canopyRearHeight - canopyFrontHeight, canopyDepth),
    pillarSize,
    pillarHeight: canopyFrontHeight - slabHeight - 0.012,
    pillarZ,
    pillarXs,
    doorWidth: width * 0.1,
    doorHeight: wallHeight * 0.74,
    terraceFrontZ: slabDepth / 2,
    stepDepth: depth * 0.045,
    frontWindowXs: [-0.435, -0.365, 0.365, 0.435].map((ratio) => ratio * width),
    porchWindowXs: [-0.235, -0.155, 0.155, 0.235].map((ratio) => ratio * width),
    rearWindowXs: [-0.4, -0.25, -0.1, 0.1, 0.25, 0.4].map((ratio) => ratio * width),
    windowWidth: width * 0.055,
    windowHeight: wallHeight * 0.42,
    serviceWidth: width * 0.2,
    serviceDepth: depth * 0.08,
    serviceHeight: wallHeight * 0.72,
    serviceCenterX: -width * 0.3,
    serviceCenterZ: bodyBackZ - depth * 0.04,
  };
}

interface FootprintBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function footprintBounds(entity: Pick<MapEntity, 'geometry'>): FootprintBounds | null {
  const points = entity.geometry.coordinates.flat().filter(([x, z]) => Number.isFinite(x) && Number.isFinite(z));
  if (points.length < 3) return null;
  return {
    minX: Math.min(...points.map(([x]) => x)),
    maxX: Math.max(...points.map(([x]) => x)),
    minZ: Math.min(...points.map(([, z]) => z)),
    maxZ: Math.max(...points.map(([, z]) => z)),
  };
}

function isRectangularRing(entity: Pick<MapEntity, 'geometry'>, bounds: FootprintBounds) {
  const ring = withoutClosingPoint(entity.geometry.coordinates[0] ?? []);
  if (entity.geometry.coordinates.length !== 1 || ring.length !== 4) return false;
  const tolerance = 1e-4;
  return ring.every(([x, z]) => (
    (Math.abs(x - bounds.minX) < tolerance || Math.abs(x - bounds.maxX) < tolerance)
    && (Math.abs(z - bounds.minZ) < tolerance || Math.abs(z - bounds.maxZ) < tolerance)
  ));
}

/**
 * Only two rectangles that share a full edge (same span on one axis, touching
 * on the other) unify, so the presented footprint is exactly their union and
 * never an inflated bounding box.
 */
function rectanglesFormRectangle(first: FootprintBounds, second: FootprintBounds) {
  const tolerance = UNIFICATION_GAP_TOLERANCE;
  const sameSpanX = Math.abs(first.minX - second.minX) <= tolerance && Math.abs(first.maxX - second.maxX) <= tolerance;
  const sameSpanZ = Math.abs(first.minZ - second.minZ) <= tolerance && Math.abs(first.maxZ - second.maxZ) <= tolerance;
  const gapX = Math.max(first.minX, second.minX) - Math.min(first.maxX, second.maxX);
  const gapZ = Math.max(first.minZ, second.minZ) - Math.min(first.maxZ, second.maxZ);
  return (sameSpanX && Math.abs(gapZ) <= tolerance) || (sameSpanZ && Math.abs(gapX) <= tolerance);
}

function normalizedIdentifier(entity: Pick<MapEntity, 'publicIdentifier'>) {
  return entity.publicIdentifier.trim().toLocaleUpperCase('pt-BR');
}

function isRestaurantCode(entity: Pick<MapEntity, 'publicIdentifier' | 'classification'>, code: string) {
  return normalizedIdentifier(entity) === code && entity.classification === 'RESTAURANT';
}

function uniqueStrings(values: readonly unknown[]) {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))];
}

export interface FenasojaRestaurantUnification {
  entities: MapEntity[];
  unified: boolean;
  primaryEntityId: string | null;
  absorbedEntityId: string | null;
}

/**
 * Presents C2 + C3 as the single "Restaurante". Persisted cadastral rows stay
 * untouched: the merged footprint is the exact union of both rectangles and
 * both official names remain searchable aliases of the unified entity.
 */
export function unifyFenasojaRestaurantEntities(entities: readonly MapEntity[]): FenasojaRestaurantUnification {
  const primary = entities.find((entity) => isRestaurantCode(entity, FENASOJA_RESTAURANT_PUBLIC_IDENTIFIER));
  if (!primary) {
    return { entities: [...entities], unified: false, primaryEntityId: null, absorbedEntityId: null };
  }
  const absorbed = entities.find((entity) => (
    entity.id !== primary.id && isRestaurantCode(entity, FENASOJA_RESTAURANT_ABSORBED_IDENTIFIER)
  ));
  const primaryBounds = footprintBounds(primary);
  const absorbedBounds = absorbed ? footprintBounds(absorbed) : null;
  const canMergeFootprints = Boolean(
    absorbed && primaryBounds && absorbedBounds
    && isRectangularRing(primary, primaryBounds)
    && isRectangularRing(absorbed, absorbedBounds)
    && rectanglesFormRectangle(primaryBounds, absorbedBounds),
  );
  const mergedBounds: FootprintBounds | null = canMergeFootprints && primaryBounds && absorbedBounds
    ? {
      minX: Math.min(primaryBounds.minX, absorbedBounds.minX),
      maxX: Math.max(primaryBounds.maxX, absorbedBounds.maxX),
      minZ: Math.min(primaryBounds.minZ, absorbedBounds.minZ),
      maxZ: Math.max(primaryBounds.maxZ, absorbedBounds.maxZ),
    }
    : null;
  const mergedRing: Coordinate[] | null = mergedBounds
    ? [
      [mergedBounds.minX, mergedBounds.minZ],
      [mergedBounds.maxX, mergedBounds.minZ],
      [mergedBounds.maxX, mergedBounds.maxZ],
      [mergedBounds.minX, mergedBounds.maxZ],
    ]
    : null;
  const absorbedForPresentation = absorbed && mergedRing ? absorbed : null;
  const aliases = uniqueStrings([
    ...(Array.isArray(primary.metadata.aliases) ? primary.metadata.aliases : []),
    primary.name,
    ...FENASOJA_RESTAURANT_LAYOUT.officialSourceNames,
    ...(absorbedForPresentation ? [absorbedForPresentation.name] : []),
    'Restaurante Fenasoja',
  ].filter((alias) => alias !== FENASOJA_RESTAURANT_PRESENTATION_NAME));

  const unifiedPrimary: MapEntity = {
    ...primary,
    name: FENASOJA_RESTAURANT_PRESENTATION_NAME,
    geometry: mergedRing
      ? {
        ...primary.geometry,
        coordinates: [mergedRing],
        extrusionHeight: Math.max(
          primary.geometry.extrusionHeight,
          absorbedForPresentation?.geometry.extrusionHeight ?? 0,
        ),
      }
      : primary.geometry,
    metadata: {
      ...primary.metadata,
      aliases,
      officialName: primary.name,
      restaurantPresentation: {
        revision: FENASOJA_RESTAURANT_REVISION,
        unifiedIdentifiers: absorbedForPresentation
          ? [FENASOJA_RESTAURANT_PUBLIC_IDENTIFIER, FENASOJA_RESTAURANT_ABSORBED_IDENTIFIER]
          : [FENASOJA_RESTAURANT_PUBLIC_IDENTIFIER],
        absorbedEntityId: absorbedForPresentation?.id ?? null,
        cadastralRowsUnchanged: true,
      },
    },
  };

  return {
    entities: entities
      .filter((entity) => entity.id !== absorbedForPresentation?.id)
      .map((entity) => (entity.id === primary.id ? unifiedPrimary : entity)),
    unified: Boolean(absorbedForPresentation),
    primaryEntityId: primary.id,
    absorbedEntityId: absorbedForPresentation?.id ?? null,
  };
}

export function withUnifiedFenasojaRestaurant<T extends { entities: MapEntity[] }>(data: T): T {
  const unification = unifyFenasojaRestaurantEntities(data.entities);
  if (!unification.primaryEntityId) return data;
  return { ...data, entities: unification.entities };
}
