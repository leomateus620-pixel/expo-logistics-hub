import { createContext, useContext, type MutableRefObject } from 'react';
import type { AlvoradaTimelineState } from './timeline';

export const AlvoradaTimelineContext = createContext<MutableRefObject<AlvoradaTimelineState> | null>(null);

export function useAlvoradaTimeline() {
  const timeline = useContext(AlvoradaTimelineContext);
  if (!timeline) throw new Error('Cena Alvorada fora do controlador de timeline.');
  return timeline;
}
