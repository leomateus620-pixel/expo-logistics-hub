import type { Coordinate, MapEntity } from '../types';

/** Metadata comes from the server in normal routes; no local reference overlay. */
export function hasRevisedExporuralNumbers(entity: MapEntity) {
  return entity.classification === 'SELLABLE_LOT' && entity.metadata.areaCode === 'EXPORURAL'
    && String(entity.metadata.geometryRevision ?? '').startsWith('2028-exporural-');
}

export function lotNumberAnchor(entity: MapEntity): Coordinate {
  const anchor = entity.metadata.labelAnchor;
  if (hasRevisedExporuralNumbers(entity) && Array.isArray(anchor) && anchor.length === 2
    && anchor.every(value => typeof value === 'number' && Number.isFinite(value))) return anchor as Coordinate;
  const ring = entity.geometry.coordinates[0] ?? [];
  const xs = ring.map(p => p[0]), zs = ring.map(p => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
}
