import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const runtime = vi.hoisted(() => ({ state: null as unknown, frame: null as null | (() => void) }));
vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: unknown) => unknown) => selector(runtime.state),
  useFrame: (callback: () => void) => { runtime.frame = callback; },
}));

import { CommercialMapInteriorShaderWarmup } from '@/features/commercial-map/components/canvas/CommercialMapInteriorShaderWarmup';
import { CommercialMapInteractiveBoot, scheduleCommercialMapSceneTask } from '@/features/commercial-map/components/canvas/DeferredSceneLayer';
import { publishCommercialMapRenderHealth } from '@/features/commercial-map/utils/renderingHealth';

function createRuntime({ pending = false, target = null }: { pending?: boolean; target?: THREE.WebGLRenderTarget | null } = {}) {
  let currentTarget = target;
  let ready = !pending;
  const complete = () => { ready = true; };
  const snapshot: { scene?: THREE.Scene; toneMapping?: THREE.ToneMapping; target?: THREE.WebGLRenderTarget | null; outputColorSpace?: string } = {};
  const gl = {
    toneMapping: THREE.NoToneMapping as THREE.ToneMapping,
    outputColorSpace: THREE.LinearSRGBColorSpace,
    domElement: document.createElement('canvas'),
    info: { programs: [] },
    getRenderTarget: () => currentTarget,
    getActiveCubeFace: () => 3,
    getActiveMipmapLevel: () => 2,
    setRenderTarget: vi.fn((next: THREE.WebGLRenderTarget | null) => { currentTarget = next; }),
    render: vi.fn(),
    properties: { get: () => ({ currentProgram: { isReady: () => ready } }) },
    compile: vi.fn((scene: THREE.Scene) => {
      Object.assign(snapshot, { scene, target: currentTarget, toneMapping: gl.toneMapping, outputColorSpace: gl.outputColorSpace });
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => { const material = (object as THREE.Mesh).material;
        if (material) (Array.isArray(material) ? material : [material]).forEach((m) => materials.add(m)); });
      return materials;
    }),
  };
  runtime.state = { gl, camera: new THREE.PerspectiveCamera(38, 1.5, 0.05, 1200), controls: {}, invalidate: vi.fn() };
  return { gl, snapshot, complete: () => complete(), suspend: () => { ready = false; } };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  runtime.frame = null;
});

function health(canvas: HTMLCanvasElement, status: 'ready' | 'context-lost', presentedFrames: number) {
  publishCommercialMapRenderHealth(canvas, {
    status, path: status === 'ready' ? 'direct' : 'suspended', presentedFrames,
    contextLosses: status === 'ready' ? 0 : 1, lastErrorCode: status === 'ready' ? null : 'context-lost',
  });
}

function startExistingQueue(canvas: HTMLCanvasElement) {
  render(<CommercialMapInteractiveBoot />);
  canvas.dataset.commercialMapEssentialReady = 'true';
  act(() => {
    for (let frames = 0; frames <= 3; frames++) { health(canvas, 'ready', frames); runtime.frame?.(); }
  });
  expect(canvas.dataset.commercialMapReady).toBe('true');
}

