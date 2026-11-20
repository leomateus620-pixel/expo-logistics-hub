import * as THREE from "three";
import { FENASOJA_COMPLEX as SPEC } from "../../../data/fenasojaComplexReconstruction";
import type { GeometryBuilder, V3 } from "./geometry";
const hq = SPEC.headquarters;
export function buildFrontage(builder: GeometryBuilder) {
  const { box, bevel, lathe, sphere, put, beam, tube, polygon, detail } = builder;
  // Sidewalk/apron raised from the map surface; joints follow curved circulation.
  const walk = new THREE.Shape(
    hq.sidewalk.map(([x, z]) => new THREE.Vector2(x, -z)),
  );
  const walkway = new THREE.ExtrudeGeometry(walk, {
    depth: 0.09,
    bevelEnabled: true,
    bevelSize: 0.008,
    bevelThickness: 0.008,
    bevelSegments: 1,
  });
  walkway.rotateX(-Math.PI / 2);
  const wp = walkway.getAttribute("position"),
    wn = walkway.getAttribute("normal"),
    wuv = walkway.getAttribute("uv");
  const keptP: number[] = [],
    keptN: number[] = [],
    keptUv: number[] = [];
  for (let i = 0; i < wp.count; i += 3) {
    if (wn.getY(i) > 0.99 && wp.getY(i) > 0.085) continue;
    for (let j = 0; j < 3; j++) {
      keptP.push(wp.getX(i + j), wp.getY(i + j), wp.getZ(i + j));
      keptN.push(wn.getX(i + j), wn.getY(i + j), wn.getZ(i + j));
      keptUv.push(wuv.getX(i + j), wuv.getY(i + j));
    }
  }
  const foundation = new THREE.BufferGeometry();
  foundation.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(keptP, 3),
  );
  foundation.setAttribute("normal", new THREE.Float32BufferAttribute(keptN, 3));
  foundation.setAttribute("uv", new THREE.Float32BufferAttribute(keptUv, 2));
  walkway.dispose();
  put("concrete", foundation);
  // Ground tessellation allows geometric contact to resolve the pots and monument base.
  for (const [x0, z0, x1, z1] of [
    [-4.55, 4.55, 6.7, 8.9],
    [-5.6, 7.8, -4.55, 8.9],
  ]) {
    const floor = new THREE.PlaneGeometry(
      x1 - x0,
      z1 - z0,
      Math.ceil((x1 - x0) / 0.25),
      Math.ceil((z1 - z0) / 0.25),
    );
    floor.rotateX(-Math.PI / 2);
    floor.translate((x0 + x1) / 2, 0.09, (z0 + z1) / 2);
    put("concrete", floor);
  }
  box("concrete", [5.4, 0.045, 1.25], [2.5, 0.09, 6.6]);
  bevel("trim", [0.475, 0.015, 8.9], [12.25, 0.17, 0.16], 0.012);
  // Shallow inset paving bands. Their top is 0.4 mm over concrete, not floating black tubes.
  for (const radius of [1.44, 1.72, 2.45]) {
    const shape = new THREE.Shape(),
      start = 0.16,
      end = Math.PI * 1.51,
      center = hq.monument.position;
    for (let i = 0; i <= 96; i++) {
      const a = start + ((end - start) * i) / 96,
        x = center[0] + Math.cos(a) * (radius - 0.013),
        z = center[1] + Math.sin(a) * (radius - 0.013);
      if (i === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    }
    for (let i = 96; i >= 0; i--) {
      const a = start + ((end - start) * i) / 96;
      shape.lineTo(
        center[0] + Math.cos(a) * (radius + 0.013),
        -center[1] - Math.sin(a) * (radius + 0.013),
      );
    }
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    put("joint", g, [0, 0.0904, 0]);
  }
  // Real shallow channel sides and slab joints; neutral mineral joint colour.
  for (const x of [-5, -2.5, 0, 2.5, 5])
    box("joint", [x, 0.0905, 8.3], [0.014, 0.0008, 1.04]);
  detail(2);
  // Recessed-looking radial drainage slots between the sweep of paving bands.
  const [monumentX, monumentZ] = hq.monument.position;
  for (let i = 0; i < 42; i++) {
    const angle = 0.26 + (i * 2.61) / 41;
    const point = (radius: number, offset: number): V3 => [
      monumentX + Math.cos(angle + offset) * radius,
      0.0907,
      monumentZ + Math.sin(angle + offset) * radius,
    ];
    polygon("joint", [
      point(2.01, -0.009),
      point(2.01, 0.009),
      point(2.12, 0.009),
      point(2.12, -0.009),
    ]);
  }
  detail(0);
  // Beds are outside the entrance route; soil and opaque foliage are matte.
  for (const bed of hq.planting) {
    const [x0, z0] = bed[0],
      [x1, z1] = bed[2];
    box("soil", [(x0 + x1) / 2, 0.15, (z0 + z1) / 2], [x1 - x0, 0.16, z1 - z0]);
    beam("trim", [x0, 0.17, z1], [x1, 0.17, z1], 0.17, 0.12);
  }
  // Curved leaf strip with a raised midrib and continuous normals, never alpha foliage.
  const blade = (
    base: V3,
    angle: number,
    height: number,
    width: number,
    bend: number,
    steps = 7,
  ) => {
    const positions: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps,
        dx = Math.cos(angle) * bend * t * t,
        dz = Math.sin(angle) * bend * t * t,
        w = width * Math.pow(Math.sin(Math.PI * t), 0.7);
      for (const side of [-1, 0, 1])
        positions.push(
          base[0] + dx - Math.sin(angle) * w * side,
          base[1] +
            height * t +
            0.024 * (1 - Math.abs(side)) * Math.sin(Math.PI * t),
          base[2] + dz + Math.cos(angle) * w * side,
        );
    }
    for (let i = 0; i < steps; i++)
      for (let j = 0; j < 2; j++) {
        const a = i * 3 + j;
        indices.push(a, a + 3, a + 4, a, a + 4, a + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    put("foliage", g);
  };
  for (const [x, z, mass] of [
    [-4.8, 8.1, 0.67],
    [-3.35, 8.0, 0.57],
    [5.27, 8.0, 1.1],
    [5.83, 6.1, 0.81],
    [5.3, 3.8, 0.92],
  ]) {
    for (let i = 0; i < 54; i++) {
      const angle = i * 2.399 + mass;
      const growth = 0.5 + 0.5 * Math.sin(i * 6.28 * mass);
      blade(
        [x + Math.cos(angle) * 0.13, 0.21, z + Math.sin(angle) * 0.13],
        angle,
        mass * (0.74 + growth * 0.69),
        0.016 + growth * 0.012,
        mass * (0.57 - growth * 0.28),
      );
    }
  }
  // Arching areca fronds; crowns stay inside the Argentina edge and above the circulation.
  for (const [x, z, height] of [
    [5.15, 3.4, 2.55],
    [5.35, 5.0, 2.85],
  ]) {
    for (let trunk = 0; trunk < 3; trunk++) {
      const offset = (trunk - 1) * 0.16;
      tube(
        "wood",
        [
          [x + offset, 0.2, z],
          [x + offset + 0.06, height * 0.6, z + 0.02],
          [x + offset + 0.13, height - 0.1 * trunk, z + 0.04],
        ],
        0.031,
      );
    }
    for (let j = 0; j < 14; j++) {
      detail(j % 2 === 0 ? 0 : 1);
      const a = j * 2.399963 + x,
        L = 1.15 + 0.19 * Math.sin(j * 4.4),
        lift = 0.37 + 0.18 * Math.sin(j * 2.3);
      for (let k = 1; k < 17; k++) {
        const t = k / 17,
          px = x + 0.13 + Math.cos(a) * t * L,
          pz = z + Math.sin(a) * t * L,
          py = height + lift * Math.sin(t * Math.PI) - 0.48 * t * t;
        for (const side of [-1, 1])
          blade(
            [px, py, pz],
            a + side * 1.08,
            -0.24 * t,
            0.022,
            0.42 * Math.pow(Math.sin(Math.PI * t), 0.6) + 0.055,
            5,
          );
      }
      tube(
        "foliage",
        [
          [x + 0.13, height, z],
          [
            x + 0.13 + Math.cos(a) * L * 0.5,
            height + lift - 0.12,
            z + Math.sin(a) * L * 0.5,
          ],
          [x + 0.13 + Math.cos(a) * L, height - 0.48, z + Math.sin(a) * L],
        ],
        0.009,
      );
    }
  }
  detail(0);
  // Dracaena/yucca stems and dense narrow rosettes at the left entrance.
  for (const [x, z, h] of [
    [-3.28, 6.85, 1.7],
    [-3.65, 7.0, 1.25],
    [-2.95, 6.85, 1.4],
  ]) {
    tube(
      "wood",
      [
        [x, 0.22, z],
        [x + 0.04, h * 0.65, z],
        [x + 0.1, h, z],
      ],
      0.037,
    );
    for (let i = 0; i < 30; i++)
      blade(
        [x + 0.1, h, z],
        i * 2.399963,
        0.28 + 0.13 * Math.sin(i * 3.2),
        0.025,
        0.44 + 0.1 * Math.sin(i * 1.2),
      );
  }
  for (const [cx, cz, radius, rise, white] of [
    [-5, 8.23, 0.21, 0.19, 1],
    [-4.36, 8.07, 0.24, 0.22, 0],
    [-3.76, 8.34, 0.17, 0.16, 1],
    [-3.05, 8.3, 0.19, 0.18, 1],
    [4.72, 8.3, 0.2, 0.2, 0],
    [5.14, 8.37, 0.22, 0.25, 1],
    [5.62, 8.27, 0.24, 0.2, 0],
    [6.12, 8.35, 0.24, 0.22, 1],
    [6.31, 7.79, 0.16, 0.18, 0],
  ]) {
    for (let i = 0; i < 14; i++) {
      const a = i * 2.399963 + cx;
      const fraction = Math.sqrt(i / 14);
      const x = cx + Math.cos(a) * fraction * radius;
      const z = cz + Math.sin(a) * fraction * radius;
      const y = 0.27 + rise * Math.sqrt(1 - fraction * fraction);
      sphere("foliage", [x, y - 0.07, z], [0.105, 0.079, 0.092]);
      for (let petal = 0; petal < 7; petal++) {
        const angle = a + (petal * Math.PI * 2) / 7;
        sphere(
          white ? "whiteFlower" : "flower",
          [x + Math.cos(angle) * 0.043, y + 0.017, z + Math.sin(angle) * 0.043],
          [0.038, 0.012, 0.024],
          [0.16, -angle, 0.14],
        );
      }
    }
  }
  // Ceramic profiles with rims, visible soil and individual upright shrubs.
  for (const [index, [x, z, h, white]] of [
    [-2.06, 5.12, 0.72, 1],
    [2.22, 4.95, 0.62, 0],
    [-3.78, 7.45, 0.43, 0],
    [-3.49, 7.5, 0.35, 0],
    [-3.92, 7.16, 0.51, 0],
    [5.88, 2.85, 0.73, 1],
  ].entries()) {
    const profile: [number, number][] = [
      [0, 0],
      [0.145, 0],
      [0.165, 0.025],
      [0.215, h * 0.72],
      [0.23, h - 0.02],
      [0.236, h],
      [0.197, h],
      [0.193, h - 0.065],
      [0.175, h - 0.11],
      [0, h - 0.11],
    ];
    lathe(white ? "trim" : "pot", profile, [x, 0.1, z], 28);
    put("soil", new THREE.CylinderGeometry(0.19, 0.19, 0.018, 20), [
      x,
      h + 0.015,
      z,
    ]);
    const shrubH = index < 2 ? 1.13 : 0.45;
    tube(
      "wood",
      [
        [x, h + 0.04, z],
        [x + 0.035, h + shrubH + 0.05, z],
      ],
      0.013,
    );
    for (let i = 0; i < 62; i++) {
      const t = i / 62,
        a = i * 2.399963,
        r = 0.21 * (1 - t) * (0.8 + 0.2 * Math.sin(i * 1.3));
      sphere(
        "foliage",
        [x + Math.cos(a) * r, h + 0.08 + t * shrubH, z + Math.sin(a) * r],
        [0.048, 0.07, 0.024],
        [0.2, a, 0.3],
      );
    }
  }
  // Low rounded shrubs have irregular leafy contours rather than visible polygonal balls.
  for (const [x, z, r] of [
    [-4.75, 7.7, 0.27],
    [5.98, 4.15, 0.29],
    [5.82, 6.95, 0.25],
  ])
    for (let i = 0; i < 65; i++) {
      const y = (i + 0.5) / 65,
        a = i * 2.399963,
        rad = r * Math.sqrt(1 - (2 * y - 1) ** 2);
      sphere(
        "foliage",
        [x + Math.cos(a) * rad, 0.22 + y * r * 1.8, z + Math.sin(a) * rad],
        [0.062, 0.054, 0.035],
        [0.3, a, 0.1],
      );
    }
  for (const [x, z, height] of [
    [-5.05, 8.1, 5.6],
    [-4.55, 7.95, 6.15],
    [-4.03, 7.78, 5.1],
  ]) {
    put("metal", new THREE.CylinderGeometry(0.022, 0.029, height, 16), [
      x,
      height / 2,
      z,
    ]);
    sphere("metal", [x, height, z], [0.036, 0.045, 0.036]);
    lathe(
      "trim",
      [
        [0, 0],
        [0.075, 0],
        [0.075, 0.07],
        [0.045, 0.13],
        [0, 0.13],
      ],
      [x, 0.1, z],
      16,
    );
  }
}
