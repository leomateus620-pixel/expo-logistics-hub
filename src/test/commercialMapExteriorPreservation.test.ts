import { expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  TERRITORY_BUILDINGS,
  TERRITORY_PATCHES,
  TERRITORY_TREES,
} from "../features/commercial-map/data/territorialEnvironment";
import {
  UNIFIED_TERRITORY_ROADS,
  buildTerritoryRoadGeometry,
} from "../features/commercial-map/utils/territorialRoadGeometry";
import * as district from "../features/commercial-map/data/lateralResidentialDistrict";

it("preserves every approved building, tree anchor, water/land boundary, road and lateral district", () => {
  const roadGeometry = buildTerritoryRoadGeometry();
  const geometryHashes: Record<string, string> = {};
  Object.entries(roadGeometry).forEach(([key, value]) => {
    if (value && typeof value === "object" && "attributes" in value) {
      const geometry = value as import("three").BufferGeometry;
      geometryHashes[key] = createHash("sha256")
        .update(JSON.stringify(geometry.toJSON().data))
        .digest("hex");
      geometry.dispose();
    }
  });
  const snapshot = JSON.parse(
    JSON.stringify({
      baseCommit: "ca16aa57",
      buildings: TERRITORY_BUILDINGS,
      trees: TERRITORY_TREES.map((tree, i) => ({
        id: `territory-tree-${i}`,
        ...tree,
      })),
      patches: TERRITORY_PATCHES,
      roads: UNIFIED_TERRITORY_ROADS,
      geometryHashes,
      district,
    }),
  );
  const path = "docs/screenshots/exterior-upgrade/implantation-baseline.json";
  if (process.env.RECORD_EXTERIOR_BASELINE === "1")
    writeFileSync(path, JSON.stringify(snapshot));
  expect(snapshot).toEqual(JSON.parse(readFileSync(path, "utf8")));
});
