import {
  COMMERCIAL_MAP_ADAPTIVE_QUALITY_MIN_SAMPLED_FRAMES,
  commercialMapQualitySceneRebuildsOnTierChange,
  createCommercialMapAdaptiveQualityState,
  type CommercialMapAdaptiveQualityState,
  type CommercialMapQualityTier,
} from './viewport';

export const COMMERCIAL_MAP_ADAPTIVE_QUALITY_MAX_FRAME_GAP_MS = 250;
export const COMMERCIAL_MAP_INTERACTION_MIN_PIXEL_RATIO = 0.72;
export const COMMERCIAL_MAP_INTERACTION_MAX_PIXEL_RATIO = 1;
export const COMMERCIAL_MAP_INTERACTION_PIXEL_RATIO_SCALE = 0.72;
// DPR changes resize the drawing buffer and every post-processing target.
// Wait for OrbitControls damping to finish, then require a meaningful idle
// window so those allocations never land in the tail of the same gesture.
export const COMMERCIAL_MAP_QUALITY_SCENE_COMMIT_IDLE_MS = 650;

export interface CommercialMapDeviceCapabilityHints {
  deviceMemoryGb?: number;
  hardwareConcurrency?: number;
}

export interface CommercialMapFrameTimeWindow {
  elapsedMs: number;
  sampledFrames: number;
  completed: CommercialMapCompletedFrameTimeWindow;
}

export interface CommercialMapCompletedFrameTimeWindow {
  averageFrameTimeMs: number;
  sampledFrames: number;
}

export function readCommercialMapDeviceCapabilityHints(): CommercialMapDeviceCapabilityHints {
  if (typeof navigator === 'undefined') return {};
  const runtimeNavigator = navigator as Navigator & { deviceMemory?: number };
  return {
    deviceMemoryGb: runtimeNavigator.deviceMemory,
    hardwareConcurrency: runtimeNavigator.hardwareConcurrency,
  };
}

export function createCommercialMapFrameTimeWindow(): CommercialMapFrameTimeWindow {
  return {
    elapsedMs: 0,
    sampledFrames: 0,
    completed: { averageFrameTimeMs: 0, sampledFrames: 0 },
  };
}

export function resetCommercialMapFrameTimeWindow(window: CommercialMapFrameTimeWindow) {
  window.elapsedMs = 0;
  window.sampledFrames = 0;
}

/**
 * Mutates one reusable accumulator and returns its completed slot. Long gaps
 * belong to demand-idle time, not GPU frame cost.
 */
export function recordCommercialMapAdaptiveFrame(
  window: CommercialMapFrameTimeWindow,
  deltaMs: number,
): CommercialMapCompletedFrameTimeWindow | null {
  if (!Number.isFinite(deltaMs)
    || deltaMs <= 0
    || deltaMs > COMMERCIAL_MAP_ADAPTIVE_QUALITY_MAX_FRAME_GAP_MS) {
    resetCommercialMapFrameTimeWindow(window);
    return null;
  }

  window.elapsedMs += deltaMs;
  window.sampledFrames += 1;
  if (window.sampledFrames < COMMERCIAL_MAP_ADAPTIVE_QUALITY_MIN_SAMPLED_FRAMES) return null;

  window.completed.averageFrameTimeMs = window.elapsedMs / window.sampledFrames;
  window.completed.sampledFrames = window.sampledFrames;
  resetCommercialMapFrameTimeWindow(window);
  return window.completed;
}

export function isCommercialMapHeavyQualityGestureActive(state: {
  cameraNavigating: boolean;
  lunarLaunchPhase: string;
  lunarLaunchReturning: boolean;
}) {
  return state.cameraNavigating
    || state.lunarLaunchPhase !== 'idle'
    || state.lunarLaunchReturning;
}

export function shouldApplyCommercialMapPixelRatioNow({
  currentDpr,
  nextDpr,
  gestureActive,
}: {
  currentDpr: number;
  nextDpr: number;
  gestureActive: boolean;
}) {
  if (Math.abs(nextDpr - currentDpr) <= 0.005) return true;
  return !gestureActive;
}

/**
 * A deterministic, bounded render scale for camera motion. It changes only at
 * gesture boundaries and never mutates the logical adaptive-quality tier.
 * The full-resolution post stack therefore stays allocated while the default
 * framebuffer alone becomes cheaper to orbit, pan and zoom.
 */
export function resolveCommercialMapInteractionPixelRatio(restingDpr: number) {
  if (!Number.isFinite(restingDpr) || restingDpr <= 0) {
    return COMMERCIAL_MAP_INTERACTION_MIN_PIXEL_RATIO;
  }
  return Number(Math.min(
    restingDpr,
    COMMERCIAL_MAP_INTERACTION_MAX_PIXEL_RATIO,
    Math.max(
      COMMERCIAL_MAP_INTERACTION_MIN_PIXEL_RATIO,
      restingDpr * COMMERCIAL_MAP_INTERACTION_PIXEL_RATIO_SCALE,
    ),
  ).toFixed(3));
}

export function shouldDeferCommercialMapSceneQuality({
  fromTier,
  toTier,
  gestureActive,
}: {
  fromTier: CommercialMapQualityTier;
  toTier: CommercialMapQualityTier;
  gestureActive: boolean;
}) {
  if (!gestureActive || fromTier === toTier) return false;
  return commercialMapQualitySceneRebuildsOnTierChange(fromTier, toTier);
}

export function isCommercialMapAdaptiveQualitySamplingActive({
  mapActive,
  reducedGraphics,
  documentVisibilityState,
  continuousRendering,
}: {
  mapActive: boolean;
  reducedGraphics: boolean;
  documentVisibilityState: DocumentVisibilityState | 'unavailable';
  continuousRendering: boolean;
}) {
  return mapActive
    && !reducedGraphics
    && documentVisibilityState === 'visible'
    && continuousRendering;
}

export function createInitialCommercialMapQualityState({
  viewportWidth,
  viewportHeight,
  devicePixelRatio,
  capabilityHints,
}: {
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  capabilityHints: CommercialMapDeviceCapabilityHints;
}): CommercialMapAdaptiveQualityState {
  return createCommercialMapAdaptiveQualityState({
    viewportWidth,
    viewportHeight,
    devicePixelRatio,
    ...capabilityHints,
  });
}
