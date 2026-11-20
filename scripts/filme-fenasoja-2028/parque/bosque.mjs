import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
const groveMeshes = new WeakSet(),
  duplicateBase = new T.Matrix4().makeScale(0, 0, 0);

const seedGenerator = (s) => () => {
  s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
  return s / 4294967296;
};
const barkColors = ["#645747", "#756c5b", "#716354", "#686559", "#786959", "#685d50"];
// Anéis de casca ao longo de uma curva que conserva a espessura na bifurcação.
function crookedStem(points, radii, roundness, seed, color) {
  const pos = [],
    uv = [],
    col = [],
    idx = [],
    up = new T.Vector3(0, 0, 1),
    c = new T.Color(color);
  const curve = new T.CatmullRomCurve3(points, false, "centripetal"),
    step = (points.length - 1) * 3;
  for (let j = 0; j <= step; j++) {
    const t = j / step,
      p = curve.getPoint(t),
      d = curve.getTangent(t);
    const right = new T.Vector3().crossVectors(d, up).normalize(),
      front = new T.Vector3().crossVectors(right, d).normalize();
    const k = Math.min(radii.length - 2, Math.floor(t * (radii.length - 1))),
      v = t * (radii.length - 1) - k;
    const thickness = radii[k] * (1 - v) + radii[k + 1] * v;
    for (let i = 0; i <= roundness; i++) {
      const u = i / roundness,
        ang = u * Math.PI * 2;
      const ridges = 1 + 0.068 * Math.cos(ang * 5 + seed + 0.27 * t) + 0.037 * Math.sin(ang * 3 - seed + t * 2);
      const a = p
        .clone()
        .addScaledVector(right, thickness * ridges * Math.cos(ang))
        .addScaledVector(front, thickness * ridges * Math.sin(ang));
      pos.push(a.x, a.y, a.z);
      uv.push(u, t * 2.7);
      const light = 0.88 + 0.15 * Math.cos(ang * 5 + seed + 0.27 * t) + 0.05 * Math.sin(ang * 3 + t * 2.5);
      col.push(c.r * light, c.g * light, c.b * light);
      if (j && i) {
        const e = j * (roundness + 1) + i;
        idx.push(e - 1, e - roundness - 1, e - roundness - 2, e - roundness - 1, e - 1, e);
      }
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new T.Float32BufferAttribute(col, 3));
  geo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
export const groveAudit = [];
const contactCanvas = document.createElement("canvas");
contactCanvas.width = 64;
contactCanvas.height = 64;
const ctx = contactCanvas.getContext("2d"),
  fade = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
fade.addColorStop(0, "rgba(45,34,23,.43)");
fade.addColorStop(0.28, "rgba(43,33,22,.23)");
fade.addColorStop(0.7, "rgba(35,32,23,.08)");
fade.addColorStop(1, "rgba(30,29,23,0)");
ctx.fillStyle = fade;
ctx.fillRect(0, 0, 64, 64);
const stain = new T.MeshBasicMaterial({
  map: new T.CanvasTexture(contactCanvas),
  transparent: true,
  opacity: 0.77,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  toneMapped: false,
});
export function resolveGrove(m) {
  if (!m.isInstancedMesh || !m.name.startsWith("pilot-trunks-") || groveMeshes.has(m)) return;
  groveMeshes.add(m);
  const branches = [],
    shadows = [],
    family = m.parent.userData.family || 0,
    mat = m.material;
  for (let i = 0; i < m.count; i++) {
    const xform = new T.Matrix4();
    m.getMatrixAt(i, xform);
    const at = new T.Vector3().setFromMatrixPosition(xform);
    // Limites do bosque no sistema de coordenadas do mapa.
    if (at.x < 15.25 || at.x > 34.5 || at.z < 7 || at.z > 25.6) continue;
    // A mesma implantação e o mesmo índice produzem os mesmos ramos.
    const key = (Math.round(at.x * 113) ^ (Math.round(at.z * 173) * 269) ^ ((i + 41) * (family + 143))) >>> 0;
    const random = seedGenerator(key),
      V = (x, y, z) => new T.Vector3(x, y, z);
    const az = random() * 6.28,
      lean = 0.07 + random() * 0.16,
      drift = V(Math.cos(az) * lean, 0, Math.sin(az) * lean);
    const d = (h) => V(drift.x * h + 0.041 * Math.sin(h * 1.8 + az) * h, h, drift.z * h + 0.046 * Math.sin(h * 2.2 - az) * h);
    const fork = 1.14 + random() * 0.66,
      top = 2.55 + random() * 0.39,
      rad = 0.078 + random() * 0.039,
      base = d(0),
      color = barkColors[Math.floor(random() * barkColors.length)];
    const add = (ps, rs, sides) => branches.push(crookedStem(ps, rs, sides, random() * 6.28, color).applyMatrix4(xform));
    add(
      [base, d(0.085), d(0.34), d(fork * 0.63), d(fork), d((fork + top) / 2), d(top)],
      [rad * 1.68, rad * 1.27, rad, rad * 0.84, rad * 0.68, rad * 0.39, rad * 0.081],
      14,
    );
    const n = 2 + Math.floor(random() * 3);
    for (let j = 0; j < n; j++) {
      const a = az + (j * 6.283) / n + (random() - 0.5) * 0.72,
        h = fork + (j === 0 ? -0.3 : random() * 0.5),
        ext = 0.4 + random() * 0.37;
      const root = d(h),
        dir = V(Math.cos(a), 0, Math.sin(a)),
        mid = root.clone().addScaledVector(dir, ext * 0.51);
      mid.y += 0.27 + random() * 0.29;
      const end = root.clone().addScaledVector(dir, ext);
      end.y = 2.46 + random() * 0.48;
      add([root, mid, end], [rad * (j === 0 ? 0.69 : 0.52), rad * 0.37, rad * 0.087], 9);
      const start = mid.clone().lerp(end, 0.36);
      const sprig = end.clone().addScaledVector(V(-dir.z, 0, dir.x), 0.18 + random() * 0.18);
      sprig.y -= 0.07;
      add([start, start.clone().lerp(sprig, 0.46).addScaledVector(dir, 0.04), sprig], [rad * 0.2, rad * 0.11, 0.002], 6);
    }
    // Raízes aflorantes curtas, acompanhando o solo.
    const roots = 3 + Math.floor(random() * 3);
    for (let j = 0; j < roots; j++) {
      const angle = az + (6.28 * (j + random() * 0.46)) / roots,
        axis = V(Math.cos(angle), 0, Math.sin(angle)),
        span = 0.16 + random() * 0.13;
      const a = d(0.11 + random() * 0.059),
        b = axis.clone().multiplyScalar(span * 0.69);
      b.y = 0.033;
      const c = axis.clone().multiplyScalar(span);
      c.y = 0.004;
      add([a, b, c], [rad * 0.52, rad * 0.28, 0.003], 8);
    }
    const contact = new T.PlaneGeometry(0.95, 0.76)
      .rotateX(-Math.PI * 0.5)
      .rotateY(random() * 6.28)
      .translate(0, 0.006, 0)
      .applyMatrix4(xform);
    shadows.push(contact);
    m.setMatrixAt(i, duplicateBase);
    groveAudit.push({ source: m.parent.userData.treeIds[i], x: at.x, z: at.z, family });
  }
  if (!branches.length) return;
  m.instanceMatrix.needsUpdate = true;
  const out = new T.Mesh(mergeGeometries(branches), mat);
  out.name = "film-troncos-do-bosque-B12-" + family;
  out.castShadow = true;
  out.receiveShadow = true;
  m.parent.add(out);
  branches.forEach((x) => x.dispose());
  const shadow = new T.Mesh(mergeGeometries(shadows), stain);
  shadow.name = "film-sombra-de-contato-bosque-B12";
  shadow.renderOrder = 1;
  m.parent.add(shadow);
  shadows.forEach((x) => x.dispose());
}
