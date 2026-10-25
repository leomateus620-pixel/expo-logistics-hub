import { Material, Mesh, type Object3D } from 'three';

/** Owned opaque material variants avoid sorting many transparent machinery
 * meshes. The screen-door dissolve hides only a machine's temporal ellipses. */
export function createSoyMachineDissolve(group: Object3D) {
  const visibility = { value: 1 }, originals = new Map<Material, Material>();
  const assignments: { mesh: Mesh; material: Material | Material[] }[] = [];
  const clone = (original: Material) => {
    const existing = originals.get(original); if (existing) return existing;
    const material = original.clone(), previousCompile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      previousCompile.call(material, shader, renderer);
      shader.uniforms.soyMachineVisibility = visibility;
      shader.fragmentShader = `uniform float soyMachineVisibility;\n${shader.fragmentShader}`.replace('#include <dithering_fragment>', `
        if (soyMachineVisibility < 0.9999) {
          float screenDoor = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
          if (screenDoor >= soyMachineVisibility) discard;
        }
        #include <dithering_fragment>`);
    };
    material.customProgramCacheKey = () => 'soy-owned-machine-dissolve-v1';
    originals.set(original, material); return material;
  };
  group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    assignments.push({ mesh: object, material: object.material });
    object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
  });
  let disposed = false;
  return { visibility, dispose() {
    if (disposed) return; disposed = true;
    for (const entry of assignments) entry.mesh.material = entry.material;
    for (const material of originals.values()) material.dispose();
  } };
}
