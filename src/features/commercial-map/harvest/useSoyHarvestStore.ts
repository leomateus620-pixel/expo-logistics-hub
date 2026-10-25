import { create } from 'zustand';
import { createSoyPlaybackClock, SOY_HARVEST_DURATION, SOY_HARVEST_PHASES, soyPhaseAt, tickSoyPlaybackClock, type SoyHarvestPhase } from './soyHarvestTimeline';

export type SoyHarvestStatus = 'idle' | 'loading' | 'running' | 'paused' | 'completed' | 'restoring' | 'error';
export const soyHarvestClock = createSoyPlaybackClock();
let startGuard: (() => string | null) | null = null;
let beforeStart: (() => void) | null = null;
/** Host scope/mode checks stay outside this store to avoid map/visit cycles. */
export function setSoyHarvestStartGuard(guard: (() => string | null) | null) { startGuard = guard; }
/** Capture the existing camera before notifying any React/Zustand subscriber.
 * Another root may commit disabled controls as soon as loading is published. */
export function registerSoyHarvestBeforeStart(capture: () => void) {
  beforeStart = capture;
  return () => { if (beforeStart === capture) beforeStart = null; };
}
/** Shared by the light field and lazy runtime, with no React updates per frame. */
export const soyFieldFrame = { time: 0, mode: 'green' as 'green' | 'cycle' | 'harvested',
  sown: [0, 0, 0] as [number, number, number], harvested: [0, 0, 0] as [number, number, number], growth: 0, maturity: 0 };
interface SoyHarvestState {
  status: SoyHarvestStatus; enabled: boolean; loaded: boolean; session: number;
  phase: SoyHarvestPhase; seconds: number; error: string | null;
  fieldState: 'green' | 'cycle' | 'harvested'; reducedMotion: boolean;
  requestStart: () => boolean; ready: (session: number) => void;
  pause: () => void; resume: () => void; cancel: () => void;
  returnToMap: () => void; finishRestore: () => void; restoreField: () => void;
  replay: () => void; fail: (message: string) => void; seekStage: (direction: -1 | 1) => void;
}
function resetClock() { soyHarvestClock.elapsed = 0; soyHarvestClock.lastNow = null; soyFieldFrame.time = 0; }
function restoreGreen() { resetClock(); soyFieldFrame.mode = 'green'; }

export const useSoyHarvestStore = create<SoyHarvestState>((set, get) => ({
  status: 'idle', enabled: false, loaded: false, session: 0, phase: 'planting', seconds: 0,
  error: null, fieldState: 'green', reducedMotion: false,
  requestStart: () => {
    const state = get();
    if (['loading', 'running', 'paused', 'restoring'].includes(state.status)) return false;
    const unavailable = startGuard?.();
    if (unavailable) { set({ error: unavailable }); return false; }
    beforeStart?.();
    resetClock(); soyFieldFrame.mode = 'green';
    set({ status: 'loading', enabled: true, loaded: true, session: state.session + 1,
      fieldState: 'green', phase: 'planting', seconds: 0, error: null,
      reducedMotion: typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) });
    return true;
  },
  ready: session => {
    if (get().status !== 'loading' || get().session !== session) return;
    resetClock(); soyFieldFrame.mode = 'cycle';
    set({ status: typeof document !== 'undefined' && document.hidden ? 'paused' : 'running', fieldState: 'cycle' });
  },
  pause: () => {
    if (get().status !== 'running') return;
    tickSoyPlaybackClock(soyHarvestClock, performance.now(), true);
    soyFieldFrame.time = soyHarvestClock.elapsed; soyHarvestClock.lastNow = null;
    set({ status: 'paused', seconds: Math.floor(soyHarvestClock.elapsed), phase: soyPhaseAt(soyHarvestClock.elapsed).id });
  },
  resume: () => {
    if (get().status !== 'paused' || (typeof document !== 'undefined' && document.hidden)) return;
    soyHarvestClock.lastNow = null; set({ status: 'running' });
  },
  cancel: () => {
    const wasEnabled = get().enabled; restoreGreen();
    set({ status: wasEnabled ? 'restoring' : 'idle', enabled: false, fieldState: 'green', error: null, seconds: 0 });
  },
  returnToMap: () => {
    if (get().status !== 'completed') { get().cancel(); return; }
    soyHarvestClock.lastNow = null;
    set({ status: 'restoring', enabled: false });
  },
  finishRestore: () => {
    if (get().status !== 'restoring') return;
    set({ status: get().fieldState === 'harvested' ? 'completed' : 'idle' });
  },
  restoreField: () => { restoreGreen(); set({ status: get().enabled ? 'restoring' : 'idle', enabled: false, fieldState: 'green', seconds: 0 }); },
  replay: () => { if (get().status === 'completed' || get().status === 'error') get().requestStart(); },
  fail: error => { restoreGreen(); set({ status: 'error', enabled: false, fieldState: 'green', error }); },
  seekStage: direction => {
    if (!get().reducedMotion || !['running', 'paused'].includes(get().status)) return;
    const current = SOY_HARVEST_PHASES.findIndex(phase => phase.id === soyPhaseAt(soyHarvestClock.elapsed).id);
    const stage = SOY_HARVEST_PHASES[Math.min(6, Math.max(0, current + direction))];
    soyHarvestClock.elapsed = stage.start; soyHarvestClock.lastNow = null; soyFieldFrame.time = stage.start;
    set({ status: 'paused', phase: stage.id, seconds: stage.start });
  },
}));

export function advanceSoyHarvestClock(nowMs: number) {
  const state = useSoyHarvestStore.getState();
  const time = tickSoyPlaybackClock(soyHarvestClock, nowMs, state.status === 'running');
  soyFieldFrame.time = time;
  if (state.status !== 'running') return time;
  const phase = soyPhaseAt(time).id, seconds = Math.floor(time);
  if (time >= SOY_HARVEST_DURATION) {
    soyFieldFrame.mode = 'harvested'; soyHarvestClock.lastNow = null;
    useSoyHarvestStore.setState({ status: 'completed', fieldState: 'harvested', seconds: SOY_HARVEST_DURATION, phase });
  } else if (phase !== state.phase || seconds !== state.seconds) useSoyHarvestStore.setState({ phase, seconds });
  return time;
}
