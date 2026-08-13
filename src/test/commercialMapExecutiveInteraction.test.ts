import { describe, expect, it } from 'vitest';
import {
  EXECUTIVE_INTERACTION_TIMING,
  advanceExecutiveInteraction,
  createExecutiveInteractionState,
  executiveMovementSpeedMultiplier,
} from '@/features/commercial-map/utils/executiveInteraction';

const near = (now: number, reducedMotion = false) => ({
  now,
  cameraDistance: 1.8,
  projectedCharacterHeight: 0.18,
  inView: true,
  reducedMotion,
});

describe('interação de proximidade dos executivos', () => {
  it('desacelera, orienta, acena e volta à caminhada sem reação exagerada', () => {
    let state = createExecutiveInteractionState(0);
    state = advanceExecutiveInteraction(state, near(1));
    expect(state.phase).toBe('orienting');
    expect(executiveMovementSpeedMultiplier(state, 1.45)).toBeGreaterThan(0.39);
    expect(executiveMovementSpeedMultiplier(state, 1.45)).toBeLessThan(0.72);

    state = advanceExecutiveInteraction(state, near(1.01 + EXECUTIVE_INTERACTION_TIMING.orientDuration));
    expect(state.phase).toBe('waving');
    expect(executiveMovementSpeedMultiplier(state, 2.2)).toBe(0);
    const firstActor = state.waveActor;

    state = advanceExecutiveInteraction(state, near(3.5));
    expect(state.phase).toBe('cooldown');
    expect(state.waveActor).not.toBe(firstActor);

    state = advanceExecutiveInteraction(state, near(6));
    expect(state.phase).toBe('walking');
  });

  it('usa histerese e cooldown para não repetir o aceno em loop', () => {
    let state = createExecutiveInteractionState(0);
    state = advanceExecutiveInteraction(state, near(1));
    state = advanceExecutiveInteraction(state, near(2));
    state = advanceExecutiveInteraction(state, near(4));
    state = advanceExecutiveInteraction(state, near(7));
    expect(state.phase).toBe('walking');

    const blocked = advanceExecutiveInteraction(state, near(8));
    expect(blocked.phase).toBe('walking');

    const allowed = advanceExecutiveInteraction(state, near(
      state.lastWaveEndedAt + EXECUTIVE_INTERACTION_TIMING.repeatCooldown + 0.01,
    ));
    expect(allowed.phase).toBe('orienting');
  });

  it('honra movimento reduzido e não inicia caminhada/aceno automático', () => {
    const state = advanceExecutiveInteraction(createExecutiveInteractionState(0), near(2, true));
    expect(state.phase).toBe('walking');
  });

  it('ignora câmera distante ou personagem fora do enquadramento', () => {
    const state = createExecutiveInteractionState(0);
    expect(advanceExecutiveInteraction(state, {
      now: 3,
      cameraDistance: 12,
      projectedCharacterHeight: 0.01,
      inView: false,
      reducedMotion: false,
    })).toBe(state);
  });
});
