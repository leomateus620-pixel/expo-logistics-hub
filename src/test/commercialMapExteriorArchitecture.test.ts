import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import * as THREE from "three";
import {
  EXTERIOR_ARCHITECTURE_CATALOG,
  architectureForBuilding,
} from "../features/commercial-map/data/exteriorArchitecture";
import {
  TERRITORY_BUILDINGS,
  TERRITORY_PATCHES,
  territoryContainsPoint,
} from "../features/commercial-map/data/territorialEnvironment";
import { createArchitectureGeometry } from "../features/commercial-map/utils/exteriorArchitectureGeometry";
import { EXTERIOR_FISHERS } from "../features/commercial-map/utils/exteriorFishing";
import { territoryRoadClearance } from "../features/commercial-map/utils/territorialRoadGeometry";

describe("exterior architectural contract", () => {
  it("provides 50 distinct solid models in the requested categories, in both LODs", () => {
    expect(EXTERIOR_ARCHITECTURE_CATALOG).toHaveLength(50);
    expect(new Set(EXTERIOR_ARCHITECTURE_CATALOG.map((m) => m.id)).size).toBe(
      50,
    );
    expect(
      ["house", "rural", "shed", "building", "support"].map(
        (category) =>
          EXTERIOR_ARCHITECTURE_CATALOG.filter((m) => m.category === category)
            .length,
      ),
    ).toEqual([20, 8, 8, 6, 8]);
    for (const detail of [false, true, "far"] as const) {
      const signatures = new Set<string>();
      for (const model of EXTERIOR_ARCHITECTURE_CATALOG) {
        const g = createArchitectureGeometry(model, detail);
        try {
          const p = g.getAttribute("position");
          signatures.add(
            createHash("sha256")
              .update(Buffer.from(p.array.buffer))
              .digest("hex"),
          );
          expect([...p.array].every(Number.isFinite), model.id).toBe(true);
          const b = g.boundingBox!;
          expect(b.min.x, model.id).toBeGreaterThanOrEqual(-0.500001);
          expect(b.max.x, model.id).toBeLessThanOrEqual(0.500001);
          expect(b.min.z, model.id).toBeGreaterThanOrEqual(-0.500001);
          expect(b.max.z, model.id).toBeLessThanOrEqual(0.500001);
          expect(b.min.y, model.id).toBeGreaterThanOrEqual(-0.000001);
          expect(b.max.y, model.id).toBeLessThanOrEqual(1.000001);
          expect(p.count / 3, model.id).toBeLessThan(4500);
        } finally {
          g.dispose();
        }
      }
      expect(signatures.size).toBe(50);
    }
  });
  it("assigns independently of order, tier, navigation and neighboring filters without changing use", () => {
    const assignments = TERRITORY_BUILDINGS.map((b) => ({
      id: b.id,
      model: architectureForBuilding(b).id,
    }));
    for (const b of [...TERRITORY_BUILDINGS].reverse()) {
      const model = architectureForBuilding({ ...b });
      expect(model.id).toBe(assignments.find((a) => a.id === b.id)!.model);
      expect(model.category).toBe(
        b.kind === "shed"
          ? "shed"
          : b.id.startsWith("roadside-house-")
            ? "rural"
            : "house",
      );
      if (model.floors > 1) expect(b.height).toBeGreaterThanOrEqual(0.86);
    }
    if (process.env.EXPORT_EXTERIOR_REPORT === "1") {
      writeFileSync(
        "docs/screenshots/exterior-upgrade/fisher-layout.json",
        JSON.stringify(EXTERIOR_FISHERS, null, 2),
      );
      writeFileSync(
        "docs/screenshots/exterior-upgrade/model-assignments.json",
        JSON.stringify(assignments, null, 2),
      );
      const used = new Map<string, number>();
      assignments.forEach((a) =>
        used.set(a.model, (used.get(a.model) ?? 0) + 1),
      );
      const rows = EXTERIOR_ARCHITECTURE_CATALOG.map((m) => {
        const low = createArchitectureGeometry(m, false),
          high = createArchitectureGeometry(m, true);
        const row = {
          ...m,
          used: used.get(m.id) ?? 0,
          trianglesMap: low.getAttribute("position").count / 3,
          trianglesNear: high.getAttribute("position").count / 3,
        };
        low.dispose();
        high.dispose();
        return row;
      });
      writeFileSync(
        "docs/screenshots/exterior-upgrade/catalog.json",
        JSON.stringify(rows, null, 2),
      );
    }
  });
  it("seats exactly five people outside water and roads, with rod floats inside the assigned pond", () => {
    expect(EXTERIOR_FISHERS).toHaveLength(5);
    EXTERIOR_FISHERS.forEach((f) => {
      const pond = TERRITORY_PATCHES.find((p) => p.id === f.pondId)!;
      expect(territoryContainsPoint(f.position, pond.ring), f.id).toBe(false);
      expect(territoryRoadClearance(f.position), f.id).toBeGreaterThan(0.2);
      expect(
        TERRITORY_BUILDINGS.every(
          (b) =>
            Math.hypot(
              b.center[0] - f.position[0],
              b.center[1] - f.position[1],
            ) >
            Math.hypot(...b.size) / 2 + 0.12,
        ),
      ).toBe(true);
      const float = new THREE.Vector3(0.025, -0.037, 0.58).applyAxisAngle(
        new THREE.Vector3(0, 1, 0),
        f.rotation,
      );
      expect(
        territoryContainsPoint(
          [f.position[0] + float.x, f.position[1] + float.z],
          pond.ring,
        ),
        f.id,
      ).toBe(true);
      expect(f.groundY + float.y).toBeCloseTo(-0.022, 5);
    });
  });
});
