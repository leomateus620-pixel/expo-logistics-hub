export type CommercialMapDetailSheetState = 'collapsed' | 'half' | 'expanded';

export interface CommercialMapPixelRatioInput {
  devicePixelRatio: number;
  viewportWidth: number;
  viewportHeight: number;
  reducedGraphics: boolean;
}

export type CommercialMapQualityTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';

export interface CommercialMapQualityPreset {
  tier: CommercialMapQualityTier;
  pixelBudget: number;
  maximumPixelRatio: number;
  shadowMapSize: 512 | 1024 | 2048 | 4096;
  vegetationDensity: number;
  distantVegetationDensity: number;
  ambientOcclusionResolutionScale: number;
  maximumAnisotropy: 2 | 4 | 8 | 16;
  lodDistanceScale: number;
  downgradeAboveFrameTimeMs: number;
  upgradeBelowFrameTimeMs: number;
}

export interface CommercialMapQualityCapabilitiesInput {
  devicePixelRatio: number;
  viewportWidth: number;
  viewportHeight: number;
  deviceMemoryGb?: number | null;
  hardwareConcurrency?: number | null;
  isMobile?: boolean;
}

export interface CommercialMapQualityPixelRatioInput {
  devicePixelRatio: number;
  viewportWidth: number;
  viewportHeight: number;
  qualityTier: CommercialMapQualityTier;
}

export interface CommercialMapAdaptiveQualityState {
  tier: CommercialMapQualityTier;
  consecutiveSlowWindows: number;
  consecutiveFastWindows: number;
  lastDowngradeAtMs: number;
  downgradeStreak: number;
}

export interface CommercialMapAdaptiveQualitySample
  extends CommercialMapQualityCapabilitiesInput {
  averageFrameTimeMs: number;
  sampledFrames?: number;
  nowMs?: number;
}

export type CommercialMapEnvironmentQualityTier = 'full' | 'balanced' | 'reduced';

export type CommercialMapAdaptiveQualityReason =
  | 'hardware-cap'
  | 'sustained-slow-frames'
  | 'sustained-fast-frames'
  | 'insufficient-sample'
  | 'stable';

export interface CommercialMapAdaptiveQualityDecision
  extends CommercialMapAdaptiveQualityState {
  hardwareCeiling: CommercialMapQualityTier;
  changed: boolean;
  reason: CommercialMapAdaptiveQualityReason;
}

export interface CommercialMapCameraFramingBounds {
  width: number;
  depth: number;
  maxHeight?: number;
}

interface CommercialMapCameraDistanceInput {
  bounds: CommercialMapCameraFramingBounds;
  verticalFovDegrees: number;
  aspect: number;
  framingMargin?: number;
}

interface CommercialMapCameraPositionClampInput {
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  minDistance: number;
  maxDistance: number;
}

const STANDARD_PIXEL_BUDGET = 4_800_000;
const REDUCED_PIXEL_BUDGET = 900_000;

export const COMMERCIAL_MAP_QUALITY_TIER_ORDER = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'ULTRA',
] as const satisfies readonly CommercialMapQualityTier[];

/**
 * Renderer-facing budgets remain deliberately orthogonal to accessibility.
 * A caller may use the tier to tune visual cost, but reduced-motion must never
 * select one of these presets or disable a fundamental rendering feature.
 */
