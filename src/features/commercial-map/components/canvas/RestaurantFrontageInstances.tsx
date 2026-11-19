import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';

export const FRONTAGE_NO_RAYCAST = () => undefined;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

export interface FrontageInstance {
  position: readonly [number, number, number];
  scale: readonly [number, number, number];
  rotation?: THREE.Quaternion;
  tint?: THREE.Color;
}

export function FrontageInstances({
  items,
  material,
  geometry = UNIT_BOX,
  castShadow = false,
  receiveShadow = false,
  name,
}: {
  items: readonly FrontageInstance[];
  material: THREE.Material;
  geometry?: THREE.BufferGeometry;
  castShadow?: boolean;
  receiveShadow?: boolean;
  name: string;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const object = new THREE.Object3D();
    const white = new THREE.Color('#ffffff');
    const tinted = items.some((item) => item.tint);
    items.forEach((item, index) => {
      object.position.set(...item.position);
      object.scale.set(...item.scale);
      object.quaternion.copy(item.rotation ?? object.quaternion.identity());
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
      if (tinted) mesh.setColorAt(index, item.tint ?? white);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    return () => disposeInstancedMesh(mesh);
  }, [geometry, items, material]);
  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      name={name}
      args={[geometry, material, items.length]}
      raycast={FRONTAGE_NO_RAYCAST}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      dispose={null}
    />
  );
}
