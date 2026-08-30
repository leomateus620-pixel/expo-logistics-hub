import { StrictMode } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BlendFunction,
  type BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  type ToneMappingEffect,
  ToneMappingMode,
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

function createRenderer() {
  const size = new THREE.Vector2(1366, 768);
  return {
    autoClear: true,
    toneMapping: THREE.ACESFilmicToneMapping,
    outputColorSpace: THREE.SRGBColorSpace,
    capabilities: { isWebGL2: true },
    extensions: { has: () => false },
    getContext: () => ({ getContextAttributes: () => ({ alpha: false }) }),
    getSize: (target: THREE.Vector2) => target.copy(size),
    getDrawingBufferSize: (target: THREE.Vector2) => target.copy(size),
    setSize: (width: number, height: number) => { size.set(width, height); },
  } as unknown as THREE.WebGLRenderer;
}

function createRuntime() {
  const state = {
    gl: createRenderer(),
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(38, 1366 / 768, 0.05, 1200),
    size: { width: 1366, height: 768 },
    invalidate: vi.fn(),
  };
  runtime.state = state;
  return state;
}

function listenerCount(effect: unknown) {
  return (effect as { _listeners?: { change?: unknown[] } })._listeners?.change?.length ?? 0;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  runtime.frame = null;
});

