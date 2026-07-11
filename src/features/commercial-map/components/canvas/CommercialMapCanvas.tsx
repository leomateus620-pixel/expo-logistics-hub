import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { AdaptiveDpr, Html, OrbitControls, Preload, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  CAMERA_PRESETS,
  CLASSIFICATION_COLORS,
  MAP_REFERENCE_HEIGHT,
  MAP_REFERENCE_WIDTH,
  OFFICIAL_REFERENCE_IMAGE,
  STATUS_CONFIG,
} from '../../constants';
import { geometryCentroid, withoutClosingPoint } from '../../utils/geometry';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type { CameraPreset, CommercialLot, MapCalibration, MapEntity } from '../../types';

interface CommercialMapCanvasProps {
  entities: MapEntity[];
  lots: CommercialLot[];
  calibration: MapCalibration | null;
  matchingEntityIds: ReadonlySet<string>;
  filtersActive: boolean;
}

interface SceneExtent {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
  centerX: number;
  centerZ: number;
  maxHeight: number;
  diagonal: number;
}

const NO_RAYCAST = () => undefined;
const IMPORTANT_STRUCTURE_LABELS = new Set([
  'PAVILION',
  'EVENT_VENUE',
  'ATTRACTION',
  'ADMINISTRATION',
  'LIVESTOCK_AREA',
  'RURAL_EXHIBITION',
  'LANDMARK',
]);

function getSceneExtent(entities: MapEntity[]): SceneExtent {
  let minX = -MAP_REFERENCE_WIDTH / 2;
  let maxX = MAP_REFERENCE_WIDTH / 2;
  let minZ = -MAP_REFERENCE_HEIGHT / 2;
  let maxZ = MAP_REFERENCE_HEIGHT / 2;
  let maxHeight = 1;

  entities.forEach((entity) => {
    entity.geometry.coordinates.forEach((ring) => {
      ring.forEach(([x, z]) => {
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      });
    });
    maxHeight = Math.max(maxHeight, entity.geometry.elevation + entity.geometry.extrusionHeight);
  });

  const width = Math.max(4, maxX - minX);
  const depth = Math.max(4, maxZ - minZ);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width,
    depth,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    maxHeight,
    diagonal: Math.hypot(width, depth),
  };
}

function getEntityExtent(entity: MapEntity): SceneExtent {
  const coordinates = entity.geometry.coordinates.flat();
  const xs = coordinates.map(([x]) => x).filter(Number.isFinite);
  const zs = coordinates.map(([, z]) => z).filter(Number.isFinite);
  const [centroidX, centroidZ] = geometryCentroid(entity.geometry);
  const minX = xs.length ? Math.min(...xs) : centroidX - 1;
  const maxX = xs.length ? Math.max(...xs) : centroidX + 1;
  const minZ = zs.length ? Math.min(...zs) : centroidZ - 1;
  const maxZ = zs.length ? Math.max(...zs) : centroidZ + 1;
  const width = Math.max(1.6, maxX - minX);
  const depth = Math.max(1.6, maxZ - minZ);
  const maxHeight = Math.max(0.5, entity.geometry.extrusionHeight);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width,
    depth,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    maxHeight,
    diagonal: Math.hypot(width, depth),
  };
}

function fitDistance(extent: Pick<SceneExtent, 'width' | 'depth' | 'maxHeight'>, fov: number, aspect: number, padding = 1.2) {
  const verticalFov = THREE.MathUtils.degToRad(fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(aspect, 0.35));
  const span = Math.max(extent.width, extent.depth);
  const verticalDistance = (span / 2) / Math.tan(verticalFov / 2);
  const horizontalDistance = (span / 2) / Math.tan(horizontalFov / 2);
  return Math.max(verticalDistance, horizontalDistance) * padding + extent.maxHeight * 1.4;
}

