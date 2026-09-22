import type { Scene } from 'three';
import type { CommercialMapQualityTier } from './viewport';

export interface CommercialRainRuntime {
  /** Stable objects also used directly by rain ShaderMaterial uniforms. */
  blend: { value: number };
  night: { value: number };
}
const runtimes = new WeakMap<Scene, CommercialRainRuntime>();

export function commercialRainRuntime(scene: Scene): CommercialRainRuntime {
  let runtime = runtimes.get(scene);
  if (!runtime) {
    runtime = { blend: { value: 0 }, night: { value: 0 } };
    runtimes.set(scene, runtime);
  }
  return runtime;
}

/** Bounded frame delta preserves the fade through compilation or a hidden tab. */
export function advanceRainBlend(current: number, active: boolean, delta: number) {
  const target = active ? 1 : 0;
  const blend = target + (current - target) * Math.exp(-3.6 * Math.min(.05, Math.max(0, delta)));
  return Math.abs(blend - target) < .002 ? target : blend;
}

export const COMMERCIAL_RAIN_BUDGETS = {
  LOW: { drops: 4000, splashes: 160, runoff: 160, puddles: 80 },
  MEDIUM: { drops: 4000, splashes: 160, runoff: 160, puddles: 80 },
  HIGH: { drops: 4000, splashes: 160, runoff: 160, puddles: 80 },
  ULTRA: { drops: 4000, splashes: 160, runoff: 160, puddles: 80 },
} as const;

/** Uses the existing measured-frame quality tier plus actual GPU resource caps. */
export function resolveRainQuality(tier: CommercialMapQualityTier, maxTextureSize: number, memoryGb?: number) {
  if (maxTextureSize < 4096 || (memoryGb !== undefined && memoryGb < 4)) return 'LOW';
  if (maxTextureSize < 8192 && (tier === 'HIGH' || tier === 'ULTRA')) return 'MEDIUM';
  return tier;
}
