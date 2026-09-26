import type { Coordinate, MapEntity } from '../types';

/** Metadata comes from the server in normal routes; no local reference overlay. */
export function hasRevisedExporuralNumbers(entity: MapEntity) {
  return entity.classification === 'SELLABLE_LOT' && entity.metadata.areaCode === 'EXPORURAL'
    && String(entity.metadata.geometryRevision ?? '').startsWith('2028-exporural-');
}

export function lotNumberAnchor(entity: MapEntity): Coordinate {
  const ring = entity.geometry.coordinates[0] ?? [];
  const inside = ([x, z]: Coordinate) => {
    let contained = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, zi] = ring[i], [xj, zj] = ring[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) contained = !contained;
    }
    return contained;
  };
  const anchor = entity.metadata.labelAnchor;
  if (hasRevisedExporuralNumbers(entity) && Array.isArray(anchor) && anchor.length === 2
    && anchor.every(value => typeof value === 'number' && Number.isFinite(value)) && inside(anchor as Coordinate)) return anchor as Coordinate;
  if (!ring.length) return [0, 0];
  const xs = ring.map(p => p[0]), zs = ring.map(p => p[1]);
  const center: Coordinate = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  if (inside(center)) return center;
  const vertices = ring.slice(0, -1);
  for (let i = 1; i < vertices.length - 1; i++) {
    const a = vertices[0], b = vertices[i], c = vertices[i + 1];
    const candidate: Coordinate = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
    if (inside(candidate)) return candidate;
  }
  return center;
}
