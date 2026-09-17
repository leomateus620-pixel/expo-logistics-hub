import context from './territoryContext.generated.json';
import type { TerritoryPoint } from './territorialRoads';
import { clipContextPolygon, retainCommercialMapContext } from './commercialMapSpatialBounds';

export interface TerritoryBuilding {
  id: string;
  center: TerritoryPoint;
  size: TerritoryPoint;
  height: number;
  rotation: number;
  roof: "gable" | "hip" | "flat";
  color: string;
  wall: string;
  kind: "house" | "shed";
}
export interface TerritoryPatch {
  id: string;
  ring: readonly TerritoryPoint[];
  color: string;
  kind: "field" | "yard" | "water" | "woodland" | "soil";
}
export interface TerritoryTree {
  center: TerritoryPoint;
  radius: number;
  height: number;
  color: string;
}

/** Generated offline from the audited original placements. No distant placement
 * loops, collision scans, raw OSM data, materials or instance buffers are loaded.
 * The runtime guard also fails closed if a stale generated file is supplied. */
export const TERRITORY_BUILDINGS: readonly TerritoryBuilding[] = Object.freeze(
  (context.buildings as unknown as TerritoryBuilding[]).filter(b => retainCommercialMapContext(b.center, Math.hypot(...b.size) / 2)),
);
export const TERRITORY_TREES: readonly TerritoryTree[] = Object.freeze(
  (context.trees as unknown as TerritoryTree[]).filter(t => retainCommercialMapContext(t.center, t.radius)),
);
export const TERRITORY_PATCHES: readonly TerritoryPatch[] = Object.freeze(
  (context.patches as unknown as TerritoryPatch[]).flatMap(patch => {
    const ring = clipContextPolygon(patch.ring);
    return ring.length >= 3 ? [{ ...patch, ring }] : [];
  }),
);

export function territoryContainsPoint(
  point: TerritoryPoint,
  ring: readonly TerritoryPoint[],
) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
