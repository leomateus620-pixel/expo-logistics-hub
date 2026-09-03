import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COMMERCIAL_MAP_ADAPTIVE_QUALITY_FAST_WINDOWS,
  COMMERCIAL_MAP_ADAPTIVE_QUALITY_MIN_SAMPLED_FRAMES,
  COMMERCIAL_MAP_ADAPTIVE_QUALITY_SLOW_WINDOWS,
  COMMERCIAL_MAP_ADAPTIVE_QUALITY_UPGRADE_DWELL_MS,
  COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_DIRECTION,
  COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_TARGET_SHIFT_RATIO,
  COMMERCIAL_MAP_MANUAL_NAVIGATION_REFIT_SUPPRESSION_MS,
  COMMERCIAL_MAP_MAX_DISTANCE_FRAMING_MARGIN,
  COMMERCIAL_MAP_MIN_POLAR_ANGLE,
  COMMERCIAL_MAP_QUALITY_PRESETS,
  COMMERCIAL_MAP_QUALITY_TIER_ORDER,
  COMMERCIAL_MAP_TOP_DIRECTION,
  commercialMapQualitySceneRebuildsOnTierChange,
  resolveCommercialMapEnvironmentQualityTier,
  clampCommercialMapCameraPosition,
  createCommercialMapAdaptiveQualityState,
  isCommercialMapHydrologicalPortraitViewport,
  resolveCommercialMapAdaptiveQuality,
  resolveCommercialMapAdaptiveUpgradeWindows,
  resolveCommercialMapBoundingSphereRadius,
  resolveCommercialMapCameraDistanceBounds,
  resolveCommercialMapCameraFarPlane,
  resolveCommercialMapHydrologicalPortraitTargetShift,
  resolveCommercialMapPixelRatio,
  resolveCommercialMapQualityCeiling,
  resolveCommercialMapQualityPixelRatio,
  resolveCommercialMapCameraNearPlane,
  resolveCommercialMapSheetSnap,
  shouldSuppressCommercialMapResizeRefit,
  type CommercialMapAdaptiveQualityState,
  type CommercialMapQualityTier,
} from '@/features/commercial-map/utils/viewport';

const FULL_MAP_BOUNDS = {
  width: 120,
  depth: 90.545455,
  maxHeight: 24,
} as const;

