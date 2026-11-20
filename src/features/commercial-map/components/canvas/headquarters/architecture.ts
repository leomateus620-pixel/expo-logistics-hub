import * as THREE from "three";
import { FENASOJA_COMPLEX as SPEC } from "../../../data/fenasojaComplexReconstruction";
import type { GeometryBuilder, V3 } from "./geometry";
const hq = SPEC.headquarters;
const mainCenterZ = hq.volumes.main.center[1];
const front = mainCenterZ + hq.volumes.main.depth / 2;
const rearZ = mainCenterZ - hq.volumes.main.depth / 2;
export function buildShell(builder: GeometryBuilder) {
  const { box, bevel, put, beam, tube, polygon, detail } = builder;
  // The structural shell keeps the registered footprint. Openings have real reveals.
  bevel("wall", [-2.63, 2.3, mainCenterZ - 0.09], [1.24, 4.6, 6.72], 0.018);
  bevel("wall", [2.63, 2.3, mainCenterZ - 0.09], [1.24, 4.6, 6.72], 0.018);
  box("wall", [0, 3.27, mainCenterZ - 0.09], [4.05, 1.26, 6.72]);
  box("wall", [0, 1.3, rearZ + 0.12], [4.05, 2.6, 0.24]);
  // Restrained interior parallax: warm plaster, floor and shallow reception elements.
  box("warmInterior", [0, 1.3, 1.62], [4.04, 2.6, 0.15]);
  box("warmInterior", [-1.98, 1.3, 3.0], [0.07, 2.6, 2.8]);
  box("warmInterior", [1.98, 1.3, 3.0], [0.07, 2.6, 2.8]);
  box("concrete", [0, 0.1, 3.02], [4.04, 0.08, 3.1]);
  box("soffit", [0, 2.5, 3.3], [3.8, 0.09, 2.3]);
  bevel("wood", [-1.18, 0.43, 1.8], [1.15, 0.68, 0.3], 0.025);
  bevel("trim", [-1.18, 0.79, 1.8], [1.2, 0.035, 0.35], 0.008);
  detail(2);
  for (let i = 0; i < 6; i++) {
    const x = -1.3 + (i % 3) * 0.77,
      y = 1.45 + Math.floor(i / 3) * 0.48;
    bevel("wood", [x, y, 1.715], [0.34, 0.37, 0.018], 0.005);
    box("soffit", [x, y, 1.729], [0.27, 0.3, 0.005]);
    box("interior", [x, y - 0.025, 1.734], [0.12, 0.17, 0.004]);
  }
  for (const x of [-0.85, 0.85]) {
    put("metal", new THREE.CylinderGeometry(0.082, 0.082, 0.015, 16), [
      x,
      2.435,
      3.6,
    ]);
    put(
      "warmInterior",
      new THREE.CircleGeometry(0.064, 16),
      [x, 2.425, 3.6],
      [-Math.PI / 2, 0, 0],
    );
  }
  detail(0);
  const tri = hq.glazing,
    tw = tri.triangleWidth / 2;
  const base = tri.triangleBase,
    shoulder = 6.25,
    top = base + tri.triangleRise;
  // One continuous extruded facade, with three genuine apertures. No overlapping wall strips.
  const outline = new THREE.Shape([
    new THREE.Vector2(-3.25, 0),
    new THREE.Vector2(3.25, 0),
    new THREE.Vector2(3.25, 4.6),
    new THREE.Vector2(0, 8.2),
    new THREE.Vector2(-3.25, 4.6),
  ]);
  for (const points of [
    [
      [-2.01, 0.11],
      [-2.01, 2.64],
      [2.01, 2.64],
      [2.01, 0.11],
    ],
    [
      [-2.07, tri.lowerBottom - 0.025],
      [-2.07, tri.lowerBottom + tri.lowerHeight + 0.045],
      [2.07, tri.lowerBottom + tri.lowerHeight + 0.045],
      [2.07, tri.lowerBottom - 0.025],
    ],
    [
      [-tw, base],
      [-tw, shoulder],
      [0, top],
      [tw, shoulder],
      [tw, base],
    ],
  ])
    outline.holes.push(
      new THREE.Path(points.map(([x, y]) => new THREE.Vector2(x, y))),
    );
  const facade = new THREE.ExtrudeGeometry(outline, {
    depth: 0.15,
    bevelEnabled: true,
    bevelSize: 0.004,
    bevelThickness: 0.004,
    bevelSegments: 1,
    curveSegments: 1,
  });
  facade.translate(0, 0, front - 0.154);
  put("wall", facade);
  polygon("wall", [
    [-3.25, 4.6, rearZ],
    [0, 8.2, rearZ],
    [3.25, 4.6, rearZ],
  ]);
  const opening: V3[] = [
    [-tw, base, front - 0.06],
    [tw, base, front - 0.06],
    [tw, shoulder, front - 0.06],
    [0, top, front - 0.06],
    [-tw, shoulder, front - 0.06],
  ];
  polygon("glass", opening);
  polygon(
    "interior",
    opening.map(([x, y, z]) => [x, y, z - 0.74] as V3),
  );
  for (let i = 0; i < opening.length; i++) {
    const a = opening[i],
      b = opening[(i + 1) % opening.length];
    polygon("soffit", [
      a,
      b,
      [b[0], b[1], front + 0.025],
      [a[0], a[1], front + 0.025],
    ]);
    beam(
      "frame",
      [a[0], a[1], front + 0.018],
      [b[0], b[1], front + 0.018],
      0.072,
      0.11,
    );
  }
  const bandTop = 6.56;
  for (const x of [-1.08, 1.08]) {
    const upper = top - (Math.abs(x) / tw) * (top - shoulder);
    beam(
      "frame",
      [x, base, front + 0.017],
      [x, upper, front + 0.017],
      0.074,
      0.11,
    );
  }
  // The ridge post, dark crosspiece and white diagonal braces are inside the glass.
  beam(
    "soffit",
    [0, bandTop, front - 0.42],
    [0, top - 0.035, front - 0.42],
    0.12,
    0.11,
  );
  for (const side of [-1, 1])
    beam(
      "soffit",
      [side * 0.08, base + 0.075, front - 0.41],
      [side * 0.66, 6.32, front - 0.41],
      0.155,
      0.12,
    );
  const bandBottom = 6.04;
  bevel(
    "contact",
    [0, (bandBottom + bandTop) / 2, front - 0.24],
    [2.13, bandTop - bandBottom, 0.13],
    0.012,
  );
  // Lower campaign row: inset wall opening, sill, separate prints behind glazing.
  const bottom = tri.lowerBottom - 0.05,
    height = tri.lowerHeight + 0.1;
  box(
    "interior",
    [0, bottom + height / 2, front - 0.28],
    [4.05, height, 0.025],
  );
  for (let i = 0; i < 4; i++) {
    const x = ((i - 1.5) * tri.lowerWidth) / 4;
    const pane = new THREE.PlaneGeometry(
        tri.lowerWidth / 4 - 0.085,
        tri.lowerHeight - 0.045,
      ),
      uv = pane.getAttribute("uv");
    for (let j = 0; j < uv.count; j++) uv.setX(j, (uv.getX(j) + i) / 4);
    put("graphics", pane, [
      x,
      tri.lowerBottom + tri.lowerHeight / 2,
      front - 0.105,
    ]);
    put(
      "glass",
      new THREE.PlaneGeometry(
        tri.lowerWidth / 4 - 0.066,
        tri.lowerHeight - 0.035,
      ),
      [x, tri.lowerBottom + tri.lowerHeight / 2, front - 0.059],
    );
  }
  for (const r of [-1, -0.5, 0, 0.5, 1])
    bevel(
      "frame",
      [
        (r * tri.lowerWidth) / 2,
        tri.lowerBottom + tri.lowerHeight / 2,
        front - 0.022,
      ],
      [0.08, tri.lowerHeight + 0.1, 0.17],
      0.005,
    );
  for (const y of [tri.lowerBottom, tri.lowerBottom + tri.lowerHeight])
    bevel(
      "frame",
      [0, y, front - 0.022],
      [tri.lowerWidth + 0.13, 0.08, 0.17],
      0.005,
    );
  bevel(
    "trim",
    [0, tri.lowerBottom - 0.067, front + 0.015],
    [tri.lowerWidth + 0.23, 0.055, 0.22],
    0.008,
  );

  // Main gabled roof: thickness, white soffits, ridge cap, visible eave rafters.
  const m = hq.volumes.main,
    half = m.width / 2 + m.overhang,
    pitch = m.pitch,
    slope = Math.hypot(half, m.ridge - m.eave);
  for (const side of [-1, 1]) {
    const p: V3 = [(side * half) / 2, (m.ridge + m.eave) / 2, mainCenterZ],
      r: V3 = [0, 0, -side * pitch];
    box("roof", p, [slope, 0.1, m.depth + 0.72], r);
    detail(2);
    // Continuous ceramic field. The verge and ridge carry the profiles in silhouette.
    const roofField = new THREE.PlaneGeometry(slope, m.depth + 0.72, 48, 96);
    const rf = roofField.getAttribute("position");
    for (let i = 0; i < rf.count; i++) {
      const run = rf.getX(i) + slope / 2,
        z = rf.getY(i) + mainCenterZ;
      const channel = 0.015 * (1 + Math.cos((z / 0.32) * Math.PI * 2));
      const row = run / 0.43 - Math.floor(run / 0.43),
        lap = 0.009 * Math.exp(-((row - 0.045) * (row - 0.045)) / 0.003);
      const lift = 0.057 + channel + lap,
        t = run / slope;
      rf.setXYZ(
        i,
        side * half * t + side * Math.sin(pitch) * lift,
        m.ridge - (m.ridge - m.eave) * t + Math.cos(pitch) * lift,
        z,
      );
    }
    if (side > 0) {
      const ix = roofField.index!;
      for (let i = 0; i < ix.count; i += 3) {
        const old = ix.getX(i + 1);
        ix.setX(i + 1, ix.getX(i + 2));
        ix.setX(i + 2, old);
      }
    }
    roofField.computeVertexNormals();
    put("roof", roofField);
    detail(0);

    box(
      "soffit",
      [p[0], p[1] - 0.085, mainCenterZ],
      [slope, 0.075, m.depth + 0.68],
      r,
    );
    for (const z of [rearZ - 0.37, front + 0.37])
      bevel("trim", [p[0], p[1] - 0.045, z], [slope, 0.22, 0.15], 0.009, r);
    box(
      "trim",
      [side * half, m.eave - 0.09, mainCenterZ],
      [0.14, 0.2, m.depth + 0.7],
    );
    // Individual curved edge profiles only along the visible verge; the field is a tile normal/roughness atlas.
    detail(2);
    const tileCount = 17;
    for (let i = 0; i < tileCount; i++) {
      const t = (i + 0.5) / tileCount;
      const x = side * half * t,
        y = m.ridge - (m.ridge - m.eave) * t;
      const cap = new THREE.CylinderGeometry(
        0.105,
        0.11,
        0.37,
        10,
        1,
        true,
        0,
        Math.PI,
      );
      put(
        "roof",
        cap,
        [x, y + 0.035, front + 0.29],
        [Math.PI / 2, 0, -side * pitch],
      );
      if (i % 2 === 0)
        bevel(
          "soffit",
          [x, y - 0.15, front + 0.14],
          [0.12, 0.13, 0.49],
          0.004,
          [0, 0, -side * pitch],
        );
    }
    detail(0);
    // The layered verge and exposed timber ends remain readable outside the close LOD.
    beam(
      "soffit",
      [side * 0.06, m.ridge - 0.24, front + 0.26],
      [side * (half - 0.1), m.eave - 0.13, front + 0.26],
      0.16,
      0.14,
    );
    beam(
      "trim",
      [side * 0.12, m.ridge - 0.31, front + 0.23],
      [side * (half - 0.12), m.eave - 0.20, front + 0.23],
      0.09,
      0.18,
    );
    for (let i = 0; i < 12; i++) {
      const z = rearZ + 0.18 + (i * (m.depth - 0.3)) / 11;
      bevel(
        "soffit",
        [side * (half - 0.08), m.eave - 0.15, z],
        [0.38, 0.14, 0.09],
        0.006,
        [0, 0, -side * pitch],
      );
    }
  }
  for (let i = 0; i < 18; i++) {
    const z = rearZ - 0.34 + (i * (m.depth + 0.68)) / 18;
    put(
      "roof",
      new THREE.CylinderGeometry(
        0.125,
        0.14,
        (m.depth + 0.68) / 18 + 0.035,
        12,
        1,
        true,
        0,
        Math.PI,
      ),
      [0, m.ridge + 0.025, z],
      [Math.PI / 2, 0, 0],
    );
  }
  bevel("trim", [0, 7.82, front + 0.42], [0.23, 0.6, 0.28], 0.008);
  beam(
    "soffit",
    [0, 7.8, front + 0.36],
    [0, 6.99, front - 0.47],
    0.24,
    0.25,
  );
  // Roof volumes follow the registered plan and share their wall junctions.
  const hip = (
    cx: number,
    cz: number,
    w: number,
    d: number,
    eave: number,
    ridge: number,
  ) => {
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
  for (const rear of [hq.volumes.rearLeft, hq.volumes.rearRight]) {
    const { center: [x, z], width, depth, eave, ridge } = rear;
    hip(x, z, width, depth, eave, ridge);
    box("wall", [x, eave / 2, z], [width, eave, depth]);
  }
  const room = hq.volumes.volunteers;
  hip(...room.center, room.width, room.depth, room.eave, room.ridge);
  // The annex glazing sits in a real reveal within the same registered exterior walls.
  const [roomX, roomZ] = room.center;
  const revealDepth = 0.24;
  const roomFront = roomZ + room.depth / 2;
  const windowBase = 1.02;
  const windowTop = 2.19;
  const windowCenter = (windowBase + windowTop) / 2;
  const windowWidth = 2.35;
  const windowHeight = windowTop - windowBase;
  const jambWidth = (room.width - windowWidth) / 2;
  box(
    "wall",
    [roomX, room.eave / 2, roomZ - revealDepth / 2],
    [room.width, room.eave, room.depth - revealDepth],
  );
  const revealZ = roomFront - revealDepth / 2;
  for (const [low, high] of [[0, windowBase], [windowTop, room.eave]])
    box(
      "wall",
      [roomX, (low + high) / 2, revealZ],
      [room.width, high - low, revealDepth],
    );
  for (const side of [-1, 1])
    box(
      "wall",
      [roomX + side * (windowWidth + jambWidth) / 2, windowCenter, revealZ],
      [jambWidth, windowHeight, revealDepth],
    );
  box(
    "interior",
    [roomX, windowCenter, roomFront - 0.217],
    [windowWidth, windowHeight, 0.025],
  );
  put(
    "glass",
    new THREE.PlaneGeometry(windowWidth, windowHeight),
    [roomX, windowCenter, roomFront - 0.066],
  );
  for (const i of [-1, 0, 1])
    box(
      "frame",
      [roomX + (i * windowWidth) / 2, windowCenter, roomFront + 0.015],
      [0.085, windowHeight + 0.06, 0.15],
    );
  for (const y of [windowBase, windowTop])
    box(
      "frame",
      [roomX, y, roomFront + 0.015],
      [windowWidth + 0.085, 0.08, 0.15],
    );
  // Front-left wing adjoins the main volume, without an artificial alley.
  box("sideWall", [-3.48, 1.23, 5.55], [1.9, 2.46, 2.45]);
  box("roof", [-3.48, 2.77, 6.07], [2.04, 0.11, 3.7], [0.16, 0, 0]);
  box("trim", [-3.48, 2.5, 7.85], [2.04, 0.19, 0.12]);
  for (const x of [-4.38, -3.94, -3.5, -3.06, -2.62])
    beam("soffit", [x, 2.81, 5.45], [x, 2.43, 7.84], 0.1, 0.14);
  // Modest left wing; the projecting canopy never blocks the central doorway.
  box("sideWall", [-4.33, 1.17, 7.1], [0.18, 2.34, 1.0]);
  // A few conservative side/rear panes give depth without invented elevations.
  for (const z of [-2.7, 0, 2.7]) {
    box("glass", [3.27, 1.85, z], [0.05, 1.2, 1.0]);
    for (const y of [1.2, 2.49]) box("trim", [3.31, y, z], [0.075, 0.075, 1.1]);
  }
  // Recessed central threshold and layered sliding door frame. Side campaign panes remain transparent overlays.
  bevel("concrete", [0, 0.085, front - 0.04], [4.02, 0.13, 0.6], 0.012);
  bevel("frame", [0, 2.56, front + 0.028], [3.87, 0.15, 0.25], 0.007);
  for (const side of [-1, 1]) {
    const x = side * 1.22;
    bevel(
      "soffit",
      [side * 1.99, 1.28, front - 0.11],
      [0.14, 2.54, 0.43],
      0.008,
    );
    put("glass", new THREE.PlaneGeometry(1.1, 2.42), [x, 1.27, front - 0.106]);
    const graphic = new THREE.PlaneGeometry(0.98, 2.2),
      uv = graphic.getAttribute("uv");
    for (let j = 0; j < uv.count; j++)
      uv.setX(j, (uv.getX(j) + (side > 0 ? 1 : 0)) / 2);
    put("entry", graphic, [x, 1.3, front - 0.157]);
    for (const edge of [-0.56, 0.56])
      bevel(
        "frame",
        [x + edge, 1.27, front - 0.074],
        [0.083, 2.55, 0.15],
        0.005,
      );
    for (const y of [0.06, 0.72, 2.5])
      bevel("frame", [x, y, front - 0.07], [1.18, 0.095, 0.15], 0.005);
    // Narrow door edge set back from the frontage; small handles and runners are close-range geometry.
    detail(2);
    bevel(
      "frame",
      [side * 0.65, 1.25, front - 0.38],
      [0.045, 2.43, 0.075],
      0.003,
    );
    tube(
      "metal",
      [
        [side * 0.68, 0.95, front - 0.34],
        [side * 0.68, 0.99, front - 0.27],
        [side * 0.68, 1.26, front - 0.27],
        [side * 0.68, 1.3, front - 0.34],
      ],
      0.014,
    );
    detail(0);
  }
  for (const x of [-0.64, 0.64])
    beam(
      "metal",
      [x, 0.13, front - 0.3],
      [x, 0.13, front + 0.24],
      0.022,
      0.012,
    );
  // Bend both faces of the panel so the artwork and solid share the same profile.
  const sw = hq.sign.width,
    sh = hq.sign.height,
    ys = hq.sign.bottom,
    zs = front + 0.36;
  const panelBow = (x: number) => hq.sign.bulge * (1 - ((2 * x) / sw) ** 2);
  const bendPanel = (geometry: THREE.BufferGeometry) => {
    const vertices = geometry.getAttribute("position");
    for (let i = 0; i < vertices.count; i++) {
      const bow = panelBow(vertices.getX(i));
      vertices.setZ(i, vertices.getZ(i) + bow);
    }
    geometry.computeVertexNormals();
    return geometry;
  };
  const faceSegments = 40;
  const casing = new THREE.BoxGeometry(sw, sh, hq.sign.depth, faceSegments);
  // BoxGeometry group 4 faces +Z. The artwork mesh supplies that face.
  const { start, count } = casing.groups[4];
  const indices = Array.from(casing.index!.array);
  indices.splice(start, count);
  casing.setIndex(indices);
  casing.clearGroups();
  put(
    "trim",
    bendPanel(casing),
    [0, ys + sh / 2, zs - hq.sign.depth / 2],
  );
  put(
    "sign",
    bendPanel(new THREE.PlaneGeometry(sw, sh, faceSegments)),
    [0, ys + sh / 2, zs],
  );
  for (const x of [-2.35, 0, 2.35]) {
    const back = zs - hq.sign.depth + panelBow(x);
    bevel(
      "metal",
      [x, ys + sh * 0.55, (back + front) / 2],
      [0.085, 0.32, back - front + 0.04],
      0.008,
    );
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
}
