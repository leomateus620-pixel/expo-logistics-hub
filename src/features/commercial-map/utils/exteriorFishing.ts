import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  TERRITORY_PATCHES,
  TERRITORY_BUILDINGS,
  TERRITORY_TREES,
  territoryContainsPoint,
} from "../data/territorialEnvironment";
import { territoryRoadClearance } from "./territorialRoadGeometry";

const ponds = TERRITORY_PATCHES.filter((p) => p.kind === "water");
function bankPoint(
  pond: (typeof ponds)[number],
  edge: number,
  t: number,
  offset: number,
) {
  const a = pond.ring[edge],
    b = pond.ring[(edge + 1) % pond.ring.length];
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    length = Math.hypot(dx, dz);
  const p: [number, number] = [
    a[0] + dx * t - (dz / length) * offset,
    a[1] + dz * t + (dx / length) * offset,
  ];
  if (territoryContainsPoint(p, pond.ring))
    return [
      a[0] + dx * t + (dz / length) * offset,
      a[1] + dz * t - (dx / length) * offset,
    ] as [number, number];
  return p;
}
export const EXTERIOR_FISHERS = Object.freeze(
  [
    [0, 0, 0.35],
    [0, 0, 0.73],
    [1, 0, 0.48],
    [1, 4, 0.53],
    [2, 3, 0.52],
  ].map(([pondIndex, edge, t], i) => {
    const pond = ponds[pondIndex],
      position = bankPoint(pond, edge, t, 0.23);
    const a = pond.ring[edge],
      b = pond.ring[(edge + 1) % pond.ring.length];
    const shore = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    return {
      id: `fisher-${i + 1}`,
      pondId: pond.id,
      position,
      rotation: Math.atan2(shore[0] - position[0], shore[1] - position[1]),
      groundY: 0.015,
    };
  }),
);

