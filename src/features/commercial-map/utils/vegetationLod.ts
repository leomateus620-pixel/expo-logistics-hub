export const VEGETATION_LOD_TIERS = ['near', 'mid', 'far'] as const;

export type VegetationLodTier = (typeof VEGETATION_LOD_TIERS)[number];

export interface VegetationLodThresholdRatios {
  nearToMidRatio: number;
  midToFarRatio: number;
  hysteresisRatio: number;
}

export interface VegetationLodThresholds extends VegetationLodThresholdRatios {
  sceneDiagonal: number;
  nearToMidDistance: number;
  midToFarDistance: number;
  hysteresisDistance: number;
}

export type VegetationLodDensityProfile = Readonly<Record<VegetationLodTier, number>>;

export interface VegetationLodSelectionPlan<T> {
  /** Input instances sorted once by deterministic LOD priority. */
  rankedItems: readonly T[];
  /** Original indices in the same order as rankedItems. */
  rankedIndices: readonly number[];
  /** Exact prefix length to assign to InstancedMesh.count for each tier. */
  countByTier: Readonly<Record<VegetationLodTier, number>>;
  densityByTier: VegetationLodDensityProfile;
  /** Stable prefixes of rankedItems. far is always contained by mid, and mid by near. */
  itemsByTier: Readonly<Record<VegetationLodTier, readonly T[]>>;
  indicesByTier: Readonly<Record<VegetationLodTier, readonly number[]>>;
}

export interface VegetationLodSelectionOptions<T> {
  key?: (item: T, index: number) => string | number;
  seed?: string | number;
  densityByTier?: Partial<Record<VegetationLodTier, number>>;
  densityScale?: number;
  minimumCount?: number;
}

export interface VegetationLodController {
  current(): VegetationLodTier | null;
  /** Returns the new tier only when a real transition occurred. */
  update(distance: number, sceneDiagonal: number): VegetationLodTier | null;
  reset(tier?: VegetationLodTier | null): void;
}

export const DEFAULT_VEGETATION_LOD_THRESHOLD_RATIOS = Object.freeze({
  nearToMidRatio: 0.42,
  midToFarRatio: 0.9,
  hysteresisRatio: 0.06,
} satisfies VegetationLodThresholdRatios);

export const DEFAULT_VEGETATION_LOD_DENSITY = Object.freeze({
  near: 1,
  mid: 0.68,
  far: 0.4,
} satisfies VegetationLodDensityProfile);

const MINIMUM_SCENE_DIAGONAL = 0.001;
const MINIMUM_THRESHOLD_GAP_RATIO = 0.01;
const MAXIMUM_HYSTERESIS_GAP_SHARE = 0.45;

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedThresholdRatios(
  ratios: Partial<VegetationLodThresholdRatios> = DEFAULT_VEGETATION_LOD_THRESHOLD_RATIOS,
) {
  const nearToMidRatio = Math.max(
    MINIMUM_THRESHOLD_GAP_RATIO,
    finiteOr(ratios.nearToMidRatio ?? Number.NaN, DEFAULT_VEGETATION_LOD_THRESHOLD_RATIOS.nearToMidRatio),
  );
  const midToFarRatio = Math.max(
    nearToMidRatio + MINIMUM_THRESHOLD_GAP_RATIO,
    finiteOr(ratios.midToFarRatio ?? Number.NaN, DEFAULT_VEGETATION_LOD_THRESHOLD_RATIOS.midToFarRatio),
  );
  const maximumHysteresis = (midToFarRatio - nearToMidRatio)
    * MAXIMUM_HYSTERESIS_GAP_SHARE;
  const hysteresisRatio = clamp(
    finiteOr(ratios.hysteresisRatio ?? Number.NaN, DEFAULT_VEGETATION_LOD_THRESHOLD_RATIOS.hysteresisRatio),
    0,
    maximumHysteresis,
  );
  return { nearToMidRatio, midToFarRatio, hysteresisRatio } as const;
}

