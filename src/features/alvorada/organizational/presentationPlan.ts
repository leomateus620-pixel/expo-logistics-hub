export const PRESENTATION_DURATION_MS = 3400;
export const PRESENTATION_TIER_STARTS = [0, 450, 1050, 1650, 2250] as const;
/** One clock for portraits, accessibility and the incoming relationship. */
export function presentationStage(level: number, order = 0) {
  const start = level < 5 ? PRESENTATION_TIER_STARTS[Math.max(0, level - 1)]
    : PRESENTATION_TIER_STARTS[4] + Math.min(650, Math.floor(order / 6) * 100 + order % 6 * 24);
  return { start, duration: level === 1 ? 450 : 500, connectorStart: Math.max(0, start - 230), connectorDuration: 500 };
}
