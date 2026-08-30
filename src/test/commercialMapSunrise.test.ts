import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';

describe('controle do amanhecer do Mapa Comercial', () => {
  beforeEach(() => {
    useCommercialMapStore.setState(useCommercialMapStore.getInitialState(), true);
  });

  afterEach(() => {
    useCommercialMapStore.setState(useCommercialMapStore.getInitialState(), true);
  });

  it('inicia, conclui, repete e interrompe por uma única sequência determinística', () => {
    const initialSequence = useCommercialMapStore.getState().sunriseSequence;

    useCommercialMapStore.getState().requestSunrise();
    const firstRun = useCommercialMapStore.getState();
    expect(firstRun.sunrisePhase).toBe('running');
    expect(firstRun.sunriseSequence).toBe(initialSequence + 1);
    expect(firstRun.sunriseStartedAt).toEqual(expect.any(Number));

    firstRun.completeSunrise(firstRun.sunriseSequence + 1);
    expect(useCommercialMapStore.getState().sunrisePhase).toBe('running');

    useCommercialMapStore.getState().completeSunrise(firstRun.sunriseSequence);
    expect(useCommercialMapStore.getState()).toMatchObject({
      sunrisePhase: 'complete',
      sunriseSequence: firstRun.sunriseSequence,
      sunriseStartedAt: null,
    });

    useCommercialMapStore.getState().requestSunrise();
    const replay = useCommercialMapStore.getState();
    expect(replay.sunrisePhase).toBe('running');
    expect(replay.sunriseSequence).toBe(firstRun.sunriseSequence + 1);
    expect(replay.sunriseStartedAt).toEqual(expect.any(Number));

    replay.resetSunrise();
    expect(useCommercialMapStore.getState()).toMatchObject({
      sunrisePhase: 'idle',
      sunriseSequence: replay.sunriseSequence + 1,
      sunriseStartedAt: null,
    });
  });
});
