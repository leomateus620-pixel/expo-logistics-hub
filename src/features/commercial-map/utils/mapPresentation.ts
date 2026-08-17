import type { MapClassification } from '../types';
import type { MapLabelVisibility } from './mapMetadata';

export type MapLabelMode =
  | { kind: 'navigation' }
  | { kind: 'focus'; selectedEntityId: string };

export type GateAccessMode = 'entry' | 'exit' | 'bidirectional' | 'access';
export type MapLabelCollisionKind = 'lot' | 'road' | 'structure';

export interface MapLabelCollisionBox {
  width: number;
  height: number;
  anchorGap: number;
}

export const RESTROOM_PRESENTATION_LIFT = 1.08;

const SOLID_RENDER_CLASSIFICATIONS = new Set<MapClassification>([
  'PAVILION',
  'BUILDING',
  'ADMINISTRATION',
  'GATE',
  'RESTROOM',
  'CHEMICAL_RESTROOM',
]);

function normalize(value: string) {
  return value
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function resolveMapLabelMode(selectedEntityId: string | null): MapLabelMode {
  return selectedEntityId
    ? { kind: 'focus', selectedEntityId }
    : { kind: 'navigation' };
}

export function labelBelongsToActiveMode(mode: MapLabelMode, entityId: string) {
  return mode.kind === 'navigation' || mode.selectedEntityId === entityId;
}

export function resolveMapLabelCollisionBox(
  kind: MapLabelCollisionKind,
  nameLength: number,
  expanded = false,
): MapLabelCollisionBox {
  const safeNameLength = Math.max(0, Number.isFinite(nameLength) ? nameLength : 0);
  if (kind === 'lot') {
    return expanded
      ? { width: 112, height: 60, anchorGap: 5 }
      : { width: 34, height: 26, anchorGap: 5 };
  }
  if (kind === 'road') {
    return {
      width: Math.min(148, Math.max(72, safeNameLength * 6.4)),
      height: 24,
      anchorGap: 3,
    };
  }
  return {
    width: Math.min(198, Math.max(84, safeNameLength * 6.7)),
    height: 38,
    anchorGap: 5,
  };
}

export function resolveMapLabelCollisionCenterY(
  anchorY: number,
  box: Pick<MapLabelCollisionBox, 'height' | 'anchorGap'>,
) {
  return anchorY - box.height / 2 - box.anchorGap;
}

/**
 * Keeps semantic label density from oscillating when the camera rests close to
 * a zoom threshold. The wider exit thresholds are intentional hysteresis: a
 * label level only changes after the user has moved decisively into the next
 * range.
 */
export function resolveStableMapLabelVisibility(
  cameraDistance: number,
  sceneDiagonal: number,
  previous: MapLabelVisibility,
): MapLabelVisibility {
  const safeDiagonal = Number.isFinite(sceneDiagonal) && sceneDiagonal > 0 ? sceneDiagonal : 1;
  const ratio = Math.max(0, Number.isFinite(cameraDistance) ? cameraDistance : safeDiagonal) / safeDiagonal;

  if (ratio <= 0.27) return 'near';
  if (previous === 'near' && ratio <= 0.34) return 'near';
  if (previous === 'far' && ratio >= 0.76) return 'far';
  if (previous === 'medium' && ratio >= 0.88) return 'far';
  if (ratio >= 0.88) return 'far';
  return 'medium';
}

export function resolveGateAccessMode(name: string): GateAccessMode {
  const normalized = normalize(name);
  const hasEntry = normalized.includes('entrada');
  const hasExit = normalized.includes('saida');
  if (hasEntry && hasExit) return 'bidirectional';
  if (hasEntry) return 'entry';
  if (hasExit) return 'exit';
  return 'access';
}

export function requiresSolidRendering(classification: MapClassification) {
  return SOLID_RENDER_CLASSIFICATIONS.has(classification);
}

export function resolveMarkerPresentationLift(classification: MapClassification) {
  return classification === 'RESTROOM' || classification === 'CHEMICAL_RESTROOM'
    ? RESTROOM_PRESENTATION_LIFT
    : 0;
}
