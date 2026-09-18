import { useCallback, useSyncExternalStore } from 'react';
import type { BufferGeometry, MeshStandardMaterial, Scene } from 'three';

export interface ContinuousGroundSurface {
  /** Borrowed material: only CommercialMapEnvironment owns/disposes it. */
  material: MeshStandardMaterial;
  center: readonly [number, number];
  size: number;
}
interface SurfaceSlot {
  current: ContinuousGroundSurface | null;
  listeners: Set<() => void>;
}
const surfaces = new WeakMap<Scene, SurfaceSlot>();
function slot(scene: Scene) {
  let value = surfaces.get(scene);
  if (!value) { value = { current: null, listeners: new Set() }; surfaces.set(scene, value); }
  return value;
}

/** Scene-local ownership handles deferred mounting, resize and quality changes.
 * Publishing references never allocates/disposes a GPU material or texture.
 */
export function publishContinuousGround(scene: Scene, ground: ContinuousGroundSurface) {
  const state = slot(scene);
  state.current = ground;
  state.listeners.forEach(listener => listener());
  return () => {
    if (state.current !== ground) return;
    state.current = null;
    state.listeners.forEach(listener => listener());
  };
}

export function readContinuousGround(scene: Scene) { return slot(scene).current; }

export function useContinuousGround(scene: Scene) {
  const subscribe = useCallback((listener: () => void) => {
    const state = slot(scene);
    state.listeners.add(listener);
    return () => { state.listeners.delete(listener); };
  }, [scene]);
  const snapshot = useCallback(() => readContinuousGround(scene), [scene]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Match the UV phase of the existing horizontal base plane exactly. Its
 * local +Y becomes world -Z under rotationX(-PI/2); repeating x/z alone would
 * change both phase and handedness and leave the seam visible.
 */
export function alignContinuousGroundUv(geometry: BufferGeometry, ground: Pick<ContinuousGroundSurface, 'center' | 'size'>) {
  const positions = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  if (!positions || !uv || ground.size <= 0) return;
  for (let i = 0; i < positions.count; i++) {
    uv.setXY(i, 0.5 + (positions.getX(i) - ground.center[0]) / ground.size,
      0.5 - (positions.getZ(i) - ground.center[1]) / ground.size);
  }
  uv.needsUpdate = true;
}