/** Scale is 0.15 world units/metre, matching the adjacent residential district. */
export function buildExteriorFishingScene() {
  const group = new THREE.Group();
  group.name = "five-seated-fishers";
  const resources: THREE.BufferGeometry[] = [];
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
  });
  const reedsMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
  });
  const colored = (g: THREE.BufferGeometry, hex: string) => {
    const geometry = g.index ? g.toNonIndexed() : g;
    if (geometry !== g) g.dispose();
    geometry.deleteAttribute("uv");
    const color = new THREE.Color(hex),
      colors: number[] = [];
    for (let i = 0; i < geometry.getAttribute("position").count; i++)
      colors.push(color.r, color.g, color.b);
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  };
  EXTERIOR_FISHERS.forEach((f, i) => {
    const parts: THREE.BufferGeometry[] = [];
    const box = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      c: string,
    ) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, y, z);
      parts.push(colored(g, c));
    };
    const limb = (a: number[], b: number[], radius: number, c: string) => {
      const av = new THREE.Vector3(...a),
        bv = new THREE.Vector3(...b),
        g = new THREE.CylinderGeometry(
          radius * 0.85,
          radius,
          av.distanceTo(bv),
          5,
        );
      g.applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          bv.clone().sub(av).normalize(),
        ),
      );
      g.translate(...av.add(bv).multiplyScalar(0.5).toArray());
      parts.push(colored(g, c));
    };
    const shirt = ["#797b64", "#63777d", "#957760", "#747268", "#7d6960"][i],
      skin = ["#bd967b", "#a57c61", "#c6a087"][i % 3];
    box(0, 0.07, 0, 0.077, 0.01, 0.069, "#77765e");
    box(0, 0.114, -0.029, 0.077, 0.067, 0.012, "#77765e");
    for (const x of [-0.031, 0.031])
      for (const z of [-0.026, 0.027])
        limb([x, 0, z], [x, 0.072, z], 0.004, "#525d59");
    limb([0, 0.084, 0.0], [-0.008, 0.138, 0.016], 0.026, shirt);
    const head = new THREE.SphereGeometry(0.018, 8, 6);
    head.scale(0.88, 1.18, 1);
    head.translate(-0.008, 0.169, 0.019);
    parts.push(colored(head, skin));
    const hat = new THREE.CylinderGeometry(0.024, 0.025, 0.008, 9);
    hat.translate(-0.008, 0.188, 0.019);
    parts.push(colored(hat, "#ab9d7b"));
    for (const side of [-1, 1]) {
      limb(
        [side * 0.018, 0.084, 0.005],
        [side * 0.024, 0.079, 0.065],
        0.013,
        "#525d64",
      );
      limb(
        [side * 0.024, 0.079, 0.065],
        [side * 0.024, 0.015, 0.076],
        0.011,
        "#525d64",
      );
      box(side * 0.024, 0.011, 0.086, 0.023, 0.018, 0.036, "#454b46");
      limb(
        [side * 0.025, 0.13, 0.016],
        [side * 0.036, 0.102, 0.044],
        0.009,
        shirt,
      );
      limb(
        [side * 0.036, 0.102, 0.044],
        [0.019 + side * 0.01, 0.11, 0.082],
        0.007,
        skin,
      );
    }
    limb([0.013, 0.107, 0.065], [0.025, 0.32, 0.46], 0.0018, "#6c6852");
    limb([0.025, 0.32, 0.46], [0.025, -0.04, 0.58], 0.0007, "#929c89");
    const float = new THREE.SphereGeometry(0.003, 5, 4);
    float.translate(0.025, -0.037, 0.58);
    parts.push(colored(float, "#bd7653"));
    const geometry = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    resources.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = f.id;
    mesh.position.set(f.position[0], f.groundY, f.position[1]);
    mesh.rotation.y = f.rotation;
    mesh.raycast = () => undefined;
    mesh.userData = { presentationOnly: true, pondId: f.pondId, seated: true };
    group.add(mesh);
  });
  const reeds: THREE.BufferGeometry[] = [];
  ponds.forEach((pond) =>
    pond.ring.forEach((_, edge) => {
      for (let n = 0; n < 4; n++) {
        const p = bankPoint(pond, edge, (n + 0.4) / 4, 0.12 + (n % 2) * 0.13);
        if (
          EXTERIOR_FISHERS.some(
            (f) =>
              Math.hypot(f.position[0] - p[0], f.position[1] - p[1]) < 0.65,
          )
        )
          continue;
        if (
          territoryRoadClearance(p) < 0.4 ||
          TERRITORY_BUILDINGS.some(
            (b) =>
              Math.hypot(b.center[0] - p[0], b.center[1] - p[1]) <
              Math.hypot(...b.size) / 2 + 0.3,
          )
        )
          continue;
        if (
          TERRITORY_TREES.some(
            (t) =>
              Math.hypot(t.center[0] - p[0], t.center[1] - p[1]) <
              t.radius * 0.5,
          )
        )
          continue;
        if (
          !TERRITORY_PATCHES.some(
            (patch) =>
              patch.id === "bathing-open-space" &&
              territoryContainsPoint(p, patch.ring),
          )
        )
          continue;
        for (let blade = 0; blade < 5; blade++) {
          const angle = blade * 2.399,
            dx = Math.cos(angle) * 0.05,
            dz = Math.sin(angle) * 0.05,
            h = 0.065 + blade * 0.016;
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(
              [
                p[0] + dx - 0.007,
                0.015,
                p[1] + dz,
                p[0] + dx + 0.007,
                0.015,
                p[1] + dz,
                p[0] + dx * 1.7,
                h,
                p[1] + dz * 1.7,
                p[0] + dx,
                0.015,
                p[1] + dz - 0.007,
                p[0] + dx * 1.7,
                h,
                p[1] + dz * 1.7,
                p[0] + dx,
                0.015,
                p[1] + dz + 0.007,
              ],
              3,
            ),
          );
          geometry.computeVertexNormals();
          reeds.push(colored(geometry, blade % 2 ? "#7f8755" : "#636e45"));
        }
      }
    }),
  );
  const bankGeometry = mergeGeometries(reeds);
  reeds.forEach((g) => g.dispose());
  resources.push(bankGeometry);
  const bank = new THREE.Mesh(bankGeometry, reedsMaterial);
  bank.name = "pond-bank-sedges";
  bank.raycast = () => undefined;
  group.add(bank);
  return {
    group,
    dispose: () => {
      resources.forEach((g) => g.dispose());
      material.dispose();
      reedsMaterial.dispose();
    },
  };
}