function fitDistanceForDirection(
  extent: Pick<SceneExtent, 'width' | 'depth' | 'maxHeight'>,
  fov: number,
  aspect: number,
  direction: THREE.Vector3,
  padding = 1.1,
) {
  const verticalFov = THREE.MathUtils.degToRad(fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(aspect, 0.35));
  const cameraDirection = direction.clone().normalize();
  const viewDirection = cameraDirection.clone().negate();
  const right = new THREE.Vector3().crossVectors(viewDirection, new THREE.Vector3(0, 1, 0));
  if (right.lengthSq() < 0.0001) right.set(1, 0, 0);
  else right.normalize();
  const up = new THREE.Vector3().crossVectors(right, viewDirection).normalize();
  let distance = 0;

  for (const x of [-extent.width / 2, extent.width / 2]) {
    for (const y of [0, extent.maxHeight]) {
      for (const z of [-extent.depth / 2, extent.depth / 2]) {
        const point = new THREE.Vector3(x, y, z);
        const depthOffset = point.dot(cameraDirection);
        const horizontalDistance = depthOffset + Math.abs(point.dot(right)) / Math.tan(horizontalFov / 2);
        const verticalDistance = depthOffset + Math.abs(point.dot(up)) / Math.tan(verticalFov / 2);
        distance = Math.max(distance, horizontalDistance, verticalDistance);
      }
    }
  }

  return Math.max(distance * padding, extent.maxHeight * 3 + 4);
}

function ReferenceUnderlay({ calibration }: { calibration: MapCalibration | null }) {
  const referenceVisible = useCommercialMapStore((state) => state.referenceVisible);
  const referenceOpacity = useCommercialMapStore((state) => state.referenceOpacity);
  const imageUrl = calibration?.referenceImageUrl || calibration?.referenceImagePath || OFFICIAL_REFERENCE_IMAGE;
  const texture = useTexture(imageUrl);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);

  if (!referenceVisible) return null;
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, -THREE.MathUtils.degToRad(calibration?.imageRotationDegrees ?? 0)]}
      position={[calibration?.imageOffsetX ?? 0, -0.035, calibration?.imageOffsetY ?? 0]}
      scale={[calibration?.imageScaleX ?? 1, calibration?.imageScaleY ?? 1, 1]}
      receiveShadow
      raycast={NO_RAYCAST}
    >
      <planeGeometry args={[MAP_REFERENCE_WIDTH, MAP_REFERENCE_HEIGHT]} />
      <meshBasicMaterial map={texture} transparent opacity={referenceOpacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function createEntityGeometry(entity: MapEntity) {
  const outer = withoutClosingPoint(entity.geometry.coordinates[0] ?? []);
  const shape = new THREE.Shape();
  outer.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  entity.geometry.coordinates.slice(1).forEach((holeRing) => {
    const hole = new THREE.Path();
    withoutClosingPoint(holeRing).forEach(([x, z], index) => {
      if (index === 0) hole.moveTo(x, -z);
      else hole.lineTo(x, -z);
    });
    shape.holes.push(hole);
  });
  const classification = String(entity.classification);
  const surface = ['ROAD', 'PEDESTRIAN_PATH', 'GREEN_AREA', 'PARKING', 'WATER', 'QUADRA'].includes(classification);
  const height = surface ? Math.max(0.018, Math.min(entity.geometry.extrusionHeight, 0.08)) : Math.max(0.025, entity.geometry.extrusionHeight);
  const bevel = !surface && height >= 0.35;
  const extruded = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: bevel,
    bevelSegments: bevel ? 2 : 0,
    bevelSize: bevel ? Math.min(0.065, height * 0.05) : 0,
    bevelThickness: bevel ? Math.min(0.065, height * 0.05) : 0,
    curveSegments: 2,
  });
  extruded.rotateX(-Math.PI / 2);
  extruded.computeVertexNormals();
  return extruded;
}

