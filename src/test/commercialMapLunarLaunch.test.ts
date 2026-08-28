import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import {
  LUNAR_LAUNCH_GESTURE,
  LUNAR_LAUNCH_HIT_TARGET,
  LUNAR_LAUNCH_RENDER_BUDGET,
  LUNAR_LAUNCH_TIMELINE,
  isDeliberateLunarSecondTap,
  lunarLaunchAltitudeAt,
  lunarLaunchPhaseAt,
  lunarLaunchThrustAt,
  resolveLunarLaunchQuality,
  sampleLunarLaunchMotion,
} from '@/features/commercial-map/utils/lunarLaunch';

const effectsSource = readFileSync(resolve(
  process.cwd(),
  'src/features/commercial-map/components/canvas/LunarRocketLaunchEffects.tsx',
), 'utf8');
const landmarkSource = readFileSync(resolve(
  process.cwd(),
  'src/features/commercial-map/components/canvas/StrategicLandmarks.tsx',
), 'utf8');
const canvasSource = readFileSync(resolve(
  process.cwd(),
  'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx',
), 'utf8');
const pageSource = readFileSync(resolve(
  process.cwd(),
  'src/features/commercial-map/CommercialMapPage.tsx',
), 'utf8');
const desktopStylesSource = readFileSync(resolve(
  process.cwd(),
  'src/features/commercial-map/commercial-map.css',
), 'utf8');
const mobileStylesSource = readFileSync(resolve(
  process.cwd(),
  'src/features/commercial-map/commercial-map-mobile.css',
), 'utf8');
const packageSource = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8');