/**
 * Converts dimensionless ratios to world-space distances. Scaling the map
 * therefore scales every transition without introducing device-specific
 * distance constants.
 */
export function resolveVegetationLodThresholds(
  sceneDiagonal: number,
  ratios?: Partial<VegetationLodThresholdRatios>,
): VegetationLodThresholds {
  const normalized = normalizedThresholdRatios(ratios);
  const safeDiagonal = Math.max(
    MINIMUM_SCENE_DIAGONAL,
    finiteOr(sceneDiagonal, MINIMUM_SCENE_DIAGONAL),
  );
  return {
    ...normalized,
    sceneDiagonal: safeDiagonal,
    nearToMidDistance: safeDiagonal * normalized.nearToMidRatio,
    midToFarDistance: safeDiagonal * normalized.midToFarRatio,
    hysteresisDistance: safeDiagonal * normalized.hysteresisRatio,
  };
}

function tierWithoutHysteresis(distance: number, thresholds: VegetationLodThresholds) {
  if (distance <= thresholds.nearToMidDistance) return 'near';
  if (distance <= thresholds.midToFarDistance) return 'mid';
  return 'far';
}

/**
 * Resolves an LOD tier while retaining the previous tier inside a symmetric
 * dead band. Invalid transient camera samples preserve the last valid result,
 * avoiding a full-density rebuild while controls or context state settle.
 */
export function resolveVegetationLodTier(
  distance: number,
  sceneDiagonal: number,
  previousTier: VegetationLodTier | null = null,
  ratios?: Partial<VegetationLodThresholdRatios>,
): VegetationLodTier {
  if (!Number.isFinite(distance) || distance < 0 || !Number.isFinite(sceneDiagonal) || sceneDiagonal <= 0) {
    return previousTier ?? 'near';
  }

  const thresholds = resolveVegetationLodThresholds(sceneDiagonal, ratios);
  if (!previousTier) return tierWithoutHysteresis(distance, thresholds);

  const nearExit = thresholds.nearToMidDistance + thresholds.hysteresisDistance;
  const nearEnter = thresholds.nearToMidDistance - thresholds.hysteresisDistance;
  const farExit = thresholds.midToFarDistance + thresholds.hysteresisDistance;
  const farEnter = thresholds.midToFarDistance - thresholds.hysteresisDistance;

  if (previousTier === 'near') {
    if (distance <= nearExit) return 'near';
    if (distance > farExit) return 'far';
    return 'mid';
  }
  if (previousTier === 'far') {
    if (distance >= farEnter) return 'far';
    if (distance < nearEnter) return 'near';
    return 'mid';
  }
  if (distance < nearEnter) return 'near';
  if (distance > farExit) return 'far';
  return 'mid';
}

/**
 * Mutable, allocation-free transition gate intended to live in a React ref.
 * Consumers can mutate InstancedMesh.count only when update returns a tier;
 * ordinary camera frames require no React state update or array filtering.
 */
export function createVegetationLodController({
  initialTier = null,
  thresholdRatios,
}: {
  initialTier?: VegetationLodTier | null;
  thresholdRatios?: Partial<VegetationLodThresholdRatios>;
} = {}): VegetationLodController {
  let currentTier = initialTier;
  return {
    current: () => currentTier,
    update(distance, sceneDiagonal) {
      const nextTier = resolveVegetationLodTier(
        distance,
        sceneDiagonal,
        currentTier,
        thresholdRatios,
      );
      if (nextTier === currentTier) return null;
      currentTier = nextTier;
      return nextTier;
    },
    reset(tier = null) {
      currentTier = tier;
    },
  };
}

export function vegetationLodDistanceToAnchor(
  camera: Readonly<{ x: number; y: number; z: number }>,
  anchor: Readonly<{ x: number; y?: number; z: number }>,
) {
  const anchorY = anchor.y ?? 0;
  if (
    !Number.isFinite(camera.x)
    || !Number.isFinite(camera.y)
    || !Number.isFinite(camera.z)
    || !Number.isFinite(anchor.x)
    || !Number.isFinite(anchorY)
    || !Number.isFinite(anchor.z)
  ) return Number.NaN;
  return Math.hypot(camera.x - anchor.x, camera.y - anchorY, camera.z - anchor.z);
}

