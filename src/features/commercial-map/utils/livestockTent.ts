import { officialPdfPointToLocal } from '../data/officialReference2026';
import { RURAL_PAVILIONS, RURAL_PAVILION_REVISION } from '../data/ruralPavilionReconstruction';

export const LIVESTOCK_TENT_PUBLIC_IDENTIFIER = 'D4';
export const LIVESTOCK_TENT_OFFICIAL_NAME = 'Tenda da Pecuária';
export const LIVESTOCK_TENT_FRONT_LOT_IDENTIFIER = 'Q-Q-01';
export const LIVESTOCK_TENT_REVISION = RURAL_PAVILION_REVISION;

const spec = RURAL_PAVILIONS.livestock;
const sourceCenter = spec.sourceCenter;
const worldCenter = officialPdfPointToLocal(sourceCenter);
// Preserve the existing street-facing registration to the eastmost Q row lot.
const row = [2243, 2472, 2750, 2578] as const;
const targetSourceCenter = [row[0] + 5.5 * (row[2] - row[0]) / 6, (row[1] + row[3]) / 2] as const;
const targetWorldCenter = officialPdfPointToLocal(targetSourceCenter);
const vector = [targetWorldCenter[0] - worldCenter[0], targetWorldCenter[1] - worldCenter[1]] as const;
const length = Math.hypot(...vector);
const frontVector = [vector[0] / length, vector[1] / length] as const;

/** One placement/identity contract; all physical members come from ruralArchitecture. */
export const LIVESTOCK_TENT_LAYOUT = Object.freeze({
  revision: LIVESTOCK_TENT_REVISION,
  publicIdentifier: LIVESTOCK_TENT_PUBLIC_IDENTIFIER,
  officialName: LIVESTOCK_TENT_OFFICIAL_NAME,
  runtimeEntityId: 'reference:2026:d4',
  frontLotIdentifier: LIVESTOCK_TENT_FRONT_LOT_IDENTIFIER,
  enclosure: 'semi-open-pavilion' as const,
  localFrontAxis: '+Z' as const,
  maximumVisualHeight: spec.roofHeight,
  sourceCenter,
  sourceFootprint: [spec.sourceWidth, spec.sourceDepth] as const,
  targetSourceCenter, worldCenter, targetWorldCenter, frontVector,
  facingRadians: Math.atan2(frontVector[0], frontVector[1]),
  focusDirection: [-0.9, 0.4, 0.28] as const,
  palette: Object.freeze({
    wall: '#c6c7ba', accent: '#94745a', roof: '#4a4a45', trim: '#a4aba0',
    dark: '#41494a', glass: '#71877a', green: '#3c694c', white: '#d6d7c8',
    platform: '#97968b', metal: '#635648',
  }),
});

/** Primary-geometry limits, not a claim about scene/GPU frame performance. */
export const LIVESTOCK_TENT_RENDER_BUDGET = {
  overview: { maximumPrimaryDrawCalls: 3, maximumRenderedTriangles: 2500 },
  detailed: { maximumPrimaryDrawCalls: 4, maximumRenderedTriangles: 3500 },
  focused: { maximumPrimaryDrawCalls: 4, maximumRenderedTriangles: 4000 },
  maximumShadowDrawCalls: 2,
  identityTextureWidth: 512,
  identityTextureHeight: 128,
  detailDistanceMultiplier: 5.6,
} as const;

export interface LivestockTentBounds { width: number; depth: number }

export function livestockTentVisualHeight(bounds: LivestockTentBounds): number {
  const span = Math.min(
    Number.isFinite(bounds.width) ? bounds.width : 2.18,
    Number.isFinite(bounds.depth) ? bounds.depth : 2.18,
  );
  return Math.min(LIVESTOCK_TENT_LAYOUT.maximumVisualHeight, Math.max(1.08, span * 0.54));
}

export function livestockTentFrontVector() { return LIVESTOCK_TENT_LAYOUT.frontVector; }

export function livestockTentCardinalFacingRadians(yaw = LIVESTOCK_TENT_LAYOUT.facingRadians): number {
  return Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
}

/** Keep the existing world envelope when the front is turned toward Q-Q-01. */
export function livestockTentModelBounds<Bounds extends LivestockTentBounds>(
  bounds: Bounds, yaw = LIVESTOCK_TENT_LAYOUT.facingRadians,
): Bounds {
  const quarterTurns = Math.round(livestockTentCardinalFacingRadians(yaw) / (Math.PI / 2));
  const snapped = quarterTurns * (Math.PI / 2);
  const exchanged = Math.abs(yaw - snapped) < 1e-8 && Math.abs(quarterTurns) % 2 === 1;
  return exchanged ? { ...bounds, width: bounds.depth, depth: bounds.width } : bounds;
}
