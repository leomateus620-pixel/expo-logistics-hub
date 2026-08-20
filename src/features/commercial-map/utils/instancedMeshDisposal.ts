import * as THREE from 'three';

/**
 * React Three Fiber nulls the `dispose` method of any node declared with
 * `dispose={null}`. Calling `mesh.dispose()` directly on those nodes throws and
 * takes the whole canvas down (blank viewport when leaving an interior scene).
 * Always release instanced meshes through the prototype implementation.
 */
export function disposeInstancedMesh(mesh: THREE.InstancedMesh | null | undefined) {
  if (!mesh) return;
  THREE.InstancedMesh.prototype.dispose.call(mesh);
}
