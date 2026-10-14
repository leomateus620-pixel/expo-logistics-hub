/** The header stays compact; artwork size follows its real measured container. */
export function getGalleryLayout(containerWidth: number, actualHostHeight?: number, compact = containerWidth < 600) {
  const mobile = compact;
  const headerHeight = mobile ? 88 : 112;
  const hostHeight = typeof actualHostHeight === 'number' && Number.isFinite(actualHostHeight)
    ? Math.max(0, actualHostHeight) : headerHeight;
  const artHeight = Math.min(mobile ? 32 : 72, Math.max(0, hostHeight - 16));
  const slotWidth = artHeight * 4 / 3;
  const gap = mobile ? 12 : 20;
  return {
    mobile, headerHeight, artHeight, slotWidth, gap,
    stepPx: slotWidth + gap,
    speedPxPerSecond: mobile ? 12 : 16,
  };
}
