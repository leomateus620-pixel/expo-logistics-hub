import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Opaque, overlapping branch crowns: no alpha sorting, billboards or disappearing trees. */
export function createExteriorTree(species: number, detail: boolean | "far") {
  const detailed = detail === true;
  const far = detail === "far";
  const pieces: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, hex: string) => {
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    flat.deleteAttribute("uv");
    const colors: number[] = [],
      color = new THREE.Color(hex);
    for (let i = 0; i < flat.getAttribute("position").count; i++)
      colors.push(color.r, color.g, color.b);
    flat.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    pieces.push(flat);
  };
  const trunk = new THREE.CylinderGeometry(0.035, 0.062, 0.63, 5);
  trunk.translate(0, 0.31, 0);
  add(trunk, "#7c705c");
  if (!detailed) {
    const crown = new THREE.SphereGeometry(1, far ? 8 : 11, far ? 5 : 7);
    const p = crown.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        y = p.getY(i),
        z = p.getZ(i);
      const angle = Math.atan2(z, x);
      const lobe =
        1 +
        Math.sin(angle * 3 + species * 0.9) * 0.13 +
        Math.sin(y * 9 + angle * 2) * 0.07;
      p.setXYZ(i, x * 0.87 * lobe, 0.69 + y * 0.3, z * 0.83 * lobe);
    }
    crown.computeVertexNormals();
    add(crown, ["#58744c", "#617b50", "#506d49"][species]);
  }
  const count = detailed ? 5 : 0;
  for (let i = 0; i < count; i++) {
    const angle = i * 2.39996 + species * 0.77;
    const radius = i === 0 ? 0 : 0.3 + (i % 2) * 0.12;
    const x = Math.cos(angle) * radius,
      z = Math.sin(angle) * radius;
    const y = 0.62 + (i % 3) * 0.1;
    const crown = new THREE.IcosahedronGeometry(1, detailed ? 1 : 0);
    crown.scale(
      0.53 - species * 0.035,
      0.19 + species * 0.03,
      0.46 + (i % 2) * 0.06,
    );
    crown.rotateY(angle);
    crown.translate(x, y, z);
    add(crown, ["#58744c", "#617b50", "#506d49"][i % 3]);
    if (detailed && i > 0) {
      const a = new THREE.Vector3(0, 0.34, 0),
        b = new THREE.Vector3(x, y - 0.06, z);
      const branch = new THREE.CylinderGeometry(
        0.012,
        0.026,
        a.distanceTo(b),
        4,
      );
      branch.applyQuaternion(
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          b.clone().sub(a).normalize(),
        ),
      );
      branch.translate(...a.add(b).multiplyScalar(0.5).toArray());
      add(branch, "#7c705c");
    }
  }
  const result = mergeGeometries(pieces);
  pieces.forEach((p) => p.dispose());
  result.computeBoundingBox();
  // Tree root and maximum height stay at their approved values.
  const bounds = result.boundingBox!;
  result.scale(
    1 / Math.max(1, Math.abs(bounds.min.x), bounds.max.x),
    1 / bounds.max.y,
    1 / Math.max(1, Math.abs(bounds.min.z), bounds.max.z),
  );
  result.computeBoundingSphere();
  return result;
}
