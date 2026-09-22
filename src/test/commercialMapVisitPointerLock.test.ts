import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installVisitInput, visitInput } from '../features/commercial-map/visit/VisitInputManager';

let locked: Element | null = null;
const cleanups: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
  locked = null;
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
  Object.defineProperty(document, 'exitPointerLock', { configurable: true, value: vi.fn(() => { locked = null; }) });
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.runAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
  visitInput.reset(); visitInput.enabled = false;
  document.body.replaceChildren();
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function install(canvas: HTMLCanvasElement) {
  document.body.append(canvas);
  canvas.setPointerCapture = vi.fn();
  canvas.hasPointerCapture = vi.fn(() => false);
  const dispose = installVisitInput(canvas, vi.fn());
  let disposed = false;
  const cleanup = () => { if (!disposed) { disposed = true; dispose(); } };
  cleanups.push(cleanup); visitInput.enabled = true;
  return cleanup;
}
function mouseDown(canvas: HTMLCanvasElement) {
  const event = new Event('pointerdown', { bubbles: true, cancelable: true });
  Object.assign(event, { button: 0, pointerId: 1, clientX: 10, clientY: 20, pointerType: 'mouse' });
  canvas.dispatchEvent(event);
}

describe('Late Pointer Lock ownership after visit teardown', () => {
  it('releases a pending promise grant after leaving the visit', async () => {
    const canvas = document.createElement('canvas'), request = deferred();
    canvas.requestPointerLock = vi.fn(() => request.promise);
    const cleanup = install(canvas); mouseDown(canvas); cleanup();
    expect(document.exitPointerLock).not.toHaveBeenCalled();
    locked = canvas; request.resolve(); await request.promise; await Promise.resolve();
    expect(document.exitPointerLock).toHaveBeenCalledTimes(1);
    expect(locked).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not release the same canvas lock granted to a newer visit', async () => {
    const canvas = document.createElement('canvas'), oldRequest = deferred(), nextRequest = deferred();
    canvas.requestPointerLock = vi.fn().mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(nextRequest.promise);
    const oldCleanup = install(canvas); mouseDown(canvas); oldCleanup();
    install(canvas); mouseDown(canvas);
    locked = canvas; nextRequest.resolve(); await nextRequest.promise; await Promise.resolve();
    oldRequest.resolve(); await oldRequest.promise; await Promise.resolve();
    expect(locked).toBe(canvas); expect(document.exitPointerLock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('still releases a promise grant after the event-only grace period expired', async () => {
    const canvas = document.createElement('canvas'), request = deferred();
    canvas.requestPointerLock = vi.fn(() => request.promise);
    const cleanup = install(canvas); mouseDown(canvas); cleanup();
    vi.advanceTimersByTime(5000);
    expect(vi.getTimerCount()).toBe(0);
    locked = canvas; request.resolve(); await request.promise; await Promise.resolve();
    expect(locked).toBeNull(); expect(document.exitPointerLock).toHaveBeenCalledTimes(1);
  });

  it('handles legacy void grants by event and removes the bounded guard', () => {
    const canvas = document.createElement('canvas');
    canvas.requestPointerLock = vi.fn() as typeof canvas.requestPointerLock;
    const cleanup = install(canvas); mouseDown(canvas); cleanup();
    expect(vi.getTimerCount()).toBe(1);
    locked = canvas; document.dispatchEvent(new Event('pointerlockchange'));
    expect(document.exitPointerLock).toHaveBeenCalledTimes(1);
    expect(locked).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not accumulate legacy guards across twenty pending sessions', () => {
    const canvas = document.createElement('canvas');
    canvas.requestPointerLock = vi.fn() as typeof canvas.requestPointerLock;
    for (let i = 0; i < 20; i++) {
      const cleanup = install(canvas); mouseDown(canvas); cleanup();
      expect(vi.getTimerCount()).toBe(1);
    }
    vi.advanceTimersByTime(5000);
    expect(vi.getTimerCount()).toBe(0);
    locked = canvas; document.dispatchEvent(new Event('pointerlockchange'));
    expect(document.exitPointerLock).not.toHaveBeenCalled();
  });
});
