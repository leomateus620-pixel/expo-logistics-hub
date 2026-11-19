import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CommercialMapTree } from '../../data/commercialTrees';
import type { SpecimenTreeProfile } from '../../data/commercialTreeSpecimens';
import { createCommercialTreeSpecimenGeometry } from '../../utils/commercialTreeSpecimenGeometry';
import { resolveCommercialMapExecutionPolicy } from '../../utils/executionPolicy';
import { createInternalFoliageMaterial, internalTreeCrownCastsShadow } from '../../utils/internalTreeVisuals';
import type { CommercialTreeSurfaceResolver } from '../../utils/treeLayer';
import { createVegetationLodController, vegetationLodDistanceToAnchor, type VegetationLodTier } from '../../utils/vegetationLod';
import type { CommercialMapQualityTier } from '../../utils/viewport';
import { createPilotBarkMaterial } from './vegetationPilotMaterial';

const NO_RAYCAST = () => undefined;

function createContactPatch() {
  const geometry = new THREE.CircleGeometry(1, 20);
  const color = new THREE.Color('#343528');
  const colors = [];
  for (let index = 0; index < geometry.getAttribute('position').count; index += 1) {
    colors.push(color.r, color.g, color.b, index === 0 ? .48 : 0);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  return geometry;
}

interface SpecimenRenderAssets {
  bark: THREE.Material;
  foliage: THREE.Material;
  contact: THREE.Material;
  contactGeometry: THREE.BufferGeometry;
}

function CommercialTreeSpecimen({
  tree, profile, groundY, visible, qualityTier, assets,
}: {
  tree: CommercialMapTree;
  profile: SpecimenTreeProfile;
  groundY: number;
  visible: boolean;
  qualityTier: CommercialMapQualityTier;
  assets: SpecimenRenderAssets;
}) {
  const group = useRef<THREE.Group>(null);
  const bark = useRef<THREE.Mesh>(null);
  const foliage = useRef<THREE.Mesh>(null);
  const elapsed = useRef(Number.POSITIVE_INFINITY);
  const { gl, camera, invalidate } = useThree();
  const updateHz = resolveCommercialMapExecutionPolicy(qualityTier).lodUpdateHz;
  const fullDetail = internalTreeCrownCastsShadow(qualityTier);
  const model = useMemo(() => {
    const lod = {
      near: createCommercialTreeSpecimenGeometry(profile, 'near'),
      mid: createCommercialTreeSpecimenGeometry(profile, 'mid'),
      far: createCommercialTreeSpecimenGeometry(profile, 'far'),
    };
    const bounds = new THREE.Box3().union(lod.near.bark.boundingBox!).union(lod.near.foliage.boundingBox!);
    return {
      lod,
      center: bounds.getCenter(new THREE.Vector3()),
      lodSpan: bounds.getSize(new THREE.Vector3()).length() * 4,
      controller: createVegetationLodController(),
    };
  }, [profile]);
  const [x, z] = tree.position;
  const anchor = useMemo(() => ({
    x: x + model.center.x, y: groundY + model.center.y, z: z + model.center.z,
  }), [groundY, model, x, z]);

  const applyTier = useCallback((tier: VegetationLodTier) => {
    if (!bark.current || !foliage.current || !group.current) return;
    const activeTier = tier === 'near' && !fullDetail ? 'mid' : tier;
    if (group.current.userData.vegetationLodTier === activeTier
      && bark.current.geometry === model.lod[activeTier].bark) return;
    bark.current.geometry = model.lod[activeTier].bark;
    foliage.current.geometry = model.lod[activeTier].foliage;
    group.current.userData.vegetationLodTier = activeTier;
    gl.shadowMap.needsUpdate = true;
  }, [fullDetail, gl, model]);

  useLayoutEffect(() => {
    const distance = vegetationLodDistanceToAnchor(camera.position, anchor);
    model.controller.update(distance, model.lodSpan);
    applyTier(model.controller.current() ?? 'far');
    elapsed.current = Number.POSITIVE_INFINITY;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [anchor, applyTier, camera, gl, invalidate, model, visible]);

  useEffect(() => () => {
    for (const { bark, foliage } of Object.values(model.lod)) {
      bark.dispose();
      foliage.dispose();
    }
  }, [model]);

  useFrame((state, delta) => {
    if (!visible) return;
    elapsed.current += delta;
    if (elapsed.current < 1 / updateHz) return;
    elapsed.current = 0;
    const distance = vegetationLodDistanceToAnchor(state.camera.position, anchor);
    const tier = model.controller.update(distance, model.lodSpan);
    if (tier) applyTier(tier);
  });

  return (
    <group ref={group} name={tree.id} position={[x, groundY, z]} visible={visible} dispose={null}>
      <mesh name="specimen-bark" ref={bark} geometry={model.lod.far.bark} material={assets.bark}
        raycast={NO_RAYCAST} castShadow={visible} receiveShadow frustumCulled />
      <mesh name="specimen-foliage" ref={foliage} geometry={model.lod.far.foliage} material={assets.foliage}
        raycast={NO_RAYCAST} castShadow={visible && fullDetail} receiveShadow={fullDetail} frustumCulled />
      <mesh name="specimen-contact" geometry={assets.contactGeometry} material={assets.contact}
        position={[0, -.001, 0]} rotation={[-Math.PI / 2, 0, 0]}
        scale={[profile.contactSize[0], profile.contactSize[1], 1]} raycast={NO_RAYCAST} frustumCulled />
    </group>
  );
}

export const CommercialTreeSpecimens = memo(function CommercialTreeSpecimens({
  specimens, surfaceResolver, visible, qualityTier, leafAtlas,
}: {
  specimens: readonly { tree: CommercialMapTree; profile: SpecimenTreeProfile }[];
  surfaceResolver: CommercialTreeSurfaceResolver;
  visible: boolean;
  qualityTier: CommercialMapQualityTier;
  leafAtlas: THREE.Texture;
}) {
  const assets = useMemo<SpecimenRenderAssets>(() => {
    const foliage = createInternalFoliageMaterial(leafAtlas, true);
    foliage.emissive.set('#59653c');
    foliage.emissiveIntensity = .045;
    return {
      bark: createPilotBarkMaterial(),
      foliage,
      contact: new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
      contactGeometry: createContactPatch(),
    };
  }, [leafAtlas]);
  const resolved = useMemo(() => specimens.map(({ tree, profile }) => ({
    tree, profile, groundY: surfaceResolver.groundElevation(tree),
  })), [specimens, surfaceResolver]);
  useEffect(() => () => {
    Object.values(assets).forEach((asset) => asset.dispose());
  }, [assets]);
  return (
    <>
      {resolved.map(({ tree, profile, groundY }) => (
        <CommercialTreeSpecimen key={tree.id} tree={tree} profile={profile} groundY={groundY}
          assets={assets} qualityTier={qualityTier} visible={visible} />
      ))}
    </>
  );
});
