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
  resolveCommercialMapEnvironmentLayout,
  resolveCommercialMapShadowFrustum,
  resolveCommercialMapSunriseFrame,
  resolveCommercialMapSunriseProgress,
  resolveCommercialMapSunriseQualityTier,
  type CommercialMapEnvironmentExtent,
  type CommercialMapSunriseQualityTier,
} from '@/features/commercial-map/data/commercialMapEnvironment';
import {
  resolveCommercialMapBoundingSphereRadius,
  resolveCommercialMapCameraDistanceBounds,
} from '@/features/commercial-map/utils/viewport';

const FULL_MAP_EXTENT: CommercialMapEnvironmentExtent = {
  centerX: 0,
  centerZ: 0,
  width: 120,
  depth: 90.545455,
  diagonal: Math.hypot(120, 90.545455),
  maxHeight: 24,
};

const source = (path: string) => readFileSync(resolve(path), 'utf8').replace(/\r\n/g, '\n');

describe('amanhecer premium compartilhado do Mapa Comercial', () => {
  it('mantém o terreno externo opaco atrás do mapa, sem borda alfa circular', () => {
    const environment = source(
      'src/features/commercial-map/components/canvas/CommercialMapEnvironment.tsx',
    );
    const ground = environment.slice(
      environment.indexOf('<mesh\n        rotation={[-Math.PI / 2, 0, 0]}'),
      environment.indexOf('<SunrisePostProcessing'),
    );

    expect(ground).toContain('layout.outerGroundSize, layout.outerGroundSize');
    expect(ground).toContain('position={[extent.centerX, -0.08, extent.centerZ]}');
    expect(ground).toContain('receiveShadow');
    expect(ground).toContain(
      '<primitive object={activeGroundMaterial} attach="material" dispose={null} />',
    );
    expect(ground).not.toContain('polygonOffset');
    expect(ground).not.toContain('transparent');
    expect(ground).not.toContain('depthWrite={false}');
    expect(ground).not.toContain('depthTest={false}');
    expect(environment).toContain('THREE.MirroredRepeatWrapping');
    expect(environment).not.toContain("context.globalCompositeOperation = 'destination-in'");
    expect(environment).not.toContain('const edgeMask = context.createRadialGradient');
    expect(environment).not.toContain('createOuterGroundTexture');
    expect(environment).not.toContain('CommercialMapOuterGroundTexture');
  });

  it('limita o shader multiescala ao material do outer ground e preserva fallback PBR', () => {
    const environment = source(
      'src/features/commercial-map/components/canvas/CommercialMapEnvironment.tsx',
    );
    const materialSetup = environment.slice(
      environment.indexOf('const activeGroundMaterial = useMemo(() => {'),
      environment.indexOf('const reflectionTextureWidth'),
    );

    expect(materialSetup).toContain("name: 'CommercialMapOuterGroundMaterial'");
    expect(materialSetup).toContain('new THREE.MeshStandardMaterial({');
    expect(materialSetup).toContain('resolveTerrainMultiscaleQualityOptions(');
    expect(materialSetup).toContain('qualityTier,');
    expect(materialSetup).toContain('[extent.centerX, extent.centerZ]');
    expect(materialSetup).toContain('applyTerrainMultiscaleDetail(material, terrainDetail)');
    expect(materialSetup).toContain('if (!terrainDetail) return material;');
    expect(materialSetup).toContain('catch (error)');
    expect(materialSetup).toContain('return createBaseMaterial();');
    expect(environment).toContain(
      'useEffect(() => () => activeGroundMaterial.dispose(), [activeGroundMaterial]);',
    );
    expect(environment).toContain(
      '[activeGroundMaterial, camera, gl, invalidate, requestSunrise, scene]',
    );
    expect(environment.match(/applyTerrainMultiscaleDetail\(/g)).toHaveLength(1);
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
    expect(sunrise.endElevationDegrees).toBeGreaterThanOrEqual(18);
    expect(sunrise.endElevationDegrees).toBeLessThanOrEqual(30);
    expect(horizon[0]).toBeCloseTo(0, 12);
    expect(horizon[1]).toBeCloseTo(0, 12);
    expect(horizon[2]).toBeCloseTo(-1, 12);
    expect(Math.hypot(...finalSun)).toBeCloseTo(1, 12);
    expect(finalSun[0]).toBeCloseTo(0, 12);
    expect(finalSun[1]).toBeGreaterThan(0);
    expect(finalSun[2]).toBeCloseTo(-Math.cos(24 * Math.PI / 180), 12);
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
      expect(frame.direction[2]).toBeLessThan(-0.9);
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

  it('seleciona um tier fixo e mantém o fog além de toda câmera e do mapa', () => {
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
    const desktopCameraBounds = resolveCommercialMapCameraDistanceBounds({
      bounds: FULL_MAP_EXTENT,
      verticalFovDegrees: 38,
      aspect: 1440 / 900,
    });
    tiers.forEach((tier) => {
      const firstLayout = resolveCommercialMapEnvironmentLayout(
        FULL_MAP_EXTENT,
        'normal',
        tier,
        desktopCameraBounds.maxDistance,
      );
      const secondLayout = resolveCommercialMapEnvironmentLayout(
        FULL_MAP_EXTENT,
        'normal',
        tier,
        desktopCameraBounds.maxDistance,
      );

      expect(firstLayout).toEqual(secondLayout);
      expect(firstLayout).not.toHaveProperty('cloudCount');
      expect(firstLayout.visualSunDistance).toBeGreaterThanOrEqual(50_000);
      expect(firstLayout.visualSunDistance).toBeGreaterThan(FULL_MAP_EXTENT.diagonal * 250);
      expect(firstLayout).not.toHaveProperty('horizonOriginY');
      expect(firstLayout).not.toHaveProperty('horizonDistance');
    });

    const normal = resolveCommercialMapEnvironmentLayout(
      FULL_MAP_EXTENT,
      'normal',
      'full',
      desktopCameraBounds.maxDistance,
    );
    const technical = resolveCommercialMapEnvironmentLayout(
      FULL_MAP_EXTENT,
      'hydrological',
      'full',
      desktopCameraBounds.maxDistance,
    );
    const boundingSphereRadius = resolveCommercialMapBoundingSphereRadius(FULL_MAP_EXTENT);
    const minimumFogClearance = desktopCameraBounds.maxDistance
      + boundingSphereRadius * COMMERCIAL_MAP_ENVIRONMENT_CONFIG.fog.mapClearanceRatio;
    expect(normal.fogNear).toBeGreaterThanOrEqual(minimumFogClearance);
    expect(normal.fogNear).toBeGreaterThan(desktopCameraBounds.maxDistance + boundingSphereRadius);
    expect(normal.outerGroundSize).toBeGreaterThanOrEqual(
      (desktopCameraBounds.maxDistance + boundingSphereRadius) * 12,
    );
    expect(normal.fogFar).toBeGreaterThan(normal.fogNear);
    expect(technical.fogNear).toBeGreaterThan(normal.fogNear);
    expect(technical.fogFar).toBeGreaterThan(technical.fogNear);
  });

  it('explicita o orçamento visual e degrada somente as camadas caras por tier', () => {
    expect(commercialMapEnvironmentBudget('full')).toEqual({
      primaryDrawCalls: 3,
      skyDrawCalls: 1,
      sunDrawCalls: 1,
      sunIntegratedInSky: false,
      groundDrawCalls: 1,
      cloudDrawCalls: 0,
      cloudInstances: 0,
      cloudsIntegratedInSky: true,
      animatedLayers: 4,
      // scene, Bloom/ACES, SMAA and the minimal post-SMAA sharpen.
      postProcessingPasses: 4,
      shadowMapSize: 2048,
    });
    expect(commercialMapEnvironmentBudget('balanced')).toMatchObject({
      primaryDrawCalls: 3,
      sunDrawCalls: 1,
      sunIntegratedInSky: false,
      cloudDrawCalls: 0,
      cloudInstances: 0,
      cloudsIntegratedInSky: true,
      animatedLayers: 4,
      postProcessingPasses: 3,
      shadowMapSize: 1536,
    });
    expect(commercialMapEnvironmentBudget('reduced')).toMatchObject({
      primaryDrawCalls: 3,
      sunDrawCalls: 1,
      sunIntegratedInSky: false,
      cloudDrawCalls: 0,
      cloudInstances: 0,
      cloudsIntegratedInSky: true,
      animatedLayers: 4,
      postProcessingPasses: 0,
      shadowMapSize: 512,
    });
    expect(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.quality.full).toMatchObject({
      bloomLevels: 7,
      bloomEnabled: true,
      smaaPreset: 'ultra',
    });
    expect(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.quality.balanced).toMatchObject({
      bloomLevels: 5,
      bloomEnabled: true,
      smaaPreset: 'high',
    });
    expect(COMMERCIAL_MAP_ENVIRONMENT_CONFIG.sunrise.quality.reduced).toMatchObject({
      bloomLevels: 0,
      bloomEnabled: false,
      smaaPreset: 'renderer-msaa',
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
    // One timeline subscriber plus the explicit persistent composer render pass.
    expect(environment.match(/\buseFrame\(/g)).toHaveLength(2);
    expect(environment).toContain('const sky = useMemo(');
    expect(environment).toContain('const celestialSun = useMemo(');
    expect(environment).toContain('const sunLight = useMemo(');
    expect(environment).not.toContain('const cloudLayer = useMemo(');
    expect(environment).not.toContain('createCloudLayer');
    expect(environment).not.toContain('createCloudTexture');
    expect(environment).not.toContain('new THREE.InstancedMesh');
    expect(environment).not.toContain('<primitive object={cloudLayer}');
    expect(environment).toContain('material.uniforms.authoredCloudOpacity');
    expect(environment).toContain('float cloudBand = smoothstep');
    expect(environment).toContain('float cloudDensity = smoothstep');
    expect(environment).toContain('composedSky = mix(composedSky, cloudColor, cloudDensity)');
    expect(environment).toContain('commercial-map-camera-safe-sunrise-sky-${mode}-v4');
    expect(environment).toContain('new THREE.ShaderMaterial');
    expect(environment).toContain('new EffectComposer(gl');
    expect(environment).toContain('multisampling: 0');
    expect(environment).toContain('frameBufferType: THREE.HalfFloatType');
    expect(environment).toContain('new BloomEffect(');
    expect(environment).toContain('luminanceThreshold: 3.2');
    expect(environment).toContain('levels: bloomLevels');
    expect(environment).not.toContain('SelectiveBloom');
    expect(environment).not.toContain('selection=');
    expect(environment).toContain('createCelestialSun');
    expect(environment).toContain('updateCelestialSun');
    expect(environment).not.toContain('new THREE.SphereGeometry');
    expect(environment).toContain('<primitive object={celestialSun}');
    expect(environment).not.toContain('bloomResolutionScale');
    expect(environment).not.toContain('resolutionScale=');
    expect(environment).toContain('new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })');
    expect(environment).toContain('new SMAAEffect({');
    expect(environment).toContain('SMAAPreset.ULTRA');
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

  it('usa um único vetor entre horizonTarget, céu integrado, esfera solar e iluminação', () => {
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
    expect(environment).toContain('vec2 solarDirection = normalize(vSunDirection.xz');
    expect(environment).toContain('vec3 lowerHorizon = mix(');
    expect(environment).toContain('float belowHorizon = 1.0 - smoothstep(-0.075, 0.008, altitude)');
    expect(environment).not.toContain('cloudMaterial.uniforms');
    // The shadow camera orbits the park anchor at the park-fitted distance,
    // never the wider scene extent that includes the regional highways.
    expect(environment).toContain(
      'sunLight.position.copy(shadowAnchor).addScaledVector(frameDirection, shadowFrustum.distance)',
    );
    expect(environment).toContain('resolveCommercialMapShadowFrustum(shadowExtent)');
    expect(environment).toContain('light.shadow.camera.updateProjectionMatrix()');
    expect(environment).not.toContain('layout.shadowSpan');
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

  it('ajusta o frustum de sombra ao parque, não às BRs, e cobre o amanhecer inteiro', () => {
    const park = { centerX: 4, centerZ: -2, width: 130, depth: 100, maxHeight: 14 };
    const frustum = resolveCommercialMapShadowFrustum(park);
    const inflated = resolveCommercialMapShadowFrustum({ ...park, width: 900, depth: 700 });
    const legacySquareHalfSpan = Math.max(park.width, park.depth)
      * COMMERCIAL_MAP_ENVIRONMENT_CONFIG.solar.shadowCoverageRatio;

    expect(frustum.anchor).toEqual([4, -2]);
    // Horizontal fit is the park width plus margin; vertical fit follows the
    // projected depth at 24° plus roof height, far tighter than the old square.
    expect(frustum.halfWidth).toBeGreaterThan(park.width / 2);
    expect(frustum.halfWidth).toBeLessThan(park.width / 2 * 1.15);
    expect(frustum.halfHeight).toBeGreaterThan(park.maxHeight);
    expect(frustum.halfHeight).toBeLessThan(legacySquareHalfSpan / 2);
    expect(frustum.halfWidth * frustum.halfHeight).toBeLessThan(legacySquareHalfSpan ** 2 / 2.5);
    // Depth range brackets the light distance tightly for bias precision.
    expect(frustum.near).toBeGreaterThan(frustum.distance * 0.6);
    expect(frustum.far).toBeLessThan(frustum.distance * 1.4);
    expect(frustum.near).toBeLessThan(frustum.far);
    // A scene extent inflated by highways would have spread the map 7× thinner.
    expect(inflated.halfWidth).toBeGreaterThan(frustum.halfWidth * 6);
    // Degenerate input never produces NaN or an inverted box.
    const degenerate = resolveCommercialMapShadowFrustum({
      centerX: 0, centerZ: 0, width: Number.NaN, depth: 0, maxHeight: Number.NaN,
    });
    expect(Number.isFinite(degenerate.halfWidth)).toBe(true);
    expect(degenerate.halfHeight).toBeGreaterThan(0);
    expect(degenerate.near).toBeLessThan(degenerate.far);
  });

  it('permanece apresentação exterior sem domínio comercial paralelo', () => {
    const environment = source(
      'src/features/commercial-map/components/canvas/CommercialMapEnvironment.tsx',
    );

    expect(environment).toContain('raycast={NO_RAYCAST}');
    expect(environment).toContain('material.depthWrite = false');
    expect(environment).toContain('depthWrite: false');
    expect(environment).not.toContain('CommercialMapSparseSunriseClouds');
    expect(environment).not.toContain('CommercialLot');
    expect(environment).not.toContain('MapEntity');
    expect(environment).not.toContain('officialReference2026');
  });
});
