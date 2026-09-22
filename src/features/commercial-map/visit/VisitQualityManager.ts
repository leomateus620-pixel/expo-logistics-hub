import {
  createCommercialMapAdaptiveQualityState,
  resolveCommercialMapAdaptiveQuality,
  type CommercialMapAdaptiveQualitySample,
  type CommercialMapAdaptiveQualityState,
  type CommercialMapQualityCapabilitiesInput,
  type CommercialMapQualityTier,
} from '../utils/viewport';

export type VisitQualityPreset = 'HIGH' | 'BALANCED' | 'PERFORMANCE';

/** Budgets apply only while visiting. Canonical entities and colliders persist. */
export const VISIT_QUALITY_PRESETS = {
  HIGH: { maximumDpr: 1.35, environmentTier: 'HIGH', interactionHz: 12 },
  BALANCED: { maximumDpr: 1.1, environmentTier: 'MEDIUM', interactionHz: 10 },
  PERFORMANCE: { maximumDpr: 0.85, environmentTier: 'LOW', interactionHz: 8 },
} as const;

export interface VisitQualitySnapshot {
  enabled: boolean;
  preset: VisitQualityPreset;
  moving: boolean;
}

const runtime: VisitQualitySnapshot = { enabled: false, preset: 'BALANCED', moving: false };
const listeners = new Set<() => void>();
let owners = 0;

// This tiny bridge lets the existing DPR owner serve the lazy visit layer.
// No Three/physics modules or React store enter the initial bundle through it.
export const readVisitQuality = () => runtime;
export const subscribeVisitQuality = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const publish = () => { listeners.forEach((listener) => listener()); };

export function beginVisitQualitySession() {
  owners += 1;
  if (!runtime.enabled) {
    runtime.enabled = true;
    runtime.moving = false;
    runtime.preset = 'BALANCED';
    publish();
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    owners = Math.max(0, owners - 1);
    if (owners !== 0) return;
    runtime.enabled = false;
    runtime.moving = false;
    publish();
  };
}

/** Input/physics writes this flag without notifying React or subscribers. */
export function setVisitQualityMotion(moving: boolean) {
  runtime.moving = moving;
}

export function visitPresetForTier(tier: CommercialMapQualityTier): VisitQualityPreset {
  return tier === 'LOW' ? 'PERFORMANCE' : tier === 'MEDIUM' ? 'BALANCED' : 'HIGH';
}

export function publishVisitQualityTier(tier: CommercialMapQualityTier) {
  if (!runtime.enabled) return;
  const preset = visitPresetForTier(tier);
  if (preset === runtime.preset) return;
  runtime.preset = preset;
  publish();
}

export function createInitialVisitQuality(capabilities: CommercialMapQualityCapabilitiesInput) {
  const state = createCommercialMapAdaptiveQualityState(capabilities);
  // Start balanced; genuinely low-capability devices retain the safety floor.
  if (state.tier === 'HIGH' || state.tier === 'ULTRA') state.tier = 'MEDIUM';
  return state;
}

export function resolveVisitQualityDecision(
  state: CommercialMapAdaptiveQualityState,
  sample: CommercialMapAdaptiveQualitySample,
) {
  const decision = resolveCommercialMapAdaptiveQuality(state, sample);
  if (decision.tier === 'ULTRA') decision.tier = 'HIGH';
  if (decision.hardwareCeiling === 'ULTRA') decision.hardwareCeiling = 'HIGH';
  decision.changed = decision.tier !== state.tier;
  return decision;
}

export function capVisitPixelRatio(baseDpr: number, tier: CommercialMapQualityTier) {
  return Math.min(baseDpr, VISIT_QUALITY_PRESETS[visitPresetForTier(tier)].maximumDpr);
}

export interface VisitReflectionBudget { width: number | null; visiting: boolean }
export const createVisitReflectionBudget = (): VisitReflectionBudget => ({ width: null, visiting: false });

/** Three r170 includes PMREM height in every PBR program cache key. A 128→64
 * environment swap compiled 69 programs during walking on Intel UHD (12.9 s).
 * Keep the already-prepared reflection input for this visit; DPR, shadow maps,
 * postprocessing and secondary environment budgets still adapt independently. */
export function resolveVisitReflectionWidth(budget: VisitReflectionBudget, requestedWidth: number, visiting: boolean) {
  if (!visiting) {
    budget.width = requestedWidth;
    budget.visiting = false;
    return requestedWidth;
  }
  if (!budget.visiting) {
    budget.visiting = true;
    budget.width ??= requestedWidth;
  }
  return budget.width ?? requestedWidth;
}
