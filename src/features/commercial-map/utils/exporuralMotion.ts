export const C4_CREW_COUNT = 3;
export const C4_SMOKE_COUNT = 8;

export function advanceC4Activity(
  current: number,
  selected: boolean,
  delta: number,
) {
  const target = selected ? 1 : 0;
  const next =
    current +
    (target - current) *
      (1 - Math.exp(-Math.max(0, Math.min(delta, 0.1)) * 10));
  return Math.abs(next - target) < 0.002 ? target : next;
}

/** Analytic integral avoids wind speed/phase changing with the frame rate. */
export function c4RotorStep(time: number, delta: number) {
  const dt = Math.max(0, Math.min(delta, 0.1)),
    end = time + dt;
  return {
    time: end,
    angle:
      0.34 * dt +
      (0.025 / 0.17) * (Math.cos(time * 0.17) - Math.cos(end * 0.17)),
  };
}
