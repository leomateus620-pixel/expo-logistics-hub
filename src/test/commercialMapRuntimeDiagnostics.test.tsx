import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeFrameDiagnostics } from '@/features/commercial-map/components/canvas/CommercialMapRuntimeFrameDiagnostics';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import { recordCommercialMapFrame, summarizeCommercialMapRuntimeDiagnostics } from '@/features/commercial-map/utils/runtimeDiagnostics';

const runtime = vi.hoisted(() => ({
  gl: null as unknown,
  frame: null as null | ((state: unknown, delta: number) => void),
}));

vi.mock('@react-three/fiber', () => ({
  useThree: (select: (state: typeof runtime) => unknown) => select(runtime),
  useFrame: (callback: typeof runtime.frame) => { runtime.frame = callback; },
}));

function draw(deltaMs: number) {
  act(() => runtime.frame?.(runtime, deltaMs / 1000));
}

describe('runtime diagnostics retain real stalls and exclude actual inactive intervals', () => {
  beforeEach(() => {
    delete window.__commercialMapRuntimeDiagnostics;
    runtime.gl = {
      domElement: document.createElement('canvas'),
      info: { reset: vi.fn() },
      getContext: () => ({ isContextLost: () => false }),
    };
    useCommercialMapStore.setState({ cameraNavigating: false, lunarLaunchPhase: 'idle', lunarLaunchReturning: false });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.__commercialMapRuntimeDiagnostics;
    runtime.frame = null;
  });

  it('counts >250ms active stalls in samples, jank, average and P99', () => {
    render(<RuntimeFrameDiagnostics />);
    act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
    draw(8000); // first frame includes pre-gesture demand-idle time
    draw(16);
    draw(800); // actual continuous-interaction freeze
    draw(16);
    expect(window.__commercialMapRuntimeDiagnostics?.frameTimes.map((event) => event.duration)).toEqual([16, 800, 16]);
    expect(summarizeCommercialMapRuntimeDiagnostics()).toMatchObject({
      sampledFrames: 3, jankFrames: 1, averageFrameTimeMs: 277.33,
      p95FrameTimeMs: 800, p99FrameTimeMs: 800, onePercentLowFps: 1.3,
    });
  });

  it('excludes idle intervals even when no frame is rendered between separate gestures', () => {
    render(<RuntimeFrameDiagnostics />);
    draw(15000);
    act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
    draw(12000);
    draw(17);
    act(() => useCommercialMapStore.setState({ cameraNavigating: false }));
    // Demand mode need not render an idle frame before the next input.
    act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
    draw(9000);
    draw(18);
    expect(window.__commercialMapRuntimeDiagnostics?.frameTimes.map((event) => event.duration)).toEqual([17, 18]);
  });

  it('excludes hidden-tab and resume gaps while a deliberate lunar lock stays active', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    render(<RuntimeFrameDiagnostics />);
    act(() => useCommercialMapStore.setState({ lunarLaunchPhase: 'ignition' }));
    draw(16);
    draw(19);
    visibility.mockReturnValue('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    draw(20000);
    visibility.mockReturnValue('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    draw(30000);
    draw(900);
    expect(window.__commercialMapRuntimeDiagnostics?.frameTimes.map((event) => event.duration)).toEqual([19, 900]);
  });

  it('excludes context-recovery gaps and unregisters boundary listeners on unmount', () => {
    const gl = runtime.gl as { domElement: HTMLCanvasElement; getContext: () => { isContextLost: () => boolean } };
    const isContextLost = vi.fn(() => false);
    gl.getContext = () => ({ isContextLost });
    const removeListener = vi.spyOn(gl.domElement, 'removeEventListener');
    const view = render(<RuntimeFrameDiagnostics />);
    act(() => useCommercialMapStore.setState({ cameraNavigating: true }));
    draw(16);
    draw(21);
    isContextLost.mockReturnValue(true);
    act(() => gl.domElement.dispatchEvent(new Event('webglcontextlost')));
    draw(5000);
    isContextLost.mockReturnValue(false);
    draw(7000);
    draw(22);
    expect(window.__commercialMapRuntimeDiagnostics?.frameTimes.map((event) => event.duration)).toEqual([21, 22]);
    view.unmount();
    expect(removeListener).toHaveBeenCalledWith('webglcontextlost', expect.any(Function));
  });

  it('keeps telemetry bounded and rejects invalid values without dropping finite stalls', () => {
    for (const delta of [0, -1, Number.NaN, Infinity]) recordCommercialMapFrame(delta);
    expect(window.__commercialMapRuntimeDiagnostics).toBeUndefined();
    for (let index = 0; index < 300; index += 1) recordCommercialMapFrame(300 + index);
    expect(window.__commercialMapRuntimeDiagnostics?.frameTimes).toHaveLength(240);
    expect(summarizeCommercialMapRuntimeDiagnostics()).toMatchObject({ sampledFrames: 240, jankFrames: 240 });
  });
});