function normalizedDensityProfile(
  densityByTier: Partial<Record<VegetationLodTier, number>> | undefined,
  densityScale: number,
): VegetationLodDensityProfile {
  const safeScale = clamp(finiteOr(densityScale, 1), 0, 1);
  const requestedNear = clamp(
    finiteOr(densityByTier?.near ?? Number.NaN, DEFAULT_VEGETATION_LOD_DENSITY.near),
    0,
    1,
  );
  const requestedMid = clamp(
    finiteOr(densityByTier?.mid ?? Number.NaN, DEFAULT_VEGETATION_LOD_DENSITY.mid),
    0,
    requestedNear,
  );
  const requestedFar = clamp(
    finiteOr(densityByTier?.far ?? Number.NaN, DEFAULT_VEGETATION_LOD_DENSITY.far),
    0,
    requestedMid,
  );
  return Object.freeze({
    near: requestedNear * safeScale,
    mid: requestedMid * safeScale,
    far: requestedFar * safeScale,
  });
}

function hashToken(token: string) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function instanceCount(total: number, density: number, minimumCount: number) {
  if (total <= 0 || density <= 0) return 0;
  return Math.min(total, Math.max(minimumCount, Math.round(total * density)));
}

/**
 * Ranks instances once, independent of camera motion. Populate an
 * InstancedMesh from rankedItems and change only mesh.count at tier crossings.
 * Stable unique keys make the result independent of source-array order.
 */
export function buildVegetationLodSelectionPlan<T>(
  items: readonly T[],
  {
    key = (_item, index) => index,
    seed = 'commercial-map-vegetation',
    densityByTier,
    densityScale = 1,
    minimumCount = 1,
  }: VegetationLodSelectionOptions<T> = {},
): VegetationLodSelectionPlan<T> {
  const normalizedDensities = normalizedDensityProfile(densityByTier, densityScale);
  const safeMinimumCount = Math.max(0, Math.floor(finiteOr(minimumCount, 1)));
  const ranked = items.map((item, index) => {
    const stableKey = String(key(item, index));
    return {
      item,
      index,
      stableKey,
      priority: hashToken(`${String(seed)}:${stableKey}`),
    };
  }).sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority;
    // Do not delegate the collision order to the host locale: the same asset
    // inventory must produce the same GPU prefix in browsers and in tests.
    if (left.stableKey < right.stableKey) return -1;
    if (left.stableKey > right.stableKey) return 1;
    return left.index - right.index;
  });

  const rankedItems = Object.freeze(ranked.map(({ item }) => item));
  const rankedIndices = Object.freeze(ranked.map(({ index }) => index));
  const countByTier = Object.freeze({
    near: instanceCount(items.length, normalizedDensities.near, safeMinimumCount),
    mid: instanceCount(items.length, normalizedDensities.mid, safeMinimumCount),
    far: instanceCount(items.length, normalizedDensities.far, safeMinimumCount),
  });
  const itemsByTier = Object.freeze({
    near: Object.freeze(rankedItems.slice(0, countByTier.near)),
    mid: Object.freeze(rankedItems.slice(0, countByTier.mid)),
    far: Object.freeze(rankedItems.slice(0, countByTier.far)),
  });
  const indicesByTier = Object.freeze({
    near: Object.freeze(rankedIndices.slice(0, countByTier.near)),
    mid: Object.freeze(rankedIndices.slice(0, countByTier.mid)),
    far: Object.freeze(rankedIndices.slice(0, countByTier.far)),
  });

  return Object.freeze({
    rankedItems,
    rankedIndices,
    countByTier,
    densityByTier: normalizedDensities,
    itemsByTier,
    indicesByTier,
  });
}
