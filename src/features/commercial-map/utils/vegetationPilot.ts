import type { CommercialMapTree } from "../data/commercialTrees";
import type { MapEntity } from "../types";
import { buildQuadrasABEnvironmentPlan } from "./quadrasABEnvironment";
import {
  buildCommercialSiteHardSurfaceMasks,
  commercialSiteCellIntersectsHardMask,
  commercialSitePolygonBounds,
} from "./commercialSiteEnvironment";
import { pointInPolygon, distanceToSegment } from "./spatialSurface";
import { rearParkingEntityForPresentation } from "../data/rearParking";

/** Explicit, closed pilot allowlist. Never opt in by proximity or a shared material. */
export const VEGETATION_PILOT_AREAS = [
  "QUADRA_A",
  "QUADRA_B",
  "PARKING_EXHIBITORS_VISITORS",
] as const;
export type VegetationPilotArea = (typeof VEGETATION_PILOT_AREAS)[number];
export const isVegetationPilotTree = (tree: Pick<CommercialMapTree, "area">) =>
  (VEGETATION_PILOT_AREAS as readonly string[]).includes(tree.area);

/** Reproducible comparison only; the legacy branch is unreachable by a production URL. */
export const isVegetationPilotEnabled = (part: "trees" | "ground" = "trees") =>
  !(
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    (new URLSearchParams(window.location.search).has(
      "vegetationPilotBaseline",
    ) ||
      (part === "ground" &&
        new URLSearchParams(window.location.search).has(
          "vegetationPilotGroundBaseline",
        )))
  );

export function pilotRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function pilotHash(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++)
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function pilotTreeProfile(tree: CommercialMapTree) {
  const random = pilotRandom(pilotHash(tree.id));
  return {
    family:
      tree.speciesGroup === "OPEN_CANOPY"
        ? 1
        : pilotHash(tree.id) % 2 === 0
          ? 0
          : 2,
    rotation: random() * Math.PI * 2,
    scaleX: tree.canopyRadius * (0.92 + random() * 0.16),
    scaleY:
      ((tree.trunkHeight + tree.crownHeight * 0.88) / 3.5) *
      (0.96 + random() * 0.08),
    scaleZ: tree.canopyRadius * (0.9 + random() * 0.18),
    tone: random(),
  };
}

export interface PilotGroundAnchor {
  area: VegetationPilotArea;
  x: number;
  z: number;
  y: number;
  scale: number;
  angle: number;
  tone: number;
}

/** Existing A/B free-surface cells are the authority, including their road and B12/B13 exclusions.
 * Parking detail occupies only small collars around existing island/perimeter trees. */
export function buildPilotGroundAnchors(
  entities: readonly MapEntity[],
  trees: readonly CommercialMapTree[],
) {
  const plan = buildQuadrasABEnvironmentPlan({
    entities,
    reducedGraphics: false,
  });
  const anchors: PilotGroundAnchor[] = [];
  for (const cell of plan.cells) {
    const random = pilotRandom(pilotHash(cell.id));
    const size = cell.polygon[1][0] - cell.polygon[0][0];
    const attempts =
      cell.materialId === "exposed-soil"
        ? 3
        : cell.materialId === "dry-grass"
          ? 9
          : 17;
    for (let i = 0; i < attempts; i++) {
      const x =
        cell.polygon[0][0] + 0.065 + random() * Math.max(0, size - 0.13);
      const z =
        cell.polygon[0][1] + 0.065 + random() * Math.max(0, size - 0.13);
      const patch =
        Math.sin(x * 2.7 + Math.sin(z * 1.3)) * Math.sin(z * 2.2 - x * 0.4);
      if (random() < 0.2 + patch * 0.15) continue;
      anchors.push({
        area: cell.quadra === "A" ? "QUADRA_A" : "QUADRA_B",
        x,
        z,
        y: 0.033,
        scale: 0.45 + random() * 0.65,
        angle: random() * Math.PI * 2,
        tone: random(),
      });
    }
  }
  const owner = entities.find((e) => e.publicIdentifier === "EST-EXP-VIS");
  if (owner) {
    const polygon =
      rearParkingEntityForPresentation(owner).geometry.coordinates[0];
    const bounds = commercialSitePolygonBounds(polygon);
    const masks = buildCommercialSiteHardSurfaceMasks(entities).filter(
      (mask) =>
        mask.sourceIdentifier !== "EST-EXP-VIS" &&
        mask.bounds.minimumX < bounds.maximumX + 1 &&
        mask.bounds.maximumX > bounds.minimumX - 1 &&
        mask.bounds.minimumZ < bounds.maximumZ + 1 &&
        mask.bounds.maximumZ > bounds.minimumZ - 1,
    );
    for (const tree of trees.filter(
      (t) => t.area === "PARKING_EXHIBITORS_VISITORS",
    )) {
      const random = pilotRandom(pilotHash(tree.id));
      const radius = Math.min(0.42, tree.canopyRadius * 0.35);
      for (let i = 0; i < 75; i++) {
        const a = random() * Math.PI * 2,
          r = Math.sqrt(random()) * radius;
        const x = tree.position[0] + Math.cos(a) * r,
          z = tree.position[1] + Math.sin(a) * r;
        const clearance = 0.07;
        if (
          !pointInPolygon([x, z], polygon) ||
          polygon.some(
            (p, j) =>
              distanceToSegment([x, z], p, polygon[(j + 1) % polygon.length]) <
              clearance,
          )
        )
          continue;
        const square = [
          [x - clearance, z - clearance],
          [x + clearance, z - clearance],
          [x + clearance, z + clearance],
          [x - clearance, z + clearance],
        ] as const;
        if (
          masks.some((mask) =>
            commercialSiteCellIntersectsHardMask(square, mask),
          )
        )
          continue;
        anchors.push({
          area: "PARKING_EXHIBITORS_VISITORS",
          x,
          z,
          y: 0.062,
          scale: 0.45 + random() * 0.65,
          angle: a,
          tone: random(),
        });
      }
    }
  }
  // Nested deterministic budgets, spatially mixed instead of dropping one whole zone.
  const activeAreas = new Set(
    trees.filter(isVegetationPilotTree).map((t) => t.area),
  );
  return anchors
    .filter((a) => activeAreas.has(a.area))
    .sort((a, b) => pilotHash(`${a.x}:${a.z}`) - pilotHash(`${b.x}:${b.z}`));
}
