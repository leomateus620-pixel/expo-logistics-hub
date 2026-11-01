import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EXTERNAL_LOT_PALETTE } from './externalLotPresentation';

/** One flat, own-drawn confirmation seal. The footprint fits radius .62 at
 * unit scale, sharing the sold marker's existing clearance-based placement. */
export function createSoldCheckGeometry() {
  const addColor = (source: THREE.BufferGeometry, value: string) => {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (source !== geometry) source.dispose();
    const color = new THREE.Color(value), colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([color.r, color.g, color.b], i);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
  };
  const seal = addColor(new THREE.CircleGeometry(.56, 20).rotateX(-Math.PI / 2), EXTERNAL_LOT_PALETTE.sold);
  const check = new THREE.Shape();
  // Broad, six-vertex silhouette remains recognisable when the seal is small;
  // keep its footprint inside the existing clearance-controlled disk.
  check.moveTo(-.36, -.005); check.lineTo(-.225, .13); check.lineTo(-.075, -.025);
  check.lineTo(.255, .315); check.lineTo(.395, .18); check.lineTo(-.075, -.31); check.closePath();
  const mark = addColor(new THREE.ShapeGeometry(check).rotateX(-Math.PI / 2).translate(0, .003, 0), EXTERNAL_LOT_PALETTE.check);
  const geometry = mergeGeometries([seal, mark])!;
  seal.dispose(); mark.dispose();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
