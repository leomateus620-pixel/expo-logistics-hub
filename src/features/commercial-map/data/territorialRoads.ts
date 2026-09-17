import { ARENA_CANONICAL_LAYOUT } from './arenaCanonicalLayout';
import context from './territoryContext.generated.json';
import { clipContextRoad } from './commercialMapSpatialBounds';
import { officialPdfPointToLocal } from "./officialReference2026";
const source = context.provenance;

export type TerritoryPoint = readonly [number, number];
export interface TerritoryRoad {
  id: string;
  name: string;
  kind: "highway" | "access" | "local";
  points: readonly TerritoryPoint[];
  width: number;
  shoulder: number;
  evidence:
    "annex-7" | "annex-8" | "annex-9" | "project-continuation" | "osm-aligned";
  sourceWay?: string;
  surface?: string;
  ref?: string;
}
const local = (p: TerritoryPoint): TerritoryPoint => officialPdfPointToLocal(p);
// OSM node 5479124532 -> 5479124534 (way 951983188), verified 2026-09-13.
// The former park-envelope clip dropped this way and the first vertex of
// way 569781512, disconnecting the two existing BR-472 access branches.
export const GATE5_ACCESS_NODES = {
  upper: [60.7478, 14.4475] as TerritoryPoint,
  lower: [59.6248, 16.4106] as TerritoryPoint,
  parkMouth: [60.1863, 15.42905] as TerritoryPoint,
} as const;
export const TERRITORY_REFERENCE = {
  revision: "2026-09-07",
  unitsPerMetre: 0.15,
  anchors: {
    arena: ARENA_CANONICAL_LAYOUT.arenaCenter.local,
    brasilia: local([3964, 2440]),
    gate5Neighbourhood: [-1.4373, -44.2478] as TerritoryPoint,
    arenaAccess: local([5940, 3678]),
  },
  calibration: source.calibration,
  attribution: source.attribution,
  uncertainties: [
    "Annex 9 labels the northern neighbourhood exit Portão 5; persisted A5 remains at the arena access. The public road continuing the north gate is Rua Alfredo Albino Meinertz. No cadastral gate is moved.",
    "OSM ways 571136681/682 identify the transversal continuation as Brasil; correct its former generated Ubiretama assignment. Ubiretama follows the existing lateral cadastral strip. User identifies Rua Brasília beside the event centre and arena. Annex 6 and OSM also label a distinct Rua Brasil; the two cadastral names remain distinct.",
    "The project names BR-344; the municipal master plan and OSM identify ERS-344. OSM uses RSC-472 on this reach, while the attachments use BR-472. Preserve the requested BR-472 display, document the naming difference.",
    "Annex 8 is separately rotated and cropped. Its bathing-ground placement is an approximate territorial interpretation; the existing southwest park roundabout is retained.",
    "Widths, setbacks and exterior endpoints are modelling estimates, not a topographic survey. Annex 10 was not supplied.",
    "OSM topology has no bridge or nonzero layer in this extract. The two principal junctions follow the connected source nodes; absence of a bridge tag alone is not a field survey.",
  ],
} as const;

/** Imported public axes are aligned once to three existing park landmarks.
 * Full geometry, tags, attribution and transformation are retained in the source.
 * Clipping excludes the established park and lateral district. No API runs in the browser.
 */
// Full OSM provenance remains in the repository. Only the offline spatial
// catalog is bundled; protected axes preserve their complete original vertices.
export const TERRITORY_ROADS: readonly TerritoryRoad[] = Object.freeze(
  (context.roads as unknown as TerritoryRoad[]).flatMap(clipContextRoad),
);
export const TERRITORY_BR472 = TERRITORY_ROADS.filter((r) =>
  r.ref?.includes("472"),
).flatMap((r) => r.points);
export function territoryDistanceToRoad(
  point: TerritoryPoint,
  road: TerritoryRoad,
) {
  let distance = Infinity;
  for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1],
      b = road.points[i],
      dx = b[0] - a[0],
      dz = b[1] - a[1];
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) /
          (dx * dx + dz * dz || 1),
      ),
    );
    distance = Math.min(
      distance,
      Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dz * t),
    );
  }
  return distance;
}
