import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommercialMapAdaptiveQualityController } from '@/features/commercial-map/components/canvas/CommercialMapAdaptiveQuality';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import {
  createCommercialMapAdaptiveQualityState,
  resolveCommercialMapPixelRatio,
  resolveCommercialMapQualityPixelRatio,
} from '@/features/commercial-map/utils/viewport';
import { commercialMapFrameActivity } from '@/features/commercial-map/utils/frameActivity';
import { beginVisitQualitySession, readVisitQuality, setVisitQualityMotion } from '@/features/commercial-map/visit/VisitQualityManager';
import { visitRuntime } from '@/features/commercial-map/visit/visitRuntime';

const runtime = vi.hoisted(() => {
  let pixelRatio = 1;
  let storeDpr = 1;
  return {
    gl: { getPixelRatio: () => pixelRatio, domElement: document.createElement('canvas') },
    setDpr: vi.fn((next: number) => { pixelRatio = storeDpr = next; }),
    get: () => ({ viewport: { dpr: storeDpr } }),
    setStoreDprOnly: (next: number) => { storeDpr = next; },
    programsPreparing: false,
    invalidate: vi.fn(),
    size: { width: 1280, height: 800 },
    frame: null as null | ((state: unknown, deltaSeconds: number) => void),
  };
});

vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: typeof runtime) => unknown) => selector(runtime),
  useFrame: (callback: typeof runtime.frame) => { runtime.frame = (state, delta) => {
    commercialMapFrameActivity(runtime.gl).frames += 1;
    callback?.(state, delta);
  }; },
}));
vi.mock('@/features/commercial-map/utils/runtimeDiagnostics', () => ({
  recordCommercialMapQualityDecision: vi.fn(),
}));
vi.mock('@/features/commercial-map/utils/sceneShaderWarmup', () => ({
  isCommercialMapProgramPreparationActive: () => runtime.programsPreparing,
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
    runtime.programsPreparing = false;
    visitRuntime.renderingActive = false;
    runtime.gl.domElement.dataset.commercialMapHydration = 'complete';
    runtime.gl.domElement.dataset.commercialMapReady = 'true';
    delete runtime.gl.domElement.dataset.commercialMapPreparing;
    Object.assign(commercialMapFrameActivity(runtime.gl), { requested: 0, path: 'direct', frames: 0 });
    useCommercialMapStore.setState({
      cameraNavigating: false,
      lunarLaunchPhase: 'idle',
      lunarLaunchReturning: false,
    });
  });

  afterEach(() => {
    visitRuntime.renderingActive = false;
    cleanup();
    window.history.replaceState({}, '', '/');
    vi.useRealTimers();
  });

  it('não redimensiona quando o autofit termina durante a compilação inicial', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
    runtime.gl.domElement.dataset.commercialMapReady = 'false';
    runtime.programsPreparing = true;
    render(<CommercialMapAdaptiveQualityController active initialState={initialState} capabilityHints={capabilityHints} reducedGraphics={false} />);
    act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
    act(() => runtime.frame?.({}, .016));
    act(() => useCommercialMapStore.setState({ cameraNavigating: false }));
    act(() => runtime.frame?.({}, .016));
    expect(runtime.setDpr).not.toHaveBeenCalled();
    runtime.programsPreparing = false;
    act(() => runtime.frame?.({}, .016));
    expect(runtime.setDpr).not.toHaveBeenCalled();
    runtime.gl.domElement.dataset.commercialMapReady = 'true';
    act(() => { runtime.frame?.({}, .016); runtime.frame?.({}, .016); });
    expect(runtime.setDpr).not.toHaveBeenCalled();
    expect(runtime.gl.getPixelRatio()).toBe(1);
  });

  it('retém somente a última base enquanto shaders de uma camada opcional estão pendentes', () => {
    const props = { active: true, initialState, capabilityHints, reducedGraphics: false };
    const view = render(<CommercialMapAdaptiveQualityController {...props} />);
    runtime.setDpr.mockClear();
    runtime.programsPreparing = true;
    act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
    view.rerender(<CommercialMapAdaptiveQualityController {...props} reducedGraphics />);
    act(() => useCommercialMapStore.setState({ cameraNavigating: false }));
    act(() => runtime.frame?.({}, .016));
    expect(runtime.setDpr).not.toHaveBeenCalled();
    runtime.programsPreparing = false;
    act(() => { runtime.frame?.({}, .016); runtime.frame?.({}, .016); });
    const reducedDpr = resolveCommercialMapPixelRatio({ viewportWidth: 1280, viewportHeight: 800, devicePixelRatio: 2, reducedGraphics: true });
    expect(runtime.setDpr).toHaveBeenCalledExactlyOnceWith(reducedDpr);
  });

  it('reconcilia o DPR do R3F mesmo quando o renderer já corresponde à base desejada', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
    runtime.setStoreDprOnly(.9);
    render(<CommercialMapAdaptiveQualityController active initialState={initialState} capabilityHints={capabilityHints} reducedGraphics={false} />);
    expect(runtime.setDpr).toHaveBeenCalledExactlyOnceWith(1);
    expect(runtime.get().viewport.dpr).toBe(1);
  });

  it('conserva a restauração da visita quando a compilação adia entrada e saída', () => {
    render(<CommercialMapAdaptiveQualityController active initialState={initialState} capabilityHints={capabilityHints} reducedGraphics={false} />);
    const originalDpr = runtime.gl.getPixelRatio();
    runtime.setDpr.mockClear(); runtime.programsPreparing = true;
    let release: () => void = () => undefined;
    act(() => { release = beginVisitQualitySession(); });
    act(() => { release(); runtime.frame?.({}, .016); });
    expect(runtime.setDpr).not.toHaveBeenCalled();
    runtime.programsPreparing = false;
    act(() => { runtime.frame?.({}, .016); runtime.frame?.({}, .016); });
    expect(runtime.setDpr).not.toHaveBeenCalled();
    expect(runtime.gl.getPixelRatio()).toBe(originalDpr);
  });

  it('fixa o perfil QA antes do primeiro frame, mantém override no resize e remove o listener ao desmontar', () => {
    window.history.replaceState({}, '', '/?qualityQa=HIGH');
    const onQualityChange = vi.fn();
    const props = { active: true, initialState, capabilityHints, reducedGraphics: false, onQualityChange };
    const view = render(<CommercialMapAdaptiveQualityController {...props} />);
    expect(onQualityChange.mock.lastCall?.[0].sceneTier).toBe('HIGH');
    for (let cycle = 0; cycle < 20; cycle++) {
      const tier = cycle % 2 ? 'MEDIUM' : 'LOW';
      act(() => runtime.gl.domElement.dispatchEvent(new CustomEvent('commercial-map-quality-test', { detail: { tier } })));
      expect(onQualityChange.mock.lastCall?.[0].sceneTier).toBe(tier);
      runtime.size = { width: 1200 + cycle, height: 800 };
      view.rerender(<CommercialMapAdaptiveQualityController {...props} />);
      expect(onQualityChange.mock.lastCall?.[0].sceneTier).toBe(tier);
    }
    act(() => runtime.gl.domElement.dispatchEvent(new CustomEvent('commercial-map-quality-test', { detail: { tier: null } })));
    expect(onQualityChange.mock.lastCall?.[0].sceneTier).toBe('HIGH');
    view.unmount();
    onQualityChange.mockClear();
    runtime.gl.domElement.dispatchEvent(new CustomEvent('commercial-map-quality-test', { detail: { tier: 'LOW' } }));
    expect(onQualityChange).not.toHaveBeenCalled();
  });

  it('mantém DPR nas bordas, no movimento contínuo e durante o damping de gestos repetidos', () => {
    render(<CommercialMapAdaptiveQualityController active initialState={initialState} capabilityHints={capabilityHints} reducedGraphics={false} />);
    const baseDpr = runtime.gl.getPixelRatio();
    runtime.setDpr.mockClear();
    runtime.invalidate.mockClear();
    for (let cycle = 0; cycle < 20; cycle++) {
      act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
      act(() => { for (let frame = 0; frame < 20; frame++) runtime.frame?.({}, .016); });
      // The camera's existing settling detector keeps this signal true while
      // damping continues after release. No DPR write belongs to that tail.
      act(() => runtime.frame?.({}, .016));
      expect(runtime.gl.getPixelRatio()).toBe(baseDpr);
      act(() => useCommercialMapStore.setState({ cameraNavigating: false }));
      act(() => vi.advanceTimersByTime(650));
      expect(runtime.gl.getPixelRatio()).toBe(baseDpr);
    }
    expect(runtime.setDpr).not.toHaveBeenCalled();
    expect(runtime.invalidate).not.toHaveBeenCalled();
  });

  it('mantém o drawing buffer no gesto e aplica a base reduced mais recente somente ao parar', () => {
    const qualityChange = vi.fn();
    const props = { active: true, initialState, capabilityHints, onQualityChange: qualityChange };
    const view = render(<CommercialMapAdaptiveQualityController {...props} reducedGraphics={false} />);
    const baseDpr = runtime.gl.getPixelRatio();
    runtime.setDpr.mockClear();
    runtime.invalidate.mockClear();
    act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
    expect(runtime.setDpr).not.toHaveBeenCalled();
    expect(runtime.gl.getPixelRatio()).toBe(baseDpr);

    act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
    view.rerender(<CommercialMapAdaptiveQualityController {...props} reducedGraphics />);
    view.rerender(<CommercialMapAdaptiveQualityController {...props} reducedGraphics={false} />);
    view.rerender(<CommercialMapAdaptiveQualityController {...props} reducedGraphics />);
    expect(runtime.setDpr).not.toHaveBeenCalled();
    expect(runtime.gl.getPixelRatio()).toBe(baseDpr);

    const reducedDpr = resolveCommercialMapPixelRatio({
      viewportWidth: 1280, viewportHeight: 800, devicePixelRatio: 2, reducedGraphics: true,
    });
    act(() => useCommercialMapStore.setState({ cameraNavigating: false }));
    expect(runtime.setDpr).toHaveBeenCalledExactlyOnceWith(reducedDpr);
    expect(runtime.invalidate).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(runtime.setDpr).toHaveBeenCalledTimes(1);
  });

  it('retém a base do viewport e da orientação mais recente durante o gesto', () => {
    const props = { active: true, initialState, capabilityHints, reducedGraphics: false };
    const view = render(<CommercialMapAdaptiveQualityController {...props} />);
    const baseDpr = runtime.gl.getPixelRatio();
    runtime.setDpr.mockClear();
    act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
    runtime.size = { width: 1920, height: 1080 };
    view.rerender(<CommercialMapAdaptiveQualityController {...props} />);
    runtime.size = { width: 1080, height: 1920 };
    view.rerender(<CommercialMapAdaptiveQualityController {...props} />);
    expect(runtime.setDpr).not.toHaveBeenCalled();
    expect(runtime.gl.getPixelRatio()).toBe(baseDpr);
    const nextDpr = resolveCommercialMapQualityPixelRatio({
      viewportWidth: 1080, viewportHeight: 1920, devicePixelRatio: 2,
      ...capabilityHints, qualityTier: initialState.tier,
    });
    act(() => useCommercialMapStore.setState({ cameraNavigating: false }));
    expect(runtime.setDpr).toHaveBeenCalledExactlyOnceWith(nextDpr);
    expect(runtime.get().viewport.dpr).toBe(nextDpr);
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

  it('mantém a resolução entre gestos de câmera e fase lunar sobrepostos', () => {
    render(<CommercialMapAdaptiveQualityController
      active initialState={initialState} capabilityHints={capabilityHints} reducedGraphics={false}
    />);
    const baseDpr = runtime.gl.getPixelRatio();
    runtime.setDpr.mockClear();
    act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
    act(() => useCommercialMapStore.setState({ lunarLaunchPhase: 'ignition' }));
    act(() => useCommercialMapStore.setState({ cameraNavigating: false }));
    expect(runtime.setDpr).not.toHaveBeenCalled();
    act(() => useCommercialMapStore.setState({ lunarLaunchPhase: 'idle', lunarLaunchReturning: true }));
    expect(runtime.setDpr).not.toHaveBeenCalled();
    act(() => useCommercialMapStore.setState({ lunarLaunchReturning: false }));
    expect(runtime.setDpr).not.toHaveBeenCalled();
    expect(runtime.gl.getPixelRatio()).toBe(baseDpr);
  });

  it('reduz efeitos na lentidão persistente e mede o novo orçamento durante o gesto, sem redimensionar buffers', () => {
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
      for (let frame = 0; frame < 91; frame += 1) runtime.frame?.({}, 0.03);
    });
    expect(qualityChange.mock.lastCall?.[0]).toMatchObject({ tier: 'MEDIUM', effectTier: 'MEDIUM', sceneTier: 'HIGH' });
    expect(qualityChange.mock.calls.some(([quality]) => quality.tier === 'LOW')).toBe(false);
    expect(runtime.setDpr).not.toHaveBeenCalled();

    // A transition frame is discarded. The sustained slow workload after
    // applying the cheap budget remains measurable during long navigation.
    act(() => { for (let frame = 0; frame < 91; frame += 1) runtime.frame?.({}, 0.03); });
    expect(qualityChange.mock.lastCall?.[0]).toMatchObject({ tier: 'LOW', effectTier: 'LOW', sceneTier: 'HIGH' });
    expect(runtime.setDpr).not.toHaveBeenCalled();
    const pending = JSON.parse(runtime.gl.domElement.dataset.commercialMapQuality!);
    expect(pending).toMatchObject({ logicalTier: 'LOW', effectTier: 'LOW', sceneTier: 'HIGH', effectiveDpr: 1.75, baseDpr: 1 });

    act(() => useCommercialMapStore.setState({ cameraNavigating: false }));
    expect(runtime.setDpr).toHaveBeenCalledExactlyOnceWith(1);
    expect(runtime.gl.getPixelRatio()).toBe(1);
    act(() => vi.advanceTimersByTime(650));
    expect(qualityChange.mock.lastCall?.[0]).toMatchObject({ tier: 'LOW', effectTier: 'LOW', sceneTier: 'LOW' });
  });

  it('mantém o orçamento reduzido aplicado entre gestos sem novas trocas de efeito ou resolução', () => {
    const qualityChange = vi.fn();
    render(<CommercialMapAdaptiveQualityController active initialState={{ ...initialState, tier: 'HIGH' }} capabilityHints={capabilityHints} reducedGraphics={false} onQualityChange={qualityChange} />);
    act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
    act(() => { for (let frame = 0; frame < 91; frame += 1) runtime.frame?.({}, 0.03); });
    act(() => useCommercialMapStore.setState({ cameraNavigating: false }));
    act(() => vi.advanceTimersByTime(650));
    expect(qualityChange.mock.lastCall?.[0]).toMatchObject({ tier: 'MEDIUM', effectTier: 'MEDIUM', sceneTier: 'MEDIUM' });
    qualityChange.mockClear(); runtime.setDpr.mockClear();
    for (let cycle = 0; cycle < 20; cycle++) {
      act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
      act(() => { for (let frame = 0; frame < 20; frame += 1) runtime.frame?.({}, 0.016); });
      act(() => useCommercialMapStore.setState({ cameraNavigating: false }));
      act(() => vi.advanceTimersByTime(650));
    }
    expect(qualityChange).not.toHaveBeenCalled();
    expect(runtime.setDpr).not.toHaveBeenCalled();
  });

  it('não trata o intervalo ocioso inicial como stall, mas conta stalls no gesto ativo', () => {
    const onQualityChange = vi.fn();
    render(<CommercialMapAdaptiveQualityController active initialState={initialState} capabilityHints={capabilityHints} reducedGraphics={false} onQualityChange={onQualityChange} />);
    act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
    act(() => runtime.frame?.({}, 10));
    expect(onQualityChange.mock.lastCall?.[0].tier).toBe('HIGH');
    act(() => { for (let i = 0; i < 90; i++) runtime.frame?.({}, 0.5); });
    expect(onQualityChange.mock.lastCall?.[0].tier).toBe('MEDIUM');
  });

  it('restaura o orçamento anterior após 20 visitas sem recriar o proprietário do DPR', () => {
    const onQualityChange = vi.fn();
    render(<CommercialMapAdaptiveQualityController active initialState={initialState} capabilityHints={capabilityHints} reducedGraphics={false} onQualityChange={onQualityChange} />);
    const originalDpr = runtime.gl.getPixelRatio();
    const originalTier = onQualityChange.mock.lastCall?.[0].sceneTier;
    for (let cycle = 0; cycle < 20; cycle++) {
      let release: () => void = () => undefined;
      act(() => { release = beginVisitQualitySession(); });
      expect(runtime.gl.getPixelRatio()).toBe(1.1);
      expect(onQualityChange.mock.lastCall?.[0].sceneTier).toBe('MEDIUM');
      act(() => release());
      expect(runtime.gl.getPixelRatio()).toBe(originalDpr);
      expect(onQualityChange.mock.lastCall?.[0].sceneTier).toBe(originalTier);
      expect(readVisitQuality().enabled).toBe(false);
      expect(useCommercialMapStore.getState().cameraNavigating).toBe(false);
    }
  });

  it('mantém DPR na caminhada e aplica a redução medida ao parar sem degradar o modo tradicional', () => {
    const onQualityChange = vi.fn();
    render(<CommercialMapAdaptiveQualityController active initialState={initialState} capabilityHints={capabilityHints} reducedGraphics={false} onQualityChange={onQualityChange} />);
    const originalDpr = runtime.gl.getPixelRatio();
    let release: () => void = () => undefined;
    act(() => { release = beginVisitQualitySession(); setVisitQualityMotion(true); });
    try {
      runtime.setDpr.mockClear();
      visitRuntime.renderingActive = true;
      act(() => runtime.frame?.({}, .016));
      expect(runtime.gl.getPixelRatio()).toBe(1.1);
      expect(runtime.setDpr).not.toHaveBeenCalled();
      act(() => {
        for (let i = 0; i < 100; i++) {
          commercialMapFrameActivity(runtime.gl).requested = 8;
          runtime.frame?.({}, 0.05);
        }
      });
      expect(onQualityChange.mock.lastCall?.[0]).toMatchObject({ tier: 'LOW', sceneTier: 'MEDIUM' });
      expect(runtime.gl.getPixelRatio()).toBe(1.1);
      expect(runtime.setDpr).not.toHaveBeenCalled();
      visitRuntime.renderingActive = false;
      act(() => { runtime.frame?.({}, .016); vi.advanceTimersByTime(650); });
      expect(onQualityChange.mock.lastCall?.[0]).toMatchObject({ tier: 'LOW', sceneTier: 'LOW' });
      expect(runtime.gl.getPixelRatio()).toBe(0.85);
      expect(runtime.setDpr).toHaveBeenCalledExactlyOnceWith(0.85);
      expect(readVisitQuality().preset).toBe('PERFORMANCE');
      expect(useCommercialMapStore.getState().cameraNavigating).toBe(false);
    } finally { act(() => release()); }
    expect(runtime.gl.getPixelRatio()).toBe(originalDpr);
    expect(onQualityChange.mock.lastCall?.[0]).toMatchObject({ tier: 'HIGH', sceneTier: 'HIGH' });
  });

  it('amostra animação com compositor em repouso e ignora preparação e mudança de caminho', () => {
    const onQualityChange = vi.fn();
    render(<CommercialMapAdaptiveQualityController active initialState={initialState} capabilityHints={capabilityHints} reducedGraphics={false} onQualityChange={onQualityChange} />);
    const run = (count: number) => {
      for (let i = 0; i < count; i++) {
        Object.assign(commercialMapFrameActivity(runtime.gl), { requested: 1, path: 'post' });
        runtime.frame?.({}, 0.5);
      }
    };
    runtime.gl.domElement.dataset.commercialMapPreparing = 'true';
    act(() => run(100));
    expect(onQualityChange.mock.lastCall?.[0].tier).toBe('HIGH');
    delete runtime.gl.domElement.dataset.commercialMapPreparing;
    act(() => run(91));
    expect(onQualityChange.mock.lastCall?.[0].tier).toBe('MEDIUM');
  });
});
