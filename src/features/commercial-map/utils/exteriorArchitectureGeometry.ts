import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ArchitectureModel, RoofForm } from "../data/exteriorArchitecture";

type Surface =
  | "plaster"
  | "roof"
  | "concrete"
  | "wood"
  | "glass"
  | "metal"
  | "brick";
interface Mass {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}
const PALETTE: Record<Surface, [string, number, number]> = {
  plaster: ["#c4baa5", 0.91, 0],
  roof: ["#97654e", 0.86, 0],
  concrete: ["#99968a", 0.96, 0],
  wood: ["#73604a", 0.94, 0],
  glass: ["#344849", 0.26, 0.16],
  metal: ["#777f7a", 0.55, 0.45],
  brick: ["#94715c", 0.98, 0],
};

export function architectureMasses(model: ArchitectureModel): Mass[] {
  let [w, d] = model.proportions;
  if (model.porch === "side" || model.porch === "wrap") w = Math.min(w, 0.73);
  if (model.porch === "front" || model.porch === "wrap") d = Math.min(d, 0.73);
  const z = model.porch === "front" || model.porch === "wrap" ? 0.1 : 0;
  const h = 0.93 - model.proportions[2];
  switch (model.plan) {
    case "L":
      return [
        { x: (w - 0.95) / 2, z, w, d, h },
        { x: w / 2, z: 0.25, w: 0.95 - w, d: 0.42, h: h * 0.87 },
      ];
    case "T":
      return [
        { x: 0, z: -0.45 + d / 2, w, d, h },
        { x: 0.1, z: d / 2, w: 0.4, d: 0.94 - d, h: h * 0.87 },
      ];
    case "U":
      return [
        { x: 0, z: 0.31, w, d: 0.3, h: h * 0.88 },
        { x: -w / 2 + 0.15, z: -0.14, w: 0.3, d: 0.59, h },
        { x: w / 2 - 0.15, z: -0.14, w: 0.3, d: 0.59, h },
      ];
    case "stepped":
      return [
        { x: -0.15, z: 0.02, w: Math.min(w, 0.62), d, h },
        { x: 0.32, z: 0.12, w: 0.28, d: d * 0.72, h: h * 0.66 },
      ];
    case "twin":
      return [
        { x: -w / 4, z, w: w / 2 - 0.012, d, h },
        { x: w / 4, z: z + 0.035, w: w / 2 - 0.012, d: d * 0.84, h: h * 0.91 },
      ];
    default:
      return [{ x: 0, z, w, d, h }];
  }
}

/** Closed pitched roof with visible eave thickness; no alpha or coplanar skins. */
function roofGeometry(
  form: RoofForm,
  width: number,
  depth: number,
  rise: number,
) {
  const w = width / 2,
    d = depth / 2;
  if (form === "hip") {
    const v = [
      [-w, 0, -d],
      [w, 0, -d],
      [w, 0, d],
      [-w, 0, d],
      [0, rise, -d * 0.52],
      [0, rise, d * 0.52],
    ];
    const faces = [
      [0, 4, 1],
      [1, 4, 5],
      [1, 5, 2],
      [2, 5, 3],
      [3, 5, 4],
      [3, 4, 0],
      [0, 1, 2],
      [0, 2, 3],
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        faces.flatMap((f) => f.flatMap((i) => v[i])),
        3,
      ),
    );
    g.computeVertexNormals();
    return g;
  }
  const section: [number, number][] =
    form === "flat"
      ? [
          [-w, 0],
          [-w, 0.026],
          [w, 0.026],
          [w, 0],
        ]
      : form === "mono"
        ? [
            [-w, 0],
            [-w, rise + 0.014],
            [w, 0.014],
            [w, 0],
          ]
        : form === "barrel"
          ? [
              [-w, 0],
              ...Array.from({ length: 9 }, (_, i): [number, number] => [
                -w + (width * i) / 8,
                0.014 + Math.sin((i / 8) * Math.PI) * rise,
              ]),
              [w, 0],
            ]
          : form === "saw"
            ? [
                [-w, 0],
                [-w, 0.014],
                ...Array.from({ length: 3 }, (_, i): [number, number][] => [
                  [-w + (width * (i + 0.86)) / 3, rise],
                  [-w + (width * (i + 0.86)) / 3, 0.014],
                  [-w + (width * (i + 1)) / 3, 0.014],
                ]).flat(),
                [w, 0],
              ]
            : [
                [-w, 0],
                [-w, 0.018],
                [0, rise],
                [w, 0.018],
                [w, 0],
              ];
  const shape = new THREE.Shape(section.map((p) => new THREE.Vector2(...p)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
  });
  g.translate(0, 0, -d);
  return g;
}

