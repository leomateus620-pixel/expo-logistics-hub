import { StrictMode, useLayoutEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BlendFunction, type BloomEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect,
  type ToneMappingEffect, ToneMappingMode,
} from 'postprocessing';
import * as THREE from 'three';

const runtime = vi.hoisted(() => ({
  state: null as unknown,
  frame: null as null | ((state: unknown, delta: number) => void),
  priority: 0,
}));

vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: unknown) => unknown) => selector(runtime.state),
  useFrame: (callback: (state: unknown, delta: number) => void, priority = 0) => {
    runtime.frame = callback;
    runtime.priority = priority;
  },
}));

import { SunrisePostProcessing } from '@/features/commercial-map/components/canvas/CommercialMapEnvironment';
import { COMMERCIAL_MAP_RENDER_RETRY_EVENT, readCommercialMapRenderHealth } from '@/features/commercial-map/utils/renderingHealth';

function createRenderer() {
  const size = new THREE.Vector2(1366, 768);
  const viewport = new THREE.Vector4(0, 0, 1366, 768);
  const scissor = viewport.clone();
  let pixelRatio = 1;
  let currentTarget: THREE.WebGLRenderTarget | null = null;
  let scissorTest = false;
  const context = {
    FRAMEBUFFER: 0x8d40,
    FRAMEBUFFER_COMPLETE: 0x8cd5,
    getContextAttributes: () => ({ alpha: false }),
    getExtension: vi.fn(() => null),
    isContextLost: vi.fn(() => false),
    checkFramebufferStatus: vi.fn(() => 0x8cd5),
  };
  return {
    autoClear: true,
    toneMapping: THREE.ACESFilmicToneMapping,
    outputColorSpace: THREE.SRGBColorSpace,
    domElement: document.createElement('canvas'),
    debug: { onShaderError: undefined },
    shadowMap: { needsUpdate: false },
    capabilities: { isWebGL2: true },
    extensions: { has: () => false },
    getContext: () => context,
    getSize: (target: THREE.Vector2) => target.copy(size),
    getDrawingBufferSize: (target: THREE.Vector2) => target.copy(size).multiplyScalar(pixelRatio).floor(),
    getPixelRatio: () => pixelRatio,
    setPixelRatio: vi.fn((value: number) => { pixelRatio = value; }),
    setSize: vi.fn((width: number, height: number) => { size.set(width, height); }),
    getRenderTarget: () => currentTarget,
    setRenderTarget: vi.fn((target: THREE.WebGLRenderTarget | null) => { currentTarget = target; }),
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    getViewport: (target: THREE.Vector4) => target.copy(viewport),
    setViewport: vi.fn((x: number, y: number, width: number, height: number) => viewport.set(x, y, width, height)),
    getScissor: (target: THREE.Vector4) => target.copy(scissor),
    setScissor: vi.fn((x: number, y: number, width: number, height: number) => scissor.set(x, y, width, height)),
    getScissorTest: () => scissorTest,
    setScissorTest: vi.fn((enabled: boolean) => { scissorTest = enabled; }),
    render: vi.fn(), compile: vi.fn(), resetState: vi.fn(), forceContextRestore: vi.fn(), forceContextLoss: vi.fn(),
  } as unknown as THREE.WebGLRenderer;
}

function createRuntime() {
  const state = {
    gl: createRenderer(), scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(38, 1366 / 768, 0.05, 1200),
    size: { width: 1366, height: 768 }, viewport: { dpr: 1 },
    invalidate: vi.fn(), setDpr: vi.fn(),
  };
  state.setDpr.mockImplementation((dpr: number) => {
    state.viewport.dpr = dpr;
    state.gl.setPixelRatio(dpr);
  });
  runtime.state = state;
  return state;
}

function drawFrame() { act(() => runtime.frame?.(runtime.state, 1 / 60)); }

function listenerCount(effect: unknown) {
  return (effect as { _listeners?: { change?: unknown[] } })._listeners?.change?.length ?? 0;
}

