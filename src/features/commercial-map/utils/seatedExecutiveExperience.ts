import type { MapEntity } from '../types';
import { resolveStrategicLandmarkKind } from './landmarks';

export const HEADQUARTERS_SOFA_LAYOUT = {
  center: [1.27, 0, -1.7] as const,
  width: 2.25,
  seatTopY: 0.49,
  usableInset: 0.18,
} as const;

export const HEADQUARTERS_EXECUTIVE_CAMERA = {
  desktopPosition: [1.25, 1.42, 1.86] as const,
  compactPosition: [1.25, 1.48, 2.84] as const,
  target: [1.27, 0.98, -1.53] as const,
} as const;

export function interiorSupportsSeatedExecutives(
  entity: Pick<MapEntity, 'publicIdentifier'>,
) {
  return resolveStrategicLandmarkKind(entity) === 'fenasoja-headquarters';
}
