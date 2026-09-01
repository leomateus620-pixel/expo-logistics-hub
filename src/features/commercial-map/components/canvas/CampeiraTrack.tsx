import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  CAMPEIRA_TRACK_REFERENCE,
  createCampeiraTrackPlan,
  type CampeiraInstanceTransform,
} from '../../utils/campeiraTrack';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';
import type { StrategicLandmarkBounds } from '../../utils/landmarks';

const NO_RAYCAST = () => undefined;

interface CampeiraMaterials {
  wall: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  green: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  platform: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
}

function createSurfaceGeometry(plan: ReturnType<typeof createCampeiraTrackPlan>['surface']) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(plan.vertices.length * 3);
  const colors = new Float32Array(plan.vertices.length * 3);
  plan.vertices.forEach((vertex, index) => {
    positions.set(vertex.position, index * 3);
    colors.set(vertex.color, index * 3);
  });
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(plan.indices), 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function transformMatrix(transform: CampeiraInstanceTransform) {
  const object = new THREE.Object3D();
  object.position.set(...transform.position);
  object.rotation.set(...transform.rotation);
  object.scale.set(...transform.scale);
  object.updateMatrix();
  return object.matrix.clone();
}

function RepeatedMembers({
  name,
  geometry,
  material,
  items,
  castShadow = false,
}: {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  items: readonly CampeiraInstanceTransform[];
  castShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((item, index) => {
      mesh.setMatrixAt(index, transformMatrix(item));
      if (item.color) mesh.setColorAt(index, new THREE.Color(...item.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [items]);
  useEffect(() => () => disposeInstancedMesh(ref.current), []);
  if (!items.length) return null;
  return (
    <instancedMesh
      ref={ref}
      name={name}
      args={[geometry, material, items.length]}
      count={items.length}
      castShadow={castShadow}
      receiveShadow
      frustumCulled
      raycast={NO_RAYCAST}
      userData={CAMPEIRA_TRACK_REFERENCE}
      dispose={null}
    />
  );
}

export const CampeiraTrack = memo(function CampeiraTrack({
  bounds,
  materials,
  reducedGraphics = false,
}: {
  bounds: StrategicLandmarkBounds;
  height: number;
  materials: CampeiraMaterials;
  showDetail: boolean;
  showFocusDetail: boolean;
  reducedGraphics?: boolean;
}) {
  const plan = useMemo(
    () => createCampeiraTrackPlan(bounds, reducedGraphics),
    [bounds, reducedGraphics],
  );
  const surfaceGeometry = useMemo(() => createSurfaceGeometry(plan.surface), [plan.surface]);
  const boxGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const postGeometry = useMemo(
    () => new THREE.CylinderGeometry(0.5, 0.5, 1, reducedGraphics ? 6 : 8, 1),
    [reducedGraphics],
  );
  const grouped = useMemo(() => ({
    posts: [...plan.fence.posts, ...plan.shelter.penPosts],
    rails: [...plan.fence.rails, ...plan.shelter.penRails],
    structure: plan.shelter.steel,
    roof: plan.shelter.roof,
  }), [plan]);
  useEffect(() => () => {
    surfaceGeometry.dispose();
    boxGeometry.dispose();
    postGeometry.dispose();
  }, [boxGeometry, postGeometry, surfaceGeometry]);

  const castShadow = !reducedGraphics;
  return (
    <group name="pista-campeira-rural" raycast={NO_RAYCAST} userData={CAMPEIRA_TRACK_REFERENCE} dispose={null}>
      <mesh
        name="superficie-natural-pista-campeira"
        geometry={surfaceGeometry}
        material={materials.green}
        receiveShadow
        raycast={NO_RAYCAST}
        userData={CAMPEIRA_TRACK_REFERENCE}
        dispose={null}
      />
      <RepeatedMembers
        name="postes-madeira-pista-campeira"
        geometry={postGeometry}
        material={materials.accent}
        items={grouped.posts}
        castShadow={castShadow}
      />
      <RepeatedMembers
        name="travessas-madeira-pista-campeira"
        geometry={boxGeometry}
        material={materials.accent}
        items={grouped.rails}
        castShadow={castShadow}
      />
      <RepeatedMembers
        name="estrutura-abrigo-manejo-pista-campeira"
        geometry={boxGeometry}
        material={materials.dark}
        items={grouped.structure}
        castShadow={castShadow}
      />
      <RepeatedMembers
        name="cobertura-abrigo-manejo-pista-campeira"
        geometry={boxGeometry}
        material={materials.roof}
        items={grouped.roof}
        castShadow={castShadow}
      />
    </group>
  );
});
