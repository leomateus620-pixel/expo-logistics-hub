import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  TERRITORY_BUILDINGS,
  TERRITORY_PATCHES,
  TERRITORY_TREES,
} from "../../data/territorialEnvironment";
import polygonClipping, { type MultiPolygon } from "polygon-clipping";
import {
  corridorPolygon,
  sampleTerritoryRoad,
  UNIFIED_TERRITORY_ROADS,
  territoryPolygonGeometry,
  territorySurfaceSkirt,
  territoryRoadClearance,
} from "../../utils/territorialRoadGeometry";
import { disposeInstancedMesh } from "../../utils/instancedMeshDisposal";
import { useCommercialMapStore } from "../../state/useCommercialMapStore";

import {
  buildExteriorArchitectureScene,
  updateExteriorLod,
} from "../../utils/exteriorArchitectureScene";
import {
  createExteriorGroundMaterial,
  createExteriorWaterMaterial,
  finishExteriorPatch,
} from "../../utils/exteriorSurfaceMaterials";
import { buildExteriorFishingScene } from "../../utils/exteriorFishing";

const NO_RAYCAST = () => undefined;
interface Instance {
  position: [number, number, number];
  scale: [number, number, number];
  rotation: number;
  color: string;
}
function buildTerritorialScene() {
  const group = new THREE.Group();
  group.name = "territorial-environment";
  const box = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.93,
    metalness: 0,
  });
  const yardMaterial = createExteriorGroundMaterial(true);
  const shrub = new THREE.IcosahedronGeometry(1, 1);
  const geometries = { box, shrub };
  const batches = new Map<
    string,
    {
      geometry: THREE.BufferGeometry;
      instances: Instance[];
      cell: THREE.Group;
      detail: boolean;
      trees: boolean;
    }
  >();
  const cells = new Map<string, THREE.Group>();
  const emit = (
    key: string,
    geometry: THREE.BufferGeometry,
    instance: Instance,
    detail = false,
    trees = false,
  ) => {
    const cellId = `${Math.floor(instance.position[0] / 55)}:${Math.floor(instance.position[2] / 55)}`;
    let cell = cells.get(cellId);
    if (!cell) {
      cell = new THREE.Group();
      cell.name = `territory-cell-${cellId}`;
      cells.set(cellId, cell);
      group.add(cell);
    }
    const id = `${cellId}:${key}`;
    if (!batches.has(id))
      batches.set(id, { geometry, instances: [], cell, detail, trees });
    batches.get(id)!.instances.push(instance);
  };
  TERRITORY_BUILDINGS.forEach((b, i) => {
    const [x, z] = b.center,
      [w, d] = b.size;
    const offset = (
      ox: number,
      oz: number,
      y: number,
    ): [number, number, number] => [
      x + ox * Math.cos(b.rotation) + oz * Math.sin(b.rotation),
      y,
      z - ox * Math.sin(b.rotation) + oz * Math.cos(b.rotation),
    ];
    if (b.kind === "house") {
      const planted = offset(-w * 0.53, d * 0.66, 0.1);
      if (
        territoryRoadClearance([planted[0], planted[2]]) > 0.3 &&
        !TERRITORY_TREES.some(
          (t) =>
            Math.hypot(t.center[0] - planted[0], t.center[1] - planted[2]) <
            t.radius * 0.6,
        ) &&
        !TERRITORY_BUILDINGS.some(
          (other) =>
            other !== b &&
            Math.hypot(
              other.center[0] - planted[0],
              other.center[1] - planted[2],
            ) <
              Math.hypot(...other.size) / 2 + 0.2,
        )
      ) {
        emit(
          "garden-shrubs",
          shrub,
          {
            position: planted,
            scale: [0.15, 0.1, 0.2],
            rotation: b.rotation,
            color: i % 3 ? "#65754b" : "#7a8053",
          },
          true,
          true,
        );
      }
      emit("garden", box, {
        position: offset(0, 0.25, -0.035),
        scale: [w * 1.4, 0.09, d * 1.6],
        rotation: b.rotation,
        color: i % 2 ? "#7e895e" : "#899367",
      });
      emit("driveway", box, {
        position: offset(0, -(d / 2 + 2.6) / 2, -0.025),
        scale: [0.48, 0.11, Math.max(0.1, 2.6 - d / 2)],
        rotation: b.rotation,
        color: "#999381",
      });
      emit(
        "garden-wall",
        box,
        {
          position: offset(w * 0.67, 0.2, 0.07),
          scale: [0.05, 0.3, d * 1.55],
          rotation: b.rotation,
          color: "#a69c83",
        },
        true,
      );
      emit(
        "garden-wall",
        box,
        {
          position: offset(0, d * 0.82, 0.07),
          scale: [w * 1.35, 0.3, 0.05],
          rotation: b.rotation,
          color: "#a69c83",
        },
        true,
      );
      emit("yard", box, {
        position: offset(0, -d * 0.65, -0.0275),
        scale: [w * 1.08, 0.105, d * 0.35],
        rotation: b.rotation,
        color: "#918a78",
      });
    }
  });
  const meshes: THREE.InstancedMesh[] = [];
  const matrix = new THREE.Matrix4(),
    quaternion = new THREE.Quaternion(),
    axis = new THREE.Vector3(0, 1, 0);
  batches.forEach(({ geometry, instances, cell, detail, trees }, key) => {
    const mesh = new THREE.InstancedMesh(
      geometry,
      key.endsWith(":garden") ? yardMaterial : material,
      instances.length,
    );
    mesh.raycast = NO_RAYCAST;
    instances.forEach((v, i) => {
      matrix.compose(
        new THREE.Vector3(...v.position),
        quaternion.setFromAxisAngle(axis, v.rotation),
        new THREE.Vector3(...v.scale),
      );
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, new THREE.Color(v.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.computeBoundingBox();
    mesh.userData.territoryDetail = detail;
    mesh.userData.territoryTrees = trees;
    mesh.receiveShadow = !trees;
    cell.add(mesh);
    meshes.push(mesh);
  });
  const grounds: THREE.BufferGeometry[] = [];
  const water: THREE.BufferGeometry[] = [];
  const groundRoads = UNIFIED_TERRITORY_ROADS.map((r) => ({
    road: r,
    points: sampleTerritoryRoad(r),
  }));
  const orderedPatches = [...TERRITORY_PATCHES].sort((a, b) => {
    const rank = (p: typeof a) =>
      p.kind === "water"
        ? 3
        : p.id.startsWith("shed-yard") || p.id === "bathing-sports-earth"
          ? 2
          : 0;
    return rank(a) - rank(b);
  });
  orderedPatches.forEach((p, patchIndex) => {
    const ring = p.ring.map((v) => [v[0], v[1]] as [number, number]);
    ring.push([...ring[0]]);
    let polygon: MultiPolygon = [[ring]];
    if (p.kind !== "water") {
      const later = orderedPatches
        .slice(patchIndex + 1)
        .map((p) => [[p.ring.map((v) => [v[0], v[1]])]] as MultiPolygon);
      const minX = Math.min(...ring.map((p) => p[0])) - 2,
        maxX = Math.max(...ring.map((p) => p[0])) + 2,
        minZ = Math.min(...ring.map((p) => p[1])) - 2,
        maxZ = Math.max(...ring.map((p) => p[1])) + 2;
      const roads = groundRoads
        .filter(
          ({ points }) =>
            Math.min(...points.map((p) => p[0])) < maxX &&
            Math.max(...points.map((p) => p[0])) > minX &&
            Math.min(...points.map((p) => p[1])) < maxZ &&
            Math.max(...points.map((p) => p[1])) > minZ,
        )
        .map(({ road, points }) =>
          corridorPolygon(points, road.width + road.shoulder * 2),
        );
      polygon = polygonClipping.difference(polygon, ...later, ...roads);
    }
    let geometry = territoryPolygonGeometry(
      polygon,
      p.kind === "water" ? -0.025 : 0.015,
    );
    if (!geometry.getAttribute("position")) {
      geometry.dispose();
      return;
    }
    if (p.kind !== "water") {
      const skirt = territorySurfaceSkirt(polygon, 0.015, -0.081),
        top = geometry.toNonIndexed();
      const joined = mergeGeometries([top, skirt]);
      top.dispose();
      skirt.dispose();
      geometry.dispose();
      geometry = joined;
    }
    if (p.kind !== "water") geometry = finishExteriorPatch(geometry, p);
    (p.kind === "water" ? water : grounds).push(geometry);
  });
  const ground = mergeGeometries(grounds),
    ponds = mergeGeometries(water);
  grounds.forEach((g) => g.dispose());
  water.forEach((g) => g.dispose());
  return {
    group,
    meshes,
    ground,
    ponds,
    dispose: () => {
      meshes.forEach(disposeInstancedMesh);
      Object.values(geometries).forEach((g) => g.dispose());
      material.dispose();
      yardMaterial.dispose();
      ground.dispose();
      ponds.dispose();
    },
  };
}

export const TerritorialEnvironment = memo(function TerritorialEnvironment({
  reducedGraphics = false,
  vegetationVisible = true,
}: {
  reducedGraphics?: boolean;
  vegetationVisible?: boolean;
}) {
  const treesVisible = useCommercialMapStore((s) => s.treesVisible);
  const lastDiagnostic = useRef(-1);
  const renderer = useThree((state) => state.gl);
  const viewportHeight = useThree((state) => state.size.height);
  const architecture = useMemo(buildExteriorArchitectureScene, []);
  const fishing = useMemo(buildExteriorFishingScene, []);
  const groundMaterial = useMemo(() => createExteriorGroundMaterial(), []);
  const water = useMemo(
    () =>
      createExteriorWaterMaterial(
        TERRITORY_PATCHES.filter((p) => p.kind === "water"),
      ),
    [],
  );
  const plan = useMemo(buildTerritorialScene, []);
  useEffect(() => () => plan.dispose(), [plan]);
  useEffect(
    () => () => {
      architecture.dispose();
      fishing.dispose();
      groundMaterial.dispose();
      water.material.dispose();
    },
    [architecture, fishing, groundMaterial, water],
  );
  useFrame(({ camera, clock }) => {
    if (
      import.meta.env.DEV &&
      Math.floor(clock.elapsedTime) !== lastDiagnostic.current
    ) {
      lastDiagnostic.current = Math.floor(clock.elapsedTime);
      renderer.domElement.dataset.exteriorReport = JSON.stringify({
        buildings: TERRITORY_BUILDINGS.length,
        trees: TERRITORY_TREES.length,
        used: architecture.group.userData.modelsUsed,
        groundTriangles: plan.ground.getAttribute("position").count / 3,
        architectures: architecture.meshes
          .filter((m) => !m.userData.exteriorTrees)
          .reduce(
            (s, m) =>
              s + (m.geometry.getAttribute("position").count / 3) * m.count,
            0,
          ),
        vegetation: architecture.meshes
          .filter((m) => m.userData.exteriorTrees)
          .reduce(
            (s, m) =>
              s + (m.geometry.getAttribute("position").count / 3) * m.count,
            0,
          ),
        draws: architecture.meshes.length,
        lods: architecture.meshes.reduce(
          (s, m) => {
            s[m.userData.lod] = (s[m.userData.lod] ?? 0) + 1;
            return s;
          },
          {} as Record<string, number>,
        ),
      });
    }
    // Demand-rendered ripples share the existing frame; no perpetual invalidation.
    water.time.value = clock.elapsedTime;
    updateExteriorLod(
      architecture.meshes,
      camera,
      viewportHeight,
      reducedGraphics,
      vegetationVisible && treesVisible,
      architecture.farCells,
    );
    plan.meshes.forEach((mesh) => {
      const sphere = mesh.boundingSphere;
      if (!sphere) return;
      const distance =
        camera.position.distanceTo(sphere.center) - sphere.radius;
      const range = reducedGraphics ? 45 : 95;
      if (mesh.userData.territoryDetail)
        mesh.visible = distance < (mesh.visible ? range + 12 : range);
      if (mesh.userData.territoryTrees && (!vegetationVisible || !treesVisible))
        mesh.visible = false;
      else if (mesh.userData.territoryTrees && !mesh.userData.territoryDetail)
        mesh.visible = true;
      mesh.castShadow =
        !reducedGraphics &&
        !mesh.userData.territoryTrees &&
        !mesh.userData.territoryDetail &&
        distance < 42;
    });
  });
  return (
    <group name="territorial-environment-layer">
      <primitive object={plan.group} />
      <primitive object={architecture.group} />
      <primitive object={fishing.group} />
      <mesh
        geometry={plan.ground}
        raycast={NO_RAYCAST}
        receiveShadow
        dispose={null}
      >
        <primitive object={groundMaterial} attach="material" />
      </mesh>
      <mesh geometry={plan.ponds} raycast={NO_RAYCAST} dispose={null}>
        <primitive object={water.material} attach="material" />
      </mesh>
    </group>
  );
});
