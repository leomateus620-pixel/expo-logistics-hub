import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
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
} from "../../utils/territorialRoadGeometry";
import { disposeInstancedMesh } from "../../utils/instancedMeshDisposal";
import { useCommercialMapStore } from "../../state/useCommercialMapStore";

// World-space variation avoids repeated texture tiles and remains filtered at distance.
function finishGround(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader =
    "varying vec2 vTerritoryGround;\n" + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace(
    "#include <begin_vertex>",
    "#include <begin_vertex>\nvTerritoryGround = position.xz;",
  );
  shader.fragmentShader =
    "varying vec2 vTerritoryGround;\n" + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <color_fragment>",
    `#include <color_fragment>
    float broad = sin(vTerritoryGround.x * .13 + sin(vTerritoryGround.y * .09)) * sin(vTerritoryGround.y * .19);
    float fine = sin(vTerritoryGround.x * 1.7) * sin(vTerritoryGround.y * 1.3);
    float filtering = 1.0 - smoothstep(.2, 1.0, length(fwidth(vTerritoryGround)));
    diffuseColor.rgb *= .97 + broad * .08 + fine * .035 * filtering;
  `,
  );
}
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
  const roofShape = new THREE.Shape([
    new THREE.Vector2(-0.5, 0),
    new THREE.Vector2(0.5, 0),
    new THREE.Vector2(0, 0.35),
  ]);
  const gable = new THREE.ExtrudeGeometry(roofShape, {
    depth: 1,
    bevelEnabled: false,
  });
  gable.translate(0, 0, -0.5);
  const hip = new THREE.ConeGeometry(Math.SQRT1_2, 0.35, 4);
  hip.rotateY(Math.PI / 4);
  hip.translate(0, 0.175, 0);
  const canopy = new THREE.IcosahedronGeometry(1, 1),
    trunk = new THREE.CylinderGeometry(0.08, 0.12, 1, 5);
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.93,
    metalness: 0,
  });
  const leaf = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  const geometries = { box, gable, hip, canopy, trunk };
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
    emit("walls", box, {
      position: [x, b.height / 2 - 0.023, z],
      scale: [w, b.height + 0.114, d],
      rotation: b.rotation,
      color: b.wall,
    });
    emit(b.roof, b.roof === "gable" ? gable : b.roof === "hip" ? hip : box, {
      position: [x, 0.034 + b.height + (b.roof === "flat" ? 0.07 : 0), z],
      scale: [
        w * 1.08,
        b.roof === "flat" ? 0.14 : Math.min(w, d) * 0.7,
        d * 1.08,
      ],
      rotation: b.rotation,
      color: b.color,
    });
    const face = d / 2 + 0.012;
    // Doors and two window strips remain a single instanced batch per spatial cell.
    emit(
      "details",
      box,
      {
        position: [
          x - Math.sin(b.rotation) * face,
          0.034 + b.height * 0.57,
          z - Math.cos(b.rotation) * face,
        ],
        scale: [w * 0.57, b.height * 0.23, 0.028],
        rotation: b.rotation,
        color: "#444d49",
      },
      true,
    );
    if (b.kind === "house" && i % 4 === 0)
      emit(
        "porch",
        box,
        {
          position: offset(0, -d / 2 - 0.32, 0),
          scale: [w * 0.56, 0.16, 0.6],
          rotation: b.rotation,
          color: "#aea28b",
        },
        true,
      );
    if (b.kind === "house") {
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
  TERRITORY_TREES.forEach((t) => {
    emit(
      "canopy",
      canopy,
      {
        position: [t.center[0], t.height * 0.7, t.center[1]],
        scale: [t.radius, t.height * 0.43, t.radius * 0.87],
        rotation: 0,
        color: t.color,
      },
      false,
      true,
    );
    emit(
      "trunk",
      trunk,
      {
        position: [t.center[0], t.height * 0.25 - 0.04, t.center[1]],
        scale: [1, t.height * 0.5 + 0.08, 1],
        rotation: 0,
        color: "#675844",
      },
      true,
      true,
    );
  });
  const meshes: THREE.InstancedMesh[] = [];
  const matrix = new THREE.Matrix4(),
    quaternion = new THREE.Quaternion(),
    axis = new THREE.Vector3(0, 1, 0);
  batches.forEach(({ geometry, instances, cell, detail, trees }) => {
    const mesh = new THREE.InstancedMesh(
      geometry,
      trees ? leaf : material,
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
    const color = new THREE.Color(p.color),
      colors = [];
    for (let i = 0; i < geometry.getAttribute("position").count; i++)
      colors.push(color.r, color.g, color.b);
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
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
      leaf.dispose();
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
  const plan = useMemo(buildTerritorialScene, []),
    last = useRef(0);
  useEffect(() => () => plan.dispose(), [plan]);
  useFrame(({ camera, clock }) => {
    if (clock.elapsedTime - last.current < 0.3) return;
    last.current = clock.elapsedTime;
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
      <mesh
        geometry={plan.ground}
        raycast={NO_RAYCAST}
        receiveShadow
        dispose={null}
      >
        <meshStandardMaterial
          vertexColors

          roughness={1}
          metalness={0}
        />
      </mesh>
      <mesh geometry={plan.ponds} raycast={NO_RAYCAST} dispose={null}>
        <meshStandardMaterial vertexColors roughness={0.52} metalness={0} />
      </mesh>
    </group>
  );
});
