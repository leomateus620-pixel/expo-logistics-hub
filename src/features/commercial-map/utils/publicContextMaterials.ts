import * as THREE from 'three';

/** One scene-local variant per source. Source materials and textures are borrowed,
 * never mutated or disposed. The shader also desaturates textures/instance colors. */
export function createPublicContextMaterialPool() {
  const variants = new Map<THREE.Material, { material: THREE.Material; users: number }>();
  const sources = new WeakMap<THREE.Material, THREE.Material>();
  const sourceOf = (material: THREE.Material) => sources.get(material) ?? material;
  return {
    sourceOf,
    acquire(input: THREE.Material) {
      const source = sourceOf(input);
      let entry = variants.get(source);
      if (!entry) {
        const material = source.clone();
        // MeshStandardMaterial.copy does not carry application-added defines.
        // Existing roof/terrain hooks require USE_UV before their UV expression.
        const sourceWithDefines = source as THREE.Material & { defines?: Record<string, unknown> };
        if (sourceWithDefines.defines) (material as typeof sourceWithDefines).defines = { ...sourceWithDefines.defines };
        material.name = `public-context:${source.name || source.type}`;
        const compile = source.onBeforeCompile;
        const key = source.customProgramCacheKey();
        material.onBeforeCompile = function(shader, renderer) {
          compile.call(this, shader, renderer);
          const gray = 'gl_FragColor.rgb = vec3(dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722)));';
          if (shader.fragmentShader.includes('#include <tonemapping_fragment>')) {
            shader.fragmentShader = shader.fragmentShader.replace('#include <tonemapping_fragment>', `${gray}\n#include <tonemapping_fragment>`);
          } else {
            const end = shader.fragmentShader.lastIndexOf('}');
            shader.fragmentShader = shader.fragmentShader.slice(0, end) + gray + shader.fragmentShader.slice(end);
          }
        };
        material.customProgramCacheKey = () => `${key}:public-grayscale-v1`;
        sources.set(material, source);
        entry = { material, users: 0 };
        variants.set(source, entry);
      }
      entry.users += 1;
      return entry.material;
    },
    release(input: THREE.Material) {
      const source = sourceOf(input);
      const entry = variants.get(source);
      if (entry && --entry.users === 0) { entry.material.dispose(); variants.delete(source); }
    },
    get size() { return variants.size; },
  };
}
