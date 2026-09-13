import * as THREE from 'three';

export type RainSurfaceKind = 'asphalt' | 'concrete' | 'roof' | 'vegetation' | 'soil';
export const RAIN_SURFACE_RESPONSE = {
  asphalt: { darken: .28, roughness: .34, reflection: .20 },
  concrete: { darken: .16, roughness: .53, reflection: .12 },
  roof: { darken: .10, roughness: .39, reflection: .17 },
  vegetation: { darken: .13, roughness: .69, reflection: .05 },
  soil: { darken: .22, roughness: .88, reflection: .02 },
} as const;

/** Material/map names are presentation metadata, never commercial identifiers.
 * Unnamed materials use a conservative albedo/roughness fallback. */
export function classifyRainSurface(material: THREE.MeshStandardMaterial): RainSurfaceKind {
  const name = `${material.name} ${material.map?.name ?? ''}`.toLowerCase();
  if (/soil|ground|grass|terrain|gravel/.test(name)) return 'soil';
  if (/leaf|leaves|foliage|canopy|vegetation/.test(name)) return 'vegetation';
  if (/roof|zinc|metal|telha/.test(name) || material.metalness > .25) return 'roof';
  if (/road|asphalt|parking|asfalto/.test(name)) return 'asphalt';
  const { r, g, b } = material.color;
  if (g > r * 1.13 && g > b * 1.07) return 'vegetation';
  if (r > b * 1.6 && g > b * 1.3 && material.roughness > .9) return 'soil';
  if (Math.max(r, g, b) < .18 && material.roughness > .7) return 'asphalt';
  return 'concrete';
}

type Entry = {
  material: THREE.MeshStandardMaterial;
  base: THREE.Color;
  last: THREE.Color;
  roughness: number;
  lastRoughness: number;
  reflection: number;
  lastReflection: number;
  response: typeof RAIN_SURFACE_RESPONSE[RainSurfaceKind];
  dispose: () => void;
};

/** No shader hooks, clones, texture allocations or program variants. Existing
 * terrain/contact customization and selection emissives remain authoritative.
 * External React palette changes are detected before applying current wetness. */
export class RainWetSurfaceRegistry {
  private entries = new Map<THREE.MeshStandardMaterial, Entry>();
  get size() { return this.entries.size; }
  add(material: THREE.Material) {
    if (!(material instanceof THREE.MeshStandardMaterial) || material.transparent
      || material.opacity < .98 || this.entries.has(material)
      || /hydro|water|glass|sign|artwork|lamp|led|rain/i.test(`${material.name} ${material.map?.name ?? ''}`)) return;
    const entry: Entry = {
      material, base: material.color.clone(), last: material.color.clone(),
      roughness: material.roughness, lastRoughness: material.roughness,
      reflection: material.envMapIntensity, lastReflection: material.envMapIntensity,
      response: RAIN_SURFACE_RESPONSE[classifyRainSurface(material)],
      dispose: () => { material.removeEventListener('dispose', entry.dispose); this.entries.delete(material); },
    };
    material.addEventListener('dispose', entry.dispose);
    this.entries.set(material, entry);
  }
  update(blend: number) {
    for (const entry of this.entries.values()) {
      const { material, base, last, response } = entry;
      if (!material.color.equals(last)) base.copy(material.color);
      if (material.roughness !== entry.lastRoughness) entry.roughness = material.roughness;
      if (material.envMapIntensity !== entry.lastReflection) entry.reflection = material.envMapIntensity;
      material.color.copy(base).multiplyScalar(1 - blend * response.darken);
      material.roughness = THREE.MathUtils.lerp(entry.roughness, Math.min(entry.roughness, response.roughness), blend);
      material.envMapIntensity = entry.reflection + blend * response.reflection;
      last.copy(material.color);
      entry.lastRoughness = material.roughness;
      entry.lastReflection = material.envMapIntensity;
    }
  }
  dispose() {
    this.update(0);
    for (const entry of this.entries.values()) entry.material.removeEventListener('dispose', entry.dispose);
    this.entries.clear();
  }
}
