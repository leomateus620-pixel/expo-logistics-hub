import type { ExecutiveCharacterId } from '../data/executiveCharacters';

export type ExecutiveInteractionPhase = 'walking' | 'orienting' | 'waving' | 'cooldown';

export interface ExecutiveInteractionState {
  phase: ExecutiveInteractionPhase;
  phaseStartedAt: number;
  lastWaveEndedAt: number;
  waveCount: number;
  waveActor: ExecutiveCharacterId;
}

export interface ExecutiveInteractionObservation {
  now: number;
  cameraDistance: number;
  projectedCharacterHeight: number;
  inView: boolean;
  reducedMotion: boolean;
}

export const EXECUTIVE_INTERACTION_TIMING = {
  proximityEnter: 2.8,
  proximityExit: 3.35,
  projectedHeightEnter: 0.115,
  orientDuration: 0.9,
  waveDuration: 1.48,
  cooldownDuration: 2.2,
  repeatCooldown: 11.5,
} as const;

export function createExecutiveInteractionState(now = 0): ExecutiveInteractionState {
  return {
    phase: 'walking',
    phaseStartedAt: now,
    lastWaveEndedAt: Number.NEGATIVE_INFINITY,
    waveCount: 0,
    waveActor: 'fabiano-soltis',
  };
}

function userIsNear(
  state: ExecutiveInteractionState,
  observation: ExecutiveInteractionObservation,
) {
  const distanceThreshold = state.phase === 'walking'
    ? EXECUTIVE_INTERACTION_TIMING.proximityEnter
    : EXECUTIVE_INTERACTION_TIMING.proximityExit;
  return observation.inView && (
    observation.cameraDistance <= distanceThreshold
    || observation.projectedCharacterHeight >= EXECUTIVE_INTERACTION_TIMING.projectedHeightEnter
  );
}

export function advanceExecutiveInteraction(
  state: ExecutiveInteractionState,
  observation: ExecutiveInteractionObservation,
): ExecutiveInteractionState {
  if (observation.reducedMotion) {
    return state.phase === 'walking'
      ? state
      : { ...state, phase: 'walking', phaseStartedAt: observation.now };
  }
  const elapsed = Math.max(0, observation.now - state.phaseStartedAt);
  const near = userIsNear(state, observation);

  if (state.phase === 'walking') {
    if (!near || observation.now - state.lastWaveEndedAt < EXECUTIVE_INTERACTION_TIMING.repeatCooldown) return state;
    return { ...state, phase: 'orienting', phaseStartedAt: observation.now };
  }
  if (state.phase === 'orienting') {
    if (!near) return { ...state, phase: 'walking', phaseStartedAt: observation.now };
    if (elapsed < EXECUTIVE_INTERACTION_TIMING.orientDuration) return state;
    return { ...state, phase: 'waving', phaseStartedAt: observation.now };
  }
  if (state.phase === 'waving') {
    if (elapsed < EXECUTIVE_INTERACTION_TIMING.waveDuration) return state;
    return {
      ...state,
      phase: 'cooldown',
      phaseStartedAt: observation.now,
      lastWaveEndedAt: observation.now,
      waveCount: state.waveCount + 1,
      waveActor: state.waveActor === 'fabiano-soltis' ? 'djeison-drey' : 'fabiano-soltis',
    };
  }
  if (elapsed < EXECUTIVE_INTERACTION_TIMING.cooldownDuration) return state;
  return { ...state, phase: 'walking', phaseStartedAt: observation.now };
}

export function executiveMovementSpeedMultiplier(
  state: ExecutiveInteractionState,
  now: number,
) {
  if (state.phase === 'walking') return 1;
  if (state.phase === 'orienting') {
    const progress = Math.min(1, Math.max(0, (now - state.phaseStartedAt) / EXECUTIVE_INTERACTION_TIMING.orientDuration));
    return 1 - progress;
  }
  if (state.phase === 'waving') return 0;
  const progress = Math.min(1, Math.max(0, (now - state.phaseStartedAt) / EXECUTIVE_INTERACTION_TIMING.cooldownDuration));
  return progress;
}

export function executiveViewerOrientationWeight(state: ExecutiveInteractionState) {
  if (state.phase === 'walking') return 0;
  if (state.phase === 'orienting') return 0.72;
  if (state.phase === 'waving') return 1;
  return 0.42;
}