describe('experiência cinematográfica do Foguete Lunar', () => {
  beforeEach(() => {
    useCommercialMapStore.setState({
      selectedEntityId: null,
      activePanel: 'details',
      cameraNavigating: false,
      selectedParkingBlockId: null,
      selectedParkingSpaceId: null,
      parkingInspectionOpen: false,
      parkingCameraView: 'overview',
      parkingCameraSequence: 0,
      lunarLaunchPhase: 'idle',
      lunarLaunchSequence: 0,
      lunarLaunchStartedAt: null,
      lunarLaunchSkipSequence: 0,
      lunarLaunchSkipRequested: false,
      lunarLaunchReturnSequence: 0,
      lunarLaunchReturnAvailable: false,
      lunarLaunchReturning: false,
      lunarLaunchPreviousPanel: null,
    });
  });

  it('mantém uma timeline determinística de 7,5 s com todos os estados explícitos', () => {
    expect(LUNAR_LAUNCH_TIMELINE.end).toBe(7.5);
    expect([
      lunarLaunchPhaseAt(0),
      lunarLaunchPhaseAt(LUNAR_LAUNCH_TIMELINE.liftoffStart),
      lunarLaunchPhaseAt(LUNAR_LAUNCH_TIMELINE.cameraTransitionStart),
      lunarLaunchPhaseAt(LUNAR_LAUNCH_TIMELINE.cinematicAscentStart),
      lunarLaunchPhaseAt(LUNAR_LAUNCH_TIMELINE.completionStart),
      lunarLaunchPhaseAt(LUNAR_LAUNCH_TIMELINE.cleanupStart),
      lunarLaunchPhaseAt(LUNAR_LAUNCH_TIMELINE.end),
    ]).toEqual([
      'ignition',
      'liftoff',
      'camera-transition',
      'cinematic-ascent',
      'completion',
      'cleanup',
      'idle',
    ]);
  });

  it('preserva o foguete no solo durante a ignição e acelera a subida sem recuos', () => {
    const samples = [0, 1.1, 1.18, 1.7, 2.88, 4.18, 5.4, 7.24]
      .map((elapsed) => lunarLaunchAltitudeAt(elapsed, 100, 3.8));

    expect(samples.slice(0, 3)).toEqual([0, 0, 0]);
    expect(samples.every((altitude, index) => index === 0 || altitude >= samples[index - 1])).toBe(true);
    expect(samples.at(-1)).toBeGreaterThanOrEqual(140);
    expect(lunarLaunchThrustAt(0)).toBe(0);
    expect(lunarLaunchThrustAt(1.05)).toBeGreaterThan(0.85);
    expect(lunarLaunchThrustAt(7.15)).toBeLessThan(0.02);
    expect(sampleLunarLaunchMotion(0.8, 100, 3.8)).toMatchObject({ phase: 'ignition', altitude: 0 });
  });

  it('aceita somente segundo toque próximo e intencional no alvo calibrado', () => {
    const first = { timeMs: 1_000, clientX: 120, clientY: 210 };
    expect(isDeliberateLunarSecondTap(first, {
      timeMs: 1_000 + LUNAR_LAUNCH_GESTURE.touchDoubleTapMaxMs,
      clientX: 120 + LUNAR_LAUNCH_GESTURE.touchDoubleTapMaxDistancePx,
      clientY: 210,
    })).toBe(true);
    expect(isDeliberateLunarSecondTap(first, { timeMs: 1_381, clientX: 120, clientY: 210 })).toBe(false);
    expect(isDeliberateLunarSecondTap(first, { timeMs: 1_200, clientX: 151, clientY: 210 })).toBe(false);
    expect(LUNAR_LAUNCH_HIT_TARGET.radius).toBeLessThanOrEqual(0.5);
  });

  it('reduz partículas antes de reduzir a experiência de câmera', () => {
    const standard = resolveLunarLaunchQuality({
      viewportWidth: 1440,
      viewportHeight: 900,
      reducedGraphics: false,
      hardwareConcurrency: 8,
      deviceMemoryGb: 8,
    });
    const mobile = resolveLunarLaunchQuality({
      viewportWidth: 390,
      viewportHeight: 844,
      reducedGraphics: false,
      hardwareConcurrency: 8,
      deviceMemoryGb: 8,
    });
    const reduced = resolveLunarLaunchQuality({
      viewportWidth: 390,
      viewportHeight: 844,
      reducedGraphics: true,
      hardwareConcurrency: 8,
      deviceMemoryGb: 8,
    });

    expect(standard.tier).toBe('standard');
    expect(mobile).toMatchObject({ tier: 'mobile', mobile: true, portrait: true });
    expect(reduced.tier).toBe('reduced');
    expect(standard.hotParticles).toBeGreaterThan(mobile.hotParticles);
    expect(mobile.hotParticles).toBeGreaterThan(reduced.hotParticles);
    expect(LUNAR_LAUNCH_RENDER_BUDGET.primaryDrawCalls).toBeLessThanOrEqual(6);
  });

  it('trava reentrada, restaura painel no skip e oferece retorno após conclusão', () => {
    useCommercialMapStore.setState({
      selectedParkingBlockId: 'parking:block-a',
      selectedParkingSpaceId: 'parking:space-a-01',
      parkingInspectionOpen: true,
      parkingCameraView: 'detail',
    });
    const store = useCommercialMapStore.getState();
    store.requestLunarLaunch();
    const firstSequence = useCommercialMapStore.getState().lunarLaunchSequence;
    expect(useCommercialMapStore.getState()).toMatchObject({
      lunarLaunchPhase: 'ignition',
      activePanel: null,
      cameraNavigating: true,
      selectedParkingBlockId: null,
      selectedParkingSpaceId: null,
      parkingInspectionOpen: false,
    });

    useCommercialMapStore.getState().requestLunarLaunch();
    expect(useCommercialMapStore.getState().lunarLaunchSequence).toBe(firstSequence);
    useCommercialMapStore.getState().setSelectedEntityId('entity:neighbor');
    expect(useCommercialMapStore.getState().selectedEntityId).toBeNull();
    useCommercialMapStore.getState().inspectParkingBlock('parking:block-b');
    expect(useCommercialMapStore.getState().parkingInspectionOpen).toBe(false);
    useCommercialMapStore.getState().requestLunarLaunchSkip();
    expect(useCommercialMapStore.getState()).toMatchObject({
      lunarLaunchPhase: 'cleanup',
      lunarLaunchSkipRequested: true,
    });
    useCommercialMapStore.getState().completeLunarLaunch(true);
    expect(useCommercialMapStore.getState()).toMatchObject({
      lunarLaunchPhase: 'idle',
      activePanel: 'details',
      lunarLaunchReturnAvailable: false,
      cameraNavigating: false,
    });

    useCommercialMapStore.getState().requestLunarLaunch();
    useCommercialMapStore.getState().completeLunarLaunch(false);
    expect(useCommercialMapStore.getState().lunarLaunchReturnAvailable).toBe(true);
    useCommercialMapStore.getState().inspectParkingBlock('parking:block-c');
    expect(useCommercialMapStore.getState().parkingInspectionOpen).toBe(true);
    useCommercialMapStore.getState().requestLunarLaunchReturn();
    expect(useCommercialMapStore.getState()).toMatchObject({
      lunarLaunchReturning: true,
      lunarLaunchReturnAvailable: false,
      cameraNavigating: true,
      parkingInspectionOpen: false,
    });
    useCommercialMapStore.getState().completeLunarLaunchReturn();
    expect(useCommercialMapStore.getState()).toMatchObject({
      lunarLaunchReturning: false,
      activePanel: 'details',
      cameraNavigating: false,
    });
  });

  it('mantém VFX em pools locais, alvo exclusivo e limpeza explícita sem dependência nova', () => {
    expect(effectsSource).toContain('name={LUNAR_LAUNCH_HIT_TARGET.objectName}');
    expect(effectsSource).toContain('THREE.DynamicDrawUsage');
    expect(effectsSource).toContain('<instancedMesh');
    expect(effectsSource).toContain('worldEffects.current.visible = false');
    expect(effectsSource).toContain('geometry.dispose()');
    expect(effectsSource).toContain('plume.current?.dispose()');
    expect(effectsSource).toContain('lastShadowRefresh.current = 0');
    expect(effectsSource).toContain("canvas.addEventListener('pointerdown', handleCanvasPointerDown, true)");
    expect(effectsSource).toContain('trySetPointerCapture(event.target, event.nativeEvent.pointerId)');
    expect(effectsSource).toContain('event.nativeEvent.timeStamp - lastTouchInteractionAt.current < 800');
    expect(effectsSource).toContain('event.nativeEvent.preventDefault()');
    expect(effectsSource).toContain('launchRoot.current.visible = !hideResetRocket');
    expect(landmarkSource).toContain('<LunarRocketLaunchRig');
    expect(landmarkSource).toContain('object.name === LUNAR_LAUNCH_HIT_TARGET.objectName');
    expect(landmarkSource).toContain('if (eventIntersectsLunarRocket(event)) return;');
    expect(landmarkSource).not.toContain('hole.absarc(');
    expect(landmarkSource.indexOf('<LunarRocketLaunchRig')).toBeLessThan(
      landmarkSource.indexOf('name="canteiro-compartilhado-arvore-lunar-apollo-xiv"'),
    );
    expect(pageSource).toContain('data-lunar-launch-skip');
    expect(pageSource).toContain('data-lunar-launch-return');
    expect(pageSource).toContain('hidden={!lunarLaunchActive}');
    expect(pageSource).toContain('lunarLaunchPreviousPanel === \'details\'');
    expect(canvasSource).toContain('interface LunarCameraSnapshot');
    expect(canvasSource).toContain('scratch.quaternion.slerpQuaternions(');
    expect(canvasSource).toContain('enabled={!lunarCameraLocked}');
    expect(canvasSource).toContain('completeLunarLaunch(false)');
    expect(canvasSource).toContain('const liveLaunchState = useCommercialMapStore.getState()');
    expect(canvasSource).toContain('liveLaunchState.lunarLaunchSkipRequested');
    expect(canvasSource.indexOf('liveLaunchState.lunarLaunchSkipRequested')).toBeLessThan(
      canvasSource.indexOf('elapsed >= LUNAR_LAUNCH_TIMELINE.end'),
    );
    expect(canvasSource).toContain('restoreLunarCamera(path.snapshot)');
    expect(canvasSource).toContain('resizeRefitSuppressedUntil.current = 0');
    expect(canvasSource).toContain("lunarLaunchPhase !== 'idle'");
    expect(canvasSource).toContain('cinematicHidden={lunarCinematicActive}');
    expect(canvasSource).toContain("visibility: cinematicHidden ? 'hidden' : 'visible'");
    expect(canvasSource).not.toContain('<EffectComposer');
    expect(desktopStylesSource).toMatch(/is-lunar-launch-active \.commercial-map-dock \{[\s\S]*?visibility: hidden;/);
    expect(mobileStylesSource).toContain('min-height: 2.75rem');
    expect(packageSource).not.toContain('"gsap"');
    expect(packageSource).not.toContain('"three.quarks"');
  });
});
