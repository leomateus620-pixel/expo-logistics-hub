import * as THREE from "three";
import { FENASOJA_COMPLEX as SPEC } from "../../../data/fenasojaComplexReconstruction";
import type { GeometryBuilder, V3 } from "./geometry";

/** Closed sculptural shell. Three seed chambers follow the real photo,
 * not the five seeds in the generated concept. Dimensions are estimated metres. */
export function buildSoybeanMonument(b: GeometryBuilder) {
  const h = SPEC.headquarters.monument;
  const [mx, mz] = h.position;
  const mp = ([x, y, z]: V3): V3 => [
    mx + x * Math.cos(h.yaw) + z * Math.sin(h.yaw),
    y + 0.1,
    mz - x * Math.sin(h.yaw) + z * Math.cos(h.yaw),
  ];
  b.lathe(
    "pedestal",
    [
      [0, 0],
      [1.17, 0],
      [1.2, 0.025],
      [1.2, 0.32],
      [1.19, 0.355],
      [1.15, 0.37],
      [1.11, 0.355],
      [1.1, 0.32],
      [1.1, 0.28],
      [0, 0.28],
    ],
    mp([0, 0, 0]),
    64,
  );
  b.put(
    "soil",
    new THREE.CylinderGeometry(1.105, 1.105, 0.045, 48),
    mp([0, 0.3, 0]),
  );
  b.lathe(
    "pedestal",
    [
      [0, 0],
      [0.395, 0],
      [0.415, 0.035],
      [0.415, 0.075],
      [0.38, 0.55],
      [0.36, 0.575],
      [0, 0.575],
    ],
    mp([0, 0.34, 0]),
    40,
  );
  b.bevel("bronze", mp([0, 0.67, 0.398]), [0.33, 0.245, 0.013], 0.01, [
    0,
    h.yaw,
    0,
  ]);
  b.bevel("pedestal", mp([0, 0.67, 0.408]), [0.305, 0.22, 0.008], 0.007, [
    0,
    h.yaw,
    0,
  ]);
  // Blank plaque, four fasteners: no invented inscription.
  b.detail(2);
  for (const x of [-0.139, 0.139])
    for (const y of [0.577, 0.763])
      b.sphere("bronze", mp([x, y, 0.414]), [0.007, 0.007, 0.003]);
  b.detail(0);
  const path = new THREE.CatmullRomCurve3(
    [
      [0, 0.895, -0.12],
      [-0.025, 1.15, -0.1],
      [0.12, 1.57, -0.075],
      [0.42, 2.1, -0.015],
    ].map((p) => new THREE.Vector3(...mp(p as V3))),
  );
  const stem = new THREE.TubeGeometry(path, 32, 0.125, 12, false),
    sp = stem.getAttribute("position");
  for (let i = 0; i <= 32; i++) {
    const t = i / 32,
      c = path.getPointAt(t),
      f = 1.1 - 0.42 * t;
    for (let j = 0; j <= 12; j++) {
      const k = i * 13 + j;
      sp.setXYZ(
        k,
        c.x + (sp.getX(k) - c.x) * f,
        c.y + (sp.getY(k) - c.y) * f,
        c.z + (sp.getZ(k) - c.z) * f,
      );
    }
  }
  stem.computeVertexNormals();
  b.put("bronze", stem);
  const point = (t: number, s: number, outer = false): V3 => {
    const end = Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.6),
      chambers = 0.92 + 0.1 * Math.cos((t - 0.18) * Math.PI * 6);
    const w = 0.31 * end * chambers * (s < 0 ? 1.03 : 0.84),
      cx = -0.98 + 1.98 * t + 0.045 * Math.sin(t * Math.PI * 2),
      cy = 1.29 + 1.2 * t + 0.13 * t * t - 0.065 * Math.sin(t * Math.PI * 2);
    const z =
      0.02 +
      0.205 * s * s +
      0.022 * Math.sin(t * 11 + s) * (1 - s * s) -
      (outer ? 0.043 : 0);
    return mp([cx - 0.56 * w * s, cy + 0.83 * w * s, z]);
  };
  const vertices: number[] = [],
    indices: number[] = [],
    rows = 64,
    cols = 20,
    layer = (rows + 1) * (cols + 1);
  for (const outer of [false, true])
    for (let i = 0; i <= rows; i++)
      for (let j = 0; j <= cols; j++)
        vertices.push(...point(i / rows, (j * 2) / cols - 1, outer));
  for (let n = 0; n < 2; n++)
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const a = n * layer + i * (cols + 1) + j,
          c = a + cols + 1;
        if (n === 0) indices.push(a, c, c + 1, a, c + 1, a + 1);
        else indices.push(a, c + 1, c, a, a + 1, c + 1);
      }
  for (let i = 0; i < rows; i++)
    for (const j of [0, cols]) {
      const a = i * (cols + 1) + j,
        c = a + cols + 1;
      indices.push(a, a + layer, c + layer, a, c + layer, c);
    }
  for (const i of [0, rows])
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      indices.push(a, a + 1, a + 1 + layer, a, a + 1 + layer, a + layer);
    }
  const pod = new THREE.BufferGeometry();
  pod.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  pod.setIndex(indices);
  pod.computeVertexNormals();
  b.put("bronze", pod);
  for (const side of [-1, 1])
    b.tube(
      "bronze",
      Array.from({ length: 40 }, (_, i) => point(i / 39, side)),
      side < 0 ? 0.029 : 0.019,
    );
  b.tube(
    "bronze",
    [point(0.9, 1), mp([0.88, 2.55, 0.2]), mp([1.025, 2.76, 0.11])],
    0.024,
  );
  for (const [index, t] of [0.19, 0.48, 0.76].entries()) {
    const seed = new THREE.SphereGeometry(1, 28, 20),
      p = seed.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i),
        dent =
          0.12 *
          Math.exp(-((x - 0.45) ** 2 * 16 + (y + 0.08) ** 2 * 8)) *
          Math.max(0, z),
        shoulder = 1 + 0.045 * Math.sin(y * 4 + index * 1.8) + 0.035 * x * y;
      p.setXYZ(
        i,
        x * 0.265 * shoulder,
        y * 0.225 * (1 + 0.055 * x),
        z * 0.181 - dent * 0.1,
      );
    }
    seed.computeVertexNormals();
    const center = point(t, 0);
    center[2] += 0.142;
    b.put("bronze", seed, center, [
      0.12 + index * 0.065,
      h.yaw,
      -0.2 + index * 0.11,
    ]);
  }
  for (let i = 0; i < 65; i++) {
    const a = i * 2.399963,
      rad = 0.56 + 0.48 * (0.5 + 0.5 * Math.sin(i * 7.41));
    if (rad < 0.64 && Math.sin(a) < 0.4) continue;
    const x = mx + Math.cos(a) * rad,
      z = mz + Math.sin(a) * rad,
      y = 0.47 + 0.12 * (0.5 + 0.5 * Math.sin(i * 4.72));
    b.sphere("foliage", [x, y - 0.065, z], [0.12, 0.09, 0.1], [0, a, 0]);
    for (let f = 0; f < 3; f++)
      for (let j = 0; j < 6; j++) {
        const phi = (j * Math.PI) / 3 + a,
          xx = x + Math.sin(f * 2.4) * 0.07,
          zz = z + Math.cos(f * 2.4) * 0.07;
        b.sphere(
          i % 5 < 2 ? "flower" : "whiteFlower",
          [
            xx + Math.cos(phi) * 0.033,
            y + 0.028 * f,
            zz + Math.sin(phi) * 0.033,
          ],
          [0.033, 0.012, 0.019],
          [0.2, phi, 0.1],
        );
      }
  }
}
