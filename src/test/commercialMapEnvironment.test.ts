import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAMERA_PRESETS } from '@/features/commercial-map/constants';
import {
  COMMERCIAL_MAP_ENVIRONMENT_CONFIG,
  commercialMapEnvironmentBudget,
  commercialMapSunriseDirection,
  normalizedCommercialMapSunDirection,
  projectedCommercialMapShadowDirection,
  projectedCommercialMapShadowRotation,
  resolveCommercialMapCloudPlacements,
  resolveCommercialMapEnvironmentLayout,
  resolveCommercialMapSunriseFrame,
  resolveCommercialMapSunriseProgress,
  resolveCommercialMapSunriseQualityTier,
  type CommercialMapEnvironmentExtent,
  type CommercialMapSunriseQualityTier,
} from '@/features/commercial-map/data/commercialMapEnvironment';

const FULL_MAP_EXTENT: CommercialMapEnvironmentExtent = {
  centerX: 0,
  centerZ: 0,
  width: 120,
  depth: 90.545455,
  diagonal: Math.hypot(120, 90.545455),
};

const source = (path: string) => readFileSync(resolve(path), 'utf8');

describe('amanhecer premium compartilhado do Mapa Comercial', () => {
  it('mantém o feather externo atrás do terreno sem desligar sombras ou depth testing', () => {
    const environment = source(
      'src/features/commercial-map/components/canvas/CommercialMapEnvironment.tsx',
    );
    const outer = environment.slice(
      environment.indexOf('layout.outerGroundSize, layout.outerGroundSize'),
      environment.indexOf('layout.activeGroundWidth, layout.activeGroundDepth'),
    );

    expect(outer).toContain('polygonOffsetFactor={1}');
    expect(outer).toContain('polygonOffsetUnits={2}');
    expect(outer).toContain('depthWrite={false}');
    expect(outer).not.toContain('depthTest={false}');
    expect(environment).toContain('receiveShadow');
  });

  it('ancora o sol no horizonte -Z definido pelas referências, sem reutilizar o sol diurno', () => {
    const sunrise = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise;
    const horizon = commercialMapSunriseDirection(0);
    const finalSun = normalizedCommercialMapSunDirection();
    const shadow = projectedCommercialMapShadowDirection();

    expect(sunrise.horizonDirection).toEqual([0, 0, -1]);
    expect(sunrise.azimuthMapDegrees).toBe(0);
    expect(sunrise.horizonLabel).toContain('-Z');
    expect(sunrise.startElevationDegrees).toBeLessThan(0);
    expect(sunrise.endElevationDegrees).toBeGreaterThan(0);
    expect(sunrise.endElevationDegrees).toBeLessThan(6);
    expect(horizon[0]).toBeCloseTo(0, 12);
    expect(horizon[1]).toBeCloseTo(0, 12);
    expect(horizon[2]).toBeCloseTo(-1, 12);
    expect(Math.hypot(...finalSun)).toBeCloseTo(1, 12);
    expect(finalSun[0]).toBeCloseTo(0, 12);
    expect(finalSun[1]).toBeGreaterThan(0);
    expect(finalSun[2]).toBeLessThan(-0.99);
    expect(shadow[0]).toBeCloseTo(0, 12);
    expect(shadow[1]).toBeCloseTo(1, 12);
    expect(projectedCommercialMapShadowRotation()).toBeCloseTo(Math.PI / 2, 12);

    expect(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar).not.toHaveProperty('activePreset');
    expect(
      COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.calibrationAlternatives.satelliteReference.provenance,
    ).toBe('SATELLITE_SHADOW_INFERRED');
    expect(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.fieldVerificationRecommended).toBe(true);
  });

  it('resolve uma única timeline determinística, limitada e monotônica', () => {
    const duration = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.durationMs;

    expect(resolveCommercialMapSunriseProgress(1_000, 500)).toBe(0);
    expect(resolveCommercialMapSunriseProgress(1_000, 1_000)).toBe(0);
    expect(resolveCommercialMapSunriseProgress(1_000, 1_000 + duration / 2)).toBe(0.5);
    expect(resolveCommercialMapSunriseProgress(1_000, 1_000 + duration)).toBe(1);
    expect(resolveCommercialMapSunriseProgress(1_000, 1_000 + duration * 2)).toBe(1);
    expect(resolveCommercialMapSunriseProgress(Number.NaN, 2_000)).toBe(0);

    const samples = [0, 0.25, 0.5, 0.75, 1].map((progress) => (
      resolveCommercialMapSunriseFrame(progress)
    ));
    expect(resolveCommercialMapSunriseFrame(0.42)).toEqual(resolveCommercialMapSunriseFrame(0.42));
    expect(resolveCommercialMapSunriseFrame(-1)).toEqual(resolveCommercialMapSunriseFrame(0));
    expect(resolveCommercialMapSunriseFrame(2)).toEqual(resolveCommercialMapSunriseFrame(1));

    samples.forEach((frame, index) => {
      expect(frame.progress).toBe(index * 0.25);
      expect(Math.hypot(...frame.direction)).toBeCloseTo(1, 12);
      expect(frame.direction[0]).toBeCloseTo(0, 12);
      expect(frame.direction[2]).toBeLessThan(-0.99);
      if (index === 0) return;
      expect(frame.elevationDegrees).toBeGreaterThan(samples[index - 1].elevationDegrees);
      expect(frame.sunlightIntensity).toBeGreaterThanOrEqual(samples[index - 1].sunlightIntensity);
      expect(frame.environmentIntensity).toBeGreaterThanOrEqual(
        samples[index - 1].environmentIntensity,
      );
      expect(frame.shadowRadius).toBeLessThanOrEqual(samples[index - 1].shadowRadius);
    });

    expect(samples[0].direction[1]).toBeLessThan(0);
    expect(samples[0].sunlightIntensity).toBe(0);
    expect(samples.at(-1)?.direction[1]).toBeGreaterThan(0);
    expect(samples.at(-1)?.sunlightIntensity).toBe(
      COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.intensity,
    );
    expect(resolveCommercialMapSunriseFrame(1, 'hydrological').sunlightIntensity).toBe(
      COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.hydrologicalIntensity,
    );
  });

  it('seleciona um tier fixo por capacidade inicial e mantém layouts determinísticos', () => {
    expect(resolveCommercialMapSunriseQualityTier({
      reducedGraphics: false,
      viewportWidth: 1440,
      viewportHeight: 900,
      deviceMemory: 8,
      hardwareConcurrency: 8,
    })).toBe('full');
    expect(resolveCommercialMapSunriseQualityTier({
      reducedGraphics: false,
      viewportWidth: 390,
      viewportHeight: 844,
      deviceMemory: 8,
      hardwareConcurrency: 8,
    })).toBe('balanced');
    expect(resolveCommercialMapSunriseQualityTier({
      reducedGraphics: false,
      viewportWidth: 1920,
      viewportHeight: 1080,
      deviceMemory: 2,
      hardwareConcurrency: 8,
    })).toBe('reduced');
    expect(resolveCommercialMapSunriseQualityTier({
      reducedGraphics: true,
      viewportWidth: 1920,
      viewportHeight: 1080,
      deviceMemory: 16,
      hardwareConcurrency: 16,
    })).toBe('reduced');

    const tiers: readonly CommercialMapSunriseQualityTier[] = ['full', 'balanced', 'reduced'];
    const expectedCloudCounts = [7, 5, 4];
    tiers.forEach((tier, index) => {
      const firstLayout = resolveCommercialMapEnvironmentLayout(FULL_MAP_EXTENT, 'normal', tier);
      const secondLayout = resolveCommercialMapEnvironmentLayout(FULL_MAP_EXTENT, 'normal', tier);
      const clouds = resolveCommercialMapCloudPlacements(FULL_MAP_EXTENT, tier);

      expect(firstLayout).toEqual(secondLayout);
      expect(firstLayout.cloudCount).toBe(expectedCloudCounts[index]);
      expect(clouds).toHaveLength(expectedCloudCounts[index]);
      expect(firstLayout.visualSunDistance).toBeGreaterThanOrEqual(50_000);
      expect(firstLayout.visualSunDistance).toBeGreaterThan(FULL_MAP_EXTENT.diagonal * 250);
      expect(firstLayout).not.toHaveProperty('horizonOriginY');
      expect(firstLayout).not.toHaveProperty('horizonDistance');
      clouds.forEach((cloud) => {
        expect(cloud.position[1]).toBeGreaterThan(0);
        expect(cloud.scale.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
      });
    });

    const normal = resolveCommercialMapEnvironmentLayout(FULL_MAP_EXTENT, 'normal', 'full');
    const technical = resolveCommercialMapEnvironmentLayout(
      FULL_MAP_EXTENT,
      'hydrological',
      'full',
    );
    expect(normal.fogNear).toBeGreaterThan(FULL_MAP_EXTENT.diagonal);
    expect(normal.fogNear).toBeLessThan(normal.outerGroundSize);
    expect(normal.fogFar).toBeGreaterThan(normal.outerGroundSize);
    expect(technical.fogNear).toBeGreaterThan(normal.fogNear);
    expect(technical.fogFar).toBeGreaterThan(technical.fogNear);
  });

  it('explicita o orçamento visual e degrada somente as camadas caras por tier', () => {
    expect(commercialMapEnvironmentBudget('full')).toEqual({
      primaryDrawCalls: 5,
      skyDrawCalls: 1,
      sunDrawCalls: 1,
      sunIntegratedInSky: false,
      groundDrawCalls: 2,
      cloudDrawCalls: 1,
      cloudInstances: 7,
      animatedLayers: 5,
      postProcessingPasses: 2,
      shadowMapSize: 2048,
    });
    expect(commercialMapEnvironmentBudget('balanced')).toMatchObject({
      primaryDrawCalls: 5,
      sunDrawCalls: 1,
      sunIntegratedInSky: false,
      cloudInstances: 5,
      animatedLayers: 5,
      postProcessingPasses: 2,
      shadowMapSize: 1536,
    });
    expect(commercialMapEnvironmentBudget('reduced')).toMatchObject({
      primaryDrawCalls: 5,
      sunDrawCalls: 1,
      sunIntegratedInSky: false,
      cloudInstances: 4,
      animatedLayers: 5,
      postProcessingPasses: 0,
      shadowMapSize: 512,
    });
    expect(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.quality.full).toMatchObject({
      bloomLevels: 7,
      bloomEnabled: true,
    });
    expect(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.quality.balanced).toMatchObject({
      bloomLevels: 5,
      bloomEnabled: true,
    });
    expect(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.quality.reduced).toMatchObject({
      bloomLevels: 0,
      bloomEnabled: false,
    });
  });

  it('mantém shaders, recursos e pós-processamento persistentes no Canvas compartilhado', () => {
    const environment = source(
      'src/features/commercial-map/components/canvas/CommercialMapEnvironment.tsx',
    );
    const canvas = source(
      'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
    );

    expect(canvas).toContain('<CommercialMapEnvironment');
    expect(canvas).toContain('frameloop="demand"');
    expect(canvas).toContain('THREE.SRGBColorSpace');
    expect(canvas).toContain('THREE.ACESFilmicToneMapping');
    expect(environment.match(/\buseFrame\(/g)).toHaveLength(1);
    expect(environment).toContain('const sky = useMemo(');
    expect(environment).toContain('const celestialSun = useMemo(');
    expect(environment).toContain('const sunLight = useMemo(');
    expect(environment).toContain('const cloudLayer = useMemo(');
    expect(environment).toContain('new THREE.ShaderMaterial');
    expect(environment).toContain('<EffectComposer');
    expect(environment).toContain('multisampling={0}');
    expect(environment).toContain('<Bloom');
    expect(environment).toContain('luminanceThreshold={3.2}');
    expect(environment).toContain('levels={quality.bloomLevels}');
    expect(environment).not.toContain('SelectiveBloom');
    expect(environment).not.toContain('selection=');
    expect(environment).toContain('createCelestialSun');
    expect(environment).toContain('updateCelestialSun');
    expect(environment).not.toContain('new THREE.SphereGeometry');
    expect(environment).toContain('<primitive object={celestialSun}');
    expect(environment).not.toContain('bloomResolutionScale');
    expect(environment).not.toContain('resolutionScale=');
    expect(environment).toContain('<ToneMapping mode={ToneMappingMode.ACES_FILMIC} />');
    expect(environment).toContain('gl.compile(scene, camera)');
    expect(environment).toContain('scene.environment = reflectionTexture');
    expect(environment).toContain('scene.environment = previousEnvironment');
    expect(environment).toContain('gl.shadowMap.needsUpdate = true');
    expect(environment).toContain('if (isRunning && progress < 1) invalidate();');
    expect(environment).not.toContain('requestAnimationFrame');
    expect(environment).not.toContain('setInterval(');
    expect(environment).not.toContain('new THREE.PMREMGenerator');
    expect(environment).not.toContain('new THREE.WebGLCubeRenderTarget');
  });

  it('usa um único vetor entre horizonTarget, céu, esfera solar, nuvens e iluminação', () => {
    const environment = source(
      'src/features/commercial-map/components/canvas/CommercialMapEnvironment.tsx',
    );
    const environmentData = source(
      'src/features/commercial-map/data/commercialMapEnvironment.ts',
    );
    const store = source(
      'src/features/commercial-map/state/useCommercialMapStore.ts',
    );
    const authoredSunriseSources = `${environment}\n${environmentData}\n${store}`;

    expect(CAMERA_PRESETS.overview).toEqual({
      label: 'Visão geral',
      position: [0, 96, 108],
      target: [0, 0, 1],
    });
    expect(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.minimumCelestialDistance).toBe(50_000);
    expect(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise).not.toHaveProperty(
      'horizonOriginDepthRatio',
    );
    expect(environment).toContain('const sceneAnchor = useMemo(');
    expect(environment).toContain('const horizonTarget = useMemo(');
    expect(environment).toContain(
      'new THREE.Vector3(...COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.horizonDirection)',
    );
    expect(environment).toContain('layout.visualSunDistance');
    expect(environment).toContain('uDiscRadiusRatio');
    expect(environment).toContain('gl_Position.z = gl_Position.w');
    expect(environment).toContain(
      'sunrise.apparentDiscDiameterDegrees / 2',
    );
    expect(environment).toContain(
      '(material.uniforms.sunPosition.value as THREE.Vector3).set(...frame.direction)',
    );
    expect(environment).toContain(
      'sun.position.copy(sceneAnchor).addScaledVector(direction, celestialDistance)',
    );
    expect(environment).toContain(
      '(cloudMaterial.uniforms.uSunDirection.value as THREE.Vector3).copy(frameDirection)',
    );
    expect(environment).toContain(
      'sunLight.position.copy(sceneAnchor).addScaledVector(frameDirection, layout.sunDistance)',
    );
    expect(environment).toMatch(
      /projectedSunPosition\s*\.copy\(cameraWorldPosition\)\s*\.addScaledVector\(frameDirection, layout\.visualSunDistance\)/,
    );
    expect(environment).toMatch(
      /sunWorld: sceneAnchor\.clone\(\)\s*\.addScaledVector\(frameDirection, layout\.visualSunDistance\)/,
    );
    expect(environment).toContain('horizonTarget: horizonTarget.toArray()');
    expect(environment).not.toContain('horizonOrigin');
    expect(environmentData).not.toContain('horizonOriginY');
    expect(environmentData).not.toContain('horizonOriginDepthRatio');
    expect(environment).not.toContain('projectedSunPosition.copy(sun.position)');
    expect(environment).toContain('...camera.matrixWorld.elements');
    expect(environment).toContain('cameraPosition: camera.matrixWorld.elements');
    expect(environment).not.toContain('cameraNavigating');
    expect(environmentData).not.toContain('cameraNavigating');
    expect(authoredSunriseSources).not.toContain('prefers-reduced-motion');
    expect(authoredSunriseSources).not.toContain('matchMedia(');
    expect(authoredSunriseSources).not.toContain('reducedMotion');
  });

  it('permanece apresentação exterior sem domínio comercial paralelo', () => {
    const environment = source(
      'src/features/commercial-map/components/canvas/CommercialMapEnvironment.tsx',
    );

    expect(environment).toContain('mesh.raycast = NO_RAYCAST');
    expect(environment).toContain('depthWrite={false}');
    expect(environment).not.toContain('CommercialLot');
    expect(environment).not.toContain('MapEntity');
    expect(environment).not.toContain('officialReference2026');
  });
});
