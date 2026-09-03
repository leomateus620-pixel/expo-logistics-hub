import { memo, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SE_CLOVERLEAF_REVISION } from '../../data/seCloverleaf';
import { REGIONAL_HIGHWAY_PALETTE } from '../../data/regional-highways';
import {
  buildSeCloverleafRenderModel,
  disposeSeCloverleafRenderModel,
} from '../../utils/seCloverleaf';
import {
  openGroundTextureBundleForEntity,
  type OpenGroundSurfaceProfile,
} from './openGroundTextures';

interface SeCloverleafProps {
  reducedGraphics: boolean;
  visible?: boolean;
  opacity?: number;
}

const NO_RAYCAST = () => undefined;

const SURFACE_PROFILES = Object.freeze({
  highway: Object.freeze({
    surface: 'highwayAsphalt',
    tileWorldSize: 1,
    baseColor: REGIONAL_HIGHWAY_PALETTE.carriageway,
    roughness: 0.92,
  }),
  ramp: Object.freeze({
    surface: 'highwayAsphalt',
    tileWorldSize: 1,
    baseColor: REGIONAL_HIGHWAY_PALETTE.carriagewayGrain,
    roughness: 0.93,
  }),
  crossing: Object.freeze({
    surface: 'highwayAsphalt',
    tileWorldSize: 1,
    baseColor: REGIONAL_HIGHWAY_PALETTE.carriageway,
    roughness: 0.94,
  }),
  shoulder: Object.freeze({
    surface: 'roadShoulder',
    tileWorldSize: 1,
    baseColor: REGIONAL_HIGHWAY_PALETTE.shoulder,
    roughness: 0.96,
  }),
  grass: Object.freeze({
    surface: 'grass',
    tileWorldSize: 8,
    baseColor: '#7f9a5c',
    roughness: 0.97,
  }),
} satisfies Readonly<Record<string, OpenGroundSurfaceProfile>>);

const ASPHALT_NORMAL_SCALE = new THREE.Vector2(0.16, 0.16);
const SHOULDER_NORMAL_SCALE = new THREE.Vector2(0.22, 0.22);
const GRASS_NORMAL_SCALE = new THREE.Vector2(0.2, 0.2);

const FEATURE_USER_DATA = Object.freeze({
  featureSet: 'se-cloverleaf-br472',
  spatialRevision: SE_CLOVERLEAF_REVISION,
  classification: 'NON_COMMERCIAL_INFRASTRUCTURE',
  isSellable: false,
  contributesToCommercialMetrics: false,
  protectedCommercialGeometry: true,
  officialOwnerIdentifier: 'RODOVIA-RS-472',
});

/**
 * Cloverleaf sudeste da BR-472. Malha própria, sem cadastro paralelo e sem
 * alterar o trevo em Y do Portão 5. O hit-test fica na fita oficial da
 * rodovia; esta camada é só apresentação.
 */
