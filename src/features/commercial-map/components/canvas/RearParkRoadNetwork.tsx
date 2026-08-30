import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { type ThreeEvent, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  buildRearRoadNetworkGeometries,
  disposeRearRoadNetworkGeometries,
  resolveRearRoadOwnerAtLocalPoint,
  type RearRoadHitSurface,
} from '../../utils/rearRoadNetwork';
import { isMapSelectionClick } from '../../utils/interaction';
import {
  openGroundTextureBundleForEntity,
  type OpenGroundSurfaceProfile,
} from './openGroundTextures';

interface RearParkRoadNetworkProps {
  reducedGraphics: boolean;
  visible?: boolean;
  opacity?: number;
  ownerEntityIdByIdentifier: ReadonlyMap<string, string>;
  cameraNavigating: boolean;
  hoverEnabled: boolean;
  onSelect: (entityId: string) => void;
  onHover: (entityId: string | null) => void;
  onFocus: () => void;
  onCursor: (cursor: 'grab' | 'grabbing' | 'pointer') => void;
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
 * BR-472, acesso ao parque e extensões corrigidas de Rua Brasília/Ubiretama.
 * O hit-test devolve sempre a entidade oficial proprietária; a malha visual não
 * cria seleção, navegação ou metadados paralelos.
 */
export const RearParkRoadNetwork = memo(function RearParkRoadNetwork({
  reducedGraphics,
  visible = true,
  opacity = 1,
  ownerEntityIdByIdentifier,
  cameraNavigating,
  hoverEnabled,
  onSelect,
  onHover,
  onFocus,
  onCursor,
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
  const interactive = visible && presentedOpacity > 0.015;
  const hoveredEntityId = useRef<string | null>(null);

  const resolveEntityId = useCallback((event: ThreeEvent<PointerEvent | MouseEvent>, surface: RearRoadHitSurface) => {
    const owner = resolveRearRoadOwnerAtLocalPoint([event.point.x, event.point.z], surface);
    return owner ? ownerEntityIdByIdentifier.get(owner) ?? null : null;
  }, [ownerEntityIdByIdentifier]);

  const handleClick = useCallback((surface: RearRoadHitSurface) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (cameraNavigating || !isMapSelectionClick(event.delta)) return;
    const entityId = resolveEntityId(event, surface);
    if (!entityId) return;
    onSelect(entityId);
    onFocus();
  }, [cameraNavigating, onFocus, onSelect, resolveEntityId]);

  const handlePointerMove = useCallback((surface: RearRoadHitSurface) => (
    event: ThreeEvent<PointerEvent>,
  ) => {
    event.stopPropagation();
    if (!hoverEnabled || cameraNavigating) return;
    const entityId = resolveEntityId(event, surface);
    if (entityId === hoveredEntityId.current) return;
    hoveredEntityId.current = entityId;
    onHover(entityId);
    onCursor(entityId ? 'pointer' : 'grab');
  }, [cameraNavigating, hoverEnabled, onCursor, onHover, resolveEntityId]);

  const handlePointerOut = useCallback(() => {
    if (!hoverEnabled) return;
    hoveredEntityId.current = null;
    onHover(null);
    onCursor(cameraNavigating ? 'grabbing' : 'grab');
  }, [cameraNavigating, hoverEnabled, onCursor, onHover]);

  return (
    <group
      name="rear-park-road-network"
      renderOrder={1}
      visible={interactive}
    >
      {network.highway && (
        <mesh
          geometry={network.highway}
          receiveShadow={!reducedGraphics}
          dispose={null}
          raycast={interactive ? undefined : NO_RAYCAST}
          onClick={interactive ? handleClick('highway') : undefined}
          onPointerMove={interactive && hoverEnabled ? handlePointerMove('highway') : undefined}
          onPointerOut={interactive && hoverEnabled ? handlePointerOut : undefined}
        >
          <meshStandardMaterial
            map={highwayTextures?.map}
            normalMap={highwayTextures?.normalMap}
            normalScale={highwayTextures ? ASPHALT_NORMAL_SCALE : undefined}
            roughnessMap={highwayTextures?.roughnessMap}
            color={REAR_ROAD_SURFACE_PROFILES.highway.baseColor}
            roughness={REAR_ROAD_SURFACE_PROFILES.highway.roughness}
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
      {network.parkAsphalt && (
        <mesh
          geometry={network.parkAsphalt}
          receiveShadow={!reducedGraphics}
          dispose={null}
          raycast={interactive ? undefined : NO_RAYCAST}
          onClick={interactive ? handleClick('park') : undefined}
          onPointerMove={interactive && hoverEnabled ? handlePointerMove('park') : undefined}
          onPointerOut={interactive && hoverEnabled ? handlePointerOut : undefined}
        >
          <meshStandardMaterial
            map={parkTextures?.map}
            normalMap={parkTextures?.normalMap}
            normalScale={parkTextures ? ASPHALT_NORMAL_SCALE : undefined}
            roughnessMap={parkTextures?.roughnessMap}
            color={REAR_ROAD_SURFACE_PROFILES.park.baseColor}
            roughness={REAR_ROAD_SURFACE_PROFILES.park.roughness}
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
            side={THREE.FrontSide}
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
            side={THREE.FrontSide}
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
