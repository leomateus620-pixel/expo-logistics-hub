import { useLayoutEffect } from 'react';
import { act, cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls } from 'three-stdlib';
import type { MapEntity } from '@/features/commercial-map/types';
import type { VisitCharacterController } from '@/features/commercial-map/visit/VisitCharacterController';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import { useVisitStore } from '@/features/commercial-map/visit/useVisitStore';
import { useVisitCameraLease } from '@/features/commercial-map/visit/useVisitCameraLease';
import { visitCameraFrame, visitRuntime } from '@/features/commercial-map/visit/visitRuntime';
import { addLook, installVisitInput, setTouchMove, visitInput } from '@/features/commercial-map/visit/VisitInputManager';
import VisitMode from '@/features/commercial-map/visit/VisitMode';

const runtime = vi.hoisted(() => ({
  frame: null as null | ((state: unknown, delta: number) => void),
  character: null as VisitCharacterController | null,
  camera: null as PerspectiveCamera | null,
  size: { width: 1440, height: 900 },
  invalidate: vi.fn(), setEvents: vi.fn(),
  prepare: vi.fn<() => Promise<void>>(),
  gl: { domElement: document.createElement('canvas'), getContext: () => ({ isContextLost: () => false }) },
  builds: 0,
  rejectedRoute: false,
}));
vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: typeof runtime) => unknown) => selector(runtime),
  useFrame: (callback: typeof runtime.frame) => { runtime.frame = callback; },
}));
vi.mock('@/features/commercial-map/visit/VisitPerformanceManager', () => ({ VisitPerformanceManager: () => null }));
vi.mock('@/features/commercial-map/utils/sceneShaderWarmup', () => ({
  prepareCommercialSceneLayer: () => runtime.prepare(),
}));
vi.mock('@/features/commercial-map/visit/VisitCharacter', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  return { VisitCharacter: forwardRef(function Character(_props, ref) {
    useImperativeHandle(ref, () => ({ update(character: VisitCharacterController) { runtime.character = character; } }), []);
    return null;
  }) };
});
vi.mock('@/features/commercial-map/visit/VisitPOIManager', () => ({ buildVisitPOIs: () => [] }));
vi.mock('@/features/commercial-map/visit/VisitWorld', () => ({
  defaultVisitSpawn: () => ({ x: 1.5, y: 0, z: 1.5 }),
  buildVisitWorld: () => {
    runtime.builds++;
    return {
      maxHeight: 2, ground: { heightAt: () => 0 }, collisions: { colliders: [] },
      bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
      resolveSpawn: (p: { x: number; z: number }) => ({ ...p, y: 0 }),
      move: (p: { x: number; z: number }, dx: number, dz: number) => { p.x += dx; p.z += dz; return p; },
      cameraProbe: () => runtime.rejectedRoute ? 0 : 1, occluded: () => false,
    };
  },
}));

const mapInitial = useCommercialMapStore.getState();
beforeEach(() => {
  useVisitStore.getState().finishExit();
  useCommercialMapStore.setState({ ...mapInitial, lunarLaunchPhase: 'idle', lunarLaunchReturning: false, interiorEntityId: null });
  useVisitStore.setState({ enabled: false, phase: 'loading', cameraMode: 'first', error: null, activeInterior: null, activePOI: null, requestedAtMs: 0 });
  visitCameraFrame.ready = false; visitCameraFrame.initial.captured = false;
  visitInput.reset(); visitInput.enabled = false;
  runtime.camera = new PerspectiveCamera(38, 1.5, .03, 600);
  runtime.character = null; runtime.frame = null; runtime.builds = 0;
  runtime.size = { width: 1440, height: 900 };
  runtime.rejectedRoute = false;
  runtime.invalidate.mockClear(); runtime.setEvents.mockClear();
  runtime.prepare.mockReset().mockResolvedValue(undefined);
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  useVisitStore.getState().finishExit();
  visitInput.reset(); visitInput.enabled = false;
  vi.restoreAllMocks();
});

function controlsFor(camera: PerspectiveCamera) {
  let pending = 0;
  const controls = {
    enabled: true, enableDamping: true, enablePan: true, enableRotate: true, enableZoom: true,
    zoomToCursor: true, autoRotate: false, minDistance: .5, maxDistance: 200,
    minPolarAngle: .025, maxPolarAngle: 1.5, minAzimuthAngle: -Infinity, maxAzimuthAngle: Infinity,
    target: new Vector3(1, .1, 2),
    update: vi.fn(() => {
      camera.position.x += pending;
      controls.target.x += pending;
      pending = controls.enableDamping ? pending * .9 : 0;
      return true;
    }),
  };
  return { controls: controls as unknown as OrbitControls, setPending: (value: number) => { pending = value; }, pending: () => pending };
}

