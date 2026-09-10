import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  FENASOJA_COMPLEX as SPEC,
  complexWorldPolygon,
} from "../../data/fenasojaComplexReconstruction";
import type { StrategicLandmarkBounds } from "../../utils/landmarks";
import { disposeInstancedMesh } from "../../utils/instancedMeshDisposal";

const NO_RAYCAST = () => undefined;
const PETAL_GEOMETRY = new THREE.SphereGeometry(1, 8, 6);
type V3 = [number, number, number];
type Surface =
  | "wall"
  | "roof"
  | "trim"
  | "glass"
  | "interior"
  | "concrete"
  | "joint"
  | "soil"
  | "foliage"
  | "flower"
  | "whiteFlower"
  | "pot"
  | "bronze"
  | "pedestal"
  | "metal"
  | "sign"
  | "graphics"
  | "entry";
const hq = SPEC.headquarters;
const u = SPEC.registration.unitsPerMeter;
const mainCenterZ = hq.volumes.main.center[1];
const front = mainCenterZ + hq.volumes.main.depth / 2;
const rearZ = mainCenterZ - hq.volumes.main.depth / 2;
const sitePolygon = complexWorldPolygon("headquarters", "site");
const siteCenter = [
  (Math.min(...sitePolygon.map((p) => p[0])) +
    Math.max(...sitePolygon.map((p) => p[0]))) /
    2,
  (Math.min(...sitePolygon.map((p) => p[1])) +
    Math.max(...sitePolygon.map((p) => p[1]))) /
    2,
];
const architecturalOffset: V3 = [
  hq.origin[1] - siteCenter[1],
  0,
  siteCenter[0] - hq.origin[0],
];

function texture(kind: "masonry" | "roof" | "concrete") {
  const size = 128,
    data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4,
        noise = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
      const n = noise - Math.floor(noise) - 0.5;
      const wave =
        kind === "roof" ? Math.cos((y / size) * Math.PI * 32) * 36 : n * 12;
      data[i] = 128 + (kind==='roof'?n*3:wave);
      data[i + 1] = 128 + (kind==='roof'?wave:n*4);
      data[i + 2] = 252;
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.repeat.set(kind === "roof" ? 1 : 4, kind === "roof" ? 1 : 4);
  t.needsUpdate = true;
  t.name = `B12:${kind}-normal`;
  return t;
}

function makeArtwork(invalidate: () => void) {
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 384;
  const ctx = canvas.getContext("2d")!;
  const sign = new THREE.CanvasTexture(canvas);
  sign.colorSpace = THREE.SRGBColorSpace;
  sign.anisotropy = 8;
  sign.name = "B12:official-white-sign";
  let alive = true;
  const paint = (symbol?: HTMLImageElement) => {
    ctx.fillStyle = "#f4f4f0";
    ctx.fillRect(0, 0, 1536, 384);
    ctx.fillStyle = "#405a6c";
    ctx.font = "bold 143px Arial";
    ctx.textBaseline = "middle";
    ctx.fillText("FENASOJA", 95, 190, 905);
    ctx.font = "26px Arial";
    ctx.fillText("®", 995, 135);
    if (symbol) ctx.drawImage(symbol, 1020, 64, 240, 240);
    ctx.fillStyle = "#122638";
    ctx.font = "bold 45px Arial";
    ctx.fillText("Comissão", 1280, 265);
    ctx.fillText("Central", 1280, 315);
    sign.needsUpdate = true;
    invalidate();
  };
  paint();
  const art = document.createElement("canvas");
  art.width = 1024;
  art.height = 256;
  const c = art.getContext("2d")!;
  const gradient = c.createLinearGradient(0, 0, 1024, 256);
  gradient.addColorStop(0, "#123e34");
  gradient.addColorStop(1, "#087340");
  c.fillStyle = gradient;
  c.fillRect(0, 0, 1024, 256);
  c.fillStyle = "#f1de72";
  c.font = "bold 28px Arial";
  ["NOSSO", "OURO VEM", "DO CAMPO"].forEach((s, i) =>
    c.fillText(s, 28, 50 + i * 32),
  );
  for (let i = 0; i < 5; i++) {
    const x = 310 + i * 143,
      y = 120 + Math.sin(i * 3.3) * 54,
      r = 32 + (i % 3) * 21;
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.4, 1, x, y, r);
    g.addColorStop(0, "#fff2ba");
    g.addColorStop(0.48, "#dac461");
    g.addColorStop(1, "#a77c29");
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(x, y, r, r * 0.87, -0.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#836035";
    c.beginPath();
    c.ellipse(
      x + r * 0.2,
      y + r * 0.15,
      r * 0.13,
      r * 0.3,
      -0.5,
      0,
      Math.PI * 2,
    );
    c.fill();
  }
  const graphics = new THREE.CanvasTexture(art);
  graphics.colorSpace = THREE.SRGBColorSpace;
  graphics.anisotropy = 8;
  graphics.name = "B12:green-window-artwork";
  const entryCanvas = document.createElement("canvas");
  entryCanvas.width = 1024;
  entryCanvas.height = 1024;
  const e = entryCanvas.getContext("2d")!;
  e.fillStyle = "#124f36";
  e.fillRect(0, 0, 1024, 1024);
  e.fillStyle = "#f0eaa5";
  e.font = "bold 59px Arial";
  ["NOSSO", "OURO VEM", "DO CAMPO"].forEach((s, i) =>
    e.fillText(s, 549, 97 + i * 65),
  );
  e.fillStyle = "#eeeece";
  e.font = "bold 56px Arial";
  e.fillText("FENASOJA", 36, 240);
  for (let i = 0; i < 7; i++) {
    const x = 80 + ((i * 193) % 850),
      y = 430 + ((i * 117) % 520),
      r = 26 + (i % 3) * 33;
    const g = e.createRadialGradient(x - r * 0.3, y - r * 0.4, 1, x, y, r);
    g.addColorStop(0, "#f7e8a4");
    g.addColorStop(0.5, "#cdb253");
    g.addColorStop(1, "#91733f");
    e.fillStyle = g;
    e.beginPath();
    e.ellipse(x, y, r, r * 0.88, 0.5, 0, Math.PI * 2);
    e.fill();
  }
  const entry = new THREE.CanvasTexture(entryCanvas);
  entry.colorSpace = THREE.SRGBColorSpace;
  entry.anisotropy = 8;
  const symbol = new Image();
  symbol.onload = () => {
    if (alive) {
      paint(symbol);
      e.drawImage(symbol, 198, 40, 122, 122);
      entry.needsUpdate = true;
      invalidate();
    }
  };
  symbol.src = hq.sign.symbolAsset;
  return {
    sign,
    graphics,
    entry,
    dispose: () => {
      alive = false;
      symbol.onload = null;
      sign.dispose();
      graphics.dispose();
      entry.dispose();
    },
  };
}

