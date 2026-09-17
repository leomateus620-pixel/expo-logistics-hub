import { MIRANTE_COMPLEX, miranteSourcePointToLocal } from './miranteComplexReconstruction';
import type { CommercialMapData, Coordinate, MapEntity } from '../types';

export type ArenaSourcePoint = readonly [number, number];
export type ArenaSourceBounds = readonly [number, number, number, number];
export const ARENA_RECONSTRUCTION_REVISION = '2026.9-arena-canonical.1';
export const arenaSourceToLocal = miranteSourcePointToLocal;
export function arenaRect([x0, z0, x1, z1]: ArenaSourceBounds): ArenaSourcePoint[] {
  return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
}

// The PR #151 terrace and ALL stair levels/landings are fixed anchors. Coordinates
// are PDF-source units, NOT metres. Only F's former schematic envelope is revised.
const stairBounds: ArenaSourceBounds = [MIRANTE_COMPLEX.eastTerraceSourceMaxX, 2682, 4480, 2940];
const plazaElevation = 0.052;
const sourceSpan = stairBounds[3] - stairBounds[1];
const centerZ = (stairBounds[1] + stairBounds[3]) / 2;
// Reference 1 (1056 x 1408): ~313 px roof span, ~415 px roof length, ~256 px
// access/stair span. Register those RATIOS to the unchanged stair frontage.
// Image perspective/roof overhang make this a reference fit, not a survey.
const roofWidth = sourceSpan * 313 / 256;
const roofDepth = sourceSpan * 415 / 256;
const frontX = 4888; // existing eastern apron datum; roof now actually meets it
const footprint: ArenaSourceBounds = [frontX, centerZ - roofWidth / 2, frontX + roofDepth, centerZ + roofWidth / 2];
const center: ArenaSourcePoint = [(footprint[0] + footprint[2]) / 2, centerZ];
const local0 = arenaSourceToLocal([footprint[0], footprint[1]]);
const local1 = arenaSourceToLocal([footprint[2], footprint[3]]);
const plazaBounds: ArenaSourceBounds = [stairBounds[2], stairBounds[1], frontX, stairBounds[3]];
const courts = {
  multiSportCourt: { sourceBounds: [4675, 2480, 4765, 2640] as ArenaSourceBounds, longAxis: 'z' as const,
    surfaceInset: 0.24, surfaceColor: '#b86f5c', apronColor: '#64796d', supportsBasketball: true, supportsVolleyball: true },
  sandVolleyballCourt: { sourceBounds: [4525, 2480, 4615, 2640] as ArenaSourceBounds, longAxis: 'z' as const,
    surfaceInset: 0.24, surfaceColor: '#d6bd84', apronColor: '#77836b', supportsBasketball: false, supportsVolleyball: true },
};
const paths = [
  // No coplanar strip through the plaza: that connection is the plaza itself.
  { id: 'arena-walkway-courts-plaza', sourcePath: [[4620, stairBounds[1]], [4620, 2560], [4620, 2480]] as readonly ArenaSourcePoint[], width: 0.26 },
  { id: 'arena-walkway-arena-parking', sourcePath: [[center[0], footprint[3]], [center[0], 3170], [center[0] + 15, 3250]] as readonly ArenaSourcePoint[], width: 0.24 },
] as const;
/** Identical local-space strip vertices feed rendering and terrain masks. */
export function arenaWalkwayRibbon(path: readonly ArenaSourcePoint[], width: number) {
  return path.map(([x,z],index) => {
    const previous=path[index-1] ?? path[index], next=path[index+1] ?? path[index];
    const dx=next[0]-previous[0], dz=next[1]-previous[1], length=Math.hypot(dx,dz)||1;
    return [[x-dz/length*width/2,z+dx/length*width/2],
      [x+dz/length*width/2,z-dx/length*width/2]] as const;
  });
}
const pedestrianMasks = paths.flatMap(path => {
  const ribbon=arenaWalkwayRibbon(path.sourcePath.map(arenaSourceToLocal),path.width);
  return ribbon.slice(1).map((pair,i) => ({id:`${path.id}:${i}`,
    localPolygon:[ribbon[i][0],pair[0],pair[1],ribbon[i][1]]}));
});
const vegetationZones = [
  { id: 'north-open-margin', sourceBounds: [stairBounds[0] + 15, stairBounds[1] - 112, frontX - 15, stairBounds[1] - 26] as ArenaSourceBounds, count: 10, seed: 5201 },
  { id: 'south-grove-margin', sourceBounds: [stairBounds[0] + 25, stairBounds[3] + 28, frontX - 28, 3072] as ArenaSourceBounds, count: 18, seed: 1847 },
  { id: 'rear-open-margin', sourceBounds: [footprint[2] + 30, footprint[1] - 55, footprint[2] + 135, footprint[3] + 65] as ArenaSourceBounds, count: 7, seed: 9111 },
] as const;

