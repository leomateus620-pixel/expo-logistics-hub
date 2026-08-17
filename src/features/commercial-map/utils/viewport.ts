export type CommercialMapDetailSheetState = 'collapsed' | 'half' | 'expanded';

interface PixelRatioInput {
  devicePixelRatio: number;
  viewportWidth: number;
  viewportHeight: number;
  reducedGraphics: boolean;
}

const STANDARD_PIXEL_BUDGET = 4_800_000;
const REDUCED_PIXEL_BUDGET = 900_000;

export function resolveCommercialMapPixelRatio({
  devicePixelRatio,
  viewportWidth,
  viewportHeight,
  reducedGraphics,
}: PixelRatioInput) {
  const safeDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const safeWidth = Math.max(1, Number.isFinite(viewportWidth) ? viewportWidth : 1);
  const safeHeight = Math.max(1, Number.isFinite(viewportHeight) ? viewportHeight : 1);
  const isPhoneViewport = Math.min(safeWidth, safeHeight) <= 600;
  const pixelBudget = reducedGraphics ? REDUCED_PIXEL_BUDGET : STANDARD_PIXEL_BUDGET;
  const budgetCap = Math.sqrt(pixelBudget / (safeWidth * safeHeight));
  const qualityCap = reducedGraphics ? 1.35 : isPhoneViewport ? 2.25 : 1.75;
  const qualityFloor = reducedGraphics ? 1 : 1.5;
  const budgeted = Math.min(safeDpr, qualityCap, budgetCap);

  return Number(Math.max(Math.min(safeDpr, qualityFloor), budgeted).toFixed(2));
}

export function resolveCommercialMapSheetSnap(
  sheetHeight: number,
  viewportHeight: number,
  collapsedHeight = 104,
): CommercialMapDetailSheetState {
  if (!Number.isFinite(sheetHeight) || !Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return 'half';
  }

  const resolvedCollapsedHeight = Math.min(
    Math.max(0, Number.isFinite(collapsedHeight) ? collapsedHeight : 104),
    viewportHeight * 0.4,
  );
  const halfHeight = viewportHeight * 0.5;
  const expandedHeight = Math.max(halfHeight, viewportHeight - Math.max(136, viewportHeight * 0.28));
  const collapsedThreshold = (resolvedCollapsedHeight + halfHeight) / 2;
  const expandedThreshold = (halfHeight + expandedHeight) / 2;

  if (sheetHeight <= collapsedThreshold) return 'collapsed';
  if (sheetHeight >= expandedThreshold) return 'expanded';
  return 'half';
}
