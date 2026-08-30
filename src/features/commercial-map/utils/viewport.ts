export type CommercialMapDetailSheetState = 'collapsed' | 'half' | 'expanded';

interface PixelRatioInput {
  devicePixelRatio: number;
  viewportWidth: number;
  viewportHeight: number;
  reducedGraphics: boolean;
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

export function resolveCommercialMapPixelRatio({
  devicePixelRatio,
  viewportWidth,
  viewportHeight,
  reducedGraphics,
}: PixelRatioInput) {
  const safeDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? Math.max(1, devicePixelRatio)
    : 1;
  const safeWidth = Math.max(1, Number.isFinite(viewportWidth) ? viewportWidth : 1);
  const safeHeight = Math.max(1, Number.isFinite(viewportHeight) ? viewportHeight : 1);
  const isPhoneViewport = Math.min(safeWidth, safeHeight) <= 600;
  const pixelBudget = reducedGraphics ? REDUCED_PIXEL_BUDGET : STANDARD_PIXEL_BUDGET;
  const budgetCap = Math.sqrt(pixelBudget / (safeWidth * safeHeight));
  const qualityCap = reducedGraphics ? 1.35 : isPhoneViewport ? 2.25 : 1.75;
  const qualityFloor = reducedGraphics ? 1 : 1.5;
  const budgeted = Math.min(safeDpr, qualityCap, budgetCap);
  const stablePixelRatio = Math.max(Math.min(safeDpr, qualityFloor), budgeted);
  // Alterar DPR em onStart/onEnd redimensiona o drawing buffer durante o gesto.
  // O orçamento é calculado por viewport e
  // permanece estável durante órbita, pan, pinça e animações da câmera.
  return Number(stablePixelRatio.toFixed(2));
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
  const halfHeight = viewportHeight * 0.5;
  const expandedHeight = Math.max(halfHeight, viewportHeight - Math.max(136, viewportHeight * 0.28));
  const collapsedThreshold = (resolvedCollapsedHeight + halfHeight) / 2;
  const expandedThreshold = (halfHeight + expandedHeight) / 2;

  if (sheetHeight <= collapsedThreshold) return 'collapsed';
  if (sheetHeight >= expandedThreshold) return 'expanded';
  return 'half';
}