/** Geometry is authored in meters, merged once per surface. No photo facade,
 * per-frame reflection capture, transparent foliage, or navigation allocations. */
function buildArchitecture() {
  const buckets = new Map<Surface, THREE.BufferGeometry[]>();
  const repeated = new Map<Surface, THREE.Matrix4[]>();
  const put = (
    key: Surface,
    g: THREE.BufferGeometry,
    p: V3 = [0, 0, 0],
    r: V3 = [0, 0, 0],
    s: V3 = [1, 1, 1],
  ) => {
    const geom = g.index ? g.toNonIndexed() : g;
    if (geom !== g) g.dispose();
    if (!geom.getAttribute("uv"))
      geom.setAttribute(
        "uv",
        new THREE.Float32BufferAttribute(
          new Float32Array(geom.getAttribute("position").count * 2),
          2,
        ),
      );
    geom.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(...p),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
        new THREE.Vector3(...s),
      ),
    );
    const list = buckets.get(key) || [];
    list.push(geom);
    buckets.set(key, list);
  };
  const box = (key: Surface, p: V3, s: V3, r: V3 = [0, 0, 0]) =>
    put(key, new THREE.BoxGeometry(...s), p, r);
  const sphere = (key: Surface, p: V3, s: V3, r: V3 = [0, 0, 0]) => {
    if (key === "flower" || key === "whiteFlower" || key === "foliage") {
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(...p),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
        new THREE.Vector3(...s),
      );
      const list = repeated.get(key) || [];
      list.push(matrix);
      repeated.set(key, list);
      return;
    }
    put(key, new THREE.SphereGeometry(1, 20, 12), p, r, s);
  };
  const beam = (key: Surface, a: V3, b: V3, width = 0.08, depth = width) => {
    const va = new THREE.Vector3(...a),
      vb = new THREE.Vector3(...b),
      delta = vb.clone().sub(va);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      delta.clone().normalize(),
    );
    const g = new THREE.BoxGeometry(width, delta.length(), depth);
    g.applyQuaternion(q);
    put(key, g, va.add(vb).multiplyScalar(0.5).toArray() as V3);
  };
  const tube = (key: Surface, points: V3[], radius: number) =>
    put(
      key,
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
        28,
        radius,
        7,
        false,
      ),
    );
  const polygon = (key: Surface, pts: V3[]) => {
    const pos: number[] = [];
    for (let i = 1; i < pts.length - 1; i++)
      pos.push(...pts[0], ...pts[i], ...pts[i + 1]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const uv: number[] = [];
    for (let i = 0; i < pos.length; i += 3)
      uv.push(pos[i] * 0.2, pos[i + 2] * 0.2);
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    put(key, g);
  };
  // Front is an actual opening: two wall jambs and a lintel, with depth behind it.
  box("wall", [-2.63, 2.3, mainCenterZ], [1.24, 4.6, 6.9]);
  box("wall", [2.63, 2.3, mainCenterZ], [1.24, 4.6, 6.9]);
  box("wall", [0, 3.62, mainCenterZ], [4.05, 1.96, 6.9]);
  box("wall", [0, 1.3, rearZ + 0.12], [4.05, 2.6, 0.24]);
  box("interior", [0, 0.12, 2.3], [4.04, 0.12, 4.5]);
  box("interior", [0, 1.3, 1.65], [4.04, 2.6, 0.15]);
  box("pot", [-0.5, 0.65, 2.5], [1.9, 0.9, 0.6]); // a restrained reception silhouette
  box("trim", [0, 2.5, 3.3], [3.8, 0.09, 2.3]);
  // Split triangular masonry around the upper glazing: there is no opaque wall behind glass.
  const tri = hq.glazing;
  const tw = tri.triangleWidth / 2;
  polygon("wall", [
    [-3.25, 4.6, front],
    [3.25, 4.6, front],
    [tw, 5.38, front],
    [-tw, 5.38, front],
  ]);
  polygon("wall", [
    [-3.25, 4.6, front],
    [-tw, 5.38, front],
    [0, 7.73, front],
    [0, 8.2, front],
  ]);
  polygon("wall", [
    [3.25, 4.6, front],
    [0, 8.2, front],
    [0, 7.73, front],
    [tw, 5.38, front],
  ]);
  polygon("wall", [
    [-3.25, 4.6, rearZ],
    [0, 8.2, rearZ],
    [3.25, 4.6, rearZ],
  ]);
  polygon("glass", [
    [-tri.triangleWidth / 2, tri.triangleBase, front + 0.012],
    [tri.triangleWidth / 2, tri.triangleBase, front + 0.012],
    [0, tri.triangleBase + tri.triangleRise, front + 0.012],
  ]);
  polygon("interior", [
    [-tw, 5.4, front - 0.6],
    [tw, 5.4, front - 0.6],
    [0, 7.75, front - 0.6],
  ]);
  // Rectangular window row beneath the triangular glazing.
  box(
    "glass",
    [0, tri.lowerBottom + tri.lowerHeight / 2, front + 0.025],
    [tri.lowerWidth, tri.lowerHeight, 0.055],
  );
  for (let i = 0; i < 4; i++) {
    const x = ((i - 1.5) * tri.lowerWidth) / 4;
    const pane = new THREE.PlaneGeometry(
      tri.lowerWidth / 4 - 0.09,
      tri.lowerHeight - 0.08,
    );
    const uv = pane.getAttribute("uv");
    for (let j = 0; j < uv.count; j++) uv.setX(j, (uv.getX(j) + i) / 4);
    put("graphics", pane, [
      x,
      tri.lowerBottom + tri.lowerHeight / 2,
      front + 0.061,
    ]);
  }
  [-1, -0.5, 0, 0.5, 1].forEach((r) =>
    box(
      "trim",
      [
        (r * tri.lowerWidth) / 2,
        tri.lowerBottom + tri.lowerHeight / 2,
        front + 0.077,
      ],
      [0.075, tri.lowerHeight + 0.1, 0.075],
    ),
  );
  [tri.lowerBottom, tri.lowerBottom + tri.lowerHeight].forEach((y) =>
    box("trim", [0, y, front + 0.077], [tri.lowerWidth + 0.12, 0.08, 0.075]),
  );
  const ttop = tri.triangleBase + tri.triangleRise;
  beam("trim", [-tw, 5.38, front + 0.03], [0, ttop, front + 0.03], 0.065);
  beam("trim", [0, ttop, front + 0.03], [tw, 5.38, front + 0.03], 0.065);
  beam("trim", [-tw, 5.38, front + 0.03], [tw, 5.38, front + 0.03], 0.065);
  for (const x of [-1.05, 0, 1.05])
    beam(
      "trim",
      [x, 5.38, front + 0.045],
      [x, ttop - (Math.abs(x) / tw) * tri.triangleRise, front + 0.045],
      0.065,
    );
  beam(
    "trim",
    [-1.19, 6.38, front + 0.045],
    [1.19, 6.38, front + 0.045],
    0.065,
  );
  beam("trim", [-0.8, 5.4, front - 0.12], [0, 6.25, front - 0.12], 0.12);
  beam("trim", [0.8, 5.4, front - 0.12], [0, 6.25, front - 0.12], 0.12);

  // Main gabled roof: thickness, white soffits, ridge cap, visible eave rafters.
  const m = hq.volumes.main,
    half = m.width / 2 + m.overhang,
    pitch = m.pitch,
    slope = Math.hypot(half, m.ridge - m.eave);
  for (const side of [-1, 1]) {
    const p: V3 = [(side * half) / 2, (m.ridge + m.eave) / 2, mainCenterZ],
      r: V3 = [0, 0, -side * pitch];
    box("roof", p, [slope, 0.1, m.depth + 0.72], r);
    box(
      "trim",
      [p[0], p[1] - 0.085, mainCenterZ],
      [slope, 0.075, m.depth + 0.68],
      r,
    );
    for (const z of [rearZ - 0.37, front + 0.37])
      box("trim", [p[0], p[1] - 0.045, z], [slope, 0.18, 0.13], r);
    box(
      "trim",
      [side * half, m.eave - 0.09, mainCenterZ],
      [0.14, 0.2, m.depth + 0.7],
    );
    // Rows are geometry at grazing angles, finer corrugation uses a normal map.
    for (let i = 0; i < 28; i++) {
      const z = rearZ - 0.3 + (i * (m.depth + 0.6)) / 27;
      box("roof", [p[0], p[1] + 0.068, z], [slope, 0.035, 0.075], r);
      if (i % 2 === 0)
        box(
          "trim",
          [side * (half - 0.1), m.eave - 0.14, z],
          [0.3, 0.14, 0.08],
          r,
        );
    }
  }
  put(
    "roof",
    new THREE.CylinderGeometry(0.12, 0.12, m.depth + 0.85, 10),
    [0, m.ridge + 0.06, mainCenterZ],
    [Math.PI / 2, 0, 0],
  );
  beam("trim", [0, 7.0, front + 0.45], [0, 8.12, front + 0.45], 0.19, 0.24);
  // Roof volumes inferred only where visible from above; room shares its wall junction.
  const hip = (
    cx: number,
    cz: number,
    w: number,
    d: number,
    eave: number,
    ridge: number,
  ) => {
    box("wall", [cx, eave / 2, cz], [w, eave, d]);
    const x0 = cx - w / 2 - 0.18,
      x1 = cx + w / 2 + 0.18,
      z0 = cz - d / 2 - 0.18,
      z1 = cz + d / 2 + 0.18;
    const ridgeHalf = Math.max(0, (d - w) / 2);
    const a: V3 = [cx, ridge, cz - ridgeHalf],
      b: V3 = [cx, ridge, cz + ridgeHalf];
    polygon("roof", [[x0, eave, z1], [x0, eave, z0], a, b]);
    polygon("roof", [[x1, eave, z0], [x1, eave, z1], b, a]);
    polygon("roof", [[x0, eave, z0], [x1, eave, z0], a]);
    polygon("roof", [[x1, eave, z1], [x0, eave, z1], b]);
    for (const [p, q] of [
      [
        [x0, eave, z0],
        [x1, eave, z0],
      ],
      [
        [x1, eave, z0],
        [x1, eave, z1],
      ],
      [
        [x1, eave, z1],
        [x0, eave, z1],
      ],
      [
        [x0, eave, z1],
        [x0, eave, z0],
      ],
    ] as [V3, V3][])
      beam("trim", p, q, 0.14, 0.1);
    for (const corner of [
      [x0, eave, z0],
      [x1, eave, z0],
      [x0, eave, z1],
      [x1, eave, z1],
    ] as V3[])
      beam("roof", corner, corner[2] < cz ? a : b, 0.09);
    beam("roof", a, b, 0.12);
  };
  const rear = hq.volumes.rearLeft;
  hip(...rear.center, rear.width, rear.depth, rear.eave, rear.ridge);
  const back = hq.volumes.rearRight;
  hip(...back.center, back.width, back.depth, back.eave, back.ridge);
  const room = hq.volumes.volunteers;
  hip(...room.center, room.width, room.depth, room.eave, room.ridge);
  // Right side room: wall meets main side at x=3.225, conservative two panes.
  box("glass", [4.75, 1.6, -0.285], [2.35, 1.12, 0.04]);
  [-1, 0, 1].forEach((i) =>
    box("trim", [4.75 + i * 1.18, 1.6, -0.24], [0.085, 1.23, 0.09]),
  );
  [1.02, 2.19].forEach((y) =>
    box("trim", [4.75, y, -0.24], [2.44, 0.08, 0.09]),
  );
  // Front-left wing adjoins the main volume, without an artificial alley.
  box("wall", [-3.48, 1.23, 5.55], [1.9, 2.46, 2.45]);
  box("roof", [-3.48, 2.77, 6.07], [2.04, 0.11, 3.7], [0.16, 0, 0]);
  box("trim", [-3.48, 2.5, 7.85], [2.04, 0.19, 0.12]);
  // Modest left wing; the projecting canopy never blocks the central doorway.
  box("wall", [-4.33, 1.17, 7.1], [0.18, 2.34, 1.0]);
  for (const y of [0.45, 0.75, 1.05, 1.35, 1.65, 1.95, 2.25])
    beam("joint", [-4.39, y, 6.8], [-2.53, y, 6.8], 0.01, 0.01);
  // A few conservative side/rear panes give depth without invented elevations.
  for (const z of [-2.7, 0, 2.7]) {
    box("glass", [3.27, 1.85, z], [0.05, 1.2, 1.0]);
    for (const y of [1.2, 2.49]) box("trim", [3.31, y, z], [0.075, 0.075, 1.1]);
  }
  // Central glazed entrance: sliding panels flank a recessed unobstructed opening.
  for (const side of [-1, 1]) {
    const x = side * 1.22;
    box("glass", [x, 1.27, front + 0.07], [1.1, 2.44, 0.055]);
    const doorArt = new THREE.PlaneGeometry(0.94, 2.19),
      uv = doorArt.getAttribute("uv");
    for (let j = 0; j < uv.count; j++)
      uv.setX(j, (uv.getX(j) + (side > 0 ? 1 : 0)) / 2);
    put("entry", doorArt, [x, 1.3, front + 0.106]);
    for (const edge of [-0.56, 0.56])
      box("trim", [x + edge, 1.27, front + 0.13], [0.09, 2.55, 0.1]);
    for (const y of [0.06, 0.72, 2.5])
      box("trim", [x, y, front + 0.13], [1.17, 0.095, 0.1]);
  }
  box("trim", [0, 2.52, front + 0.12], [3.65, 0.13, 0.16]);
  box("metal", [0.59, 1.12, front + 0.18], [0.034, 0.33, 0.05]);
  // Physical projecting sign: gently convex face, solid white return panels.
  const sw = hq.sign.width,
    sh = hq.sign.height,
    zs = front + 0.25,
    ys = hq.sign.bottom;
  const vertices: number[] = [],
    uv: number[] = [];
  const point = (t: number, y: number): V3 => [
    (t - 0.5) * sw,
    ys + y * sh,
    zs + hq.sign.bulge * (1 - Math.pow(2 * t - 1, 2)),
  ];
  for (let i = 0; i < 32; i++) {
    const a = i / 32,
      b = (i + 1) / 32;
    vertices.push(
      ...point(a, 0),
      ...point(b, 0),
      ...point(b, 1),
      ...point(a, 0),
      ...point(b, 1),
      ...point(a, 1),
    );
    uv.push(a, 0, b, 0, b, 1, a, 0, b, 1, a, 1);
    const pa = point(a, 0),
      pb = point(b, 0),
      pc = point(b, 1),
      pd = point(a, 1);
    polygon("trim", [
      pa,
      [pa[0], pa[1], zs - 0.28],
      [pb[0], pb[1], zs - 0.28],
      pb,
    ]);
    polygon("trim", [
      pd,
      pc,
      [pc[0], pc[1], zs - 0.28],
      [pd[0], pd[1], zs - 0.28],
    ]);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  sg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  sg.computeVertexNormals();
  put("sign", sg);
  [-1, 1].forEach((s) =>
    box("trim", [(s * sw) / 2, ys + sh / 2, zs - 0.13], [0.05, sh, 0.3]),
  );

  // Sidewalk/apron raised from the map surface; joints follow curved circulation.
  const walk = new THREE.Shape(
    hq.sidewalk.map(([x, z]) => new THREE.Vector2(x, -z)),
  );
  const walkway = new THREE.ExtrudeGeometry(walk, {
    depth: 0.09,
    bevelEnabled: false,
  });
  walkway.rotateX(-Math.PI / 2);
  put("concrete", walkway);
  box("concrete", [5.4, 0.045, 1.25], [2.5, 0.09, 6.6]);
  beam("trim", [-5.65, 0.02, 8.9], [6.6, 0.02, 8.9], 0.16, 0.17);
  for (const radius of [1.4, 1.7, 2.45]) {
    const pts: V3[] = Array.from({ length: 30 }, (_, i) => {
      const a = 0.2 + (i / 29) * Math.PI * 1.45;
      return [
        hq.monument.position[0] + Math.cos(a) * radius,
        0.095,
        hq.monument.position[1] + Math.sin(a) * radius,
      ];
    });
    tube("joint", pts, 0.01);
  }
  for (const x of [-5, -2.5, 0, 2.5, 5])
    beam("joint", [x, 0.093, 7.85], [x, 0.093, 8.82], 0.012, 0.012);
  // Beds are outside the entrance route; soil and opaque foliage are matte.
  for (const bed of hq.planting) {
    const [x0, z0] = bed[0],
      [x1, z1] = bed[2];
    box("soil", [(x0 + x1) / 2, 0.15, (z0 + z1) / 2], [x1 - x0, 0.16, z1 - z0]);
    beam("trim", [x0, 0.17, z1], [x1, 0.17, z1], 0.17, 0.12);
  }
  const blade = (
    base: V3,
    angle: number,
    height: number,
    width: number,
    bend: number,
  ) => {
    const pts: V3[] = [];
    for (let i = 0; i < 6; i++) {
      const t = i / 5,
        dx = Math.cos(angle) * bend * t * t,
        dz = Math.sin(angle) * bend * t * t,
        w = width * Math.sin(Math.PI * (t * 0.9 + 0.06));
      pts.push(
        [
          base[0] + dx - Math.sin(angle) * w,
          base[1] + height * t,
          base[2] + dz + Math.cos(angle) * w,
        ],
        [
          base[0] + dx + Math.sin(angle) * w,
          base[1] + height * t,
          base[2] + dz - Math.cos(angle) * w,
        ],
      );
    }
    for (let i = 0; i < 5; i++)
      polygon("foliage", [
        pts[i * 2],
        pts[i * 2 + 1],
        pts[i * 2 + 3],
        pts[i * 2 + 2],
      ]);
  };
  for (const [x, z] of [
    [-4.8, 8.1],
    [-3.35, 8.0],
    [5.25, 8.0],
    [5.8, 6.1],
    [5.3, 3.8],
  ]) {
    for (let i = 0; i < 34; i++)
      blade(
        [x + Math.cos(i * 2.4) * 0.12, 0.21, z + Math.sin(i * 2.4) * 0.12],
        i * 2.399,
        0.7 + (i % 5) * 0.15,
        0.048,
        0.4 + (i % 3) * 0.13,
      );
  }
  // Palms and slender ornamental leaves use welded geometry, without alpha cards.
  for (const [x, z, height] of [
    [5.7, 3.4, 2.2],
    [5.75, 5.1, 2.5],
    [-3.2, 6.7, 1.9],
  ]) {
    tube(
      "pot",
      [
        [x, 0.2, z],
        [x + 0.06, height * 0.6, z],
        [x + 0.15, height, z],
      ],
      0.055,
    );
    for (let j = 0; j < 9; j++) {
      const a = (j * Math.PI * 2) / 9;
      for (let k = 0; k < 10; k++) {
        const t = k / 10,
          px = x + 0.15 + Math.cos(a) * t * 1.1,
          pz = z + Math.sin(a) * t * 1.1,
          py = height + 0.65 * Math.sin(t * Math.PI) - 0.25 * t;
        blade([px, py, pz], a + 0.85, 0.12, 0.048, 0.36 * (1 - t) + 0.08);
        blade([px, py, pz], a - 0.85, 0.12, 0.048, 0.36 * (1 - t) + 0.08);
      }
      tube(
        "foliage",
        [
          [x + 0.15, height, z],
          [x + 0.15 + Math.cos(a) * 0.6, height + 0.65, z + Math.sin(a) * 0.6],
          [x + 0.15 + Math.cos(a) * 1.1, height - 0.2, z + Math.sin(a) * 1.1],
        ],
        0.014,
      );
    }
  }
  for (let i = 0; i < 85; i++) {
    const right = i % 2 === 0,
      x = right
        ? 4.65 + (i % 7) * 0.23 + Math.sin(i * 9) * 0.08
        : -5.15 + (i % 8) * 0.27 + Math.sin(i * 9) * 0.08,
      z = 8.0 + (i % 3) * 0.22 + Math.cos(i * 13) * 0.06;
    const y = 0.25 + (i % 4) * 0.035;
    sphere("foliage", [x, y - 0.03, z], [0.14, 0.14, 0.15]);
    for (let j = 0; j < 5; j++) {
      const a = (j * Math.PI * 2) / 5;
      sphere(
        i % 3 ? "whiteFlower" : "flower",
        [x + Math.cos(a) * 0.04, y + 0.15, z + Math.sin(a) * 0.04],
        [0.04, 0.028, 0.036],
      );
    }
  }
  for (const [x, z] of [
    [-2.1, 5.2],
    [2.2, 4.9],
    [-4.0, 7.7],
  ]) {
    put("pot", new THREE.CylinderGeometry(0.22, 0.13, 0.55, 12), [x, 0.34, z]);
    for (let i = 0; i < 11; i++)
      blade([x, 0.64, z], i * 2.4, 0.45 + (i % 3) * 0.1, 0.028, 0.25);
  }
  for (const [x, z, height] of [
    [-5.05, 8.1, 5.6],
    [-4.55, 7.95, 6.15],
    [-4.03, 7.78, 5.1],
  ]) {
    put("metal", new THREE.CylinderGeometry(0.022, 0.029, height, 9), [
      x,
      height / 2,
      z,
    ]);
    sphere("metal", [x, height, z], [0.041, 0.041, 0.041]);
  }
  // Downpipes, gutter returns and two modest wall fixtures visible at the entrance.
  for (const side of [-1, 1]) {
    tube(
      "trim",
      [
        [side * 3.53, 4.54, 3.9],
        [side * 3.4, 4.25, 4.05],
        [side * 3.4, 0.15, 4.05],
      ],
      0.042,
    );
    box("metal", [side * 1.94, 2.35, front + 0.21], [0.14, 0.18, 0.1]);
    box("trim", [side * 1.94, 2.35, front + 0.27], [0.105, 0.105, 0.03]);
  }
  box("trim", [-3.32, 2.7, 4.12], [0.18, 0.52, 0.72]);
  put(
    "metal",
    new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16),
    [-3.43, 2.7, 4.12],
    [0, 0, Math.PI / 2],
  );

  // Dedicated soybean sculpture: concave open pod, three rounded seeds, curved stem.
  const [mx, mz] = hq.monument.position;
  const mp = (p: V3): V3 => [
    mx + p[0] * Math.cos(hq.monument.yaw) + p[2] * Math.sin(hq.monument.yaw),
    p[1] + 0.1,
    mz - p[0] * Math.sin(hq.monument.yaw) + p[2] * Math.cos(hq.monument.yaw),
  ];
  put(
    "pedestal",
    new THREE.CylinderGeometry(1.18, 1.2, 0.36, 40),
    mp([0, 0.18, 0]),
  );
  put(
    "soil",
    new THREE.CylinderGeometry(1.09, 1.09, 0.045, 40),
    mp([0, 0.375, 0]),
  );
  put(
    "pedestal",
    new THREE.TorusGeometry(1.15, 0.048, 7, 40),
    mp([0, 0.4, 0]),
    [Math.PI / 2, 0, 0],
  );
  put(
    "pedestal",
    new THREE.CylinderGeometry(0.37, 0.41, 0.57, 20),
    mp([0, 0.69, 0]),
  );
  box("bronze", mp([0, 0.72, 0.388]), [0.28, 0.19, 0.018]);
  box("pedestal", mp([0, 0.72, 0.402]), [0.245, 0.16, 0.011]);
  tube(
    "bronze",
    [
      mp([0, 0.98, -0.08]),
      mp([-0.02, 1.22, -0.05]),
      mp([0.1, 1.48, 0.03]),
      mp([0.43, 1.8, 0.07]),
    ],
    0.115,
  );
  const podPoint = (t: number, s: number): V3 => {
    const w = 0.33 * Math.pow(Math.sin(t * Math.PI), 0.7),
      cx = -0.91 + 1.94 * t,
      cy = 1.41 + 0.84 * t + 0.4 * t * t;
    return mp([cx - 0.62 * w * s, cy + 0.78 * w * s, 0.025 + 0.23 * s * s]);
  };
  const podVertices: number[] = [],
    podIndex: number[] = [];
  for (let i = 0; i <= 48; i++)
    for (let j = 0; j <= 16; j++)
      podVertices.push(...podPoint(i / 48, -1 + j / 8));
  for (let i = 0; i < 48; i++)
    for (let j = 0; j < 16; j++) {
      const a = i * 17 + j,
        b = a + 17;
      podIndex.push(a, b, b + 1, a, b + 1, a + 1);
    }
  const pod = new THREE.BufferGeometry();
  pod.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(podVertices, 3),
  );
  pod.setIndex(podIndex);
  const welded = mergeVertices(pod);
  pod.dispose();
  welded.computeVertexNormals();
  put("bronze", welded);
  for (const side of [-1, 1])
    tube(
      "bronze",
      Array.from({ length: 30 }, (_, i) => podPoint(i / 29, side)),
      0.025,
    );
  for (const t of [0.22, 0.49, 0.76]) {
    const p = podPoint(t, 0);
    p[2] += 0.14;
    sphere("bronze", p, [0.245, 0.19, 0.19], [0, 0, 0.5]);
  }
  for (let i = 0; i < 26; i++) {
    const a = (i * Math.PI * 2) / 26,
      x = mx + Math.cos(a) * 0.9,
      z = mz + Math.sin(a) * 0.9;
    sphere("foliage", [x, 0.57, z], [0.13, 0.12, 0.13]);
    for (let j = 0; j < 4; j++)
      sphere(
        i % 2 ? "flower" : "whiteFlower",
        [x + Math.cos(j * 1.57) * 0.07, 0.68, z + Math.sin(j * 1.57) * 0.07],
        [0.065, 0.035, 0.05],
      );
  }
  return {
    repeated,
    geometry: [...buckets.entries()].map(([key, parts]) => {
      const geometry = mergeGeometries(parts, false)!;
      parts.forEach((g) => g.dispose());
      geometry.computeBoundingSphere();
      geometry.name = `B12:${key}`;
      return { key, geometry };
    }),
  };
}