export const COMMERCIAL_MAP_QUALITY_PRESETS = {
  LOW: {
    tier: 'LOW',
    pixelBudget: REDUCED_PIXEL_BUDGET,
    maximumPixelRatio: 1,
    shadowMapSize: 512,
    vegetationDensity: 0.45,
    distantVegetationDensity: 0.2,
    ambientOcclusionResolutionScale: 0,
    maximumAnisotropy: 2,
    lodDistanceScale: 0.72,
    downgradeAboveFrameTimeMs: Number.POSITIVE_INFINITY,
    upgradeBelowFrameTimeMs: 16.4,
  },
  MEDIUM: {
    tier: 'MEDIUM',
    pixelBudget: 2_000_000,
    maximumPixelRatio: 1.35,
    shadowMapSize: 1024,
    vegetationDensity: 0.7,
    distantVegetationDensity: 0.45,
    ambientOcclusionResolutionScale: 0.5,
    maximumAnisotropy: 4,
    lodDistanceScale: 0.86,
    downgradeAboveFrameTimeMs: 25,
    upgradeBelowFrameTimeMs: 16.2,
  },
  HIGH: {
    tier: 'HIGH',
    pixelBudget: STANDARD_PIXEL_BUDGET,
    maximumPixelRatio: 1.75,
    shadowMapSize: 2048,
    vegetationDensity: 1,
    distantVegetationDensity: 0.75,
    ambientOcclusionResolutionScale: 0.75,
    maximumAnisotropy: 8,
    lodDistanceScale: 1,
    downgradeAboveFrameTimeMs: 22,
    upgradeBelowFrameTimeMs: 15.8,
  },
  ULTRA: {
    tier: 'ULTRA',
    pixelBudget: 7_500_000,
    maximumPixelRatio: 2.25,
    shadowMapSize: 4096,
    vegetationDensity: 1,
    distantVegetationDensity: 1,
    ambientOcclusionResolutionScale: 1,
    maximumAnisotropy: 16,
    lodDistanceScale: 1.12,
    downgradeAboveFrameTimeMs: 19.5,
    upgradeBelowFrameTimeMs: 0,
  },
} as const satisfies Record<CommercialMapQualityTier, CommercialMapQualityPreset>;

export const COMMERCIAL_MAP_ADAPTIVE_QUALITY_MIN_SAMPLED_FRAMES = 45;
export const COMMERCIAL_MAP_ADAPTIVE_QUALITY_SLOW_WINDOWS = 2;
export const COMMERCIAL_MAP_ADAPTIVE_QUALITY_FAST_WINDOWS = 4;
export const COMMERCIAL_MAP_ADAPTIVE_QUALITY_FAST_WINDOWS_ESCALATION = 2;
export const COMMERCIAL_MAP_ADAPTIVE_QUALITY_MAX_FAST_WINDOWS = 10;
export const COMMERCIAL_MAP_ADAPTIVE_QUALITY_UPGRADE_DWELL_MS = 1_500;

export const COMMERCIAL_MAP_RESIZE_REFIT_DEBOUNCE_MS = 180;
export const COMMERCIAL_MAP_MANUAL_NAVIGATION_REFIT_SUPPRESSION_MS = 650;
export const COMMERCIAL_MAP_MIN_POLAR_ANGLE = 0.025;
export const COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_MAX_WIDTH = 640;
export const COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_MIN_RATIO = 1.35;
export const COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_TARGET_SHIFT_RATIO = 0.22;
export const COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_FIT_PADDING = 1.04;
export const COMMERCIAL_MAP_MAX_DISTANCE_FRAMING_MARGIN = 1.08;
/**
 * Portrait infrastructure mode rotates the park's long east-west axis into
 * the available vertical canvas instead of shrinking it behind the legend.
 * Azimuth 15 degrees / elevation 72 degrees keeps the whole official extent
 * visible while making the technical network readable on a 390px viewport.
 */
export const COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_DIRECTION = [
  0.29848749562898547,
  0.9510565162951535,
  0.07997948340457492,
] as const;
/**
 * OrbitControls clamps polar angles below COMMERCIAL_MAP_MIN_POLAR_ANGLE.
 * Keeping the top preset exactly on that boundary prevents controls.update()
 * from moving the camera away from its animation target indefinitely.
 */
export const COMMERCIAL_MAP_TOP_DIRECTION = [
  0,
  Math.cos(COMMERCIAL_MAP_MIN_POLAR_ANGLE),
  Math.sin(COMMERCIAL_MAP_MIN_POLAR_ANGLE),
] as const;

