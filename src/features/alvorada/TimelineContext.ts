import { createContext, useContext, type MutableRefObject } from 'react';
import type { AlvoradaTimelineState } from './timeline';
import type { AlvoradaPreparationEvent } from './types';

export const AlvoradaTimelineContext = createContext<MutableRefObject<AlvoradaTimelineState> | null>(null);

export function useAlvoradaTimeline() {
  const timeline = useContext(AlvoradaTimelineContext);
  if (!timeline) throw new Error('Cena Alvorada fora do controlador de timeline.');
  return timeline;
}

/**
 * Readiness shared by the scene and the master clock: the clock only starts
 * once the critical assets are bound, and every preparation milestone is
 * forwarded to the host without React state updates inside the frame loop.
 */
export interface AlvoradaSceneReadiness {
  criticalAssetsReady: boolean;
  report: (event: AlvoradaPreparationEvent) => void;
}

export const AlvoradaReadinessContext = createContext<MutableRefObject<AlvoradaSceneReadiness> | null>(null);

export function useAlvoradaReadiness() {
  const readiness = useContext(AlvoradaReadinessContext);
  if (!readiness) throw new Error('Cena Alvorada fora do controlador de prontidão.');
  return readiness;
}
