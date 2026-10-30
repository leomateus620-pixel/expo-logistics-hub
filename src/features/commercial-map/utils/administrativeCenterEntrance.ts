import { OFFICIAL_REFERENCE_ENTITIES } from '../data/officialReference2026';
import type { StrategicLandmarkBounds } from './landmarks';
import { COMMERCIAL_MAP_GROUND_ELEVATION } from '../constants';

export interface AdministrativeEntranceRect {
  minX: number; maxX: number; minZ: number; maxZ: number;
  elevation: number; height: number;
}
export interface AdministrativeCenterEntranceLayout {
  body: { width: number; depth: number; centerZ: number; endX: number };
  canopy: { minX: number; maxX: number; minZ: number; maxZ: number; eaveY: number; ridgeY: number };
  walkway: AdministrativeEntranceRect;
  lawn: AdministrativeEntranceRect;
  hedgeRows: AdministrativeEntranceRect[];
  steps: AdministrativeEntranceRect[];
  posts: [number, number][];
  door: { x: number; centerZ: number; bottomY: number; width: number; height: number };
  tree: { x: number; z: number; groundY: number; trunkRadius: number; trunkHeight: number; crownCenterY: number; crownRadius: number; crownHalfHeight: number };
  /** Graded lawn replaces the old raised green box and meets the park at its edges. */
  lawnUsesExistingGround: false;
  streetEdgeZ: number;
}

const argentina = OFFICIAL_REFERENCE_ENTITIES.find(entity => entity.publicIdentifier === 'RUA-ARGENTINA')!;
const STREET_EDGE_Z = Math.max(...argentina.geometry.coordinates[0].map(point => point[1]));

/** The parent already applies yaw PI/2. +X therefore projects toward Argentina,
 * rather than sideways onto the long window elevation or toward the rear. */
export function createAdministrativeCenterEntranceLayout(bounds: StrategicLandmarkBounds, height: number): AdministrativeCenterEntranceLayout {
  const width = bounds.width * .96, depth = bounds.depth * .9;
  const body = { width: width * .94, depth: depth * .66, centerZ: -depth * .1, endX: width * .94 / 2 };
  const centerZ = body.centerZ + body.depth * .174;
  const streetX = Math.max(body.endX + .3, bounds.centerZ - STREET_EDGE_Z);
  const canopyEndX = Math.min(body.endX + 1.5, streetX - .14);
  const canopyWidth = Math.min(.9, body.depth * .56);
  const eaveY = Math.min(.6, height * .35);
  const pathWidth = Math.min(.56, canopyWidth * .64);
  const pavementY = .068, slab = pavementY - COMMERCIAL_MAP_GROUND_ELEVATION;
  const walkway = { minX: body.endX, maxX: streetX - .18, minZ: centerZ - pathWidth / 2, maxZ: centerZ + pathWidth / 2, elevation: pavementY, height: slab };
  const landing = { minX: walkway.maxX, maxX: streetX, minZ: centerZ - canopyWidth * .58, maxZ: centerZ + canopyWidth * .58, elevation: pavementY, height: slab };
  const hedgeRows = [-1, 1].map(side => {
    const z = centerZ + side * (pathWidth / 2 + .14);
    return { minX: body.endX + .16, maxX: canopyEndX - .12, minZ: z - .085, maxZ: z + .085, elevation: .03, height: .105 };
  });
  const canopyMinX = body.endX - .012;
  const posts: [number, number][] = [canopyMinX + .02, (canopyMinX + canopyEndX) / 2, canopyEndX - .045]
    .flatMap(x => [centerZ - canopyWidth / 2 + .02, centerZ + canopyWidth / 2 - .02].map(z => [x, z] as [number, number]));
  return {
    body,
    canopy: { minX: body.endX - .012, maxX: canopyEndX, minZ: centerZ - canopyWidth / 2, maxZ: centerZ + canopyWidth / 2, eaveY, ridgeY: eaveY + canopyWidth * .075 },
    walkway, lawn: { minX: body.endX, maxX: streetX, minZ: -bounds.depth / 2, maxZ: bounds.depth / 2,
      elevation: .03, height: .03 - COMMERCIAL_MAP_GROUND_ELEVATION },
    hedgeRows, steps: [landing, { minX: body.endX, maxX: body.endX + .09,
      minZ: centerZ - pathWidth * .48, maxZ: centerZ + pathWidth * .48, elevation: .09, height: .022 }], posts,
    door: { x: body.endX + .018, centerZ, bottomY: .09, width: pathWidth * .9, height: Math.min(.46, eaveY - .11) },
    tree: { x: body.endX + .91, z: body.centerZ - body.depth * .4125, groundY: .03,
      trunkRadius: .045, trunkHeight: 1.45, crownCenterY: 1.65, crownRadius: .45, crownHalfHeight: .85 },
    lawnUsesExistingGround: false, streetEdgeZ: STREET_EDGE_Z,
  };
}

export function administrativeEntranceLawnHeight(layout: AdministrativeCenterEntranceLayout, _x: number, z: number): number {
  const edge = Math.max(0, Math.min(1, Math.min(z - layout.lawn.minZ, layout.lawn.maxZ - z) / .14));
  return COMMERCIAL_MAP_GROUND_ELEVATION + (layout.lawn.elevation - COMMERCIAL_MAP_GROUND_ELEVATION) * edge;
}
