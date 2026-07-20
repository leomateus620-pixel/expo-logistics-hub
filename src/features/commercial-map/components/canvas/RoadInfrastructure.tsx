import { memo, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { MapEntity } from '../../types';
import {
  buildRoadNetworkGeometries,
  createRoadSurfaceGeometry,
  disposeRoadNetworkGeometries,
  isRoadInfrastructureEntity,
} from '../../utils/roadInfrastructure';

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
}

const ROAD_PALETTE = {
  asphalt: '#453a35',
  pedestrian: '#b8ad99',
  curb: '#e5e2da',
  gutter: '#231d1a',
  selected: '#5a4638',
  selectionEdge: '#f4d676',
  match: '#deb85e',
} as const;
const NO_RAYCAST = () => undefined;

function textureNoise(x: number, y: number, seed: number) {
  let value = (x * 374761393 + y * 668265263 + seed * 1442695041) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
  return ((value ^ (value >>> 16)) & 0xffff) / 0xffff;
}

function createSurfaceTexture(seed: number, paving = false) {
  const size = 96;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const fine = textureNoise(x, y, seed) - 0.5;
      const coarse = Math.sin((x + seed) * 0.24) * 0.5 + Math.cos((y - seed) * 0.19) * 0.5;
      const joint = paving && (x % 24 <= 1 || y % 16 <= 1) ? -22 : 0;
      const value = THREE.MathUtils.clamp(Math.round((paving ? 222 : 216) + fine * 18 + coarse * 5 + joint), 160, 242);
      const offset = (y * size + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(paving ? 0.32 : 0.44, paving ? 0.32 : 0.44);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const ASPHALT_COLOR_TEXTURE = createSurfaceTexture(2026);
const ASPHALT_ROUGHNESS_TEXTURE = ASPHALT_COLOR_TEXTURE.clone();
ASPHALT_ROUGHNESS_TEXTURE.colorSpace = THREE.NoColorSpace;
ASPHALT_ROUGHNESS_TEXTURE.needsUpdate = true;
const PEDESTRIAN_COLOR_TEXTURE = createSurfaceTexture(472, true);
const PEDESTRIAN_ROUGHNESS_TEXTURE = PEDESTRIAN_COLOR_TEXTURE.clone();
PEDESTRIAN_ROUGHNESS_TEXTURE.colorSpace = THREE.NoColorSpace;
PEDESTRIAN_ROUGHNESS_TEXTURE.needsUpdate = true;

const RoadLayerNetwork = memo(function RoadLayerNetwork({
  entities,
  selectedEntityId,
  matchingEntityIds,
  filtersActive,
  opacity,
  reducedGraphics,
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
            color={ROAD_PALETTE.asphalt}
            map={reducedGraphics ? undefined : ASPHALT_COLOR_TEXTURE}
            roughnessMap={reducedGraphics ? undefined : ASPHALT_ROUGHNESS_TEXTURE}
            bumpMap={reducedGraphics ? undefined : ASPHALT_ROUGHNESS_TEXTURE}
            bumpScale={0.008}
            roughness={0.96}
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
            color={ROAD_PALETTE.asphalt}
            map={reducedGraphics ? undefined : ASPHALT_COLOR_TEXTURE}
            roughnessMap={reducedGraphics ? undefined : ASPHALT_ROUGHNESS_TEXTURE}
            roughness={0.96}
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
            color={ROAD_PALETTE.pedestrian}
            map={reducedGraphics ? undefined : PEDESTRIAN_COLOR_TEXTURE}
            roughnessMap={reducedGraphics ? undefined : PEDESTRIAN_ROUGHNESS_TEXTURE}
            bumpMap={reducedGraphics ? undefined : PEDESTRIAN_ROUGHNESS_TEXTURE}
            bumpScale={0.004}
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
            color={ROAD_PALETTE.gutter}
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
            color={ROAD_PALETTE.curb}
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
            color={ROAD_PALETTE.match}
            emissive={ROAD_PALETTE.match}
            emissiveIntensity={0.16}
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
              color={ROAD_PALETTE.selected}
              map={reducedGraphics ? undefined : ASPHALT_COLOR_TEXTURE}
              roughnessMap={reducedGraphics ? undefined : ASPHALT_ROUGHNESS_TEXTURE}
              emissive={ROAD_PALETTE.selectionEdge}
              emissiveIntensity={0.12}
              roughness={0.94}
              metalness={0}
              depthWrite
            />
          </mesh>
          {selectedEdges && (
            <lineSegments geometry={selectedEdges} raycast={NO_RAYCAST} renderOrder={6}>
              <lineBasicMaterial color={ROAD_PALETTE.selectionEdge} toneMapped={false} />
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
  const groups = useMemo(() => {
    const byLayer = new Map<string, MapEntity[]>();
    entities.filter(isRoadInfrastructureEntity).forEach((entity) => {
      const layerEntities = byLayer.get(entity.layerId) ?? [];
      layerEntities.push(entity);
      byLayer.set(entity.layerId, layerEntities);
    });
    return [...byLayer.entries()];
  }, [entities]);

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
        />
      ))}
    </>
  );
});
