import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommercialMapAdaptiveQualityController } from '@/features/commercial-map/components/canvas/CommercialMapAdaptiveQuality';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import {
  createCommercialMapAdaptiveQualityState,
  resolveCommercialMapPixelRatio,
} from '@/features/commercial-map/utils/viewport';
import { resolveCommercialMapInteractionPixelRatio } from '@/features/commercial-map/utils/adaptiveQualityRuntime';

const runtime = vi.hoisted(() => {
  let pixelRatio = 1;
  return {
    gl: { getPixelRatio: () => pixelRatio },
    setDpr: vi.fn((next: number) => { pixelRatio = next; }),
    invalidate: vi.fn(),
    size: { width: 1280, height: 800 },
    frame: null as null | ((state: unknown, deltaSeconds: number) => void),
  };
});

vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: typeof runtime) => unknown) => selector(runtime),
  useFrame: (callback: typeof runtime.frame) => { runtime.frame = callback; },
}));
vi.mock('@/features/commercial-map/utils/runtimeDiagnostics', () => ({
  recordCommercialMapQualityDecision: vi.fn(),
}));

const capabilityHints = { deviceMemoryGb: 8, hardwareConcurrency: 8 };
const initialState = createCommercialMapAdaptiveQualityState({
  viewportWidth: 1280,
  viewportHeight: 800,
  devicePixelRatio: 2,
  ...capabilityHints,
});

describe('único proprietário do DPR do Mapa Comercial', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
    runtime.size = { width: 1280, height: 800 };
    runtime.setDpr(1);
    runtime.setDpr.mockClear();
    runtime.invalidate.mockClear();
    useCommercialMapStore.setState({
      cameraNavigating: false,
      lunarLaunchPhase: 'idle',
      lunarLaunchReturning: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('altera o drawing buffer somente nas bordas do gesto e restaura a base reduced mais recente', () => {
    const qualityChange = vi.fn();
    const props = { active: true, initialState, capabilityHints, onQualityChange: qualityChange };
    const view = render(<CommercialMapAdaptiveQualityController {...props} reducedGraphics={false} />);
    const baseDpr = runtime.gl.getPixelRatio();
    runtime.setDpr.mockClear();
    runtime.invalidate.mockClear();
    act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
    expect(runtime.setDpr).toHaveBeenCalledExactlyOnceWith(resolveCommercialMapInteractionPixelRatio(baseDpr));

    act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
    view.rerender(<CommercialMapAdaptiveQualityController {...props} reducedGraphics />);
    expect(runtime.setDpr).toHaveBeenCalledTimes(1);

    const reducedDpr = resolveCommercialMapPixelRatio({
      viewportWidth: 1280, viewportHeight: 800, devicePixelRatio: 2, reducedGraphics: true,
    });
    act(() => useCommercialMapStore.setState({ cameraNavigating: false }));
    expect(runtime.setDpr).toHaveBeenLastCalledWith(reducedDpr);
    expect(runtime.setDpr).toHaveBeenCalledTimes(2);
    expect(runtime.invalidate).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(1000));
    expect(runtime.setDpr).toHaveBeenCalledTimes(2);
  });

  it('aguarda 650 ms para trocar o tier de cena, sem rearmar o timer em cada frame ocioso', () => {
    const qualityChange = vi.fn();
    const props = { active: true, initialState, capabilityHints, reducedGraphics: false, onQualityChange: qualityChange };
    const view = render(<CommercialMapAdaptiveQualityController {...props} />);
    act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
    runtime.size = { width: 390, height: 844 };
    view.rerender(<CommercialMapAdaptiveQualityController {...props} capabilityHints={{ deviceMemoryGb: 3, hardwareConcurrency: 4 }} />);
    const deferredQuality = qualityChange.mock.lastCall?.[0];
    expect(deferredQuality.sceneTier).toBe(initialState.tier);
    expect(deferredQuality.tier).not.toBe(initialState.tier);

    act(() => useCommercialMapStore.setState({ cameraNavigating: false }));
    const writesAfterGesture = runtime.setDpr.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(600);
      runtime.frame?.({}, 0.016);
      vi.advanceTimersByTime(49);
    });
    expect(qualityChange.mock.lastCall?.[0].sceneTier).toBe(initialState.tier);
    act(() => vi.advanceTimersByTime(1));
    expect(qualityChange.mock.lastCall?.[0].sceneTier).toBe(deferredQuality.tier);
    expect(runtime.setDpr).toHaveBeenCalledTimes(writesAfterGesture);
  });

  it('não restaura a base entre gestos de câmera e fase lunar sobrepostos', () => {
    render(<CommercialMapAdaptiveQualityController
      active initialState={initialState} capabilityHints={capabilityHints} reducedGraphics={false}
    />);
    const baseDpr = runtime.gl.getPixelRatio();
    runtime.setDpr.mockClear();
    act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
    act(() => useCommercialMapStore.setState({ lunarLaunchPhase: 'ignition' }));
    act(() => useCommercialMapStore.setState({ cameraNavigating: false }));
    expect(runtime.setDpr).toHaveBeenCalledTimes(1);
    act(() => useCommercialMapStore.setState({ lunarLaunchPhase: 'idle', lunarLaunchReturning: true }));
    expect(runtime.setDpr).toHaveBeenCalledTimes(1);
    act(() => useCommercialMapStore.setState({ lunarLaunchReturning: false }));
    expect(runtime.setDpr).toHaveBeenNthCalledWith(1, resolveCommercialMapInteractionPixelRatio(baseDpr));
    expect(runtime.setDpr).toHaveBeenCalledTimes(2);
    expect(runtime.setDpr).toHaveBeenLastCalledWith(baseDpr);
  });

  it('não degrada várias vezes a mesma cena durante um gesto longo antes do tier pendente ser aplicado', () => {
    const qualityChange = vi.fn();
    render(<CommercialMapAdaptiveQualityController
      active
      initialState={{ ...initialState, tier: 'HIGH' }}
      capabilityHints={capabilityHints}
      reducedGraphics={false}
      onQualityChange={qualityChange}
    />);
    runtime.setDpr.mockClear();
    act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
    act(() => {
      // Six slow windows used to downgrade HIGH -> MEDIUM -> LOW without
      // ever measuring the lower tier: the actual scene stayed HIGH throughout.
      for (let frame = 0; frame < 270; frame += 1) runtime.frame?.({}, 0.03);
    });
    expect(qualityChange.mock.lastCall?.[0]).toMatchObject({ tier: 'MEDIUM', sceneTier: 'HIGH' });
    expect(qualityChange.mock.calls.some(([quality]) => quality.tier === 'LOW')).toBe(false);
    expect(runtime.setDpr).toHaveBeenCalledTimes(1);

    act(() => useCommercialMapStore.setState({ cameraNavigating: false }));
    expect(runtime.gl.getPixelRatio()).toBe(1.35);
    act(() => vi.advanceTimersByTime(650));
    expect(qualityChange.mock.lastCall?.[0]).toMatchObject({ tier: 'MEDIUM', sceneTier: 'MEDIUM' });

    // Further adaptation resumes only when it can measure the applied tier.
    act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
    act(() => {
      for (let frame = 0; frame < 90; frame += 1) runtime.frame?.({}, 0.03);
    });
    expect(qualityChange.mock.lastCall?.[0]).toMatchObject({ tier: 'LOW', sceneTier: 'MEDIUM' });
  });
});
