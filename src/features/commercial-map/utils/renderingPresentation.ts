import { Effect, Pass } from 'postprocessing';
import * as THREE from 'three';

/** Every public map frame ends at the screen, never at a retired HDR target. */
export function bindCommercialMapScreen(renderer: THREE.WebGLRenderer, width: number, height: number) {
  renderer.setRenderTarget(null);
  renderer.setViewport(0, 0, width, height);
  renderer.setScissor(0, 0, width, height);
  renderer.setScissorTest(false);
}

/** Only walk owned post-processing resources; never traverse the live scene. */
export function collectCommercialMapRenderTargets(resources: readonly unknown[]) {
  const targets = new Set<THREE.WebGLRenderTarget>();
  const visited = new Set<unknown>();
  const visit = (value: unknown) => {
    if (!value || visited.has(value)) return;
    visited.add(value);
    if (value instanceof THREE.WebGLRenderTarget) targets.add(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value instanceof Pass || value instanceof Effect) Object.values(value).forEach(visit);
  };
  resources.forEach(visit);
  return [...targets];
}

/** WebGL framebuffer errors are status codes, not JavaScript exceptions. */
export function validateCommercialMapRenderTargets(
  renderer: THREE.WebGLRenderer,
  targets: readonly THREE.WebGLRenderTarget[],
) {
  const context = renderer.getContext();
  if (context.isContextLost()) throw new Error('context-lost');
  for (const target of targets) {
    // Binding forces Three to allocate its otherwise lazy framebuffer.
    renderer.setRenderTarget(target);
    if (context.checkFramebufferStatus(context.FRAMEBUFFER) !== context.FRAMEBUFFER_COMPLETE) {
      throw new Error('framebuffer-incomplete');
    }
  }
}
