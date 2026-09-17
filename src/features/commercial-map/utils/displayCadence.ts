/** Bounded RAF calibration, run while the map is idle and fully prepared.
 * This estimates browser cadence, never GPU headroom or physical scanout. */
export function estimateCommercialMapDisplayCadence(intervals: readonly number[]) {
  const valid = intervals.filter((value) => Number.isFinite(value) && value >= 5 && value <= 40).sort((a, b) => a - b);
  if (valid.length < 20) return null;
  const observed = valid[Math.floor(valid.length * 0.2)];
  return [1000 / 120, 1000 / 90, 1000 / 60, 1000 / 30].reduce((best, cadence) =>
    Math.abs(cadence - observed) < Math.abs(best - observed) ? cadence : best, 1000 / 60);
}

export function sampleCommercialMapDisplayCadence(onComplete: (cadence: number | null) => void) {
  let raf = 0;
  let previous: number | null = null;
  const intervals: number[] = [];
  const step = (at: number) => {
    if (document.hidden) { onComplete(null); return; }
    if (previous !== null) intervals.push(at - previous);
    previous = at;
    if (intervals.length >= 48) onComplete(estimateCommercialMapDisplayCadence(intervals));
    else raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
