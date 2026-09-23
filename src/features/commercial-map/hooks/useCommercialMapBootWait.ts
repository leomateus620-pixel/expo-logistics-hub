import { useEffect, useRef, useState } from 'react';
import { captureCommercialMapStageRecorder } from '../utils/performanceDiagnostics';
import { readLatestCommercialMapRenderHealth } from '../utils/renderingHealth';

const STALLED_AFTER_MS = 30_000;

function waitDetails(stage: string, elapsedMs: number) {
  const canvas = document.querySelector<HTMLCanvasElement>(
    '.commercial-map-canvas canvas, canvas.commercial-map-canvas, .public-map-canvas canvas',
  );
  let readiness: unknown = null;
  try { readiness = JSON.parse(canvas?.dataset.commercialMapReadiness ?? 'null'); } catch { /* No snapshot yet. */ }
  return { stage, visibleActiveMs: Math.round(elapsedMs), readiness,
    health: readLatestCommercialMapRenderHealth(canvas) };
}

/** Only foreground time in this stage counts. A timer never grants readiness. */
export function useCommercialMapBootWait(key: string, stage: string, waiting: boolean, active: boolean) {
  const clock = useRef({ key, elapsed: 0 });
  const [notice, setNotice] = useState<{ key: string; detail: ReturnType<typeof waitDetails> } | null>(null);
  useEffect(() => {
    if (clock.current.key !== key) clock.current = { key, elapsed: 0 };
    if (!waiting) return;
    const record = captureCommercialMapStageRecorder();
    let last = performance.now();
    let counting = active && !document.hidden;
    let reported = false;
    const account = () => {
      const now = performance.now();
      if (counting) clock.current.elapsed += Math.max(0, now - last);
      last = now;
    };
    const tick = () => {
      account();
      if (!reported && counting && clock.current.elapsed >= STALLED_AFTER_MS) {
        reported = true;
        const detail = waitDetails(stage, clock.current.elapsed);
        setNotice({ key, detail });
        record('boot-stalled', detail);
      }
    };
    const visibility = () => { tick(); counting = active && !document.hidden; };
    const timer = window.setInterval(tick, 250);
    document.addEventListener('visibilitychange', visibility);
    tick();
    return () => {
      account();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [key, stage, waiting, active]);
  return waiting && notice?.key === key ? notice.detail : null;
}
