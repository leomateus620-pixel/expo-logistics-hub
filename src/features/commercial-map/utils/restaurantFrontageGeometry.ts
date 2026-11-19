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

/** One small repeating pavement detail map in the slab's existing world UVs. */
export function createRestaurantFrontagePavingTexture(): THREE.CanvasTexture | null {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return null;
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const value = 249 - (row * 11 + column * 19) % 8;
      const left = column * 32;
      const top = row * 32;
      context.fillStyle = `rgb(${value},${value},${value})`;
      context.fillRect(left, top, 32, 32);
      context.fillStyle = '#e1dbd4';
      context.fillRect(left, top, 32, 1);
      context.fillRect(left, top, 1, 32);
      context.fillStyle = '#eeeae5';
      for (let index = 0; index < 6; index += 1) {
        const offset = index * 4.4;
        const horizontal = (row + column) % 2 === 0;
        context.fillRect(
          left + (horizontal ? 4 : 5 + offset),
          top + (horizontal ? 5 + offset : 4),
          horizontal ? 24 : 1,
          horizontal ? 1 : 24,
        );
      }
    }
  }
  const leafMarks = [[17, 45, -0.24], [100, 84, 0.15], [59, 116, -0.38]];
  for (const [x, y, angle] of leafMarks) {
    context.fillStyle = '#d7c8b5';
    context.beginPath();
    context.ellipse(x, y, 1.7, 0.64, angle, 0, Math.PI * 2);
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.setScalar(1.6);
  texture.anisotropy = 4;
  return texture;
}