function createFootprintGeometry(entity: MapEntity) {
  const vertices: number[] = [];
  const height = Math.max(0.025, Math.min(entity.geometry.extrusionHeight, 0.08)) + 0.012;
  entity.geometry.coordinates.forEach((sourceRing) => {
    const ring = withoutClosingPoint(sourceRing);
    ring.forEach(([x, z], index) => {
      const [nextX, nextZ] = ring[(index + 1) % ring.length] ?? [x, z];
      vertices.push(x, height, z, nextX, height, nextZ);
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  return geometry;
}

function quadraLabel(value: string) {
  const normalized = value.trim().replace(/^quadra\s*/i, '');
  return normalized ? `Quadra ${normalized}` : 'Quadra';
}

interface EntityMeshProps {
  entity: MapEntity;
  lot?: CommercialLot;
  selected: boolean;
  hovered: boolean;
  labelsVisible: boolean;
  showPersistentLabels: boolean;
  showDenseLabels: boolean;
  filtersActive: boolean;
  isMatch: boolean;
  layerOpacity: number;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

const EntityMesh = memo(function EntityMesh({
  entity,
  lot,
  selected,
  hovered,
  labelsVisible,
  showPersistentLabels,
  showDenseLabels,
  filtersActive,
  isMatch,
  layerOpacity,
  onSelect,
  onHover,
}: EntityMeshProps) {
  const classification = String(entity.classification);
  const isRoad = classification === 'ROAD';
  const isQuadra = classification === 'QUADRA';
  const isFlat = entity.geometry.extrusionHeight < 0.3 || isRoad || isQuadra;
  const isInteractive = !isRoad && !isQuadra;
  const geometry = useMemo(() => isQuadra ? null : createEntityGeometry(entity), [entity, isQuadra]);
  const edges = useMemo(() => geometry && !isRoad ? new THREE.EdgesGeometry(geometry, 28) : null, [geometry, isRoad]);
  const footprint = useMemo(() => isRoad || isQuadra ? createFootprintGeometry(entity) : null, [entity, isQuadra, isRoad]);
  const centroid = useMemo(() => geometryCentroid(entity.geometry), [entity.geometry]);
  const status = lot ? STATUS_CONFIG[lot.status] : null;
  const color = status?.color ?? CLASSIFICATION_COLORS[entity.classification] ?? '#78907d';
  const dimmed = Boolean(lot && filtersActive && !isMatch && !selected);
  const matched = Boolean(lot && filtersActive && isMatch);
  const contextOpacity = filtersActive && !lot ? 0.82 : 1;
  const visualOpacity = selected ? Math.max(0.94, layerOpacity) : layerOpacity * contextOpacity * (dimmed ? 0.14 : 1);
  const persistentLotNumber = Boolean(lot?.lotNumber && showDenseLabels);
  const persistentStructure = showPersistentLabels && IMPORTANT_STRUCTURE_LABELS.has(classification);
  const showRoadLabel = isRoad && showDenseLabels && Boolean(entity.name);
  const showQuadraLabel = isQuadra && labelsVisible && (showPersistentLabels || selected);
  const showLabel = selected || (labelsVisible && (
    hovered || persistentLotNumber || persistentStructure || showRoadLabel || showQuadraLabel
  ));
  const selectedLift = selected ? (isFlat ? 0.055 : 0.14) : hovered && isInteractive ? 0.045 : 0;

  useEffect(() => () => {
    geometry?.dispose();
    edges?.dispose();
    footprint?.dispose();
  }, [edges, footprint, geometry]);

  const interactionProps = isInteractive ? {
    onClick: (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      onSelect(entity.id);
    },
    onPointerOver: (event: { stopPropagation: () => void }) => {
      event.stopPropagation();
      document.body.style.cursor = 'pointer';
      onHover(entity.id);
    },
    onPointerOut: () => {
      document.body.style.cursor = '';
      onHover(null);
    },
  } : { raycast: NO_RAYCAST };

  return (
    <group position={[0, entity.geometry.elevation + selectedLift, 0]}>
      {!isQuadra && (
        <mesh
          geometry={geometry!}
          castShadow={!isFlat && visualOpacity > 0.45}
          receiveShadow={!dimmed}
          {...interactionProps}
        >
          <meshStandardMaterial
            color={color}
            roughness={isFlat ? 0.92 : 0.61}
            metalness={classification === 'EVENT_VENUE' ? 0.08 : 0.015}
            transparent={visualOpacity < 0.995}
            opacity={visualOpacity}
            depthWrite={visualOpacity > 0.42}
            emissive={selected || hovered || matched ? color : '#000000'}
            emissiveIntensity={selected ? 0.2 : hovered ? 0.1 : matched ? 0.045 : 0}
            polygonOffset
            polygonOffsetFactor={isFlat ? -1 : 0}
            polygonOffsetUnits={isFlat ? -1 : 0}
          />
        </mesh>
      )}

      <lineSegments
        geometry={(isRoad || isQuadra ? footprint : edges)!}
        position={[0, isRoad || isQuadra ? 0.004 : 0.012, 0]}
        raycast={isInteractive ? undefined : NO_RAYCAST}
      >
        <lineBasicMaterial
          color={selected ? '#fff1a8' : isQuadra ? '#3f7b4d' : isRoad ? '#7c857f' : status?.border ?? '#1f3327'}
          transparent
          opacity={selected ? 1 : Math.min(isQuadra ? 0.82 : isRoad ? 0.42 : 0.72, visualOpacity)}
          toneMapped={false}
        />
      </lineSegments>

      {showLabel && (
        <Html
          position={[
            centroid[0],
            (isQuadra || isRoad ? 0.16 : Math.max(0.22, entity.geometry.extrusionHeight + 0.32)),
            centroid[1],
          ]}
          center
          distanceFactor={lot ? 34 : selected ? 38 : 44}
          zIndexRange={[22, 2]}
          style={{ pointerEvents: 'none' }}
        >
          {lot ? (
            <div className={`commercial-map-label is-lot ${selected ? 'is-selected' : ''} ${dimmed ? 'is-dimmed' : ''}`}>
              <span aria-label={`Lote ${lot.lotNumber ?? ''}`}>{lot.lotNumber}</span>
              {(selected || hovered) && lot.block && <strong>{quadraLabel(lot.block)}</strong>}
              {(selected || hovered) && status && <small><b aria-hidden="true">{status.symbol}</b> {status.label}</small>}
            </div>
          ) : isRoad ? (
            <div className="commercial-map-label is-road"><span>{entity.name}</span></div>
          ) : isQuadra ? (
            <div className={`commercial-map-label is-quadra ${selected ? 'is-selected' : ''}`}>
              <span>{quadraLabel(entity.name || entity.publicIdentifier)}</span>
            </div>
          ) : (
            <div className={`commercial-map-label is-structure ${selected ? 'is-selected' : ''}`}>
              <span>{entity.name}</span>
              {(selected || hovered) && <strong>{entity.publicIdentifier}</strong>}
            </div>
          )}
        </Html>
      )}
    </group>
  );
});

function CameraRig({ selectedEntity, extent }: { selectedEntity: MapEntity | null; extent: SceneExtent }) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();
  const preset = useCommercialMapStore((state) => state.cameraPreset);
  const cameraSequence = useCommercialMapStore((state) => state.cameraSequence);
  const targetPosition = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3(extent.centerX, 0, extent.centerZ));
  const animating = useRef(true);
  const initialized = useRef(false);
  const previousPreset = useRef<CameraPreset>(preset);
  const previousSequence = useRef(cameraSequence);
  const previousSelection = useRef<string | null>(selectedEntity?.id ?? null);
  const viewMode = useRef<'preset' | 'selection'>('preset');

  const queuePreset = useCallback((nextPreset: CameraPreset) => {
    const perspective = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(size.height, 1);
    const config = CAMERA_PRESETS[nextPreset];
    const useFullExtent = nextPreset === 'overview' || nextPreset === 'top' || nextPreset === 'isometric';
    const lookAt = useFullExtent
      ? new THREE.Vector3(extent.centerX, Math.min(extent.maxHeight * 0.12, 1.2), extent.centerZ)
      : new THREE.Vector3(...config.target);
    const configuredDirection = new THREE.Vector3(...config.position).sub(new THREE.Vector3(...config.target));
    const direction = nextPreset === 'overview'
      ? new THREE.Vector3(0.04, 0.72, 0.69)
      : nextPreset === 'top'
        ? new THREE.Vector3(0, 1, 0.001)
        : nextPreset === 'isometric'
          ? new THREE.Vector3(0.64, 0.58, 0.64)
          : configuredDirection;
    direction.normalize();
    const distance = fitDistanceForDirection(
      extent,
      perspective.fov || 38,
      aspect,
      direction,
      nextPreset === 'top' ? 1.08 : nextPreset === 'isometric' ? 0.92 : 1.1,
    );
    targetLookAt.current.copy(lookAt);
    targetPosition.current.copy(lookAt).add(direction.multiplyScalar(distance));
    perspective.near = Math.max(0.05, distance / 1600);
    perspective.far = Math.max(720, extent.diagonal * 9, distance * 4);
    perspective.updateProjectionMatrix();
    viewMode.current = 'preset';
    animating.current = true;
  }, [camera, extent, size.height, size.width]);

  const queueSelection = useCallback((entity: MapEntity) => {
    const perspective = camera as THREE.PerspectiveCamera;
    const entityExtent = getEntityExtent(entity);
    const aspect = size.width / Math.max(size.height, 1);
    const lookAt = new THREE.Vector3(
      entityExtent.centerX,
      entity.geometry.elevation + entityExtent.maxHeight * 0.28,
      entityExtent.centerZ,
    );
    const currentTarget = controlsRef.current?.target ?? targetLookAt.current;
    const direction = camera.position.clone().sub(currentTarget);
    if (direction.lengthSq() < 0.01) direction.set(0.7, 0.75, 0.8);
    direction.normalize();
    direction.y = Math.max(direction.y, 0.34);
    direction.normalize();
    const distance = THREE.MathUtils.clamp(
      fitDistance(entityExtent, perspective.fov || 38, aspect, 1.55),
      Math.max(6.5, extent.diagonal * 0.045),
      Math.max(30, extent.diagonal * 0.72),
    );
    targetLookAt.current.copy(lookAt);
    targetPosition.current.copy(lookAt).add(direction.multiplyScalar(distance));
    perspective.near = Math.max(0.035, distance / 1600);
    perspective.far = Math.max(720, extent.diagonal * 9);
    perspective.updateProjectionMatrix();
    viewMode.current = 'selection';
    animating.current = true;
  }, [camera, extent, size.height, size.width]);

  useEffect(() => {
    const selectedId = selectedEntity?.id ?? null;
    const selectionChanged = selectedId !== previousSelection.current;
    const presetChanged = preset !== previousPreset.current;
    const sequenceChanged = cameraSequence !== previousSequence.current;

    if (!initialized.current) {
      if (selectedEntity) queueSelection(selectedEntity);
      else queuePreset(preset);
      initialized.current = true;
    } else if (selectionChanged && selectedEntity) {
      queueSelection(selectedEntity);
    } else if (presetChanged) {
      queuePreset(preset);
    } else if (sequenceChanged && selectedEntity) {
      queueSelection(selectedEntity);
    } else if (selectionChanged || !selectedEntity || viewMode.current === 'preset') {
      queuePreset(preset);
    } else {
      queueSelection(selectedEntity);
    }

    previousSelection.current = selectedId;
    previousPreset.current = preset;
    previousSequence.current = cameraSequence;
  }, [cameraSequence, preset, queuePreset, queueSelection, selectedEntity]);

  const clampTarget = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const margin = Math.max(3, extent.diagonal * 0.08);
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, extent.minX - margin, extent.maxX + margin);
    controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0, extent.maxHeight * 2 + 4);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, extent.minZ - margin, extent.maxZ + margin);
  }, [extent]);

  useFrame((_state, delta) => {
    if (!animating.current) return;
    const factor = 1 - Math.exp(-delta * 4.6);
    camera.position.lerp(targetPosition.current, factor);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLookAt.current, factor);
      clampTarget();
      controlsRef.current.update();
    }
    if (camera.position.distanceTo(targetPosition.current) < 0.06
      && (!controlsRef.current || controlsRef.current.target.distanceTo(targetLookAt.current) < 0.035)) {
      camera.position.copy(targetPosition.current);
      controlsRef.current?.target.copy(targetLookAt.current);
      controlsRef.current?.update();
      animating.current = false;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.072}
      minDistance={Math.max(4.5, extent.diagonal * 0.025)}
      maxDistance={Math.max(260, extent.diagonal * 4.5)}
      minPolarAngle={0.025}
      maxPolarAngle={Math.PI / 2.08}
      screenSpacePanning
      zoomToCursor
      onStart={() => { animating.current = false; }}
      onChange={clampTarget}
    />
  );
}

