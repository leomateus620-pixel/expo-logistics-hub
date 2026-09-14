import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeAlvoradaHost } from '@/features/alvorada/hostReadiness';
import { sampleReducedAlvorada } from '@/features/alvorada/reducedMotion';

describe('Portal host readiness (no GPU assumptions)', () => {
  let element: HTMLDivElement;
  let width: number;
  let height: number;
  let resize: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    width = height = 0;
    element = document.createElement('div'); document.body.append(element);
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => ({ width, height } as DOMRect));
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(performance.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', clearTimeout);
    vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { resize = cb; } observe() {} disconnect() {} });
  });
  afterEach(() => { element.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('does not start in a zero-size card, even after the old preparation ceiling', () => {
    const ready = vi.fn(); const frames = vi.fn();
    const stop = observeAlvoradaHost(element, frames, ready);
    vi.advanceTimersByTime(31_000);
    expect(ready).not.toHaveBeenCalled();
    expect(frames).toHaveBeenLastCalledWith({ width: 0, height: 0 }, false);
    width = 390; height = 360; resize();
    vi.advanceTimersByTime(16); expect(ready).not.toHaveBeenCalled();
    vi.advanceTimersByTime(16); expect(ready).toHaveBeenCalledTimes(1);
    stop();
  });
  it('requires consecutive equal frames and latches mounting through orientation/collapse', () => {
    const ready = vi.fn(); const frames = vi.fn();
    width = 390; height = 360;
    const stop = observeAlvoradaHost(element, frames, ready);
    vi.advanceTimersByTime(16); width = 844; height = 300;
    vi.advanceTimersByTime(16); expect(ready).not.toHaveBeenCalled();
    vi.advanceTimersByTime(16); expect(ready).toHaveBeenCalledTimes(1);
    width = 0; resize(); vi.advanceTimersByTime(16);
    expect(frames).toHaveBeenLastCalledWith({ width: 0, height: 300 }, false);
    width = 844; resize(); vi.advanceTimersByTime(32);
    expect(ready).toHaveBeenCalledTimes(1);
    stop();
  });
  it('cancels pending work on unmount, including ResizeObserver callbacks', () => {
    const ready = vi.fn(); const frames = vi.fn(); width = height = 400;
    const stop = observeAlvoradaHost(element, frames, ready); stop(); resize();
    vi.advanceTimersByTime(100);
    expect(frames).not.toHaveBeenCalled(); expect(ready).not.toHaveBeenCalled();
  });
  it('reduced motion samples canonical orbit/geography/dawn without camera travel', () => {
    expect(sampleReducedAlvorada(0).visualElapsed).toBe(0);
    expect(sampleReducedAlvorada(1).visualElapsed).toBe(0);
    expect(sampleReducedAlvorada(2).visualElapsed).toBe(2.4);
    expect(sampleReducedAlvorada(4).visualElapsed).toBe(4.2);
    expect(sampleReducedAlvorada(6).visualElapsed).toBe(7.4);
    expect(sampleReducedAlvorada(1.6).opacity).toBe(0);
    expect(sampleReducedAlvorada(1.9).opacity).toBe(1);
  });
});
