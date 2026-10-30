import type { CommercialPavilionLayout } from './commercialPavilions';
import { COMMERCIAL_MAP_GROUND_ELEVATION } from '../constants';

export type PavilionGroundPoint = readonly [number, number];
export interface PavilionGroundRect {
  id: string;
  minX: number; maxX: number; minZ: number; maxZ: number;
  bottomY: number; topY: number;
}
export interface PavilionGroundRamp extends PavilionGroundRect {
  startY: number;
  endY: number;
  axis: 'x';
}
export interface PavilionGroundInterface {
  floorY: number;
  pavementY: number;
  landings: PavilionGroundRect[];
  steps: PavilionGroundRect[];
  ramps: PavilionGroundRamp[];
  /** Rail is defined by its foot line; posts and two rails use one batch. */
  rails: { id: string; from: readonly [number, number, number]; to: readonly [number, number, number] }[];
}

/** Narrow pavilion-local frontage only. No complete exterior floor overlays.
 * This keeps the internal floor and all planimetric module coordinates fixed.
 * The height is an interpretation of the photographed access, not a survey.
 */
export function createPavilionGroundInterfaces(layout: CommercialPavilionLayout): PavilionGroundInterface {
  const floorY = layout.interior.floorY;
  const result: PavilionGroundInterface = { floorY, pavementY: 0.068, landings: [], steps: [], ramps: [], rails: [] };
  if (layout.publicIdentifier === 'B1') {
    // The courtyard owns concrete outside the protected cadastral footprint.
    // This flush, pavilion-owned strip fills only the facade's presentation
    // inset up to that exact boundary; the two regions meet without overlap.
    result.landings.push({ id: 'p1:front-apron-threshold',
      minX: -layout.width / 2, maxX: layout.width / 2,
      minZ: layout.exterior.shell.frontZ, maxZ: layout.depth / 2,
      bottomY: COMMERCIAL_MAP_GROUND_ELEVATION, topY: result.pavementY });
    return result;
  }
  if (layout.publicIdentifier !== 'B6') return result;
  const width = layout.exterior.shell.width, front = layout.exterior.shell.frontZ;
  // The facade is inset from the cadastral edge. Confine all access solids to
  // that existing strip: Argentina, the courtyard pavement and tree pits keep
  // their current owner and their exact visible boundaries.
  const strip = (layout.depth - layout.exterior.shell.depth) / 2;
  const outerZ = layout.depth / 2;
  const innerZ = front - 0.012;
  const depth = outerZ - innerZ;
  const lowY = Math.min(floorY - 0.006, result.pavementY);
  const startX = -width * 0.22, endX = width * 0.18;
  const handoffZ = front + depth * 0.42;
  const landingStart = endX, landingEnd = width * 0.37;
  const rect = (id: string, minX: number, maxX: number, minZ: number, maxZ: number, topY: number): PavilionGroundRect => ({
    id, minX, maxX, minZ, maxZ, topY, bottomY: COMMERCIAL_MAP_GROUND_ELEVATION,
  });
  result.landings.push(
    rect('p3:gate-landing', -width * 0.055, width * 0.355, innerZ, handoffZ, floorY),
    rect('p3:ramp-landing', landingStart, landingEnd, handoffZ, outerZ, floorY),
    { ...rect('p3:window-platform', -width * 0.47, -width * 0.30, innerZ, outerZ - strip * 0.12, floorY), bottomY: floorY - 0.018 },
  );
  result.ramps.push({ ...rect('p3:frontage-ramp', startX, endX, handoffZ, outerZ, floorY), axis: 'x', startY: lowY, endY: floorY });
  // Steps terminate beside the ramp; they never overlap its footprint.
  const stepWidth = width * 0.055, stepStart = -width * 0.30;
  result.steps.push(
    rect('p3:window-step-low', stepStart, stepStart + stepWidth, front + depth * 0.55, outerZ, lowY + (floorY - lowY) / 2),
    rect('p3:window-step-high', stepStart, stepStart + stepWidth, innerZ, front + depth * 0.55, floorY),
  );
  // The inner edge borders the continuous landing. A rail there would cut
  // the first gate's threshold; only the free outer edge needs a handrail.
  for (const [id, z] of [['outer', outerZ - depth * 0.07]] as const) {
    result.rails.push({ id: `p3:ramp-${id}`, from: [startX, lowY, z], to: [endX, floorY, z] });
  }
  // Return at the free end. No rail crosses the ramp-to-landing handoff
  // or the longitudinal path from the landing to either gate.
  result.rails.push({ id: 'p3:landing-front', from: [landingStart, floorY, outerZ - depth * 0.07], to: [landingEnd, floorY, outerZ - depth * 0.07] });
  return result;
}

export function pavilionGroundRectPolygon(rect: Pick<PavilionGroundRect, 'minX' | 'maxX' | 'minZ' | 'maxZ'>): PavilionGroundPoint[] {
  return [[rect.minX, rect.minZ], [rect.maxX, rect.minZ], [rect.maxX, rect.maxZ], [rect.minX, rect.maxZ]];
}

export function pavilionGroundRampHeight(ramp: PavilionGroundRamp, x: number): number {
  const t = Math.max(0, Math.min(1, (x - ramp.minX) / (ramp.maxX - ramp.minX)));
  return ramp.startY + (ramp.endY - ramp.startY) * t;
}
