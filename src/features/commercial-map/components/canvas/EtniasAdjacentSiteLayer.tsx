import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { COMMERCIAL_MAP_GROUND_ELEVATION } from '../../constants';
import {
  ETNIAS_SITE_ENTRY_PALMS,
  ETNIAS_SITE_METERS_TO_WORLD,
  ETNIAS_SITE_TREES,
  etniasAdjacentSitePointToWorld,
} from '../../data/etniasAdjacentSite';
import { buildEtniasAdjacentSiteGeometry } from '../../utils/etniasAdjacentSiteGeometry';
import { buildEtniasRbsTowerGeometry, ETNIAS_RBS_TOWER } from '../../utils/etniasRbsTowerGeometry';
import { updateExteriorLod } from '../../utils/exteriorArchitectureScene';
import { createExteriorTree } from '../../utils/exteriorVegetation';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';
import { createResidentialPalm } from '../../utils/lateralResidentialAssets';
import { resolveResidentialDetailVisibility } from '../../utils/lateralResidentialGeometry';
import { applyParkSurfaceDetail, PARK_SURFACE_PROFILES } from './parkSurfaceMaterial';
import { useSceneVegetationEnabled } from './PublicScenePolicyContext';

const NO_RAYCAST = () => undefined;
const [centerX, centerZ] = etniasAdjacentSitePointToWorld([48, 51]);
const SITE_CENTER = new THREE.Vector3(centerX, 0, centerZ);
const [towerX, towerZ] = etniasAdjacentSitePointToWorld(ETNIAS_RBS_TOWER.center);
const TOWER_CENTER = new THREE.Vector3(
  towerX, COMMERCIAL_MAP_GROUND_ELEVATION + ETNIAS_RBS_TOWER.height * ETNIAS_SITE_METERS_TO_WORLD / 2, towerZ,
);

function createSiteMaterials() {
  return {
    walls: applyParkSurfaceDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.91 }), {
      ...PARK_SURFACE_PROFILES.volume, contactObjectBottom: COMMERCIAL_MAP_GROUND_ELEVATION,
    }),
    roofs: applyParkSurfaceDetail(
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.08 }), 'roof',
    ),
    details: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.2 }),
    tower: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.16 }),
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

function createSiteEntryPalms() {
  const near = createResidentialPalm(true);
  const far = createResidentialPalm(false);
  const trunkGeometry = new THREE.CylinderGeometry(0.37, 0.5, 1, 8);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.93 });
  const trunks = new THREE.InstancedMesh(trunkGeometry, material, ETNIAS_SITE_ENTRY_PALMS.length);
  const crowns = new THREE.InstancedMesh(near, material, ETNIAS_SITE_ENTRY_PALMS.length);
  trunks.name = 'etnias-rbs-entry-palm-trunks';
  crowns.name = 'etnias-rbs-entry-palm-crowns';
  for (const mesh of [trunks, crowns]) {
    mesh.raycast = NO_RAYCAST;
    mesh.receiveShadow = true;
    mesh.userData.presentationOnly = true;
  }
  const transform = new THREE.Object3D();
  const crownCenter = new THREE.Vector3();
  const color = new THREE.Color();
  const M = ETNIAS_SITE_METERS_TO_WORLD;
  ETNIAS_SITE_ENTRY_PALMS.forEach(([x, z, height, radius], index) => {
    const [worldX, worldZ] = etniasAdjacentSitePointToWorld([x, z]);
    const trunkHeight = height * 0.83 * M;
    const angle = index * 2.39996;
    transform.rotation.set(Math.sin(angle) * 0.1, 0, Math.cos(angle) * 0.1);
    crownCenter.set(0, trunkHeight, 0).applyQuaternion(transform.quaternion);
    transform.position.set(worldX, COMMERCIAL_MAP_GROUND_ELEVATION, worldZ).addScaledVector(crownCenter, 0.5);
    transform.scale.set(0.32 * M, trunkHeight, 0.32 * M);
    transform.updateMatrix();
    trunks.setMatrixAt(index, transform.matrix);
    trunks.setColorAt(index, color.set(index % 2 ? '#8b7961' : '#77684f'));

    transform.position.set(worldX, COMMERCIAL_MAP_GROUND_ELEVATION, worldZ).add(crownCenter);
    transform.rotation.set(0, angle, 0);
    transform.scale.set(2 * radius * M, height * 0.52 * M, 2 * radius * M);
    transform.updateMatrix();
    crowns.setMatrixAt(index, transform.matrix);
    crowns.setColorAt(index, color.set(index % 2 ? '#54713b' : '#6b8144'));
  });
  for (const mesh of [trunks, crowns]) mesh.computeBoundingSphere();
  return {
    trunks, crowns, near, far,
    dispose() {
      disposeInstancedMesh(trunks);
      disposeInstancedMesh(crowns);
      trunkGeometry.dispose();
      near.dispose();
      far.dispose();
      material.dispose();
    },
  };
}

