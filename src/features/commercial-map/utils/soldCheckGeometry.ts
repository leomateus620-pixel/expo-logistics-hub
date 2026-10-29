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
  check.moveTo(-.34, -.01); check.lineTo(-.23, .1); check.lineTo(-.075, -.055);
  check.lineTo(.26, .3); check.lineTo(.38, .185); check.lineTo(-.075, -.29); check.closePath();
  const mark = addColor(new THREE.ShapeGeometry(check).rotateX(-Math.PI / 2).translate(0, .003, 0), EXTERNAL_LOT_PALETTE.check);
  const geometry = mergeGeometries([seal, mark])!;
  seal.dispose(); mark.dispose();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
