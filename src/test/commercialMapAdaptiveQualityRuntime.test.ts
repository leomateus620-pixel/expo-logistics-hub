import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_MAP_ADAPTIVE_QUALITY_MAX_FRAME_GAP_MS,
  COMMERCIAL_MAP_QUALITY_SCENE_COMMIT_IDLE_MS,
  createCommercialMapFrameTimeWindow,
  isCommercialMapAdaptiveQualitySamplingActive,
  isCommercialMapHeavyQualityGestureActive,
  recordCommercialMapAdaptiveFrame,
  resolveCommercialMapInteractionPixelRatio,
  shouldApplyCommercialMapPixelRatioNow,
  shouldDeferCommercialMapSceneQuality,
} from '@/features/commercial-map/utils/adaptiveQualityRuntime';
import { COMMERCIAL_MAP_ADAPTIVE_QUALITY_MIN_SAMPLED_FRAMES } from '@/features/commercial-map/utils/viewport';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

describe('runtime de qualidade adaptativa do Mapa Comercial', () => {
  it('fecha uma janela somente após frames suficientes e calcula a média real', () => {
    const window = createCommercialMapFrameTimeWindow();
    for (let frame = 1; frame < COMMERCIAL_MAP_ADAPTIVE_QUALITY_MIN_SAMPLED_FRAMES; frame += 1) {
      expect(recordCommercialMapAdaptiveFrame(window, 16)).toBeNull();
    }

    expect(recordCommercialMapAdaptiveFrame(window, 20)).toEqual({
      averageFrameTimeMs: (
        16 * (COMMERCIAL_MAP_ADAPTIVE_QUALITY_MIN_SAMPLED_FRAMES - 1) + 20
      ) / COMMERCIAL_MAP_ADAPTIVE_QUALITY_MIN_SAMPLED_FRAMES,
      sampledFrames: COMMERCIAL_MAP_ADAPTIVE_QUALITY_MIN_SAMPLED_FRAMES,
    });
    expect(window.elapsedMs).toBe(0);
    expect(window.sampledFrames).toBe(0);
  });

  it('descarta pausas do frameloop demand em vez de tratá-las como custo da GPU', () => {
    const window = createCommercialMapFrameTimeWindow();
    recordCommercialMapAdaptiveFrame(window, 17);
    recordCommercialMapAdaptiveFrame(window, 18);

    expect(recordCommercialMapAdaptiveFrame(
      window,
      COMMERCIAL_MAP_ADAPTIVE_QUALITY_MAX_FRAME_GAP_MS + 1,
    )).toBeNull();
    expect(window.elapsedMs).toBe(0);
    expect(window.sampledFrames).toBe(0);
    expect(recordCommercialMapAdaptiveFrame(window, Number.NaN)).toBeNull();
    expect(recordCommercialMapAdaptiveFrame(window, 0)).toBeNull();
  });

  it('mede apenas quando mapa, documento e renderização contínua estão ativos', () => {
    expect(isCommercialMapAdaptiveQualitySamplingActive({
      mapActive: true,
      reducedGraphics: false,
      documentVisibilityState: 'visible',
      continuousRendering: true,
    })).toBe(true);

    for (const inactive of [
      { mapActive: false, reducedGraphics: false, documentVisibilityState: 'visible' as const, continuousRendering: true },
      { mapActive: true, reducedGraphics: true, documentVisibilityState: 'visible' as const, continuousRendering: true },
      { mapActive: true, reducedGraphics: false, documentVisibilityState: 'hidden' as const, continuousRendering: true },
      { mapActive: true, reducedGraphics: false, documentVisibilityState: 'visible' as const, continuousRendering: false },
    ]) {
      expect(isCommercialMapAdaptiveQualitySamplingActive(inactive)).toBe(false);
    }
  });

  it('integra pelo estado do R3F sem remount, timer paralelo ou reduced-motion', () => {
    const page = read('src/features/commercial-map/CommercialMapPage.tsx');
    const canvas = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');
    const controller = read(
      'src/features/commercial-map/components/canvas/CommercialMapAdaptiveQuality.tsx',
    );

    expect(page).toContain("active={workspaceMode === '3d'}");
    expect(canvas).toContain('<CommercialMapAdaptiveQualityController');
    expect(canvas).toContain('frameloop="demand"');
    expect(controller).toContain('const setDpr = useThree((state) => state.setDpr)');
    expect(controller).toContain('setDpr(nextDpr)');
    expect(controller).toContain('useFrame((_frameState, deltaSeconds) =>');
    expect(controller).toContain('sceneTier');
    expect(controller).toContain('idle-scene-commit');
    expect(controller).toContain(`setTimeout(() => {`);
    expect(controller).not.toMatch(/setInterval|requestAnimationFrame|prefers-reduced-motion|reducedMotion/);
  });

  it('separa o render scale transitório do DPR/tier adaptativo e adia rebuild para idle real', () => {
    expect(COMMERCIAL_MAP_QUALITY_SCENE_COMMIT_IDLE_MS).toBe(650);
    expect(isCommercialMapHeavyQualityGestureActive({
      cameraNavigating: true,
      lunarLaunchPhase: 'idle',
      lunarLaunchReturning: false,
    })).toBe(true);
    expect(isCommercialMapHeavyQualityGestureActive({
      cameraNavigating: false,
      lunarLaunchPhase: 'idle',
      lunarLaunchReturning: false,
    })).toBe(false);

    expect(shouldApplyCommercialMapPixelRatioNow({
      currentDpr: 1.75,
      nextDpr: 1.35,
      gestureActive: true,
    })).toBe(false);

    expect(resolveCommercialMapInteractionPixelRatio(2)).toBe(1);
    expect(resolveCommercialMapInteractionPixelRatio(1)).toBe(0.72);
    expect(resolveCommercialMapInteractionPixelRatio(0.8)).toBe(0.72);
    expect(resolveCommercialMapInteractionPixelRatio(0.65)).toBe(0.65);
    expect(resolveCommercialMapInteractionPixelRatio(Number.NaN)).toBe(0.72);
    expect(shouldApplyCommercialMapPixelRatioNow({
      currentDpr: 1.35,
      nextDpr: 1.75,
      gestureActive: true,
    })).toBe(false);
    expect(shouldApplyCommercialMapPixelRatioNow({
      currentDpr: 1.35,
      nextDpr: 1.75,
      gestureActive: false,
    })).toBe(true);
    expect(shouldApplyCommercialMapPixelRatioNow({
      currentDpr: 1.35,
      nextDpr: 1.352,
      gestureActive: true,
    })).toBe(true);

    expect(shouldDeferCommercialMapSceneQuality({
      fromTier: 'HIGH',
      toTier: 'MEDIUM',
      gestureActive: true,
    })).toBe(true);
    expect(shouldDeferCommercialMapSceneQuality({
      fromTier: 'HIGH',
      toTier: 'ULTRA',
      gestureActive: true,
    })).toBe(false);
    expect(shouldDeferCommercialMapSceneQuality({
      fromTier: 'HIGH',
      toTier: 'MEDIUM',
      gestureActive: false,
    })).toBe(false);
  });
});
