import type { MapEntity } from '../types';
import { resolveStrategicLandmarkKind } from './landmarks';

export const HEADQUARTERS_SOFA_LAYOUT = {
  center: [1.27, 0, -1.7] as const,
  width: 2.25,
  seatTopY: 0.49,
  usableInset: 0.18,
} as const;

export const HEADQUARTERS_EXECUTIVE_CAMERA = {
  desktopPosition: [1.25, 1.46, 2.75] as const,
  compactPosition: [1.25, 1.56, 3.18] as const,
  target: [1.27, 0.78, -1.53] as const,
} as const;

export const HEADQUARTERS_EXECUTIVE_COMPACT_WIDTH = 820;

export function shouldUseCompactExecutiveCamera(width: number, height: number) {
  const safeHeight = Math.max(1, height);
  return width <= HEADQUARTERS_EXECUTIVE_COMPACT_WIDTH || width / safeHeight < 0.92;
}

export function interiorSupportsSeatedExecutives(
  entity: Pick<MapEntity, 'publicIdentifier'>,
) {
  return resolveStrategicLandmarkKind(entity) === 'fenasoja-headquarters';
}
