import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  TERRITORY_BUILDINGS,
  TERRITORY_TREES,
} from "../data/territorialEnvironment";
import {
  architectureForBuilding,
  exteriorIdHash,
} from "../data/exteriorArchitecture";
import {
  createArchitectureGeometry,
  createArchitectureMaterial,
} from "./exteriorArchitectureGeometry";
import { createExteriorTree } from "./exteriorVegetation";
import { disposeInstancedMesh } from "./instancedMeshDisposal";

export function buildExteriorArchitectureScene() {
  const group = new THREE.Group();
  group.name = "exterior-architecture-and-vegetation";
  const material = createArchitectureMaterial();
  const foliage = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.97,
  });
  const geometries = new Map<
    string,
    {
      near: THREE.BufferGeometry;
      map: THREE.BufferGeometry;
      far: THREE.BufferGeometry;
    }
  >();
  const records = new Map<
    string,
    {
      key: string;
      trees: boolean;
      entries: {
        matrix: THREE.Matrix4;
        tint: THREE.Color;
        size: number;
        id: string;
      }[];
    }
  >();
  const assignments: { id: string; model: string }[] = [];
  const emit = (
    id: string,
    key: string,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    rotation: number,
    trees: boolean,
    tint: THREE.Color,
  ) => {
    const cell = `${Math.floor(x / 120)}:${Math.floor(z / 120)}:${key}`;
    if (!records.has(cell)) records.set(cell, { key, trees, entries: [] });
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        rotation,
      ),
      new THREE.Vector3(width, height, depth),
    );
    records
      .get(cell)!
      .entries.push({ matrix, tint, size: Math.max(width, height, depth), id });
  };
  for (const b of TERRITORY_BUILDINGS) {
    const model = architectureForBuilding(b);
    assignments.push({ id: b.id, model: model.id });
    if (!geometries.has(model.id))
      geometries.set(model.id, {
        map: createArchitectureGeometry(model, false),
        near: createArchitectureGeometry(model, true),
        far: createArchitectureGeometry(model, "far"),
      });
    const tint = new THREE.Color().setHSL(
      0.1 + (exteriorIdHash(b.id) % 7) * 0.006,
      0.055,
      0.88 + (exteriorIdHash(b.id) % 5) * 0.022,
    );
    // Same origin, yaw, plan envelope and approved roof-height envelope.
    const floorY = b.kind === "house" ? 0.01 : 0.015;
    emit(
      b.id,
      model.id,
      b.center[0],
      floorY,
      b.center[1],
      b.size[0],
      b.height +
        (b.roof === "flat" ? 0.14 : Math.min(...b.size) * 0.245) +
        0.034 -
        floorY,
      b.size[1],
      b.rotation,
      false,
      tint,
    );
  }
  TERRITORY_TREES.forEach((tree, i) => {
    const id = `territory-tree-${i}`,
      species = exteriorIdHash(id) % 3,
      key = `tree-${species}`;
    if (!geometries.has(key))
      geometries.set(key, {
        map: createExteriorTree(species, false),
        near: createExteriorTree(species, true),
        far: createExteriorTree(species, "far"),
      });
    emit(
      id,
      key,
      tree.center[0],
      -0.075,
      tree.center[1],
      tree.radius,
      tree.height,
      tree.radius,
      exteriorIdHash(id) * 0.01,
      true,
      new THREE.Color().setScalar(0.91 + (i % 7) * 0.028),
    );
  });
  const meshes: THREE.InstancedMesh[] = [];
  const farParts = new Map<string, THREE.BufferGeometry[]>();
  const cellOwners = new Map<string, THREE.InstancedMesh[]>();
  records.forEach(({ key, trees, entries }, cell) => {
    const pair = geometries.get(key)!;
    const mesh = new THREE.InstancedMesh(
      pair.map,
      trees ? foliage : material,
      entries.length,
    );
    mesh.name = `exterior-cell:${cell}`;
    mesh.raycast = () => undefined;
    entries.forEach((entry, i) => {
      mesh.setMatrixAt(i, entry.matrix);
      mesh.setColorAt(i, entry.tint);
    });
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.receiveShadow = !trees;
    mesh.userData = {
      exteriorTrees: trees,
      model: key,
      near: pair.near,
      map: pair.map,
      far: pair.far,
      lod: "map",
      projectedSize:
        entries.reduce((sum, e) => sum + e.size, 0) / entries.length,
      ids: entries.map((e) => e.id),
    };
    group.add(mesh);
    meshes.push(mesh);
    if (!trees) {
      const cellId = cell.split(":").slice(0, 2).join(":");
      if (!farParts.has(cellId)) {
        farParts.set(cellId, []);
        cellOwners.set(cellId, []);
      }
      cellOwners.get(cellId)!.push(mesh);
      entries.forEach((entry) => {
        const geometry = pair.far.clone().applyMatrix4(entry.matrix),
          colors = geometry.getAttribute("color");
        for (let i = 0; i < colors.count; i++)
          colors.setXYZ(
            i,
            colors.getX(i) * entry.tint.r,
            colors.getY(i) * entry.tint.g,
            colors.getZ(i) * entry.tint.b,
          );
        farParts.get(cellId)!.push(geometry);
      });
    }
  });
  const farCells: { mesh: THREE.Mesh; owners: THREE.InstancedMesh[] }[] = [];
  farParts.forEach((parts, id) => {
    const geometry = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `exterior-far-cell:${id}`;
    mesh.raycast = () => undefined;
    mesh.visible = false;
    group.add(mesh);
    farCells.push({ mesh, owners: cellOwners.get(id)! });
  });
  group.userData = {
    presentationOnly: true,
    selectable: false,
    assignments,
    modelsUsed: [...new Set(assignments.map((a) => a.model))].sort(),
  };
  return {
    group,
    meshes,
    farCells,
    assignments,
    dispose: () => {
      farCells.forEach((cell) => cell.mesh.geometry.dispose());
      meshes.forEach(disposeInstancedMesh);
      geometries.forEach((p) => {
        p.map.dispose();
        p.near.dispose();
        p.far.dispose();
      });
      material.dispose();
      foliage.dispose();
    },
  };
}