function expectScreenBound(gl: THREE.WebGLRenderer, width = 1366, height = 768) {
  expect(gl.getRenderTarget()).toBeNull();
  expect(gl.getViewport(new THREE.Vector4()).toArray()).toEqual([0, 0, width, height]);
  expect(gl.getScissor(new THREE.Vector4()).toArray()).toEqual([0, 0, width, height]);
  expect(gl.getScissorTest()).toBe(false);
}

function loseContext(gl: THREE.WebGLRenderer) {
  vi.mocked(gl.getContext().isContextLost).mockReturnValue(true);
  act(() => gl.domElement.dispatchEvent(new Event('webglcontextlost')));
}

function restoreContext(gl: THREE.WebGLRenderer) {
  vi.mocked(gl.getContext().isContextLost).mockReturnValue(false);
  act(() => gl.domElement.dispatchEvent(new Event('webglcontextrestored')));
}

beforeEach(() => {
  // Real composer, passes, effects and lifecycle; only GPU submission is mocked.
  vi.spyOn(EffectComposer.prototype, 'render').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  runtime.frame = null;
});

describe('Commercial Map persistent post-processing with installed postprocessing classes', () => {
  it('prepares shared selection shaders once on the first frame in the real HDR target', () => {
    const { gl, scene, camera } = createRuntime();
    const targetsDuringCompile: (THREE.WebGLRenderTarget | null)[] = [];
    const highlights = new THREE.Group();
    highlights.name = 'commercial-map-selection-shader-warmup';
    highlights.visible = false;
    scene.add(highlights);
    vi.mocked(gl.compile).mockImplementation(() => {
      targetsDuringCompile.push(gl.getRenderTarget());
      return new Set<THREE.Material>();
    });
    const addPass = vi.spyOn(EffectComposer.prototype, 'addPass');
    const view = render(<SunrisePostProcessing qualityTier="balanced" enabled />);
    const composer = addPass.mock.instances[0] as unknown as EffectComposer;
    expect(gl.compile).not.toHaveBeenCalled();
    drawFrame();
    expect(gl.compile).toHaveBeenCalledWith(highlights, camera, scene);
    expect(targetsDuringCompile).toEqual([composer.inputBuffer]);
    expectScreenBound(gl);
    for (let cycle = 0; cycle < 20; cycle += 1) {
      view.rerender(<SunrisePostProcessing qualityTier="balanced" enabled={false} />);
      drawFrame();
      view.rerender(<SunrisePostProcessing qualityTier="balanced" enabled />);
      drawFrame();
    }
    expect(gl.compile).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('adds one post-SMAA sharpen pass on full and sizes targets only at frame start', () => {
    const { gl } = createRuntime();
    const addPass = vi.spyOn(EffectComposer.prototype, 'addPass');
    const setSize = vi.spyOn(EffectComposer.prototype, 'setSize');
    const view = render(<SunrisePostProcessing qualityTier="full" enabled />);
    const composer = addPass.mock.instances[0] as unknown as EffectComposer;
    const sharpenPass = composer.passes[3] as unknown as { effects: { name: string }[] };
    expect(composer.passes).toHaveLength(4);
    expect(composer.passes[3]).toBeInstanceOf(EffectPass);
    expect(sharpenPass.effects.map((effect) => effect.name)).toEqual(['CommercialMapSharpenEffect']);
    expect(composer.passes[3].renderToScreen).toBe(true);
    expect(composer.passes[2].renderToScreen).toBe(false);
    expect(gl.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    drawFrame();
    expect(setSize).toHaveBeenCalledWith(1366, 768);
    expect(gl.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expectScreenBound(gl);
    view.unmount();
  });

  it('retains HDR, anti-aliasing and Bloom -> ACES with SMAA screen output on balanced', () => {
    const { gl } = createRuntime();
    const addPass = vi.spyOn(EffectComposer.prototype, 'addPass');
    const view = render(<SunrisePostProcessing qualityTier="balanced" enabled />);
    const composer = addPass.mock.instances[0] as unknown as EffectComposer;
    const [bloom, toneMapping] = (composer.passes[1] as unknown as { effects: [BloomEffect, ToneMappingEffect] }).effects;
    const [smaa] = (composer.passes[2] as unknown as { effects: [SMAAEffect] }).effects;
    expect(composer.passes).toHaveLength(4);
    expect(composer.passes[0]).toBeInstanceOf(RenderPass);
    expect(composer.passes.slice(1).every((pass) => pass instanceof EffectPass)).toBe(true);
    expect(composer.passes[3].enabled).toBe(false);
    expect(composer.passes[3].renderToScreen).toBe(false);
    expect(composer.passes[2].renderToScreen).toBe(true);
    expect(composer.autoRenderToScreen).toBe(false);
    expect(composer.inputBuffer.texture.type).toBe(THREE.HalfFloatType);
    expect(composer.multisampling).toBe(0);
    expect(bloom.getAttributes()).toBe(0);
    expect(toneMapping.getAttributes()).toBe(0);
    expect(bloom.blendMode.blendFunction).toBe(BlendFunction.ADD);
    expect(bloom.intensity).toBe(0.58);
    expect(bloom.luminanceMaterial.threshold).toBe(3.2);
    expect(bloom.luminanceMaterial.smoothing).toBe(0.16);
    expect(bloom.mipmapBlurPass.enabled).toBe(true);
    expect(bloom.mipmapBlurPass.levels).toBe(7);
    expect(toneMapping.mode).toBe(ToneMappingMode.ACES_FILMIC);
    expect(smaa).toBeInstanceOf(SMAAEffect);
    expect(smaa.edgeDetectionMaterial.edgeDetectionThreshold).toBeCloseTo(0.05);
    expect(gl.autoClear).toBe(true);
    const dispose = vi.spyOn(composer, 'dispose');
    view.unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps one enabled screen output and stable targets through 20 full/balanced/reduced cycles', () => {
    const { gl } = createRuntime();
    const addPass = vi.spyOn(EffectComposer.prototype, 'addPass');
    const dispose = vi.spyOn(EffectComposer.prototype, 'dispose');
    const view = render(<SunrisePostProcessing qualityTier="full" enabled />);
    const composer = addPass.mock.instances[0] as unknown as EffectComposer;
    const input = composer.inputBuffer;
    const output = composer.outputBuffer;
    for (let cycle = 0; cycle < 20; cycle += 1) {
      for (const tier of ['full', 'balanced', 'reduced'] as const) {
        view.rerender(<SunrisePostProcessing qualityTier={tier} enabled />);
        expect(runtime.priority).toBe(1);
        expect(composer.passes.filter((pass) => pass.enabled && pass.renderToScreen)).toHaveLength(1);
        gl.setRenderTarget(input);
        const postFrames = vi.mocked(composer.render).mock.calls.length;
        const directFrames = vi.mocked(gl.render).mock.calls.length;
        drawFrame();
        expectScreenBound(gl);
        expect(vi.mocked(composer.render).mock.calls.length - postFrames).toBe(tier === 'reduced' ? 0 : 1);
        expect(vi.mocked(gl.render).mock.calls.length - directFrames).toBe(tier === 'reduced' ? 1 : 0);
        expect(gl.toneMapping).toBe(THREE.ACESFilmicToneMapping);
      }
    }
    expect(addPass).toHaveBeenCalledTimes(4);
    expect(dispose).not.toHaveBeenCalled();
    expect(composer.inputBuffer).toBe(input);
    expect(composer.outputBuffer).toBe(output);
    view.unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('never owns DPR; interaction renders direct without resizing dormant post targets', () => {
    const state = createRuntime();
    const addPass = vi.spyOn(EffectComposer.prototype, 'addPass');
    const setSize = vi.spyOn(EffectComposer.prototype, 'setSize');
    const view = render(<SunrisePostProcessing qualityTier="full" enabled />);
    drawFrame();
    const sizeCallsAtRest = setSize.mock.calls.length;
    view.rerender(<SunrisePostProcessing qualityTier="full" enabled interactionActive />);
    state.gl.setRenderTarget((addPass.mock.instances[0] as unknown as EffectComposer).inputBuffer);
    drawFrame();
    expectScreenBound(state.gl);
    expect(state.gl.render).toHaveBeenCalledOnce();
    expect(setSize).toHaveBeenCalledTimes(sizeCallsAtRest);
    view.rerender(<SunrisePostProcessing qualityTier="full" enabled />);
    drawFrame();
    expect(state.setDpr).not.toHaveBeenCalled();
    expect(state.gl.setPixelRatio).not.toHaveBeenCalled();
    expect(setSize).toHaveBeenCalledTimes(sizeCallsAtRest);
    state.gl.setPixelRatio(0.8);
    state.viewport.dpr = 0.8;
    view.rerender(<SunrisePostProcessing qualityTier="full" enabled />);
    drawFrame();
    expect(setSize).toHaveBeenCalledTimes(sizeCallsAtRest + 1);
    expect(state.setDpr).not.toHaveBeenCalled();
    expect(addPass).toHaveBeenCalledTimes(4);
  });

  it('keeps effect listeners through 20 interior cycles and validates a resize at frame start', () => {
    const state = createRuntime();
    const { gl } = state;
    const addPass = vi.spyOn(EffectComposer.prototype, 'addPass');
    const dispose = vi.spyOn(EffectComposer.prototype, 'dispose');
    const view = render(<SunrisePostProcessing qualityTier="full" enabled />);
    const composer = addPass.mock.instances[0] as unknown as EffectComposer;
    const passes = [...composer.passes];
    const input = composer.inputBuffer;
    const output = composer.outputBuffer;
    const effects = (passes[1] as unknown as { effects: unknown[] }).effects;
    drawFrame();
    for (let index = 0; index < 20; index += 1) {
      view.rerender(<SunrisePostProcessing qualityTier="full" enabled={false} />);
      drawFrame();
      expect(gl.toneMapping).toBe(THREE.ACESFilmicToneMapping);
      expect(gl.autoClear).toBe(true);
      expect(runtime.priority).toBe(1);
      view.rerender(<SunrisePostProcessing qualityTier="full" enabled />);
      drawFrame();
    }
    expect(addPass).toHaveBeenCalledTimes(4);
    expect(dispose).not.toHaveBeenCalled();
    expect(composer.passes).toEqual(passes);
    expect(composer.inputBuffer).toBe(input);
    expect(composer.outputBuffer).toBe(output);
    const smaaEffects = (passes[2] as unknown as { effects: unknown[] }).effects;
    expect([...effects, ...smaaEffects].map(listenerCount)).toEqual([1, 1, 1]);
    const checks = vi.mocked(gl.getContext().checkFramebufferStatus).mock.calls.length;
    state.size = { width: 844, height: 390 };
    gl.setSize(844, 390);
    view.rerender(<SunrisePostProcessing qualityTier="full" enabled />);
    expect(input.width).toBe(1366);
    drawFrame();
    expect(input.width).toBe(844);
    expect(input.height).toBe(390);
    expect(vi.mocked(gl.getContext().checkFramebufferStatus).mock.calls.length).toBeGreaterThan(checks);
    expectScreenBound(gl, 844, 390);
    view.unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect([...effects, ...smaaEffects].map(listenerCount)).toEqual([0, 0, 0]);
    expect(gl.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(gl.autoClear).toBe(true);
  });

  it('temporarily applies direct ACES but restores original settings after each frame and unmount', () => {
    const { gl } = createRuntime();
    gl.toneMapping = THREE.ReinhardToneMapping;
    gl.autoClear = false;
    vi.mocked(gl.render).mockImplementation(() => {
      expect(gl.toneMapping).toBe(THREE.ACESFilmicToneMapping);
      expect(gl.autoClear).toBe(true);
      expectScreenBound(gl);
    });
    const view = render(<SunrisePostProcessing qualityTier="balanced" enabled={false} />);
    expect(gl.toneMapping).toBe(THREE.ReinhardToneMapping);
    expect(gl.autoClear).toBe(false);
    drawFrame();
    expect(gl.toneMapping).toBe(THREE.ReinhardToneMapping);
    expect(gl.autoClear).toBe(false);
    view.unmount();
    expect(gl.toneMapping).toBe(THREE.ReinhardToneMapping);
    expect(gl.autoClear).toBe(false);
  });

  it('unbinds a failed composer target before the direct fallback and remains StrictMode safe', () => {
    const { gl, scene, camera } = createRuntime();
    const addPass = vi.spyOn(EffectComposer.prototype, 'addPass');
    const dispose = vi.spyOn(EffectComposer.prototype, 'dispose');
    const view = render(<StrictMode><SunrisePostProcessing qualityTier="full" enabled /></StrictMode>);
    expect(addPass).toHaveBeenCalledTimes(8);
    expect(dispose).toHaveBeenCalledTimes(1);
    const composer = addPass.mock.instances[4] as unknown as EffectComposer;
    vi.mocked(composer.render).mockImplementation(() => {
      gl.setRenderTarget(composer.inputBuffer);
      gl.setViewport(10, 20, 4, 8);
      gl.setScissorTest(true);
      throw new Error('render interrupted');
    });
    vi.mocked(gl.render).mockImplementation(() => expectScreenBound(gl));
    gl.autoClear = false;
    expect(drawFrame).not.toThrow();
    expect(gl.render).toHaveBeenCalledWith(scene, camera);
    expectScreenBound(gl);
    expect(gl.autoClear).toBe(false);
    expect(readCommercialMapRenderHealth(gl.domElement)).toMatchObject({
      status: 'degraded', path: 'direct', presentedFrames: 1, lastErrorCode: 'render interrupted',
    });
    view.unmount();
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(gl.autoClear).toBe(true);
    expect(gl.toneMapping).toBe(THREE.ACESFilmicToneMapping);
  });

  it('detects silently incomplete framebuffers before submission and falls back to the screen', () => {
    const { gl } = createRuntime();
    vi.mocked(gl.getContext().checkFramebufferStatus).mockReturnValue(0x8cd6);
    const view = render(<SunrisePostProcessing qualityTier="balanced" enabled />);
    expect(drawFrame).not.toThrow();
    expect(EffectComposer.prototype.render).not.toHaveBeenCalled();
    expect(gl.render).toHaveBeenCalledOnce();
    expectScreenBound(gl);
    expect(readCommercialMapRenderHealth(gl.domElement)).toMatchObject({
      status: 'degraded', path: 'direct', presentedFrames: 1, lastErrorCode: 'framebuffer-incomplete',
    });
    view.unmount();
  });

  it('rejects a post frame that silently retains an offscreen target', () => {
    const { gl } = createRuntime();
    const addPass = vi.spyOn(EffectComposer.prototype, 'addPass');
    render(<SunrisePostProcessing qualityTier="balanced" enabled />);
    const composer = addPass.mock.instances[0] as unknown as EffectComposer;
    vi.mocked(composer.render).mockImplementation(() => { gl.setRenderTarget(composer.inputBuffer); });
    drawFrame();
    expect(gl.render).toHaveBeenCalledOnce();
    expectScreenBound(gl);
    expect(readCommercialMapRenderHealth(gl.domElement)).toMatchObject({
      status: 'degraded', path: 'direct', lastErrorCode: 'retained-render-target',
    });
  });

  it('makes no render/allocation/disposal calls while context is lost and rebuilds once on restore', () => {
    const { gl, scene } = createRuntime();
    const sun = new THREE.DirectionalLight();
    sun.castShadow = true;
    sun.shadow.needsUpdate = false;
    scene.add(sun);
    const addPass = vi.spyOn(EffectComposer.prototype, 'addPass');
    const dispose = vi.spyOn(EffectComposer.prototype, 'dispose');
    const view = render(<SunrisePostProcessing qualityTier="balanced" enabled />);
    drawFrame();
    const allocations = vi.mocked(gl.setRenderTarget).mock.calls.length;
    const renders = vi.mocked(EffectComposer.prototype.render).mock.calls.length;
    loseContext(gl);
    drawFrame();
    view.rerender(<SunrisePostProcessing qualityTier="full" enabled />);
    drawFrame();
    expect(gl.setRenderTarget).toHaveBeenCalledTimes(allocations);
    expect(EffectComposer.prototype.render).toHaveBeenCalledTimes(renders);
    expect(gl.render).not.toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();
    expect(addPass).toHaveBeenCalledTimes(4);
    expect(readCommercialMapRenderHealth(gl.domElement)).toMatchObject({
      status: 'context-lost', path: 'suspended', contextLosses: 1,
    });
    restoreContext(gl);
    expect(gl.shadowMap.needsUpdate).toBe(true);
    expect(sun.shadow.needsUpdate).toBe(true);
    drawFrame();
    expect(addPass).toHaveBeenCalledTimes(8);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(readCommercialMapRenderHealth(gl.domElement)).toMatchObject({ status: 'ready', path: 'post' });
    view.unmount();
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it('uses direct rendering after repeated context loss and allows an explicit post retry', () => {
    const { gl } = createRuntime();
    const addPass = vi.spyOn(EffectComposer.prototype, 'addPass');
    render(<SunrisePostProcessing qualityTier="balanced" enabled />);
    drawFrame();
    loseContext(gl);
    restoreContext(gl);
    drawFrame();
    loseContext(gl);
    restoreContext(gl);
    drawFrame();
    expect(addPass).toHaveBeenCalledTimes(8);
    expectScreenBound(gl);
    expect(readCommercialMapRenderHealth(gl.domElement)).toMatchObject({
      status: 'degraded', path: 'direct', contextLosses: 2, lastErrorCode: 'repeated-context-loss',
    });
    act(() => gl.domElement.dispatchEvent(new CustomEvent(COMMERCIAL_MAP_RENDER_RETRY_EVENT)));
    drawFrame();
    expect(gl.resetState).toHaveBeenCalledOnce();
    expect(addPass).toHaveBeenCalledTimes(12);
    expect(readCommercialMapRenderHealth(gl.domElement)).toMatchObject({
      status: 'ready', path: 'post', contextLosses: 2, lastErrorCode: null,
    });
  });

  it('retains the context restoration extension before loss so manual retry cannot silently no-op', () => {
    const { gl } = createRuntime();
    const restore = vi.fn();
    const getExtension = vi.mocked(gl.getContext().getExtension as (name: string) => WEBGL_lose_context | null);
    getExtension.mockReturnValue({ restoreContext: restore, loseContext: vi.fn() });
    render(<SunrisePostProcessing qualityTier="balanced" enabled />);
    drawFrame();
    loseContext(gl);
    const extensionQueriesBeforeRetry = getExtension.mock.calls.length;
    getExtension.mockReturnValue(null);
    act(() => gl.domElement.dispatchEvent(new CustomEvent(COMMERCIAL_MAP_RENDER_RETRY_EVENT)));
    expect(restore).toHaveBeenCalledOnce();
    expect(gl.forceContextRestore).not.toHaveBeenCalled();
    expect(getExtension).toHaveBeenCalledTimes(extensionQueriesBeforeRetry);
  });

  it('bounds failed direct recovery and resumes only after a manual retry', () => {
    const { gl } = createRuntime();
    vi.mocked(gl.render).mockImplementation(() => { throw new Error('direct-render-failed'); });
    render(<SunrisePostProcessing qualityTier="reduced" enabled />);
    drawFrame();
    expect(gl.render).toHaveBeenCalledTimes(2);
    expect(gl.resetState).toHaveBeenCalledOnce();
    expect(readCommercialMapRenderHealth(gl.domElement)).toMatchObject({
      status: 'failed', path: 'suspended', presentedFrames: 0,
    });
    drawFrame();
    expect(gl.render).toHaveBeenCalledTimes(2);
    vi.mocked(gl.render).mockImplementation(() => {});
    act(() => gl.domElement.dispatchEvent(new CustomEvent(COMMERCIAL_MAP_RENDER_RETRY_EVENT)));
    drawFrame();
    expect(gl.render).toHaveBeenCalledTimes(3);
    expectScreenBound(gl);
    expect(readCommercialMapRenderHealth(gl.domElement)).toMatchObject({
      status: 'ready', path: 'direct', presentedFrames: 1, lastErrorCode: null,
    });
  });

  it.each(['validation', 'post-render', 'direct-render'] as const)(
    'suspends immediately when context loss occurs during %s before the DOM event',
    (phase) => {
      const { gl } = createRuntime();
      const dispose = vi.spyOn(EffectComposer.prototype, 'dispose');
      let targetCallsAtLoss = 0;
      const failContext = () => {
        vi.mocked(gl.getContext().isContextLost).mockReturnValue(true);
        targetCallsAtLoss = vi.mocked(gl.setRenderTarget).mock.calls.length;
      };
      if (phase === 'validation') {
        vi.mocked(gl.getContext().checkFramebufferStatus).mockImplementation(() => {
          failContext();
          return 0;
        });
      } else if (phase === 'post-render') {
        vi.mocked(EffectComposer.prototype.render).mockImplementation(failContext);
      } else {
        vi.mocked(gl.render).mockImplementation(failContext);
      }
      render(<SunrisePostProcessing qualityTier={phase === 'direct-render' ? 'reduced' : 'balanced'} enabled />);
      drawFrame();
      expect(dispose).not.toHaveBeenCalled();
      expect(gl.resetState).not.toHaveBeenCalled();
      expect(gl.setRenderTarget).toHaveBeenCalledTimes(targetCallsAtLoss);
      expect(gl.render).toHaveBeenCalledTimes(phase === 'direct-render' ? 1 : 0);
      expect(readCommercialMapRenderHealth(gl.domElement)).toMatchObject({
        status: 'context-lost', path: 'suspended', presentedFrames: 0, contextLosses: 1,
      });
      act(() => gl.domElement.dispatchEvent(new Event('webglcontextlost')));
      drawFrame();
      expect(readCommercialMapRenderHealth(gl.domElement)?.contextLosses).toBe(1);
      expect(gl.setRenderTarget).toHaveBeenCalledTimes(targetCallsAtLoss);
      expect(dispose).not.toHaveBeenCalled();
    },
  );

  it('catches a post shader callback without an exception and retains its lifecycle observer until unmount', () => {
    const { gl } = createRuntime();
    const originalShaderError = vi.fn();
    gl.debug.onShaderError = originalShaderError;
    vi.mocked(EffectComposer.prototype.render).mockImplementation(() => {
      gl.debug.onShaderError?.(gl.getContext(), {} as THREE.WebGLProgram, {} as WebGLShader, {} as WebGLShader);
    });
    const view = render(<SunrisePostProcessing qualityTier="balanced" enabled />);
    const observer = gl.debug.onShaderError;
    expect(observer).not.toBe(originalShaderError);
    drawFrame();
    expect(originalShaderError).toHaveBeenCalledOnce();
    expect(gl.debug.onShaderError).toBe(observer);
    expect(gl.render).toHaveBeenCalledOnce();
    expectScreenBound(gl);
    expect(readCommercialMapRenderHealth(gl.domElement)).toMatchObject({
      status: 'degraded', path: 'direct', presentedFrames: 1, lastErrorCode: 'post-shader-failed',
    });
    view.unmount();
    expect(gl.debug.onShaderError).toBe(originalShaderError);
  });

  it('catches a later Preload sibling layout failure before its broken shader is silently reused from cache', () => {
    vi.useFakeTimers();
    const { gl } = createRuntime();
    const previousShaderError = vi.fn();
    gl.debug.onShaderError = previousShaderError;
    function PreloadShaderFailure() {
      useLayoutEffect(() => {
        // The installed Preload performs real cube-camera draws here. Three
        // emits this callback only on first use, not on cached future draws.
        gl.debug.onShaderError?.(gl.getContext(), {} as THREE.WebGLProgram, {} as WebGLShader, {} as WebGLShader);
      }, []);
      return null;
    }
    const view = render(<>
      <SunrisePostProcessing qualityTier="balanced" enabled />
      <PreloadShaderFailure />
    </>);
    expect(previousShaderError).toHaveBeenCalledOnce();
    drawFrame();
    drawFrame();
    expect(EffectComposer.prototype.render).not.toHaveBeenCalled();
    expect(gl.render).not.toHaveBeenCalled();
    expect(readCommercialMapRenderHealth(gl.domElement)).toMatchObject({
      status: 'failed', path: 'suspended', presentedFrames: 0, lastErrorCode: 'cached-shader-failed',
    });
    act(() => gl.domElement.dispatchEvent(new CustomEvent(COMMERCIAL_MAP_RENDER_RETRY_EVENT)));
    expect(gl.forceContextLoss).toHaveBeenCalledOnce();
    expect(gl.resetState).not.toHaveBeenCalled();
    loseContext(gl);
    act(() => vi.advanceTimersByTime(0));
    expect(gl.forceContextRestore).toHaveBeenCalledOnce();
    restoreContext(gl);
    drawFrame();
    expect(readCommercialMapRenderHealth(gl.domElement)).toMatchObject({
      status: 'ready', path: 'post', presentedFrames: 1, contextLosses: 1, lastErrorCode: null,
    });
    view.unmount();
    expect(gl.debug.onShaderError).toBe(previousShaderError);
  });

  it('keeps a direct shader failure fatal until an explicit context restoration clears cached programs', () => {
    vi.useFakeTimers();
    const { gl } = createRuntime();
    vi.mocked(gl.render).mockImplementation(() => {
      gl.debug.onShaderError?.(gl.getContext(), {} as THREE.WebGLProgram, {} as WebGLShader, {} as WebGLShader);
    });
    render(<SunrisePostProcessing qualityTier="reduced" enabled />);
    drawFrame();
    expect(gl.render).toHaveBeenCalledOnce();
    expect(gl.resetState).not.toHaveBeenCalled();
    expect(readCommercialMapRenderHealth(gl.domElement)).toMatchObject({
      status: 'failed', path: 'suspended', presentedFrames: 0, lastErrorCode: 'direct-shader-failed',
    });
    act(() => gl.domElement.dispatchEvent(new CustomEvent(COMMERCIAL_MAP_RENDER_RETRY_EVENT)));
    expect(gl.forceContextLoss).toHaveBeenCalledOnce();
    expect(gl.forceContextRestore).not.toHaveBeenCalled();
    drawFrame();
    expect(gl.render).toHaveBeenCalledOnce();
    loseContext(gl);
    act(() => vi.advanceTimersByTime(0));
    expect(gl.forceContextRestore).toHaveBeenCalledOnce();
    drawFrame();
    expect(gl.render).toHaveBeenCalledOnce();
    vi.mocked(gl.render).mockImplementation(() => {});
    restoreContext(gl);
    drawFrame();
    expect(gl.render).toHaveBeenCalledTimes(2);
    expect(readCommercialMapRenderHealth(gl.domElement)).toMatchObject({
      status: 'ready', path: 'direct', presentedFrames: 1, contextLosses: 1, lastErrorCode: null,
    });
  });

  it('reports a context restore timeout without allocating or entering an automatic retry loop', () => {
    vi.useFakeTimers();
    const { gl } = createRuntime();
    const addPass = vi.spyOn(EffectComposer.prototype, 'addPass');
    render(<SunrisePostProcessing qualityTier="balanced" enabled />);
    loseContext(gl);
    act(() => vi.advanceTimersByTime(5000));
    expect(readCommercialMapRenderHealth(gl.domElement)).toMatchObject({
      status: 'failed', path: 'suspended', presentedFrames: 0, lastErrorCode: 'context-restore-timeout',
    });
    act(() => vi.advanceTimersByTime(20000));
    drawFrame();
    expect(addPass).toHaveBeenCalledTimes(4);
    expect(gl.render).not.toHaveBeenCalled();
    expect(gl.forceContextRestore).not.toHaveBeenCalled();
    act(() => gl.domElement.dispatchEvent(new CustomEvent(COMMERCIAL_MAP_RENDER_RETRY_EVENT)));
    expect(gl.forceContextRestore).toHaveBeenCalledOnce();
    expect(gl.render).not.toHaveBeenCalled();
  });
});
