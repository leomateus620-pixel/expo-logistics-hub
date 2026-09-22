import { captureCommercialMapStageRecorder, measureCommercialMapStage, markCommercialMapStage, type CommercialMapStageRecorder } from './performanceDiagnostics';
import * as THREE from 'three';
import { useCommercialMapStore } from '../state/useCommercialMapStore';

const pending = new WeakMap<THREE.WebGLRenderer, object>();
const programPreparations = new WeakMap<THREE.WebGLRenderer, number>();
interface PreparedProgram {
  isReady: () => boolean;
  getUniforms?: () => unknown;
  getAttributes?: () => unknown;
  diagnostics?: { runnable?: boolean };
}
// Program instances change on context recovery. This cache retains no renderer,
// material or disposed program and avoids repeating work in later layer jobs.
const initializedPrograms = new WeakSet<PreparedProgram>();
const criticalPost = new WeakMap<THREE.WebGLRenderer, {
  ticket: object; objects: THREE.Object3D[]; ready: boolean;
}>();

export const isCommercialSceneCompiling = (renderer: THREE.WebGLRenderer) => pending.has(renderer);
/** A resize can block the driver while any critical, post or layer programs
 * link. This scheduling signal does not acquire or extend the draw gate. */
export const isCommercialMapProgramPreparationActive = (renderer: THREE.WebGLRenderer) => (programPreparations.get(renderer) ?? 0) > 0;
/** Unmanaged renderers retain the existing standalone compositor behavior. */
export const isCommercialMapPostReady = (renderer: THREE.WebGLRenderer) => criticalPost.get(renderer)?.ready ?? true;

/** Use the admitted map renderer, never a speculative context. Call after
 * program linking to keep upload admission separate from the link barrier.
 * Two uploads per task bound
 * admission; compiled custom uniforms use the same deduplicated texture set. */
