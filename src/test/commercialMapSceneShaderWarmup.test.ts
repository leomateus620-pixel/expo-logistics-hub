import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { commercialMapShaderRepresentatives, compileCommercialMapPrograms, prepareCommercialMapTextures, isCommercialMapPostReady, isCommercialSceneCompiling,
  prepareCommercialMapCriticalPost, prepareCommercialScene } from '@/features/commercial-map/utils/sceneShaderWarmup';
afterEach(() => vi.useRealTimers());

function rendererFixture() {
  let target: THREE.WebGLRenderTarget | null = new THREE.WebGLRenderTarget(2, 2);
  const initialTarget = target;
  const pending: { resolve: () => void; reject: (error: Error) => void }[] = [];
  const states: { tone: number; target: THREE.WebGLRenderTarget | null }[] = [];
  const background: { tone: number; target: THREE.WebGLRenderTarget | null; objects: THREE.Object3D[] }[] = [];
  const programByMaterial = new Map<THREE.Material, { isReady: () => boolean }>();
  const gl = {
    toneMapping: THREE.ReinhardToneMapping, outputColorSpace: THREE.LinearSRGBColorSpace,
    getRenderTarget: () => target, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
    setRenderTarget: vi.fn((value) => { target = value; }),
    compile: vi.fn((objects: THREE.Object3D) => {
      if (!(objects instanceof THREE.Scene)) {
        background.push({ tone: gl.toneMapping, target, objects: [...objects.children] });
        return new Set<THREE.Material>();
      }
      states.push({ tone: gl.toneMapping, target });
      let ready = false;
      let error: Error | null = null;
      const material = new THREE.MeshBasicMaterial();
      const program = { isReady: () => { if (error) throw error; return ready; } };
      programByMaterial.set(material, program);
      pending.push({ resolve: () => { ready = true; }, reject: (value) => { error = value; } });
      return new Set([material]);
    }),
    properties: { get: (material: THREE.Material) => ({ currentProgram: programByMaterial.get(material) }) },
  };
  return { gl: gl as unknown as THREE.WebGLRenderer, initialTarget, pending, states, background };
}

