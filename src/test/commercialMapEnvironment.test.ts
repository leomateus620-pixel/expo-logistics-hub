import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_MAP_ENVIRONMENT_CONFIG,
  commercialMapEnvironmentBudget,
  normalizedCommercialMapSunDirection,
  projectedCommercialMapShadowDirection,
  projectedCommercialMapShadowRotation,
  resolveCommercialMapCloudPlacements,
  resolveCommercialMapEnvironmentLayout,
  type CommercialMapEnvironmentExtent,
} from '@/features/commercial-map/data/commercialMapEnvironment';

const FULL_MAP_EXTENT: CommercialMapEnvironmentExtent = {
  centerX: 0,
  centerZ: 0,
  width: 120,
  depth: 90.545455,
  diagonal: Math.hypot(120, 90.545455),
};

describe('atmosfera premium compartilhada do Mapa Comercial', () => {
  it('mantém o feather externo atrás do terreno sem desligar sombras ou depth testing', () => {
    const source = readFileSync(resolve(process.cwd(),
      'src/features/commercial-map/components/canvas/CommercialMapEnvironment.tsx'), 'utf8');
    const outer = source.slice(source.indexOf('layout.outerGroundSize, layout.outerGroundSize'),
      source.indexOf('layout.activeGroundWidth, layout.activeGroundDepth'));
    expect(outer).toContain('polygonOffsetFactor={1}');
    expect(outer).toContain('polygonOffsetUnits={2}');
    expect(outer).toContain('depthWrite={false}');
    expect(outer).not.toContain('depthTest={false}');
    expect(source).toContain('receiveShadow');
  });

  it('mantém o sol configurável alinhado à direção de sombras já observada', () => {
    const sun = normalizedCommercialMapSunDirection();
    const shadow = projectedCommercialMapShadowDirection();
    const solar = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar;
    const activePreset = solar.presets[solar.activePreset];

    expect(Math.hypot(...sun)).toBeCloseTo(1, 6);
    expect(sun[0]).toBeLessThan(0);
    expect(sun[1]).toBeGreaterThan(0.7);
    expect(sun[2]).toBeGreaterThan(0);
    expect(Math.atan2(shadow[1], shadow[0])).toBeCloseTo(projectedCommercialMapShadowRotation(), 8);
    expect(activePreset.provenance).toBe('SATELLITE_SHADOW_INFERRED');
    expect(projectedCommercialMapShadowRotation()).toBeCloseTo(activePreset.sourceShadowRotationRadians, 2);
    expect(solar.presets.openingMorning.provenance).toContain('NOAA_SOLAR_POSITION');
    expect(solar.fieldVerificationRecommended).toBe(true);
  });

  it('resolve terreno exterior com máscara suave e névoa além do parque oficial', () => {
    const normal = resolveCommercialMapEnvironmentLayout(FULL_MAP_EXTENT, 'normal', false);
    const technical = resolveCommercialMapEnvironmentLayout(FULL_MAP_EXTENT, 'hydrological', false);
    const legacyMargin = Math.max(8, FULL_MAP_EXTENT.diagonal * 0.08);

    expect(normal.activeGroundWidth).toBeCloseTo(FULL_MAP_EXTENT.width + legacyMargin, 8);
    expect(normal.activeGroundDepth).toBeCloseTo(FULL_MAP_EXTENT.depth + legacyMargin, 8);
    expect(normal.fogNear).toBeGreaterThan(FULL_MAP_EXTENT.diagonal * 3.5);
    expect(normal.fogFar).toBeGreaterThan(normal.outerGroundSize);
    expect(technical.fogNear).toBeGreaterThan(normal.fogNear);
    expect(technical.fogFar).toBeGreaterThan(technical.outerGroundSize);
  });

  it('mantém nuvens esparsas fora do envelope do parque e reduz densidade em gráficos reduzidos', () => {
    const full = resolveCommercialMapCloudPlacements(FULL_MAP_EXTENT, false);
    const reduced = resolveCommercialMapCloudPlacements(FULL_MAP_EXTENT, true);

    expect(full).toHaveLength(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.clouds.fullCount);
    expect(reduced).toHaveLength(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.clouds.reducedCount);
    expect(reduced.length).toBeLessThan(full.length);
    full.forEach((cloud) => {
      const radialDistance = Math.hypot(
        cloud.position[0] - FULL_MAP_EXTENT.centerX,
        cloud.position[2] - FULL_MAP_EXTENT.centerZ,
      );
      expect(radialDistance).toBeGreaterThan(FULL_MAP_EXTENT.diagonal * 0.7);
      expect(cloud.position[1]).toBeGreaterThan(0);
      expect(cloud.scale.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
    });
  });

  it('fica dentro do orçamento estático de quatro draw calls ambientais', () => {
    expect(commercialMapEnvironmentBudget(false)).toEqual({
      primaryDrawCalls: 4,
      skyDrawCalls: 1,
      groundDrawCalls: 2,
      cloudDrawCalls: 1,
      cloudInstances: 7,
      animatedLayers: 0,
    });
    expect(commercialMapEnvironmentBudget(true)).toMatchObject({
      primaryDrawCalls: 4,
      cloudDrawCalls: 1,
      cloudInstances: 4,
      animatedLayers: 0,
    });
  });

  it('integra somente a apresentação exterior compartilhada, sem loop ou domínio comercial paralelo', () => {
    const environment = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/CommercialMapEnvironment.tsx',
    ), 'utf8');
    const canvas = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
    ), 'utf8');

    expect(canvas).toContain('<CommercialMapEnvironment');
    expect(environment).toContain('new THREE.InstancedMesh');
    expect(environment).toContain('scene.environment = reflectionTexture');
    expect(environment).toContain('scene.environment = previousEnvironment');
    expect(environment).toContain('mesh.raycast = NO_RAYCAST');
    expect(environment).toContain('depthWrite: false');
    expect(environment).not.toContain('useFrame');
    expect(environment).not.toContain('requestAnimationFrame');
    expect(environment).not.toContain('EffectComposer');
    expect(environment).not.toContain('Bloom');
    expect(environment).not.toContain('CommercialLot');
    expect(environment).not.toContain('MapEntity');
    expect(environment).not.toContain('officialReference2026');
  });
});
