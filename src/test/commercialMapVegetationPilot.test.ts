import { describe, it, expect } from "vitest";
import { COMMERCIAL_MAP_TREES } from "@/features/commercial-map/data/commercialTrees";
import { OFFICIAL_RENDERED_ENTITIES } from "@/features/commercial-map/data/officialReference2026";
import {
  buildPilotGroundAnchors,
  isVegetationPilotTree,
  pilotTreeProfile,
  VEGETATION_PILOT_AREAS,
} from "@/features/commercial-map/utils/vegetationPilot";
import {
  createPilotTreeAsset,
  createPilotGrassGeometry,
} from "@/features/commercial-map/utils/vegetationPilotAssets";
import { buildQuadrasABEnvironmentPlan } from "@/features/commercial-map/utils/quadrasABEnvironment";
import {
  pointInPolygon,
  distanceToSegment,
} from "@/features/commercial-map/utils/spatialSurface";
import { rearParkingEntityForPresentation } from "@/features/commercial-map/data/rearParking";
import {
  buildCommercialSiteHardSurfaceMasks,
  commercialSiteCellIntersectsHardMask,
} from "@/features/commercial-map/utils/commercialSiteEnvironment";
import {
  createPilotLeafAtlas,
  applyPilotGroundMaterial,
} from "@/features/commercial-map/components/canvas/vegetationPilotMaterial";
import * as THREE from "three";

