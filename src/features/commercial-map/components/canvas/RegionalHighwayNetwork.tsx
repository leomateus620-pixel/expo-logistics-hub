import { memo, useEffect, useMemo } from "react";
import { type ThreeEvent, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { isMapSelectionClick } from "../../utils/interaction";
import {
  REGIONAL_HIGHWAY_PALETTE,
  REGIONAL_HIGHWAY_PROFILE,
} from "../../data/regional-highways";
import {
  createRegionalHighwayLabelTexture,
  disposeRegionalHighwayGeometries,
} from "../../utils/regionalHighwayMesh";
import {
  buildTerritoryRoadGeometry,
  territoryHighwayOwnerAt,
  UNIFIED_TERRITORY_ROADS,
} from "../../utils/territorialRoadGeometry";
import { resolveRearRoadOwnerAtLocalPoint } from "../../utils/rearRoadNetwork";

import {
  openGroundTextureBundleForEntity,
  type OpenGroundSurfaceProfile,
} from "./openGroundTextures";
import { useCommercialMapStore } from "../../state/useCommercialMapStore";

interface RegionalHighwayNetworkProps {
  reducedGraphics: boolean;
  visible?: boolean;
  opacity?: number;
  ownerEntityIdByIdentifier: ReadonlyMap<string, string>;
  hoverEnabled: boolean;
  onSelect: (entityId: string) => void;
  onHover: (entityId: string | null) => void;
  onFocus: () => void;
  onCursor: (cursor: "grab" | "grabbing" | "pointer") => void;
}

const NO_RAYCAST = () => undefined;

const SURFACE_PROFILES = Object.freeze({
  carriageway: Object.freeze({
    surface: "highwayAsphalt",
    tileWorldSize: 1,
    baseColor: REGIONAL_HIGHWAY_PALETTE.carriageway,
    roughness: 0.91,
  }),
  shoulder: Object.freeze({
    surface: "roadShoulder",
    tileWorldSize: 1,
    baseColor: REGIONAL_HIGHWAY_PALETTE.shoulder,
    roughness: 0.98,
  }),
} satisfies Readonly<
  Record<"carriageway" | "shoulder", OpenGroundSurfaceProfile>
>);

// Grain must survive the 24° key: these read as pavement texture at the
// pull-back and mip away cleanly before they can shimmer.
const ASPHALT_NORMAL_SCALE = new THREE.Vector2(0.26, 0.26);
const SHOULDER_NORMAL_SCALE = new THREE.Vector2(0.3, 0.3);

function RegionalHighwayLabels({
  labels,
  opacity,
}: {
  labels: readonly {
    id: string;
    text: string;
    position: readonly [number, number];
    headingRadians: number;
  }[];
  opacity: number;
}) {
  const textures = useMemo(() => {
    const unique = [...new Set(labels.map((label) => label.text))];
    return new Map(
      unique.map((text) => [text, createRegionalHighwayLabelTexture(text)]),
    );
  }, [labels]);

  useEffect(
    () => () => {
      textures.forEach((texture) => texture?.dispose());
    },
    [textures],
  );

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
              args={[
                REGIONAL_HIGHWAY_PROFILE.labelWidth,
                REGIONAL_HIGHWAY_PROFILE.labelDepth,
              ]}
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
  hoverEnabled,
  onSelect,
  onHover,
  onFocus,
  onCursor,
}: RegionalHighwayNetworkProps) {
  const network = useMemo(() => {
    const geometry = buildTerritoryRoadGeometry();
    return {
      carriageway: geometry.pavement,
      shoulders: geometry.shoulders,
      edgeLines: geometry.edgeLines,
      centerLines: geometry.centerLines,
      unpaved: geometry.unpaved,
      hitSurface: geometry.hitSurface,
      embankment: geometry.embankment,
      labels: [
        {
          id: "br472",
          text: "BR-472",
          position: [72.3, -15] as const,
          headingRadians: 0,
        },
        {
          id: "ers344",
          text: "ERS-344",
          position: [145, -13] as const,
          headingRadians: -0.8,
        },
      ],
      diagnostics: {
        layerSegmentCount: UNIFIED_TERRITORY_ROADS.length,
        sampleCount: UNIFIED_TERRITORY_ROADS.reduce(
          (n, r) => n + r.points.length,
          0,
        ),
        triangleCount: [
          geometry.pavement,
          geometry.unpaved,
          geometry.shoulders,
          geometry.embankment,
          geometry.edgeLines,
          geometry.centerLines,
        ].reduce(
          (n, g) =>
            n + (g.index?.count ?? g.getAttribute("position").count) / 3,
          0,
        ),
        estimatedBaseDrawCalls: 8,
      },
    };
  }, []);
  const anisotropy = useThree((state) =>
    state.gl.capabilities.getMaxAnisotropy(),
  );

  useEffect(
    () => () => {
      disposeRegionalHighwayGeometries(network);
      network.centerLines.dispose();
      network.unpaved.dispose();
      network.hitSurface.dispose();
      network.embankment.dispose();
    },
    [network],
  );

  const surfaceTextures = useMemo(() => {
    if (reducedGraphics) return null;
    return Object.freeze({
      carriageway: openGroundTextureBundleForEntity(
        SURFACE_PROFILES.carriageway,
        anisotropy,
      ),
      shoulder: openGroundTextureBundleForEntity(
        SURFACE_PROFILES.shoulder,
        anisotropy,
      ),
    });
  }, [anisotropy, reducedGraphics]);

  useEffect(
    () => () => {
      surfaceTextures?.carriageway?.dispose();
      surfaceTextures?.shoulder?.dispose();
    },
    [surfaceTextures],
  );

  const presentedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
  const transparent = presentedOpacity < 0.995;
  const interactive = visible && presentedOpacity > 0.015;
  const resolveEntityId = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    const rearOwner = resolveRearRoadOwnerAtLocalPoint(
      [event.point.x, event.point.z],
      "park",
    );
    if (rearOwner) return ownerEntityIdByIdentifier.get(rearOwner) ?? null;
    const owner = territoryHighwayOwnerAt([event.point.x, event.point.z]);
    return owner ? (ownerEntityIdByIdentifier.get(owner) ?? null) : null;
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (
      useCommercialMapStore.getState().cameraNavigating ||
      !isMapSelectionClick(event.delta, event.nativeEvent)
    )
      return;
    const entityId = resolveEntityId(event);
    if (!entityId) return;
    event.stopPropagation();
    onSelect(entityId);
    onFocus();
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!hoverEnabled || useCommercialMapStore.getState().cameraNavigating)
      return;
    const entityId = resolveEntityId(event);
    if (entityId) event.stopPropagation();
    onHover(entityId);
    onCursor(entityId ? "pointer" : "grab");
  };

  const handlePointerOut = () => {
    if (!hoverEnabled) return;
    onHover(null);
    onCursor(
      useCommercialMapStore.getState().cameraNavigating ? "grabbing" : "grab",
    );
  };

  return (
    <group
      name="regional-highway-network"
      renderOrder={2}
      visible={interactive}
    >
      <mesh geometry={network.embankment} raycast={NO_RAYCAST} dispose={null}>
        <meshStandardMaterial
          color="#81745d"
          roughness={1}
          side={THREE.DoubleSide}
          transparent={transparent}
          opacity={presentedOpacity}
        />
      </mesh>
      {network.shoulders && (
        <mesh
          geometry={network.shoulders}
          raycast={NO_RAYCAST}
          receiveShadow={!reducedGraphics}
          dispose={null}
        >
          <meshStandardMaterial
            map={surfaceTextures?.shoulder?.map}
            normalMap={surfaceTextures?.shoulder?.normalMap}
            normalScale={
              surfaceTextures?.shoulder ? SHOULDER_NORMAL_SCALE : undefined
            }
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
          raycast={NO_RAYCAST}
        >
          <meshStandardMaterial
            map={surfaceTextures?.carriageway?.map}
            normalMap={surfaceTextures?.carriageway?.normalMap}
            normalScale={
              surfaceTextures?.carriageway ? ASPHALT_NORMAL_SCALE : undefined
            }
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
            color="#ddd9be"
            transparent
            opacity={presentedOpacity * 0.94}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-3}
            polygonOffsetUnits={-3}
          />
        </mesh>
      )}
      <mesh geometry={network.unpaved} raycast={NO_RAYCAST} dispose={null}>
        <meshStandardMaterial
          color="#9a8264"
          roughness={1}
          transparent={transparent}
          opacity={presentedOpacity}
        />
      </mesh>
      <mesh
        geometry={network.hitSurface}
        dispose={null}
        raycast={interactive ? undefined : NO_RAYCAST}
        onClick={interactive ? handleClick : undefined}
        onPointerMove={
          interactive && hoverEnabled ? handlePointerMove : undefined
        }
        onPointerOut={
          interactive && hoverEnabled ? handlePointerOut : undefined
        }
      >
        <meshBasicMaterial visible={false} />
      </mesh>
      <RegionalHighwayLabels
        labels={network.labels}
        opacity={presentedOpacity}
      />
      <mesh geometry={network.centerLines} raycast={NO_RAYCAST} dispose={null}>
        <meshBasicMaterial
          color="#dbb34f"
          transparent
          opacity={presentedOpacity}
        />
      </mesh>
    </group>
  );
});
