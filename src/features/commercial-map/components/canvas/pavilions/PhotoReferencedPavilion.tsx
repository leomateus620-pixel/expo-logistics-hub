import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { CommercialPavilionMaterials } from '../CommercialPavilion';
import type { CommercialPavilionLayout } from '../../../utils/commercialPavilions';
import { disposeInstancedMesh } from '../../../utils/instancedMeshDisposal';
import {
  createPavilionArchitectureLayout,
  type PavilionArchitectureInstance,
  type PavilionArchitectureMaterial,
  type PavilionArchitectureTriangle,
} from '../../../utils/pavilionArchitectureLayout';
import { PavilionGroundInterfaces } from './PavilionGroundInterfaces';

const NO_RAYCAST = () => undefined;
const SHADOW_MATERIALS = new Set<PavilionArchitectureMaterial>(['wall', 'trim', 'roof', 'brick', 'cladding']);

function ArchitectureInstances({ geometry, material, items, castShadow }: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  items: PavilionArchitectureInstance[];
  castShadow: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh | null>(null);
  const setMesh = useCallback((next: THREE.InstancedMesh | null) => {
    if (mesh.current && mesh.current !== next) disposeInstancedMesh(mesh.current);
    mesh.current = next;
  }, []);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const object = new THREE.Object3D();
    items.forEach((item, index) => {
      object.position.set(...item.position);
      object.scale.set(...item.scale);
      object.rotation.set(...(item.rotation ?? [0, 0, 0]));
      object.updateMatrix();
      mesh.current!.setMatrixAt(index, object.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingBox();
    mesh.current.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={setMesh} args={[geometry, material, items.length]}
    castShadow={castShadow} receiveShadow raycast={NO_RAYCAST} dispose={null} />;
}

function triangleGeometry(triangles: PavilionArchitectureTriangle[]) {
  const geometry = new THREE.BufferGeometry();
  const points = triangles.flatMap(triangle => triangle.vertices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  // Metric XY coordinates keep the facade siding scale independent of triangle size.
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(points.flatMap(point => [point[0], point[1]]), 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Static architectural shell, reused by the real exterior renderer and QA. */
export const PhotoReferencedPavilion = memo(function PhotoReferencedPavilion({ layout, materials, showDetail, cutaway }: {
  layout: CommercialPavilionLayout;
  materials: CommercialPavilionMaterials;
  showDetail: boolean;
  cutaway: boolean;
}) {
  const architecture = useMemo(() => createPavilionArchitectureLayout(layout, showDetail), [layout, showDetail]);
  const unitBoxGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const triangles = useMemo(() => {
    const groups = new Map<PavilionArchitectureMaterial, PavilionArchitectureTriangle[]>();
    architecture?.triangles.forEach(triangle => groups.set(triangle.material, [...(groups.get(triangle.material) ?? []), triangle]));
    return [...groups].map(([key, values]) => ({ key, geometry: triangleGeometry(values) }));
  }, [architecture]);
  useEffect(() => () => unitBoxGeometry.dispose(), [unitBoxGeometry]);
  useEffect(() => () => triangles.forEach(item => item.geometry.dispose()), [triangles]);
  if (!architecture) return null;
  const materialFor = (key: PavilionArchitectureMaterial) => materials[key] ?? materials.wall;
  return <group name={`architecture-2026:${layout.publicIdentifier}`} dispose={null}>
    {!cutaway && <>
      {(Object.entries(architecture.batches) as [PavilionArchitectureMaterial, PavilionArchitectureInstance[]][]).map(([key, items]) => (
        <ArchitectureInstances key={key} geometry={unitBoxGeometry} material={materialFor(key)} items={items} castShadow={SHADOW_MATERIALS.has(key)} />
      ))}
      {triangles.map(item => <mesh key={item.key} geometry={item.geometry} material={materialFor(item.key)}
        castShadow receiveShadow raycast={NO_RAYCAST} dispose={null} />)}
    </>}
    <PavilionGroundInterfaces layout={layout} materials={materials} cutaway={cutaway} />
  </group>;
});
