/** The authored WebGL journey ends when the organizational ecosystem is ready. */
export const ALVORADA_SEQUENCE_DURATION = 11.4;
export const ALVORADA_EXIT_DURATION_MS = 400;
export const ALVORADA_BRAND_HOLD_DURATION = 2;

/**
 * One explicit state machine shared by WebGL diagnostics and the DOM graph
 * transition. Keeping the terminal phase open-ended lets the ecosystem remain
 * interactive without extending the authored intro clock.
 */
export const ALVORADA_PHASES = {
  dawn: { start: 0, end: 1.6 },
  territory: { start: 1.6, end: 4.4 },
  'santa-rosa': { start: 4.4, end: 5.8 },
  'brand-reveal': { start: 5.8, end: 7.4 },
  'brand-hold': { start: 7.4, end: 9.4 },
  'org-transition': { start: 9.4, end: ALVORADA_SEQUENCE_DURATION },
  'org-ready': { start: ALVORADA_SEQUENCE_DURATION, end: Number.POSITIVE_INFINITY },
} as const;

export type AlvoradaPhase = keyof typeof ALVORADA_PHASES;

export type AlvoradaDominantScene =
  | 'dawn'
  | 'territory'
  | 'santa-rosa'
  | 'brand'
  | 'organizational';

export interface AlvoradaVisualState {
  dominantScene: AlvoradaDominantScene;
  earthOpacity: number;
  skyOpacity: number;
  transitionOpacity: number;
  brandProgress: number;
  brandOpacity: number;
  orgTransitionProgress: number;
  earthResident: boolean;
}

export interface AlvoradaTimelineState {
  /** Visible runtime, including the living organizational composition. */
  ambientElapsed: number;
  /** Authored intro time, clamped when the organizational graph is ready. */
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

const EARTH_FADE_START = 5.05;
const EARTH_FADE_END = 5.68;
const EARTH_RESIDENCY_END = 5.95;
const SKY_REVEAL_START = ALVORADA_PHASES.dawn.start;
const SKY_REVEAL_END = ALVORADA_PHASES.dawn.end;
const TRANSITION_START = ALVORADA_PHASES['santa-rosa'].start;
const TRANSITION_PEAK = 5.2;
const TRANSITION_END = 6.35;
const MAX_TRANSITION_OPACITY = 0.72;

function normalizeElapsed(elapsed: number) {
  if (Number.isNaN(elapsed)) return 0;
  return Math.max(0, elapsed);
}

function getDominantScene(elapsed: number): AlvoradaDominantScene {
  if (elapsed < ALVORADA_PHASES.territory.start) return 'dawn';
  if (elapsed < ALVORADA_PHASES['santa-rosa'].start) return 'territory';
  if (elapsed < ALVORADA_PHASES['brand-reveal'].start) return 'santa-rosa';
  if (elapsed < ALVORADA_PHASES['org-transition'].start) return 'brand';
  return 'organizational';
}

/**
 * Single source of truth for scene ownership and the DOM brand/graph hand-off.
 * The removed city and 3D title have no visibility or residency state here, so
 * they cannot accidentally return through a phase-only mount.
 */
export function deriveAlvoradaVisualState(elapsed: number): AlvoradaVisualState {
  const authoredElapsed = normalizeElapsed(elapsed);
  const orgTransitionProgress = smoothRange(
    authoredElapsed,
    ALVORADA_PHASES['org-transition'].start,
    ALVORADA_PHASES['org-transition'].end,
  );
  const brandProgress = smoothRange(
    authoredElapsed,
    ALVORADA_PHASES['brand-reveal'].start,
    ALVORADA_PHASES['brand-reveal'].end,
  );

  return {
    dominantScene: getDominantScene(authoredElapsed),
    earthOpacity: 1 - smoothRange(authoredElapsed, EARTH_FADE_START, EARTH_FADE_END),
    skyOpacity: smoothRange(authoredElapsed, SKY_REVEAL_START, SKY_REVEAL_END)
      * (1 - orgTransitionProgress),
    transitionOpacity: MAX_TRANSITION_OPACITY * bellCurve(
      authoredElapsed,
      TRANSITION_START,
      TRANSITION_PEAK,
      TRANSITION_END,
    ),
    brandProgress,
    brandOpacity: brandProgress * (1 - orgTransitionProgress),
    orgTransitionProgress,
    earthResident: authoredElapsed < EARTH_RESIDENCY_END,
  };
}

export function getAlvoradaPhase(elapsed: number): AlvoradaPhase {
  const authoredElapsed = normalizeElapsed(elapsed);
  if (authoredElapsed < ALVORADA_PHASES.territory.start) return 'dawn';
  if (authoredElapsed < ALVORADA_PHASES['santa-rosa'].start) return 'territory';
  if (authoredElapsed < ALVORADA_PHASES['brand-reveal'].start) return 'santa-rosa';
  if (authoredElapsed < ALVORADA_PHASES['brand-hold'].start) return 'brand-reveal';
  if (authoredElapsed < ALVORADA_PHASES['org-transition'].start) return 'brand-hold';
  if (authoredElapsed < ALVORADA_PHASES['org-ready'].start) return 'org-transition';
  return 'org-ready';
}

export function createInitialTimelineState(initialElapsed = 0): AlvoradaTimelineState {
  const elapsed = Math.min(ALVORADA_SEQUENCE_DURATION, normalizeElapsed(initialElapsed));

  return {
    ambientElapsed: elapsed,
    elapsed,
    delta: 0,
    progress: elapsed / ALVORADA_SEQUENCE_DURATION,
    phase: getAlvoradaPhase(elapsed),
  };
}
