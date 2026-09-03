import { memo, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ROAD_MATERIAL_COLORS, ROAD_SURFACE_PROFILE } from '../../constants';
import type { MapEntity } from '../../types';
import {
  buildRoadNetworkGeometries,
  createRoadSurfaceGeometry,
  disposeRoadNetworkGeometries,
  isRoadInfrastructureEntity,
} from '../../utils/roadInfrastructure';
import {
  openGroundTextureBundleForEntity,
  type OpenGroundSurfaceProfile,
  type OpenGroundTextureBundle,
} from './openGroundTextures';

// ANALYST 2026.9-annex-road-precision.1 — this component only extrudes official
// ROAD polygons. Keep RUA-BRASILIA rectPdf([3940, 2440, 3988, 4210]) in the
// incoming entity list (never hide it via REPLACED_OFFICIAL_ROAD_IDENTIFIERS).
// Do not add meshes traced from green/red annex overlays.

interface RoadInfrastructureProps {
  entities: MapEntity[];
  selectedEntityId: string | null;
  matchingEntityIds: ReadonlySet<string>;
  filtersActive: boolean;
  layerOpacity: Record<string, number>;
  reducedGraphics: boolean;
}

interface RoadLayerNetworkProps extends Omit<RoadInfrastructureProps, 'layerOpacity'> {
  opacity: number;
  surfaceTextures: RoadSurfaceTextures | null;
}

const NO_RAYCAST = () => undefined;

interface RoadSurfaceTextures {
  asphalt: OpenGroundTextureBundle | null;
  pedestrian: OpenGroundTextureBundle | null;
}

const ROAD_SURFACE_PROFILES = Object.freeze({
  asphalt: Object.freeze({
    surface: 'parkAsphalt',
    tileWorldSize: 3.6,
    baseColor: ROAD_MATERIAL_COLORS.asphalt,
    roughness: ROAD_SURFACE_PROFILE.asphaltRoughness,
  }),
  pedestrian: Object.freeze({
    surface: 'concrete',
    tileWorldSize: 3.2,
    baseColor: ROAD_MATERIAL_COLORS.pedestrian,
    roughness: 0.94,
  }),
} satisfies Readonly<Record<'asphalt' | 'pedestrian', OpenGroundSurfaceProfile>>);

const ASPHALT_NORMAL_SCALE = new THREE.Vector2(0.22, 0.22);
const PEDESTRIAN_NORMAL_SCALE = new THREE.Vector2(0.16, 0.16);

