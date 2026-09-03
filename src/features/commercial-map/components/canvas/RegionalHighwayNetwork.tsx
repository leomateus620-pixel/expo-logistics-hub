import { memo, useEffect, useMemo } from 'react';
import { type ThreeEvent, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { isMapSelectionClick } from '../../utils/interaction';
import {
  REGIONAL_HIGHWAY_PALETTE,
  REGIONAL_HIGHWAY_PROFILE,
} from '../../data/regional-highways';
import {
  buildRegionalHighwayGeometries,
  createRegionalHighwayLabelTexture,
  disposeRegionalHighwayGeometries,
  resolveRegionalHighwayOwnerAtLocalPoint,
} from '../../utils/regionalHighwayMesh';
import { Br344Mainline } from '../../highways/br344';
import { NeCloverleafInterchange } from './NeCloverleafInterchange';
import { SeCloverleaf } from './SeCloverleaf';
import {
  openGroundTextureBundleForEntity,
  type OpenGroundSurfaceProfile,
} from './openGroundTextures';

interface RegionalHighwayNetworkProps {
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
const HIGHWAY_OWNER: Record<string, string> = {
  'BR-472': 'RODOVIA-RS-472',
  'BR-344': 'RODOVIA-RS-472',
};

const SURFACE_PROFILES = Object.freeze({
  carriageway: Object.freeze({
    surface: 'highwayAsphalt',
    tileWorldSize: 1,
    baseColor: REGIONAL_HIGHWAY_PALETTE.carriageway,
    roughness: 0.91,
  }),
  shoulder: Object.freeze({
    surface: 'roadShoulder',
    tileWorldSize: 1,
    baseColor: REGIONAL_HIGHWAY_PALETTE.shoulder,
    roughness: 0.98,
  }),
} satisfies Readonly<Record<'carriageway' | 'shoulder', OpenGroundSurfaceProfile>>);

const ASPHALT_NORMAL_SCALE = new THREE.Vector2(0.14, 0.14);
const SHOULDER_NORMAL_SCALE = new THREE.Vector2(0.2, 0.2);

function RegionalHighwayLabels({
  labels,
  opacity,
}: {
  labels: readonly { id: string; text: string; position: readonly [number, number]; headingRadians: number }[];
  opacity: number;
}) {
  const textures = useMemo(() => {
    const unique = [...new Set(labels.map((label) => label.text))];
    return new Map(unique.map((text) => [text, createRegionalHighwayLabelTexture(text)]));
  }, [labels]);

  useEffect(() => () => {
    textures.forEach((texture) => texture?.dispose());
  }, [textures]);

  return (
    <group name="regional-highway-labels">
      {labels.map((label) => {
        const texture = textures.get(label.text);
        if (!texture) return null;
        return (
          <mesh
            key={label.id}
            position={[
              label.position[0],
              REGIONAL_HIGHWAY_PROFILE.labelElevation,
              label.position[1],
            ]}
            rotation={[-Math.PI / 2, 0, -label.headingRadians]}
            raycast={NO_RAYCAST}
          >
            <planeGeometry
              args={[REGIONAL_HIGHWAY_PROFILE.labelWidth, REGIONAL_HIGHWAY_PROFILE.labelDepth]}
            />
            <meshBasicMaterial
              map={texture}
              transparent
              opacity={opacity}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-4}
              polygonOffsetUnits={-4}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export const RegionalHighwayNetwork = memo(function RegionalHighwayNetwork({
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
}: RegionalHighwayNetworkProps) {
  const network = useMemo(
    () => buildRegionalHighwayGeometries({ reducedGraphics }),
    [reducedGraphics],
  );
  const anisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());

  useEffect(() => () => disposeRegionalHighwayGeometries(network), [network]);

  const surfaceTextures = useMemo(() => {
    if (reducedGraphics) return null;
    return Object.freeze({
      carriageway: openGroundTextureBundleForEntity(SURFACE_PROFILES.carriageway, anisotropy),
      shoulder: openGroundTextureBundleForEntity(SURFACE_PROFILES.shoulder, anisotropy),
    });
  }, [anisotropy, reducedGraphics]);

  useEffect(() => () => {
    surfaceTextures?.carriageway?.dispose();
    surfaceTextures?.shoulder?.dispose();
  }, [surfaceTextures]);

  const presentedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
  const transparent = presentedOpacity < 0.995;
  const interactive = visible && presentedOpacity > 0.015;
  const resolveEntityId = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    const highwayId = resolveRegionalHighwayOwnerAtLocalPoint([event.point.x, event.point.z]);
    if (!highwayId) return null;
    return ownerEntityIdByIdentifier.get(HIGHWAY_OWNER[highwayId] ?? 'RODOVIA-RS-472') ?? null;
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (cameraNavigating || !isMapSelectionClick(event.delta, event.nativeEvent)) return;
    const entityId = resolveEntityId(event);
    if (!entityId) return;
    onSelect(entityId);
    onFocus();
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    if (!hoverEnabled || cameraNavigating) return;
    const entityId = resolveEntityId(event);
    onHover(entityId);
    onCursor(entityId ? 'pointer' : 'grab');
  };

  const handlePointerOut = () => {
    if (!hoverEnabled) return;
    onHover(null);
    onCursor(cameraNavigating ? 'grabbing' : 'grab');
  };

  return (
    <group name="regional-highway-network" renderOrder={2} visible={interactive}>
      {network.shoulders && (
        <mesh geometry={network.shoulders} raycast={NO_RAYCAST} receiveShadow={!reducedGraphics} dispose={null}>
          <meshStandardMaterial
            map={surfaceTextures?.shoulder?.map}
            normalMap={surfaceTextures?.shoulder?.normalMap}
            normalScale={surfaceTextures?.shoulder ? SHOULDER_NORMAL_SCALE : undefined}
            roughnessMap={surfaceTextures?.shoulder?.roughnessMap}
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
      {network.carriageway && (
        <mesh
          geometry={network.carriageway}
          receiveShadow={!reducedGraphics}
          dispose={null}
          raycast={interactive ? undefined : NO_RAYCAST}
          onClick={interactive ? handleClick : undefined}
          onPointerMove={interactive && hoverEnabled ? handlePointerMove : undefined}
          onPointerOut={interactive && hoverEnabled ? handlePointerOut : undefined}
        >
          <meshStandardMaterial
            map={surfaceTextures?.carriageway?.map}
            normalMap={surfaceTextures?.carriageway?.normalMap}
            normalScale={surfaceTextures?.carriageway ? ASPHALT_NORMAL_SCALE : undefined}
            roughnessMap={surfaceTextures?.carriageway?.roughnessMap}
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
      {network.edgeLines && (
        <mesh geometry={network.edgeLines} raycast={NO_RAYCAST} dispose={null}>
          <meshBasicMaterial
            color={REGIONAL_HIGHWAY_PALETTE.edgeLine}
            transparent
            opacity={presentedOpacity * 0.94}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-3}
            polygonOffsetUnits={-3}
          />
        </mesh>
      )}
      <RegionalHighwayLabels labels={network.labels} opacity={presentedOpacity} />
      <Br344Mainline
        reducedGraphics={reducedGraphics}
        visible={interactive}
        opacity={presentedOpacity}
      />
      <NeCloverleafInterchange
        reducedGraphics={reducedGraphics}
        visible={interactive}
        opacity={presentedOpacity}
      />
      <SeCloverleaf
        reducedGraphics={reducedGraphics}
        visible={interactive}
        opacity={presentedOpacity}
      />
    </group>
  );
});
