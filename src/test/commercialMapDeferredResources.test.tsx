import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import * as THREE from 'three';
import { DeferredSceneErrorBoundary, PreparedSceneLayer } from '@/features/commercial-map/components/canvas/DeferredSceneLayer';
import { prepareCommercialSceneLayer } from '@/features/commercial-map/utils/sceneShaderWarmup';
import { readPreparedHydrology, retainHydrologyPreparationOwner } from '@/features/commercial-map/utils/hydrologyPreparationResource';
import { prepareHydrologyCoordinates, type HydrologyPreparationInput, type PackedHydrologyPreparation } from '@/features/commercial-map/utils/hydrologyPreparation';
import { markCommercialMapStage } from '@/features/commercial-map/utils/performanceDiagnostics';

const rendererRuntime = vi.hoisted(() => ({ state: null as unknown,
  frame: null as null | ((state: unknown, delta: number) => void),
  tasks: [] as { id: string; run: (done: () => void) => void }[] }));
vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: unknown) => unknown) => selector(rendererRuntime.state),
  useFrame: (callback: (state: unknown, delta: number) => void) => { rendererRuntime.frame = callback; },
}));
vi.mock('@/features/commercial-map/utils/sceneShaderWarmup', () => ({
  isCommercialSceneCompiling: () => false,
  prepareCommercialSceneLayer: vi.fn(),
}));
vi.mock('@/features/commercial-map/utils/progressiveSceneBoot', () => ({
  qualifiesInteractiveFrame: () => false,
  createSceneHydrationQueue: () => ({
    add: (task: { id: string; run: (done: () => void) => void }) => {
      rendererRuntime.tasks.push(task);
      return () => { rendererRuntime.tasks = rendererRuntime.tasks.filter((candidate) => candidate !== task); };
    },
    start: () => undefined, dispose: () => undefined,
  }),
}));

vi.mock('@/features/commercial-map/utils/performanceDiagnostics', () => ({
  commercialMapDiagnosticsEnabled: false,
  markCommercialMapStage: vi.fn(),
  getCommercialMapBootSnapshot: () => ({ marks: {} }),
}));