describe('lease da câmera, saída e isolamento de sessão', () => {
  it('captura antes dos props disabled, drena damping e restaura lens, target e controles', () => {
    const camera = runtime.camera!; camera.position.set(9, 8, 7); camera.zoom = 1.3;
    camera.setViewOffset(1440, 900, 50, 10, 1440, 900);
    const fixture = controlsFor(camera), controls = fixture.controls, ref = { current: controls };
    camera.lookAt(controls.target);
    const expected = { p: camera.position.toArray(), q: camera.quaternion.toArray(), target: controls.target.toArray(), view: { ...camera.view }, projection: camera.projectionMatrix.toArray() };
    fixture.setPending(2);
    const hook = renderHook(() => {
      const lease = useVisitCameraLease(camera, ref, runtime.invalidate);
      // The renderer commits disabled props before layout effects on entry.
      useLayoutEffect(() => { if (lease.enabled) controls.enabled = false; }, [lease.enabled]);
      return lease;
    });
    act(() => useVisitStore.getState().start());
    expect(controls.enabled).toBe(false);
    expect(fixture.pending()).toBe(0);
    expect(camera.position.toArray()).toEqual(expected.p);
    expect(visitCameraFrame.initial.captured).toBe(true);
    Object.assign(visitCameraFrame.position, { x: 0, y: .243, z: 0 });
    Object.assign(visitCameraFrame.target, { x: 0, y: .243, z: -1 });
    Object.assign(visitCameraFrame, { ready: true, fov: 65, near: .008, far: 180 });
    act(() => { expect(hook.result.current.apply(false)).toBe(true); });
    expect(camera.position.y).toBe(.243); expect(camera.view?.enabled).toBe(false);
    fixture.setPending(4);
    act(() => useVisitStore.setState({ phase: 'active' }));
    act(() => useVisitStore.getState().exit());
    expect(useVisitStore.getState().enabled).toBe(true);
    act(() => useVisitStore.getState().finishExit());
    expect(controls.enabled).toBe(true); expect(controls.enableDamping).toBe(true);
    expect(controls.minDistance).toBe(.5); expect(controls.maxDistance).toBe(200);
    expect(camera.position.toArray()).toEqual(expected.p);
    expect(camera.quaternion.toArray()).toEqual(expected.q);
    expect(controls.target.toArray()).toEqual(expected.target);
    expect(camera.fov).toBe(38); expect(camera.near).toBe(.03); expect(camera.far).toBe(600); expect(camera.zoom).toBe(1.3);
    expect(camera.view).toEqual(expected.view);
    expect(camera.projectionMatrix.toArray()).toEqual(expected.projection);
    controls.update();
    expect(camera.position.toArray()).toEqual(expected.p);
    expect(fixture.pending()).toBe(0);
  });

  it('repete 20 sessões e libera subscription ao desmontar, sem reter controles bloqueados', () => {
    const camera = runtime.camera!, fixture = controlsFor(camera), ref = { current: fixture.controls };
    camera.position.set(7, 4, 3); camera.lookAt(ref.current.target);
    const hook = renderHook(() => useVisitCameraLease(camera, ref, runtime.invalidate));
    for (let cycle = 0; cycle < 20; cycle++) {
      act(() => useVisitStore.getState().start());
      expect(ref.current.enabled).toBe(false);
      act(() => useVisitStore.getState().finishExit());
      expect(ref.current.enabled).toBe(true);
      expect(camera.position.toArray()).toEqual([7,4,3]);
    }
    hook.unmount();
    visitCameraFrame.initial.captured = false;
    act(() => useVisitStore.getState().start());
    expect(visitCameraFrame.initial.captured).toBe(false);
    expect(ref.current.enabled).toBe(true);
  });

  it('erro de módulo permite sair sem aguardar um controlador desmontado e restaura vendas/seleção', () => {
    const camera = runtime.camera!, fixture = controlsFor(camera);
    useCommercialMapStore.setState({ salesPresentationActive: true, selectedEntityId: 'lot-original', selectedModuleId: 'module-original', activePanel: 'details', treesVisible: false, nightModeActive: true, rainModeActive: true });
    renderHook(() => useVisitCameraLease(camera, { current: fixture.controls }, runtime.invalidate));
    act(() => useVisitStore.getState().start({ entityId: 'requested-lot' }));
    expect(useCommercialMapStore.getState()).toMatchObject({ salesPresentationActive: false, treesVisible: true, activePanel: null });
    act(() => useVisitStore.setState({ phase: 'active', error: 'Falha simulada do módulo' }));
    act(() => useVisitStore.getState().exit());
    expect(useVisitStore.getState()).toMatchObject({ enabled: false, activePOI: null, error: null });
    expect(useCommercialMapStore.getState()).toMatchObject({ salesPresentationActive: true, selectedEntityId: 'lot-original', selectedModuleId: 'module-original', activePanel: 'details', treesVisible: false, nightModeActive: true, rainModeActive: true });
    expect(fixture.controls.enabled).toBe(true);
  });

  it('interior recebe a câmera e a visita não toma um cinematic ativo', () => {
    const camera = runtime.camera!, fixture = controlsFor(camera);
    const hook = renderHook(() => useVisitCameraLease(camera, { current: fixture.controls }, runtime.invalidate));
    useCommercialMapStore.setState({ lunarLaunchPhase: 'ignition' });
    act(() => useVisitStore.getState().start());
    expect(useVisitStore.getState().enabled).toBe(false);
    useCommercialMapStore.setState({ lunarLaunchPhase: 'idle' });
    act(() => useVisitStore.getState().start());
    camera.position.set(2, 3, 4);
    act(() => { expect(hook.result.current.apply(true)).toBe(false); });
    expect(camera.position.toArray()).toEqual([2,3,4]);
  });
});

