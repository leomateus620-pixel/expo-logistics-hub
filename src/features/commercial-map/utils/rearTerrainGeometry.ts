import * as THREE from 'three';
import { rearRoadTerrainElevationAt } from './rearRoadNetwork';

/** ShapeGeometry is CCW in XY; mapping its Y to Z reverses the ground front. */
export function buildRearTerrainPatchGeometry(
  outline: readonly (readonly [number, number])[],
  baseElevation: number,
) {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
  const geometry = new THREE.ShapeGeometry(shape);
  const position = geometry.getAttribute('position');
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const x = position.getX(vertex);
    const z = position.getY(vertex);
    position.setXYZ(vertex, x, baseElevation + rearRoadTerrainElevationAt(x, z), z);
  }
  const indices = geometry.getIndex()!;
  for (let triangle = 0; triangle < indices.count; triangle += 3) {
    const second = indices.getX(triangle + 1);
    indices.setX(triangle + 1, indices.getX(triangle + 2));
    indices.setX(triangle + 2, second);
  }
  position.needsUpdate = true;
  indices.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
