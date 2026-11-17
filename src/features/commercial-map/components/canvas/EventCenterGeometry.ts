import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  eventCenterPartsForDetail,
  type EventCenterPart,
  type EventCenterSurface,
  type EventCenterDetail,
} from '../../utils/eventCenterArchitecture';

function unitGable() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5],
      3,
    ),
  );
  geometry.setIndex([0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4]);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  flat.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(new Float32Array(flat.attributes.position.count * 2), 2),
  );
  return flat;
}

/** Owns its source primitives and merged buffers. Never disposes shared park resources. */
export function buildEventCenterGeometry(parts: readonly EventCenterPart[], detail: EventCenterDetail) {
  const flatten = (source: THREE.BufferGeometry) => {
    const flat = source.toNonIndexed();
    source.dispose();
    return flat;
  };
  const primitives = {
    box: flatten(new THREE.BoxGeometry(1, 1, 1)),
    gable: unitGable(),
    plant: new THREE.IcosahedronGeometry(0.5, 1),
    plane: flatten(new THREE.PlaneGeometry(1, 1)),
    leaf: flatten(new THREE.ConeGeometry(0.5, 1, 4, 1)),
  };
  const batches = new Map<EventCenterSurface, THREE.BufferGeometry[]>();
  const matrix = new THREE.Matrix4(),
    position = new THREE.Vector3(),
    scale = new THREE.Vector3(),
    rotation = new THREE.Quaternion();
  for (const part of eventCenterPartsForDetail(parts, detail)) {
    position.set(...part.position);
    scale.set(...part.size);
    rotation.setFromEuler(new THREE.Euler(...(part.rotation ?? [0, 0, 0]), 'YXZ'));
    matrix.compose(position, rotation, scale);
    const geometry = primitives[part.shape].clone().applyMatrix4(matrix);
    const color = new THREE.Color(part.color ?? '#ffffff');
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < geometry.attributes.position.count; i++) color.toArray(colors, i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const batch = batches.get(part.surface) ?? [];
    batch.push(geometry);
    batches.set(part.surface, batch);
  }
  Object.values(primitives).forEach((g) => g.dispose());
  const merged = new Map<EventCenterSurface, THREE.BufferGeometry>();
  for (const [surface, batch] of batches) {
    const geometry = mergeGeometries(batch, false);
    batch.forEach((g) => g.dispose());
    if (!geometry) throw new Error(`Unable to batch C1 surface ${surface}`);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    merged.set(surface, geometry);
  }
  return { surfaces: merged, dispose: () => merged.forEach((g) => g.dispose()) };
}
