import { Color, Mesh, MeshStandardMaterial, type Object3D } from 'three';

/** Small material-only fill for the owned demonstration. No lights, extra draws,
 * global materials or shader variants are added when the night switch changes. */
export function createSoyHarvestNightFill(root: Object3D) {
  const materials = new Set<MeshStandardMaterial>();
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof MeshStandardMaterial) materials.add(material);
    }
  });
  const entries = [...materials].map(material => {
    const emissive = material.emissive.clone(), intensity = material.emissiveIntensity;
    const emissiveMap = material.emissiveMap;
    // Prepare the inscription's texture variant before local shader preparation.
    // Otherwise a white emissive rectangle would obscure the manufacturer text.
    if (material.map && !material.emissiveMap) {
      material.emissiveMap = material.map; material.needsUpdate = true;
    }
    const fill = new Color(
      Math.min(.12, material.color.r * .22 + .004),
      Math.min(.14, material.color.g * .22 + .006),
      Math.min(.16, material.color.b * .22 + .009),
    );
    const nightEmissive = emissive.clone().multiplyScalar(intensity).add(fill);
    return { material, emissive, intensity, emissiveMap, nightEmissive };
  });
  let active: boolean | undefined;
  return {
    setActive(night: boolean) {
      if (night === active) return;
      active = night;
      for (const entry of entries) {
        entry.material.emissive.copy(night ? entry.nightEmissive : entry.emissive);
        entry.material.emissiveIntensity = night ? 1 : entry.intensity;
      }
    },
    dispose() {
      for (const entry of entries) {
        entry.material.emissive.copy(entry.emissive); entry.material.emissiveIntensity = entry.intensity;
        entry.material.emissiveMap = entry.emissiveMap;
      }
    },
  };
}