const RoadLayerNetwork = memo(function RoadLayerNetwork({
  entities,
  selectedEntityId,
  matchingEntityIds,
  filtersActive,
  opacity,
  reducedGraphics,
  surfaceTextures,
}: RoadLayerNetworkProps) {
  const { invalidate } = useThree();
  const network = useMemo(
    () => buildRoadNetworkGeometries(entities, { reducedGraphics }),
    [entities, reducedGraphics],
  );
  const selectedEntity = useMemo(
    () => entities.find((entity) => entity.id === selectedEntityId) ?? null,
    [entities, selectedEntityId],
  );
  const selectedGeometry = useMemo(
    () => selectedEntity ? createRoadSurfaceGeometry([selectedEntity]) : null,
    [selectedEntity],
  );
  const selectedEdges = useMemo(
    () => selectedGeometry ? new THREE.EdgesGeometry(selectedGeometry, 36) : null,
    [selectedGeometry],
  );
  const matchedEntities = useMemo(() => (
    filtersActive
      ? entities.filter((entity) => matchingEntityIds.has(entity.id) && entity.id !== selectedEntityId)
      : []
  ), [entities, filtersActive, matchingEntityIds, selectedEntityId]);
  const matchedGeometry = useMemo(
    () => matchedEntities.length ? createRoadSurfaceGeometry(matchedEntities) : null,
    [matchedEntities],
  );
  const contextOpacity = THREE.MathUtils.clamp(opacity * (filtersActive ? 0.68 : 1), 0, 1);
  const transparent = contextOpacity < 0.995;

  useEffect(() => {
    invalidate();
  }, [invalidate, network, selectedGeometry, matchedGeometry]);

  useEffect(() => () => {
    disposeRoadNetworkGeometries(network);
  }, [network]);

  useEffect(() => () => {
    selectedEdges?.dispose();
    selectedGeometry?.dispose();
  }, [selectedEdges, selectedGeometry]);

  useEffect(() => () => {
    matchedGeometry?.dispose();
  }, [matchedGeometry]);

  if (opacity <= 0.015 && !selectedEntity) return null;

  return (
    <group>
      {network.asphalt && contextOpacity > 0.015 && (
        <mesh geometry={network.asphalt} receiveShadow raycast={NO_RAYCAST}>
          <meshStandardMaterial
            color={ROAD_MATERIAL_COLORS.asphalt}
            map={surfaceTextures?.asphalt?.map}
            normalMap={surfaceTextures?.asphalt?.normalMap}
            normalScale={surfaceTextures?.asphalt ? ASPHALT_NORMAL_SCALE : undefined}
            roughnessMap={surfaceTextures?.asphalt?.roughnessMap}
            roughness={ROAD_SURFACE_PROFILE.asphaltRoughness}
            metalness={0}
            transparent={transparent}
            opacity={contextOpacity}
            depthWrite={contextOpacity > 0.42}
          />
        </mesh>
      )}

      {network.intersections && contextOpacity > 0.015 && (
        <mesh geometry={network.intersections} receiveShadow raycast={NO_RAYCAST}>
          <meshStandardMaterial
            color={ROAD_MATERIAL_COLORS.asphalt}
            map={surfaceTextures?.asphalt?.map}
            normalMap={surfaceTextures?.asphalt?.normalMap}
            normalScale={surfaceTextures?.asphalt ? ASPHALT_NORMAL_SCALE : undefined}
            roughnessMap={surfaceTextures?.asphalt?.roughnessMap}
            roughness={ROAD_SURFACE_PROFILE.asphaltRoughness}
            metalness={0}
            transparent={transparent}
            opacity={contextOpacity}
            depthWrite={contextOpacity > 0.42}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      )}

      {network.pedestrian && contextOpacity > 0.015 && (
        <mesh geometry={network.pedestrian} receiveShadow raycast={NO_RAYCAST}>
          <meshStandardMaterial
            color={ROAD_MATERIAL_COLORS.pedestrian}
            map={surfaceTextures?.pedestrian?.map}
            normalMap={surfaceTextures?.pedestrian?.normalMap}
            normalScale={surfaceTextures?.pedestrian ? PEDESTRIAN_NORMAL_SCALE : undefined}
            roughnessMap={surfaceTextures?.pedestrian?.roughnessMap}
            roughness={0.94}
            metalness={0}
            transparent={transparent}
            opacity={contextOpacity}
            depthWrite={contextOpacity > 0.42}
          />
        </mesh>
      )}

      {network.gutters && contextOpacity > 0.015 && !reducedGraphics && (
        <mesh geometry={network.gutters} receiveShadow raycast={NO_RAYCAST} renderOrder={2}>
          <meshStandardMaterial
            color={ROAD_MATERIAL_COLORS.gutter}
            roughness={1}
            metalness={0}
            transparent
            opacity={Math.min(0.34, contextOpacity * 0.34)}
            depthWrite={false}
          />
        </mesh>
      )}

      {network.curbs && contextOpacity > 0.015 && (
        <mesh geometry={network.curbs} receiveShadow raycast={NO_RAYCAST}>
          <meshStandardMaterial
            color={ROAD_MATERIAL_COLORS.curb}
            roughness={0.9}
            metalness={0}
            transparent={transparent}
            opacity={Math.max(contextOpacity, filtersActive ? 0.78 : contextOpacity)}
            depthWrite={contextOpacity > 0.32}
          />
        </mesh>
      )}

      {matchedGeometry && (
        <mesh geometry={matchedGeometry} position={[0, 0.008, 0]} raycast={NO_RAYCAST} renderOrder={4}>
          <meshStandardMaterial
            color={ROAD_MATERIAL_COLORS.match}
            emissive={ROAD_MATERIAL_COLORS.match}
            emissiveIntensity={0.1}
            roughness={0.92}
            metalness={0}
            transparent
            opacity={0.34}
            depthWrite={false}
          />
        </mesh>
      )}

      {selectedGeometry && (
        <group position={[0, 0.052, 0]}>
          <mesh geometry={selectedGeometry} receiveShadow raycast={NO_RAYCAST} renderOrder={5}>
            <meshStandardMaterial
              color={ROAD_MATERIAL_COLORS.selected}
              map={surfaceTextures?.asphalt?.map}
              normalMap={surfaceTextures?.asphalt?.normalMap}
              normalScale={surfaceTextures?.asphalt ? ASPHALT_NORMAL_SCALE : undefined}
              roughnessMap={surfaceTextures?.asphalt?.roughnessMap}
              emissive={ROAD_MATERIAL_COLORS.selectionGlow}
              emissiveIntensity={0.05}
              roughness={ROAD_SURFACE_PROFILE.asphaltRoughness}
              metalness={0}
              depthWrite
            />
          </mesh>
          {selectedEdges && (
            <lineSegments geometry={selectedEdges} raycast={NO_RAYCAST} renderOrder={6}>
              <lineBasicMaterial color={ROAD_MATERIAL_COLORS.selectionEdge} toneMapped={false} />
            </lineSegments>
          )}
        </group>
      )}
    </group>
  );
});

export const RoadInfrastructure = memo(function RoadInfrastructure({
  entities,
  selectedEntityId,
  matchingEntityIds,
  filtersActive,
  layerOpacity,
  reducedGraphics,
}: RoadInfrastructureProps) {
  const maximumAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());
  const groups = useMemo(() => {
    const byLayer = new Map<string, MapEntity[]>();
    entities.filter(isRoadInfrastructureEntity).forEach((entity) => {
      const layerEntities = byLayer.get(entity.layerId) ?? [];
      layerEntities.push(entity);
      byLayer.set(entity.layerId, layerEntities);
    });
    return [...byLayer.entries()];
  }, [entities]);
  const surfaceTextures = useMemo<RoadSurfaceTextures | null>(() => {
    if (reducedGraphics) return null;
    return {
      asphalt: openGroundTextureBundleForEntity(
        ROAD_SURFACE_PROFILES.asphalt,
        maximumAnisotropy,
      ),
      pedestrian: openGroundTextureBundleForEntity(
        ROAD_SURFACE_PROFILES.pedestrian,
        maximumAnisotropy,
      ),
    };
  }, [maximumAnisotropy, reducedGraphics]);

  useEffect(() => () => {
    surfaceTextures?.asphalt?.dispose();
    surfaceTextures?.pedestrian?.dispose();
  }, [surfaceTextures]);

  return (
    <>
      {groups.map(([layerId, layerEntities]) => (
        <RoadLayerNetwork
          key={layerId}
          entities={layerEntities}
          selectedEntityId={selectedEntityId}
          matchingEntityIds={matchingEntityIds}
          filtersActive={filtersActive}
          opacity={layerOpacity[layerId] ?? 1}
          reducedGraphics={reducedGraphics}
          surfaceTextures={surfaceTextures}
        />
      ))}
    </>
  );
});
