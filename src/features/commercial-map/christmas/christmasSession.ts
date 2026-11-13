import { create } from 'zustand';

type Phase = 'idle' | 'preparing' | 'flying' | 'greeting';

interface ChristmasCamera {
  acquire: (id: number) => boolean;
  release: (id: number, animate: boolean) => boolean;
}

interface ChristmasSession {
  id: number;
  phase: Phase;
  returning: boolean;
  start: (greetingOnly: boolean) => boolean;
  fly: (id: number) => void;
  greet: (id: number, animateReturn?: boolean) => void;
  close: (id: number) => void;
  finishReturn: (id: number) => void;
}

let camera: ChristmasCamera | null = null;
let acquiring = false;

export const useChristmasSession = create<ChristmasSession>((set, get) => ({
  id: 0,
  phase: 'idle',
  returning: false,
  start(greetingOnly) {
    if (get().phase !== 'idle' || acquiring) return false;
    const id = get().id + 1;
    let acquired = false;
    if (!greetingOnly && camera) {
      acquiring = true;
      try {
        acquired = camera.acquire(id);
      } catch {
        camera.release(id, false);
      } finally {
        acquiring = false;
      }
    }
    set({ id, phase: acquired ? 'preparing' : 'greeting', returning: false });
    return true;
  },
  fly(id) {
    const state = get();
    if (state.id === id && state.phase === 'preparing') set({ phase: 'flying' });
  },
  greet(id, animateReturn = false) {
    const state = get();
    if (state.id !== id || (state.phase !== 'preparing' && state.phase !== 'flying')) return;
    const returning = camera?.release(id, animateReturn) ?? false;
    set({ phase: 'greeting', returning });
  },
  close(id) {
    const state = get();
    if (state.id !== id || state.phase === 'idle') return;
    camera?.release(id, false);
    set({ phase: 'idle', returning: false });
  },
  finishReturn(id) {
    if (get().id === id && get().returning) set({ returning: false });
  },
}));

export function isChristmasCameraOwned() {
  const { phase, returning } = useChristmasSession.getState();
  return acquiring || returning || phase === 'preparing' || phase === 'flying';
}

export function registerChristmasCamera(lease: ChristmasCamera) {
  camera = lease;
  return () => {
    if (camera !== lease) return;
    const state = useChristmasSession.getState();
    state.greet(state.id);
    lease.release(state.id, false);
    state.finishReturn(state.id);
    camera = null;
  };
}
