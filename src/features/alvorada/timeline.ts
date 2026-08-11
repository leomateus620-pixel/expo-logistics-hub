/** End of the authored journey. The renderer remains alive in finalHold. */
export const ALVORADA_SEQUENCE_DURATION = 12.4;
export const ALVORADA_EXIT_DURATION_MS = 400;

export const ALVORADA_PHASES = {
  orbitalBrazil: { start: 0, end: 2 },
  rioGrandeDoSul: { start: 2, end: 4 },
  santaRosaStabilization: { start: 4, end: 4.8 },
  santaRosaDescent: { start: 4.8, end: 6.4 },
  cityFlight: { start: 6.4, end: 8.8 },
  dawnRise: { start: 8.8, end: 10.6 },
  titleReveal: { start: 10.6, end: ALVORADA_SEQUENCE_DURATION },
  finalHold: { start: ALVORADA_SEQUENCE_DURATION, end: Number.POSITIVE_INFINITY },
} as const;

export type AlvoradaPhase = keyof typeof ALVORADA_PHASES;

export type AlvoradaDominantScene = 'orbital' | 'transition' | 'city' | 'dawn' | 'title';

export interface AlvoradaVisualState {
  dominantScene: AlvoradaDominantScene;
  earthOpacity: number;
  cityVisible: boolean;
  skyOpacity: number;
  transitionOpacity: number;
  titleProgress: number;
  earthResident: boolean;
  cityResident: boolean;
  titleResident: boolean;
}

export interface AlvoradaTimelineState {
  /** Visible runtime, including the living final composition. */
  ambientElapsed: number;
  /** Authored sequence time, clamped at the final brand frame. */
  elapsed: number;
  delta: number;
  progress: number;
  phase: AlvoradaPhase;
}

export function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function smoothstep(value: number) {
  const progress = clamp01(value);
  return progress * progress * (3 - 2 * progress);
}

export function smootherstep(value: number) {
  const progress = clamp01(value);
  return progress * progress * progress * (progress * (progress * 6 - 15) + 10);
}

export function rangeProgress(elapsed: number, start: number, end: number) {
  if (end <= start) return elapsed >= end ? 1 : 0;
  return clamp01((elapsed - start) / (end - start));
}

export function smoothRange(elapsed: number, start: number, end: number) {
  return smootherstep(rangeProgress(elapsed, start, end));
}

export function bellCurve(elapsed: number, start: number, peak: number, end: number) {
  if (elapsed <= start || elapsed >= end) return 0;
  if (elapsed <= peak) return smoothRange(elapsed, start, peak);
  return 1 - smoothRange(elapsed, peak, end);
}

const EARTH_FADE_START = 4.32;
const EARTH_FADE_END = 4.79;
const CITY_VISIBILITY_START = 4.82;
const EARTH_RESIDENCY_END = 5.45;
const CITY_RESIDENCY_START = 0.75;
const CITY_VISIBILITY_END = ALVORADA_PHASES.titleReveal.start;
const CITY_RESIDENCY_END = 11.2;
const TITLE_RESIDENCY_START = 6.8;
const SKY_REVEAL_START = 4.2;
const SKY_REVEAL_END = 5.95;
const TRANSITION_START = ALVORADA_PHASES.santaRosaStabilization.start;
const TRANSITION_PEAK = 4.82;
const TRANSITION_END = 6.25;
const MAX_TRANSITION_OPACITY = 0.72;

function normalizeElapsed(elapsed: number) {
  if (Number.isNaN(elapsed)) return 0;
  return Math.max(0, elapsed);
}

function getDominantScene(elapsed: number): AlvoradaDominantScene {
  if (elapsed < ALVORADA_PHASES.santaRosaStabilization.start) return 'orbital';
  if (elapsed < ALVORADA_PHASES.cityFlight.start) return 'transition';
  if (elapsed < ALVORADA_PHASES.dawnRise.start) return 'city';
  if (elapsed < ALVORADA_PHASES.titleReveal.start) return 'dawn';
  return 'title';
}

/**
 * Single source of truth for scene ownership and lifecycle. Components consume
 * these values instead of defining independent visibility windows.
 */
export function deriveAlvoradaVisualState(elapsed: number): AlvoradaVisualState {
  const authoredElapsed = normalizeElapsed(elapsed);
  const earthOpacity = 1 - smoothRange(
    authoredElapsed,
    EARTH_FADE_START,
    EARTH_FADE_END,
  );
  const cityVisible = authoredElapsed >= CITY_VISIBILITY_START
    && authoredElapsed < CITY_VISIBILITY_END;
  const skyOpacity = smoothRange(
    authoredElapsed,
    SKY_REVEAL_START,
    SKY_REVEAL_END,
  );
  const transitionOpacity = MAX_TRANSITION_OPACITY * bellCurve(
    authoredElapsed,
    TRANSITION_START,
    TRANSITION_PEAK,
    TRANSITION_END,
  );

  return {
    dominantScene: getDominantScene(authoredElapsed),
    earthOpacity,
    cityVisible,
    skyOpacity,
    transitionOpacity,
    titleProgress: smoothRange(
      authoredElapsed,
      ALVORADA_PHASES.titleReveal.start,
      ALVORADA_PHASES.titleReveal.end,
    ),
    earthResident: authoredElapsed < EARTH_RESIDENCY_END,
    cityResident: authoredElapsed >= CITY_RESIDENCY_START
      && authoredElapsed < CITY_RESIDENCY_END,
    titleResident: authoredElapsed >= TITLE_RESIDENCY_START,
  };
}

export function getAlvoradaPhase(elapsed: number): AlvoradaPhase {
  if (elapsed < ALVORADA_PHASES.rioGrandeDoSul.start) return 'orbitalBrazil';
  if (elapsed < ALVORADA_PHASES.santaRosaStabilization.start) return 'rioGrandeDoSul';
  if (elapsed < ALVORADA_PHASES.santaRosaDescent.start) return 'santaRosaStabilization';
  if (elapsed < ALVORADA_PHASES.cityFlight.start) return 'santaRosaDescent';
  if (elapsed < ALVORADA_PHASES.dawnRise.start) return 'cityFlight';
  if (elapsed < ALVORADA_PHASES.titleReveal.start) return 'dawnRise';
  if (elapsed < ALVORADA_PHASES.finalHold.start) return 'titleReveal';
  return 'finalHold';
}

export function createInitialTimelineState(initialElapsed = 0): AlvoradaTimelineState {
  const elapsed = Math.min(ALVORADA_SEQUENCE_DURATION, Math.max(0, initialElapsed));

  return {
    ambientElapsed: elapsed,
    elapsed,
    delta: 0,
    progress: elapsed / ALVORADA_SEQUENCE_DURATION,
    phase: getAlvoradaPhase(elapsed),
  };
}