export const ARENA_CANONICAL_LAYOUT = Object.freeze({
  revision: ARENA_RECONSTRUCTION_REVISION,
  registration: { anchors: ['F', 'D3', 'RUA-BRASILIA', 'RUA-BRASIL', 'Q-R-04'],
    imagePixels: { roofSpan: 313, roofLength: 415, stairSpan: 256 },
    officialMeasurements: false, confidence: 'reference_registered_estimate' },
  arenaFootprint: { sourceBounds: footprint, sourcePolygon: arenaRect(footprint), localPolygon: arenaRect(footprint).map(arenaSourceToLocal) },
  arenaCenter: { source: center, local: arenaSourceToLocal(center) },
  // Model's +Z is the front. Rotation turns it toward -worldX / the Mirante.
  arenaWidth: local1[1] - local0[1], arenaDepth: local1[0] - local0[0], arenaRotation: -Math.PI / 2,
  architecture: { riseToSpan: 0.31, shellThickness: 0.035, springHeight: 0.035, archSegments: 40,
    structuralBays: 8, trussDepth: 0.16, fasciaWidth: 0.11, fasciaDepth: 0.055,
    sign: 'ARENA SICREDI ICATU', signTexture: [1024, 128] as const },
  frontPlaza: { sourceBounds: plazaBounds, sourcePolygon: arenaRect(plazaBounds), elevation: plazaElevation },
  stairs: { sourceBounds: stairBounds, runAxis: 'x' as const, highEdge: 'west' as const, lowEdge: 'east' as const,
    stepCount: 18, bankCount: 3, riserHeight: (MIRANTE_COMPLEX.levels.deck - plazaElevation) / 18,
    lowerLandingDepth: 0.62, upperLandingDepth: 0.74, upperLandingThickness: 0.07,
    retainingWallWidth: 0.11, handrailHeight: 0.34, bankGap: 0,
    intermediateLandingSteps: [6, 12] as const, intermediateLandingDepth: 0.42 },
  sideTransitions: { northBerm: { sourceBounds: [stairBounds[0], 2600, stairBounds[2], stairBounds[1]] as ArenaSourceBounds, highEdge: 'west' as const },
    southBerm: { sourceBounds: MIRANTE_COMPLEX.grassStrip.sourceBounds, highEdge: 'west' as const } },
  terrain: { sourceBounds: [4072, 2440, 5980, 3300] as ArenaSourceBounds, segmentsX: 112, segmentsZ: 60, blendDistance: 1.15 },
  vegetationZones, pedestrianAccess: paths, pedestrianMasks, courts,
  terrainExclusion: [
    { id: 'arena-footprint', owner: 'ARENA_STRUCTURE' as const, sourcePolygon: arenaRect(footprint) },
    { id: 'arena-plaza-concrete', owner: 'CONCRETE_ACCESS' as const, sourcePolygon: arenaRect(plazaBounds) },
    { id: 'arena-stairs-concrete', owner: 'CONCRETE_ACCESS' as const, sourcePolygon: arenaRect(stairBounds) },
  ],
});

