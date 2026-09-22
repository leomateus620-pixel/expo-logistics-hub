import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMERCIAL_MAP_CANONICAL_CONTENT, readCommercialMapQaQualityTier, resolveCommercialMapContentPolicy, resolveCommercialMapExecutionPolicy } from '@/features/commercial-map/utils/executionPolicy';
import { buildRegionalLandscapePlan } from '@/features/commercial-map/utils/regionalLandscape';
import { buildRearTreeInstances, buildRearPoleInstances } from '@/features/commercial-map/data/rearParkEnvironment';
import { resolveParkAccessEnvironmentPresentation } from '@/features/commercial-map/data/parkAccessEnvironment';
import { buildCommercialSiteEnvironmentPlan } from '@/features/commercial-map/utils/commercialSiteEnvironment';
import { buildQuadrasABEnvironmentPlan } from '@/features/commercial-map/utils/quadrasABEnvironment';
import { COMMERCIAL_MAP_ENVIRONMENT_CONFIG } from '@/features/commercial-map/data/commercialMapEnvironment';
import { COMMERCIAL_RAIN_BUDGETS, resolveRainQuality } from '@/features/commercial-map/utils/rainRuntime';
import { resolveLunarLaunchQuality } from '@/features/commercial-map/utils/lunarLaunch';
import { COMMERCIAL_MAP_QUALITY_PRESETS, resolveCommercialMapQualityPixelRatio } from '@/features/commercial-map/utils/viewport';
import { resolveCommercialTreeLodInstanceCounts } from '@/features/commercial-map/components/canvas/CommercialTreeLayer';
import { COMMERCIAL_ELECTRICAL_NODES, COMMERCIAL_ELECTRICAL_CONNECTIONS } from '@/features/commercial-map/data/electricalInfrastructure';
import { buildElectricalWirePositions } from '@/features/commercial-map/utils/electricalInfrastructure';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';

const tiers = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA'] as const;
const source = (path: string) => readFileSync(resolve('src/features/commercial-map', path), 'utf8');

