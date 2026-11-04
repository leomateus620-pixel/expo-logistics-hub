/** One deterministic score shared by the cloth and the attendants. Seconds, metres. */
export const REVEAL_DURATION = 11.8;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
export function revealPose(seconds: number) {
  const time = Math.max(0, Math.min(REVEAL_DURATION, seconds));
  const approach = smooth(time / 1.1);
  const grasp = smooth((time - 1) / 1.4);
  const pull = smooth((time - 2.4) / 7.8);
  const release = smooth((time - 10.2) / 1.3);
  const gap = pull * 7.5;
  return {
    time, approach, grasp: grasp * (1 - release), pull, release, gap,
    actorX: 1.05 - .63 * approach + gap,
    turn: smooth((time - 2) / 1) * (1 - smooth((time - 10.1) / 1.6)),
    walking: time > 2.4 && time < 10.2,
    phase: time < 1.1 ? 'approach' : time < 2.4 ? 'grasp' : time < 10.2 ? 'pull' : time < REVEAL_DURATION ? 'release' : 'complete',
  } as const;
}
