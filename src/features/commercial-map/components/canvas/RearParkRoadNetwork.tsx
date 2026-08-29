import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import {
  buildRearRoadNetworkGeometries,
  disposeRearRoadNetworkGeometries,
} from '../../utils/rearRoadNetwork';
import { getOpenGroundTexture } from './openGroundTextures';

interface RearParkRoadNetworkProps {
  reducedGraphics: boolean;
  visible?: boolean;
  opacity?: number;
}

const NO_RAYCAST = () => undefined;

function useTiledTexture(surface: Parameters<typeof getOpenGroundTexture>[0], repeatY: number) {
  return useMemo(() => {
    const shared = getOpenGroundTexture(surface);
    if (!shared) return null;
    const texture = shared.clone();
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, repeatY);
    texture.needsUpdate = true;
    return texture;
  }, [surface, repeatY]);
}

/**
 * BR-472, acesso ao parque, continuação única da Rua Brasília e vias internas da
 * área posterior. Apresentação apenas: as vias oficiais (inclusive toda a malha
 * da Exporural) continuam sendo renderizadas por `RoadInfrastructure` e não são
 * lidas, movidas ou redimensionadas aqui.
 */
export const RearParkRoadNetwork = memo(function RearParkRoadNetwork({
  reducedGraphics,
  visible = true,
  opacity = 1,
}: RearParkRoadNetworkProps) {
  const network = useMemo(
    () => buildRearRoadNetworkGeometries(undefined, { reducedGraphics }),
    [reducedGraphics],
  );

  useEffect(() => () => disposeRearRoadNetworkGeometries(network), [network]);

  const highwayTexture = useTiledTexture('highwayAsphalt', 1);
  const parkTexture = useTiledTexture('parkAsphalt', 1);
  const shoulderTexture = useTiledTexture('roadShoulder', 1);

  useEffect(() => () => {
    highwayTexture?.dispose();
    parkTexture?.dispose();
    shoulderTexture?.dispose();
  }, [highwayTexture, parkTexture, shoulderTexture]);

  const transparent = opacity < 1;

  if (!visible) return null;

  return (
    <group name="rear-park-road-network" renderOrder={1}>
      {network.highway && (
        <mesh geometry={network.highway} raycast={NO_RAYCAST} receiveShadow={!reducedGraphics} dispose={null}>
          <meshStandardMaterial
            map={highwayTexture ?? undefined}
            color="#5a6064"
            roughness={0.97}
            metalness={0}
            side={THREE.DoubleSide}
            transparent={transparent}
            opacity={opacity}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      )}
      {network.parkAsphalt && (
        <mesh geometry={network.parkAsphalt} raycast={NO_RAYCAST} receiveShadow={!reducedGraphics} dispose={null}>
          <meshStandardMaterial
            map={parkTexture ?? undefined}
            color="#5f635f"
            roughness={0.98}
            metalness={0}
            side={THREE.DoubleSide}
            transparent={transparent}
            opacity={opacity}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      )}
      {network.shoulders && (
        <mesh geometry={network.shoulders} raycast={NO_RAYCAST} dispose={null}>
          <meshStandardMaterial
            map={shoulderTexture ?? undefined}
            color="#a8977a"
            roughness={0.99}
            metalness={0}
            side={THREE.DoubleSide}
            transparent={transparent}
            opacity={opacity}
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
            opacity={opacity * 0.82}
            polygonOffset
            polygonOffsetFactor={-3}
            polygonOffsetUnits={-3}
          />
        </mesh>
      )}
    </group>
  );
});
