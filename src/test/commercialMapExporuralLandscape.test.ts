import { describe, it, expect } from "vitest";
import { OFFICIAL_REFERENCE_DATA } from "@/features/commercial-map/data/officialReference2026";
import {
  buildExporuralLandscape,
  EXPORURAL_WELL,
  isExporuralLandscapeLot,
} from "@/features/commercial-map/utils/exporuralLandscape";
import {
  pointInPolygon,
  distanceToPolygon,
} from "@/features/commercial-map/utils/spatialSurface";
import { applyExporuralTurfMaterial } from "@/features/commercial-map/components/canvas/exporuralTurfMaterial";
import { applyParkSurfaceDetail } from "@/features/commercial-map/components/canvas/parkSurfaceMaterial";
import * as THREE from "three";
import polygonClipping from "polygon-clipping";
import type { Coordinate } from "@/features/commercial-map/types";

describe("Exporural presentation boundaries and infrastructure", () => {
  it("preserves every entity, commercial record and official ring while creating bounded presentation meshes", () => {
    const before = JSON.stringify(OFFICIAL_REFERENCE_DATA);
    const model = buildExporuralLandscape(OFFICIAL_REFERENCE_DATA.entities);
    expect(JSON.stringify(OFFICIAL_REFERENCE_DATA)).toBe(before);
    expect(model.borders).not.toBeNull();
    expect(model.slopes).not.toBeNull();
    expect(model.borders!.getAttribute("position").count).toBeLessThan(5000);
    expect(model.slopes!.getAttribute("position").count).toBeLessThan(4000);
    const p = model.slopes!.getAttribute("position");
    const target = OFFICIAL_REFERENCE_DATA.entities.filter((e) =>
      ["Q-R-02", "Q-R-13", "Q-R-14"].includes(e.publicIdentifier),
    );
    for (let i = 0; i < p.count; i++) {
      expect(Number.isFinite(p.getY(i))).toBe(true);
      expect(p.getY(i)).toBeGreaterThanOrEqual(0.024);
      expect(p.getY(i)).toBeLessThanOrEqual(0.375);
      expect(
        target.some(
          (e) =>
            distanceToPolygon(
              [p.getX(i), p.getZ(i)],
              e.geometry.coordinates[0],
            ) < 1.64,
        ),
      ).toBe(true);
      expect(
        OFFICIAL_REFERENCE_DATA.entities
          .filter(
            (e) =>
              ["ROAD", "SELLABLE_LOT", "PAVILION"].includes(e.classification) &&
              pointInPolygon([p.getX(i), p.getZ(i)], e.geometry.coordinates[0]),
          )
          .map((e) => e.publicIdentifier),
        `${p.getX(i)},${p.getZ(i)}`,
      ).toEqual([]);
    }
    model.terrace?.dispose();
    model.borders!.dispose();
    model.slopes!.dispose();
  });
  it("adds no landscape to another segment, building, path or road", () => {
    const other = OFFICIAL_REFERENCE_DATA.entities.filter(
      (e) => !isExporuralLandscapeLot(e),
    );
    expect(buildExporuralLandscape(other)).toEqual({
      borders: null,
      slopes: null,
      terrace: null,
    });
    const r2 = OFFICIAL_REFERENCE_DATA.entities.find(
      (e) => e.publicIdentifier === "Q-R-02",
    )!;
    expect(EXPORURAL_WELL.type).toBe("well");
    expect(EXPORURAL_WELL.id).toBe("well-02");
    expect(
      pointInPolygon(EXPORURAL_WELL.position, r2.geometry.coordinates[0]),
    ).toBe(true);
    for (const dx of [-0.33, 0.33])
      for (const dz of [-0.33, 0.33])
        expect(
          pointInPolygon(
            [EXPORURAL_WELL.position[0] + dx, EXPORURAL_WELL.position[1] + dz],
            r2.geometry.coordinates[0],
          ),
        ).toBe(true);
  });
  it("keeps every slope triangle outside all commercial lots, roads and buildings", () => {
    const model = buildExporuralLandscape(OFFICIAL_REFERENCE_DATA.entities);
    const geometry = model.slopes!,
      positions = geometry.getAttribute("position"),
      indices = geometry.index!;
    const adjacency = Array.from(
      { length: positions.count },
      () => new Set<number>(),
    );
    for (let i = 0; i < indices.count; i += 3)
      for (let j = 0; j < 3; j++) {
        const a = indices.getX(i + j),
          b = indices.getX(i + ((j + 1) % 3));
        adjacency[a].add(b);
        adjacency[b].add(a);
      }
    const visited = new Set<number>([0]),
      pending = [0];
    while (pending.length)
      for (const next of adjacency[pending.pop()!])
        if (!visited.has(next)) {
          visited.add(next);
          pending.push(next);
        }
    expect(visited.size, "P5-to-R02 slope must be one connected surface").toBe(
      positions.count,
    );
    const protectedRings = OFFICIAL_REFERENCE_DATA.entities
      .filter((e) =>
        ["SELLABLE_LOT", "ROAD", "PAVILION"].includes(e.classification),
      )
      .map((e) => ({ id: e.publicIdentifier, ring: e.geometry.coordinates[0] }))
      .filter(
        ({ ring }) =>
          Math.min(...ring.map((p) => p[0])) < 13 &&
          Math.max(...ring.map((p) => p[0])) > -4 &&
          Math.min(...ring.map((p) => p[1])) < -11 &&
          Math.max(...ring.map((p) => p[1])) > -18,
      );
    for (let i = 0; i < indices.count; i += 3) {
      const triangle: Coordinate[] = [0, 1, 2].map((j) => {
        const k = indices.getX(i + j);
        return [positions.getX(k), positions.getZ(k)];
      });
      for (const { id, ring } of protectedRings) {
        const intersection = polygonClipping.intersection([triangle], [ring]);
        const area = intersection.reduce(
          (sum, polygon) =>
            sum +
            polygon.reduce(
              (s, r) =>
                s +
                Math.abs(
                  r.reduce((a, p, j) => {
                    const q = r[(j + 1) % r.length];
                    return a + p[0] * q[1] - q[0] * p[1];
                  }, 0),
                ) /
                  2,
              0,
            ),
          0,
        );
        expect(area, `${id}, triangle ${i / 3}`).toBeLessThan(1e-9);
      }
    }
    model.terrace?.dispose();
    model.borders!.dispose();
    geometry.dispose();
  });
  it("joins a single rising cut face to a level terrace without a reverse berm or parcel overlap", () => {
    const before = JSON.stringify(OFFICIAL_REFERENCE_DATA);
    const model = buildExporuralLandscape(OFFICIAL_REFERENCE_DATA.entities);
    const slope = model.slopes!.getAttribute("position");
    for (let row = 0; row < slope.count; row += 19) {
      for (let v = 1; v < 19; v++) expect(slope.getY(row + v)).toBeGreaterThanOrEqual(slope.getY(row + v - 1) - 1e-6);
      expect(slope.getY(row+18)).toBeCloseTo(slope.getY(row+17), 6);
    }
    const terrace = model.terrace!.getAttribute("position");
    expect(terrace.count).toBeLessThan(100000);
    const protectedEntities = OFFICIAL_REFERENCE_DATA.entities.filter(e => ["SELLABLE_LOT", "ROAD", "PAVILION", "BUILDING", "RESTROOM"].includes(e.classification));
    for (let i = 0; i < terrace.count; i += 3) {
      const triangle: Coordinate[] = [0,1,2].map(j => [terrace.getX(i+j), terrace.getZ(i+j)]);
      for (const entity of protectedEntities) {
        const ring = entity.geometry.coordinates[0];
        if (Math.max(...ring.map(p=>p[0])) < Math.min(...triangle.map(p=>p[0])) || Math.min(...ring.map(p=>p[0])) > Math.max(...triangle.map(p=>p[0])) || Math.max(...ring.map(p=>p[1])) < Math.min(...triangle.map(p=>p[1])) || Math.min(...ring.map(p=>p[1])) > Math.max(...triangle.map(p=>p[1]))) continue;
        for (const polygon of polygonClipping.intersection([triangle],[ring])) for (const r of polygon) {
          const area = Math.abs(r.reduce((a,p,j) => {const q=r[(j+1)%r.length];return a+p[0]*q[1]-q[0]*p[1]},0))/2;
          expect(area, entity.publicIdentifier).toBeLessThan(1e-6);
        }
      }
    }
    expect(JSON.stringify(OFFICIAL_REFERENCE_DATA)).toBe(before);
    Object.values(model).forEach(g => g?.dispose());
  });
  it("keeps the turf hook through full/economy transitions without duplicate shader declarations", () => {
    const material = new THREE.MeshStandardMaterial();
    applyExporuralTurfMaterial(material);
    for (const reduced of [false, true, false, true, false]) {
      applyParkSurfaceDetail(material, "lot", reduced);
      const shader = {
        vertexShader: THREE.ShaderLib.standard.vertexShader,
        fragmentShader: THREE.ShaderLib.standard.fragmentShader,
        uniforms: {},
      };
      material.onBeforeCompile(shader as never, {} as never);
      expect(
        shader.vertexShader.match(/attribute float exporuralTurf;/g),
      ).toHaveLength(1);
      expect(shader.fragmentShader).toContain("if(vExporuralTurf>.5)");
    }
    material.dispose();
  });
});
