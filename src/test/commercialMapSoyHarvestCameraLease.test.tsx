import { useLayoutEffect } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import type { OrbitControls } from 'three-stdlib';
import { useSoyHarvestCameraLease } from '@/features/commercial-map/harvest/useSoyHarvestCameraLease';
import { soyHarvestCameraFrame } from '@/features/commercial-map/harvest/SoyHarvestCamera';
import { setSoyHarvestStartGuard, useSoyHarvestStore } from '@/features/commercial-map/harvest/useSoyHarvestStore';
import { useSoyHarvestLifecycle } from '@/features/commercial-map/harvest/useSoyHarvestLifecycle';
import { isSoyHarvestCameraOwned } from '@/features/commercial-map/harvest/soyHarvestOwnership';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import { useVisitStore } from '@/features/commercial-map/visit/useVisitStore';

let now = 1_000;
const invalidate = vi.fn();
const initialMap = useCommercialMapStore.getState();
beforeEach(() => {
  now = 1_000; invalidate.mockClear();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  setSoyHarvestStartGuard(null);
  useSoyHarvestStore.setState({ status: 'idle', enabled: false, session: 0, fieldState: 'green', error: null, reducedMotion: false });
  useVisitStore.setState({ enabled: false });
  useCommercialMapStore.setState({ ...initialMap, workspaceMode: '3d', lunarLaunchPhase: 'idle', lunarLaunchReturning: false,
    interiorEntityId: null, parkingInspectionOpen: false, hydrologicalModeActive: false, salesPresentationActive: false });
  soyHarvestCameraFrame.initial.captured = false; soyHarvestCameraFrame.ready = false;
});
afterEach(() => { cleanup(); setSoyHarvestStartGuard(null); vi.restoreAllMocks(); });

function fixture() {
  const camera = new PerspectiveCamera(38, 1.5, .03, 600);
  camera.position.set(9, 8, 7); camera.zoom = 1.3;
  camera.setViewOffset(1440, 900, 50, 10, 1440, 900);
  let pending = 0;
  const controls = {
    enabled: true, enableDamping: true, enablePan: true, enableRotate: false, enableZoom: true,
    zoomToCursor: true, autoRotate: false, minDistance: .5, maxDistance: 200,
    minPolarAngle: .025, maxPolarAngle: 1.5, minAzimuthAngle: -.8, maxAzimuthAngle: .9,
    target: new Vector3(1, .1, 2), update: vi.fn(() => {
      camera.position.x += pending; controls.target.x += pending;
      pending = controls.enableDamping ? pending * .9 : 0;
      return true;
    }),
  };
  camera.lookAt(controls.target);
  const expected = { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), target: controls.target.toArray(),
    view: { ...camera.view }, projection: camera.projectionMatrix.toArray() };
  return { camera, controls: controls as unknown as OrbitControls, expected,
    setPending: (amount: number) => { pending = amount; }, pending: () => pending };
}

