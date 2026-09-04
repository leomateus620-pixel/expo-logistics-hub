import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  REAR_ENVIRONMENT_BUDGET,
  REAR_TERRAIN_PATCHES,
  buildRearPoleInstances,
  buildRearTreeInstances,
  sourcePolygonToLocal,
} from '../../data/rearParkEnvironment';
import {
  openGroundTextureBundleForEntity,
  type OpenGroundSurfaceProfile,
} from './openGroundTextures';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';
import { buildRearTerrainPatchGeometry } from '../../utils/rearTerrainGeometry';
import { applyParkGroundDetail } from './terrainMaterial';

interface RearParkEnvironmentLayerProps {
  reducedGraphics: boolean;
  visible?: boolean;
  vegetationVisible?: boolean;
}

const NO_RAYCAST = () => undefined;
const REAR_TERRAIN_SURFACE_PROFILE = Object.freeze({
  surface: 'grass',
  tileWorldSize: 9,
  baseColor: '#8aa465',
  roughness: 0.97,
} satisfies OpenGroundSurfaceProfile);
const REAR_TERRAIN_NORMAL_SCALE = new THREE.Vector2(0.18, 0.18);

/**
 * Extensão irregular e contínua do terreno até além da BR-472, com vegetação
 * instanciada e iluminação localizada. Nenhuma geometria oficial é alterada.
 */