export const EtniasAdjacentSiteLayer = memo(function EtniasAdjacentSiteLayer({
  vegetationVisible,
  reducedGraphics,
}: {
  vegetationVisible: boolean;
  reducedGraphics: boolean;
}) {
  const vegetationEnabled = useSceneVegetationEnabled();
  const geometry = useMemo(() => ({ ...buildEtniasAdjacentSiteGeometry(), ...buildEtniasRbsTowerGeometry() }), []);
  const materials = useMemo(createSiteMaterials, []);
  const woodland = useMemo(() => vegetationEnabled ? createSiteWoodland() : null, [vegetationEnabled]);
  const palms = useMemo(() => vegetationEnabled ? createSiteEntryPalms() : null, [vegetationEnabled]);
  const details = useRef<THREE.Mesh>(null);
  const towerDetails = useRef<THREE.Mesh>(null);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => () => Object.values(geometry).forEach((value) => value.dispose()), [geometry]);
  useEffect(() => () => Object.values(materials).forEach((value) => value.dispose()), [materials]);
  useEffect(() => () => woodland?.dispose(), [woodland]);
  useEffect(() => () => palms?.dispose(), [palms]);

  useLayoutEffect(() => {
    if (woodland) woodland.mesh.visible = vegetationVisible;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, vegetationVisible, woodland, reducedGraphics]);

  useFrame(({ camera, size }) => {
    const siteDistance = camera.position.distanceTo(SITE_CENTER);
    if (details.current) {
      details.current.visible = resolveResidentialDetailVisibility(
        siteDistance, details.current.visible, 36, 43,
      );
    }
    if (towerDetails.current) {
      towerDetails.current.visible = resolveResidentialDetailVisibility(
        camera.position.distanceTo(TOWER_CENTER), towerDetails.current.visible,
        reducedGraphics ? 20 : 36, reducedGraphics ? 26 : 43,
      );
    }
    if (woodland && vegetationVisible) {
      updateExteriorLod(woodland.meshes, camera, size.height, false, true);
      woodland.mesh.castShadow = true;
    }
    if (palms && vegetationVisible) {
      const near = !reducedGraphics && resolveResidentialDetailVisibility(
        siteDistance, palms.crowns.geometry === palms.near, 26, 32,
      );
      const crownGeometry = near ? palms.near : palms.far;
      if (palms.crowns.geometry !== crownGeometry) {
        palms.crowns.geometry = crownGeometry;
        gl.shadowMap.needsUpdate = true;
      }
    }
  });

  return (
    <group name="etnias-adjacent-site" userData={{ presentationOnly: true }} dispose={null}>
      <mesh name="etnias-adjacent-drive" geometry={geometry.drive} material={materials.drive} receiveShadow raycast={NO_RAYCAST} />
      <mesh name="etnias-adjacent-walks" geometry={geometry.walks} material={materials.walks} receiveShadow raycast={NO_RAYCAST} />
      <mesh name="etnias-adjacent-walls" geometry={geometry.walls} material={materials.walls} castShadow receiveShadow raycast={NO_RAYCAST} />
      <mesh name="etnias-adjacent-roofs" geometry={geometry.roofs} material={materials.roofs} castShadow receiveShadow raycast={NO_RAYCAST} />
      <mesh name="etnias-rbs-facade-glass" geometry={geometry.glass} material={materials.glass} receiveShadow raycast={NO_RAYCAST} />
      <mesh ref={details} name="etnias-adjacent-details" geometry={geometry.details} material={materials.details} receiveShadow raycast={NO_RAYCAST} />
      <mesh name="etnias-rbs-tower" geometry={geometry.tower} material={materials.tower} castShadow={!reducedGraphics} receiveShadow raycast={NO_RAYCAST} />
      <mesh ref={towerDetails} name="etnias-rbs-tower-details" geometry={geometry.towerDetails} material={materials.tower} raycast={NO_RAYCAST} />
      {woodland && <primitive object={woodland.mesh} />}
      {palms && (
        <group visible={vegetationVisible}>
          <primitive object={palms.trunks} castShadow={!reducedGraphics} />
          <primitive object={palms.crowns} castShadow={!reducedGraphics} />
        </group>
      )}
    </group>
  );
});
