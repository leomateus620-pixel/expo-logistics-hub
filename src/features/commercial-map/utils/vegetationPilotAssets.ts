import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pilotRandom } from "./vegetationPilot";

/** Bounded stationary twig cards with a shared alpha-tested leaf atlas; no blend sorting or billboards. */
function foliageGeometry(
  centers: THREE.Vector3[],
  random: () => number,
  count: number,
  family: number,
) {
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [],
    indices: number[] = [],
    leafCenters: number[] = [],
    uvs: number[] = [];
  const tint = new THREE.Color();
  const palettes = ["#6b8748", "#759450", "#5e804c"];
  const normal = new THREE.Vector3(),
    axis = new THREE.Vector3(),
    side = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const c = centers[i % centers.length];
    const phi = random() * Math.PI * 2,
      y = random() * 2 - 1,
      radius = Math.cbrt(random());
    const ring = Math.sqrt(1 - y * y) * radius;
    const center = new THREE.Vector3(
      c.x + Math.cos(phi) * ring * 0.39,
      c.y + y * radius * 0.37,
      c.z + Math.sin(phi) * ring * 0.39,
    );
    const angle = random() * Math.PI * 2;
    axis
      .set(Math.cos(angle), (random() - 0.5) * 2.8, Math.sin(angle))
      .normalize();
    side.set(-axis.z, (random() - 0.5) * 1.5, axis.x).normalize();
    const length = (0.24 + random() * 0.16) * (family === 1 ? 0.9 : 1);
    const width = length * (0.5 + random() * 0.16);
    // Atlas contains sixteen individually shaded leaves along a curved twig.
    const leaf = [
      [-0.5, 0, -0.5],
      [-0.5, 0, 0.5],
      [0.5, 0.012, -0.5],
      [0.5, 0.012, 0.5],
    ];
    const base = positions.length / 3;
    normal
      .set(center.x * 0.5, 0.65 + (center.y - 2.6) * 0.35, center.z * 0.5)
      .normalize();
    tint
      .set(palettes[family])
      .offsetHSL(
        (random() - 0.5) * 0.035,
        (random() - 0.5) * 0.08,
        (random() - 0.5) * 0.1,
      );
    tint.multiplyScalar(
      0.82 + THREE.MathUtils.clamp((center.y - 1.4) / 2, 0, 1) * 0.24,
    );
    for (const [along, lift, across] of leaf) {
      positions.push(
        center.x + axis.x * along * length + side.x * across * width,
        center.y + axis.y * along * length + lift,
        center.z + axis.z * along * length + side.z * across * width,
      );
      normals.push(normal.x, normal.y, normal.z);
      leafCenters.push(center.x, center.y, center.z);
      uvs.push(across + 0.5, along + 0.5);
      colors.push(tint.r, tint.g, tint.b);
    }
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute(
    "pilotLeafCenter",
    new THREE.Float32BufferAttribute(leafCenters, 3),
  );
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

function branch(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  random: () => number,
) {
  const delta = end.clone().sub(start),
    length = delta.length();
  const geometry = new THREE.CylinderGeometry(
    radius * 0.28,
    radius,
    length,
    radius > 0.09 ? 9 : radius > 0.03 ? 7 : 5,
    radius > 0.09 ? 4 : radius > 0.03 ? 2 : 1,
  );
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const t = (position.getY(i) + length / 2) / length;
    const ridges =
      1 + Math.sin(Math.atan2(position.getZ(i), position.getX(i)) * 7) * 0.1;
    position.setXYZ(
      i,
      position.getX(i) * ridges + Math.sin(t * Math.PI) * radius * 0.45,
      position.getY(i),
      position.getZ(i) * ridges,
    );
  }
  geometry.computeVertexNormals();
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.normalize(),
    ),
  );
  geometry.translate(
    (start.x + end.x) / 2,
    (start.y + end.y) / 2,
    (start.z + end.z) / 2,
  );
  const color = new THREE.Color("#746550").multiplyScalar(
    0.86 + random() * 0.24,
  );
  geometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(
      Array.from({ length: position.count }, () => [
        color.r,
        color.g,
        color.b,
      ]).flat(),
      3,
    ),
  );
  return geometry;
}