describe('soy camera lease and mutual exclusion', () => {
  it('captures before an earlier store subscriber commits disabled controls in another React root', () => {
    const f = fixture(), ref = { current: f.controls };
    // The map page can hide its dock and reconcile the R3F controls before a
    // later lease subscriber runs. Reproduce that ordering without mocking R3F.
    const unsubscribeEarlier = useSoyHarvestStore.subscribe((state, previous) => {
      if (state.enabled && !previous.enabled) {
        f.controls.enabled = false;
        f.controls.enableDamping = false;
      }
    });
    const hook = renderHook(() => useSoyHarvestCameraLease(f.camera, ref, invalidate));
    act(() => useSoyHarvestStore.getState().requestStart());
    expect(f.controls.enabled).toBe(false);
    act(() => useSoyHarvestStore.setState({status: 'completed', fieldState: 'harvested'}));
    act(() => useSoyHarvestStore.getState().returnToMap());
    now += 651;
    act(() => hook.result.current.apply());
    unsubscribeEarlier();
    expect(useSoyHarvestStore.getState()).toMatchObject({status: 'completed', enabled: false});
    expect(f.controls.enabled).toBe(true);
    expect(f.controls.enableDamping).toBe(true);
    expect(f.camera.position.toArray()).toEqual(f.expected.position);
  });

  it('captures before disabled props and restores lens, orientation, target, limits and damping exactly', () => {
    const f = fixture(), ref = { current: f.controls };
    f.setPending(2);
    const hook = renderHook(() => {
      const lease = useSoyHarvestCameraLease(f.camera, ref, invalidate);
      useLayoutEffect(() => { if (lease.enabled) f.controls.enabled = false; }, [lease.enabled]);
      return lease;
    });
    act(() => { expect(useSoyHarvestStore.getState().requestStart()).toBe(true); });
    expect(f.pending()).toBe(0); expect(f.controls.enabled).toBe(false);
    expect(f.camera.position.toArray()).toEqual(f.expected.position);
    Object.assign(soyHarvestCameraFrame.position, { x: 52, y: 2.3, z: -53 });
    Object.assign(soyHarvestCameraFrame.target, { x: 52, y: .1, z: -54.5 });
    Object.assign(soyHarvestCameraFrame, { ready: true, fov: 44, near: .02, far: 500 });
    act(() => { expect(hook.result.current.apply()).toBe(true); });
    expect(f.camera.view?.enabled).toBe(false); expect(f.camera.zoom).toBe(1);
    f.controls.minDistance = .01; f.controls.maxDistance = 30; f.setPending(3);
    act(() => useSoyHarvestStore.getState().cancel());
    expect(useSoyHarvestStore.getState().status).toBe('restoring');
    now += 325;
    act(() => { expect(hook.result.current.apply()).toBe(true); });
    expect(f.controls.enabled).toBe(false);
    now += 326;
    act(() => { expect(hook.result.current.apply()).toBe(true); });
    expect(useSoyHarvestStore.getState().status).toBe('idle');
    expect(f.camera.position.toArray()).toEqual(f.expected.position);
    expect(f.camera.quaternion.toArray()).toEqual(f.expected.quaternion);
    expect(f.controls.target.toArray()).toEqual(f.expected.target);
    expect(f.camera.view).toEqual(f.expected.view);
    expect(f.camera.projectionMatrix.toArray()).toEqual(f.expected.projection);
    expect([f.camera.fov, f.camera.near, f.camera.far, f.camera.zoom]).toEqual([38, .03, 600, 1.3]);
    expect([f.controls.minDistance, f.controls.maxDistance, f.controls.minAzimuthAngle, f.controls.maxAzimuthAngle]).toEqual([.5, 200, -.8, .9]);
    expect(f.controls.enabled).toBe(true); expect(f.controls.enableRotate).toBe(false); expect(f.controls.enableDamping).toBe(true);
    f.controls.update(); expect(f.pending()).toBe(0); expect(f.camera.position.toArray()).toEqual(f.expected.position);
  });

  it('returns a completed field without resetting it, and restores immediately for reduced motion', () => {
    const f = fixture(), ref = { current: f.controls };
    renderHook(() => useSoyHarvestCameraLease(f.camera, ref, invalidate));
    act(() => { useSoyHarvestStore.getState().requestStart(); });
    act(() => useSoyHarvestStore.setState({ status: 'completed', fieldState: 'harvested', reducedMotion: true }));
    f.camera.position.set(52, 3, -54);
    act(() => useSoyHarvestStore.getState().returnToMap());
    expect(useSoyHarvestStore.getState()).toMatchObject({ status: 'completed', enabled: false, fieldState: 'harvested' });
    expect(f.camera.position.toArray()).toEqual(f.expected.position); expect(f.controls.enabled).toBe(true);
  });

  it('retains one snapshot through portrait resizing while paused and restores the original control limits', () => {
    const f = fixture(), ref = { current: f.controls };
    const hook = renderHook(({ aspect }) => {
      f.camera.aspect = aspect; f.camera.updateProjectionMatrix();
      return useSoyHarvestCameraLease(f.camera, ref, invalidate);
    }, { initialProps: { aspect: 1.5 } });
    act(() => useSoyHarvestStore.getState().requestStart());
    Object.assign(soyHarvestCameraFrame.position, { x: 64, y: 2.7, z: -48.8 });
    Object.assign(soyHarvestCameraFrame.target, { x: 62, y: .4, z: -52.2 });
    Object.assign(soyHarvestCameraFrame, { ready: true, fov: 44, near: .02, far: 500 });
    act(() => {
      useSoyHarvestStore.setState({ status: 'paused' });
      hook.result.current.apply();
    });
    const pausedPosition = f.camera.position.toArray(), pausedTarget = f.controls.target.toArray();
    hook.rerender({ aspect: 390 / 844 });
    act(() => { expect(hook.result.current.apply()).toBe(true); });
    expect(f.camera.position.toArray()).toEqual(pausedPosition);
    expect(f.controls.target.toArray()).toEqual(pausedTarget);
    expect(f.controls.enabled).toBe(false);
    expect(soyHarvestCameraFrame.initial.position).toEqual({ x: 9, y: 8, z: 7 });
    expect(isSoyHarvestCameraOwned()).toBe(true);
    act(() => useSoyHarvestStore.getState().cancel());
    now += 651;
    act(() => hook.result.current.apply());
    expect(f.camera.position.toArray()).toEqual(f.expected.position);
    expect(f.camera.quaternion.toArray()).toEqual(f.expected.quaternion);
    expect(f.camera.aspect).toBe(390 / 844);
    expect(f.camera.view).toEqual(f.expected.view);
    expect([f.controls.minDistance, f.controls.maxDistance, f.controls.minPolarAngle,
      f.controls.maxPolarAngle, f.controls.minAzimuthAngle, f.controls.maxAzimuthAngle])
      .toEqual([.5, 200, .025, 1.5, -.8, .9]);
    expect(f.controls.enabled).toBe(true);
    expect(isSoyHarvestCameraOwned()).toBe(false);
  });

  it('releases subscriptions and controls after repeated sessions and an active unmount', () => {
    const f = fixture(), ref = { current: f.controls };
    const hook = renderHook(() => useSoyHarvestCameraLease(f.camera, ref, invalidate));
    for (let repeat = 0; repeat < 20; repeat++) {
      act(() => { useSoyHarvestStore.getState().requestStart(); useSoyHarvestStore.setState({ reducedMotion: true }); });
      act(() => useSoyHarvestStore.getState().cancel());
      expect(f.controls.enabled).toBe(true); expect(f.camera.position.toArray()).toEqual(f.expected.position);
    }
    act(() => { useSoyHarvestStore.getState().requestStart(); });
    f.camera.position.set(30, 3, -20);
    hook.unmount();
    expect(f.camera.position.toArray()).toEqual(f.expected.position); expect(f.controls.enabled).toBe(true);
    expect(soyHarvestCameraFrame.initial.captured).toBe(false);
    act(() => { useSoyHarvestStore.getState().cancel(); useSoyHarvestStore.getState().finishRestore(); useSoyHarvestStore.getState().requestStart(); });
    expect(soyHarvestCameraFrame.initial.captured).toBe(false);
  });

  it('guards retained replay/retry controls against a competing owner and unauthorized scope', () => {
    const hook = renderHook(({ available }) => useSoyHarvestLifecycle(available, true), { initialProps: { available: true } });
    act(() => useSoyHarvestStore.setState({ status: 'completed', fieldState: 'harvested', enabled: false }));
    act(() => useVisitStore.setState({ enabled: true }));
    act(() => useSoyHarvestStore.getState().replay());
    expect(useSoyHarvestStore.getState()).toMatchObject({ enabled: false, status: 'completed', error: 'Encerre a visita para ver o ciclo.' });
    act(() => { useVisitStore.setState({ enabled: false }); useCommercialMapStore.setState({ lunarLaunchPhase: 'ignition' }); });
    act(() => useSoyHarvestStore.getState().replay());
    expect(useSoyHarvestStore.getState().enabled).toBe(false);
    expect(useSoyHarvestStore.getState().error).toMatch(/foguete/);
    act(() => useCommercialMapStore.setState({ lunarLaunchPhase: 'idle' }));
    hook.rerender({ available: false });
    act(() => { expect(useSoyHarvestStore.getState().requestStart()).toBe(false); });
    expect(useSoyHarvestStore.getState().error).toMatch(/não está disponível/);
  });

  it('keeps ownership through an error dispatch until CameraRig restores the captured lens', () => {
    const f = fixture(), ref = { current: f.controls };
    renderHook(() => useSoyHarvestCameraLease(f.camera, ref, invalidate));
    act(() => { useSoyHarvestStore.getState().requestStart(); });
    expect(isSoyHarvestCameraOwned()).toBe(true);
    f.camera.position.set(52, 3, -54);
    let guardedDuringDispatch = false;
    const unsubscribe = useSoyHarvestStore.subscribe(state => {
      if (state.status !== 'error') return;
      guardedDuringDispatch = isSoyHarvestCameraOwned();
      useVisitStore.getState().start();
    });
    act(() => useSoyHarvestStore.getState().fail('Falha local simulada'));
    unsubscribe();
    expect(guardedDuringDispatch).toBe(true);
    expect(useVisitStore.getState().enabled).toBe(false);
    expect(f.camera.position.toArray()).toEqual(f.expected.position);
    expect(f.controls.enabled).toBe(true);
    expect(isSoyHarvestCameraOwned()).toBe(false);
    expect(useSoyHarvestStore.getState()).toMatchObject({ status: 'error', error: 'Falha local simulada' });
  });
});
