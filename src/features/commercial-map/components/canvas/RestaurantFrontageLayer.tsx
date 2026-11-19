import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { MapEntity } from '../../types';
import {
  RESTAURANT_FRONTAGE_LAYOUT,
  buildRestaurantFrontagePlan,
  type FrontageBox,
  type FrontageRect,
  type FrontageTree,
} from '../../utils/restaurantFrontage';
import { createRestaurantFrontagePavingTexture, createRestaurantFrontageSlabGeometry } from '../../utils/restaurantFrontageGeometry';
import { applyInteriorGroundMaterial } from './interiorGroundMaterial';
import { applyParkSurfaceDetail } from './parkSurfaceMaterial';
import { RestaurantFrontageFurniture } from './RestaurantFrontageFurniture';
import { FRONTAGE_NO_RAYCAST, FrontageInstances, type FrontageInstance } from './RestaurantFrontageInstances';

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

function jointItems(joints: readonly FrontageBox[]): FrontageInstance[] {
  const { topElevation, jointLift } = RESTAURANT_FRONTAGE_LAYOUT.slab;
  return joints.map((joint) => ({
    position: [joint.center[0], topElevation + jointLift, joint.center[1]],
    scale: [joint.size[0], 0.0024, joint.size[1]],
  }));
}

function hedgeItems(hedges: readonly FrontageBox[]): FrontageInstance[] {
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
  night = false,
}: {
  entities: readonly MapEntity[];
  trees: readonly FrontageTree[];
  reducedGraphics: boolean;
  visible?: boolean;
  vegetationVisible?: boolean;
  night?: boolean;
}) {
  const plan = useMemo(
    () => buildRestaurantFrontagePlan({ entities, trees }),
    [entities, trees],
  );
  const slabGeometry = useMemo(
    () => plan.slab ? createRestaurantFrontageSlabGeometry(plan.slab, plan.treePits) : null,
    [plan.slab, plan.treePits],
  );
  useEffect(() => () => slabGeometry?.dispose(), [slabGeometry]);
  const pavementTexture = useMemo(
    () => !reducedGraphics && plan.available ? createRestaurantFrontagePavingTexture() : null,
    [plan.available, reducedGraphics],
  );
  useEffect(() => () => pavementTexture?.dispose(), [pavementTexture]);
  const materials = useMemo(() => {
    const concrete = surfaceMaterial(palette.concrete, 0.86, -0.9);
    concrete.map = pavementTexture;
    return {
      concrete: applyParkSurfaceDetail(concrete, {
        grainStrength: 0.20,
        grainFrequency: 38,
        detailFadeStart: 4,
        detailFadeEnd: 20,
      }, reducedGraphics),
      joint: surfaceMaterial(palette.joint, 0.92, -1.2),
      connector: surfaceMaterial(palette.connector, 0.9, -0.8),
      lawn: applyInteriorGroundMaterial(surfaceMaterial(palette.lawn, 1, -0.5)),
      hedge: surfaceMaterial(palette.hedge, 0.94, 0),
      shrub: surfaceMaterial(palette.shrub, 0.96, 0),
      soil: surfaceMaterial(palette.soil, 1, -1.1),
      pitCurb: surfaceMaterial(palette.pitCurb, 0.88, -1),
    };
  }, [pavementTexture, reducedGraphics]);

  useEffect(() => () => {
    Object.values(materials).forEach((material) => material.dispose());
  }, [materials]);

  const joints = useMemo(() => jointItems(plan.joints), [plan.joints]);
  const hedges = useMemo(() => hedgeItems(plan.hedges), [plan.hedges]);
  const shrubs = useMemo<FrontageInstance[]>(() => plan.shrubs.map((shrub) => {
    const radius = RESTAURANT_FRONTAGE_LAYOUT.shrub.radius * shrub.scale;
    const flatten = 0.7 + shrub.variant * 0.08;
    return {
      position: [shrub.position[0], RESTAURANT_FRONTAGE_LAYOUT.shrub.baseElevation + radius * flatten * 0.82, shrub.position[1]],
      scale: [radius * 2, radius * 2 * flatten, radius * 2 * (0.92 + shrub.variant * 0.05)],
    };
  }), [plan.shrubs]);
  const pitCurbs = useMemo<FrontageInstance[]>(() => {
    const { size, curbWidth, soilElevation, curbTopElevation } = RESTAURANT_FRONTAGE_LAYOUT.treePit;
    const inner = size - curbWidth * 2;
    const offset = (size - curbWidth) / 2;
    const height = curbTopElevation - soilElevation;
    const y = soilElevation + height / 2;
    return plan.treePits.flatMap(([x, z]): FrontageInstance[] => [
      { position: [x - offset, y, z], scale: [curbWidth, height, size] },
      { position: [x + offset, y, z], scale: [curbWidth, height, size] },
      { position: [x, y, z - offset], scale: [inner, height, curbWidth] },
      { position: [x, y, z + offset], scale: [inner, height, curbWidth] },
    ]);
  }, [plan.treePits]);
  const pitSoil = useMemo<FrontageInstance[]>(() => plan.treePits.map(([x, z]) => {
    const inner = RESTAURANT_FRONTAGE_LAYOUT.treePit.size - RESTAURANT_FRONTAGE_LAYOUT.treePit.curbWidth * 2;
    return {
      position: [x, RESTAURANT_FRONTAGE_LAYOUT.treePit.soilElevation - 0.0015, z],
      scale: [inner, 0.003, inner],
    };
  }), [plan.treePits]);

  if (!visible || !plan.available || !plan.slab || !slabGeometry) return null;
  const connector = RESTAURANT_FRONTAGE_LAYOUT.connector;

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
          raycast={FRONTAGE_NO_RAYCAST}
          receiveShadow
          renderOrder={1}
          dispose={null}
        />
      )}
      <mesh
        name="restaurant-frontage:concrete-slab"
        geometry={slabGeometry}
        material={materials.concrete}
        raycast={FRONTAGE_NO_RAYCAST}
        receiveShadow
        renderOrder={2}
        dispose={null}
      />
      <FrontageInstances name="restaurant-frontage:slab-joints" items={joints} material={materials.joint} />
      {plan.connector && (
        <mesh
          name="restaurant-frontage:entrance-path"
          geometry={UNIT_BOX}
          material={materials.connector}
          position={[rectCenter(plan.connector)[0], connector.topElevation - connector.thickness / 2, rectCenter(plan.connector)[1]]}
          scale={[rectSize(plan.connector)[0], connector.thickness, rectSize(plan.connector)[1]]}
          raycast={FRONTAGE_NO_RAYCAST}
          receiveShadow
          renderOrder={2}
          dispose={null}
        />
      )}
      <FrontageInstances name="restaurant-frontage:tree-pit-curbs" items={pitCurbs} material={materials.pitCurb} />
      <FrontageInstances name="restaurant-frontage:tree-pit-soil" items={pitSoil} material={materials.soil} />
      <RestaurantFrontageFurniture
        portal={plan.portal}
        benches={plan.benchCanopies}
        plantBeds={plan.plantBeds}
        night={night}
        reducedGraphics={reducedGraphics}
        vegetationVisible={vegetationVisible}
      />
      {vegetationVisible && (
        <>
          <FrontageInstances name="restaurant-frontage:hedges" items={hedges} material={materials.hedge} castShadow receiveShadow />
          <FrontageInstances name="restaurant-frontage:shrubs" geometry={UNIT_SHRUB} items={shrubs} material={materials.shrub} castShadow />
        </>
      )}
    </group>
  );
});
