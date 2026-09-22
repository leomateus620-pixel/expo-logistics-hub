import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as diagnostics from '@/features/commercial-map/utils/performanceDiagnostics';
import { commercialMapShaderRepresentatives, compileCommercialMapPrograms, prepareCommercialMapTextures, isCommercialMapPostReady, isCommercialSceneCompiling, isCommercialMapProgramPreparationActive,
  prepareCommercialMapCriticalPost, prepareCommercialScene } from '@/features/commercial-map/utils/sceneShaderWarmup';
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

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
  it('waits for every captured link before reflecting any ready program, then retains bounded initialization', async () => {
    vi.useFakeTimers();
    let secondReady = false;
    const ready = { isReady: () => true, getUniforms: vi.fn(), getAttributes: vi.fn() };
    const pending = { isReady: () => secondReady, getUniforms: vi.fn(), getAttributes: vi.fn() };
    const material = new THREE.MeshBasicMaterial();
    const gl = { compile: () => new Set([material]), properties: { get: () => ({ programs: new Map([['ready', ready], ['pending', pending]]) }) } } as unknown as THREE.WebGLRenderer;
    const stage = vi.fn(), scene = new THREE.Scene();
    const preparation = compileCommercialMapPrograms(gl, scene, new THREE.Camera(), scene, undefined, stage);
    await vi.advanceTimersByTimeAsync(50);
    expect(ready.getUniforms).not.toHaveBeenCalled(); expect(pending.getUniforms).not.toHaveBeenCalled();
    expect(isCommercialMapProgramPreparationActive(gl)).toBe(true);
    expect(stage.mock.calls.some(call => call[0] === 'program-links-ready')).toBe(false);
    secondReady = true; await vi.runAllTimersAsync(); await preparation;
    expect(ready.getUniforms).toHaveBeenCalledOnce(); expect(pending.getUniforms).toHaveBeenCalledOnce();
    expect(stage.mock.calls.map(call => call[0])).toEqual(['program-links-ready', 'program-introspection']);
    expect(isCommercialMapProgramPreparationActive(gl)).toBe(false);
    expect(vi.getTimerCount()).toBe(0); material.dispose();
  });
  it('keeps the resize scheduling signal active until every overlapping program job settles without acquiring the draw gate', async () => {
    vi.useFakeTimers();
    const { gl, pending, initialTarget } = rendererFixture();
    const scene = new THREE.Scene(), camera = new THREE.Camera(), aborted = new AbortController();
    const first = compileCommercialMapPrograms(gl, scene, camera, scene);
    const second = compileCommercialMapPrograms(gl, scene, camera, scene, aborted.signal);
    const rejected = expect(second).rejects.toMatchObject({ name: 'AbortError' });
    expect(isCommercialMapProgramPreparationActive(gl)).toBe(true);
    expect(isCommercialSceneCompiling(gl)).toBe(false);
    aborted.abort(); await rejected;
    expect(isCommercialMapProgramPreparationActive(gl)).toBe(true);
    pending[0].resolve(); await vi.runAllTimersAsync(); await first;
    expect(isCommercialMapProgramPreparationActive(gl)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(gl.getRenderTarget()).toBe(initialTarget); initialTarget?.dispose();
  });
  it('releases the resize scheduling signal when compile throws synchronously or cancellation precedes compile', async () => {
    const compile = vi.fn(() => { throw Error('compile failed'); });
    const gl = { compile } as unknown as THREE.WebGLRenderer, scene = new THREE.Scene(), camera = new THREE.Camera();
    await expect(compileCommercialMapPrograms(gl, scene, camera, scene)).rejects.toThrow('compile failed');
    expect(isCommercialMapProgramPreparationActive(gl)).toBe(false);
    const controller = new AbortController(); controller.abort();
    await expect(compileCommercialMapPrograms(gl, scene, camera, scene, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(isCommercialMapProgramPreparationActive(gl)).toBe(false);
    expect(compile).toHaveBeenCalledOnce();
  });
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
  it('collects compiled MeshStandard hook samplers and arrays without duplicating public maps or excluded textures', async () => {
    vi.useFakeTimers();
    const publicMap = new THREE.DataTexture(new Uint8Array(4), 1, 1); publicMap.needsUpdate = true;
    const hookMap = new THREE.DataTexture(new Uint8Array(4), 1, 1); hookMap.needsUpdate = true;
    const neverUploaded = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    const target = new THREE.WebGLRenderTarget(1, 1);
    const video = new THREE.VideoTexture(document.createElement('video')); video.needsUpdate = true;
    const material = new THREE.MeshStandardMaterial({ map: publicMap });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    // These are the effective uniforms published by Three after onBeforeCompile;
    // a Standard material has no public .uniforms property to read instead.
    const uniforms = { interiorAlbedo: { value: hookMap }, aliases: { value: [publicMap, hookMap, target.texture, video, neverUploaded] }, roughness: { value: .96 } };
    const renderer = { initTexture: vi.fn(), properties: { get: vi.fn(() => ({ uniforms })) } } as unknown as THREE.WebGLRenderer;
    const stage = vi.fn(); vi.spyOn(diagnostics, 'captureCommercialMapStageRecorder').mockReturnValue(stage);
    const preparation = prepareCommercialMapTextures(renderer, [mesh, mesh]);
    await vi.runAllTimersAsync(); await preparation;
    expect(renderer.initTexture).toHaveBeenCalledTimes(2);
    expect(renderer.initTexture).toHaveBeenNthCalledWith(1, publicMap);
    expect(renderer.initTexture).toHaveBeenNthCalledWith(2, hookMap);
    expect(stage).toHaveBeenCalledWith('texture-upload:start', { count: 2, additionalCompiledUniformTextures: 1 });
    expect(uniforms.interiorAlbedo.value).toBe(hookMap);
    [publicMap, hookMap, neverUploaded, video].forEach(texture => texture.dispose());
    target.dispose(); mesh.geometry.dispose(); material.dispose();
  });
  it('waits for captured program linking before admitting texture uploads and retains the draw gate through both phases', async () => {
    vi.useFakeTimers();
    const { gl, pending, initialTarget } = rendererFixture();
    const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1); texture.needsUpdate = true;
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material), scene = new THREE.Scene(); scene.add(mesh);
    const upload = vi.fn(() => {
      expect(gl.getRenderTarget()).toBe(initialTarget);
      expect(gl.toneMapping).toBe(THREE.ReinhardToneMapping);
      expect(gl.outputColorSpace).toBe(THREE.LinearSRGBColorSpace);
    });
    Object.assign(gl, { initTexture: upload });
    const stage = vi.fn(); vi.spyOn(diagnostics, 'captureCommercialMapStageRecorder').mockReturnValue(stage);
    const preparation = prepareCommercialScene(gl, scene, new THREE.Camera());
    await vi.advanceTimersByTimeAsync(30);
    expect(upload).not.toHaveBeenCalled();
    expect(stage.mock.calls.some(call => call[0] === 'texture-upload:start')).toBe(false);
    pending[0].resolve();
    await vi.advanceTimersByTimeAsync(10);
    expect(isCommercialSceneCompiling(gl)).toBe(true);
    expect(upload).not.toHaveBeenCalled(); // the bounded upload slot has not run
    await vi.runAllTimersAsync(); await preparation;
    expect(upload).toHaveBeenCalledExactlyOnceWith(texture);
    const names = stage.mock.calls.map(call => call[0]);
    expect(names.indexOf('texture-upload:programs-ready')).toBeLessThan(names.indexOf('texture-upload:start'));
    expect(isCommercialSceneCompiling(gl)).toBe(false);
    expect(mesh.parent).toBe(scene); expect(mesh.visible).toBe(true);
    texture.dispose(); material.dispose(); mesh.geometry.dispose(); initialTarget?.dispose();
  });
  it('cancels between link readiness and upload without touching GPU textures or renderer state', async () => {
    vi.useFakeTimers();
    const { gl, pending, initialTarget } = rendererFixture();
    const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1); texture.needsUpdate = true;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: texture }));
    const scene = new THREE.Scene(); scene.add(mesh);
    const upload = vi.fn(); Object.assign(gl, { initTexture: upload });
    const controller = new AbortController();
    const preparation = prepareCommercialScene(gl, scene, new THREE.Camera(), controller.signal);
    const rejected = expect(preparation).rejects.toMatchObject({ name: 'AbortError' });
    pending[0].resolve(); await vi.advanceTimersByTimeAsync(10);
    expect(isCommercialSceneCompiling(gl)).toBe(true);
    controller.abort(); await rejected;
    await vi.runAllTimersAsync();
    expect(upload).not.toHaveBeenCalled();
    expect(isCommercialSceneCompiling(gl)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(gl.getRenderTarget()).toBe(initialTarget);
    expect(gl.toneMapping).toBe(THREE.ReinhardToneMapping);
    expect(gl.outputColorSpace).toBe(THREE.LinearSRGBColorSpace);
    expect(mesh.parent).toBe(scene);
    texture.dispose(); (mesh.material as THREE.Material).dispose(); mesh.geometry.dispose(); initialTarget?.dispose();
  });
  it('keeps late reflection/upload markers owned by their original boot session', async () => {
    vi.useFakeTimers();
    diagnostics.beginCommercialMapBoot();
    const { gl, pending, initialTarget } = rendererFixture();
    const texture = new THREE.DataTexture(new Uint8Array(4), 1, 1); texture.needsUpdate = true;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: texture }));
    const scene = new THREE.Scene(); scene.add(mesh);
    const upload = vi.fn(); Object.assign(gl, { initTexture: upload });
    const oldPreparation = prepareCommercialScene(gl, scene, new THREE.Camera());
    diagnostics.beginCommercialMapBoot(); // another route owns all subsequent boot metrics
    pending[0].resolve(); await vi.runAllTimersAsync(); await oldPreparation;
    expect(upload).toHaveBeenCalledOnce();
    for (const name of ['compile-direct:end', 'program-introspection', 'texture-upload:programs-ready', 'texture-upload:start', 'texture-upload:end']) {
      expect(diagnostics.getCommercialMapBootSnapshot().marks[name]).toBeUndefined();
    }
    texture.dispose(); (mesh.material as THREE.Material).dispose(); mesh.geometry.dispose(); initialTarget?.dispose();
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
  it('initializes only ready programs in bounded batches and reuses their reflection in later warmups', async () => {
    vi.useFakeTimers();
    let lastReady = false;
    const material = new THREE.MeshStandardMaterial();
    const programs = Array.from({ length: 5 }, (_, index) => ({
      isReady: () => index !== 4 || lastReady, getUniforms: vi.fn(), getAttributes: vi.fn(),
    }));
    const renderer = { compile: () => new Set([material]), properties: { get: () => ({
      programs: new Map(programs.map((program, index) => [String(index), program])), currentProgram: programs[4],
    }) } } as unknown as THREE.WebGLRenderer;
    const stage = vi.fn(); vi.spyOn(diagnostics, 'captureCommercialMapStageRecorder').mockReturnValue(stage);
    let done = false;
    const preparation = compileCommercialMapPrograms(renderer, new THREE.Group(), new THREE.Camera(), new THREE.Scene()).then(() => { done = true; });
    expect(programs.reduce((sum, program) => sum + program.getUniforms.mock.calls.length, 0)).toBeLessThanOrEqual(2);
    expect(programs[4].getUniforms).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    expect(done).toBe(false);
    lastReady = true; await vi.runAllTimersAsync(); await preparation;
    for (const program of programs) {
      expect(program.getUniforms).toHaveBeenCalledOnce(); expect(program.getAttributes).toHaveBeenCalledOnce();
      expect(program.getUniforms.mock.invocationCallOrder[0]).toBeLessThan(program.getAttributes.mock.invocationCallOrder[0]);
    }
    const report = stage.mock.calls.find(call => call[0] === 'program-introspection');
    expect(report?.[1]).toMatchObject({ programCount: 5, initializedPrograms: 5, outcome: 'complete' });
    expect(report?.[1]?.batches).toBeGreaterThanOrEqual(3);
    expect(report?.[1]?.duration).toBeGreaterThanOrEqual(Number(report?.[1]?.maximumBatchMs));
    await compileCommercialMapPrograms(renderer, new THREE.Group(), new THREE.Camera(), new THREE.Scene());
    for (const program of programs) expect(program.getUniforms).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0); material.dispose();
  });
  it('cancels between reflection batches without initializing the remaining programs', async () => {
    vi.useFakeTimers();
    const material = new THREE.MeshBasicMaterial();
    const programs = Array.from({ length: 6 }, () => ({ isReady: () => true, getUniforms: vi.fn(), getAttributes: vi.fn() }));
    const renderer = { compile: () => new Set([material]), properties: { get: () => ({ programs: new Map(programs.map((program, index) => [String(index), program])) }) } } as unknown as THREE.WebGLRenderer;
    const controller = new AbortController();
    const preparation = compileCommercialMapPrograms(renderer, new THREE.Group(), new THREE.Camera(), new THREE.Scene(), controller.signal);
    const rejected = expect(preparation).rejects.toMatchObject({ name: 'AbortError' });
    const initializedBeforeAbort = programs.reduce((sum, program) => sum + program.getUniforms.mock.calls.length, 0);
    expect(initializedBeforeAbort).toBeGreaterThan(0); expect(initializedBeforeAbort).toBeLessThanOrEqual(2);
    controller.abort(); await rejected; await vi.runAllTimersAsync();
    expect(programs.reduce((sum, program) => sum + program.getUniforms.mock.calls.length, 0)).toBe(initializedBeforeAbort);
    expect(vi.getTimerCount()).toBe(0); material.dispose();
  });
  it('propagates reflection failure before uploads and releases the draw gate with renderer state restored', async () => {
    const { gl, initialTarget } = rendererFixture();
    const getUniforms = vi.fn(() => { throw new Error('uniform reflection failed'); });
    vi.spyOn(gl.properties, 'get').mockReturnValue({ currentProgram: { isReady: () => true, getUniforms } });
    const upload = vi.fn(); Object.assign(gl, { initTexture: upload });
    await expect(prepareCommercialScene(gl, new THREE.Scene(), new THREE.Camera())).rejects.toThrow('uniform reflection failed');
    expect(upload).not.toHaveBeenCalled(); expect(isCommercialSceneCompiling(gl)).toBe(false);
    expect(gl.getRenderTarget()).toBe(initialTarget); expect(gl.toneMapping).toBe(THREE.ReinhardToneMapping);
    expect(gl.outputColorSpace).toBe(THREE.LinearSRGBColorSpace); initialTarget?.dispose();
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