describe('non-rendering commercial scene preparation', () => {
  it('uploads each ordinary texture once and leaves render targets owned by their renderer', async () => {
    vi.useFakeTimers();
    const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1); texture.needsUpdate = true;
    const target = new THREE.WebGLRenderTarget(1, 1);
    const material = new THREE.MeshStandardMaterial({ map: texture, normalMap: texture, envMap: target.texture });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    const renderer = { initTexture: vi.fn() } as unknown as THREE.WebGLRenderer;
    const promise = prepareCommercialMapTextures(renderer, [mesh, mesh]);
    expect(renderer.initTexture).not.toHaveBeenCalled();
    await vi.runAllTimersAsync(); await promise;
    expect(renderer.initTexture).toHaveBeenCalledExactlyOnceWith(texture);
    texture.dispose(); target.dispose(); mesh.geometry.dispose(); material.dispose();
  });
  it('deduplicates equal program features without losing vertex-alpha, instancing or morph variants', () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true });
    const geometry = new THREE.BoxGeometry();
    const sameFeatures = new THREE.BoxGeometry(2, 3, 4);
    const rgba = geometry.clone(); rgba.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(rgba.attributes.position.count * 4), 4));
    const morph = geometry.clone(); morph.morphAttributes.position = [geometry.attributes.position.clone()];
    const meshes = [new THREE.Mesh(geometry, material), new THREE.Mesh(sameFeatures, material), new THREE.Mesh(rgba, material),
      new THREE.InstancedMesh(geometry, material, 1), new THREE.Mesh(morph, material)];
    scene.add(...meshes);
    expect(commercialMapShaderRepresentatives(scene)).toEqual([meshes[0], meshes[2], meshes[3], meshes[4]]);
    expect(meshes.every(mesh => mesh.parent === scene)).toBe(true);
    [geometry, sameFeatures, rgba, morph].forEach(value => value.dispose()); material.dispose();
  });
  it('waits for every program of a shared material, including a non-current variant', async () => {
    vi.useFakeTimers();
    const material = new THREE.MeshBasicMaterial(); let firstReady = false;
    const first = { isReady: () => firstReady }, last = { isReady: () => true };
    const gl = { compile: () => new Set([material]), properties: { get: () => ({ currentProgram: last,
      programs: new Map([['plain', first], ['instanced', last]]) }) } } as unknown as THREE.WebGLRenderer;
    let completed = false;
    const preparation = compileCommercialMapPrograms(gl, new THREE.Group(), new THREE.Camera(), new THREE.Scene()).then(() => { completed = true; });
    await vi.advanceTimersByTimeAsync(20); expect(completed).toBe(false);
    firstReady = true; await vi.advanceTimersByTimeAsync(10); await preparation;
    expect(completed).toBe(true); material.dispose();
  });
  it('prepares only DIRECT before interaction and restores state without rendering or toggling visibility', async () => {
    const { gl, initialTarget, pending, states } = rendererFixture();
    const scene = new THREE.Scene();
    const hidden = new THREE.Mesh(); hidden.visible = false; scene.add(hidden);
    const promise = prepareCommercialScene(gl, scene, new THREE.PerspectiveCamera());
    expect(isCommercialSceneCompiling(gl)).toBe(true);
    expect(states).toEqual([{ tone: THREE.ACESFilmicToneMapping, target: null }]);
    expect(gl.getRenderTarget()).toBe(initialTarget);
    expect(gl.toneMapping).toBe(THREE.ReinhardToneMapping);
    pending[0].resolve(); await promise;
    expect(states).toHaveLength(1);
    expect(isCommercialMapPostReady(gl)).toBe(false);
    expect(isCommercialSceneCompiling(gl)).toBe(false);
    expect(hidden.visible).toBe(false);
    expect(gl.getRenderTarget()).toBe(initialTarget);
    expect(gl.outputColorSpace).toBe(THREE.LinearSRGBColorSpace);
    hidden.geometry.dispose(); (hidden.material as THREE.Material).dispose(); initialTarget?.dispose();
  });
  it('releases the frame gate on failure so existing recovery can take over', async () => {
    const { gl, pending, initialTarget } = rendererFixture();
    const promise = prepareCommercialScene(gl, new THREE.Scene(), new THREE.Camera());
    pending[0].reject(new Error('context lost'));
    await expect(promise).rejects.toThrow('context lost');
    expect(isCommercialSceneCompiling(gl)).toBe(false);
    expect(gl.getRenderTarget()).toBe(initialTarget);
    initialTarget?.dispose();
  });
  it('does not let an obsolete context preparation compile again or unlock its successor', async () => {
    const { gl, pending, initialTarget } = rendererFixture();
    const scene = new THREE.Scene(); const camera = new THREE.Camera();
    const old = prepareCommercialScene(gl, scene, camera);
    const current = prepareCommercialScene(gl, scene, camera);
    pending[0].resolve(); await old;
    expect(gl.compile).toHaveBeenCalledTimes(2);
    expect(isCommercialSceneCompiling(gl)).toBe(true);
    pending[1].resolve(); await current;
    expect(gl.compile).toHaveBeenCalledTimes(2);
    expect(isCommercialSceneCompiling(gl)).toBe(false);
    initialTarget?.dispose();
  });
  it('warms only the captured critical snapshot after readiness without reacquiring the draw gate', async () => {
    vi.useFakeTimers();
    const { gl, pending, background, initialTarget } = rendererFixture();
    const scene = new THREE.Scene(), camera = new THREE.Camera();
    const critical = new THREE.Mesh(); critical.name = 'critical'; scene.add(critical);
    const direct = prepareCommercialScene(gl, scene, camera);
    pending[0].resolve(); await vi.advanceTimersByTimeAsync(10); await direct;
    const optional = new THREE.Mesh(); optional.name = 'optional'; scene.add(optional);
    const post = prepareCommercialMapCriticalPost(gl, scene, camera);
    expect(isCommercialSceneCompiling(gl)).toBe(false);
    expect(isCommercialMapPostReady(gl)).toBe(false);
    await vi.runAllTimersAsync(); await post;
    expect(background).toHaveLength(1);
    expect(background[0].tone).toBe(THREE.NoToneMapping);
    expect(background[0].objects).toEqual([critical]);
    expect(isCommercialMapPostReady(gl)).toBe(true);
    expect(gl.getRenderTarget()).toBe(initialTarget);
    expect(gl.toneMapping).toBe(THREE.ReinhardToneMapping);
    for (const mesh of [critical, optional]) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
    initialTarget?.dispose();
  });
  it('polls captured POST programs when an intervening DIRECT frame changes currentProgram', async () => {
    vi.useFakeTimers();
    const material = new THREE.MeshBasicMaterial();
    let ready = false;
    const capturedProgram = { isReady: () => ready };
    const properties = { currentProgram: capturedProgram };
    const gl = { compile: () => new Set([material]), properties: { get: () => properties } } as unknown as THREE.WebGLRenderer;
    let finished = false;
    const preparation = compileCommercialMapPrograms(gl, new THREE.Group(), new THREE.Camera(), new THREE.Scene()).then(() => { finished = true; });
    properties.currentProgram = { isReady: () => true }; // a live direct draw
    await vi.advanceTimersByTimeAsync(20);
    expect(finished).toBe(false);
    ready = true;
    await vi.advanceTimersByTimeAsync(10); await preparation;
    expect(finished).toBe(true);
    material.dispose();
  });
  it('cancels pending program polls on Canvas teardown instead of retaining dead GPU programs', async () => {
    vi.useFakeTimers();
    const material = new THREE.MeshBasicMaterial();
    const program = { isReady: vi.fn(() => false) };
    const gl = { compile: () => new Set([material]), properties: { get: () => ({ currentProgram: program }) } } as unknown as THREE.WebGLRenderer;
    const controller = new AbortController();
    const preparation = compileCommercialMapPrograms(gl, new THREE.Group(), new THREE.Camera(), new THREE.Scene(), controller.signal);
    expect(vi.getTimerCount()).toBe(1);
    const rejected = expect(preparation).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    const checks = program.isReady.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(program.isReady).toHaveBeenCalledTimes(checks);
    material.dispose();
  });
});
