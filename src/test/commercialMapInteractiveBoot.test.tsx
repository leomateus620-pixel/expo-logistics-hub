import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommercialMapInteractiveBoot } from '@/features/commercial-map/components/canvas/DeferredSceneLayer';
import { beginCommercialMapBoot, getCommercialMapBootSnapshot, resetCommercialMapReady } from '@/features/commercial-map/utils/performanceDiagnostics';
import { COMMERCIAL_MAP_PREPARING_EVENT, publishCommercialMapRenderHealth, type CommercialMapRenderHealth } from '@/features/commercial-map/utils/renderingHealth';

const runtime = vi.hoisted(() => ({
  gl: { domElement: document.createElement('canvas') }, controls: {} as object | undefined,
  invalidate: vi.fn(), compiling: false, frame: () => {},
}));
vi.mock('@react-three/fiber', () => ({
  useThree: (select: (state: typeof runtime) => unknown) => select(runtime),
  useFrame: (callback: () => void) => { runtime.frame = callback; },
}));
vi.mock('@/features/commercial-map/utils/sceneShaderWarmup', () => ({ isCommercialSceneCompiling: () => runtime.compiling }));
vi.mock('@/features/commercial-map/utils/hydrologyPreparationResource', () => ({ retainHydrologyPreparationOwner: () => () => {} }));

let now = 0;
let draws = 0;
function frame(interval: number, override: Partial<CommercialMapRenderHealth> = {}) {
  now += interval;
  act(() => {
    publishCommercialMapRenderHealth(runtime.gl.domElement, {
      status: 'ready', path: 'direct', presentedFrames: draws, contextLosses: 0, lastErrorCode: null, ...override,
    });
    runtime.frame(); // Like the real -0.5 callback, observes the previous screen draw.
  });
}
function prepare() {
  act(() => {
    resetCommercialMapReady();
    runtime.gl.domElement.dataset.commercialMapEssentialReady = 'false';
    runtime.gl.domElement.dispatchEvent(new Event(COMMERCIAL_MAP_PREPARING_EVENT));
  });
  frame(16);
  runtime.gl.domElement.dataset.commercialMapEssentialReady = 'true';
  frame(16);
}
beforeEach(() => {
  now = 1; draws = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  runtime.gl = { domElement: document.createElement('canvas') };
  runtime.controls = {}; runtime.compiling = false;
  beginCommercialMapBoot();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('commercial map actual presentation barrier', () => {
  it.each([101, 120, 250, 1000])('opens after three fresh successful draws at %i ms, without an FPS prerequisite', interval => {
    render(<CommercialMapInteractiveBoot />); prepare();
    for (draws = 1; draws <= 2; draws++) { frame(interval); expect(getCommercialMapBootSnapshot().commercialMapReady).toBe(false); }
    frame(interval);
    expect(getCommercialMapBootSnapshot().commercialMapReady).toBe(true);
    expect(runtime.gl.domElement.dataset.commercialMapInteractive).toBe('true');
  });
  it('does not count old draws, elapsed time or repeated callbacks as a new presentation', () => {
    draws = 50;
    render(<CommercialMapInteractiveBoot />); prepare();
    for (let i = 0; i < 200; i++) frame(1000);
    expect(getCommercialMapBootSnapshot().commercialMapReady).toBe(false);
    draws += 2; frame(120);
    expect(getCommercialMapBootSnapshot().commercialMapReady).toBe(false);
    draws++; frame(120);
    expect(getCommercialMapBootSnapshot().commercialMapReady).toBe(true);
  });
  it.each(['failed', 'context-lost', 'recovering'] as const)('never opens on %s and requires fresh recovery draws', status => {
    render(<CommercialMapInteractiveBoot />); prepare();
    draws = 10; frame(16, { status, path: 'suspended', lastErrorCode: 'test-failure' });
    expect(getCommercialMapBootSnapshot().commercialMapReady).toBe(false);
    prepare();
    draws += 2; frame(16);
    expect(getCommercialMapBootSnapshot().commercialMapReady).toBe(false);
    draws++; frame(16);
    expect(getCommercialMapBootSnapshot().commercialMapReady).toBe(true);
  });
  it('requires installed controls, essential preparation and a healthy screen target', () => {
    runtime.controls = undefined;
    const view = render(<CommercialMapInteractiveBoot />); prepare();
    draws = 10; frame(16);
    expect(getCommercialMapBootSnapshot().commercialMapReady).toBe(false);
    runtime.controls = {}; view.rerender(<CommercialMapInteractiveBoot />);
    runtime.compiling = true; frame(16);
    expect(getCommercialMapBootSnapshot().commercialMapReady).toBe(false);
    runtime.compiling = false; frame(16, { path: 'suspended' });
    expect(getCommercialMapBootSnapshot().commercialMapReady).toBe(false);
    prepare(); draws += 3; frame(16, { status: 'degraded', path: 'direct', lastErrorCode: 'post-shader-failed' });
    expect(getCommercialMapBootSnapshot().commercialMapReady).toBe(true);
  });
  it('requires another presentation after context loss even after the map was open', () => {
    render(<CommercialMapInteractiveBoot />); prepare();
    draws = 3; frame(16);
    expect(getCommercialMapBootSnapshot().commercialMapReady).toBe(true);
    act(() => runtime.gl.domElement.dispatchEvent(new Event('webglcontextlost')));
    prepare();
    frame(16);
    expect(getCommercialMapBootSnapshot().commercialMapReady).toBe(false);
    draws += 3; frame(250);
    expect(getCommercialMapBootSnapshot().commercialMapReady).toBe(true);
  });
});