export const SeCloverleaf = memo(function SeCloverleaf({
  reducedGraphics,
  visible = true,
  opacity = 1,
}: SeCloverleafProps) {
  const maximumAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const model = useMemo(
    () => buildSeCloverleafRenderModel({ reducedGraphics }),
    [reducedGraphics],
  );

  useEffect(() => () => disposeSeCloverleafRenderModel(model), [model]);

  const textures = useMemo(() => Object.freeze({
    highway: openGroundTextureBundleForEntity(SURFACE_PROFILES.highway, maximumAnisotropy),
    ramp: openGroundTextureBundleForEntity(SURFACE_PROFILES.ramp, maximumAnisotropy),
    crossing: openGroundTextureBundleForEntity(SURFACE_PROFILES.crossing, maximumAnisotropy),
    shoulder: openGroundTextureBundleForEntity(SURFACE_PROFILES.shoulder, maximumAnisotropy),
    grass: openGroundTextureBundleForEntity(SURFACE_PROFILES.grass, maximumAnisotropy),
  }), [maximumAnisotropy]);

  useEffect(() => () => {
    Object.values(textures).forEach((bundle) => bundle?.dispose());
  }, [textures]);

  const presentedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
  const transparent = presentedOpacity < 0.995;
  const { geometries } = model;

  return (
    <group
      name="se-cloverleaf-br472"
      visible={visible}
      userData={FEATURE_USER_DATA}
      renderOrder={2}
    >
      {geometries.grass && (
        <mesh geometry={geometries.grass} receiveShadow={!reducedGraphics} raycast={NO_RAYCAST} dispose={null}>
          <meshStandardMaterial
            map={textures.grass?.map}
            normalMap={textures.grass?.normalMap}
            normalScale={textures.grass ? GRASS_NORMAL_SCALE : undefined}
            roughnessMap={textures.grass?.roughnessMap}
            color={SURFACE_PROFILES.grass.baseColor}
            roughness={SURFACE_PROFILES.grass.roughness}
            metalness={0}
            side={THREE.FrontSide}
            transparent={transparent}
            opacity={presentedOpacity}
            depthWrite={presentedOpacity > 0.42}
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        </mesh>
      )}
      {geometries.shoulders && (
        <mesh geometry={geometries.shoulders} receiveShadow={!reducedGraphics} raycast={NO_RAYCAST} dispose={null}>
          <meshStandardMaterial
            map={textures.shoulder?.map}
            normalMap={textures.shoulder?.normalMap}
            normalScale={textures.shoulder ? SHOULDER_NORMAL_SCALE : undefined}
            roughnessMap={textures.shoulder?.roughnessMap}
            color={SURFACE_PROFILES.shoulder.baseColor}
            roughness={SURFACE_PROFILES.shoulder.roughness}
            metalness={0}
            side={THREE.FrontSide}
            transparent={transparent}
            opacity={presentedOpacity}
            depthWrite={presentedOpacity > 0.42}
          />
        </mesh>
      )}
      {geometries.highway && (
        <mesh geometry={geometries.highway} receiveShadow={!reducedGraphics} raycast={NO_RAYCAST} dispose={null}>
          <meshStandardMaterial
            map={textures.highway?.map}
            normalMap={textures.highway?.normalMap}
            normalScale={textures.highway ? ASPHALT_NORMAL_SCALE : undefined}
            roughnessMap={textures.highway?.roughnessMap}
            color={SURFACE_PROFILES.highway.baseColor}
            roughness={SURFACE_PROFILES.highway.roughness}
            metalness={0}
            side={THREE.FrontSide}
            transparent={transparent}
            opacity={presentedOpacity}
            depthWrite={presentedOpacity > 0.42}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      )}
      {geometries.ramps && (
        <mesh geometry={geometries.ramps} receiveShadow={!reducedGraphics} raycast={NO_RAYCAST} dispose={null}>
          <meshStandardMaterial
            map={textures.ramp?.map}
            normalMap={textures.ramp?.normalMap}
            normalScale={textures.ramp ? ASPHALT_NORMAL_SCALE : undefined}
            roughnessMap={textures.ramp?.roughnessMap}
            color={SURFACE_PROFILES.ramp.baseColor}
            roughness={SURFACE_PROFILES.ramp.roughness}
            metalness={0}
            side={THREE.FrontSide}
            transparent={transparent}
            opacity={presentedOpacity}
            depthWrite={presentedOpacity > 0.42}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      )}
      {geometries.crossing && (
        <mesh geometry={geometries.crossing} receiveShadow={!reducedGraphics} raycast={NO_RAYCAST} dispose={null}>
          <meshStandardMaterial
            map={textures.crossing?.map}
            normalMap={textures.crossing?.normalMap}
            normalScale={textures.crossing ? ASPHALT_NORMAL_SCALE : undefined}
            roughnessMap={textures.crossing?.roughnessMap}
            color={SURFACE_PROFILES.crossing.baseColor}
            roughness={SURFACE_PROFILES.crossing.roughness}
            metalness={0}
            side={THREE.FrontSide}
            transparent={transparent}
            opacity={presentedOpacity}
            depthWrite={presentedOpacity > 0.42}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      )}
      {geometries.roundabout && (
        <mesh geometry={geometries.roundabout} receiveShadow={!reducedGraphics} raycast={NO_RAYCAST} dispose={null}>
          <meshStandardMaterial
            color="#f5d031"
            roughness={0.78}
            metalness={0.04}
            side={THREE.FrontSide}
            transparent={transparent}
            opacity={presentedOpacity}
            depthWrite={presentedOpacity > 0.42}
            polygonOffset
            polygonOffsetFactor={-3}
            polygonOffsetUnits={-3}
          />
        </mesh>
      )}
      {geometries.concrete && (
        <mesh
          geometry={geometries.concrete}
          castShadow={!reducedGraphics}
          receiveShadow={!reducedGraphics}
          raycast={NO_RAYCAST}
          dispose={null}
        >
          <meshStandardMaterial
            color="#b7b3a8"
            roughness={0.86}
            metalness={0.03}
            side={THREE.FrontSide}
            transparent={transparent}
            opacity={presentedOpacity}
            depthWrite={presentedOpacity > 0.42}
          />
        </mesh>
      )}
      {geometries.markings && (
        <mesh geometry={geometries.markings} raycast={NO_RAYCAST} dispose={null}>
          <meshStandardMaterial
            color="#f5d031"
            roughness={0.85}
            metalness={0}
            side={THREE.FrontSide}
            transparent
            opacity={presentedOpacity * 0.82}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-4}
            polygonOffsetUnits={-4}
          />
        </mesh>
      )}
    </group>
  );
});