export function updateExteriorLod(
  meshes: readonly THREE.InstancedMesh[],
  camera: THREE.Camera,
  viewportHeight: number,
  reduced: boolean,
  treesVisible: boolean,
  farCells: readonly { mesh: THREE.Mesh; owners: THREE.InstancedMesh[] }[] = [],
) {
  const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 45;
  const pixelsPerUnit =
    viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  for (const mesh of meshes) {
    const data = mesh.userData;
    const distance = Math.max(
      1,
      camera.position.distanceTo(mesh.boundingSphere!.center) -
        mesh.boundingSphere!.radius * 0.55,
    );
    const projected = (data.projectedSize * pixelsPerUnit) / distance;
    const threshold = data.exteriorTrees
      ? reduced
        ? 95
        : 70
      : reduced
        ? 100
        : 72;
    const near =
      projected > (data.lod === "near" ? threshold * 0.78 : threshold);
    const far =
      projected <
      (data.exteriorTrees
        ? data.lod === "far"
          ? 43
          : 34
        : data.lod === "far"
          ? 21
          : 16);
    const lod = near ? "near" : far ? "far" : "map";
    if (lod !== data.lod) {
      mesh.geometry = data[lod];
      data.lod = lod;
    }
    mesh.visible = !data.exteriorTrees || treesVisible;
    mesh.castShadow = !reduced && !data.exteriorTrees && distance < 40;
  }
  for (const cell of farCells) {
    const far = cell.owners.every((mesh) => mesh.userData.lod === "far");
    cell.mesh.visible = far;
    cell.owners.forEach((mesh) => {
      mesh.visible = !far;
    });
  }
}