describe('entrada e dados atualizados no controlador real', () => {
  it('rota de entrada bloqueada mantém a lente, interrompe o loop e permite saída explícita', async () => {
    act(() => useVisitStore.getState().start());
    visitCameraFrame.initial.captured = true;
    Object.assign(visitCameraFrame.initial.position, { x: 5, y: 10, z: 10 });
    Object.assign(visitCameraFrame.initial.target, { x: 0, y: 0, z: 0 });
    const before = { ...visitCameraFrame.position };
    runtime.rejectedRoute = true;
    const road = { id: 'road', publicIdentifier: 'A1', classification: 'ROAD', name: 'Entrada',
      geometry: { coordinates: [[[1,1],[3,1],[3,3],[1,3],[1,1]]], elevation: 0, extrusionHeight: .01 },
    } as MapEntity;
    await act(async () => { render(<VisitMode entities={[road]} lots={[]} trees={[]} />); });
    act(() => runtime.frame?.({}, 1 / 60));
    expect(useVisitStore.getState().error).toMatch(/passagem livre/);
    expect(visitCameraFrame.position).toEqual(before);
    runtime.invalidate.mockClear();
    act(() => { for (let i = 0; i < 60; i++) runtime.frame?.({}, 1 / 60); });
    expect(visitInput.enabled).toBe(false);
    expect(visitRuntime.renderingActive).toBe(false);
    expect(runtime.invalidate).not.toHaveBeenCalled();
    act(() => useVisitStore.getState().exit());
    expect(useVisitStore.getState().enabled).toBe(false);
  });
  it('aguarda shaders, libera controle após transição e mantém localização ao atualizar dados', async () => {
    const road = { id: 'road', publicIdentifier: 'A1', classification: 'ROAD', name: 'Entrada',
      geometry: { coordinates: [[[1,1],[3,1],[3,3],[1,3],[1,1]]], elevation: 0, extrusionHeight: .01 },
    } as MapEntity;
    act(() => useVisitStore.getState().start());
    visitCameraFrame.initial.captured = true;
    Object.assign(visitCameraFrame.initial.position, { x: 5, y: 10, z: 10 });
    Object.assign(visitCameraFrame.initial.target, { x: 0, y: 0, z: 0 });
    let ready!: () => void;
    runtime.prepare.mockReturnValue(new Promise<void>(resolve => { ready = resolve; }));
    const view = render(<VisitMode entities={[road]} lots={[]} trees={[]} />);
    expect(visitInput.enabled).toBe(false);
    act(() => { for (let i = 0; i < 180; i++) runtime.frame?.({}, 1 / 60); });
    expect(useVisitStore.getState().phase).toBe('loading');
    expect(visitInput.enabled).toBe(false);
    await act(async () => { ready(); });
    act(() => { for (let i = 0; i < 180; i++) runtime.frame?.({}, 1 / 60); });
    expect(useVisitStore.getState().phase).toBe('active');
    expect(visitInput.enabled).toBe(true);
    fireEvent.keyDown(window, { code: 'KeyW' });
    act(() => { for (let i = 0; i < 60; i++) runtime.frame?.({}, 1 / 60); });
    const character = runtime.character!, position = { ...character.position }, count = runtime.builds;
    expect(character.distance).toBeGreaterThan(.1);
    const refreshed = { entities: [{ ...road, name: 'Entrada com dado atualizado' }], lots: [], trees: [] };
    view.rerender(<VisitMode {...refreshed} />);
    expect(runtime.builds).toBeGreaterThan(count);
    expect(runtime.character).toBe(character);
    expect(character.position).toEqual(position);
    fireEvent.keyUp(window, { code: 'KeyW' });
    act(() => { for (let i = 0; i < 210; i++) runtime.frame?.({}, 1 / 60); });
    expect(visitRuntime.renderingActive).toBe(false);
    runtime.invalidate.mockClear();
    act(() => { for (let i = 0; i < 60; i++) runtime.frame?.({}, 1 / 60); });
    expect(runtime.invalidate).not.toHaveBeenCalled();
    runtime.size = { width: 900, height: 1440 };
    view.rerender(<VisitMode {...refreshed} />);
    expect(runtime.invalidate).toHaveBeenCalled();
    act(() => runtime.frame?.({}, 1 / 60));
    expect(visitRuntime.renderingActive).toBe(true);
    act(() => { for (let i = 0; i < 180; i++) runtime.frame?.({}, 1 / 60); });
    expect(visitRuntime.renderingActive).toBe(false);
    runtime.invalidate.mockClear();
    const restPosition = { ...character.position };
    fireEvent.keyDown(window, { code: 'KeyW' });
    expect(runtime.invalidate).toHaveBeenCalled();
    act(() => { for (let i = 0; i < 30; i++) runtime.frame?.({}, 1 / 60); });
    expect(character.position).not.toEqual(restPosition);
    fireEvent.keyUp(window, { code: 'KeyW' });
    act(() => { for (let i = 0; i < 210; i++) runtime.frame?.({}, 1 / 60); });
    runtime.invalidate.mockClear();
    act(() => useVisitStore.getState().setCameraMode('third'));
    expect(runtime.invalidate).toHaveBeenCalled();
    act(() => runtime.frame?.({}, 1 / 60));
    expect(visitRuntime.renderingActive).toBe(true);
    vi.mocked(document.hasFocus).mockReturnValue(false);
    runtime.invalidate.mockClear();
    act(() => runtime.frame?.({}, 1 / 60));
    expect(visitRuntime.renderingActive).toBe(false);
    expect(visitInput.enabled).toBe(false);
    expect(runtime.invalidate).not.toHaveBeenCalled();
    vi.mocked(document.hasFocus).mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    expect(runtime.invalidate).toHaveBeenCalled();
    act(() => runtime.frame?.({}, 1 / 60));
    expect(visitInput.enabled).toBe(true);
    view.unmount();
    expect(visitInput.enabled).toBe(false);
    expect(runtime.setEvents).toHaveBeenLastCalledWith({ enabled: true });
  });
});

describe('listeners e captura de input', () => {
  it('20 entradas/saídas não multiplicam keyboard listeners e restauram propriedades do canvas', () => {
    const canvas = document.createElement('canvas'); canvas.tabIndex = 7; canvas.style.touchAction = 'pan-y';
    const wake = vi.fn();
    for (let i = 0; i < 20; i++) {
      const dispose = installVisitInput(canvas, wake);
      visitInput.enabled = true;
      setTouchMove(10, 1); addLook(5, 6);
      window.dispatchEvent(new Event('blur'));
      expect(visitInput.forward).toBe(0); expect(visitInput.lookX).toBe(0);
      dispose();
      expect(canvas.tabIndex).toBe(7); expect(canvas.style.touchAction).toBe('pan-y');
    }
    const dispose = installVisitInput(canvas, wake); visitInput.enabled = true;
    wake.mockClear(); fireEvent.keyDown(window, { code: 'KeyW' });
    expect(wake).toHaveBeenCalledTimes(1); expect(visitInput.forward).toBe(1);
    dispose(); wake.mockClear(); fireEvent.keyDown(window, { code: 'KeyS' });
    expect(wake).not.toHaveBeenCalled(); expect(visitInput.forward).toBe(0);
  });
});
