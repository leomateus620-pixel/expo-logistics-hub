export type LunarLaunchPhase =
  | 'idle'
  | 'ignition'
  | 'liftoff'
  | 'camera-transition'
  | 'cinematic-ascent'
  | 'completion'
  | 'cleanup';

export const LUNAR_LAUNCH_TIMELINE = Object.freeze({
  ignitionStart: 0,
  liftoffStart: 1.18,
  cameraTransitionStart: 2.88,
  cinematicAscentStart: 4.18,
  completionStart: 6.42,
  cleanupStart: 7.24,
  end: 7.5,
});

export const LUNAR_LAUNCH_GESTURE = Object.freeze({
  desktopDoubleClickMaxMs: 420,
  touchDoubleTapMaxMs: 380,
  touchTapMaxTravelPx: 14,
  touchDoubleTapMaxDistancePx: 30,
  touchTapMaxDurationMs: 280,
});

export const LUNAR_LAUNCH_HIT_TARGET = Object.freeze({
  objectName: 'alvo-lancamento-apollo-xiv',
  radius: 0.5,
  baseY: 0.04,
  topPadding: 0.18,
});

export const LUNAR_LAUNCH_RENDER_BUDGET = Object.freeze({
  standard: Object.freeze({ hotParticles: 64, sparks: 24, dust: 32, smoke: 22 }),
  mobile: Object.freeze({ hotParticles: 42, sparks: 14, dust: 22, smoke: 14 }),
  reduced: Object.freeze({ hotParticles: 28, sparks: 8, dust: 14, smoke: 10 }),
  primaryDrawCalls: 6,
  dynamicLights: 1,
});

export interface LunarLaunchQualityInput {
  viewportWidth: number;
  viewportHeight: number;
  reducedGraphics: boolean;
  hardwareConcurrency?: number | null;
  deviceMemoryGb?: number | null;
}

export interface LunarLaunchQualityProfile {
  tier: 'standard' | 'mobile' | 'reduced';
  mobile: boolean;
  portrait: boolean;
  hotParticles: number;
  sparks: number;
  dust: number;
  smoke: number;
  shadowRefreshDuringIgnition: boolean;
}

export interface LunarTapSample {
  timeMs: number;
  clientX: number;
  clientY: number;
}

export interface LunarLaunchMotionSample {
  phase: LunarLaunchPhase;
  altitude: number;
  thrust: number;
  groundLight: number;
  vibration: number;
  ascentProgress: number;
}

