import { useEffect, useRef, type RefObject } from 'react';

const SAMPLE_WINDOW_MS = 500;
const MAX_SAMPLING_DURATION_MS = 6000;
const LONG_FRAME_THRESHOLD_MS = 50;

function percentile95(samples: number[]): number {
  if (samples.length === 0) return 0;
  const ordered = [...samples].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(ordered.length * 0.95) - 1);
  return ordered[index];
}

function removeTelemetryAttributes(element: HTMLElement): void {
  delete element.dataset.orgFps;
  delete element.dataset.orgFrameTimeAvgMs;
  delete element.dataset.orgFrameTimeP95Ms;
  delete element.dataset.orgLongFrames;
  delete element.dataset.orgTelemetryState;
}

/**
 * Low-overhead QA telemetry. Samples one animation-frame loop for the first six
 * visible seconds, writes aggregate values directly to the graph root roughly
 * twice per second, then stops. Frame data never enters React state and the
 * static graph does not keep a permanent animation loop alive.
 */
export function useOrgPerformanceTelemetry(active: boolean): RefObject<HTMLDivElement> {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return undefined;

    if (!active) {
      removeTelemetryAttributes(element);
      return undefined;
    }

    let animationFrameId: number | null = null;
    let disposed = false;
    let previousFrameAt: number | null = null;
    let windowStartedAt: number | null = null;
    let samplingStartedAt: number | null = null;
    let frameTimes: number[] = [];

    element.dataset.orgFps = '0';
    element.dataset.orgFrameTimeAvgMs = '0';
    element.dataset.orgFrameTimeP95Ms = '0';
    element.dataset.orgLongFrames = '0';
    element.dataset.orgTelemetryState = 'sampling';

    const resetWindow = () => {
      previousFrameAt = null;
      windowStartedAt = null;
      frameTimes = [];
    };

    const scheduleFrame = (callback: FrameRequestCallback) => {
      animationFrameId = window.requestAnimationFrame(callback);
    };

    const measureFrame: FrameRequestCallback = (timestamp) => {
      animationFrameId = null;
      if (disposed) return;

      if (windowStartedAt === null) windowStartedAt = timestamp;
      if (samplingStartedAt === null) samplingStartedAt = timestamp;
      if (previousFrameAt !== null) {
        const frameTime = Math.max(0, timestamp - previousFrameAt);
        frameTimes.push(frameTime);
      }
      previousFrameAt = timestamp;

      const elapsed = timestamp - windowStartedAt;
      if (elapsed >= SAMPLE_WINDOW_MS && frameTimes.length > 0) {
        const totalFrameTime = frameTimes.reduce((sum, frameTime) => sum + frameTime, 0);
        const averageFrameTime = totalFrameTime / frameTimes.length;
        const fps = frameTimes.length * 1000 / Math.max(1, elapsed);
        const longFrames = frameTimes.filter((frameTime) => (
          frameTime > LONG_FRAME_THRESHOLD_MS
        )).length;

        element.dataset.orgFps = fps.toFixed(1);
        element.dataset.orgFrameTimeAvgMs = averageFrameTime.toFixed(1);
        element.dataset.orgFrameTimeP95Ms = percentile95(frameTimes).toFixed(1);
        element.dataset.orgLongFrames = String(longFrames);
        windowStartedAt = timestamp;
        frameTimes = [];
      }

      if (timestamp - samplingStartedAt >= MAX_SAMPLING_DURATION_MS) {
        element.dataset.orgTelemetryState = 'complete';
        return;
      }

      scheduleFrame(measureFrame);
    };

    const handleVisibilityChange = () => {
      // rAF pauses in background tabs. Discard the pause so it cannot be
      // misclassified as a long rendering frame when the tab becomes visible.
      resetWindow();
      samplingStartedAt = null;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    scheduleFrame(measureFrame);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (animationFrameId !== null) window.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
      resetWindow();
      removeTelemetryAttributes(element);
    };
  }, [active]);

  return rootRef;
}
