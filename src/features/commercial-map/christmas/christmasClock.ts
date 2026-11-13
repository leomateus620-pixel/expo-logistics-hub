export const CHRISTMAS_FLIGHT_MS = 8000;

export function createChristmasClock() {
  let visibleSince: number | null = null;
  let elapsed = 0;
  let started = false;

  return {
    frame(now: number) {
      started = true;
      visibleSince ??= now;
      return Math.min(CHRISTMAS_FLIGHT_MS, elapsed + Math.max(0, now - visibleSince));
    },
    setVisible(visible: boolean, now: number) {
      if (!started) return;
      if (visible) {
        visibleSince ??= now;
      } else if (visibleSince !== null) {
        elapsed += Math.max(0, now - visibleSince);
        visibleSince = null;
      }
    },
  };
}