function finitePositive(value: number | null | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function smootherstep(value: number) {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function easeOutCubic(value: number) {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
}

export function rangeProgress(value: number, start: number, end: number) {
  if (end <= start) return value >= end ? 1 : 0;
  return clamp01((value - start) / (end - start));
}

export function lunarLaunchPhaseAt(elapsedSeconds: number): LunarLaunchPhase {
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  if (elapsed < LUNAR_LAUNCH_TIMELINE.liftoffStart) return 'ignition';
  if (elapsed < LUNAR_LAUNCH_TIMELINE.cameraTransitionStart) return 'liftoff';
  if (elapsed < LUNAR_LAUNCH_TIMELINE.cinematicAscentStart) return 'camera-transition';
  if (elapsed < LUNAR_LAUNCH_TIMELINE.completionStart) return 'cinematic-ascent';
  if (elapsed < LUNAR_LAUNCH_TIMELINE.cleanupStart) return 'completion';
  if (elapsed < LUNAR_LAUNCH_TIMELINE.end) return 'cleanup';
  return 'idle';
}

export function lunarLaunchMaximumAltitude(sceneDiagonal: number, rocketHeight: number) {
  const safeDiagonal = finitePositive(sceneDiagonal, 80);
  const safeHeight = finitePositive(rocketHeight, 3.8);
  return Math.max(116, safeDiagonal * 1.42, safeHeight * 30);
}

export function lunarLaunchAltitudeAt(
  elapsedSeconds: number,
  sceneDiagonal: number,
  rocketHeight: number,
) {
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  if (elapsed <= LUNAR_LAUNCH_TIMELINE.liftoffStart) return 0;

  const maximumAltitude = lunarLaunchMaximumAltitude(sceneDiagonal, rocketHeight);
  const firstStageEnd = LUNAR_LAUNCH_TIMELINE.cameraTransitionStart;
  const secondStageEnd = LUNAR_LAUNCH_TIMELINE.cinematicAscentStart;
  const finalAscentEnd = LUNAR_LAUNCH_TIMELINE.cleanupStart;
  const firstAltitude = Math.max(10, rocketHeight * 2.65);
  const secondAltitude = Math.max(firstAltitude + 24, maximumAltitude * 0.38);

  if (elapsed < firstStageEnd) {
    const progress = rangeProgress(elapsed, LUNAR_LAUNCH_TIMELINE.liftoffStart, firstStageEnd);
    return firstAltitude * Math.pow(progress, 2.25);
  }
  if (elapsed < secondStageEnd) {
    const progress = smootherstep(rangeProgress(elapsed, firstStageEnd, secondStageEnd));
    return firstAltitude + (secondAltitude - firstAltitude) * progress;
  }

  const progress = rangeProgress(elapsed, secondStageEnd, finalAscentEnd);
  const accelerated = Math.pow(progress, 1.42);
  return secondAltitude + (maximumAltitude - secondAltitude) * accelerated;
}

export function lunarLaunchThrustAt(elapsedSeconds: number) {
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const ignition = smootherstep(rangeProgress(elapsed, 0.18, 1.02));
  const sustained = 0.9 + Math.sin(elapsed * 13.7) * 0.035 + Math.sin(elapsed * 22.3 + 0.7) * 0.018;
  const shutdown = 1 - smootherstep(rangeProgress(elapsed, 6.46, 7.1));
  return clamp01(ignition * sustained * shutdown);
}

export function sampleLunarLaunchMotion(
  elapsedSeconds: number,
  sceneDiagonal: number,
  rocketHeight: number,
  target?: LunarLaunchMotionSample,
): LunarLaunchMotionSample {
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const thrust = lunarLaunchThrustAt(elapsed);
  const ignitionPulse = smootherstep(rangeProgress(elapsed, 0.12, 0.88));
  const groundFalloff = 1 - smootherstep(rangeProgress(elapsed, 1.18, 2.36));
  const vibrationFalloff = 1 - smootherstep(rangeProgress(elapsed, 1.06, 3.2));

  const result: LunarLaunchMotionSample = target ?? {
    phase: 'idle',
    altitude: 0,
    thrust: 0,
    groundLight: 0,
    vibration: 0,
    ascentProgress: 0,
  };
  result.phase = lunarLaunchPhaseAt(elapsed);
  result.altitude = lunarLaunchAltitudeAt(elapsed, sceneDiagonal, rocketHeight);
  result.thrust = thrust;
  result.groundLight = clamp01(ignitionPulse * groundFalloff);
  result.vibration = clamp01(thrust * vibrationFalloff);
  result.ascentProgress = smootherstep(rangeProgress(
    elapsed,
    LUNAR_LAUNCH_TIMELINE.liftoffStart,
    LUNAR_LAUNCH_TIMELINE.cleanupStart,
  ));
  return result;
}

export function resolveLunarLaunchQuality({
  viewportWidth,
  viewportHeight,
  reducedGraphics,
  hardwareConcurrency,
  deviceMemoryGb,
}: LunarLaunchQualityInput): LunarLaunchQualityProfile {
  const width = finitePositive(viewportWidth, 1366);
  const height = finitePositive(viewportHeight, 768);
  const mobile = Math.min(width, height) <= 640;
  const portrait = height > width;
  const weakHardware = finitePositive(hardwareConcurrency, 8) <= 4
    || finitePositive(deviceMemoryGb, 8) <= 4;
  const tier = reducedGraphics || weakHardware
    ? 'reduced'
    : mobile
      ? 'mobile'
      : 'standard';
  const budget = LUNAR_LAUNCH_RENDER_BUDGET[tier];

  return {
    tier,
    mobile,
    portrait,
    ...budget,
    shadowRefreshDuringIgnition: tier === 'standard',
  };
}

export function isDeliberateLunarSecondTap(
  previous: LunarTapSample | null,
  current: LunarTapSample,
) {
  if (!previous) return false;
  const elapsed = current.timeMs - previous.timeMs;
  if (elapsed <= 0 || elapsed > LUNAR_LAUNCH_GESTURE.touchDoubleTapMaxMs) return false;
  return Math.hypot(
    current.clientX - previous.clientX,
    current.clientY - previous.clientY,
  ) <= LUNAR_LAUNCH_GESTURE.touchDoubleTapMaxDistancePx;
}

export function lunarLaunchPhaseLabel(phase: LunarLaunchPhase) {
  switch (phase) {
    case 'ignition': return 'Ignição';
    case 'liftoff': return 'Decolagem';
    case 'camera-transition': return 'Transição orbital';
    case 'cinematic-ascent': return 'Ascensão';
    case 'completion': return 'Vista aérea';
    case 'cleanup': return 'Finalizando';
    default: return 'Pronto para lançamento';
  }
}
