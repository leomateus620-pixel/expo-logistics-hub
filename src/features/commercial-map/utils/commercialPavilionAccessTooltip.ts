export type CommercialPavilionAccessTooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface CommercialPavilionAccessTooltipLayout {
  placement: CommercialPavilionAccessTooltipPlacement;
  /** Cross-axis shift (px) that keeps the bubble inside the visible bounds. */
  shift: number;
}

export interface CommercialPavilionAccessScreenBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const COMMERCIAL_PAVILION_ACCESS_TOOLTIP_GAP_PX = 8;
export const COMMERCIAL_PAVILION_ACCESS_TOOLTIP_MARGIN_PX = 6;

const PLACEMENT_PREFERENCE: readonly CommercialPavilionAccessTooltipPlacement[] = [
  'top',
  'bottom',
  'right',
  'left',
];

function clampCrossAxisShift(
  anchorCenter: number,
  tooltipSize: number,
  boundsStart: number,
  boundsEnd: number,
): number {
  const half = tooltipSize / 2;
  const minCenter = boundsStart + COMMERCIAL_PAVILION_ACCESS_TOOLTIP_MARGIN_PX + half;
  const maxCenter = boundsEnd - COMMERCIAL_PAVILION_ACCESS_TOOLTIP_MARGIN_PX - half;
  if (minCenter > maxCenter) return 0;
  return Math.min(Math.max(anchorCenter, minCenter), maxCenter) - anchorCenter;
}

/**
 * Picks the first preferred side with room for the bubble and shifts it along
 * the cross axis when the marker sits close to a corner of the visible area.
 * Pure and cheap: the marker layer calls it once per opened tooltip, never per
 * frame.
 */
export function resolveCommercialPavilionAccessTooltipLayout(
  anchor: CommercialPavilionAccessScreenBounds,
  tooltip: { width: number; height: number },
  bounds: CommercialPavilionAccessScreenBounds,
): CommercialPavilionAccessTooltipLayout {
  const anchorCenterX = (anchor.left + anchor.right) / 2;
  const anchorCenterY = (anchor.top + anchor.bottom) / 2;
  const requiredVertical = tooltip.height
    + COMMERCIAL_PAVILION_ACCESS_TOOLTIP_GAP_PX
    + COMMERCIAL_PAVILION_ACCESS_TOOLTIP_MARGIN_PX;
  const requiredHorizontal = tooltip.width
    + COMMERCIAL_PAVILION_ACCESS_TOOLTIP_GAP_PX
    + COMMERCIAL_PAVILION_ACCESS_TOOLTIP_MARGIN_PX;
  const available: Record<CommercialPavilionAccessTooltipPlacement, number> = {
    top: anchor.top - bounds.top,
    bottom: bounds.bottom - anchor.bottom,
    left: anchor.left - bounds.left,
    right: bounds.right - anchor.right,
  };
  const fits = (placement: CommercialPavilionAccessTooltipPlacement) => (
    placement === 'top' || placement === 'bottom'
      ? available[placement] >= requiredVertical
      : available[placement] >= requiredHorizontal
  );
  const placement = PLACEMENT_PREFERENCE.find(fits)
    ?? PLACEMENT_PREFERENCE.reduce((best, candidate) => (
      available[candidate] > available[best] ? candidate : best
    ));
  const shift = placement === 'top' || placement === 'bottom'
    ? clampCrossAxisShift(anchorCenterX, tooltip.width, bounds.left, bounds.right)
    : clampCrossAxisShift(anchorCenterY, tooltip.height, bounds.top, bounds.bottom);
  return { placement, shift };
}
