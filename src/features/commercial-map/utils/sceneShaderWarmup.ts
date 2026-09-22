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

/** Use the admitted map renderer, never a speculative context. Upload known
 * textures while the driver is linking programs instead of piling every upload
 * into the first draw. Two uploads per task bound admission on slower devices. */
export async function prepareCommercialMapTextures(renderer: THREE.WebGLRenderer, objects: THREE.Object3D[], signal?: AbortSignal) {
  if (!renderer.initTexture) return; // minimal diagnostic renderer fixtures
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  const collect = (value: unknown) => {
    if (!(value instanceof THREE.Texture) || value.isRenderTargetTexture || !value.image
      || (value as THREE.VideoTexture).isVideoTexture || value.version === 0) return;
    textures.add(value);
  };
  for (const object of objects) {
    const material = (object as THREE.Mesh).material;
    for (const value of Array.isArray(material) ? material : [material]) if (value) materials.add(value);
  }
  for (const material of materials) {
    Object.values(material).forEach(collect);
    if ('uniforms' in material) for (const uniform of Object.values((material as THREE.ShaderMaterial).uniforms)) {
      if (Array.isArray(uniform.value)) uniform.value.forEach(collect); else collect(uniform.value);
    }
  }
  markCommercialMapStage('texture-upload:start', undefined, undefined, { count: textures.size });
  let uploads = 0;
  for (const texture of textures) {
    if (uploads % 2 === 0) await nextPreparationSlot(signal);
    if (signal?.aborted) throw new DOMException('Texture preparation cancelled', 'AbortError');
    renderer.initTexture(texture);
    uploads++;
  }
  markCommercialMapStage('texture-upload:end', undefined, undefined, { count: uploads });
}

export function commercialMapShaderRepresentatives(root: THREE.Object3D) {
  const variants = new Map<string, THREE.Object3D>();
  const geometryKeys = new WeakMap<THREE.BufferGeometry, string>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh & { isInstancedMesh?: boolean; instanceColor?: unknown; morphTexture?: unknown; isSkinnedMesh?: boolean; isBatchedMesh?: boolean; _colorsTexture?: unknown };
    if (!mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    // Equal materials on different color/tangent/morph attributes can require
    // different programs. Vertex count/positions don't change a shader program.
    let geometryKey = mesh.geometry ? geometryKeys.get(mesh.geometry) : '';
    if (mesh.geometry && geometryKey === undefined) {
      geometryKey = JSON.stringify([
        Object.entries(mesh.geometry.attributes).sort(([a], [b]) => a.localeCompare(b))
          .map(([name, attribute]) => [name, attribute.itemSize, attribute.normalized, attribute.array.constructor.name]),
        Object.entries(mesh.geometry.morphAttributes).sort(([a], [b]) => a.localeCompare(b))
          .map(([name, attributes]) => [name, attributes?.length]), mesh.geometry.morphTargetsRelative,
      ]);
      geometryKeys.set(mesh.geometry, geometryKey);
    }
    const key = `${materials.map((material) => material.uuid).join(',')}:${geometryKey}:${Boolean(mesh.isInstancedMesh)}:${Boolean(mesh.instanceColor)}:${Boolean(mesh.morphTexture)}:${Boolean(mesh.isSkinnedMesh)}:${Boolean(mesh.isBatchedMesh)}:${Boolean(mesh._colorsTexture)}:${object.type}:${object.receiveShadow}`;
    if (!variants.has(key)) variants.set(key, object);
  });
  return [...variants.values()];
}

function shaderBatch<T extends THREE.Object3D>(batch: T): T {
  // A compile-only view: every renderable already appears in the flat snapshot.
  // Recursing their real children would compile duplicates and gather child
  // lights twice (the unchanged target scene already supplies every light).
  batch.traverse = callback => { callback(batch); for (const object of batch.children) callback(object); };
  batch.traverseVisible = callback => { if (batch.visible) callback(batch); };
  return batch;
}

/** The usable first view and every gesture share one critical DIRECT variant.
 * compileAsync polls KHR_parallel_shader_compile, leaving the UI thread available.
 * No visibility, camera, materials or geometry are changed to prepare the scene. */
export function prepareCommercialScene(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, signal?: AbortSignal) {
  const ticket = {};
  pending.set(renderer, ticket);
  const objects = commercialMapShaderRepresentatives(scene);
  criticalPost.set(renderer, { ticket, objects, ready: false });
  const representatives = shaderBatch(new THREE.Scene());
  // Compile traverses object references; no add(), reparenting or scene mutation.
  representatives.children = objects;
  markCommercialMapStage('shader-representatives', undefined, undefined, { count: objects.length });
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
      return measureCommercialMapStage(offscreen ? 'compile-post' : 'compile-direct', () => compileCommercialMapPrograms(renderer, representatives, camera, scene, signal));
    } catch (error) {
      return Promise.reject(error);
    } finally {
      markCommercialMapStage(offscreen ? 'compile-post-js' : 'compile-direct-js', performance.now() - startedAt);
      renderer.toneMapping = toneMapping;
      renderer.outputColorSpace = outputColorSpace;
      renderer.setRenderTarget(target, face, level);
    }
  };
  // The real first-draw barrier still waits for every required program/upload.
  return Promise.all([compile(false), prepareCommercialMapTextures(renderer, objects, signal)]).then(() => undefined).finally(() => {
    representatives.children = [];
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
    const properties = renderer.properties.get(material) as {
      currentProgram?: { isReady: () => boolean };
      programs?: Map<string, { isReady: () => boolean }>;
    };
    // One shared material can compile instanced/plain, morph or double-sided
    // variants in a single call. currentProgram alone misses all but the last.
    if (properties.programs) properties.programs.forEach(program => programs.add(program));
    else if (properties.currentProgram) programs.add(properties.currentProgram);
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
      signal?.removeEventListener('abort', abort);
      reject(new DOMException('Layer preparation cancelled', 'AbortError'));
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
  return prepareObjectVariants(renderer, commercialMapShaderRepresentatives(layer), scene, camera, [false, true], signal);
}

async function prepareObjectVariants(
  renderer: THREE.WebGLRenderer, objects: THREE.Object3D[], scene: THREE.Scene,
  camera: THREE.Camera, offscreenVariants: boolean[], signal?: AbortSignal,
) {
  if (!objects.length) return;
  const linearTarget = new THREE.WebGLRenderTarget(1, 1);
  const batch = shaderBatch(new THREE.Group());
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
