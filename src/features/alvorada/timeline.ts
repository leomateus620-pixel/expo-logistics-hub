export const ALVORADA_SEQUENCE_DURATION = 8.6;
export const ALVORADA_EXIT_DURATION_MS = 400;

export const ALVORADA_PHASES = {
  orbitalBrazil: { start: 0, end: 2 },
  rioGrandeDoSul: { start: 2, end: 4 },
  santaRosaDescent: { start: 4, end: 5.5 },
  cityFlight: { start: 5.05, end: 6.2 },
  dawnRise: { start: 5.5, end: 7 },
  titleReveal: { start: 7, end: 8.05 },
  finalHold: { start: 8.05, end: ALVORADA_SEQUENCE_DURATION },
} as const;

export type AlvoradaPhase = keyof typeof ALVORADA_PHASES;

export interface AlvoradaTimelineState {
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

export function getAlvoradaPhase(elapsed: number): AlvoradaPhase {
  if (elapsed < ALVORADA_PHASES.rioGrandeDoSul.start) return 'orbitalBrazil';
  if (elapsed < ALVORADA_PHASES.santaRosaDescent.start) return 'rioGrandeDoSul';
  if (elapsed < ALVORADA_PHASES.cityFlight.start) return 'santaRosaDescent';
  if (elapsed < ALVORADA_PHASES.dawnRise.start) return 'cityFlight';
  if (elapsed < ALVORADA_PHASES.titleReveal.start) return 'dawnRise';
  if (elapsed < ALVORADA_PHASES.finalHold.start) return 'titleReveal';
  return 'finalHold';
}

export function createInitialTimelineState(initialElapsed = 0): AlvoradaTimelineState {
  const elapsed = Math.min(ALVORADA_SEQUENCE_DURATION, Math.max(0, initialElapsed));

  return {
    elapsed,
    delta: 0,
    progress: elapsed / ALVORADA_SEQUENCE_DURATION,
    phase: getAlvoradaPhase(elapsed),
  };
}
