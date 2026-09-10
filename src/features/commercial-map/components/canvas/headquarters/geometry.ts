import * as THREE from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
export type V3 = [number, number, number];
export type Surface =
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
  | "entry"
  | "sideWall"
  | "soffit"
  | "frame"
  | "contact"
  | "wood"
  | "warmInterior";

export function createHeadquartersGeometry() {
  const buckets = new Map<string, THREE.BufferGeometry[]>();
  let lod: 0 | 1 | 2 = 0;
  const detail = (level: 0 | 1 | 2) => {
    lod = level;
  };
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
    const pos = geom.getAttribute("position"),
      normals = geom.getAttribute("normal"),
      uv = geom.getAttribute("uv");
    const colors = new Float32Array(pos.count * 3);
    const textured = [
      "wall",
      "sideWall",
      "roof",
      "concrete",
      "pedestal",
      "soil",
      "pot",
    ].includes(key);
    const variation =
      key === "foliage"
        ? 0.82 +
          0.18 * (0.5 + 0.5 * Math.sin(p[0] * 11 + p[2] * 17 + pos.count))
        : 1;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i);
      if (textured) {
        const nx = Math.abs(normals.getX(i)),
          ny = Math.abs(normals.getY(i)),
          nz = Math.abs(normals.getZ(i));
        if (key === "roof")
          uv.setXY(i, z / 0.32, (Math.abs(x) * Math.SQRT2) / 0.43);
        else if (ny > nx && ny > nz) uv.setXY(i, x, z);
        else if (nx > nz) uv.setXY(i, z, y);
        else uv.setXY(i, x, y);
      }
      // Material colour variation is independent of solar direction; no baked photo shadows.
      const c =
        variation *
        (key === "foliage" ? 0.9 + 0.1 * Math.min(1, Math.max(0, y) / 2) : 1);
      colors.set(
        [
          c,
          key === "foliage" ? Math.min(1, c * 1.04) : c,
          key === "foliage" ? c * 0.87 : c,
        ],
        i * 3,
      );
    }
    geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const bucketKey = key + ":" + lod;
    const list = buckets.get(bucketKey) || [];
    list.push(geom);
    buckets.set(bucketKey, list);
  };
  const box = (key: Surface, p: V3, s: V3, r: V3 = [0, 0, 0]) =>
    put(key, new THREE.BoxGeometry(...s), p, r);
  const bevel = (
    key: Surface,
    p: V3,
    s: V3,
    radius = 0.012,
    r: V3 = [0, 0, 0],
  ) => {
    const g = new RoundedBoxGeometry(...s, 1, radius);
    put(key, g, p, r);
  };
  const lathe = (
    key: Surface,
    profile: [number, number][],
    p: V3,
    segments = 32,
  ) =>
    put(
      key,
      new THREE.LatheGeometry(
        profile.map((v) => new THREE.Vector2(...v)),
        segments,
      ),
      p,
    );
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
  const finish = () => ({
    // A deterministic progressive order keeps all beds represented when count is reduced.
    repeated: new Map(
      [...repeated].map(([key, matrices]) => [
        key,
        matrices
          .map((matrix, i) => ({
            matrix,
            rank: (Math.sin((i + 1) * 127.1) * 43758.5453) % 1,
          }))
          .sort((a, b) => a.rank - b.rank)
          .map((item) => item.matrix),
      ]),
    ),
    geometry: [...buckets.entries()].map(([bucketKey, parts]) => {
      const [key, level] = bucketKey.split(":") as [Surface, string];
      const merged = mergeGeometries(parts, false)!;
      // Deduplicate identical attributes, preserving hard normals, UV and colour seams.
      const geometry = mergeVertices(merged, 1e-5);
      merged.dispose();
      parts.forEach((g) => g.dispose());
      geometry.computeBoundingSphere();
      geometry.name = `B12:${key}`;
      return { key, geometry, lod: Number(level) };
    }),
  });
  return {
    put,
    box,
    bevel,
    lathe,
    sphere,
    beam,
    tube,
    polygon,
    detail,
    finish,
  };
}

export type GeometryBuilder = ReturnType<typeof createHeadquartersGeometry>;