function Scene({ entities, lots, calibration, matchingEntityIds, filtersActive }: CommercialMapCanvasProps) {
  const selectedEntityId = useCommercialMapStore((state) => state.selectedEntityId);
  const hoveredEntityId = useCommercialMapStore((state) => state.hoveredEntityId);
  const setSelectedEntityId = useCommercialMapStore((state) => state.setSelectedEntityId);
  const setHoveredEntityId = useCommercialMapStore((state) => state.setHoveredEntityId);
  const labelsVisible = useCommercialMapStore((state) => state.labelsVisible);
  const layerVisibility = useCommercialMapStore((state) => state.layerVisibility);
  const layerOpacity = useCommercialMapStore((state) => state.layerOpacity);
  const reducedGraphics = useCommercialMapStore((state) => state.reducedGraphics);
  const cameraPreset = useCommercialMapStore((state) => state.cameraPreset);
  const { size } = useThree();
  const extent = useMemo(() => getSceneExtent(entities), [entities]);
  const lotByEntity = useMemo(() => new Map(lots.map((lot) => [lot.entityId, lot])), [lots]);
  const selectedEntity = entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const showPersistentLabels = labelsVisible
    && !reducedGraphics
    && cameraPreset !== 'isometric'
    && size.width >= 720
    && size.height >= 430;
  const denseLabelCandidates = useMemo(() => entities
    .filter((entity) => lotByEntity.has(entity.id) || entity.classification === 'ROAD')
    .map((entity) => ({
      id: entity.id,
      isRoad: entity.classification === 'ROAD',
      centroid: geometryCentroid(entity.geometry),
    })), [entities, lotByEntity]);
  const [denseLabelEntityIds, setDenseLabelEntityIds] = useState<ReadonlySet<string>>(() => new Set());
  const denseLabelSignature = useRef('');
  const labelLodFrame = useRef(0);
  const groundMargin = Math.max(8, extent.diagonal * 0.08);
  const shadowSpan = Math.max(extent.width, extent.depth) * 0.72;

  useFrame((state) => {
    labelLodFrame.current = (labelLodFrame.current + 1) % 12;
    if (labelLodFrame.current !== 0) return;

    const controls = (state as unknown as { controls?: OrbitControlsImpl }).controls;
    const target = controls?.target ?? new THREE.Vector3(extent.centerX, 0, extent.centerZ);
    const distance = state.camera.position.distanceTo(target);
    const denseLodActive = showPersistentLabels
      && cameraPreset === 'top'
      && size.width >= 960
      && distance <= extent.diagonal * 0.66;

    const nextIds = denseLodActive
      ? denseLabelCandidates
        .map((candidate) => {
          const dx = candidate.centroid[0] - target.x;
          const dz = candidate.centroid[1] - target.z;
          const distanceSquared = dx * dx + dz * dz;
          return {
            ...candidate,
            distanceSquared,
            priority: distanceSquared * (candidate.isRoad ? 0.58 : 1),
          };
        })
        .filter((candidate) => candidate.distanceSquared <= Math.max(144, distance * distance * 0.24))
        .sort((left, right) => left.priority - right.priority)
        .slice(0, 48)
        .map((candidate) => candidate.id)
      : [];
    const nextSignature = nextIds.join('|');
    if (nextSignature === denseLabelSignature.current) return;
    denseLabelSignature.current = nextSignature;
    setDenseLabelEntityIds(new Set(nextIds));
  });

  return (
    <>
      <color attach="background" args={['#e8eee7']} />
      <fog attach="fog" args={['#e8eee7', extent.diagonal * 2.7, extent.diagonal * 6.5]} />
      <ambientLight intensity={1.4} />
      <hemisphereLight args={['#ffffff', '#536c59', 1.35]} />
      <directionalLight
        position={[extent.centerX - extent.width * 0.3, Math.max(54, extent.diagonal * 0.55), extent.centerZ + extent.depth * 0.35]}
        intensity={2.35}
        castShadow={!reducedGraphics}
        shadow-mapSize-width={reducedGraphics ? 512 : 2048}
        shadow-mapSize-height={reducedGraphics ? 512 : 2048}
        shadow-camera-left={-shadowSpan}
        shadow-camera-right={shadowSpan}
        shadow-camera-top={shadowSpan}
        shadow-camera-bottom={-shadowSpan}
        shadow-camera-far={Math.max(180, extent.diagonal * 2.2)}
        shadow-bias={-0.0001}
        shadow-normalBias={0.025}
      />
      <directionalLight
        position={[extent.centerX + extent.width * 0.4, Math.max(24, extent.diagonal * 0.22), extent.centerZ - extent.depth * 0.3]}
        intensity={0.42}
        color="#d8e9ff"
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[extent.centerX, -0.08, extent.centerZ]}
        receiveShadow
        raycast={NO_RAYCAST}
      >
        <planeGeometry args={[extent.width + groundMargin, extent.depth + groundMargin]} />
        <meshStandardMaterial color="#d6e1d4" roughness={1} />
      </mesh>
      <ReferenceUnderlay calibration={calibration} />
      {entities.filter((entity) => (
        layerVisibility[entity.layerId] !== false || selectedEntityId === entity.id
      )).map((entity) => (
        <EntityMesh
          key={entity.id}
          entity={entity}
          lot={lotByEntity.get(entity.id)}
          selected={selectedEntityId === entity.id}
          hovered={hoveredEntityId === entity.id}
          labelsVisible={labelsVisible}
          showPersistentLabels={showPersistentLabels}
          showDenseLabels={denseLabelEntityIds.has(entity.id)}
          filtersActive={filtersActive}
          isMatch={matchingEntityIds.has(entity.id)}
          layerOpacity={layerOpacity[entity.layerId] ?? 1}
          onSelect={setSelectedEntityId}
          onHover={setHoveredEntityId}
        />
      ))}
      <CameraRig selectedEntity={selectedEntity} extent={extent} />
      <AdaptiveDpr pixelated={reducedGraphics} />
      <Preload all />
    </>
  );
}

