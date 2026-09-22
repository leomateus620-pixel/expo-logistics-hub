import {
  COMMERCIAL_MAP_ADAPTIVE_QUALITY_MIN_SAMPLED_FRAMES,
  commercialMapQualitySceneRebuildsOnTierChange,
  createCommercialMapAdaptiveQualityState,
  type CommercialMapAdaptiveQualityState,
  type CommercialMapQualityTier,
} from './viewport';
import { visitRuntime } from '../visit/visitRuntime';

export const COMMERCIAL_MAP_INTERACTION_MIN_PIXEL_RATIO = 0.85;
export const COMMERCIAL_MAP_INTERACTION_MAX_PIXEL_RATIO = 1.35;
export const COMMERCIAL_MAP_INTERACTION_PIXEL_RATIO_SCALE = 0.9;
// DPR changes resize the drawing buffer and every post-processing target.
// Wait for OrbitControls damping to finish, then require a meaningful idle
// window so those allocations never land in the tail of the same gesture.
export const COMMERCIAL_MAP_QUALITY_SCENE_COMMIT_IDLE_MS = 650;
export const COMMERCIAL_MAP_QUALITY_EVENT = 'commercial-map-quality';

export interface CommercialMapDeviceCapabilityHints {
  deviceMemoryGb?: number;
  hardwareConcurrency?: number;
}

export interface CommercialMapFrameTimeWindow {
  elapsedMs: number;
  sampledFrames: number;
  completed: CommercialMapCompletedFrameTimeWindow;
  durations: number[];
}

export interface CommercialMapCompletedFrameTimeWindow {
  averageFrameTimeMs: number;
  sampledFrames: number;
  p95FrameTimeMs: number;
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
    completed: { averageFrameTimeMs: 0, sampledFrames: 0, p95FrameTimeMs: 0 },
    durations: [],
  };
}

export function resetCommercialMapFrameTimeWindow(window: CommercialMapFrameTimeWindow) {
  window.elapsedMs = 0;
  window.sampledFrames = 0;
  window.durations.length = 0;
}

/**
 * The caller owns activity/visibility boundaries and skips the first delta.
 * Duration alone cannot distinguish an active stall from demand-idle time.
 */
export function recordCommercialMapAdaptiveFrame(
  window: CommercialMapFrameTimeWindow,
  deltaMs: number,
): CommercialMapCompletedFrameTimeWindow | null {
  if (!Number.isFinite(deltaMs)
    || deltaMs <= 0) {
    resetCommercialMapFrameTimeWindow(window);
    return null;
  }

  window.elapsedMs += deltaMs;
  window.sampledFrames += 1;
  window.durations.push(deltaMs);
  if (window.sampledFrames < COMMERCIAL_MAP_ADAPTIVE_QUALITY_MIN_SAMPLED_FRAMES) return null;

  window.completed.averageFrameTimeMs = window.elapsedMs / window.sampledFrames;
  window.completed.sampledFrames = window.sampledFrames;
  window.durations.sort((a, b) => a - b);
  window.completed.p95FrameTimeMs = window.durations[Math.ceil(window.durations.length * 0.95) - 1];
  resetCommercialMapFrameTimeWindow(window);
  return window.completed;
}

export function isCommercialMapHeavyQualityGestureActive(state: {
  cameraNavigating: boolean;
  lunarLaunchPhase: string;
  lunarLaunchReturning: boolean;
}) {
  return state.cameraNavigating
    || visitRuntime.renderingActive
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
 * The same post stack remains active. Its drawing-buffer targets resize only
 * at the motion boundary, never repeatedly during orbit, walking or zoom.
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

export interface CommercialMapPixelRatioState {
  /** Latest adaptive/viewport choice, never a snapshot of the gesture scale. */
  baseDpr: number;
  effectiveDpr: number;
  gestureActive: boolean;
}

export function createCommercialMapPixelRatioState(baseDpr: number): CommercialMapPixelRatioState {
  return { baseDpr, effectiveDpr: baseDpr, gestureActive: false };
}

/**
 * The sole DPR owner's state transition. Keep allocations out of an ongoing
 * gesture, but remember every new base choice so ending it cannot restore a
 * stale DPR captured by a different render-path effect.
 */
export function updateCommercialMapPixelRatioState(
  state: CommercialMapPixelRatioState,
  gestureActive: boolean,
  baseDpr = state.baseDpr,
): number | null {
  if (Number.isFinite(baseDpr) && baseDpr > 0) state.baseDpr = baseDpr;
  const nextDpr = gestureActive
    ? state.gestureActive
      ? state.effectiveDpr
      : resolveCommercialMapInteractionPixelRatio(state.baseDpr)
    : state.baseDpr;
  state.gestureActive = gestureActive;
  if (Math.abs(state.effectiveDpr - nextDpr) <= 0.005) return null;
  state.effectiveDpr = nextDpr;
  return nextDpr;
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
  reducedGraphics: _reducedGraphics,
  documentVisibilityState,
  continuousRendering,
}: {
  mapActive: boolean;
  reducedGraphics: boolean;
  documentVisibilityState: DocumentVisibilityState | 'unavailable';
  continuousRendering: boolean;
}) {
  return mapActive
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

/**
 * Piso estrutural do modo Vendas: a qualidade adaptativa continua protegendo o
 * desempenho reduzindo ambientação, mas nunca pode simplificar a arquitetura
 * comercial (pavilhões, módulos, lotes e ruas). Por isso o nível fica travado
 * em pelo menos `HIGH` enquanto a apresentação de Vendas estiver ativa.
 */
export function applyCommercialMapSalesQualityFloor(
  tier: CommercialMapQualityTier,
  salesPresentationActive: boolean,
): CommercialMapQualityTier {
  if (!salesPresentationActive) return tier;
  return tier === 'LOW' || tier === 'MEDIUM' ? 'HIGH' : tier;
}