export const RearParkEnvironmentLayer = memo(function RearParkEnvironmentLayer({
  reducedGraphics,
  visible = true,
  vegetationVisible = true,
}: RearParkEnvironmentLayerProps) {
  const maximumAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const poleRef = useRef<THREE.InstancedMesh>(null);

  const terrain = useMemo(() => REAR_TERRAIN_PATCHES.map((patch) => {
    const outline = sourcePolygonToLocal(patch.sourcePolygon);
    const geometry = buildRearTerrainPatchGeometry(outline, patch.baseElevation);
    return { patch, geometry };
  }), []);

  useEffect(() => () => terrain.forEach((entry) => entry.geometry.dispose()), [terrain]);

  const grassTextures = useMemo(
    () => openGroundTextureBundleForEntity(REAR_TERRAIN_SURFACE_PROFILE, maximumAnisotropy),
    [maximumAnisotropy],
  );

  useEffect(() => () => grassTextures?.dispose(), [grassTextures]);

  const terrainMaterials = useMemo(() => Object.fromEntries([false, true].map((reduced) => [
    reduced ? 'reduced' : 'full',
    applyParkGroundDetail(new THREE.MeshStandardMaterial({
      name: `RearParkTerrainMaterial:${reduced ? 'reduced' : 'full'}`,
      map: grassTextures?.map ?? null,
      normalMap: grassTextures?.normalMap ?? null,
      normalScale: grassTextures ? REAR_TERRAIN_NORMAL_SCALE : undefined,
      roughnessMap: grassTextures?.roughnessMap ?? null,
      color: REAR_TERRAIN_SURFACE_PROFILE.baseColor,
      roughness: REAR_TERRAIN_SURFACE_PROFILE.roughness,
      metalness: 0,
    }), reduced),
  ])) as Record<'full' | 'reduced', THREE.MeshStandardMaterial>, [grassTextures]);
  const terrainMaterial = terrainMaterials[reducedGraphics ? 'reduced' : 'full'];

  useEffect(() => () => Object.values(terrainMaterials).forEach((material) => material.dispose()), [terrainMaterials]);

  // Both tiers stay resident. Quality changes update references and instance
  // counts instead of reconstructing R3F objects with `dispose={null}`.
  const treeResources = useMemo(() => ({
    trunk: {
      full: new THREE.CylinderGeometry(0.055, 0.085, 1, 6),
      reduced: new THREE.CylinderGeometry(0.055, 0.085, 1, 4),
    },
    canopy: {
      full: new THREE.IcosahedronGeometry(0.5, 1),
      reduced: new THREE.IcosahedronGeometry(0.5, 0),
    },
    trunkMaterial: new THREE.MeshStandardMaterial({ color: '#6a5340', roughness: 0.95, metalness: 0 }),
    canopyMaterial: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0, flatShading: true }),
    poleGeometry: new THREE.CylinderGeometry(0.022, 0.03, 0.84, 5),
    poleMaterial: new THREE.MeshStandardMaterial({ color: '#9aa0a2', roughness: 0.7, metalness: 0.2 }),
  }), []);

  useEffect(() => () => {
    treeResources.trunk.full.dispose();
    treeResources.trunk.reduced.dispose();
    treeResources.canopy.full.dispose();
    treeResources.canopy.reduced.dispose();
    treeResources.trunkMaterial.dispose();
    treeResources.canopyMaterial.dispose();
    treeResources.poleGeometry.dispose();
    treeResources.poleMaterial.dispose();
  }, [treeResources]);

  const trees = useMemo(
    () => (vegetationVisible ? buildRearTreeInstances(reducedGraphics) : []),
    [reducedGraphics, vegetationVisible],
  );
  const poles = useMemo(() => buildRearPoleInstances(reducedGraphics), [reducedGraphics]);

  useLayoutEffect(() => {
    const canopy = canopyRef.current;
    const trunk = trunkRef.current;
    if (!canopy || !trunk) return;
    canopy.count = trees.length;
    trunk.count = trees.length;
    canopy.visible = trees.length > 0;
    trunk.visible = trees.length > 0;
    if (trees.length === 0) return;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    trees.forEach((tree, index) => {
      const canopyScale = tree.scale;
      matrix.compose(
        new THREE.Vector3(tree.x, canopyScale * 0.92, tree.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, tree.rotation, 0)),
        new THREE.Vector3(canopyScale, canopyScale * (0.85 + tree.tint * 0.5), canopyScale),
      );
      canopy.setMatrixAt(index, matrix);
      color.setHSL(0.26 - tree.tint * 0.05, 0.32 + tree.tint * 0.16, 0.24 + tree.tint * 0.12);
      canopy.setColorAt(index, color);

      matrix.compose(
        new THREE.Vector3(tree.x, canopyScale * 0.34, tree.z),
        new THREE.Quaternion(),
        new THREE.Vector3(canopyScale * 0.16, canopyScale * 0.7, canopyScale * 0.16),
      );
      trunk.setMatrixAt(index, matrix);
    });

    canopy.instanceMatrix.needsUpdate = true;
    trunk.instanceMatrix.needsUpdate = true;
    if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
    canopy.computeBoundingSphere();
    trunk.computeBoundingSphere();
  }, [trees]);

  useLayoutEffect(() => {
    const mesh = poleRef.current;
    if (!mesh) return;
    mesh.count = poles.length;
    mesh.visible = poles.length > 0;
    if (poles.length === 0) return;
    const matrix = new THREE.Matrix4();
    poles.forEach((pole, index) => {
      matrix.compose(
        new THREE.Vector3(pole.x, 0.42, pole.z),
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1, 1),
      );
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [poles]);

  useLayoutEffect(() => {
    // Capture the owners before React clears refs during unmount.
    const meshes = [canopyRef.current, trunkRef.current, poleRef.current];
    return () => meshes.forEach(disposeInstancedMesh);
  }, []);

  return (
    <group name="rear-park-environment" visible={visible}>
      {terrain.map((entry) => (
        <mesh
          key={entry.patch.id}
          geometry={entry.geometry}
          raycast={NO_RAYCAST}
          receiveShadow={!reducedGraphics}
          material={terrainMaterial}
          dispose={null}
        />
      ))}

      <instancedMesh
        ref={trunkRef}
        args={[treeResources.trunk.full, treeResources.trunkMaterial, REAR_ENVIRONMENT_BUDGET.maximumTreeInstances]}
        geometry={treeResources.trunk[reducedGraphics ? 'reduced' : 'full']}
        raycast={NO_RAYCAST}
        visible={trees.length > 0}
        dispose={null}
      />
      <instancedMesh
        ref={canopyRef}
        args={[treeResources.canopy.full, treeResources.canopyMaterial, REAR_ENVIRONMENT_BUDGET.maximumTreeInstances]}
        geometry={treeResources.canopy[reducedGraphics ? 'reduced' : 'full']}
        raycast={NO_RAYCAST}
        visible={trees.length > 0}
        castShadow={!reducedGraphics}
        dispose={null}
      />

      <instancedMesh
        ref={poleRef}
        args={[treeResources.poleGeometry, treeResources.poleMaterial, REAR_ENVIRONMENT_BUDGET.maximumPoleInstances]}
        raycast={NO_RAYCAST}
        visible={poles.length > 0}
        dispose={null}
      />
    </group>
  );
});
