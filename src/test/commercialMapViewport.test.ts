import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_DIRECTION,
  COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_TARGET_SHIFT_RATIO,
  COMMERCIAL_MAP_MANUAL_NAVIGATION_REFIT_SUPPRESSION_MS,
  COMMERCIAL_MAP_MAX_DISTANCE_FRAMING_MARGIN,
  COMMERCIAL_MAP_MIN_POLAR_ANGLE,
  COMMERCIAL_MAP_TOP_DIRECTION,
  clampCommercialMapCameraPosition,
  isCommercialMapHydrologicalPortraitViewport,
  resolveCommercialMapBoundingSphereRadius,
  resolveCommercialMapCameraDistanceBounds,
  resolveCommercialMapCameraFarPlane,
  resolveCommercialMapHydrologicalPortraitTargetShift,
  resolveCommercialMapPixelRatio,
  resolveCommercialMapCameraNearPlane,
  resolveCommercialMapSheetSnap,
  shouldSuppressCommercialMapResizeRefit,
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

  it('mantém piso de 1x quando o navegador informa DPR fracionário ou inválido', () => {
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
    })).toBe(1);
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
    })).toBe(1.5);
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