describe('Commercial Map persistent post-processing with installed postprocessing classes', () => {
  it('compiles shared selection shaders once in the real HDR target and restores the prior target', () => {
    const { gl, scene, camera } = createRuntime();
    const previousTarget = new THREE.WebGLRenderTarget(8, 8);
    let currentTarget: THREE.WebGLRenderTarget | null = previousTarget;
    const targetsDuringCompile: (THREE.WebGLRenderTarget | null)[] = [];
    const highlights = new THREE.Group();
    highlights.name = 'commercial-map-selection-shader-warmup';
    highlights.visible = false;
    scene.add(highlights);
    const setRenderTarget = vi.fn((target: THREE.WebGLRenderTarget | null) => { currentTarget = target; });
    const compile = vi.fn(() => { targetsDuringCompile.push(currentTarget); });
    Object.assign(gl, {
      getRenderTarget: () => currentTarget,
      getActiveCubeFace: () => 2,
      getActiveMipmapLevel: () => 1,
      setRenderTarget,
      compile,
    });
    const addPass = vi.spyOn(EffectComposer.prototype, 'addPass');
    const view = render(<SunrisePostProcessing qualityTier="balanced" enabled />);
    const composer = addPass.mock.instances[0] as unknown as EffectComposer;
    expect(compile).toHaveBeenCalledWith(highlights, camera, scene);
    expect(targetsDuringCompile).toEqual([composer.inputBuffer]);
    expect(currentTarget).toBe(previousTarget);
    expect(setRenderTarget).toHaveBeenLastCalledWith(previousTarget, 2, 1);
    for (let cycle = 0; cycle < 20; cycle += 1) {
      view.rerender(<SunrisePostProcessing qualityTier="balanced" enabled={false} />);
      view.rerender(<SunrisePostProcessing qualityTier="balanced" enabled />);
    }
    expect(compile).toHaveBeenCalledTimes(1);
    view.unmount();
    previousTarget.dispose();
  });

  it('retains the existing HDR, anti-aliasing and combined Bloom -> ACES stack', () => {
    const { gl } = createRuntime();
    const addPass = vi.spyOn(EffectComposer.prototype, 'addPass');
    const view = render(<SunrisePostProcessing qualityTier="balanced" enabled />);
    const composer = addPass.mock.instances[0] as unknown as EffectComposer;
    const [bloom, toneMapping] = (composer.passes[1] as unknown as {
      effects: [BloomEffect, ToneMappingEffect];
    }).effects;
    expect(composer.passes).toHaveLength(2);
    expect(composer.passes[0]).toBeInstanceOf(RenderPass);
    expect(composer.passes[1]).toBeInstanceOf(EffectPass);
    expect(composer.inputBuffer.texture.type).toBe(THREE.HalfFloatType);
    expect(composer.multisampling).toBe(0);
    expect(bloom.getAttributes()).toBe(0);
    expect(toneMapping.getAttributes()).toBe(0);
    expect(bloom.blendMode.blendFunction).toBe(BlendFunction.ADD);
    expect(bloom.intensity).toBe(0.58);
    expect(bloom.luminanceMaterial.threshold).toBe(3.2);
    expect(bloom.luminanceMaterial.smoothing).toBe(0.16);
    expect(bloom.mipmapBlurPass.enabled).toBe(true);
    expect(bloom.mipmapBlurPass.levels).toBe(5);
    expect(toneMapping.mode).toBe(ToneMappingMode.ACES_FILMIC);
    expect(gl.autoClear).toBe(true);
    const dispose = vi.spyOn(composer, 'dispose');
    view.unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps one composer, its effect listeners and render targets over 20 interior cycles', () => {
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
    expect(gl.toneMapping).toBe(THREE.NoToneMapping);
    expect(runtime.priority).toBe(1);
    for (let index = 0; index < 20; index += 1) {
      view.rerender(<SunrisePostProcessing qualityTier="full" enabled={false} />);
      expect(gl.toneMapping).toBe(THREE.ACESFilmicToneMapping);
      expect(gl.autoClear).toBe(true);
      expect(runtime.priority).toBe(0);
      view.rerender(<SunrisePostProcessing qualityTier="full" enabled />);
    }
    expect(addPass).toHaveBeenCalledTimes(2);
    expect(dispose).not.toHaveBeenCalled();
    expect(composer.passes).toEqual(passes);
    expect(composer.inputBuffer).toBe(input);
    expect(composer.outputBuffer).toBe(output);
    expect(effects.map(listenerCount)).toEqual([1, 1]);
    state.size = { width: 844, height: 390 };
    view.rerender(<SunrisePostProcessing qualityTier="full" enabled />);
    expect(composer.passes).toEqual(passes);
    expect(composer.inputBuffer).toBe(input);
    expect(composer.outputBuffer).toBe(output);
    expect(input.width).toBe(844);
    expect(input.height).toBe(390);
    view.unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(effects.map(listenerCount)).toEqual([0, 0]);
    expect(gl.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(gl.autoClear).toBe(true);
  });

  it('restores the original renderer settings even when mounted and removed while disabled', () => {
    const { gl } = createRuntime();
    gl.toneMapping = THREE.ReinhardToneMapping;
    gl.autoClear = false;
    const dispose = vi.spyOn(EffectComposer.prototype, 'dispose');
    const view = render(<SunrisePostProcessing qualityTier="balanced" enabled={false} />);
    expect(gl.toneMapping).toBe(THREE.ReinhardToneMapping);
    expect(gl.autoClear).toBe(false);
    view.unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(gl.toneMapping).toBe(THREE.ReinhardToneMapping);
    expect(gl.autoClear).toBe(false);
  });

  it('restores autoClear after an interrupted render and safely recreates during StrictMode replay', () => {
    const { gl } = createRuntime();
    const addPass = vi.spyOn(EffectComposer.prototype, 'addPass');
    const dispose = vi.spyOn(EffectComposer.prototype, 'dispose');
    const view = render(<StrictMode><SunrisePostProcessing qualityTier="full" enabled /></StrictMode>);
    expect(addPass).toHaveBeenCalledTimes(4);
    expect(dispose).toHaveBeenCalledTimes(1);
    const composer = addPass.mock.instances[2] as unknown as EffectComposer;
    vi.spyOn(composer, 'render').mockImplementation(() => { throw new Error('render interrupted'); });
    gl.autoClear = false;
    expect(() => act(() => runtime.frame?.(runtime.state, 1 / 60))).toThrow('render interrupted');
    expect(gl.autoClear).toBe(false);
    view.unmount();
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(gl.autoClear).toBe(true);
    expect(gl.toneMapping).toBe(THREE.ACESFilmicToneMapping);
  });
});
