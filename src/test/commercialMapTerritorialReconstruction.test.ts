import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  TERRITORY_BR472,
  TERRITORY_REFERENCE,
  TERRITORY_ROADS,
} from "../features/commercial-map/data/territorialRoads";
import {
  TERRITORY_BUILDINGS,
  TERRITORY_PATCHES,
  TERRITORY_TREES,
  territoryContainsPoint,
} from "../features/commercial-map/data/territorialEnvironment";
import {
  buildTerritoryRoadGeometry,
  sampleTerritoryRoad,
  territoryRoadClearance,
  UNIFIED_TERRITORY_ROADS,
} from "../features/commercial-map/utils/territorialRoadGeometry";
import {
  GENERATED_REAR_ROAD_SEGMENTS,
  REPLACED_OFFICIAL_ROAD_IDENTIFIERS,
} from "../features/commercial-map/data/rearParkRoadNetwork";
import { REAR_OFFICIAL_ANCHORS } from "../features/commercial-map/utils/rearSpatialCalibration";

describe("territorial reconstruction from September references", () => {
  it("keeps exactly one through BR and removes the short BR and three retired Y arms from all render footprints", () => {
    expect(
      TERRITORY_ROADS.filter((r) => r.id === "osm-1414654006-0"),
    ).toHaveLength(1);
    expect(
      GENERATED_REAR_ROAD_SEGMENTS.some(
        (r) => r.category === "federal-highway" || r.id.startsWith("a5-"),
      ),
    ).toBe(false);
    expect(REPLACED_OFFICIAL_ROAD_IDENTIFIERS).not.toContain("RUA-BRASILIA");
    const canvas = readFileSync(
      "src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx",
      "utf8",
    );
    expect(canvas).not.toContain("<RearParkRoadNetwork");
    const renderer = readFileSync(
      "src/features/commercial-map/components/canvas/RegionalHighwayNetwork.tsx",
      "utf8",
    );
    expect(renderer).not.toMatch(
      /<(NeCloverleafInterchange|SeCloverleaf|Br344Mainline)/,
    );
  });
  it("keeps a planted strip instead of overlapping internal streets or retaining the 31-unit exterior void", () => {
    TERRITORY_BR472.filter((p) => p[1] >= -40 && p[1] <= 37).forEach((p) => {
      expect(p[0]).toBeGreaterThan(58);
      expect(p[0]).toBeLessThan(81);
    });
    expect(TERRITORY_REFERENCE.anchors.gate5Neighbourhood[1]).toBeLessThan(-35);
    expect(TERRITORY_REFERENCE.anchors.arenaAccess[1]).toBeGreaterThan(14);
    expect(REAR_OFFICIAL_ANCHORS.gate5Entity).toEqual([5974, 3678]);
    expect(REAR_OFFICIAL_ANCHORS.gate5ParkEdge).toEqual([5860, 3633]);
  });
  it("triangulates the union without duplicate coverage, inverted faces or lost islands", () => {
    const network = buildTerritoryRoadGeometry();
    try {
      const g = network.pavement,
        p = g.getAttribute("position"),
        indices = g.index!;
      for (const surface of [
        network.pavement,
        network.shoulders,
        network.edgeLines,
        network.centerLines,
      ]) {
        const normals = surface.getAttribute("normal");
        for (let i = 0; i < normals.count; i++) expect(normals.getY(i)).toBe(1);
      }
      let triangleArea = 0;
      for (let i = 0; i < indices.count; i += 3) {
        const a = indices.getX(i),
          b = indices.getX(i + 1),
          c = indices.getX(i + 2);
        const cross =
          (p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a)) -
          (p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a));
        expect(cross).toBeGreaterThanOrEqual(-1e-5);
        triangleArea += cross / 2;
      }
      const area = (ring: number[][]) =>
        Math.abs(
          ring
            .slice(1)
            .reduce((a, p, i) => a + ring[i][0] * p[1] - p[0] * ring[i][1], 0) /
            2,
        );
      const polygonArea = network.footprint.reduce(
        (sum, rings) =>
          sum +
          area(rings[0]) -
          rings.slice(1).reduce((s, r) => s + area(r), 0),
        0,
      );
      expect(triangleArea).toBeCloseTo(polygonArea, 1);
      expect(indices.count / 3).toBeLessThan(30_000);
      const totalTriangles = [
        network.pavement,
        network.unpaved,
        network.shoulders,
        network.edgeLines,
        network.centerLines,
        network.embankment,
      ].reduce(
        (sum, g) =>
          sum + (g.index?.count ?? g.getAttribute("position")?.count ?? 0) / 3,
        0,
      );
      expect(totalTriangles).toBeLessThan(48_000);
      // Every axis is covered by the final union, including the retained park handoffs.
      UNIFIED_TERRITORY_ROADS.forEach((r) =>
        sampleTerritoryRoad(r)
          .slice(1, -1)
          .filter((_, i) => i % 8 === 0)
          .forEach((point) => {
            expect(
              network.fullFootprint.some(
                (rings) =>
                  territoryContainsPoint(point, rings[0]) &&
                  !rings
                    .slice(1)
                    .some((ring) => territoryContainsPoint(point, ring)),
              ),
              r.id,
            ).toBe(true);
          }),
      );
    } finally {
      network.pavement.dispose();
      network.shoulders.dispose();
      network.edgeLines.dispose();
      network.centerLines.dispose();
      network.unpaved.dispose();
      network.hitSurface.dispose();
      network.embankment.dispose();
    }
  });
  it("keeps all new building envelopes and canopy radii clear of sampled road surfaces", () => {
    expect(TERRITORY_BUILDINGS.length).toBeGreaterThan(140);
    TERRITORY_BUILDINGS.forEach((b) =>
      expect(territoryRoadClearance(b.center), b.id).toBeGreaterThan(
        Math.hypot(...b.size) / 2 + 0.2,
      ),
    );
    TERRITORY_TREES.forEach((t) =>
      expect(territoryRoadClearance(t.center)).toBeGreaterThan(t.radius + 0.3),
    );
    expect(TERRITORY_TREES.length).toBeLessThan(1600);
    expect(new Set(TERRITORY_BUILDINGS.map((b) => b.roof)).size).toBe(3);
    expect(TERRITORY_PATCHES.filter((p) => p.kind === "water")).toHaveLength(3);
  });
  it("does not convert the green area outline into a road or a new cadastral gate", () => {
    expect(TERRITORY_ROADS.some((r) => r.id.includes("boundary"))).toBe(false);
    const data = readFileSync(
      "src/features/commercial-map/data/officialReference2026.ts",
      "utf8",
    );
    expect(data).toContain("['RUA-BRASIL', 'Rua Brasil'");
    expect(data).toContain("['RUA-BRASILIA', 'Rua Brasília'");
    expect(TERRITORY_REFERENCE.uncertainties.join(" ")).toContain(
      "Annex 10 was not supplied",
    );
  });
});
