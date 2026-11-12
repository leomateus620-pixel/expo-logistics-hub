import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { COMMERCIAL_MAP_GROUND_ELEVATION } from '../../constants';
import {
  ETNIAS_SITE_METERS_TO_WORLD,
  ETNIAS_SITE_TREES,
  etniasAdjacentSitePointToWorld,
} from '../../data/etniasAdjacentSite';
import { buildEtniasAdjacentSiteGeometry } from '../../utils/etniasAdjacentSiteGeometry';
import { updateExteriorLod } from '../../utils/exteriorArchitectureScene';
import { createExteriorTree } from '../../utils/exteriorVegetation';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';
import { resolveResidentialDetailVisibility } from '../../utils/lateralResidentialGeometry';
import { applyParkSurfaceDetail, PARK_SURFACE_PROFILES } from './parkSurfaceMaterial';
import { useSceneVegetationEnabled } from './PublicScenePolicyContext';

const NO_RAYCAST = () => undefined;
const [centerX, centerZ] = etniasAdjacentSitePointToWorld([48, 51]);
const SITE_CENTER = new THREE.Vector3(centerX, 0, centerZ);

function createSiteMaterials() {
  return {
    walls: applyParkSurfaceDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.91 }), {
      ...PARK_SURFACE_PROFILES.volume, contactObjectBottom: COMMERCIAL_MAP_GROUND_ELEVATION,
    }),
    roofs: applyParkSurfaceDetail(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.08 }), 'roof',
    ),
    details: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }),
    drive: applyParkSurfaceDetail(new THREE.MeshStandardMaterial({ color: '#77766c', roughness: 0.97 }), 'asphalt'),
    walks: applyParkSurfaceDetail(new THREE.MeshStandardMaterial({ color: '#c4c0ae', roughness: 0.95 }), 'concrete'),
  };
}

function createSiteWoodland() {
  const near = createExteriorTree(0, true);
  const map = createExteriorTree(0, false);
  const far = createExteriorTree(0, 'far');
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 });
  const mesh = new THREE.InstancedMesh(near, material, ETNIAS_SITE_TREES.length);
  mesh.name = 'etnias-adjacent-trees';
  mesh.raycast = NO_RAYCAST;
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  ETNIAS_SITE_TREES.forEach(([x, z, height, radius], index) => {
    const [worldX, worldZ] = etniasAdjacentSitePointToWorld([x, z]);
    transform.position.set(worldX, COMMERCIAL_MAP_GROUND_ELEVATION, worldZ);
    transform.rotation.y = index * 2.39996;
    transform.scale.set(radius * 1.12, height, radius * (1 + index % 3 * 0.08)).multiplyScalar(ETNIAS_SITE_METERS_TO_WORLD);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, color.setScalar(0.84 + index % 6 * 0.045));
  });
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  mesh.geometry = map;
  mesh.userData = {
    presentationOnly: true, exteriorTrees: true, projectedSize: 1.45, lod: 'map', near, map, far,
  };
  return {
    mesh,
    meshes: [mesh],
    dispose() {
      disposeInstancedMesh(mesh);
      near.dispose();
      map.dispose();
      far.dispose();
      material.dispose();
    },
  };
}

export const EtniasAdjacentSiteLayer = memo(function EtniasAdjacentSiteLayer({
  vegetationVisible,
}: {
  vegetationVisible: boolean;
}) {
  const vegetationEnabled = useSceneVegetationEnabled();
  const geometry = useMemo(buildEtniasAdjacentSiteGeometry, []);
  const materials = useMemo(createSiteMaterials, []);
  const woodland = useMemo(() => vegetationEnabled ? createSiteWoodland() : null, [vegetationEnabled]);
  const details = useRef<THREE.Mesh>(null);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => () => Object.values(geometry).forEach((value) => value.dispose()), [geometry]);
  useEffect(() => () => Object.values(materials).forEach((value) => value.dispose()), [materials]);
  useEffect(() => () => woodland?.dispose(), [woodland]);

  useLayoutEffect(() => {
    if (woodland) woodland.mesh.visible = vegetationVisible;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, vegetationVisible, woodland]);

  useFrame(({ camera, size }) => {
    if (details.current) {
      details.current.visible = resolveResidentialDetailVisibility(
        camera.position.distanceTo(SITE_CENTER), details.current.visible, 36, 43,
      );
    }
    if (woodland && vegetationVisible) {
      updateExteriorLod(woodland.meshes, camera, size.height, false, true);
      woodland.mesh.castShadow = true;
    }
  });

  return (
    <group name="etnias-adjacent-site" userData={{ presentationOnly: true }} dispose={null}>
      <mesh name="etnias-adjacent-drive" geometry={geometry.drive} material={materials.drive} receiveShadow raycast={NO_RAYCAST} />
      <mesh name="etnias-adjacent-walks" geometry={geometry.walks} material={materials.walks} receiveShadow raycast={NO_RAYCAST} />
      <mesh name="etnias-adjacent-walls" geometry={geometry.walls} material={materials.walls} castShadow receiveShadow raycast={NO_RAYCAST} />
      <mesh name="etnias-adjacent-roofs" geometry={geometry.roofs} material={materials.roofs} castShadow receiveShadow raycast={NO_RAYCAST} />
      <mesh ref={details} name="etnias-adjacent-details" geometry={geometry.details} material={materials.details} receiveShadow raycast={NO_RAYCAST} />
      {woodland && <primitive object={woodland.mesh} />}
    </group>
  );
});