function CanvasLoader() {
  return (
    <Html center>
      <div className="commercial-map-loading">
        <span />
        <strong>Preparando o parque digital</strong>
        <small>Carregando geometrias e materiais…</small>
      </div>
    </Html>
  );
}

export function CommercialMapCanvas(props: CommercialMapCanvasProps) {
  const { entities, lots, calibration, matchingEntityIds, filtersActive } = props;
  const setSelectedEntityId = useCommercialMapStore((state) => state.setSelectedEntityId);
  const reducedGraphics = useCommercialMapStore((state) => state.reducedGraphics);
  const extent = useMemo(() => getSceneExtent(entities), [entities]);
  const viewportWidth = typeof window === 'undefined' ? 1366 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 768 : window.innerHeight;
  const initialDirection = new THREE.Vector3(0.04, 0.72, 0.69).normalize();
  const initialDistance = fitDistanceForDirection(
    extent,
    38,
    viewportWidth / Math.max(viewportHeight, 1),
    initialDirection,
    1.1,
  );
  const initialTarget = new THREE.Vector3(extent.centerX, 0, extent.centerZ);
  const initialCameraPosition = initialTarget.clone().add(initialDirection.multiplyScalar(initialDistance));

  return (
    <Canvas
      className="commercial-map-canvas"
      camera={{
        position: initialCameraPosition.toArray(),
        fov: 38,
        near: Math.max(0.05, initialDistance / 1600),
        far: Math.max(720, extent.diagonal * 9),
      }}
      dpr={reducedGraphics ? [0.85, 1.25] : [1, 1.75]}
      shadows={!reducedGraphics}
      gl={{ antialias: !reducedGraphics, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.04;
      }}
      onPointerMissed={() => setSelectedEntityId(null)}
    >
      <Suspense fallback={<CanvasLoader />}>
        <Scene
          entities={entities}
          lots={lots}
          calibration={calibration}
          matchingEntityIds={matchingEntityIds}
          filtersActive={filtersActive}
        />
      </Suspense>
    </Canvas>
  );
}
