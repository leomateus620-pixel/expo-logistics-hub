import { memo, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  buildRearRoadNetworkGeometries,
  disposeRearRoadNetworkGeometries,
} from '../../utils/rearRoadNetwork';
import {
  openGroundTextureBundleForEntity,
  type OpenGroundSurfaceProfile,
} from './openGroundTextures';

interface RearParkRoadNetworkProps {
  reducedGraphics: boolean;
  visible?: boolean;
  opacity?: number;
}

const NO_RAYCAST = () => undefined;

/**
 * Road ribbons already encode physical repetition along V and normalize U to
 * the lane width. A unit tile preserves that established UV contract, while a
 * single PBR bundle guarantees identical transforms for all three maps.
 */
const REAR_ROAD_SURFACE_PROFILES = Object.freeze({
  highway: Object.freeze({
    surface: 'highwayAsphalt',
    tileWorldSize: 1,
    baseColor: '#5a6064',
    roughness: 0.97,
  }),
  park: Object.freeze({
    surface: 'parkAsphalt',
    tileWorldSize: 1,
    baseColor: '#5f635f',
    roughness: 0.98,
  }),
  shoulder: Object.freeze({
    surface: 'roadShoulder',
    tileWorldSize: 1,
    baseColor: '#a8977a',
    roughness: 0.99,
  }),
} satisfies Readonly<Record<'highway' | 'park' | 'shoulder', OpenGroundSurfaceProfile>>);

const ASPHALT_NORMAL_SCALE = new THREE.Vector2(0.16, 0.16);
const SHOULDER_NORMAL_SCALE = new THREE.Vector2(0.22, 0.22);

/**
 * BR-472, acesso ao parque, continuação única da Rua Brasília e vias internas da
 * área posterior. Apresentação apenas: a superfície oficial da Exporural segue
 * em `RoadInfrastructure`; somente extensões ausentes e as apresentações
 * contraditórias de Rua Brasília/BR são materializadas aqui. Nenhuma entidade
 * cadastral é lida, movida ou redimensionada pelo renderer.
 */
export const RearParkRoadNetwork = memo(function RearParkRoadNetwork({
  reducedGraphics,
  visible = true,
  opacity = 1,
}: RearParkRoadNetworkProps) {
  const maximumAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const network = useMemo(
    () => buildRearRoadNetworkGeometries(undefined, { reducedGraphics }),
    [reducedGraphics],
  );

  useEffect(() => () => disposeRearRoadNetworkGeometries(network), [network]);

  const textureBundles = useMemo(() => Object.freeze({
    highway: openGroundTextureBundleForEntity(
      REAR_ROAD_SURFACE_PROFILES.highway,
      maximumAnisotropy,
    ),
    park: openGroundTextureBundleForEntity(
      REAR_ROAD_SURFACE_PROFILES.park,
      maximumAnisotropy,
    ),
    shoulder: openGroundTextureBundleForEntity(
      REAR_ROAD_SURFACE_PROFILES.shoulder,
      maximumAnisotropy,
    ),
  }), [maximumAnisotropy]);
  const { highway: highwayTextures, park: parkTextures, shoulder: shoulderTextures } = textureBundles;

  useEffect(() => () => {
    Object.values(textureBundles).forEach((bundle) => bundle?.dispose());
  }, [textureBundles]);

  const presentedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
  const transparent = presentedOpacity < 0.995;

  if (!visible || presentedOpacity <= 0.015) return null;

  return (
    <group name="rear-park-road-network" renderOrder={1}>
      {network.highway && (
        <mesh geometry={network.highway} raycast={NO_RAYCAST} receiveShadow={!reducedGraphics} dispose={null}>
          <meshStandardMaterial
            map={highwayTextures?.map}
            normalMap={highwayTextures?.normalMap}
            normalScale={highwayTextures ? ASPHALT_NORMAL_SCALE : undefined}
            roughnessMap={highwayTextures?.roughnessMap}
            color={REAR_ROAD_SURFACE_PROFILES.highway.baseColor}
            roughness={REAR_ROAD_SURFACE_PROFILES.highway.roughness}
            metalness={0}
            side={THREE.DoubleSide}
            transparent={transparent}
            opacity={presentedOpacity}
            depthWrite={presentedOpacity > 0.42}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      )}
      {network.parkAsphalt && (
        <mesh geometry={network.parkAsphalt} raycast={NO_RAYCAST} receiveShadow={!reducedGraphics} dispose={null}>
          <meshStandardMaterial
            map={parkTextures?.map}
            normalMap={parkTextures?.normalMap}
            normalScale={parkTextures ? ASPHALT_NORMAL_SCALE : undefined}
            roughnessMap={parkTextures?.roughnessMap}
            color={REAR_ROAD_SURFACE_PROFILES.park.baseColor}
            roughness={REAR_ROAD_SURFACE_PROFILES.park.roughness}
            metalness={0}
            side={THREE.DoubleSide}
            transparent={transparent}
            opacity={presentedOpacity}
            depthWrite={presentedOpacity > 0.42}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      )}
      {network.shoulders && (
        <mesh geometry={network.shoulders} raycast={NO_RAYCAST} dispose={null}>
          <meshStandardMaterial
            map={shoulderTextures?.map}
            normalMap={shoulderTextures?.normalMap}
            normalScale={shoulderTextures ? SHOULDER_NORMAL_SCALE : undefined}
            roughnessMap={shoulderTextures?.roughnessMap}
            color={REAR_ROAD_SURFACE_PROFILES.shoulder.baseColor}
            roughness={REAR_ROAD_SURFACE_PROFILES.shoulder.roughness}
            metalness={0}
            side={THREE.DoubleSide}
            transparent={transparent}
            opacity={presentedOpacity}
            depthWrite={presentedOpacity > 0.42}
          />
        </mesh>
      )}
      {network.markings && (
        <mesh geometry={network.markings} raycast={NO_RAYCAST} dispose={null}>
          <meshStandardMaterial
            color="#d9d6c8"
            roughness={0.85}
            metalness={0}
            side={THREE.DoubleSide}
            transparent
            opacity={presentedOpacity * 0.82}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-3}
            polygonOffsetUnits={-3}
          />
        </mesh>
      )}
    </group>
  );
});