describe('mesmo parque em todos os perfis técnicos', () => {
  it('aceita o perfil forçado somente no diagnóstico e rejeita valores não reconhecidos', () => {
    for (const tier of tiers) {
      expect(readCommercialMapQaQualityTier(true, `?qualityQa=${tier}`)).toBe(tier);
      expect(readCommercialMapQaQualityTier(false, `?qualityQa=${tier}`)).toBeNull();
    }
    expect(readCommercialMapQaQualityTier(true, '?qualityQa=invalid')).toBeNull();
    expect(readCommercialMapQaQualityTier(true, '')).toBeNull();
  });
  it('separa conteúdo imutável de cadência e buffers sem desligar efeitos', () => {
    for (const tier of tiers) {
      expect(resolveCommercialMapContentPolicy(tier, true)).toBe(COMMERCIAL_MAP_CANONICAL_CONTENT);
      expect(COMMERCIAL_MAP_QUALITY_PRESETS[tier]).toMatchObject({ vegetationDensity: 1, distantVegetationDensity: 1, lodDistanceScale: 1 });
      expect(resolveCommercialMapExecutionPolicy(tier).shadowMapSize).toBeGreaterThanOrEqual(1024);
      expect(resolveCommercialMapQualityPixelRatio({ qualityTier: tier, devicePixelRatio: 2, viewportWidth: 3840, viewportHeight: 2160 })).toBeGreaterThanOrEqual(.85);
    }
    expect(resolveCommercialMapExecutionPolicy('LOW').lodUpdateHz).toBeLessThan(resolveCommercialMapExecutionPolicy('HIGH').lodUpdateHz);
  });

  it('mantém IDs, posição, escala e espécie de todas as árvores regionais e de acesso', () => {
    expect(buildRegionalLandscapePlan('reduced')).toEqual(buildRegionalLandscapePlan('full'));
    expect(buildRegionalLandscapePlan('balanced')).toEqual(buildRegionalLandscapePlan('full'));
    expect(buildRearTreeInstances(true)).toEqual(buildRearTreeInstances(false));
    expect(buildRearPoleInstances(true)).toEqual(buildRearPoleInstances(false));
    expect(resolveParkAccessEnvironmentPresentation(true)).toEqual(resolveParkAccessEnvironmentPresentation(false));
  });

  it('usa as mesmas células de solo em vista normal e visita, inclusive no perfil técnico menor', () => {
    expect(buildCommercialSiteEnvironmentPlan({ reducedGraphics: true })).toEqual(buildCommercialSiteEnvironmentPlan({ reducedGraphics: false }));
    expect(buildQuadrasABEnvironmentPlan({ reducedGraphics: true })).toEqual(buildQuadrasABEnvironmentPlan({ reducedGraphics: false }));
  });

  it('não muda a silhueta, contato ou inventário comercial por perfil', () => {
    for (const distance of ['near', 'mid', 'far'] as const) {
      const counts = { near: 274, mid: 274, far: 274 };
      expect(resolveCommercialTreeLodInstanceCounts(counts, distance, 8, true)).toEqual(resolveCommercialTreeLodInstanceCounts(counts, distance, 8, false));
    }
    const tree = source('components/canvas/CommercialTreeLayer.tsx');
    expect(tree).toContain('resolveCommercialMapContentPolicy(qualityTier, reducedGraphics)');
    expect(tree).not.toContain("reducedGraphics || qualityTier === 'LOW'");
  });

  it('preserva todos os condutores da infraestrutura elétrica', () => {
    expect(buildElectricalWirePositions(COMMERCIAL_ELECTRICAL_NODES, COMMERCIAL_ELECTRICAL_CONNECTIONS, OFFICIAL_REFERENCE_DATA.entities, true))
      .toEqual(buildElectricalWirePositions(COMMERCIAL_ELECTRICAL_NODES, COMMERCIAL_ELECTRICAL_CONNECTIONS, OFFICIAL_REFERENCE_DATA.entities, false));
  });

  it('preserva chuva, respingos, escoamento e efeitos lunares em capacidades diferentes', () => {
    for (const tier of tiers) expect(COMMERCIAL_RAIN_BUDGETS[tier]).toEqual(COMMERCIAL_RAIN_BUDGETS.HIGH);
    expect(COMMERCIAL_RAIN_BUDGETS[resolveRainQuality('HIGH', 2048, 2)].runoff).toBeGreaterThan(0);
    const high = resolveLunarLaunchQuality({ viewportWidth: 1920, viewportHeight: 1080, reducedGraphics: false, deviceMemoryGb: 16, hardwareConcurrency: 16 });
    const low = resolveLunarLaunchQuality({ viewportWidth: 390, viewportHeight: 844, reducedGraphics: true, deviceMemoryGb: 2, hardwareConcurrency: 2 });
    for (const key of ['hotParticles', 'sparks', 'dust', 'smoke', 'shadowRefreshDuringIgnition'] as const) expect(low[key]).toBe(high[key]);
    for (const profile of Object.values(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.quality)) {
      expect(profile.bloomEnabled).toBe(true);
      expect(profile.sharpenStrength).toBe(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.quality.full.sharpenStrength);
      expect(profile.smaaPreset).toBe('ultra');
    }
  });

  it('impede que o estado técnico alcance os branches legados de arquitetura e materiais', () => {
    const canvas = source('components/canvas/CommercialMapCanvas.tsx');
    const scene = canvas.slice(canvas.indexOf('function Scene('), canvas.indexOf('function AdaptiveCommercialMapScene('));
    expect(scene).toContain('const reducedGraphics = COMMERCIAL_MAP_CANONICAL_CONTENT.reducedGraphics;');
    expect(scene).not.toContain('state.reducedGraphics');
    expect(canvas).toContain('qualityTier={renderQualityTier}');
    expect(canvas).not.toContain('publicScenePolicy || reducedGraphics ? false');
    const landmarks = source('components/canvas/StrategicLandmarks.tsx');
    expect(landmarks).not.toContain('state.reducedGraphics');
    const environment = source('components/canvas/CommercialMapEnvironment.tsx');
    expect(environment).toContain('const reflectionTextureWidth = COMMERCIAL_MAP_CANONICAL_CONTENT.reflectionTextureWidth;');
    expect(environment).not.toContain('!visitRuntime.renderingActive');
    expect(environment).toContain('enabled={active}');
  });
});
