import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_DIRECTION,
  COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_TARGET_SHIFT_RATIO,
  COMMERCIAL_MAP_MANUAL_NAVIGATION_REFIT_SUPPRESSION_MS,
  COMMERCIAL_MAP_MIN_POLAR_ANGLE,
  COMMERCIAL_MAP_TOP_DIRECTION,
  isCommercialMapHydrologicalPortraitViewport,
  resolveCommercialMapHydrologicalPortraitTargetShift,
  resolveCommercialMapPixelRatio,
  resolveCommercialMapCameraNearPlane,
  resolveCommercialMapSheetSnap,
  shouldSuppressCommercialMapResizeRefit,
} from '@/features/commercial-map/utils/viewport';

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

  it('mantém o DPR estável durante a navegação para não redimensionar o drawing buffer', () => {
    const viewport = {
      devicePixelRatio: 3,
      viewportWidth: 393,
      viewportHeight: 852,
      reducedGraphics: false,
    };

    const idle = resolveCommercialMapPixelRatio(viewport);
    const navigating = resolveCommercialMapPixelRatio({ ...viewport, cameraNavigating: true });
    const recovered = resolveCommercialMapPixelRatio({ ...viewport, cameraNavigating: false });

    expect(idle).toBe(2.25);
    expect(navigating).toBe(idle);
    expect(recovered).toBe(idle);
    expect(resolveCommercialMapPixelRatio({
      ...viewport,
      reducedGraphics: true,
      cameraNavigating: true,
    })).toBe(1.35);
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