function localBounds(bounds: ArenaSourceBounds) {
  const a = arenaSourceToLocal([bounds[0], bounds[1]]), b = arenaSourceToLocal([bounds[2], bounds[3]]);
  return [a[0], a[1], b[0], b[1]] as const;
}
const TREE_OBSTACLES = [footprint, plazaBounds, stairBounds, courts.multiSportCourt.sourceBounds,
  courts.sandVolleyballCourt.sourceBounds, MIRANTE_COMPLEX.mirante.sourceBounds,
  MIRANTE_COMPLEX.lateralStructure.sourceBounds, MIRANTE_COMPLEX.southApron.sourceBounds].map(localBounds);
function segmentDistance([x, z]: ArenaSourcePoint, a: ArenaSourcePoint, b: ArenaSourcePoint) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}
/** Shared canopy-clearance veto for sector AND existing park tree layers. */
export function arenaVegetationAllowed(point: ArenaSourcePoint, canopyRadius: number) {
  const [x, z] = point, margin = canopyRadius + 0.055;
  if (TREE_OBSTACLES.some(([x0,z0,x1,z1]) => Math.hypot(x - Math.max(x0, Math.min(x1, x)), z - Math.max(z0, Math.min(z1, z))) < margin)) return false;
  return paths.every(path => path.sourcePath.slice(1).every((b, i) =>
    segmentDistance(point, arenaSourceToLocal(path.sourcePath[i]), arenaSourceToLocal(b)) > margin + path.width / 2));
}
/** Stable irregular planting, bounded attempts, no randomness or state per frame. */
export const ARENA_VEGETATION = vegetationZones.flatMap(zone => {
  let seed = zone.seed as number;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  const trees: { sourcePosition: ArenaSourcePoint; scale: number }[] = [];
  for (let tries = 0; tries < zone.count * 50 && trees.length < zone.count; tries++) {
    const [x0,z0,x1,z1] = zone.sourceBounds;
    const sourcePosition: ArenaSourcePoint = [x0 + random() * (x1-x0), z0 + random() * (z1-z0)];
    const scale = 0.82 + random() * 0.53, point = arenaSourceToLocal(sourcePosition);
    if (!arenaVegetationAllowed(point, scale * 0.3)) continue;
    if (trees.some(tree => { const p = arenaSourceToLocal(tree.sourcePosition); return Math.hypot(point[0]-p[0],point[1]-p[1]) < 0.72; })) continue;
    trees.push({ sourcePosition, scale });
  }
  return trees;
});

/** Same F, never a second entity or a database write. Idempotent presentation revision. */
export function reconstructArenaEntity(entity: MapEntity): MapEntity {
  if (entity.publicIdentifier !== 'F' || entity.metadata?.arenaReconstructionRevision === ARENA_RECONSTRUCTION_REVISION) return entity;
  const polygon = ARENA_CANONICAL_LAYOUT.arenaFootprint.localPolygon.map(p => [...p] as Coordinate);
  polygon.push([...polygon[0]] as Coordinate);
  return { ...entity, geometry: { ...entity.geometry, coordinates: [polygon], rotation: 0,
    elevation: plazaElevation, extrusionHeight: ARENA_CANONICAL_LAYOUT.arenaWidth * ARENA_CANONICAL_LAYOUT.architecture.riseToSpan + ARENA_CANONICAL_LAYOUT.architecture.springHeight },
    metadata: { ...entity.metadata, sourcePdfPolygon: [...arenaRect(footprint), arenaRect(footprint)[0]],
      arenaReconstructionRevision: ARENA_RECONSTRUCTION_REVISION, officialMeasurements: false,
      cartographicConfidence: 'reference_registered_estimate', reconstructionAnchors: ARENA_CANONICAL_LAYOUT.registration.anchors } };
}
export function withArenaReconstruction<T extends CommercialMapData>(data: T): T {
  return { ...data, entities: data.entities.map(reconstructArenaEntity) };
}
