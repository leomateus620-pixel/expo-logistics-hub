import * as THREE from 'three';
import {
  RESTAURANT_FRONTAGE_LAYOUT,
  restaurantFrontageTreePitBounds,
  type FrontagePoint,
  type FrontageRect,
} from './restaurantFrontage';

function rectanglePath(rect: FrontageRect, path: THREE.Path, hole = false) {
  path.moveTo(rect.minX, -rect.minZ);
  path.lineTo(hole ? rect.minX : rect.maxX, hole ? -rect.maxZ : -rect.minZ);
  path.lineTo(rect.maxX, -rect.maxZ);
  path.lineTo(hole ? rect.maxX : rect.minX, hole ? -rect.minZ : -rect.maxZ);
  path.closePath();
}

/** One static slab, including its vertical opening walls, in world coordinates. */
export function createRestaurantFrontageSlabGeometry(
  slab: FrontageRect,
  treePits: readonly FrontagePoint[],
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  rectanglePath(slab, shape);
  for (const pit of treePits) {
    const hole = new THREE.Path();
    rectanglePath(restaurantFrontageTreePitBounds(pit), hole, true);
    shape.holes.push(hole);
  }
  const { thickness, topElevation } = RESTAURANT_FRONTAGE_LAYOUT.slab;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    steps: 1,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, topElevation - thickness, 0);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
