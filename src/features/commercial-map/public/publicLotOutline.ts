import type { MapEntity } from '../types';

/** Outline only the published rings, excluding triangulation and underside edges. */
export function publicLotOutlinePositions(entity: MapEntity): number[] {
  const result: number[] = [];
  const y = Math.max(0.025, entity.geometry.extrusionHeight) + 0.03;
  entity.geometry.coordinates.forEach(ring => {
    ring.forEach((point, i) => {
      const next = ring[(i + 1) % ring.length];
      if (point[0] === next[0] && point[1] === next[1]) return;
      result.push(point[0], y, point[1], next[0], y, next[1]);
    });
  });
  return result;
}
