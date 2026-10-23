import { useCallback, useEffect, useState } from 'react';
import { PRESENTATION_DURATION_MS, PRESENTATION_TIER_STARTS } from '../presentationPlan';

export function useOrgPresentation(active: boolean) {
  const [elapsed, setElapsed] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? PRESENTATION_DURATION_MS : 0);
  const complete = useCallback(() => setElapsed(PRESENTATION_DURATION_MS), []);
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { complete(); return; }
    const started = performance.now();
    const steps = [...PRESENTATION_TIER_STARTS.slice(1), PRESENTATION_DURATION_MS];
    let timer: number;
    const tick = () => {
      const now = performance.now() - started;
      const next = steps.find(step => step > now + 1);
      setElapsed(previous => Math.max(previous, Math.min(PRESENTATION_DURATION_MS, now)));
      if (next !== undefined) timer = window.setTimeout(tick, next - now + 1);
    };
    timer = window.setTimeout(tick, steps[0]);
    const hidden = () => { if (document.hidden) complete(); };
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motion = () => { if (media.matches) complete(); };
    document.addEventListener('visibilitychange', hidden);
    media.addEventListener?.('change', motion);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', hidden);
      media.removeEventListener?.('change', motion);
    };
  }, [active, complete]);
  return { presenting: active && elapsed < PRESENTATION_DURATION_MS, elapsed, complete };
}
