import { memo, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  openGroundTextureBundleForEntity,
  type OpenGroundSurfaceProfile,
} from '../../components/canvas/openGroundTextures';
import {
  BR344_CARTOGRAPHIC_FINISH,
  BR344_DISPLAY_NAME,
  BR344_REVISION,
} from './br344Mainline';
import {
  buildBr344MainlineGeometries,
  disposeBr344MainlineGeometries,
} from './br344Geometry';

export interface Br344MainlineProps {
  reducedGraphics?: boolean;
  visible?: boolean;
  opacity?: number;
}

const NO_RAYCAST = () => undefined;

const SURFACE_PROFILES = Object.freeze({
  carriageway: Object.freeze({
    surface: 'highwayAsphalt',
    tileWorldSize: 1,
    baseColor: BR344_CARTOGRAPHIC_FINISH.carriagewayColor,
    roughness: BR344_CARTOGRAPHIC_FINISH.carriagewayRoughness,
  }),
  shoulder: Object.freeze({
    surface: 'roadShoulder',
    tileWorldSize: 1,
    baseColor: BR344_CARTOGRAPHIC_FINISH.shoulderColor,
    roughness: BR344_CARTOGRAPHIC_FINISH.shoulderRoughness,
  }),
  median: Object.freeze({
    surface: 'landscapeGrass',
    tileWorldSize: 2.4,
    baseColor: BR344_CARTOGRAPHIC_FINISH.medianColor,
    roughness: BR344_CARTOGRAPHIC_FINISH.medianRoughness,
  }),
} satisfies Readonly<Record<'carriageway' | 'shoulder' | 'median', OpenGroundSurfaceProfile>>);

const ASPHALT_NORMAL_SCALE = new THREE.Vector2(0.14, 0.14);
const SHOULDER_NORMAL_SCALE = new THREE.Vector2(0.2, 0.2);
const MEDIAN_NORMAL_SCALE = new THREE.Vector2(0.28, 0.28);

/**
 * Isolated BR-344 mainline. Drop into the commercial-map canvas beside the
 * rear-road network. Presentation only: no cadastre, no ramps, no BR-472.
 */
export const Br344Mainline = memo(function Br344Mainline({
  reducedGraphics = false,
  visible = true,
  opacity = 1,
}: Br344MainlineProps) {
  const maximumAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const network = useMemo(
    () => buildBr344MainlineGeometries({ reducedGraphics }),
    [reducedGraphics],
  );

  useEffect(() => () => disposeBr344MainlineGeometries(network), [network]);

  const textureBundles = useMemo(() => Object.freeze({
    carriageway: openGroundTextureBundleForEntity(
      SURFACE_PROFILES.carriageway,
      maximumAnisotropy,
    ),
    shoulder: openGroundTextureBundleForEntity(
      SURFACE_PROFILES.shoulder,
      maximumAnisotropy,
    ),
    median: openGroundTextureBundleForEntity(
      SURFACE_PROFILES.median,
      maximumAnisotropy,
    ),
  }), [maximumAnisotropy]);

  useEffect(() => () => {
    Object.values(textureBundles).forEach((bundle) => bundle?.dispose());
  }, [textureBundles]);

  const presentedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
  const transparent = presentedOpacity < 0.995;
  const shown = visible && presentedOpacity > 0.015;
  const { carriageway: carriagewayTextures, shoulder: shoulderTextures, median: medianTextures } = textureBundles;

  return (
    <group
      name="br344-mainline"
      userData={{
        revision: BR344_REVISION,
        highway: BR344_DISPLAY_NAME,
        slice: 'agent-2-mainline',
      }}
      renderOrder={1}
      visible={shown}
    >
      {network.shoulders && (
        <mesh geometry={network.shoulders} receiveShadow={!reducedGraphics} raycast={NO_RAYCAST} dispose={null}>
          <meshStandardMaterial
            map={shoulderTextures?.map}
            normalMap={shoulderTextures?.normalMap}
            normalScale={shoulderTextures ? SHOULDER_NORMAL_SCALE : undefined}
            roughnessMap={shoulderTextures?.roughnessMap}
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
      {network.median && (
        <mesh geometry={network.median} receiveShadow={!reducedGraphics} raycast={NO_RAYCAST} dispose={null}>
          <meshStandardMaterial
            map={medianTextures?.map}
            normalMap={medianTextures?.normalMap}
            normalScale={medianTextures ? MEDIAN_NORMAL_SCALE : undefined}
            roughnessMap={medianTextures?.roughnessMap}
            color={SURFACE_PROFILES.median.baseColor}
            roughness={SURFACE_PROFILES.median.roughness}
            metalness={0}
            side={THREE.FrontSide}
            transparent={transparent}
            opacity={presentedOpacity}
            depthWrite={presentedOpacity > 0.42}
          />
        </mesh>
      )}
      {network.carriageway && (
        <mesh
          geometry={network.carriageway}
          receiveShadow={!reducedGraphics}
          raycast={NO_RAYCAST}
          dispose={null}
        >
          <meshStandardMaterial
            map={carriagewayTextures?.map}
            normalMap={carriagewayTextures?.normalMap}
            normalScale={carriagewayTextures ? ASPHALT_NORMAL_SCALE : undefined}
            roughnessMap={carriagewayTextures?.roughnessMap}
            color={SURFACE_PROFILES.carriageway.baseColor}
            roughness={SURFACE_PROFILES.carriageway.roughness}
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
      {network.yellowEdges && (
        <mesh geometry={network.yellowEdges} raycast={NO_RAYCAST} dispose={null}>
          <meshStandardMaterial
            color={BR344_CARTOGRAPHIC_FINISH.yellowEdgeColor}
            roughness={BR344_CARTOGRAPHIC_FINISH.yellowEdgeRoughness}
            metalness={0.04}
            emissive={BR344_CARTOGRAPHIC_FINISH.yellowEdgeColor}
            emissiveIntensity={0.12}
            side={THREE.FrontSide}
            transparent={transparent}
            opacity={presentedOpacity}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-3}
            polygonOffsetUnits={-3}
          />
        </mesh>
      )}
      {network.markings && (
        <mesh geometry={network.markings} raycast={NO_RAYCAST} dispose={null}>
          <meshStandardMaterial
            color={BR344_CARTOGRAPHIC_FINISH.laneDashColor}
            roughness={BR344_CARTOGRAPHIC_FINISH.laneDashRoughness}
            metalness={0}
            side={THREE.FrontSide}
            transparent
            opacity={presentedOpacity * 0.9}
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