const pilot = COMMERCIAL_MAP_TREES.filter(isVegetationPilotTree);
describe("controlled three-zone vegetation pilot", () => {
  it("shares ground detail without disposing a texture that another pilot surface still uses", () => {
    const first = applyPilotGroundMaterial(new THREE.MeshStandardMaterial());
    const second = applyPilotGroundMaterial(new THREE.MeshStandardMaterial());
    applyPilotGroundMaterial(first);
    const inspect = (material: THREE.MeshStandardMaterial) => {
      const shader = {
        uniforms: {},
        vertexShader: "#include <common>\n#include <begin_vertex>",
        fragmentShader:
          "#include <common>\n#include <color_fragment>\n#include <normal_fragment_maps>",
      } as Parameters<THREE.MeshStandardMaterial["onBeforeCompile"]>[0];
      material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      return shader.uniforms.pilotGroundNoise.value as THREE.Texture;
    };
    const texture = inspect(first);
    expect(inspect(second)).toBe(texture);
    let disposals = 0;
    texture.addEventListener("dispose", () => disposals++);
    first.dispose();
    expect(disposals).toBe(0);
    second.dispose();
    expect(disposals).toBe(1);
  });
  it("partitions exact inventories without changing IDs, coordinates or species records", () => {
    const before = JSON.stringify(COMMERCIAL_MAP_TREES);
    expect([...new Set(pilot.map((t) => t.area))].sort()).toEqual(
      [...VEGETATION_PILOT_AREAS].sort(),
    );
    expect(
      COMMERCIAL_MAP_TREES.filter((t) => !isVegetationPilotTree(t)).length +
        pilot.length,
    ).toBe(COMMERCIAL_MAP_TREES.length);
    for (const tree of pilot) {
      expect(pilotTreeProfile(tree)).toEqual(pilotTreeProfile({ ...tree }));
      expect(pilotTreeProfile(tree).scaleY).toBeGreaterThan(0);
    }
    expect(JSON.stringify(COMMERCIAL_MAP_TREES)).toBe(before);
    expect(isVegetationPilotTree({ area: "PARKING_VISITORS" })).toBe(false);
    expect(isVegetationPilotTree({ area: "REAR_PARKING" })).toBe(false);
  });
  it("keeps every complete grass tuft within authorized free cells and parking collars", () => {
    const anchors = buildPilotGroundAnchors(OFFICIAL_RENDERED_ENTITIES, pilot);
    const plan = buildQuadrasABEnvironmentPlan({
      entities: OFFICIAL_RENDERED_ENTITIES,
      reducedGraphics: false,
    });
    const parking = rearParkingEntityForPresentation(
      OFFICIAL_RENDERED_ENTITIES.find(
        (e) => e.publicIdentifier === "EST-EXP-VIS",
      )!,
    ).geometry.coordinates[0];
    const masks = buildCommercialSiteHardSurfaceMasks(
      OFFICIAL_RENDERED_ENTITIES,
    ).filter((m) => m.sourceIdentifier !== "EST-EXP-VIS");
    for (const area of VEGETATION_PILOT_AREAS)
      expect(anchors.filter((p) => p.area === area).length).toBeGreaterThan(
        100,
      );
    for (const a of anchors) {
      if (a.area === "PARKING_EXHIBITORS_VISITORS") {
        expect(pointInPolygon([a.x, a.z], parking)).toBe(true);
        expect(
          Math.min(
            ...pilot
              .filter((t) => t.area === a.area)
              .map((t) => Math.hypot(a.x - t.position[0], a.z - t.position[1])),
          ),
        ).toBeLessThanOrEqual(0.42);
        expect(
          parking.some(
            (p, i) =>
              distanceToSegment(
                [a.x, a.z],
                p,
                parking[(i + 1) % parking.length],
              ) < 0.069,
          ),
        ).toBe(false);
        const square = [
          [a.x - 0.06, a.z - 0.06],
          [a.x + 0.06, a.z - 0.06],
          [a.x + 0.06, a.z + 0.06],
          [a.x - 0.06, a.z + 0.06],
        ] as const;
        expect(
          masks.some((mask) =>
            commercialSiteCellIntersectsHardMask(square, mask),
          ),
        ).toBe(false);
      } else
        expect(
          plan.cells.some(
            (c) =>
              c.quadra === (a.area === "QUADRA_A" ? "A" : "B") &&
              pointInPolygon([a.x, a.z], c.polygon),
          ),
        ).toBe(true);
    }
    expect(buildPilotGroundAnchors(OFFICIAL_RENDERED_ENTITIES, pilot)).toEqual(
      anchors,
    );
  }, 30000);
  it("has bounded, finite reusable assets and folded leaf centers for continuous detail fade", () => {
    for (let family = 0; family < 3; family++) {
      const a = createPilotTreeAsset(family);
      for (const geometry of [a.trunk, a.core, a.detail]) {
        expect(
          Array.from(geometry.attributes.position.array).every(Number.isFinite),
        ).toBe(true);
        expect(geometry.index!.count / 3).toBeLessThan(4000);
        expect(geometry.boundingSphere!.radius).toBeGreaterThan(0);
      }
      expect(a.core.getAttribute("pilotLeafCenter").count).toBe(
        a.core.getAttribute("position").count,
      );
      expect(a.detail.index!.count / 3).toBeLessThan(a.core.index!.count / 3);
      a.dispose();
    }
    const grass = createPilotGrassGeometry();
    expect(grass.index!.count / 3).toBe(15);
    const positions = grass.getAttribute("position");
    for (let i = 0; i < positions.count; i++)
      expect(
        Math.hypot(positions.getX(i), positions.getZ(i)) * 1.1,
      ).toBeLessThan(0.065);
    grass.dispose();
  });
  it("retains leaf alpha coverage at every mip so the distant core cannot disappear", () => {
    const atlas = createPilotLeafAtlas();
    expect(atlas.mipmaps).toHaveLength(9);
    for (const mip of atlas.mipmaps) {
      const data = (mip as { data: Uint8Array }).data;
      expect(
        Array.from({ length: data.length / 4 }, (_, i) => data[i * 4 + 3]).some(
          (a) => a >= 82,
        ),
      ).toBe(true);
    }
    expect(atlas.generateMipmaps).toBe(false);
    atlas.dispose();
  });
});
