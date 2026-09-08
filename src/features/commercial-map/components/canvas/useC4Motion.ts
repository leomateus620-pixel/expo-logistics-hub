import { useEffect, useState } from 'react';
import * as THREE from 'three';

export function useC4MotionPreference() {
  const [reduced, setReduced] = useState(
    () =>
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** Visibility gate works with demand rendering: camera input wakes offscreen objects again. */
export function c4ObjectVisible(
  object: THREE.Object3D,
  camera: THREE.Camera,
  scratch: {
    frustum: THREE.Frustum;
    matrix: THREE.Matrix4;
    sphere: THREE.Sphere;
  },
  radius: number,
) {
  for (
    let parent: THREE.Object3D | null = object;
    parent;
    parent = parent.parent
  )
    if (!parent.visible) return false;
  scratch.matrix.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse,
  );
  scratch.frustum.setFromProjectionMatrix(scratch.matrix);
  object.getWorldPosition(scratch.sphere.center);
  scratch.sphere.radius = radius;
  return scratch.frustum.intersectsSphere(scratch.sphere);
}
