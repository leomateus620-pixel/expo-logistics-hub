import { describe, expect, it } from 'vitest';
import {
  ALVORADA_PHASES,
  ALVORADA_SEQUENCE_DURATION,
  bellCurve,
  clamp01,
  createInitialTimelineState,
  getAlvoradaPhase,
  rangeProgress,
  smootherstep,
  smoothRange,
  smoothstep,
} from '@/features/alvorada/timeline';

describe('timeline cinematográfica da Alvorada', () => {
  it('mantém os sete movimentos até 10,5s e entra em hold final indefinido', () => {
    expect(ALVORADA_SEQUENCE_DURATION).toBe(10.5);
    expect(ALVORADA_PHASES.orbitalBrazil).toEqual({ start: 0, end: 2 });
    expect(ALVORADA_PHASES.rioGrandeDoSul).toEqual({ start: 2, end: 4 });
    expect(Object.values(ALVORADA_PHASES)).toContainEqual({ start: 4, end: 4.5 });
    expect(ALVORADA_PHASES.santaRosaDescent).toEqual({ start: 4.5, end: 6 });
    expect(ALVORADA_PHASES.cityFlight).toEqual({ start: 6, end: 7.5 });
    expect(ALVORADA_PHASES.dawnRise).toEqual({ start: 7.5, end: 9 });
    expect(ALVORADA_PHASES.titleReveal).toEqual({ start: 9, end: 10.5 });
    expect(ALVORADA_PHASES.finalHold.start).toBe(ALVORADA_SEQUENCE_DURATION);
    expect(getAlvoradaPhase(60)).toBe('finalHold');
    expect(getAlvoradaPhase(Number.MAX_SAFE_INTEGER)).toBe('finalHold');
  });

  it('seleciona cada fase narrativa nos limites definidos', () => {
    const stabilizationPhase = Object.entries(ALVORADA_PHASES).find(([, interval]) => (
      interval.start === 4 && interval.end === 4.5
    ))?.[0];

    expect(stabilizationPhase).toBeDefined();

    const phaseCases = [
      [-1, 'orbitalBrazil'],
      [0, 'orbitalBrazil'],
      [1.999, 'orbitalBrazil'],
      [2, 'rioGrandeDoSul'],
      [3.999, 'rioGrandeDoSul'],
      [4, stabilizationPhase],
      [4.499, stabilizationPhase],
      [4.5, 'santaRosaDescent'],
      [5.999, 'santaRosaDescent'],
      [6, 'cityFlight'],
      [7.499, 'cityFlight'],
      [7.5, 'dawnRise'],
      [8.999, 'dawnRise'],
      [9, 'titleReveal'],
      [10.499, 'titleReveal'],
      [10.5, 'finalHold'],
      [ALVORADA_SEQUENCE_DURATION + 120, 'finalHold'],
    ] as const;

    for (const [elapsed, expectedPhase] of phaseCases) {
      expect(getAlvoradaPhase(elapsed)).toBe(expectedPhase);
    }
  });

  it('inicializa a câmera no Brasil orbital sem progresso residual', () => {
    expect(createInitialTimelineState()).toEqual({
      ambientElapsed: 0,
      elapsed: 0,
      delta: 0,
      progress: 0,
      phase: 'orbitalBrazil',
    });
  });

  it('restaura o tempo e a fase preservados após remontar o Canvas', () => {
    const restored = createInitialTimelineState(8.25);

    expect(restored.elapsed).toBe(8.25);
    expect(restored.ambientElapsed).toBe(8.25);
    expect(restored.delta).toBe(0);
    expect(restored.progress).toBeCloseTo(8.25 / ALVORADA_SEQUENCE_DURATION, 8);
    expect(restored.phase).toBe('dawnRise');
    expect(createInitialTimelineState(-2).elapsed).toBe(0);
    expect(createInitialTimelineState(20).elapsed).toBe(ALVORADA_SEQUENCE_DURATION);
    expect(createInitialTimelineState(20).ambientElapsed).toBe(ALVORADA_SEQUENCE_DURATION);
    expect(createInitialTimelineState(20).progress).toBe(1);
    expect(createInitialTimelineState(20).phase).toBe('finalHold');
  });

  it('limita e normaliza intervalos inclusive quando o intervalo é degenerado', () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(0.35)).toBe(0.35);
    expect(clamp01(7)).toBe(1);
    expect(rangeProgress(1, 2, 4)).toBe(0);
    expect(rangeProgress(3, 2, 4)).toBe(0.5);
    expect(rangeProgress(5, 2, 4)).toBe(1);
    expect(rangeProgress(1, 2, 2)).toBe(0);
    expect(rangeProgress(2, 2, 2)).toBe(1);
  });

  it('usa interpolações monotônicas com velocidade nula nas extremidades', () => {
    const samples = Array.from({ length: 101 }, (_, index) => index / 100);
    const smoothValues = samples.map(smoothstep);
    const smootherValues = samples.map(smootherstep);

    for (let index = 1; index < samples.length; index += 1) {
      expect(smoothValues[index]).toBeGreaterThanOrEqual(smoothValues[index - 1]);
      expect(smootherValues[index]).toBeGreaterThanOrEqual(smootherValues[index - 1]);
    }

    const epsilon = 0.0001;
    const derivativeAtStart = (smootherstep(epsilon) - smootherstep(0)) / epsilon;
    const derivativeAtEnd = (smootherstep(1) - smootherstep(1 - epsilon)) / epsilon;
    expect(derivativeAtStart).toBeLessThan(0.001);
    expect(derivativeAtEnd).toBeLessThan(0.001);
    expect(smoothRange(2, 2, 4)).toBe(0);
    expect(smoothRange(4, 2, 4)).toBe(1);
  });

  it('produz uma máscara de nuvem contínua, simétrica e sem estouro', () => {
    expect(bellCurve(3, 4, 5, 6)).toBe(0);
    expect(bellCurve(4, 4, 5, 6)).toBe(0);
    expect(bellCurve(5, 4, 5, 6)).toBe(1);
    expect(bellCurve(6, 4, 5, 6)).toBe(0);
    expect(bellCurve(4.5, 4, 5, 6)).toBeCloseTo(bellCurve(5.5, 4, 5, 6), 8);

    const epsilon = 0.0001;
    expect(Math.abs(bellCurve(5 - epsilon, 4, 5, 6) - bellCurve(5 + epsilon, 4, 5, 6)))
      .toBeLessThan(0.000001);
  });
});