/**
 * A close-up near plane must not remain at 0.035 after dollying hundreds of
 * units away: the resulting depth bins collapse the grass/road separation.
 * Keep it proportional to range, capped below the camera's ground clearance.
 * This changes depth precision only; it never moves the camera or lowers DPR.
 */
export function resolveCommercialMapCameraNearPlane(distance: number, cameraHeight: number) {
  const range = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  const clearance = Number.isFinite(cameraHeight) ? Math.max(0, cameraHeight) : 0;
  return Math.max(0.035, Math.min(range / 240, clearance * 0.25));
}

function finitePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveCommercialMapBoundingSphereRadius(
  bounds: CommercialMapCameraFramingBounds,
) {
  const halfWidth = finitePositive(bounds.width, 1) / 2;
  const halfDepth = finitePositive(bounds.depth, 1) / 2;
  const halfHeight = Math.max(0, Number.isFinite(bounds.maxHeight) ? bounds.maxHeight ?? 0 : 0) / 2;
  return Math.hypot(halfWidth, halfDepth, halfHeight);
}

/**
 * Fits the complete world-space map sphere into the narrower camera frustum
 * axis. The bounding box supplies the sphere and the viewport/FOV supply the
 * angular limit, so portrait and ultrawide screens share the same rule without
 * a device-specific magic distance.
 */
export function resolveCommercialMapCameraDistanceBounds({
  bounds,
  verticalFovDegrees,
  aspect,
  framingMargin = COMMERCIAL_MAP_MAX_DISTANCE_FRAMING_MARGIN,
}: CommercialMapCameraDistanceInput) {
  const safeVerticalFov = Math.min(120, Math.max(1, finitePositive(verticalFovDegrees, 38)));
  const safeAspect = Math.max(0.2, finitePositive(aspect, 1));
  const verticalHalfFov = safeVerticalFov * Math.PI / 360;
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * safeAspect);
  const limitingHalfFov = Math.max(Math.PI / 180, Math.min(verticalHalfFov, horizontalHalfFov));
  const boundingSphereRadius = resolveCommercialMapBoundingSphereRadius(bounds);
  const safeFramingMargin = Math.min(1.35, Math.max(1, finitePositive(framingMargin, 1)));
  const fittedDistance = boundingSphereRadius / Math.sin(limitingHalfFov);
  const maxDistance = Math.max(boundingSphereRadius * 1.5, fittedDistance * safeFramingMargin);
  const minDistance = Math.min(
    maxDistance * 0.45,
    Math.max(8, boundingSphereRadius * 0.11),
  );

  return {
    boundingSphereRadius,
    verticalFovRadians: verticalHalfFov * 2,
    horizontalFovRadians: horizontalHalfFov * 2,
    limitingHalfFovRadians: limitingHalfFov,
    fittedDistance,
    minDistance,
    maxDistance,
  } as const;
}

export function resolveCommercialMapCameraFarPlane(
  bounds: CommercialMapCameraFramingBounds,
  maxDistance: number,
) {
  const radius = resolveCommercialMapBoundingSphereRadius(bounds);
  const safeMaxDistance = finitePositive(maxDistance, radius * 2);
  // Preserve enough world-space depth for the real horizon while retaining a
  // conservative near/far ratio on small screens. The opaque environment
  // ground uses a larger world-space safety envelope, so its edge is never
  // exposed inside this derived reach.
  return Math.max(1_200, (safeMaxDistance + radius) * 3);
}

