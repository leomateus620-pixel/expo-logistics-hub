import * as THREE from 'three';
import type { MultiPolygon, Ring } from 'polygon-clipping';
import type { TerritoryPoint, TerritoryRoad } from '../data/territorialRoads';

/** Shared by pavement and its presentation adapters; preserve the original sampling. */
export function sampleTerritoryRoad(road: TerritoryRoad): TerritoryPoint[] {
  if (road.evidence === 'osm-aligned') {
    if (road.kind !== 'highway') return [...road.points];
    const points: TerritoryPoint[] = [road.points[0]];
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1], b = road.points[i];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2));
      for (let j = 1; j <= n; j++) points.push([
        a[0] + ((b[0] - a[0]) * j) / n,
        a[1] + ((b[1] - a[1]) * j) / n,
      ]);
    }
    return points;
  }
  if (road.kind === 'local') return [...road.points];
  const curve = new THREE.CatmullRomCurve3(
    road.points.map(p => new THREE.Vector3(p[0], 0, p[1])), false, 'centripetal',
  );
  curve.arcLengthDivisions = Math.ceil(curve.getLength() * 12);
  return curve.getSpacedPoints(Math.ceil(curve.getLength() * 2)).map(p => [p.x, p.z]);
}

export function corridorPolygon(points: readonly TerritoryPoint[], width: number): MultiPolygon {
  const left: Ring = [], right: Ring = [];
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (-(b[1] - a[1]) / d) * width / 2, nz = ((b[0] - a[0]) / d) * width / 2;
    left.push([p[0] + nx, p[1] + nz]);
    right.push([p[0] - nx, p[1] - nz]);
  });
  const ring = [...left, ...right.reverse()];
  ring.push([...ring[0]]);
  return [[ring]];
}