export function createArchitectureGeometry(
  model: ArchitectureModel,
  detail: boolean | "far",
) {
  const detailed = detail === true;
  const far = detail === "far";
  const parts: THREE.BufferGeometry[] = [];
  const color = new THREE.Color();
  const add = (
    source: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    surface: Surface,
    override?: string,
  ) => {
    const g = source.index ? source.toNonIndexed() : source;
    if (g !== source) source.dispose();
    g.translate(x, y, z);
    g.deleteAttribute("uv");
    const [base, baseRoughness, baseMetalness] = PALETTE[surface];
    const roughness =
      surface === "roof"
        ? model.finish === "metal"
          ? 0.57
          : model.finish === "cement"
            ? 0.96
            : 0.86
        : baseRoughness;
    const metalness =
      surface === "roof" && model.finish === "metal" ? 0.42 : baseMetalness;
    color.set(override ?? base);
    const count = g.getAttribute("position").count;
    const colors = new Float32Array(count * 3),
      properties = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      color.toArray(colors, i * 3);
      properties.set(
        [
          roughness,
          metalness,
          surface === "roof"
            ? model.finish === "metal"
              ? 4
              : model.finish === "cement"
                ? 5
                : 1
            : surface === "wood"
              ? 2
              : surface === "brick"
                ? 3
                : 0,
        ],
        i * 3,
      );
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("surface", new THREE.BufferAttribute(properties, 3));
    parts.push(g);
  };
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    surface: Surface,
    tint?: string,
  ) => {
    if (!detailed && surface === "glass") {
      // At map scale, opaque two-sided opening quads replace twelve-triangle boxes.
      const plane = new THREE.PlaneGeometry(w < d ? d : w, h).toNonIndexed();
      if (w < d) plane.rotateY(Math.PI / 2);
      const back = plane.clone();
      back.rotateY(Math.PI);
      const joined = mergeGeometries([plane, back]);
      plane.dispose();
      back.dispose();
      add(joined, x, y, z, surface, tint);
    } else add(new THREE.BoxGeometry(w, h, d), x, y, z, surface, tint);
  };
  const paletteIndex = Number(model.id.slice(1));
  const wall: Surface =
    model.finish === "timber"
      ? "wood"
      : model.finish === "brick"
        ? "brick"
        : "plaster";
  const roofColor =
    model.finish === "metal"
      ? "#8e9690"
      : model.finish === "cement"
        ? "#94958a"
        : ["#97654e", "#855e4f", "#a47353", "#806452"][paletteIndex % 4];
  const masses = architectureMasses(model);
  for (const [massIndex, m] of masses.entries()) {
    const { x, z, w, d, h } = m;
    box(x, 0.036, z, w, 0.072, d, "concrete");
    box(
      x,
      h / 2 + 0.04,
      z,
      w * 0.97,
      h,
      d * 0.97,
      wall,
      wall === "plaster"
        ? ["#c4baa5", "#b4b5a9", "#c9c5b8", "#bab09a", "#a3afa7", "#b9b1a8"][
            paletteIndex % 6
          ]
        : undefined,
    );
    const roofY = h + 0.042;
    add(
      roofGeometry(
        model.roof,
        w,
        d,
        model.proportions[2] * (massIndex ? 0.8 : 1),
      ),
      x,
      roofY,
      z,
      "roof",
      roofColor,
    );
    if (far) continue;
    // Eave fascia and plinth are important at normal map distance.
    for (const side of [-1, 1])
      box(x + side * w * 0.494, roofY, z, 0.014, 0.026, d, "wood");
    const hasGarage = model.garage && massIndex === masses.length - 1;
    const entryX = hasGarage ? x - w * 0.3 : x;
    const floors = massIndex && model.plan === "stepped" ? 1 : model.floors;
    const bays = Math.max(1, Math.round(model.proportions[3] * w));
    for (let floor = 0; floor < floors; floor++) {
      const unit = h / floors,
        y = 0.045 + unit * (floor + 0.55);
      for (let bay = 0; bay < bays; bay++) {
        const wx =
          x -
          w * 0.36 +
          (bays === 1 ? w * 0.36 : (bay * w * 0.72) / (bays - 1));
        const width = Math.min(w * 0.23, (w / bays) * 0.62);
        for (const side of [-1, 1]) {
          if (
            side === -1 &&
            floor === 0 &&
            (Math.abs(wx - entryX) < w * 0.16 ||
              (hasGarage && Math.abs(wx - x - w * 0.2) < w * 0.26))
          )
            continue;
          const fz = z + side * d * 0.488;
          if (detailed)
            box(
              wx,
              y,
              fz,
              width + 0.022,
              unit * 0.34 + 0.028,
              0.016,
              "concrete",
            );
          box(wx, y, fz + side * 0.009, width, unit * 0.34, 0.01, "glass");
          if (detailed) {
            box(wx, y, fz + side * 0.016, 0.009, unit * 0.34, 0.009, "wood");
            box(
              wx,
              y - unit * 0.19,
              fz + side * 0.019,
              width + 0.037,
              0.017,
              0.035,
              "concrete",
            );
          }
        }
      }
      for (const side of [-1, 1]) {
        box(x + side * w * 0.49, y, z, 0.016, unit * 0.3, d * 0.2, "glass");
        if (model.balcony && floor > 0) {
          box(
            x,
            y - unit * 0.43,
            z - d / 2 - 0.024,
            w * 0.72,
            0.024,
            0.08,
            "concrete",
          );
          box(
            x,
            y - unit * 0.22,
            z - d / 2 - 0.06,
            w * 0.72,
            0.018,
            0.009,
            "metal",
          );
        }
      }
    }
    box(
      entryX,
      0.045 + (h / floors) * 0.31,
      z - d * 0.495,
      w * 0.13,
      (h / floors) * 0.61,
      0.018,
      "wood",
    );
    if (model.garage && massIndex === masses.length - 1) {
      box(
        x + w * 0.2,
        h * 0.29 + 0.04,
        z - d * 0.497,
        w * 0.41,
        h * 0.55,
        0.022,
        "metal",
      );
      if (detailed)
        for (let slat = 0; slat < 5; slat++)
          box(
            x + w * 0.2,
            0.06 + h * (0.08 + slat * 0.09),
            z - d * 0.513,
            w * 0.4,
            0.006,
            0.008,
            "concrete",
          );
    }
    if (model.roof === "flat") {
      for (const side of [-1, 1]) {
        box(x + side * (w / 2 - 0.01), roofY + 0.058, z, 0.02, 0.09, d, wall);
        box(x, roofY + 0.058, z + side * (d / 2 - 0.01), w, 0.09, 0.02, wall);
      }
    }
    if (detailed) {
      for (const side of [-1, 1]) {
        box(x + side * w * 0.48, roofY - 0.018, z, 0.019, 0.022, d, "metal");
        box(
          x + side * w * 0.47,
          h * 0.49,
          z + d * 0.45,
          0.018,
          h * 0.91,
          0.018,
          "metal",
        );
      }
      if (model.category === "shed")
        for (let bay = 0; bay < model.proportions[3]; bay++)
          for (const side of [-1, 1])
            box(
              x + side * w * 0.492,
              h * 0.49,
              z - d * 0.43 + (bay * d * 0.86) / (model.proportions[3] - 1),
              0.021,
              h * 0.91,
              0.018,
              "concrete",
            );
      if (model.finish === "timber" && massIndex === 0)
        box(
          x + w * 0.23,
          roofY + model.proportions[2] * 0.58,
          z + d * 0.19,
          0.07,
          0.17,
          0.07,
          "brick",
        );
    }
  }
  if (model.porch !== "none") {
    const m = masses[0],
      front = model.porch !== "side";
    const pw = front ? Math.min(0.88, m.w) : 0.15,
      pd = front
        ? Math.max(0.05, Math.min(0.3, m.z - m.d / 2 + 0.48))
        : Math.min(0.87, m.d);
    const px = front ? m.x : 0.4,
      pz = front ? m.z - m.d / 2 - pd / 2 : m.z;
    box(px, 0.03, pz, pw, 0.06, pd, "concrete");
    box(px, m.h * 0.78, pz, pw, 0.027, pd, "roof", roofColor);
    for (const side of [-1, 1])
      box(
        px + (front ? side * pw * 0.42 : 0),
        m.h * 0.39,
        pz + (front ? -0.045 : side * pd * 0.42),
        0.026,
        m.h * 0.78,
        0.026,
        "wood",
      );
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  merged.computeBoundingBox();
  // Keep all architectural pieces inside the approved plan envelope, including balconies.
  const bounds = merged.boundingBox!;
  const sx = Math.max(1, Math.abs(bounds.min.x) * 2, bounds.max.x * 2);
  const sz = Math.max(1, Math.abs(bounds.min.z) * 2, bounds.max.z * 2);
  merged.scale(1 / sx, 1 / Math.max(1, bounds.max.y), 1 / sz);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  merged.name = `${model.id}:${far ? "far" : detailed ? "near" : "map"}`;
  return merged;
}

