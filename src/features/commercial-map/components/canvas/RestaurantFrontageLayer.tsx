import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { MapEntity } from '../../types';
import {
  RESTAURANT_FRONTAGE_LAYOUT,
  buildRestaurantFrontagePlan,
  type FrontageBox,
  type FrontageRect,
  type FrontageTree,
} from '../../utils/restaurantFrontage';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';
import { applyParkGroundDetail } from './terrainMaterial';

const NO_RAYCAST = () => undefined;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_SHRUB = new THREE.IcosahedronGeometry(0.5, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
UNIT_PLANE.rotateX(-Math.PI / 2);

const palette = RESTAURANT_FRONTAGE_LAYOUT.palette;

function surfaceMaterial(color: string, roughness: number, polygonOffsetFactor: number) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor,
    polygonOffsetUnits: -1,
  });
  material.userData.presentationOnly = true;
  return material;
}

function rectCenter(rect: FrontageRect): readonly [number, number] {
  return [(rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2];
}

function rectSize(rect: FrontageRect): readonly [number, number] {
  return [rect.maxX - rect.minX, rect.maxZ - rect.minZ];
}

interface InstanceItem {
  position: readonly [number, number, number];
  scale: readonly [number, number, number];
}

function BoxInstances({
  items,
  material,
  geometry = UNIT_BOX,
  castShadow = false,
  receiveShadow = false,
  name,
}: {
  items: readonly InstanceItem[];
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
    items.forEach((item, index) => {
      object.position.set(...item.position);
      object.scale.set(...item.scale);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    return () => disposeInstancedMesh(mesh);
  }, [items]);
  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      name={name}
      args={[geometry, material, items.length]}
      raycast={NO_RAYCAST}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      dispose={null}
    />
  );
}

function jointItems(joints: readonly FrontageBox[]): InstanceItem[] {
  const { topElevation, jointLift } = RESTAURANT_FRONTAGE_LAYOUT.slab;
  return joints.map((joint) => ({
    position: [joint.center[0], topElevation + jointLift, joint.center[1]],
    scale: [joint.size[0], 0.0024, joint.size[1]],
  }));
}

function hedgeItems(hedges: readonly FrontageBox[]): InstanceItem[] {
  const { baseElevation, height } = RESTAURANT_FRONTAGE_LAYOUT.hedge;
  return hedges.map((hedge) => ({
    position: [hedge.center[0], baseElevation + height / 2, hedge.center[1]],
    scale: [hedge.size[0], height, hedge.size[1]],
  }));
}

export const RestaurantFrontageLayer = memo(function RestaurantFrontageLayer({
  entities,
  trees,
  reducedGraphics,
  visible = true,
  vegetationVisible = true,
}: {
  entities: readonly MapEntity[];
  trees: readonly FrontageTree[];
  reducedGraphics: boolean;
  visible?: boolean;
  vegetationVisible?: boolean;
}) {
  const plan = useMemo(
    () => buildRestaurantFrontagePlan({ entities, trees }),
    [entities, trees],
  );
  const materials = useMemo(() => ({
    concrete: surfaceMaterial(palette.concrete, 0.86, -0.9),
    joint: surfaceMaterial(palette.joint, 0.92, -1.2),
    connector: surfaceMaterial(palette.connector, 0.9, -0.8),
    lawn: applyParkGroundDetail(surfaceMaterial(palette.lawn, 1, -0.5), reducedGraphics),
    hedge: surfaceMaterial(palette.hedge, 0.94, 0),
    shrub: surfaceMaterial(palette.shrub, 0.96, 0),
    soil: surfaceMaterial(palette.soil, 1, -1.1),
    pitCurb: surfaceMaterial(palette.pitCurb, 0.88, -1),
  }), [reducedGraphics]);

  useEffect(() => () => {
    Object.values(materials).forEach((material) => material.dispose());
  }, [materials]);

  const joints = useMemo(() => jointItems(plan.joints), [plan.joints]);
  const hedges = useMemo(() => hedgeItems(plan.hedges), [plan.hedges]);
  const shrubs = useMemo<InstanceItem[]>(() => plan.shrubs.map((shrub) => {
    const radius = RESTAURANT_FRONTAGE_LAYOUT.shrub.radius * shrub.scale;
    const flatten = 0.7 + shrub.variant * 0.08;
    return {
      position: [shrub.position[0], RESTAURANT_FRONTAGE_LAYOUT.shrub.baseElevation + radius * flatten * 0.82, shrub.position[1]],
      scale: [radius * 2, radius * 2 * flatten, radius * 2 * (0.92 + shrub.variant * 0.05)],
    };
  }), [plan.shrubs]);
  const pitCurbs = useMemo<InstanceItem[]>(() => plan.treePits.map(([x, z]) => ({
    position: [x, RESTAURANT_FRONTAGE_LAYOUT.treePit.elevation, z],
    scale: [RESTAURANT_FRONTAGE_LAYOUT.treePit.size, 0.003, RESTAURANT_FRONTAGE_LAYOUT.treePit.size],
  })), [plan.treePits]);
  const pitSoil = useMemo<InstanceItem[]>(() => plan.treePits.map(([x, z]) => {
    const inner = RESTAURANT_FRONTAGE_LAYOUT.treePit.size - RESTAURANT_FRONTAGE_LAYOUT.treePit.curbWidth * 2;
    return {
      position: [x, RESTAURANT_FRONTAGE_LAYOUT.treePit.elevation + 0.0016, z],
      scale: [inner, 0.003, inner],
    };
  }), [plan.treePits]);

  if (!visible || !plan.available || !plan.slab) return null;
  const slab = RESTAURANT_FRONTAGE_LAYOUT.slab;
  const connector = RESTAURANT_FRONTAGE_LAYOUT.connector;
  const [slabX, slabZ] = rectCenter(plan.slab);
  const [slabWidth, slabDepth] = rectSize(plan.slab);

  return (
    <group
      name="restaurant-frontage:calcada-do-arvoredo"
      dispose={null}
      userData={{
        presentationOnly: true,
        selectable: false,
        revision: RESTAURANT_FRONTAGE_LAYOUT.revision,
        drawCalls: plan.diagnostics.drawCalls,
        clippedByRoadIds: plan.diagnostics.clippedByRoadIds,
      }}
    >
      {plan.lawn && (
        <mesh
          name="restaurant-frontage:lawn"
          geometry={UNIT_PLANE}
          material={materials.lawn}
          position={[rectCenter(plan.lawn)[0], RESTAURANT_FRONTAGE_LAYOUT.lawn.elevation, rectCenter(plan.lawn)[1]]}
          scale={[rectSize(plan.lawn)[0], 1, rectSize(plan.lawn)[1]]}
          raycast={NO_RAYCAST}
          receiveShadow
          renderOrder={1}
          dispose={null}
        />
      )}
      <mesh
        name="restaurant-frontage:concrete-slab"
        geometry={UNIT_BOX}
        material={materials.concrete}
        position={[slabX, slab.topElevation - slab.thickness / 2, slabZ]}
        scale={[slabWidth, slab.thickness, slabDepth]}
        raycast={NO_RAYCAST}
        receiveShadow
        renderOrder={2}
        dispose={null}
      />
      <BoxInstances name="restaurant-frontage:slab-joints" items={joints} material={materials.joint} />
      {plan.connector && (
        <mesh
          name="restaurant-frontage:entrance-path"
          geometry={UNIT_BOX}
          material={materials.connector}
          position={[rectCenter(plan.connector)[0], connector.topElevation - connector.thickness / 2, rectCenter(plan.connector)[1]]}
          scale={[rectSize(plan.connector)[0], connector.thickness, rectSize(plan.connector)[1]]}
          raycast={NO_RAYCAST}
          receiveShadow
          renderOrder={2}
          dispose={null}
        />
      )}
      {vegetationVisible && (
        <>
          <BoxInstances name="restaurant-frontage:tree-pit-curbs" items={pitCurbs} material={materials.pitCurb} />
          <BoxInstances name="restaurant-frontage:tree-pit-soil" items={pitSoil} material={materials.soil} />
          <BoxInstances name="restaurant-frontage:hedges" items={hedges} material={materials.hedge} castShadow receiveShadow />
          <BoxInstances name="restaurant-frontage:shrubs" geometry={UNIT_SHRUB} items={shrubs} material={materials.shrub} castShadow />
        </>
      )}
    </group>
  );
});