function RepeatedPlanting({
  matrices,
  material,
  visible,
}: {
  matrices: THREE.Matrix4[];
  material: THREE.Material;
  visible: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    return () => disposeInstancedMesh(mesh);
  }, [matrices]);
  return (
    <instancedMesh
      ref={ref}
      args={[PETAL_GEOMETRY, material, matrices.length]}
      visible={visible}
      castShadow
      receiveShadow
      raycast={NO_RAYCAST}
      dispose={null}
    />
  );
}

export function FenasojaHeadquarters({
  bounds,
  toneDown = 0,
  showDetail = true,
}: {
  bounds: StrategicLandmarkBounds;
  toneDown?: number;
  showDetail?: boolean;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const resources = useMemo(() => {
    const { geometry, repeated } = buildArchitecture(),
      art = makeArtwork(invalidate);
    const masonry = texture("masonry"),
      roof = texture("roof"),
      concrete = texture("concrete");
    const materials: Record<Surface, THREE.MeshStandardMaterial> = {
      wall: new THREE.MeshStandardMaterial({
        color: "#454b4c",
        roughness: 0.9,
        normalMap: masonry,
        normalScale: new THREE.Vector2(0.11, 0.11),
      }),
      roof: new THREE.MeshStandardMaterial({
        color: "#bcbeb6",
        roughness: 0.83,
        metalness: 0.07,
        normalMap: roof,
        normalScale: new THREE.Vector2(0.2, 0.2),
        side: THREE.DoubleSide,
      }),
      trim: new THREE.MeshStandardMaterial({
        color: "#eceee5",
        roughness: 0.64,
        side: THREE.DoubleSide,
      }),
      glass: new THREE.MeshStandardMaterial({
        color: "#4d6875",
        roughness: 0.17,
        metalness: 0.3,
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
        envMapIntensity: 0.8,
        side: THREE.DoubleSide,
      }),
      interior: new THREE.MeshStandardMaterial({
        color: "#252521",
        roughness: 1,
        side: THREE.DoubleSide,
      }),
      concrete: new THREE.MeshStandardMaterial({
        color: "#a5a297",
        roughness: 0.98,
        normalMap: concrete,
        normalScale: new THREE.Vector2(0.08, 0.08),
      }),
      joint: new THREE.MeshStandardMaterial({ color: "#676a64", roughness: 1 }),
      soil: new THREE.MeshStandardMaterial({ color: "#4c3428", roughness: 1 }),
      foliage: new THREE.MeshStandardMaterial({
        color: "#36572b",
        roughness: 0.95,
        side: THREE.DoubleSide,
      }),
      flower: new THREE.MeshStandardMaterial({
        color: "#d6b521",
        roughness: 0.85,
      }),
      whiteFlower: new THREE.MeshStandardMaterial({
        color: "#e8e7d9",
        roughness: 0.86,
      }),
      pot: new THREE.MeshStandardMaterial({
        color: "#9b6146",
        roughness: 0.83,
      }),
      bronze: new THREE.MeshStandardMaterial({
        color: "#9c7649",
        roughness: 0.36,
        metalness: 0.72,
        normalMap: masonry,
        normalScale: new THREE.Vector2(0.035, 0.035),
        side: THREE.DoubleSide,
        envMapIntensity: 0.7,
      }),
      pedestal: new THREE.MeshStandardMaterial({
        color: "#363e41",
        roughness: 0.8,
      }),
      metal: new THREE.MeshStandardMaterial({
        color: "#afb9b7",
        roughness: 0.4,
        metalness: 0.65,
      }),
      sign: new THREE.MeshStandardMaterial({
        map: art.sign,
        roughness: 0.72,
        metalness: 0,
      }),
      graphics: new THREE.MeshStandardMaterial({
        map: art.graphics,
        roughness: 0.54,
        metalness: 0.02,
      }),
      entry: new THREE.MeshStandardMaterial({
        map: art.entry,
        roughness: 0.54,
        metalness: 0.02,
      }),
    };
    const base = Object.fromEntries(
      Object.entries(materials).map(([k, v]) => [k, v.color.clone()]),
    ) as Record<Surface, THREE.Color>;
    return {
      geometry,
      repeated,
      materials,
      base,
      dispose: () => {
        geometry.forEach((g) => g.geometry.dispose());
        Object.values(materials).forEach((m) => m.dispose());
        masonry.dispose();
        roof.dispose();
        concrete.dispose();
        art.dispose();
      },
    };
  }, [invalidate]);
  useEffect(() => () => resources.dispose(), [resources]);
  useEffect(() => {
    for (const key of Object.keys(resources.materials) as Surface[])
      resources.materials[key].color
        .copy(resources.base[key])
        .lerp(new THREE.Color("#9fa8a2"), toneDown * 0.7);
    invalidate();
  }, [resources, toneDown, invalidate]);
  const neutral =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).has("complexNeutral");
  return (
    <group
      name="sede-fenasoja-reference-reconstruction"
      position={architecturalOffset}
      scale={u}
      dispose={null}
      userData={{ entityBounds: [bounds.width, bounds.depth] }}
    >
      {resources.geometry.map(({ key, geometry }) => (
        <mesh
          key={key}
          name={`B12:${key}`}
          geometry={geometry}
          material={
            neutral ? resources.materials.concrete : resources.materials[key]
          }
          visible={showDetail || key !== "joint"}
          castShadow={key !== "glass" && key !== "graphics"}
          receiveShadow
          raycast={NO_RAYCAST}
          dispose={null}
        />
      ))}
      {[...resources.repeated].map(([key, matrices]) => (
        <RepeatedPlanting
          key={key}
          matrices={matrices}
          material={
            neutral ? resources.materials.concrete : resources.materials[key]
          }
          visible={showDetail}
        />
      ))}
    </group>
  );
}