export function createPilotTreeAsset(family: number) {
  const random = pilotRandom(3107 + family * 1997),
    wood: THREE.BufferGeometry[] = [],
    centers: THREE.Vector3[] = [];
  const origin = new THREE.Vector3(),
    fork = new THREE.Vector3(0.06, 1.35, 0.035);
  wood.push(branch(origin, fork, 0.14, random));
  for (let i = 0; i < 5; i++) {
    const angle = i * 2.399 + random() * 0.4;
    wood.push(
      branch(
        new THREE.Vector3(
          Math.cos(angle) * 0.25,
          0.012,
          Math.sin(angle) * 0.25,
        ),
        new THREE.Vector3(0, 0.3, 0),
        0.052,
        random,
      ),
    );
  }
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.399 + random() * 0.55;
    const spread =
      (i < 6 ? 0.65 : 0.37) * (family === 1 ? 1.12 : family === 2 ? 0.92 : 1);
    const end = new THREE.Vector3(
      Math.cos(angle) * spread,
      2.15 + random() * 0.55 + (i >= 6 ? 0.38 : 0),
      Math.sin(angle) * spread,
    );
    const start = fork.clone().add(new THREE.Vector3(0, i * 0.036, 0));
    wood.push(branch(start, end, 0.065 - (i / 9) * 0.02, random));
    for (let j = 0; j < 2; j++) {
      const tip = end
        .clone()
        .add(
          new THREE.Vector3(
            (random() - 0.5) * 0.47,
            0.14 + random() * 0.28,
            (random() - 0.5) * 0.47,
          ),
        );
      centers.push(tip);
      wood.push(branch(end, tip, 0.018, random));
    }
  }
  const trunk = mergeGeometries(wood);
  wood.forEach((g) => g.dispose());
  trunk.computeBoundingSphere();
  const core = foliageGeometry(
    centers,
    random,
    family === 1 ? 280 : 400,
    family,
  );
  const detail = foliageGeometry(centers, random, 96, family);
  return {
    trunk,
    core,
    detail,
    dispose: () => {
      trunk.dispose();
      core.dispose();
      detail.dispose();
    },
  };
}

export function createPilotGrassGeometry() {
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const random = pilotRandom(97631),
    color = new THREE.Color();
  for (let i = 0; i < 5; i++) {
    const angle = random() * Math.PI * 2,
      x = (random() - 0.5) * 0.1,
      z = (random() - 0.5) * 0.1;
    const height = 0.035 + random() * 0.065,
      width = 0.005 + random() * 0.008,
      bend = 0.025 + random() * 0.025;
    const dx = Math.cos(angle),
      dz = Math.sin(angle),
      base = positions.length / 3;
    positions.push(
      x - dz * width,
      0,
      z + dx * width,
      x + dz * width,
      0,
      z - dx * width,
      x + dx * bend - dz * width * 0.6,
      height * 0.55,
      z + dz * bend + dx * width * 0.6,
      x + dx * bend + dz * width * 0.6,
      height * 0.55,
      z + dz * bend - dx * width * 0.6,
      x + dx * bend * 1.8,
      height,
      z + dz * bend * 1.8,
    );
    color.set(i % 5 === 0 ? "#9a925a" : "#67814a");
    for (let j = 0; j < 5; j++) {
      const value = color
        .clone()
        .multiplyScalar(j < 2 ? 0.62 : j === 4 ? 1.15 : 0.9);
      colors.push(value.r, value.g, value.b);
    }
    indices.push(
      base,
      base + 1,
      base + 2,
      base + 1,
      base + 3,
      base + 2,
      base + 2,
      base + 3,
      base + 4,
    );
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  // Keep the complete bent tuft inside the 0.065-unit exclusion margin.
  g.scale(0.35, 0.55, 0.35);
  g.computeBoundingSphere();
  return g;
}
