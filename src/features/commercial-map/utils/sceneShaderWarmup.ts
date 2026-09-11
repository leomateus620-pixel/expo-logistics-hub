import { measureCommercialMapStage, markCommercialMapStage } from './performanceDiagnostics';
import * as THREE from 'three';

const pending = new WeakMap<THREE.WebGLRenderer, object>();

export const isCommercialSceneCompiling = (renderer: THREE.WebGLRenderer) => pending.has(renderer);

/** Warm the actual screen and compositor variants without drawing six cube faces.
 * compileAsync polls KHR_parallel_shader_compile, leaving the UI thread available.
 * No visibility, camera, materials or geometry are changed to prepare the scene. */
export function prepareCommercialScene(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const ticket = {};
  pending.set(renderer, ticket);
  const linearTarget = new THREE.WebGLRenderTarget(1, 1);
  const compile = (offscreen: boolean) => {
    const target = renderer.getRenderTarget();
    const face = renderer.getActiveCubeFace();
    const level = renderer.getActiveMipmapLevel();
    const toneMapping = renderer.toneMapping;
    const outputColorSpace = renderer.outputColorSpace;
    const startedAt = performance.now();
    try {
      renderer.setRenderTarget(offscreen ? linearTarget : null);
      renderer.toneMapping = offscreen ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      return measureCommercialMapStage(offscreen ? 'compile-post' : 'compile-direct', () => renderer.compileAsync(scene, camera));
    } catch (error) {
      return Promise.reject(error);
    } finally {
      markCommercialMapStage(offscreen ? 'compile-post-js' : 'compile-direct-js', performance.now() - startedAt);
      renderer.toneMapping = toneMapping;
      renderer.outputColorSpace = outputColorSpace;
      renderer.setRenderTarget(target, face, level);
    }
  };
  // r170 polls material.currentProgram. Finish one variant before changing it.
  return compile(false).then(() => pending.get(renderer) === ticket ? compile(true) : undefined).finally(() => {
    linearTarget.dispose();
    if (pending.get(renderer) === ticket) pending.delete(renderer);
  });
}
