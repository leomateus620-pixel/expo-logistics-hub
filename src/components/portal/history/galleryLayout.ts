/** Capacity is based on the measured card and full brand (including 2028). */
export function getGalleryLayout(innerWidth: number, brandWidth: number) {
  const slotWidth = innerWidth < 480 ? 96 : 108;
  const gap = 16;
  const centralClearance = 24;
  const perSide = Math.max(0, Math.min(2, Math.floor(
    (innerWidth - brandWidth - 2 * centralClearance + 2 * gap) / (2 * (slotWidth + gap)),
  )));
  return { perSide, slotWidth, gap, centralClearance, stacked: perSide === 0 };
}