class WorkerMock {
  static created: WorkerMock[] = [];
  onmessage: ((event: MessageEvent<PackedHydrologyPreparation>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { WorkerMock.created.push(this); }
}

function input(): HydrologyPreparationInput {
  return { nodes: [], segments: [], surfaces: [], reducedGraphics: false };
}
function pendingPreparation(data: HydrologyPreparationInput, owner: object) {
  try { readPreparedHydrology(data, owner); }
  catch (pending) {
    expect(pending).toBeInstanceOf(Promise);
    return pending as Promise<void>;
  }
  throw new Error('Expected pending worker preparation');
}
beforeEach(() => {
  WorkerMock.created = [];
  rendererRuntime.tasks = [];
  vi.stubGlobal('Worker', WorkerMock);
  vi.clearAllMocks();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('deferred scene resource isolation and cancellation', () => {
  it('keeps a rejected optional shader group hidden, releases its slot once and ignores later frames', async () => {
    let reject: (reason: Error) => void = () => undefined;
    vi.mocked(prepareCommercialSceneLayer).mockReturnValueOnce(new Promise<void>((_, fail) => { reject = fail; }));
    const group = new THREE.Group(); group.visible = false;
    const invalidate = vi.fn(), released = vi.fn();
    rendererRuntime.state = { gl: { domElement: document.createElement('canvas'), shadowMap: { needsUpdate: false } }, scene: new THREE.Scene(), camera: new THREE.Camera(), invalidate };
    const view = renderHook(() => {
      const element = PreparedSceneLayer({ id: 'rejected-shader', children: null, complete: released });
      (element as unknown as { ref: { current: THREE.Group } }).ref.current = group;
      return element;
    });
    await act(async () => { reject(new Error('optional shader could not compile')); });
    expect(group.visible).toBe(false);
    expect(released).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledOnce();
    for (let frame = 0; frame < 20; frame += 1) rendererRuntime.frame?.({}, .05);
    expect(released).toHaveBeenCalledOnce();
    expect(group.visible).toBe(false);
    view.unmount();
  });

  it('aborts preparation on teardown without revealing its group or releasing a retired slot twice', async () => {
    let reject: (reason: Error) => void = () => undefined;
    vi.mocked(prepareCommercialSceneLayer).mockReturnValueOnce(new Promise<void>((_, fail) => { reject = fail; }));
    const group = new THREE.Group(); group.visible = false;
    const released = vi.fn();
    rendererRuntime.state = { gl: { domElement: document.createElement('canvas'), shadowMap: { needsUpdate: false } }, scene: new THREE.Scene(), camera: new THREE.Camera(), invalidate: vi.fn() };
    const view = renderHook(() => {
      const element = PreparedSceneLayer({ id: 'abandoned-shader', children: null, complete: released });
      (element as unknown as { ref: { current: THREE.Group } }).ref.current = group;
      return element;
    });
    const signal = vi.mocked(prepareCommercialSceneLayer).mock.calls.at(-1)![4]!;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => { reject(new DOMException('aborted', 'AbortError')); });
    expect(group.visible).toBe(false);
    expect(released).not.toHaveBeenCalled();
  });

  it('aborts dead-context programs, releases the slot once and only reveals after queued restoration compiles', async () => {
    let failOld: (error: Error) => void = () => undefined;
    let finishRestored: () => void = () => undefined;
    vi.mocked(prepareCommercialSceneLayer)
      .mockReturnValueOnce(new Promise<void>((_, reject) => { failOld = reject; }))
      .mockReturnValueOnce(new Promise<void>((resolve) => { finishRestored = resolve; }));
    const canvas = document.createElement('canvas');
    const group = new THREE.Group(); group.visible = false;
    const released = vi.fn(), restoredReleased = vi.fn();
    rendererRuntime.state = { gl: { domElement: canvas, shadowMap: { needsUpdate: false } }, scene: new THREE.Scene(), camera: new THREE.Camera(), invalidate: vi.fn() };
    const view = renderHook(() => {
      const element = PreparedSceneLayer({ id: 'restored-layer', children: null, complete: released });
      (element as unknown as { ref: { current: THREE.Group } }).ref.current = group;
      return element;
    });
    const oldSignal = vi.mocked(prepareCommercialSceneLayer).mock.calls.at(-1)![4]!;
    canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(oldSignal.aborted).toBe(true);
    expect(released).toHaveBeenCalledOnce();
    expect(group.visible).toBe(false);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    const task = rendererRuntime.tasks.find((candidate) => candidate.id === 'restore:restored-layer')!;
    expect(task).toBeDefined();
    expect(group.visible).toBe(false);
    task.run(restoredReleased);
    await act(async () => { failOld(new DOMException('context lost', 'AbortError')); });
    expect(group.visible).toBe(false);
    await act(async () => { finishRestored(); });
    expect(group.visible).toBe(true);
    for (let frame = 0; frame < 20; frame += 1) rendererRuntime.frame?.({}, .05);
    expect(released).toHaveBeenCalledOnce();
    expect(restoredReleased).toHaveBeenCalledOnce();
    view.unmount();
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(rendererRuntime.tasks).toHaveLength(0);
  });

  it('terminates abandoned suspended work without CPU fallback and permits fresh Canvas reentry', async () => {
    vi.useFakeTimers();
    const data = input();
    const owner = {};
    const release = retainHydrologyPreparationOwner(owner);
    const pending = pendingPreparation(data, owner);
    const first = WorkerMock.created[0];
    release();
    await pending;
    expect(first.terminate).toHaveBeenCalledOnce();
    expect(first.onmessage).toBeNull();
    expect(first.onerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(markCommercialMapStage).not.toHaveBeenCalledWith('hydrology-worker-fallback');

    const nextOwner = {};
    const nextRelease = retainHydrologyPreparationOwner(nextOwner);
    const retry = pendingPreparation(data, nextOwner);
    expect(WorkerMock.created).toHaveLength(2);
    WorkerMock.created[1].onmessage!({ data: prepareHydrologyCoordinates(data) } as MessageEvent<PackedHydrologyPreparation>);
    await retry;
    expect(readPreparedHydrology(data, nextOwner)).toEqual({ pipeSpans: [], placements: [] });
    nextRelease();
  });

  it('retains shared in-flight work for another Canvas and reuses completed data after both leave', async () => {
    const data = input();
    const firstOwner = {}, secondOwner = {};
    const firstRelease = retainHydrologyPreparationOwner(firstOwner);
    const secondRelease = retainHydrologyPreparationOwner(secondOwner);
    const first = pendingPreparation(data, firstOwner);
    const second = pendingPreparation(data, secondOwner);
    expect(first).toBe(second);
    firstRelease();
    expect(WorkerMock.created[0].terminate).not.toHaveBeenCalled();
    WorkerMock.created[0].onmessage!({ data: prepareHydrologyCoordinates(data) } as MessageEvent<PackedHydrologyPreparation>);
    await second;
    const prepared = readPreparedHydrology(data, secondOwner);
    secondRelease();
    const thirdOwner = {};
    const thirdRelease = retainHydrologyPreparationOwner(thirdOwner);
    expect(readPreparedHydrology(data, thirdOwner)).toBe(prepared);
    expect(WorkerMock.created).toHaveLength(1);
    thirdRelease();
  });

  it('cancels a queued main-thread fallback when navigation abandons its worker', async () => {
    vi.useFakeTimers();
    const data = input(), owner = {};
    const release = retainHydrologyPreparationOwner(owner);
    const pending = pendingPreparation(data, owner);
    WorkerMock.created[0].onerror!({ message: 'worker could not start' } as ErrorEvent);
    await Promise.resolve();
    expect(markCommercialMapStage).toHaveBeenCalledWith('hydrology-worker-fallback');
    release();
    await pending;
    expect(vi.getTimerCount()).toBe(0);
    expect(vi.mocked(markCommercialMapStage).mock.calls.some(([name]) => name === 'hydrology-cpu:end')).toBe(false);
  });

  it('contains an optional rendering failure and releases its slot while retaining the usable interface', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const released = vi.fn();
    function BrokenOptionalLayer(): never { throw new Error('Optional chunk unavailable'); }
    render(<><button>Map controls</button><DeferredSceneErrorBoundary id="rain-test" onFailure={released}>
      <BrokenOptionalLayer />
    </DeferredSceneErrorBoundary></>);
    expect(screen.getByRole('button', { name: 'Map controls' })).toBeInTheDocument();
    expect(released).toHaveBeenCalledOnce();
    expect(markCommercialMapStage).toHaveBeenCalledWith('hydrate:rain-test:failed', undefined, true);
  });
});
