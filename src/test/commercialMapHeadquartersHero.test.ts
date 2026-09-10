import { beforeAll, afterAll, describe, it, expect } from "vitest";
import * as THREE from "three";
import { createHeadquartersGeometry } from "@/features/commercial-map/components/canvas/headquarters/geometry";
import { buildShell } from "@/features/commercial-map/components/canvas/headquarters/architecture";
import { buildFrontage } from "@/features/commercial-map/components/canvas/headquarters/landscape";
import { buildSoybeanMonument } from "@/features/commercial-map/components/canvas/headquarters/monument";
import { bakeArchitecturalContact } from "@/features/commercial-map/components/canvas/headquarters/contact";
import { FENASOJA_COMPLEX as S } from "@/features/commercial-map/data/fenasojaComplexReconstruction";
import { complexWorldPolygon } from "@/features/commercial-map/data/fenasojaComplexReconstruction";
import { COMMERCIAL_ELECTRICAL_NODES } from "@/features/commercial-map/data/electricalInfrastructure";
import { OFFICIAL_REFERENCE_DATA } from "@/features/commercial-map/data/officialReference2026";
import { resolveElectricalNodePlacements } from "@/features/commercial-map/utils/electricalInfrastructure";
import {
  distanceToPolygon,
  pointInPolygon,
} from "@/features/commercial-map/utils/spatialSurface";

describe("headquarters hero geometry", () => {
  let model: ReturnType<
    ReturnType<typeof createHeadquartersGeometry>["finish"]
  >;
  beforeAll(() => {
    const b = createHeadquartersGeometry();
    buildShell(b);
    buildFrontage(b);
    buildSoybeanMonument(b);
    model = b.finish();
  });
  afterAll(() => model.geometry.forEach((g) => g.geometry.dispose()));
  it("clears the verified pole/roof collision while keeping the electrical source marker", () => {
    const node = COMMERCIAL_ELECTRICAL_NODES.find(
      (n) => n.sourceMarkerId === "pole-ref-337",
    )!;
    const stage = complexWorldPolygon("stage", "roofProjection");
    expect(pointInPolygon(node.position, stage)).toBe(true);
    const placement = resolveElectricalNodePlacements(
      [node],
      OFFICIAL_REFERENCE_DATA.entities,
      true,
    )[0];
    expect(placement.node).toBe(node);
    expect(placement.sourceAnchorPreserved).toBe(true);
    expect(distanceToPolygon(placement.renderPosition, stage)).toBeGreaterThan(
      node.radius,
    );
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes = model.geometry
      .filter((p) => p.key === "roof")
      .map((p) => new THREE.Mesh(p.geometry, material));
    const u = S.registration.unitsPerMeter,
      [ox, oz] = S.headquarters.origin,
      [px, pz] = placement.renderPosition;
    for (const [dx, dz] of [
      [0, 0],
      [node.radius, 0],
      [-node.radius, 0],
      [0, node.radius],
      [0, -node.radius],
    ]) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3((pz + dz - oz) / u, 20, (ox - px - dx) / u),
        new THREE.Vector3(0, -1, 0),
      );
      expect(ray.intersectObjects(meshes)).toHaveLength(0);
    }
    material.dispose();
  });
  it("keeps every vertex finite, normals normalized, and all hard surfaces inside the block", () => {
    for (const part of model.geometry) {
      const p = part.geometry.getAttribute("position"),
        n = part.geometry.getAttribute("normal");
      let invalid = 0;
      for (let i = 0; i < p.count; i++) {
        if (!Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))) invalid++;
        const length = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
        if (!Number.isFinite(length)) invalid++;
        // A few collapsed parametric tips intentionally have zero area; all other normals are unit length.
        if (!(length < 0.0001 || Math.abs(length - 1) < 0.001)) invalid++;
      }
      expect(invalid, part.key).toBe(0);
      part.geometry.computeBoundingBox();
      const bounds = part.geometry.boundingBox!;
      expect(bounds.max.x, part.key).toBeLessThan(7.12);
      expect(bounds.max.z, part.key).toBeLessThan(9.2);
    }
  });
  it("opens the actual wall for triangular glazing, campaign row and entrance", () => {
    const group = new THREE.Group(),
      material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    model.geometry
      .filter((g) => g.key === "wall")
      .forEach((g) => group.add(new THREE.Mesh(g.geometry, material)));
    group.updateMatrixWorld(true);
    const front = S.headquarters.entrance[1] - 0.01;
    for (const [x, y] of [
      [0.45, 5.9],
      [0.45, 4.55],
      [0.35, 1.5],
    ]) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(x, y, front + 1),
        new THREE.Vector3(0, 0, -1),
        0,
        1.25,
      );
      expect(
        ray.intersectObjects(group.children),
        `opening ${x},${y}`,
      ).toHaveLength(0);
    }
    const ray = new THREE.Raycaster(
      new THREE.Vector3(2.7, 2.0, front + 1),
      new THREE.Vector3(0, 0, -1),
      0,
      1.3,
    );
    expect(ray.intersectObjects(group.children).length).toBeGreaterThan(0);
    material.dispose();
  });
  it("keeps a stable silhouette at each LOD and bounds the close geometry cost", () => {
    for (const key of ["wall", "roof", "sign", "bronze", "pedestal"]) {
      expect(
        model.geometry.some((p) => p.key === key && p.lod === 0),
        key,
      ).toBe(true);
    }
    const triangles = model.geometry.reduce(
      (n, p) =>
        n +
        (p.geometry.index?.count ?? p.geometry.getAttribute("position").count) /
          3,
      0,
    );
    const instances = [...model.repeated.values()].reduce(
      (n, m) => n + m.length,
      0,
    );
    expect(model.geometry.length + model.repeated.size).toBeLessThanOrEqual(42);
    expect(triangles + instances * 24).toBeLessThan(180_000);
    console.info("HQ hero budget", {
      batches: model.geometry.length + model.repeated.size,
      triangles,
      instances,
      totalTriangles: triangles + instances * 24,
    });
  });
  it("bakes finite bounded geometric contact once without changing the mesh layout", () => {
    const sizes = model.geometry.map(
        (p) => p.geometry.getAttribute("position").count,
      ),
      report = bakeArchitecturalContact(model.geometry);
    expect(
      model.geometry.map((p) => p.geometry.getAttribute("position").count),
    ).toEqual(sizes);
    expect(report.samples).toBeGreaterThan(0);
    for (const p of model.geometry) {
      const values = p.geometry.getAttribute("hqContact");
      let invalid = 0;
      for (let i = 0; i < values.count; i++)
        if (!(values.getX(i) >= 0.4399)) invalid++;
      expect(invalid, p.key).toBe(0);
    }
    console.info("HQ contact bake", report);
  });
});
