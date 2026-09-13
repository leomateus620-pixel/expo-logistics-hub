import type { MapEntity } from '../types';
import { entitySurfaceElevation, pointInPolygon, distanceToSegment } from './spatialSurface';
import { FENASOJA_COMPLEX, complexLocalToWorld } from '../data/fenasojaComplexReconstruction';

export type RainGroundAnchor = readonly [number, number, number, number];
const random = (seed: number) => { const n = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return n - Math.floor(n); };
const boundaryDistance = (point: readonly [number, number], ring: readonly (readonly [number, number])[]) =>
  Math.min(...ring.map((start, index) => distanceToSegment(point, start, ring[(index + 1) % ring.length])));

/** Puddles/splashes are contained inside authored circulation polygons, including
 * hole exclusion and a margin. No changes to ground geometry or lot coordinates. */
export function buildRainGroundAnchors(entities: readonly MapEntity[], capacity = 160): RainGroundAnchor[] {
  const anchors: RainGroundAnchor[] = [];
  for (const entity of entities) {
    if (!['ROAD', 'PEDESTRIAN_PATH', 'PARKING'].includes(entity.classification)) continue;
    const outer = entity.geometry.coordinates[0];
    if (!outer?.length) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of outer) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    let placed = 0;
    for (let attempt = 0; attempt < 16 && placed < 4 && anchors.length < capacity; attempt++) {
      const seed = anchors.length * 41 + attempt + minX * .13 + minZ * .37;
      const point = [minX + random(seed) * (maxX - minX), minZ + random(seed + 5) * (maxZ - minZ)] as const;
      if (!pointInPolygon(point, outer) || boundaryDistance(point, outer) < .2
        || entity.geometry.coordinates.slice(1).some((hole) => pointInPolygon(point, hole) || boundaryDistance(point, hole) < .2)) continue;
      anchors.push([point[0], entitySurfaceElevation(entity, { clearance: .007 }), point[1], random(seed + 13)]);
      placed++;
    }
    if (anchors.length === capacity) break;
  }
  return anchors;
}

/** Exact eaves of the existing registered B12/B13 reconstruction. Positions are
 * presentation anchors; runoff is never inferred from another building's name. */
export function buildRainRunoffAnchors(entities: readonly MapEntity[], capacity = 160): RainGroundAnchor[] {
  const anchors: RainGroundAnchor[] = [];
  const spec = FENASOJA_COMPLEX;
  const u = spec.registration.unitsPerMeter;
  for (const kind of ['headquarters', 'stage'] as const) {
    const structure = spec[kind];
    const entity = entities.find((candidate) => candidate.publicIdentifier === structure.identifier);
    if (!entity) continue;
    const main = spec.headquarters.volumes.main;
    const halfWidth = kind === 'headquarters' ? main.width / 2 + main.overhang : spec.stage.roofWidth / 2;
    const depth = kind === 'headquarters' ? main.depth + .72 : spec.stage.roofDepth;
    const centerZ = kind === 'headquarters' ? main.center[1] : 0;
    const height = (kind === 'headquarters' ? main.eave : spec.stage.eave) * u + entity.geometry.elevation;
    for (let i = 0; i < capacity / 2; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const p = complexLocalToWorld([side * halfWidth, centerZ + (random(i * 17 + 3) - .5) * depth], kind);
      anchors.push([p[0], height, p[1], random(i * 19 + 2)]);
    }
  }
  return anchors.slice(0, capacity);
}
