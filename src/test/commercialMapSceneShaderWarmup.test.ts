import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { isCommercialSceneCompiling, prepareCommercialScene } from '@/features/commercial-map/utils/sceneShaderWarmup';

function rendererFixture() {
  let target: THREE.WebGLRenderTarget | null = new THREE.WebGLRenderTarget(2, 2);
  const initialTarget = target;
  const pending: { resolve: () => void; reject: (error: Error) => void }[] = [];
  const states: { tone: number; target: THREE.WebGLRenderTarget | null }[] = [];
  const gl = {
    toneMapping: THREE.ReinhardToneMapping, outputColorSpace: THREE.LinearSRGBColorSpace,
    getRenderTarget: () => target, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    setRenderTarget: vi.fn((value) => { target = value; }),
    compileAsync: vi.fn(() => {
      states.push({ tone: gl.toneMapping, target });
      return new Promise<void>((resolve, reject) => pending.push({ resolve, reject }));
    }),
  };
  return { gl: gl as unknown as THREE.WebGLRenderer, initialTarget, pending, states };
}

describe('non-rendering commercial scene preparation', () => {
  it('restores renderer state immediately, waits for each shader variant, never renders or toggles visibility', async () => {
    const { gl, initialTarget, pending, states } = rendererFixture();
    const scene = new THREE.Scene();
    const hidden = new THREE.Mesh(); hidden.visible = false; scene.add(hidden);
    const promise = prepareCommercialScene(gl, scene, new THREE.PerspectiveCamera());
    expect(isCommercialSceneCompiling(gl)).toBe(true);
    expect(states).toEqual([{ tone: THREE.ACESFilmicToneMapping, target: null }]);
    expect(gl.getRenderTarget()).toBe(initialTarget);
    expect(gl.toneMapping).toBe(THREE.ReinhardToneMapping);
    pending[0].resolve(); for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(states[1].tone).toBe(THREE.NoToneMapping);
    expect(states[1].target?.width).toBe(1);
    const dispose = vi.spyOn(states[1].target!, 'dispose');
    expect(isCommercialSceneCompiling(gl)).toBe(true);
    pending[1].resolve(); await promise;
    expect(dispose).toHaveBeenCalledOnce();
    expect(isCommercialSceneCompiling(gl)).toBe(false);
    expect(hidden.visible).toBe(false);
    expect(gl.getRenderTarget()).toBe(initialTarget);
    expect(gl.outputColorSpace).toBe(THREE.LinearSRGBColorSpace);
    hidden.geometry.dispose(); (hidden.material as THREE.Material).dispose(); initialTarget?.dispose();
  });
  it('releases the frame gate on failure so existing recovery can take over', async () => {
    const { gl, pending, initialTarget } = rendererFixture();
    const promise = prepareCommercialScene(gl, new THREE.Scene(), new THREE.Camera());
    pending[0].reject(new Error('context lost'));
    await expect(promise).rejects.toThrow('context lost');
    expect(isCommercialSceneCompiling(gl)).toBe(false);
    expect(gl.getRenderTarget()).toBe(initialTarget);
    initialTarget?.dispose();
  });
  it('does not let an obsolete context preparation compile again or unlock its successor', async () => {
    const { gl, pending, initialTarget } = rendererFixture();
    const scene = new THREE.Scene(); const camera = new THREE.Camera();
    const old = prepareCommercialScene(gl, scene, camera);
    const current = prepareCommercialScene(gl, scene, camera);
    pending[0].resolve(); await old;
    expect(gl.compileAsync).toHaveBeenCalledTimes(2);
    expect(isCommercialSceneCompiling(gl)).toBe(true);
    pending[1].resolve(); for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(gl.compileAsync).toHaveBeenCalledTimes(3);
    pending[2].resolve(); await current;
    expect(isCommercialSceneCompiling(gl)).toBe(false);
    initialTarget?.dispose();
  });
});
