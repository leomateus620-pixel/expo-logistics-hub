import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { presentationStage, PRESENTATION_DURATION_MS } from './presentationPlan';
import { useOrgPresentation } from './hooks/useOrgPresentation';
import { cameraForBounds } from './hooks/useOrgViewport';

function motion(reduced: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('shared organizational presentation', () => {
  it('reveals canonical tiers in order and caps dense unit waves at 3.4 seconds', () => {
    const tiers = [1, 2, 3, 4, 5].map(level => presentationStage(level));
    expect(tiers.map(stage => stage.start)).toEqual([0, 450, 1050, 1650, 2250]);
    tiers.slice(1).forEach((stage, i) => {
      expect(stage.connectorStart).toBeGreaterThanOrEqual(tiers[i].start);
      expect(stage.connectorStart).toBeLessThan(stage.start);
    });
    for (const order of [0, 30, 100, 10000]) {
      const stage = presentationStage(5, order);
      expect(stage.start + stage.duration).toBeLessThanOrEqual(PRESENTATION_DURATION_MS);
    }
  });
  it('finishes immediately on skip, stays finished through refresh and cancels on unmount', () => {
    motion(false); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const view = renderHook(() => useOrgPresentation(true));
    expect(view.result.current.presenting).toBe(true);
    act(() => view.result.current.complete());
    view.rerender();
    act(() => vi.advanceTimersByTime(5000));
    expect(view.result.current.presenting).toBe(false);
    view.unmount(); expect(vi.getTimerCount()).toBe(0);
  });
  it('completes the clock once, and reduced motion starts at the final state', () => {
    motion(false); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const view = renderHook(() => useOrgPresentation(true));
    act(() => vi.advanceTimersByTime(3405));
    expect(view.result.current.presenting).toBe(false);
    view.unmount(); motion(true);
    const reduced = renderHook(() => useOrgPresentation(true));
    expect(reduced.result.current.presenting).toBe(false);
  });
  it.each([[390, 844], [844, 390], [1280, 720]])('fits both dimensions without a clipping scale floor at %ix%i', (width, height) => {
    const bounds = { x: -10, y: -20, width: 1800, height: 3000 };
    const camera = cameraForBounds(bounds, { width, height }, 90, 64);
    expect(camera.scale).toBeLessThan(.25);
    expect(camera.x + bounds.x * camera.scale).toBeGreaterThanOrEqual(12);
    expect(camera.y + bounds.y * camera.scale).toBeGreaterThanOrEqual(102);
    expect(camera.x + (bounds.x + bounds.width) * camera.scale).toBeLessThanOrEqual(width - 12 + .001);
    expect(camera.y + (bounds.y + bounds.height) * camera.scale).toBeLessThanOrEqual(height - 64 + .001);
  });
});
