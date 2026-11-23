import type * as THREE from 'three';

export interface GroundAppearance {
  warm: boolean;
  grass: THREE.Texture | null;
  woodland: THREE.Texture | null;
  cover: THREE.Texture | null;
}

const classic: GroundAppearance = { warm: false, grass: null, woodland: null, cover: null };
type Listener = (appearance: GroundAppearance) => void;
const states = new WeakMap<THREE.WebGLRenderer, { value: GroundAppearance; listeners: Set<Listener> }>();
function stateFor(renderer: THREE.WebGLRenderer) {
  let state = states.get(renderer);
  if (!state) states.set(renderer, state = { value: classic, listeners: new Set() });
  return state;
}

/** The public viewer and a management canvas can use the same shared material.
 * Keep its per-program uniforms bound to the renderer which compiled it. */
export function bindParkGroundAppearance(renderer: THREE.WebGLRenderer, listener: Listener) {
  const state = stateFor(renderer);
  listener(state.value);
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

export function setParkGroundAppearance(renderer: THREE.WebGLRenderer, appearance: GroundAppearance) {
  const state = stateFor(renderer);
  state.value = appearance;
  state.listeners.forEach(listener => listener(appearance));
}