/** One PBR material shared by the entire architectural catalog, with per-vertex response. */
export function createArchitectureMaterial() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 1,
  });
  material.name = "ExteriorArchitectureSharedPBR";
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "attribute vec3 surface; varying vec3 vSurface; varying vec3 vArchitecture;\n" +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvSurface=surface; vArchitecture=position;",
    );
    shader.fragmentShader =
      "varying vec3 vSurface; varying vec3 vArchitecture;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      "#include <roughnessmap_fragment>\nroughnessFactor *= vSurface.x;",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <metalnessmap_fragment>",
      "#include <metalnessmap_fragment>\nmetalnessFactor *= vSurface.y;",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float detailFilter=1.0-smoothstep(.008,.065,length(fwidth(vArchitecture)));
      float ribs=sin(vArchitecture.x*180.0)*.65+sin(vArchitecture.z*90.0)*.35;
      float grain=sin(vArchitecture.y*180.0+sin(vArchitecture.z*21.0));
      float pattern = vSurface.z<1.5 ? ribs : vSurface.z<3.5 ? grain : vSurface.z<4.5 ? sin(vArchitecture.x*120.0)*.6 : grain*.12;
      diffuseColor.rgb *= 1.0 + step(.5,vSurface.z)*pattern*.075*detailFilter;
    `,
    );
  };
  material.customProgramCacheKey = () => "exterior-architecture-pbr-v1";
  return material;
}
