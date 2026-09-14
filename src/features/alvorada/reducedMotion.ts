/** Accessible stills sampled from the SAME authored scene, never a CSS planet. */
const CUTS = [1.6, 3.3, 5.8] as const;
export function sampleReducedAlvorada(elapsed: number) {
  // Orbit, South America, Santa Rosa, and the final dawn. No camera travel or
  // animated cloud drift. The short fades conceal changes between stills.
  const visualElapsed = elapsed < CUTS[0] ? 0 : elapsed < CUTS[1] ? 2.4 : elapsed < CUTS[2] ? 4.2 : 7.4;
  const nearest = Math.min(...CUTS.map(cut => Math.abs(cut - elapsed)));
  return { visualElapsed, opacity: Math.min(1, nearest / 0.15) };
}
