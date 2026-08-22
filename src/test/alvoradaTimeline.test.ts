import { describe, expect, it } from 'vitest';
import {
  ALVORADA_BRAND_HOLD_DURATION,
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
  it('define sete fases explícitas e um hold de marca de dois segundos', () => {
    expect(ALVORADA_SEQUENCE_DURATION).toBe(11.4);
    expect(ALVORADA_BRAND_HOLD_DURATION).toBe(2);
    expect(ALVORADA_PHASES).toEqual({
      dawn: { start: 0, end: 1.6 },
      territory: { start: 1.6, end: 4.4 },
      'santa-rosa': { start: 4.4, end: 5.8 },
      'brand-reveal': { start: 5.8, end: 7.4 },
      'brand-hold': { start: 7.4, end: 9.4 },
      'org-transition': { start: 9.4, end: 11.4 },
      'org-ready': { start: 11.4, end: Number.POSITIVE_INFINITY },
    });
    expect(
      ALVORADA_PHASES['brand-hold'].end - ALVORADA_PHASES['brand-hold'].start,
    ).toBe(ALVORADA_BRAND_HOLD_DURATION);
    expect(getAlvoradaPhase(60)).toBe('org-ready');
    expect(getAlvoradaPhase(Number.MAX_SAFE_INTEGER)).toBe('org-ready');
  });

  it('seleciona cada fase narrativa nos limites definidos', () => {
    const phaseCases = [
      [-1, 'dawn'],
      [0, 'dawn'],
      [1.599, 'dawn'],
      [1.6, 'territory'],
      [4.399, 'territory'],
      [4.4, 'santa-rosa'],
      [5.799, 'santa-rosa'],
      [5.8, 'brand-reveal'],
      [7.399, 'brand-reveal'],
      [7.4, 'brand-hold'],
      [9.399, 'brand-hold'],
      [9.4, 'org-transition'],
      [11.399, 'org-transition'],
      [11.4, 'org-ready'],
      [ALVORADA_SEQUENCE_DURATION + 120, 'org-ready'],
    ] as const;

    for (const [elapsed, expectedPhase] of phaseCases) {
      expect(getAlvoradaPhase(elapsed)).toBe(expectedPhase);
    }
  });

  it('inicializa a câmera no amanhecer sem progresso residual', () => {
    expect(createInitialTimelineState()).toEqual({
      ambientElapsed: 0,
      elapsed: 0,
      delta: 0,
      progress: 0,
      phase: 'dawn',
    });
  });

  it('restaura o tempo e a fase preservados após remontar o Canvas', () => {
    const restored = createInitialTimelineState(8.25);

    expect(restored.elapsed).toBe(8.25);
    expect(restored.ambientElapsed).toBe(8.25);
    expect(restored.delta).toBe(0);
    expect(restored.progress).toBeCloseTo(8.25 / ALVORADA_SEQUENCE_DURATION, 8);
    expect(restored.phase).toBe('brand-hold');
    expect(createInitialTimelineState(-2).elapsed).toBe(0);
    expect(createInitialTimelineState(Number.NaN).phase).toBe('dawn');
    expect(createInitialTimelineState(20).elapsed).toBe(ALVORADA_SEQUENCE_DURATION);
    expect(createInitialTimelineState(20).ambientElapsed).toBe(ALVORADA_SEQUENCE_DURATION);
    expect(createInitialTimelineState(20).progress).toBe(1);
    expect(createInitialTimelineState(20).phase).toBe('org-ready');
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