/** Clamp a queued pose before animation; OrbitControls remains the gesture owner. */
export function clampCommercialMapCameraPosition({
  position,
  target,
  minDistance,
  maxDistance,
}: CommercialMapCameraPositionClampInput) {
  const safeTarget = target.map((value) => (Number.isFinite(value) ? value : 0)) as [number, number, number];
  const safePosition = position.map((value, index) => (
    Number.isFinite(value) ? value : safeTarget[index]
  )) as [number, number, number];
  const safeMinimum = Math.max(0.001, Number.isFinite(minDistance) ? minDistance : 0.001);
  const safeMaximum = Math.max(
    safeMinimum,
    Number.isFinite(maxDistance) ? maxDistance : safeMinimum,
  );
  let dx = safePosition[0] - safeTarget[0];
  let dy = safePosition[1] - safeTarget[1];
  let dz = safePosition[2] - safeTarget[2];
  let distance = Math.hypot(dx, dy, dz);

  if (distance < 0.000001) {
    dx = 0;
    dy = 1;
    dz = 0;
    distance = 1;
  }

  const clampedDistance = Math.min(safeMaximum, Math.max(safeMinimum, distance));
  const scale = clampedDistance / distance;
  return {
    position: [
      safeTarget[0] + dx * scale,
      safeTarget[1] + dy * scale,
      safeTarget[2] + dz * scale,
    ] as [number, number, number],
    distance: clampedDistance,
    wasClamped: Math.abs(clampedDistance - distance) > 0.000001,
  } as const;
}

export function isCommercialMapHydrologicalPortraitViewport(
  viewportWidth: number,
  viewportHeight: number,
) {
  const width = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 0;
  const height = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0;
  return width > 0
    && width <= COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_MAX_WIDTH
    && height / width >= COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_MIN_RATIO;
}

export function resolveCommercialMapHydrologicalPortraitTargetShift(sceneDiagonal: number) {
  const diagonal = Number.isFinite(sceneDiagonal) ? Math.max(0, sceneDiagonal) : 0;
  return diagonal * COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_TARGET_SHIFT_RATIO;
}

export function shouldSuppressCommercialMapResizeRefit(
  currentTime: number,
  suppressionEndsAt: number,
) {
  if (!Number.isFinite(currentTime) || !Number.isFinite(suppressionEndsAt)) return false;
  return currentTime < suppressionEndsAt;
}

