import {
  COMMERCIAL_MAP_ADAPTIVE_QUALITY_MIN_SAMPLED_FRAMES,
  createCommercialMapAdaptiveQualityState,
  type CommercialMapAdaptiveQualityState,
} from './viewport';

export const COMMERCIAL_MAP_ADAPTIVE_QUALITY_MAX_FRAME_GAP_MS = 250;

export interface CommercialMapDeviceCapabilityHints {
  deviceMemoryGb?: number;
  hardwareConcurrency?: number;
}

export interface CommercialMapFrameTimeWindow {
  elapsedMs: number;
  sampledFrames: number;
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
  return { elapsedMs: 0, sampledFrames: 0 };
}

export function resetCommercialMapFrameTimeWindow(window: CommercialMapFrameTimeWindow) {
  window.elapsedMs = 0;
  window.sampledFrames = 0;
}

/**
 * Mutates one reusable accumulator and allocates only when a complete sample
 * is emitted. Long gaps belong to demand-idle time, not GPU frame cost.
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

  const completed = {
    averageFrameTimeMs: window.elapsedMs / window.sampledFrames,
    sampledFrames: window.sampledFrames,
  };
  resetCommercialMapFrameTimeWindow(window);
  return completed;
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
