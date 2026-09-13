import { measureCommercialMapStage, markCommercialMapStage } from './performanceDiagnostics';
import * as THREE from 'three';
import { useCommercialMapStore } from '../state/useCommercialMapStore';

const pending = new WeakMap<THREE.WebGLRenderer, object>();
const criticalPost = new WeakMap<THREE.WebGLRenderer, {
  ticket: object; objects: THREE.Object3D[]; ready: boolean;
}>();

export const isCommercialSceneCompiling = (renderer: THREE.WebGLRenderer) => pending.has(renderer);
/** Unmanaged renderers retain the existing standalone compositor behavior. */
export const isCommercialMapPostReady = (renderer: THREE.WebGLRenderer) => criticalPost.get(renderer)?.ready ?? true;

function renderObjects(root: THREE.Object3D) {
  const variants = new Map<string, THREE.Object3D>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh & { isInstancedMesh?: boolean; instanceColor?: unknown; isSkinnedMesh?: boolean; isBatchedMesh?: boolean };
    if (!mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const key = `${materials.map((material) => material.uuid).join(',')}:${Boolean(mesh.isInstancedMesh)}:${Boolean(mesh.instanceColor)}:${Boolean(mesh.isSkinnedMesh)}:${Boolean(mesh.isBatchedMesh)}:${object.type}`;
    if (!variants.has(key)) variants.set(key, object);
  });
  return [...variants.values()];
}

/** The usable first view and every gesture share one critical DIRECT variant.
 * compileAsync polls KHR_parallel_shader_compile, leaving the UI thread available.
 * No visibility, camera, materials or geometry are changed to prepare the scene. */
export function prepareCommercialScene(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, signal?: AbortSignal) {
  const ticket = {};
  pending.set(renderer, ticket);
  criticalPost.set(renderer, { ticket, objects: renderObjects(scene), ready: false });
  const compile = (offscreen: boolean) => {
    const target = renderer.getRenderTarget();
    const face = renderer.getActiveCubeFace();
    const level = renderer.getActiveMipmapLevel();
    const toneMapping = renderer.toneMapping;
    const outputColorSpace = renderer.outputColorSpace;
    const startedAt = performance.now();
    try {
      renderer.setRenderTarget(null);
      renderer.toneMapping = offscreen ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      return measureCommercialMapStage(offscreen ? 'compile-post' : 'compile-direct', () => compileCommercialMapPrograms(renderer, scene, camera, scene, signal));
    } catch (error) {
      return Promise.reject(error);
    } finally {
      markCommercialMapStage(offscreen ? 'compile-post-js' : 'compile-direct-js', performance.now() - startedAt);
      renderer.toneMapping = toneMapping;
      renderer.outputColorSpace = outputColorSpace;
      renderer.setRenderTarget(target, face, level);
    }
  };
  return compile(false).finally(() => {
    if (pending.get(renderer) === ticket) pending.delete(renderer);
  });
}

/** Three r170 compileAsync polls material.currentProgram, which the live DIRECT
 * renderer changes while POST warms. Capture each actual program immediately
 * after compile(), then poll those fixed programs instead of mutable materials. */
export function compileCommercialMapPrograms(
  renderer: THREE.WebGLRenderer, objects: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene,
  signal?: AbortSignal,
) {
  if (signal?.aborted) return Promise.reject(new DOMException('Shader preparation cancelled', 'AbortError'));
  const materials = renderer.compile(objects, camera, scene);
  const programs = new Set<{ isReady: () => boolean }>();
  materials.forEach((material) => {
    const properties = renderer.properties.get(material) as { currentProgram?: { isReady: () => boolean } };
    const program = properties.currentProgram;
    if (program) programs.add(program);
  });
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      programs.clear();
      reject(new DOMException('Shader preparation cancelled', 'AbortError'));
    };
    const check = () => {
      if (signal?.aborted) { abort(); return; }
      try {
        for (const program of programs) if (program.isReady()) programs.delete(program);
      } catch (error) {
        cleanup();
        programs.clear();
        reject(error);
        return;
      }
      if (!programs.size) { cleanup(); resolve(); }
      else timer = setTimeout(check, 10);
    };
    signal?.addEventListener('abort', abort, { once: true });
    check();
  });
}

/** Only the pre-hydration snapshot belongs to this job. Optional layers retain
 * their own preparation, and the global first-draw gate is never acquired. */
export async function prepareCommercialMapCriticalPost(
  renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, signal?: AbortSignal,
) {
  const preparation = criticalPost.get(renderer);
  if (!preparation || preparation.ready) return;
  markCommercialMapStage('critical-post:start');
  await prepareObjectVariants(renderer, preparation.objects, scene, camera, [true], signal);
  if (signal?.aborted || criticalPost.get(renderer) !== preparation) return;
  preparation.ready = true;
  markCommercialMapStage('critical-post:end');
}

function nextPreparationSlot(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let idle: number | undefined;
    const abort = () => {
      clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      reject(new Error('Layer preparation cancelled'));
    };
    const attempt = () => {
      if (signal?.aborted) { abort(); return; }
      if (typeof document !== 'undefined' && (document.hidden || useCommercialMapStore.getState().cameraNavigating)) {
        timer = setTimeout(attempt, 120); return;
      }
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idle = window.requestIdleCallback(attempt, { timeout: 500 });
    } else timer = setTimeout(attempt, 16);
  });
}

/** Compile only the newly admitted layer, using the real world's stable lights.
 * Existing meshes never move, change visibility or lose their parent. Deduplicate
 * identical material/instancing variants, then yield between small compile batches.
 * This does not own the global boot gate: the already usable map keeps rendering. */
export async function prepareCommercialSceneLayer(
  renderer: THREE.WebGLRenderer,
  layer: THREE.Object3D,
  scene: THREE.Scene,
  camera: THREE.Camera,
  signal?: AbortSignal,
) {
  return prepareObjectVariants(renderer, renderObjects(layer), scene, camera, [false, true], signal);
}

async function prepareObjectVariants(
  renderer: THREE.WebGLRenderer, objects: THREE.Object3D[], scene: THREE.Scene,
  camera: THREE.Camera, offscreenVariants: boolean[], signal?: AbortSignal,
) {
  if (!objects.length) return;
  const linearTarget = new THREE.WebGLRenderTarget(1, 1);
  const batch = new THREE.Group();
  try {
    for (let start = 0; start < objects.length; start += 8) {
      batch.children = objects.slice(start, start + 8);
      for (const offscreen of offscreenVariants) {
        await nextPreparationSlot(signal);
        const target = renderer.getRenderTarget();
        const face = renderer.getActiveCubeFace();
        const level = renderer.getActiveMipmapLevel();
        const toneMapping = renderer.toneMapping;
        const outputColorSpace = renderer.outputColorSpace;
        let compilation: Promise<void>;
        const startedAt = performance.now();
        try {
          renderer.setRenderTarget(offscreen ? linearTarget : null);
          renderer.toneMapping = offscreen ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
          renderer.outputColorSpace = THREE.SRGBColorSpace;
          compilation = compileCommercialMapPrograms(renderer, batch, camera, scene, signal);
        } finally {
          renderer.toneMapping = toneMapping;
          renderer.outputColorSpace = outputColorSpace;
          renderer.setRenderTarget(target, face, level);
          markCommercialMapStage('deferred-compile-js', performance.now() - startedAt);
        }
        await compilation;
      }
    }
  } finally {
    batch.children = [];
    linearTarget.dispose();
  }
}
