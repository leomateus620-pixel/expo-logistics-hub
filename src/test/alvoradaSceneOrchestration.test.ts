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
  it('define os intervalos narrativos e o hold final de 12,4 segundos', () => {
    expect(ALVORADA_SEQUENCE_DURATION).toBe(12.4);
    expect(ALVORADA_PHASES).toEqual({
      orbitalBrazil: { start: 0, end: 2 },
      rioGrandeDoSul: { start: 2, end: 4 },
      santaRosaStabilization: { start: 4, end: 4.8 },
      santaRosaDescent: { start: 4.8, end: 6.4 },
      cityFlight: { start: 6.4, end: 8.8 },
      dawnRise: { start: 8.8, end: 10.6 },
      titleReveal: { start: 10.6, end: 12.4 },
      finalHold: { start: 12.4, end: Number.POSITIVE_INFINITY },
    });

    const boundaries = [
      [0, 'orbitalBrazil'],
      [2, 'rioGrandeDoSul'],
      [4, 'santaRosaStabilization'],
      [4.8, 'santaRosaDescent'],
      [6.4, 'cityFlight'],
      [8.8, 'dawnRise'],
      [10.6, 'titleReveal'],
      [12.4, 'finalHold'],
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
        state.titleProgress,
      ];

      weights.forEach((weight) => {
        expect(Number.isFinite(weight)).toBe(true);
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(weight).toBeLessThanOrEqual(1);
      });
      expect(state.transitionOpacity).toBeLessThanOrEqual(0.72 + EPSILON);
    });
  });

  it('nunca torna a cidade visível enquanto a Terra ainda domina o quadro', () => {
    sampleAuthoredJourney().forEach(({ state }) => {
      if (state.cityVisible) {
        expect(state.earthOpacity).toBeLessThanOrEqual(0.02);
        expect(state.cityResident).toBe(true);
      }
      if (state.earthOpacity > 0.02) {
        expect(state.cityVisible).toBe(false);
      }
    });
  });

  it('atribui exatamente uma cena dominante em cada fase narrativa', () => {
    const cases: Array<[number, AlvoradaDominantScene]> = [
      [0, 'orbital'],
      [2, 'orbital'],
      [4, 'transition'],
      [4.8, 'transition'],
      [6.4, 'city'],
      [8.8, 'dawn'],
      [10.6, 'title'],
      [12.4, 'title'],
      [120, 'title'],
    ];

    cases.forEach(([elapsed, dominantScene]) => {
      expect(deriveAlvoradaVisualState(elapsed).dominantScene).toBe(dominantScene);
    });
  });

  it('encerra a residência GPU de cada cena depois da sua janela de saída', () => {
    expect(deriveAlvoradaVisualState(0).cityResident).toBe(false);
    expect(deriveAlvoradaVisualState(0.75).cityResident).toBe(true);
    expect(deriveAlvoradaVisualState(6.1).earthResident).toBe(false);
    expect(deriveAlvoradaVisualState(11.2).cityResident).toBe(false);
    expect(deriveAlvoradaVisualState(6.79).titleResident).toBe(false);
    expect(deriveAlvoradaVisualState(6.8).titleResident).toBe(true);

    sampleAuthoredJourney().forEach(({ elapsed, state }) => {
      if (elapsed >= 6.1) expect(state.earthResident).toBe(false);
      if (elapsed >= 11.2) {
        expect(state.cityResident).toBe(false);
        expect(state.cityVisible).toBe(false);
      }
    });
  });

  it('resolve o quadro final sem Terra, cidade ou máscara de transição', () => {
    [12.4, 30, Number.POSITIVE_INFINITY].forEach((elapsed) => {
      expect(deriveAlvoradaVisualState(elapsed)).toMatchObject({
        dominantScene: 'title',
        earthOpacity: 0,
        cityVisible: false,
        skyOpacity: 1,
        transitionOpacity: 0,
        titleProgress: 1,
        earthResident: false,
        cityResident: false,
        titleResident: true,
      });
    });
  });
});
