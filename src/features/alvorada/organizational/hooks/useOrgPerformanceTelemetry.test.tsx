import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrgPerformanceTelemetry } from './useOrgPerformanceTelemetry';

function TelemetryHarness({ active }: { active: boolean }) {
  const telemetryRef = useOrgPerformanceTelemetry(active);
  return <div ref={telemetryRef} data-testid="telemetry-root" />;
}

describe('useOrgPerformanceTelemetry', () => {
  let nextFrameId: number;
  let pendingFrames: Map<number, FrameRequestCallback>;

  beforeEach(() => {
    nextFrameId = 1;
    pendingFrames = new Map();
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      pendingFrames.set(frameId, callback);
      return frameId;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((frameId: number) => {
      pendingFrames.delete(frameId);
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function runNextFrame(timestamp: number) {
    const pending = pendingFrames.entries().next().value as [number, FrameRequestCallback] | undefined;
    expect(pending).toBeDefined();
    if (!pending) return;
    pendingFrames.delete(pending[0]);
    act(() => pending[1](timestamp));
  }

  it('publishes aggregate metrics with only one pending animation frame', () => {
    const { getByTestId } = render(<TelemetryHarness active />);
    const root = getByTestId('telemetry-root');

    expect(pendingFrames.size).toBe(1);
    for (let index = 0; index <= 32; index += 1) {
      runNextFrame(index * 16);
      expect(pendingFrames.size).toBe(1);
    }

    expect(Number(root.dataset.orgFps)).toBeGreaterThan(60);
    expect(root.dataset.orgFrameTimeAvgMs).toBe('16.0');
    expect(root.dataset.orgFrameTimeP95Ms).toBe('16.0');
    expect(root.dataset.orgLongFrames).toBe('0');
  });

  it('counts long frames and strictly cleans the loop and attributes', () => {
    const { getByTestId, rerender, unmount } = render(<TelemetryHarness active />);
    const root = getByTestId('telemetry-root');
    const timestamps = [0, 16, 32, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256,
      272, 288, 304, 320, 336, 352, 368, 384, 400, 416, 432, 448, 464, 480, 512];
    timestamps.forEach(runNextFrame);

    expect(root.dataset.orgLongFrames).toBe('1');
    expect(Number(root.dataset.orgFrameTimeP95Ms)).toBeGreaterThanOrEqual(16);

    rerender(<TelemetryHarness active={false} />);
    expect(pendingFrames.size).toBe(0);
    expect(root).not.toHaveAttribute('data-org-fps');
    expect(root).not.toHaveAttribute('data-org-frame-time-avg-ms');
    expect(root).not.toHaveAttribute('data-org-frame-time-p95-ms');
    expect(root).not.toHaveAttribute('data-org-long-frames');
    expect(root).not.toHaveAttribute('data-org-telemetry-state');

    rerender(<TelemetryHarness active />);
    expect(pendingFrames.size).toBe(1);
    unmount();
    expect(pendingFrames.size).toBe(0);
  });

  it('stops sampling after the bounded QA window and retains the final aggregate', () => {
    const { getByTestId } = render(<TelemetryHarness active />);
    const root = getByTestId('telemetry-root');

    for (let index = 0; index <= 375; index += 1) {
      runNextFrame(index * 16);
    }

    expect(pendingFrames.size).toBe(0);
    expect(root).toHaveAttribute('data-org-telemetry-state', 'complete');
    expect(Number(root.dataset.orgFps)).toBeGreaterThan(60);
  });
});