function optionalFinitePositive(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function commercialMapQualityTierIndex(tier: CommercialMapQualityTier) {
  return COMMERCIAL_MAP_QUALITY_TIER_ORDER.indexOf(tier);
}

function commercialMapQualityTierAt(index: number) {
  const clampedIndex = Math.min(
    COMMERCIAL_MAP_QUALITY_TIER_ORDER.length - 1,
    Math.max(0, Math.round(index)),
  );
  return COMMERCIAL_MAP_QUALITY_TIER_ORDER[clampedIndex];
}

/**
 * Resolves the highest sensible starting tier from stable device signals.
 * Unknown browser hints are not treated as weak hardware because Safari does
 * not expose deviceMemory. Runtime frame-time samples can still move the tier.
 */
export function resolveCommercialMapQualityCeiling({
  devicePixelRatio,
  viewportWidth,
  viewportHeight,
  deviceMemoryGb,
  hardwareConcurrency,
  isMobile,
}: CommercialMapQualityCapabilitiesInput): CommercialMapQualityTier {
  const width = finitePositive(viewportWidth, 1);
  const height = finitePositive(viewportHeight, 1);
  const dpr = Math.max(1, finitePositive(devicePixelRatio, 1));
  const memory = optionalFinitePositive(deviceMemoryGb);
  const cores = optionalFinitePositive(hardwareConcurrency);
  const cssPixelCount = width * height;
  const nativePixelDemand = cssPixelCount * dpr * dpr;
  const phoneOrMobile = isMobile ?? Math.min(width, height) <= 600;
  const explicitlyWeak = (memory !== undefined && memory <= 2)
    || (cores !== undefined && cores <= 2);

  if (explicitlyWeak) return 'LOW';

  if (phoneOrMobile) {
    const hasStrongMobileSignal = (memory !== undefined && memory >= 4)
      || (cores !== undefined && cores >= 6);
    return hasStrongMobileSignal && nativePixelDemand <= 5_000_000
      ? 'HIGH'
      : 'MEDIUM';
  }

  if (cssPixelCount > 8_500_000 || nativePixelDemand > 20_000_000) return 'MEDIUM';
  if ((memory !== undefined && memory < 4) || (cores !== undefined && cores < 4)) {
    return 'MEDIUM';
  }

  const hasUltraHardware = memory !== undefined
    && cores !== undefined
    && memory >= 8
    && cores >= 8;
  if (hasUltraHardware && cssPixelCount <= 2_500_000 && nativePixelDemand <= 8_500_000) {
    return 'ULTRA';
  }

  return 'HIGH';
}

export function resolveCommercialMapEnvironmentQualityTier(
  adaptiveTier: CommercialMapQualityTier,
): CommercialMapEnvironmentQualityTier {
  if (adaptiveTier === 'LOW') return 'reduced';
  if (adaptiveTier === 'MEDIUM') return 'balanced';
  return 'full';
}

/**
 * HIGH and ULTRA share the full environment stack (shadow map, terrain
 * program, composer, regional instances). HIGH↔MEDIUM and MEDIUM↔LOW do not.
 */
export function commercialMapQualitySceneRebuildsOnTierChange(
  from: CommercialMapQualityTier,
  to: CommercialMapQualityTier,
) {
  return resolveCommercialMapEnvironmentQualityTier(from)
    !== resolveCommercialMapEnvironmentQualityTier(to);
}

export function resolveCommercialMapAdaptiveUpgradeWindows(downgradeStreak: number) {
  const extra = Math.max(0, Math.round(downgradeStreak))
    * COMMERCIAL_MAP_ADAPTIVE_QUALITY_FAST_WINDOWS_ESCALATION;
  return Math.min(
    COMMERCIAL_MAP_ADAPTIVE_QUALITY_MAX_FAST_WINDOWS,
    COMMERCIAL_MAP_ADAPTIVE_QUALITY_FAST_WINDOWS + extra,
  );
}

export function createCommercialMapAdaptiveQualityState(
  capabilities: CommercialMapQualityCapabilitiesInput,
): CommercialMapAdaptiveQualityState {
  return {
    tier: resolveCommercialMapQualityCeiling(capabilities),
    consecutiveSlowWindows: 0,
    consecutiveFastWindows: 0,
    lastDowngradeAtMs: 0,
    downgradeStreak: 0,
  };
}

function stableCommercialMapQualityDecision(
  state: CommercialMapAdaptiveQualityState,
  hardwareCeiling: CommercialMapQualityTier,
  reason: CommercialMapAdaptiveQualityReason,
): CommercialMapAdaptiveQualityDecision {
  return {
    ...state,
    hardwareCeiling,
    changed: false,
    reason,
  };
}

/**
 * Applies two-way hysteresis to rolling frame-time windows. A quality drop
 * needs two consecutive slow windows. Recovery waits for a dwell period after
 * each downgrade, then an escalating number of fast windows, so HIGH↔MEDIUM
 * cannot flap during a single pan/zoom.
 */
export function resolveCommercialMapAdaptiveQuality(
  state: CommercialMapAdaptiveQualityState,
  sample: CommercialMapAdaptiveQualitySample,
): CommercialMapAdaptiveQualityDecision {
  const hardwareCeiling = resolveCommercialMapQualityCeiling(sample);
  const ceilingIndex = commercialMapQualityTierIndex(hardwareCeiling);
  const currentIndex = commercialMapQualityTierIndex(state.tier);
  const nowMs = optionalFiniteTimestamp(sample.nowMs);
  const lastDowngradeAtMs = optionalFiniteTimestamp(state.lastDowngradeAtMs) ?? 0;
  const downgradeStreak = Number.isFinite(state.downgradeStreak)
    ? Math.max(0, Math.round(state.downgradeStreak))
    : 0;

  if (currentIndex > ceilingIndex) {
    return {
      tier: hardwareCeiling,
      consecutiveSlowWindows: 0,
      consecutiveFastWindows: 0,
      lastDowngradeAtMs: nowMs ?? lastDowngradeAtMs,
      downgradeStreak: downgradeStreak + 1,
      hardwareCeiling,
      changed: true,
      reason: 'hardware-cap',
    };
  }

  const sampledFrames = optionalFinitePositive(sample.sampledFrames)
    ?? COMMERCIAL_MAP_ADAPTIVE_QUALITY_MIN_SAMPLED_FRAMES;
  if (!Number.isFinite(sample.averageFrameTimeMs)
    || sample.averageFrameTimeMs <= 0
    || sampledFrames < COMMERCIAL_MAP_ADAPTIVE_QUALITY_MIN_SAMPLED_FRAMES) {
    return stableCommercialMapQualityDecision(
      {
        tier: state.tier,
        consecutiveSlowWindows: 0,
        consecutiveFastWindows: 0,
        lastDowngradeAtMs,
        downgradeStreak,
      },
      hardwareCeiling,
      'insufficient-sample',
    );
  }

  const preset = COMMERCIAL_MAP_QUALITY_PRESETS[state.tier];
  const canDowngrade = currentIndex > 0;
  const canUpgrade = currentIndex < ceilingIndex;

  if (canDowngrade && sample.averageFrameTimeMs >= preset.downgradeAboveFrameTimeMs) {
    const consecutiveSlowWindows = Math.max(0, state.consecutiveSlowWindows) + 1;
    if (consecutiveSlowWindows >= COMMERCIAL_MAP_ADAPTIVE_QUALITY_SLOW_WINDOWS) {
      return {
        tier: commercialMapQualityTierAt(currentIndex - 1),
        consecutiveSlowWindows: 0,
        consecutiveFastWindows: 0,
        lastDowngradeAtMs: nowMs ?? lastDowngradeAtMs,
        downgradeStreak: downgradeStreak + 1,
        hardwareCeiling,
        changed: true,
        reason: 'sustained-slow-frames',
      };
    }
    return stableCommercialMapQualityDecision(
      {
        tier: state.tier,
        consecutiveSlowWindows,
        consecutiveFastWindows: 0,
        lastDowngradeAtMs,
        downgradeStreak,
      },
      hardwareCeiling,
      'stable',
    );
  }

  const dwellElapsed = lastDowngradeAtMs <= 0
    || nowMs === undefined
    || nowMs - lastDowngradeAtMs >= COMMERCIAL_MAP_ADAPTIVE_QUALITY_UPGRADE_DWELL_MS;
  const requiredFastWindows = resolveCommercialMapAdaptiveUpgradeWindows(downgradeStreak);

  if (canUpgrade && sample.averageFrameTimeMs <= preset.upgradeBelowFrameTimeMs) {
    if (!dwellElapsed) {
      return stableCommercialMapQualityDecision(
        {
          tier: state.tier,
          consecutiveSlowWindows: 0,
          consecutiveFastWindows: 0,
          lastDowngradeAtMs,
          downgradeStreak,
        },
        hardwareCeiling,
        'stable',
      );
    }
    const consecutiveFastWindows = Math.max(0, state.consecutiveFastWindows) + 1;
    if (consecutiveFastWindows >= requiredFastWindows) {
      return {
        tier: commercialMapQualityTierAt(currentIndex + 1),
        consecutiveSlowWindows: 0,
        consecutiveFastWindows: 0,
        lastDowngradeAtMs: 0,
        downgradeStreak: 0,
        hardwareCeiling,
        changed: true,
        reason: 'sustained-fast-frames',
      };
    }
    return stableCommercialMapQualityDecision(
      {
        tier: state.tier,
        consecutiveSlowWindows: 0,
        consecutiveFastWindows,
        lastDowngradeAtMs,
        downgradeStreak,
      },
      hardwareCeiling,
      'stable',
    );
  }

  return stableCommercialMapQualityDecision(
    {
      tier: state.tier,
      consecutiveSlowWindows: 0,
      consecutiveFastWindows: 0,
      lastDowngradeAtMs,
      downgradeStreak,
    },
    hardwareCeiling,
    'stable',
  );
}

function optionalFiniteTimestamp(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function resolveBudgetedCommercialMapPixelRatio({
  devicePixelRatio,
  viewportWidth,
  viewportHeight,
  pixelBudget,
  maximumPixelRatio,
}: {
  devicePixelRatio: number;
  viewportWidth: number;
  viewportHeight: number;
  pixelBudget: number;
  maximumPixelRatio: number;
}) {
  const safeDpr = Math.max(1, finitePositive(devicePixelRatio, 1));
  const safeWidth = finitePositive(viewportWidth, 1);
  const safeHeight = finitePositive(viewportHeight, 1);
  const safePixelBudget = finitePositive(pixelBudget, REDUCED_PIXEL_BUDGET);
  const safeMaximumPixelRatio = finitePositive(maximumPixelRatio, 1);
  const budgetCap = Math.sqrt(safePixelBudget / (safeWidth * safeHeight));
  const budgeted = Math.min(safeDpr, safeMaximumPixelRatio, budgetCap);
  // Round down (never to nearest) so the returned drawing buffer cannot cross
  // the declared budget because of presentation rounding.
  const roundedDown = Math.floor(budgeted * 100) / 100;
  return roundedDown > 0 ? roundedDown : budgeted;
}

export function resolveCommercialMapQualityPixelRatio({
  qualityTier,
  ...viewport
}: CommercialMapQualityPixelRatioInput) {
  const preset = COMMERCIAL_MAP_QUALITY_PRESETS[qualityTier];
  return resolveBudgetedCommercialMapPixelRatio({
    ...viewport,
    pixelBudget: preset.pixelBudget,
    maximumPixelRatio: preset.maximumPixelRatio,
  });
}

export function resolveCommercialMapPixelRatio({
  devicePixelRatio,
  viewportWidth,
  viewportHeight,
  reducedGraphics,
}: CommercialMapPixelRatioInput) {
  const safeWidth = finitePositive(viewportWidth, 1);
  const safeHeight = finitePositive(viewportHeight, 1);
  const isPhoneViewport = Math.min(safeWidth, safeHeight) <= 600;
  // Alterar DPR em onStart/onEnd redimensiona o drawing buffer durante o gesto.
  // O orçamento é calculado por viewport e
  // permanece estável durante órbita, pan, pinça e animações da câmera.
  return resolveBudgetedCommercialMapPixelRatio({
    devicePixelRatio,
    viewportWidth: safeWidth,
    viewportHeight: safeHeight,
    pixelBudget: reducedGraphics ? REDUCED_PIXEL_BUDGET : STANDARD_PIXEL_BUDGET,
    maximumPixelRatio: reducedGraphics ? 1.35 : isPhoneViewport ? 2.25 : 1.75,
  });
}

export function resolveCommercialMapSheetSnap(
  sheetHeight: number,
  viewportHeight: number,
  collapsedHeight = 104,
): CommercialMapDetailSheetState {
  if (!Number.isFinite(sheetHeight) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return 'half';
  }

  const resolvedCollapsedHeight = Math.min(
    Math.max(0, Number.isFinite(collapsedHeight) ? collapsedHeight : 104),
    viewportHeight * 0.4,
  );
  // The middle stop is a compact summary; full details need explicit expansion.
  const halfHeight = Math.max(152, viewportHeight * 0.25);
  const expandedHeight = Math.max(halfHeight, viewportHeight - Math.max(88, viewportHeight * 0.18));
  const collapsedThreshold = (resolvedCollapsedHeight + halfHeight) / 2;
  const expandedThreshold = (halfHeight + expandedHeight) / 2;

  if (sheetHeight <= collapsedThreshold) return 'collapsed';
  if (sheetHeight >= expandedThreshold) return 'expanded';
  return 'half';
}