describe('viewport mobile do Mapa Comercial', () => {
  it('recupera precisão de profundidade ao afastar de um close, sem cortar vistas baixas', () => {
    expect(resolveCommercialMapCameraNearPlane(8, 0.5)).toBe(0.035);
    expect(resolveCommercialMapCameraNearPlane(720, 390)).toBe(3);
    expect(resolveCommercialMapCameraNearPlane(720, 0.8)).toBe(0.2);
    expect(resolveCommercialMapCameraNearPlane(Number.NaN, Number.NaN)).toBe(0.035);
    for (const distance of [12, 30, 90, 260, 720]) {
      const near = resolveCommercialMapCameraNearPlane(distance, distance * 0.54);
      const far = 1446;
      const depthResolution = (distance * distance * (far - near)) / (far * near * (2 ** 24 - 1));
      expect(depthResolution).toBeLessThan(0.012);
    }
  });

  it('compõe a visão hídrica portrait sem reduzir o parque a uma faixa horizontal', () => {
    const [x, y, z] = COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_DIRECTION;

    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
    expect(y).toBeGreaterThan(0.9);
    expect(Math.abs(x)).toBeGreaterThan(Math.abs(z) * 3);
    expect(isCommercialMapHydrologicalPortraitViewport(390, 844)).toBe(true);
    expect(isCommercialMapHydrologicalPortraitViewport(430, 932)).toBe(true);
    expect(isCommercialMapHydrologicalPortraitViewport(844, 390)).toBe(false);
    expect(isCommercialMapHydrologicalPortraitViewport(720, 1280)).toBe(false);
    expect(resolveCommercialMapHydrologicalPortraitTargetShift(100)).toBe(
      100 * COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_TARGET_SHIFT_RATIO,
    );
  });

  it('mantém a câmera superior exatamente no clamp polar do OrbitControls', () => {
    const [x, y, z] = COMMERCIAL_MAP_TOP_DIRECTION;
    const length = Math.hypot(x, y, z);
    const polarAngle = Math.acos(y / length);
    const orbitClampedAngle = Math.max(COMMERCIAL_MAP_MIN_POLAR_ANGLE, polarAngle);
    const legacyDirectionPolarAngle = Math.acos(1 / Math.hypot(1, 0.001));

    expect(length).toBeCloseTo(1, 12);
    expect(polarAngle).toBeCloseTo(COMMERCIAL_MAP_MIN_POLAR_ANGLE, 12);
    expect(orbitClampedAngle).toBeCloseTo(polarAngle, 12);
    expect(legacyDirectionPolarAngle).toBeLessThan(COMMERCIAL_MAP_MIN_POLAR_ANGLE);
  });

  it.each([
    ['mobile portrait', 393, 852],
    ['mobile landscape', 852, 393],
    ['tablet portrait', 768, 1024],
    ['desktop', 1440, 900],
    ['ultrawide', 2560, 1080],
  ])('calcula o enquadramento responsivo do mapa completo em %s', (_label, width, height) => {
    const aspect = width / height;
    const result = resolveCommercialMapCameraDistanceBounds({
      bounds: FULL_MAP_BOUNDS,
      verticalFovDegrees: 38,
      aspect,
    });
    const expectedRadius = Math.hypot(
      FULL_MAP_BOUNDS.width / 2,
      FULL_MAP_BOUNDS.depth / 2,
      FULL_MAP_BOUNDS.maxHeight / 2,
    );
    const verticalHalfFov = 38 * Math.PI / 360;
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect);
    const limitingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
    const expectedFittedDistance = expectedRadius / Math.sin(limitingHalfFov);

    expect(result.boundingSphereRadius).toBeCloseTo(expectedRadius, 12);
    expect(result.limitingHalfFovRadians).toBeCloseTo(limitingHalfFov, 12);
    expect(result.fittedDistance).toBeCloseTo(expectedFittedDistance, 12);
    expect(result.maxDistance).toBeCloseTo(
      expectedFittedDistance * COMMERCIAL_MAP_MAX_DISTANCE_FRAMING_MARGIN,
      12,
    );
    expect(result.minDistance).toBeGreaterThanOrEqual(8);
    expect(result.minDistance).toBeLessThan(result.maxDistance);
    expect(resolveCommercialMapCameraFarPlane(FULL_MAP_BOUNDS, result.maxDistance))
      .toBe(Math.max(1_200, (result.maxDistance + expectedRadius) * 3));
  });

  it('aumenta o limite em portrait pela abertura horizontal sem usar valor fixo de tela', () => {
    const portrait = resolveCommercialMapCameraDistanceBounds({
      bounds: FULL_MAP_BOUNDS,
      verticalFovDegrees: 38,
      aspect: 393 / 852,
    });
    const landscape = resolveCommercialMapCameraDistanceBounds({
      bounds: FULL_MAP_BOUNDS,
      verticalFovDegrees: 38,
      aspect: 852 / 393,
    });
    const ultrawide = resolveCommercialMapCameraDistanceBounds({
      bounds: FULL_MAP_BOUNDS,
      verticalFovDegrees: 38,
      aspect: 2560 / 1080,
    });

    expect(portrait.maxDistance).toBeGreaterThan(landscape.maxDistance);
    expect(landscape.maxDistance).toBeCloseTo(ultrawide.maxDistance, 12);
    expect(resolveCommercialMapBoundingSphereRadius(FULL_MAP_BOUNDS)).toBe(
      portrait.boundingSphereRadius,
    );
  });

  it('clampa poses programáticas antes da animação e preserva direção e target', () => {
    const maximum = clampCommercialMapCameraPosition({
      position: [30, 40, 500],
      target: [10, 20, 0],
      minDistance: 20,
      maxDistance: 100,
    });
    const originalDirection = [20, 20, 500];
    const originalLength = Math.hypot(...originalDirection);

    expect(maximum.distance).toBe(100);
    expect(maximum.wasClamped).toBe(true);
    maximum.position.forEach((coordinate, index) => {
      const target = [10, 20, 0][index];
      expect((coordinate - target) / 100).toBeCloseTo(
        originalDirection[index] / originalLength,
        12,
      );
    });

    const minimum = clampCommercialMapCameraPosition({
      position: [0, 0, 1],
      target: [0, 0, 0],
      minDistance: 12,
      maxDistance: 100,
    });
    expect(minimum).toMatchObject({ position: [0, 0, 12], distance: 12, wasClamped: true });

    const coincident = clampCommercialMapCameraPosition({
      position: [4, 5, 6],
      target: [4, 5, 6],
      minDistance: 8,
      maxDistance: 100,
    });
    expect(coincident).toMatchObject({ position: [4, 13, 6], distance: 8, wasClamped: true });

    const sanitized = clampCommercialMapCameraPosition({
      position: [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
      target: [1, 2, 3],
      minDistance: 10,
      maxDistance: 30,
    });
    expect(sanitized.position.every(Number.isFinite)).toBe(true);
    expect(sanitized.distance).toBe(10);
  });

  it('integra o mesmo limite em OrbitControls e em todas as poses enfileiradas', () => {
    const canvas = readFileSync(resolve(
      'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
    ), 'utf8');
    const clampCalls = canvas.match(/clampCommercialMapCameraPosition\(\{/g) ?? [];

    expect(canvas).toContain('const cameraDistanceBounds = useMemo(');
    expect(canvas).toContain('const clampQueuedCameraPose = useCallback(');
    expect(canvas).toContain('clampQueuedCameraPose(minDistance, maxDistance, clampTarget);');
    expect(canvas).toContain('maxDistance={appliedControlLimits.maxDistance}');
    expect(canvas).toContain('desiredMaxDistance');
    expect(canvas).toContain('maxDistance: cameraDistanceBounds.maxDistance');
    expect(canvas).toContain('calculatedMaxDistance');
    expect(clampCalls.length).toBeGreaterThanOrEqual(4);
    expect(canvas).not.toContain('Math.max(260, extent.diagonal * 4.5)');
  });

  it.each([
    [390, 844],
    [393, 852],
    [430, 932],
    [393, 659],
    [844, 390],
  ])('mantém DPR nítido e controlado em %ix%i', (width, height) => {
    expect(resolveCommercialMapPixelRatio({
      devicePixelRatio: 3,
      viewportWidth: width,
      viewportHeight: height,
      reducedGraphics: false,
    })).toBe(2.25);
  });

  it('preserva DPR nativo em telas 1x e usa um modo reduzido explícito sem subpixel extremo', () => {
    expect(resolveCommercialMapPixelRatio({
      devicePixelRatio: 1,
      viewportWidth: 393,
      viewportHeight: 852,
      reducedGraphics: false,
    })).toBe(1);
    expect(resolveCommercialMapPixelRatio({
      devicePixelRatio: 3,
      viewportWidth: 393,
      viewportHeight: 852,
      reducedGraphics: true,
    })).toBe(1.35);
  });

  it('mantém piso de 1x quando ele cabe e permite subamostragem para honrar o orçamento real', () => {
    expect(resolveCommercialMapPixelRatio({
      devicePixelRatio: 0.75,
      viewportWidth: 393,
      viewportHeight: 852,
      reducedGraphics: false,
    })).toBe(1);
    expect(resolveCommercialMapPixelRatio({
      devicePixelRatio: 0.5,
      viewportWidth: 7680,
      viewportHeight: 4320,
      reducedGraphics: true,
    })).toBe(0.16);
    expect(resolveCommercialMapPixelRatio({
      devicePixelRatio: Number.NaN,
      viewportWidth: 1920,
      viewportHeight: 1080,
      reducedGraphics: false,
    })).toBe(1);
  });

  it('limita o orçamento em desktop retina sem afetar monitores 1x', () => {
    const retina = resolveCommercialMapPixelRatio({
      devicePixelRatio: 2,
      viewportWidth: 1920,
      viewportHeight: 1080,
      reducedGraphics: false,
    });
    expect(retina).toBeGreaterThanOrEqual(1.5);
    expect(retina).toBeLessThanOrEqual(1.75);
    expect(resolveCommercialMapPixelRatio({
      devicePixelRatio: 2,
      viewportWidth: 1366,
      viewportHeight: 1024,
      reducedGraphics: false,
    })).toBeGreaterThanOrEqual(1.5);
    expect(resolveCommercialMapPixelRatio({
      devicePixelRatio: 2,
      viewportWidth: 2560,
      viewportHeight: 1440,
      reducedGraphics: false,
    })).toBe(1.14);
  });

  it('nunca excede o orçamento de pixels, nem por piso nem por arredondamento', () => {
    const cases = [
      { width: 393, height: 852, dpr: 3, reducedGraphics: false, budget: 4_800_000 },
      { width: 2560, height: 1440, dpr: 2, reducedGraphics: false, budget: 4_800_000 },
      { width: 7680, height: 4320, dpr: 1, reducedGraphics: true, budget: 900_000 },
    ] as const;

    for (const sample of cases) {
      const ratio = resolveCommercialMapPixelRatio({
        devicePixelRatio: sample.dpr,
        viewportWidth: sample.width,
        viewportHeight: sample.height,
        reducedGraphics: sample.reducedGraphics,
      });
      expect(sample.width * sample.height * ratio * ratio).toBeLessThanOrEqual(sample.budget);
    }
  });

  it('expõe presets monotônicos e aplica o orçamento específico de cada tier', () => {
    const budgets = COMMERCIAL_MAP_QUALITY_TIER_ORDER.map(
      (tier) => COMMERCIAL_MAP_QUALITY_PRESETS[tier].pixelBudget,
    );
    const dprCaps = COMMERCIAL_MAP_QUALITY_TIER_ORDER.map(
      (tier) => COMMERCIAL_MAP_QUALITY_PRESETS[tier].maximumPixelRatio,
    );

    expect(budgets).toEqual([...budgets].sort((a, b) => a - b));
    expect(dprCaps).toEqual([...dprCaps].sort((a, b) => a - b));

    for (const tier of COMMERCIAL_MAP_QUALITY_TIER_ORDER) {
      const preset = COMMERCIAL_MAP_QUALITY_PRESETS[tier];
      const ratio = resolveCommercialMapQualityPixelRatio({
        qualityTier: tier,
        devicePixelRatio: 3,
        viewportWidth: 3840,
        viewportHeight: 2160,
      });
      expect(ratio).toBeLessThanOrEqual(preset.maximumPixelRatio);
      expect(3840 * 2160 * ratio * ratio).toBeLessThanOrEqual(preset.pixelBudget);
    }
  });

  it.each<{
    label: string;
    input: Parameters<typeof resolveCommercialMapQualityCeiling>[0];
    expected: CommercialMapQualityTier;
  }>([
    {
      label: 'mobile fraco',
      input: { viewportWidth: 390, viewportHeight: 844, devicePixelRatio: 3, deviceMemoryGb: 2, hardwareConcurrency: 2 },
      expected: 'LOW',
    },
    {
      label: 'mobile sem hints proprietários',
      input: { viewportWidth: 390, viewportHeight: 844, devicePixelRatio: 3 },
      expected: 'MEDIUM',
    },
    {
      label: 'mobile moderno',
      input: { viewportWidth: 390, viewportHeight: 844, devicePixelRatio: 3, hardwareConcurrency: 8 },
      expected: 'HIGH',
    },
    {
      label: 'desktop sem hints',
      input: { viewportWidth: 1440, viewportHeight: 900, devicePixelRatio: 1 },
      expected: 'HIGH',
    },
    {
      label: 'desktop forte',
      input: { viewportWidth: 1920, viewportHeight: 1080, devicePixelRatio: 2, deviceMemoryGb: 8, hardwareConcurrency: 8 },
      expected: 'ULTRA',
    },
    {
      label: 'retina 4K mesmo com CPU forte',
      input: { viewportWidth: 3840, viewportHeight: 2160, devicePixelRatio: 2, deviceMemoryGb: 16, hardwareConcurrency: 16 },
      expected: 'MEDIUM',
    },
  ])('limita a qualidade inicial por viewport, DPR, memória e cores em $label', ({ input, expected }) => {
    expect(resolveCommercialMapQualityCeiling(input)).toBe(expected);
    expect(createCommercialMapAdaptiveQualityState(input)).toEqual({
      tier: expected,
      consecutiveSlowWindows: 0,
      consecutiveFastWindows: 0,
      lastDowngradeAtMs: 0,
      downgradeStreak: 0,
    });
  });

  it('rebaixa somente após janelas lentas consecutivas e sem saltar tiers', () => {
    const sample = {
      viewportWidth: 1440,
      viewportHeight: 900,
      devicePixelRatio: 2,
      deviceMemoryGb: 8,
      hardwareConcurrency: 8,
      averageFrameTimeMs: 20,
      sampledFrames: COMMERCIAL_MAP_ADAPTIVE_QUALITY_MIN_SAMPLED_FRAMES,
    } as const;
    let state: CommercialMapAdaptiveQualityState = {
      tier: 'ULTRA',
      consecutiveSlowWindows: 0,
      consecutiveFastWindows: 0,
      lastDowngradeAtMs: 0,
      downgradeStreak: 0,
    };

    for (let index = 1; index < COMMERCIAL_MAP_ADAPTIVE_QUALITY_SLOW_WINDOWS; index += 1) {
      const decision = resolveCommercialMapAdaptiveQuality(state, sample);
      expect(decision.tier).toBe('ULTRA');
      expect(decision.changed).toBe(false);
      state = decision;
    }
    const downgrade = resolveCommercialMapAdaptiveQuality(state, sample);
    expect(downgrade).toMatchObject({
      tier: 'HIGH',
      changed: true,
      reason: 'sustained-slow-frames',
      hardwareCeiling: 'ULTRA',
    });
  });

  it('usa uma banda morta e exige mais janelas rápidas para recuperar qualidade', () => {
    const capabilities = {
      viewportWidth: 1440,
      viewportHeight: 900,
      devicePixelRatio: 2,
      deviceMemoryGb: 8,
      hardwareConcurrency: 8,
      sampledFrames: COMMERCIAL_MAP_ADAPTIVE_QUALITY_MIN_SAMPLED_FRAMES,
    } as const;
    let state: CommercialMapAdaptiveQualityState = {
      tier: 'HIGH',
      consecutiveSlowWindows: 0,
      consecutiveFastWindows: 0,
      lastDowngradeAtMs: 0,
      downgradeStreak: 0,
    };

    const slowStart = resolveCommercialMapAdaptiveQuality(state, {
      ...capabilities,
      averageFrameTimeMs: 23,
    });
    const deadBand = resolveCommercialMapAdaptiveQuality(slowStart, {
      ...capabilities,
      averageFrameTimeMs: 18,
    });
    expect(deadBand).toMatchObject({
      tier: 'HIGH',
      consecutiveSlowWindows: 0,
      consecutiveFastWindows: 0,
      changed: false,
    });
    state = deadBand;

    for (let index = 1; index < COMMERCIAL_MAP_ADAPTIVE_QUALITY_FAST_WINDOWS; index += 1) {
      const decision = resolveCommercialMapAdaptiveQuality(state, {
        ...capabilities,
        averageFrameTimeMs: 15.5,
      });
      expect(decision.tier).toBe('HIGH');
      expect(decision.changed).toBe(false);
      state = decision;
    }
    const upgrade = resolveCommercialMapAdaptiveQuality(state, {
      ...capabilities,
      averageFrameTimeMs: 15.5,
    });
    expect(upgrade).toMatchObject({
      tier: 'ULTRA',
      changed: true,
      reason: 'sustained-fast-frames',
    });
  });

  it('aplica queda defensiva imediata quando a capacidade muda e ignora amostras curtas', () => {
    const initial: CommercialMapAdaptiveQualityState = {
      tier: 'ULTRA',
      consecutiveSlowWindows: 1,
      consecutiveFastWindows: 0,
      lastDowngradeAtMs: 0,
      downgradeStreak: 0,
    };
    const hardwareCap = resolveCommercialMapAdaptiveQuality(initial, {
      viewportWidth: 390,
      viewportHeight: 844,
      devicePixelRatio: 3,
      deviceMemoryGb: 2,
      hardwareConcurrency: 2,
      averageFrameTimeMs: 16,
      sampledFrames: 60,
    });
    expect(hardwareCap).toMatchObject({ tier: 'LOW', reason: 'hardware-cap', changed: true });

    const insufficient = resolveCommercialMapAdaptiveQuality({
      tier: 'HIGH',
      consecutiveSlowWindows: 1,
      consecutiveFastWindows: 0,
      lastDowngradeAtMs: 0,
      downgradeStreak: 0,
    }, {
      viewportWidth: 1440,
      viewportHeight: 900,
      devicePixelRatio: 1,
      averageFrameTimeMs: 40,
      sampledFrames: COMMERCIAL_MAP_ADAPTIVE_QUALITY_MIN_SAMPLED_FRAMES - 1,
    });
    expect(insufficient).toMatchObject({
      tier: 'HIGH',
      consecutiveSlowWindows: 0,
      reason: 'insufficient-sample',
      changed: false,
    });
  });

  it('bloqueia HIGH↔MEDIUM com dwell e janelas rápidas crescentes após o rebaixamento', () => {
    const capabilities = {
      viewportWidth: 1440,
      viewportHeight: 900,
      devicePixelRatio: 2,
      deviceMemoryGb: 8,
      hardwareConcurrency: 8,
      sampledFrames: COMMERCIAL_MAP_ADAPTIVE_QUALITY_MIN_SAMPLED_FRAMES,
    } as const;
    let state: CommercialMapAdaptiveQualityState = {
      tier: 'HIGH',
      consecutiveSlowWindows: 0,
      consecutiveFastWindows: 0,
      lastDowngradeAtMs: 0,
      downgradeStreak: 0,
    };

    const firstSlow = resolveCommercialMapAdaptiveQuality(state, {
      ...capabilities,
      averageFrameTimeMs: 23,
      nowMs: 1_000,
    });
    const downgrade = resolveCommercialMapAdaptiveQuality(firstSlow, {
      ...capabilities,
      averageFrameTimeMs: 23,
      nowMs: 2_000,
    });
    expect(downgrade).toMatchObject({
      tier: 'MEDIUM',
      changed: true,
      reason: 'sustained-slow-frames',
      downgradeStreak: 1,
      lastDowngradeAtMs: 2_000,
    });

    const duringDwell = resolveCommercialMapAdaptiveQuality(downgrade, {
      ...capabilities,
      averageFrameTimeMs: 15,
      nowMs: 2_000 + COMMERCIAL_MAP_ADAPTIVE_QUALITY_UPGRADE_DWELL_MS - 1,
    });
    expect(duringDwell).toMatchObject({
      tier: 'MEDIUM',
      changed: false,
      consecutiveFastWindows: 0,
    });

    const requiredFastWindows = resolveCommercialMapAdaptiveUpgradeWindows(1);
    expect(requiredFastWindows).toBe(COMMERCIAL_MAP_ADAPTIVE_QUALITY_FAST_WINDOWS + 2);
    state = duringDwell;
    for (let index = 1; index < requiredFastWindows; index += 1) {
      const decision = resolveCommercialMapAdaptiveQuality(state, {
        ...capabilities,
        averageFrameTimeMs: 15,
        nowMs: 2_000 + COMMERCIAL_MAP_ADAPTIVE_QUALITY_UPGRADE_DWELL_MS + index,
      });
      expect(decision.tier).toBe('MEDIUM');
      expect(decision.changed).toBe(false);
      state = decision;
    }
    const upgrade = resolveCommercialMapAdaptiveQuality(state, {
      ...capabilities,
      averageFrameTimeMs: 15,
      nowMs: 2_000 + COMMERCIAL_MAP_ADAPTIVE_QUALITY_UPGRADE_DWELL_MS + requiredFastWindows,
    });
    expect(upgrade).toMatchObject({
      tier: 'HIGH',
      changed: true,
      reason: 'sustained-fast-frames',
      downgradeStreak: 0,
      lastDowngradeAtMs: 0,
    });
  });

  it('mantém HIGH e ULTRA no mesmo stack ambiental e só reconstrói em MEDIUM/LOW', () => {
    expect(resolveCommercialMapEnvironmentQualityTier('ULTRA')).toBe('full');
    expect(resolveCommercialMapEnvironmentQualityTier('HIGH')).toBe('full');
    expect(resolveCommercialMapEnvironmentQualityTier('MEDIUM')).toBe('balanced');
    expect(resolveCommercialMapEnvironmentQualityTier('LOW')).toBe('reduced');
    expect(commercialMapQualitySceneRebuildsOnTierChange('HIGH', 'ULTRA')).toBe(false);
    expect(commercialMapQualitySceneRebuildsOnTierChange('HIGH', 'MEDIUM')).toBe(true);
    expect(commercialMapQualitySceneRebuildsOnTierChange('MEDIUM', 'LOW')).toBe(true);
  });

  it('não usa preferências de movimento como entrada do pipeline gráfico', () => {
    const viewportSource = readFileSync(resolve(
      'src/features/commercial-map/utils/viewport.ts',
    ), 'utf8');

    expect(viewportSource).not.toMatch(/prefers-reduced-motion|reducedMotion/);
  });

  it('mantém o DPR estável antes, durante e depois da navegação', () => {
    const viewport = {
      devicePixelRatio: 3,
      viewportWidth: 393,
      viewportHeight: 852,
      reducedGraphics: false,
    };

    const navigationSamples = [false, true, false].map((cameraNavigating) => {
      const sample = { ...viewport, cameraNavigating };
      return resolveCommercialMapPixelRatio(sample);
    });
    const reducedNavigationSamples = [false, true, false].map((cameraNavigating) => {
      const sample = { ...viewport, reducedGraphics: true, cameraNavigating };
      return resolveCommercialMapPixelRatio(sample);
    });

    expect(navigationSamples).toEqual([2.25, 2.25, 2.25]);
    expect(reducedNavigationSamples).toEqual([1.35, 1.35, 1.35]);
  });

  it('faz a navegação manual vencer refits residuais do painel', () => {
    const navigationEndedAt = 10_000;
    const suppressionEndsAt = navigationEndedAt
      + COMMERCIAL_MAP_MANUAL_NAVIGATION_REFIT_SUPPRESSION_MS;

    expect(shouldSuppressCommercialMapResizeRefit(navigationEndedAt, suppressionEndsAt)).toBe(true);
    expect(shouldSuppressCommercialMapResizeRefit(suppressionEndsAt - 1, suppressionEndsAt)).toBe(true);
    expect(shouldSuppressCommercialMapResizeRefit(suppressionEndsAt, suppressionEndsAt)).toBe(false);
    expect(shouldSuppressCommercialMapResizeRefit(Number.NaN, suppressionEndsAt)).toBe(false);
  });

  it('resolve os três snaps do painel sem iniciar expandido', () => {
    expect(resolveCommercialMapSheetSnap(110, 760)).toBe('collapsed');
    expect(resolveCommercialMapSheetSnap(380, 760)).toBe('half');
    expect(resolveCommercialMapSheetSnap(600, 760)).toBe('expanded');
    expect(resolveCommercialMapSheetSnap(104, 338)).toBe('collapsed');
    expect(resolveCommercialMapSheetSnap(202, 338, 72)).toBe('expanded');
    expect(resolveCommercialMapSheetSnap(Number.NaN, 760)).toBe('half');
  });
});