describe('Commercial Map exact interior shader warmup', () => {
  it('prepares seven detached variants with the actual interior light/fog/texture/instance defines', async () => {
    const { gl, snapshot } = createRuntime();
    render(<CommercialMapInteriorShaderWarmup reducedGraphics={false} />);
    await act(async () => {});
    const scene = snapshot.scene!;
    const probes = scene.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
    expect(probes).toHaveLength(7);
    expect(new Set(probes.map((probe) => probe.geometry)).size).toBe(1);
    expect(new Set(probes.map((probe) => probe.material)).size).toBe(7);
    expect(scene.environment).toBeNull();
    expect(scene.fog).toBeInstanceOf(THREE.Fog);
    expect(scene.children.filter((child) => child instanceof THREE.DirectionalLight)).toHaveLength(1);
    expect(scene.children.filter((child) => child instanceof THREE.HemisphereLight)).toHaveLength(1);
    expect(scene.children.find((child) => child instanceof THREE.DirectionalLight)?.castShadow).toBe(true);
    const [floor, structure, modules, irregular, accent, label, surface] = probes;
    const floorMaterial = floor.material as THREE.MeshStandardMaterial;
    expect(floorMaterial.map).toBe(floorMaterial.bumpMap);
    expect(floorMaterial.map?.image).toBeNull();
    expect(floorMaterial.map?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(structure).toBeInstanceOf(THREE.InstancedMesh);
    expect((structure as THREE.InstancedMesh).instanceColor).toBeNull();
    expect((modules as THREE.InstancedMesh).instanceColor?.count).toBe(1);
    expect((modules.material as THREE.Material).vertexColors).toBe(false);
    expect(irregular).not.toBeInstanceOf(THREE.InstancedMesh);
    expect(accent.material).toMatchObject({ type: 'MeshBasicMaterial', toneMapped: false, transparent: false });
    expect(label.material).toMatchObject({ type: 'MeshBasicMaterial', transparent: true, alphaTest: 0.05, depthWrite: false, toneMapped: false });
    expect(surface.material).toMatchObject({ type: 'MeshBasicMaterial', transparent: true, opacity: 0.24, depthWrite: false, toneMapped: false });
    expect(snapshot.target).toBeNull();
    expect(snapshot.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(snapshot.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(gl.toneMapping).toBe(THREE.NoToneMapping);
    expect(gl.outputColorSpace).toBe(THREE.LinearSRGBColorSpace);
    expect(gl.render).not.toHaveBeenCalled();
  });

  it('keeps programs retained across rerenders and aborts pending polling and releases resources on teardown', async () => {
    const previousTarget = new THREE.WebGLRenderTarget(8, 8);
    const { gl, snapshot, complete } = createRuntime({ pending: true, target: previousTarget });
    const view = render(<CommercialMapInteriorShaderWarmup reducedGraphics />);
    const scene = snapshot.scene!;
    const probes = scene.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
    const disposals = [
      vi.spyOn(probes[0].geometry, 'dispose'),
      vi.spyOn((probes[0].material as THREE.MeshStandardMaterial).map!, 'dispose'),
      ...probes.map((probe) => vi.spyOn(probe.material as THREE.Material, 'dispose')),
      ...probes.filter((probe): probe is THREE.InstancedMesh => probe instanceof THREE.InstancedMesh)
        .map((probe) => {
          const dispose = vi.fn();
          probe.addEventListener('dispose', dispose);
          return dispose;
        }),
    ];
    expect(scene.children.find((child) => child instanceof THREE.DirectionalLight)?.castShadow).toBe(false);
    expect(gl.getRenderTarget()).toBe(previousTarget);
    expect(gl.setRenderTarget).toHaveBeenLastCalledWith(previousTarget, 3, 2);
    for (let cycle = 0; cycle < 20; cycle += 1) view.rerender(<CommercialMapInteriorShaderWarmup reducedGraphics />);
    expect(gl.compile).toHaveBeenCalledTimes(1);
    disposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    view.unmount();
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    await act(async () => { complete(); });
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
    expect(scene.children).toHaveLength(0);
    previousTarget.dispose();
  });

  it('aborts lost programs and recompiles retained probes on context restoration', async () => {
    vi.useFakeTimers();
    const { gl, snapshot, complete } = createRuntime({ pending: true });
    startExistingQueue(gl.domElement);
    const view = render(<CommercialMapInteriorShaderWarmup reducedGraphics />);
    const scene = snapshot.scene;
    await act(async () => { gl.domElement.dispatchEvent(new Event('webglcontextlost')); });
    expect(gl.domElement.dataset.commercialMapInteriorShaderWarmup).toBeUndefined();
    complete();
    await act(async () => {
      gl.domElement.dispatchEvent(new Event('webglcontextrestored'));
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(gl.compile).toHaveBeenCalledTimes(2);
    expect(snapshot.scene).toBe(scene);
    expect(JSON.parse(gl.domElement.dataset.commercialMapInteriorShaderWarmup!)).toMatchObject({ error: null });
    view.unmount();
    gl.domElement.dispatchEvent(new Event('webglcontextrestored'));
    expect(gl.compile).toHaveBeenCalledTimes(2);
  });

  it('queues restored probes behind essential preparation and the critical post job, preserving a single initial compile', async () => {
    vi.useFakeTimers();
    const { gl } = createRuntime();
    startExistingQueue(gl.domElement);
    render(<CommercialMapInteriorShaderWarmup reducedGraphics />);
    await act(async () => {});
    expect(gl.compile).toHaveBeenCalledTimes(1);
    gl.domElement.dataset.commercialMapPreparing = 'true';
    gl.domElement.dataset.commercialMapEssentialReady = 'false';
    health(gl.domElement, 'context-lost', 3);
    act(() => {
      gl.domElement.dispatchEvent(new Event('webglcontextlost'));
      gl.domElement.dispatchEvent(new Event('webglcontextrestored'));
    });
    const order: string[] = [];
    const critical = vi.fn((complete: () => void) => { order.push('critical-post'); complete(); });
    scheduleCommercialMapSceneTask(gl.domElement, { id: 'critical-post-shaders', priority: 0, run: critical });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(gl.compile).toHaveBeenCalledTimes(1);
    expect(critical).not.toHaveBeenCalled();
    gl.compile.mockImplementationOnce(() => { order.push('interior'); return new Set<THREE.Material>(); });
    gl.domElement.dataset.commercialMapEssentialReady = 'true';
    delete gl.domElement.dataset.commercialMapPreparing;
    health(gl.domElement, 'ready', 6);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(gl.compile).toHaveBeenCalledTimes(2);
    expect(order).toEqual(['critical-post', 'interior']);
  });

  it('cancels queued restored probes on unmount without compiling or retaining their resources', async () => {
    vi.useFakeTimers();
    const { gl, snapshot } = createRuntime();
    startExistingQueue(gl.domElement);
    const view = render(<CommercialMapInteriorShaderWarmup reducedGraphics />);
    await act(async () => {});
    gl.domElement.dataset.commercialMapPreparing = 'true';
    act(() => gl.domElement.dispatchEvent(new Event('webglcontextrestored')));
    expect(gl.compile).toHaveBeenCalledTimes(1);
    const dispose = vi.spyOn((snapshot.scene!.children.find(child => child instanceof THREE.Mesh) as THREE.Mesh).geometry, 'dispose');
    view.unmount();
    expect(dispose).toHaveBeenCalledOnce();
    delete gl.domElement.dataset.commercialMapPreparing;
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(gl.compile).toHaveBeenCalledTimes(1);
    expect(snapshot.scene!.children).toHaveLength(0);
  });

  it('releases a cancelled in-flight restoration once and ignores its obsolete completion', async () => {
    vi.useFakeTimers();
    const { gl, suspend, complete } = createRuntime();
    startExistingQueue(gl.domElement);
    const view = render(<CommercialMapInteriorShaderWarmup reducedGraphics />);
    await act(async () => {});
    suspend();
    act(() => gl.domElement.dispatchEvent(new Event('webglcontextrestored')));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(gl.compile).toHaveBeenCalledTimes(2);
    const successor = vi.fn((done: () => void) => done());
    scheduleCommercialMapSceneTask(gl.domElement, { id: 'after-interior', priority: 150, run: successor });
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(successor).toHaveBeenCalledOnce();
    complete();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(successor).toHaveBeenCalledOnce();
    expect(gl.compile).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restores renderer globals and leaves the map intact when optional warmup fails', async () => {
    const { gl } = createRuntime();
    gl.compile.mockImplementation(() => { throw new Error('driver compile unavailable'); });
    const view = render(<CommercialMapInteriorShaderWarmup reducedGraphics={false} />);
    await act(async () => {});
    expect(gl.toneMapping).toBe(THREE.NoToneMapping);
    expect(gl.outputColorSpace).toBe(THREE.LinearSRGBColorSpace);
    expect(gl.getRenderTarget()).toBeNull();
    expect(gl.render).not.toHaveBeenCalled();
    expect(JSON.parse(gl.domElement.dataset.commercialMapInteriorShaderWarmup!)).toMatchObject({ error: 'driver compile unavailable' });
    view.unmount();
  });
});
