import type { CommercialMapQualityTier } from './viewport';

/** Hardware budgets must never change the authored scene or available actions. */
export const COMMERCIAL_MAP_CANONICAL_CONTENT = Object.freeze({
  reducedGraphics: false,
  vegetationDensity: 1,
  distantVegetationDensity: 1,
  materialProfile: 'full' as const,
  reflectionTextureWidth: 128,
  bloomEnabled: true,
  shadowsEnabled: true,
});

/** Compatibility boundary for older presentation-only component APIs. */
export function resolveCommercialMapContentPolicy(
  _tier?: CommercialMapQualityTier,
  _legacyReducedGraphics?: boolean,
) {
  return COMMERCIAL_MAP_CANONICAL_CONTENT;
}

const EXECUTION_POLICIES = Object.freeze({
  LOW: Object.freeze({ shadowMapSize: 1024, effectUpdateHz: 20, lodUpdateHz: 10, taskBudgetMs: 2 }),
  MEDIUM: Object.freeze({ shadowMapSize: 1536, effectUpdateHz: 30, lodUpdateHz: 15, taskBudgetMs: 3 }),
  HIGH: Object.freeze({ shadowMapSize: 2048, effectUpdateHz: 45, lodUpdateHz: 20, taskBudgetMs: 4 }),
  ULTRA: Object.freeze({ shadowMapSize: 4096, effectUpdateHz: 60, lodUpdateHz: 30, taskBudgetMs: 5 }),
});

/** Buffers, scheduling and cadence only; no inventory or material variants. */
export function resolveCommercialMapExecutionPolicy(tier: CommercialMapQualityTier) {
  return EXECUTION_POLICIES[tier];
}

/** QA builds alone may fix a profile before the first scene is mounted. */
export function readCommercialMapQaQualityTier(enabled: boolean, search: string): CommercialMapQualityTier | null {
  if (!enabled) return null;
  const value = new URLSearchParams(search).get('qualityQa');
  return value === 'LOW' || value === 'MEDIUM' || value === 'HIGH' || value === 'ULTRA' ? value : null;
}
