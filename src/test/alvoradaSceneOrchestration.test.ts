import { describe, expect, it } from 'vitest';
import {
  ALVORADA_PHASES,
  ALVORADA_SEQUENCE_DURATION,
  deriveAlvoradaVisualState,
  getAlvoradaPhase,
  type AlvoradaDominantScene,
} from '@/features/alvorada/timeline';

const FPS = 120;
const SAMPLE_END = ALVORADA_SEQUENCE_DURATION + 2;
const EPSILON = 1e-9;

function sampleAuthoredJourney() {
  const frameCount = Math.ceil(SAMPLE_END * FPS);
  return Array.from(
    { length: frameCount + 1 },
    (_, frame) => ({
      elapsed: frame / FPS,
      state: deriveAlvoradaVisualState(frame / FPS),
    }),
  );
}

describe('orquestração autoritativa das cenas da Alvorada', () => {
  it('define a jornada dawn → território → marca → organização', () => {
    expect(ALVORADA_PHASES).toEqual({
      dawn: { start: 0, end: 1.6 },
      territory: { start: 1.6, end: 4.4 },
      'santa-rosa': { start: 4.4, end: 5.8 },
      'brand-reveal': { start: 5.8, end: 7.4 },
      'brand-hold': { start: 7.4, end: 9.4 },
      'org-transition': { start: 9.4, end: 11.4 },
      'org-ready': { start: 11.4, end: Number.POSITIVE_INFINITY },
    });

    const boundaries = [
      [0, 'dawn'],
      [1.6, 'territory'],
      [4.4, 'santa-rosa'],
      [5.8, 'brand-reveal'],
      [7.4, 'brand-hold'],
      [9.4, 'org-transition'],
      [11.4, 'org-ready'],
    ] as const;

    boundaries.forEach(([elapsed, phase]) => {
      expect(getAlvoradaPhase(elapsed)).toBe(phase);
    });
  });

  it('mantém todos os pesos dentro dos limites em amostragem de 120 FPS', () => {
    sampleAuthoredJourney().forEach(({ state }) => {
      const weights = [
        state.earthOpacity,
        state.skyOpacity,
        state.transitionOpacity,
        state.brandProgress,
        state.brandOpacity,
        state.orgTransitionProgress,
      ];

      weights.forEach((weight) => {
        expect(Number.isFinite(weight)).toBe(true);
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(weight).toBeLessThanOrEqual(1);
      });
      expect(state.transitionOpacity).toBeLessThanOrEqual(0.72 + EPSILON);
    });
  });

  it('mantém a marca integral por dois segundos antes da transição organizacional', () => {
    expect(deriveAlvoradaVisualState(7.4)).toMatchObject({
      brandProgress: 1,
      brandOpacity: 1,
      orgTransitionProgress: 0,
    });
    expect(deriveAlvoradaVisualState(8.4)).toMatchObject({
      brandProgress: 1,
      brandOpacity: 1,
      orgTransitionProgress: 0,
    });
    expect(deriveAlvoradaVisualState(9.4)).toMatchObject({
      brandProgress: 1,
      brandOpacity: 1,
      orgTransitionProgress: 0,
    });
    expect(deriveAlvoradaVisualState(10.4).brandOpacity).toBeLessThan(1);
  });

  it('atribui exatamente uma cena dominante em cada momento narrativo', () => {
    const cases: Array<[number, AlvoradaDominantScene]> = [
      [0, 'dawn'],
      [1.6, 'territory'],
      [4.4, 'santa-rosa'],
      [5.8, 'brand'],
      [7.4, 'brand'],
      [9.4, 'organizational'],
      [11.4, 'organizational'],
      [120, 'organizational'],
    ];

    cases.forEach(([elapsed, dominantScene]) => {
      expect(deriveAlvoradaVisualState(elapsed).dominantScene).toBe(dominantScene);
    });
  });

  it('encerra a residência GPU da Terra e não expõe estado da cidade ou do título 3D', () => {
    expect(deriveAlvoradaVisualState(0).earthResident).toBe(true);
    expect(deriveAlvoradaVisualState(5.94).earthResident).toBe(true);
    expect(deriveAlvoradaVisualState(5.95).earthResident).toBe(false);

    sampleAuthoredJourney().forEach(({ elapsed, state }) => {
      expect(state).not.toHaveProperty('cityVisible');
      expect(state).not.toHaveProperty('cityResident');
      expect(state).not.toHaveProperty('titleResident');
      expect(state).not.toHaveProperty('titleProgress');
      if (elapsed >= 5.95) expect(state.earthResident).toBe(false);
    });
  });

  it('resolve o quadro organizacional sem Terra ou efeitos WebGL residuais', () => {
    [11.4, 30, Number.POSITIVE_INFINITY].forEach((elapsed) => {
      expect(deriveAlvoradaVisualState(elapsed)).toMatchObject({
        dominantScene: 'organizational',
        earthOpacity: 0,
        skyOpacity: 0,
        transitionOpacity: 0,
        brandProgress: 1,
        brandOpacity: 0,
        orgTransitionProgress: 1,
        earthResident: false,
      });
    });
  });
});