export async function prepareCommercialMapTextures(renderer: THREE.WebGLRenderer, objects: THREE.Object3D[], signal?: AbortSignal,
  record: CommercialMapStageRecorder = captureCommercialMapStageRecorder()) {
  if (!renderer.initTexture) return; // minimal diagnostic renderer fixtures
  if (signal?.aborted) throw new DOMException('Texture preparation cancelled', 'AbortError');
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  const collect = (value: unknown) => {
    if (!(value instanceof THREE.Texture) || value.isRenderTargetTexture || !value.image
      || (value as THREE.VideoTexture).isVideoTexture || value.version === 0) return;
    textures.add(value);
  };
  const collectUniforms = (uniforms?: Record<string, THREE.IUniform>) => {
    if (!uniforms) return;
    for (const uniform of Object.values(uniforms)) {
      if (Array.isArray(uniform.value)) uniform.value.forEach(collect); else collect(uniform.value);
    }
  };
  for (const object of objects) {
    const material = (object as THREE.Mesh).material;
    for (const value of Array.isArray(material) ? material : [material]) if (value) materials.add(value);
  }
  let additionalCompiledUniformTextures = 0;
  for (const material of materials) {
    Object.values(material).forEach(collect);
    if ('uniforms' in material) collectUniforms((material as THREE.ShaderMaterial).uniforms);
    // MeshStandardMaterial hooks attach samplers to the compiled uniforms,
    // without exposing them as material properties or ShaderMaterial.uniforms.
    const before = textures.size;
    const compiled = renderer.properties?.get(material) as { uniforms?: Record<string, THREE.IUniform> } | undefined;
    collectUniforms(compiled?.uniforms);
    additionalCompiledUniformTextures += textures.size - before;
  }
  record('texture-upload:start', { count: textures.size, additionalCompiledUniformTextures });
  let uploads = 0;
  for (const texture of textures) {
    if (uploads % 2 === 0) await nextPreparationSlot(signal);
    if (signal?.aborted) throw new DOMException('Texture preparation cancelled', 'AbortError');
    renderer.initTexture(texture);
    uploads++;
  }
  record('texture-upload:end', { count: uploads });
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
  const record = captureCommercialMapStageRecorder();
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
      return measureCommercialMapStage(offscreen ? 'compile-post' : 'compile-direct', () => compileCommercialMapPrograms(renderer, representatives, camera, scene, signal, record));
    } catch (error) {
      return Promise.reject(error);
    } finally {
      markCommercialMapStage(offscreen ? 'compile-post-js' : 'compile-direct-js', performance.now() - startedAt);
      renderer.toneMapping = toneMapping;
      renderer.outputColorSpace = outputColorSpace;
      renderer.setRenderTarget(target, face, level);
    }
  };
  // Keep both phases inside the real first-draw barrier, but do not submit
  // uploads while the driver is still linking the captured programs.
  return compile(false).then(() => {
    if (signal?.aborted) throw new DOMException('Texture preparation cancelled', 'AbortError');
    record('texture-upload:programs-ready');
    return prepareCommercialMapTextures(renderer, objects, signal, record);
  }).finally(() => {
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
  record: CommercialMapStageRecorder = captureCommercialMapStageRecorder(),
) {
  if (signal?.aborted) return Promise.reject(new DOMException('Shader preparation cancelled', 'AbortError'));
  programPreparations.set(renderer, (programPreparations.get(renderer) ?? 0) + 1);
  const release = () => {
    const remaining = (programPreparations.get(renderer) ?? 1) - 1;
    if (remaining > 0) programPreparations.set(renderer, remaining); else programPreparations.delete(renderer);
  };
  try {
    return prepareCompiledPrograms(renderer, objects, camera, scene, signal, record).finally(release);
  } catch (error) {
    release();
    return Promise.reject(error);
  }
}

function prepareCompiledPrograms(
  renderer: THREE.WebGLRenderer, objects: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene,
  signal: AbortSignal | undefined, record: CommercialMapStageRecorder,
) {
  const materials = renderer.compile(objects, camera, scene);
  const programs = new Set<PreparedProgram>();
  materials.forEach((material) => {
    const properties = renderer.properties.get(material) as {
      currentProgram?: PreparedProgram;
      programs?: Map<string, PreparedProgram>;
    };
    // One shared material can compile instanced/plain, morph or double-sided
    // variants in a single call. currentProgram alone misses all but the last.
    if (properties.programs) properties.programs.forEach(program => programs.add(program));
    else if (properties.currentProgram) programs.add(properties.currentProgram);
  });
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false, reflecting = false, synchronousMs = 0, maximumBatchMs = 0, batches = 0, initialized = 0;
    const startedAt = performance.now(), programCount = programs.size;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    };
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      programs.clear();
      record('program-introspection', {
        duration: synchronousMs, programCount, initializedPrograms: initialized, batches, maximumBatchMs,
        elapsedMs: performance.now() - startedAt, outcome: error ? signal?.aborted ? 'aborted' : 'failed' : 'complete',
      });
      if (error) reject(error); else resolve();
    };
    const abort = () => { if (!reflecting) finish(new DOMException('Shader preparation cancelled', 'AbortError')); };
    const check = () => {
      if (settled) return;
      if (signal?.aborted) { abort(); return; }
      let batchPrograms = 0, batchMs = 0;
      try {
        for (const program of programs) {
          if (!program.isReady()) continue;
          if (!initializedPrograms.has(program) && (program.getUniforms || program.getAttributes)) {
            const start = performance.now();
            try {
              reflecting = true;
              // Three r170 defers uniform/attribute reflection until onFirstUse.
              // Initialize only ready programs, without binding a render target
              // or changing their material, camera or scene state.
              program.getUniforms?.();
              if (signal?.aborted) throw new DOMException('Shader preparation cancelled', 'AbortError');
              program.getAttributes?.();
              if (signal?.aborted) throw new DOMException('Shader preparation cancelled', 'AbortError');
              if (program.diagnostics?.runnable === false) throw new Error('Shader program is not runnable');
              initializedPrograms.add(program);
              initialized++;
              batchPrograms++;
            } finally { reflecting = false; batchMs += performance.now() - start; }
          }
          programs.delete(program);
          if (batchPrograms >= 2 || batchMs >= 2) break;
        }
      } catch (error) {
        synchronousMs += batchMs;
        maximumBatchMs = Math.max(maximumBatchMs, batchMs);
        if (batchMs || batchPrograms) batches++;
        finish(error);
        return;
      }
      synchronousMs += batchMs;
      maximumBatchMs = Math.max(maximumBatchMs, batchMs);
      if (batchPrograms) batches++;
      if (settled) return;
      if (!programs.size) finish();
      // Yield after each small initialization batch. Poll unfinished links less
      // often; no timer or listener survives cancellation/settlement.
      else timer = setTimeout(check, batchPrograms ? 0 : 10);
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
  const record = captureCommercialMapStageRecorder();
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
          compilation = compileCommercialMapPrograms(renderer, batch, camera, scene, signal, record);
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
