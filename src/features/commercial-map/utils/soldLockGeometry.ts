import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A low-relief closed lock: graphite bevelled body, steel shackle and a yellow
 * face with a recessed-looking keyhole. Face points up for overhead mobile use.
 * All parts merge into ONE vertex-coloured geometry and ONE instanced draw. */
export function createSoldLockGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const add = (source: THREE.BufferGeometry, color: string) => {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    const c = new THREE.Color(color);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(geometry);
  };
  const body = new THREE.Shape();
  body.moveTo(-0.38, -0.48); body.lineTo(0.38, -0.48);
  body.lineTo(0.38, 0.08); body.lineTo(-0.38, 0.08); body.closePath();
  const bodyGeometry = new THREE.ExtrudeGeometry(body, { depth: 0.17, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.045, bevelThickness: 0.025, curveSegments: 1 });
  bodyGeometry.rotateX(-Math.PI / 2); bodyGeometry.translate(0, 0.025, 0);
  add(bodyGeometry, '#3f4854');
  // Closed U-shaped steel loop; both legs are embedded in the body.
  const shackle = new THREE.Shape();
  shackle.moveTo(-0.29, 0.04); shackle.lineTo(-0.29, 0.31);
  shackle.absarc(0, 0.31, 0.29, Math.PI, 0, true);
  shackle.lineTo(0.29, 0.04); shackle.lineTo(0.18, 0.04); shackle.lineTo(0.18, 0.31);
  shackle.absarc(0, 0.31, 0.18, 0, Math.PI, false);
  shackle.lineTo(-0.18, 0.04); shackle.closePath();
  const metal = new THREE.ExtrudeGeometry(shackle, { depth: 0.105, bevelEnabled: false, curveSegments: 6 });
  metal.rotateX(-Math.PI / 2); metal.translate(0, 0.055, 0);
  add(metal, '#bbc5ce');
  add(new THREE.BoxGeometry(0.59, 0.028, 0.40).translate(0, 0.224, 0.20), '#f7c63e');
  add(new THREE.CircleGeometry(0.063, 10).rotateX(-Math.PI / 2).translate(0, 0.248, 0.16), '#303944');
  add(new THREE.BoxGeometry(0.065, 0.008, 0.115).translate(0, 0.244, 0.225), '#303944');
  const geometry = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  geometry.computeBoundingSphere();
  return geometry;
}
