import { memo, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CommercialMapTree } from "../../data/commercialTrees";
import type { MapEntity } from "../../types";
import { pilotTreeProfile } from "../../utils/vegetationPilot";
import { createPilotTreeAsset } from "../../utils/vegetationPilotAssets";
import { commercialTreeGroundElevation } from "../../utils/treeLayer";
import { disposeInstancedMesh } from "../../utils/instancedMeshDisposal";
import {
  createPilotBarkMaterial,
  createPilotFoliageMaterial,
  createPilotLeafAtlas,
} from "./vegetationPilotMaterial";

const NO_RAYCAST = () => undefined;
function TreeFamily({
  family,
  trees,
  surfaceEntities,
  reducedGraphics,
  visible,
  materials,
}: {
  family: number;
  trees: readonly CommercialMapTree[];
  surfaceEntities: readonly MapEntity[];
  reducedGraphics: boolean;
  visible: boolean;
  materials: {
    wood: THREE.MeshStandardMaterial;
    core: THREE.MeshStandardMaterial;
    detail: THREE.MeshStandardMaterial;
  };
}) {
  const { invalidate, gl } = useThree();
  const asset = useMemo(() => createPilotTreeAsset(family), [family]);
  const meshes = useMemo(
    () => ({
      wood: new THREE.InstancedMesh(asset.trunk, materials.wood, trees.length),
      core: new THREE.InstancedMesh(asset.core, materials.core, trees.length),
      detail: new THREE.InstancedMesh(
        asset.detail,
        materials.detail,
        trees.length,
      ),
    }),
    [asset, materials, trees.length],
  );
  const group = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const transform = new THREE.Object3D(),
      color = new THREE.Color();
    trees.forEach((tree, i) => {
      const profile = pilotTreeProfile(tree);
      transform.position.set(
        tree.position[0],
        commercialTreeGroundElevation(tree, surfaceEntities),
        tree.position[1],
      );
      transform.rotation.set(0, profile.rotation, 0);
      transform.scale.set(profile.scaleX, profile.scaleY, profile.scaleZ);
      transform.updateMatrix();
      Object.values(meshes).forEach((mesh) =>
        mesh.setMatrixAt(i, transform.matrix),
      );
      color
        .set("#ffffff")
        .offsetHSL(
          (profile.tone - 0.5) * 0.035,
          0,
          (profile.tone - 0.5) * 0.085,
        );
      meshes.core.setColorAt(i, color);
      meshes.detail.setColorAt(i, color);
    });
    Object.values(meshes).forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      mesh.raycast = NO_RAYCAST;
    });
    invalidate();
    gl.shadowMap.needsUpdate = true;
  }, [meshes, trees, surfaceEntities, gl, invalidate]);
  useEffect(
    () => () => {
      Object.values(meshes).forEach(disposeInstancedMesh);
    },
    [meshes],
  );
  useEffect(() => () => asset.dispose(), [asset]);
  // Entire trees and core crowns persist. Only subpixel secondary leaves leave the draw list.
  useFrame(({ camera }) => {
    const box = meshes.core.boundingSphere;
    const distance = box
      ? Math.max(0, camera.position.distanceTo(box.center) - box.radius)
      : 0;
    const detailVisible = visible && !reducedGraphics && distance < 40;
    if (meshes.detail.visible !== detailVisible) {
      meshes.detail.visible = detailVisible;
      invalidate();
    }
    if (group.current) group.current.userData.detailVisible = detailVisible;
  });
  return (
    <group
      ref={group}
      visible={visible}
      name={`vegetation-pilot-trees-${family}`}
      dispose={null}
      userData={{
        presentationOnly: true,
        treeCount: trees.length,
        treeIds: trees.map((t) => t.id),
        family,
        alphaTestedLeaves: true,
      }}
    >
      <primitive
        object={meshes.wood}
        name={`pilot-trunks-${family}`}
        castShadow={!reducedGraphics}
        receiveShadow
      />
      <primitive
        object={meshes.core}
        name={`pilot-canopies-${family}`}
        castShadow={!reducedGraphics}
        receiveShadow
      />
      <primitive
        object={meshes.detail}
        name={`pilot-leaf-detail-${family}`}
        castShadow={false}
        receiveShadow
      />
    </group>
  );
}

export const VegetationPilotTreeLayer = memo(
  function VegetationPilotTreeLayer(props: {
    trees: readonly CommercialMapTree[];
    surfaceEntities: readonly MapEntity[];
    reducedGraphics: boolean;
    visible: boolean;
  }) {
    const atlas = useMemo(createPilotLeafAtlas, []);
    const materials = useMemo(
      () => ({
        wood: createPilotBarkMaterial(),
        core: createPilotFoliageMaterial(false, false, atlas),
        detail: createPilotFoliageMaterial(true, false, atlas),
      }),
      [atlas],
    );
    useEffect(
      () => () => {
        Object.values(materials).forEach((m) => m.dispose());
      },
      [materials],
    );
    useEffect(() => () => atlas.dispose(), [atlas]);
    const families = useMemo(
      () =>
        [0, 1, 2].map((family) =>
          props.trees.filter((t) => pilotTreeProfile(t).family === family),
        ),
      [props.trees],
    );
    return (
      <group
        name="vegetation-pilot-trees"
        userData={{
          areas: ["QUADRA_A", "QUADRA_B", "PARKING_EXHIBITORS_VISITORS"],
        }}
      >
        {families.map(
          (trees, family) =>
            trees.length > 0 && (
              <TreeFamily
                key={family}
                {...props}
                trees={trees}
                family={family}
                materials={materials}
              />
            ),
        )}
      </group>
    );
  },
);
