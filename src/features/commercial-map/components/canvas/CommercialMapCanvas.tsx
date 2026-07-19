import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
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
import {
  isCameraNavigationMovement,
  isMapSelectionClick,
  isSelectableMapClassification,
  selectionFocusProfile,
} from '../../utils/interaction';
import { normalizeMapEntityMetadata, type MapLabelVisibility } from '../../utils/mapMetadata';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkFocusDirection,
  strategicLandmarkSupportsInterior,
  strategicLandmarkVisualHeight,
} from '../../utils/landmarks';
import {
  labelBelongsToActiveMode,
  requiresSolidRendering,
  RESTROOM_PRESENTATION_LIFT,
  resolveGateAccessMode,
  resolveMarkerPresentationLift,
  resolveMapLabelMode,
} from '../../utils/mapPresentation';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type { CameraPreset, CommercialLot, MapCalibration, MapEntity } from '../../types';
import { HeadquartersInteriorScene } from './HeadquartersInteriorScene';
import { LivestockPavilionInteriorScene } from './LivestockPavilionInteriorScene';
import { StrategicLandmarkMesh } from './StrategicLandmarks';

const MiranteInteriorScene = lazy(async () => {
  const module = await import('./MiranteInteriorScene');
  return { default: module.MiranteInteriorScene };
});

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
const LABEL_LEVEL_RANK: Record<MapLabelVisibility, number> = { far: 0, medium: 1, near: 2 };
const MAP_BACKGROUND_COLOR = new THREE.Color('#dfe8de');

function createGateArrowGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.09, 0.28);
  shape.lineTo(0.09, 0.28);
  shape.lineTo(0.09, -0.04);
  shape.lineTo(0.24, -0.04);
  shape.lineTo(0, -0.32);
  shape.lineTo(-0.24, -0.04);
  shape.lineTo(-0.09, -0.04);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 1);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function createRestroomIconGeometry() {
  const shapes: THREE.Shape[] = [];
  [-0.16, 0.16].forEach((x, index) => {
    const head = new THREE.Shape();
    head.absarc(x, -0.13, 0.072, 0, Math.PI * 2, false);
    shapes.push(head);

    const body = new THREE.Shape();
    const halfWidth = index === 0 ? 0.055 : 0.07;
    body.moveTo(x - halfWidth, -0.02);
    body.lineTo(x + halfWidth, -0.02);
    body.lineTo(x + halfWidth, 0.21);
    body.lineTo(x - halfWidth, 0.21);
    body.closePath();
    shapes.push(body);
  });
  const geometry = new THREE.ShapeGeometry(shapes, 6);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

const SHARED_GATE_ARROW_GEOMETRY = createGateArrowGeometry();
const SHARED_RESTROOM_ICON_GEOMETRY = createRestroomIconGeometry();
const SHARED_WHITE_ICON_MATERIAL = new THREE.MeshBasicMaterial({
  color: '#f8fbff',
  depthWrite: true,
  toneMapped: false,
});
const SHARED_RESTROOM_POLE_GEOMETRY = new THREE.CylinderGeometry(
  0.038,
  0.05,
  RESTROOM_PRESENTATION_LIFT,
  8,
);
const SHARED_RESTROOM_POLE_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#15557c',
  roughness: 0.76,
  metalness: 0.04,
});

function entityLabelHeight(entity: MapEntity) {
  const classification = entity.classification;
  if (classification === 'ROAD' || classification === 'PEDESTRIAN_PATH' || classification === 'QUADRA') return 0.16;
  return Math.max(
    0.22,
    (strategicLandmarkVisualHeight(entity) ?? entity.geometry.extrusionHeight)
      + resolveMarkerPresentationLift(classification)
      + 0.32,
  );
}

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
    maxHeight = Math.max(
      maxHeight,
      entity.geometry.elevation
        + (strategicLandmarkVisualHeight(entity) ?? entity.geometry.extrusionHeight)
        + resolveMarkerPresentationLift(entity.classification),
    );
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
  const maxHeight = Math.max(
    0.5,
    (strategicLandmarkVisualHeight(entity) ?? entity.geometry.extrusionHeight)
      + resolveMarkerPresentationLift(entity.classification),
  );
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

function focusProfileForEntity(entity: MapEntity) {
  const profile = selectionFocusProfile(entity.classification);
  const landmark = resolveStrategicLandmarkKind(entity);
  if (landmark === 'administrative-center') {
    return { ...profile, contextRatio: 0.055, fitPadding: 1.08, minDistanceRatio: 0.052, maxDistanceRatio: 0.32, minimumDirectionY: 0.32 };
  }
  if (landmark === 'fenasoja-headquarters') {
    return { ...profile, contextRatio: 0.055, fitPadding: 1.16, minDistanceRatio: 0.05, maxDistanceRatio: 0.3, minimumDirectionY: 0.32 };
  }
  if (landmark === 'livestock-pavilion') {
    return { ...profile, contextRatio: 0.068, fitPadding: 1.08, minDistanceRatio: 0.055, maxDistanceRatio: 0.38, minimumDirectionY: 0.28 };
  }
  if (landmark === 'mirante-pavilion') {
    return { ...profile, contextRatio: 0.075, fitPadding: 1.16, minDistanceRatio: 0.06, maxDistanceRatio: 0.4, minimumDirectionY: 0.3 };
  }
  if (landmark === 'polish-pavilion' || landmark === 'italian-pavilion') {
    return { ...profile, contextRatio: 0.058, fitPadding: 1.18, minDistanceRatio: 0.05, maxDistanceRatio: 0.32, minimumDirectionY: 0.34 };
  }
  if (landmark === 'nations-portico') {
    return { ...profile, contextRatio: 0.052, fitPadding: 1.12, minDistanceRatio: 0.045, maxDistanceRatio: 0.3, minimumDirectionY: 0.32 };
  }
  if (landmark === 'german-pavilion') {
    return { ...profile, contextRatio: 0.06, fitPadding: 1.24, minDistanceRatio: 0.05, maxDistanceRatio: 0.34, minimumDirectionY: 0.34 };
  }
  if (landmark === 'fenasoja-restaurant') {
    return { ...profile, contextRatio: 0.085, fitPadding: 1.26, minDistanceRatio: 0.065, maxDistanceRatio: 0.42, minimumDirectionY: 0.36 };
  }
  if (landmark === 'sicredi-arena') {
    return { ...profile, contextRatio: 0.2, fitPadding: 1.24, minDistanceRatio: 0.13, maxDistanceRatio: 0.62, minimumDirectionY: 0.46 };
  }
  return profile;
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

function createEntityShape(entity: MapEntity) {
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
  return shape;
}

function createEntityGeometry(entity: MapEntity) {
  const shape = createEntityShape(entity);
  const classification = String(entity.classification);
  const surface = ['ROAD', 'PEDESTRIAN_PATH', 'GREEN_AREA', 'PARKING', 'WATER', 'QUADRA'].includes(classification);
  const height = surface ? Math.max(0.018, Math.min(entity.geometry.extrusionHeight, 0.08)) : Math.max(0.025, entity.geometry.extrusionHeight);
  // Pavilion footprints follow the official fill exactly. A bevel expands the
  // silhouette beyond that footprint and made neighbouring buildings appear
  // stacked even when their cartographic bounds only touched.
  const bevel = !surface && classification !== 'PAVILION' && height >= 0.35;
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

function createHitSurfaceGeometry(entity: MapEntity) {
  const geometry = new THREE.ShapeGeometry(createEntityShape(entity), 2);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
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

function createRoofOutlineGeometry(entity: MapEntity) {
  const vertices: number[] = [];
  const height = Math.max(0.025, entity.geometry.extrusionHeight) + 0.018;
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
  selected: boolean;
  hovered: boolean;
  filtersActive: boolean;
  isMatch: boolean;
  layerOpacity: number;
  sceneCenter: readonly [number, number];
  cameraNavigating: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onFocus: () => void;
  onEnterInterior: (id: string) => void;
  onCursor: (cursor: 'grab' | 'grabbing' | 'pointer') => void;
}

const GenericEntityMesh = memo(function GenericEntityMesh({
  entity,
  selected,
  hovered,
  filtersActive,
  isMatch,
  layerOpacity,
  sceneCenter,
  cameraNavigating,
  onSelect,
  onHover,
  onFocus,
  onCursor,
}: EntityMeshProps) {
  const classification = entity.classification;
  const isRoad = classification === 'ROAD';
  const isQuadra = classification === 'QUADRA';
  const isPavilion = classification === 'PAVILION';
  const isGate = classification === 'GATE';
  const isRestroom = classification === 'RESTROOM' || classification === 'CHEMICAL_RESTROOM';
  const isFlat = entity.geometry.extrusionHeight < 0.3 || isRoad || isQuadra;
  const isInteractive = isSelectableMapClassification(entity.classification);
  const solidRendering = requiresSolidRendering(entity.classification);
  const geometry = useMemo(() => isQuadra || isGate ? null : createEntityGeometry(entity), [entity, isGate, isQuadra]);
  const hitSurface = useMemo(() => isQuadra ? createHitSurfaceGeometry(entity) : null, [entity, isQuadra]);
  const edges = useMemo(() => geometry && !isRoad && !isPavilion ? new THREE.EdgesGeometry(geometry, 28) : null, [geometry, isPavilion, isRoad]);
  const roofOutline = useMemo(() => isPavilion ? createRoofOutlineGeometry(entity) : null, [entity, isPavilion]);
  const footprint = useMemo(() => isRoad || isQuadra ? createFootprintGeometry(entity) : null, [entity, isQuadra, isRoad]);
  const markerCenter = useMemo(() => geometryCentroid(entity.geometry), [entity.geometry]);
  const gateRotation = useMemo(() => Math.atan2(
    sceneCenter[0] - markerCenter[0],
    sceneCenter[1] - markerCenter[1],
  ), [markerCenter, sceneCenter]);
  const gateAccessMode = useMemo(() => resolveGateAccessMode(entity.name), [entity.name]);
  const baseColor = CLASSIFICATION_COLORS[entity.classification] ?? '#78907d';
  const matched = Boolean(filtersActive && isMatch);
  const filterStrength = filtersActive && !isMatch && !selected ? 0.42 : 1;
  const visualOpacity = selected ? Math.max(0.94, layerOpacity) : layerOpacity * filterStrength;
  const presentationLift = resolveMarkerPresentationLift(classification);
  const selectedLift = selected ? (isFlat ? 0.055 : 0.11) : 0;
  const displayColor = useMemo(() => {
    if (!solidRendering || selected) return baseColor;
    const strength = THREE.MathUtils.clamp(layerOpacity * filterStrength, 0, 1);
    return `#${new THREE.Color(baseColor).lerp(MAP_BACKGROUND_COLOR, (1 - strength) * 0.82).getHexString()}`;
  }, [baseColor, filterStrength, layerOpacity, selected, solidRendering]);
  const gateBaseColor = selected ? '#e7bd37' : hovered ? '#256b43' : '#174c31';
  const gateAccentColor = selected ? '#174c31' : '#e9c84b';
  const outlineGeometry = isPavilion ? roofOutline : isRoad || isQuadra ? footprint : edges;
  const outlineColor = selected
    ? '#fff1a8'
    : hovered && isInteractive
      ? '#f0d36a'
      : isQuadra
        ? '#3f7b4d'
        : isRoad
          ? '#7c857f'
          : isPavilion
            ? '#21313a'
            : '#1f3327';

  useEffect(() => () => {
    geometry?.dispose();
    hitSurface?.dispose();
    edges?.dispose();
    roofOutline?.dispose();
    footprint?.dispose();
  }, [edges, footprint, geometry, hitSurface, roofOutline]);

  const interactionProps = isInteractive ? {
    onClick: (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      if (!isMapSelectionClick(event.delta)) return;
      onSelect(entity.id);
    },
    onDoubleClick: (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      if (!isMapSelectionClick(event.delta)) return;
      onSelect(entity.id);
      onFocus();
    },
    onPointerOver: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      if (cameraNavigating) return;
      onCursor('pointer');
      onHover(entity.id);
    },
    onPointerOut: () => {
      onCursor(cameraNavigating ? 'grabbing' : 'grab');
      onHover(null);
    },
  } : { raycast: NO_RAYCAST };

  return (
    <group
      position={[0, entity.geometry.elevation + selectedLift + presentationLift, 0]}
      visible={!solidRendering || selected || layerOpacity > 0.015}
    >
      {!isQuadra && !isGate && (
        <mesh
          geometry={geometry!}
          castShadow={!isFlat && (solidRendering || visualOpacity > 0.45)}
          receiveShadow
          {...interactionProps}
        >
          <meshStandardMaterial
            color={displayColor}
            roughness={isPavilion ? 0.82 : isFlat ? 0.9 : 0.72}
            metalness={0}
            transparent={!solidRendering && visualOpacity < 0.995}
            opacity={solidRendering ? 1 : visualOpacity}
            depthTest
            depthWrite={solidRendering || visualOpacity > 0.42}
            emissive={selected || hovered || matched ? baseColor : '#000000'}
            emissiveIntensity={selected ? 0.13 : hovered ? 0.055 : matched ? 0.03 : 0}
            flatShading={isPavilion}
            polygonOffset
            polygonOffsetFactor={isFlat ? -2 : 0}
            polygonOffsetUnits={isFlat ? -2 : 0}
          />
        </mesh>
      )}

      {isGate && (
        <group position={[markerCenter[0], 0, markerCenter[1]]} rotation={[0, gateRotation, 0]}>
          <mesh position={[0, 0.55, 0]} {...interactionProps}>
            <cylinderGeometry args={[0.72, 0.72, 1.18, 10]} />
            <meshBasicMaterial visible={false} />
          </mesh>
          <mesh position={[0, 0.035, 0]} raycast={NO_RAYCAST} receiveShadow>
            <cylinderGeometry args={[0.66, 0.72, 0.07, 10]} />
            <meshStandardMaterial color={gateAccentColor} roughness={0.78} metalness={0.04} />
          </mesh>
          <mesh position={[0, 0.14, 0]} raycast={NO_RAYCAST} castShadow receiveShadow>
            <cylinderGeometry args={[0.59, 0.63, 0.2, 10]} />
            <meshStandardMaterial color={gateBaseColor} roughness={0.72} metalness={0.02} />
          </mesh>
          {gateAccessMode === 'bidirectional' ? (
            <>
              <mesh
                geometry={SHARED_GATE_ARROW_GEOMETRY}
                material={SHARED_WHITE_ICON_MATERIAL}
                position={[-0.18, 0.252, 0]}
                scale={[0.72, 0.72, 0.72]}
                raycast={NO_RAYCAST}
                dispose={null}
              />
              <mesh
                geometry={SHARED_GATE_ARROW_GEOMETRY}
                material={SHARED_WHITE_ICON_MATERIAL}
                position={[0.18, 0.253, 0]}
                rotation={[0, Math.PI, 0]}
                scale={[0.72, 0.72, 0.72]}
                raycast={NO_RAYCAST}
                dispose={null}
              />
            </>
          ) : (
            <mesh
              geometry={SHARED_GATE_ARROW_GEOMETRY}
              material={SHARED_WHITE_ICON_MATERIAL}
              position={[0, 0.252, 0]}
              rotation={[0, gateAccessMode === 'exit' ? Math.PI : 0, 0]}
              raycast={NO_RAYCAST}
              dispose={null}
            />
          )}
          <mesh position={[-0.42, 0.59, 0.08]} raycast={NO_RAYCAST} castShadow>
            <boxGeometry args={[0.13, 0.72, 0.13]} />
            <meshStandardMaterial color={gateBaseColor} roughness={0.74} />
          </mesh>
          <mesh position={[0.42, 0.59, 0.08]} raycast={NO_RAYCAST} castShadow>
            <boxGeometry args={[0.13, 0.72, 0.13]} />
            <meshStandardMaterial color={gateBaseColor} roughness={0.74} />
          </mesh>
          <mesh position={[0, 0.94, 0.08]} raycast={NO_RAYCAST} castShadow>
            <boxGeometry args={[0.97, 0.16, 0.17]} />
            <meshStandardMaterial color={gateAccentColor} roughness={0.7} metalness={0.03} />
          </mesh>
        </group>
      )}

      {isQuadra && hitSurface && (
        <mesh geometry={hitSurface} position={[0, 0.003, 0]} {...interactionProps}>
          <meshBasicMaterial visible={false} />
        </mesh>
      )}

      {outlineGeometry && (
        <lineSegments
          geometry={outlineGeometry}
          position={[0, isRoad || isQuadra ? 0.004 : isPavilion ? 0 : 0.012, 0]}
          raycast={NO_RAYCAST}
          renderOrder={selected ? 4 : solidRendering ? 2 : 1}
        >
          <lineBasicMaterial
            color={outlineColor}
            transparent={!solidRendering}
            opacity={solidRendering ? 1 : selected ? 1 : Math.min(isQuadra ? 0.82 : isRoad ? 0.42 : 0.72, visualOpacity)}
            depthTest
            depthWrite={solidRendering}
            toneMapped={false}
          />
        </lineSegments>
      )}

      {isRestroom && (
        <>
          <mesh
            geometry={SHARED_RESTROOM_POLE_GEOMETRY}
            material={SHARED_RESTROOM_POLE_MATERIAL}
            position={[markerCenter[0], -presentationLift / 2, markerCenter[1]]}
            raycast={NO_RAYCAST}
            castShadow
            dispose={null}
          />
          <mesh
            geometry={SHARED_RESTROOM_ICON_GEOMETRY}
            material={SHARED_WHITE_ICON_MATERIAL}
            position={[markerCenter[0], entity.geometry.extrusionHeight + 0.032, markerCenter[1]]}
            raycast={NO_RAYCAST}
            dispose={null}
          />
        </>
      )}

    </group>
  );
});

const EntityMesh = memo(function EntityMesh(props: EntityMeshProps) {
  if (resolveStrategicLandmarkKind(props.entity)) {
    return (
      <StrategicLandmarkMesh
        entity={props.entity}
        selected={props.selected}
        hovered={props.hovered}
        filtersActive={props.filtersActive}
        isMatch={props.isMatch}
        layerOpacity={props.layerOpacity}
        cameraNavigating={props.cameraNavigating}
        onSelect={props.onSelect}
        onHover={props.onHover}
        onFocus={props.onFocus}
        onEnterInterior={props.onEnterInterior}
        onCursor={props.onCursor}
      />
    );
  }
  return <GenericEntityMesh {...props} />;
});

interface LotEntry {
  entity: MapEntity;
  lot: CommercialLot;
}

function lotColor(entry: LotEntry, filtersActive: boolean, isMatch: boolean, selected: boolean, hovered: boolean) {
  const status = STATUS_CONFIG[entry.lot.status];
  const color = new THREE.Color(status.color);
  if (filtersActive && !isMatch && !selected) color.lerp(new THREE.Color('#c7d1c9'), 0.76);
  if (hovered) color.lerp(new THREE.Color('#ffffff'), 0.1);
  if (selected) color.lerp(new THREE.Color('#fff4b8'), 0.14);
  return color;
}

function eventBatchId(event: ThreeEvent<MouseEvent | PointerEvent>): number | null {
  if (typeof event.batchId === 'number') return event.batchId;
  const intersection = event.intersections.find((candidate) => candidate.object === event.object);
  return typeof intersection?.batchId === 'number' ? intersection.batchId : null;
}

function LotSelectionOutline({ entity }: { entity: MapEntity }) {
  const geometry = useMemo(() => createEntityGeometry(entity), [entity]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 28), [geometry]);
  useEffect(() => () => {
    edges.dispose();
    geometry.dispose();
  }, [edges, geometry]);

  return (
    <lineSegments geometry={edges} position={[0, entity.geometry.elevation + 0.085, 0]} raycast={NO_RAYCAST}>
      <lineBasicMaterial color="#fff1a8" toneMapped={false} />
    </lineSegments>
  );
}

function BatchedLots({
  entries,
  selectedEntityId,
  hoveredEntityId,
  matchingEntityIds,
  filtersActive,
  layerOpacity,
  onSelect,
  onHover,
  onFocus,
  cameraNavigating,
  onCursor,
}: {
  entries: LotEntry[];
  selectedEntityId: string | null;
  hoveredEntityId: string | null;
  matchingEntityIds: ReadonlySet<string>;
  filtersActive: boolean;
  layerOpacity: Record<string, number>;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onFocus: () => void;
  cameraNavigating: boolean;
  onCursor: (cursor: 'grab' | 'grabbing' | 'pointer') => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const hoveredRef = useRef<string | null>(null);
  const visualStateRef = useRef({ selectedEntityId, hoveredEntityId });
  const previousTransientRef = useRef({ selectedEntityId: null as string | null, hoveredEntityId: null as string | null });
  visualStateRef.current = { selectedEntityId, hoveredEntityId };
  const entryByEntity = useMemo(() => new Map(entries.map((entry) => [entry.entity.id, entry])), [entries]);
  const batch = useMemo(() => {
    if (entries.length === 0) return null;
    const sourceGeometries = entries.map(({ entity }) => {
      const geometry = createEntityGeometry(entity);
      if (!geometry.index) return geometry;
      const nonIndexed = geometry.toNonIndexed();
      geometry.dispose();
      return nonIndexed;
    });
    const vertexCount = sourceGeometries.reduce((sum, geometry) => sum + geometry.getAttribute('position').count, 0);
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.86, metalness: 0 });
    const mesh = new THREE.BatchedMesh(entries.length, vertexCount, 0, material);
    const entityByBatchId = new Map<number, string>();
    const batchIdByEntity = new Map<string, number>();
    const edgePositions: number[] = [];
    const edgeColors: number[] = [];
    const matrix = new THREE.Matrix4();

    sourceGeometries.forEach((geometry, index) => {
      const entry = entries[index];
      const geometryId = mesh.addGeometry(geometry);
      const batchId = mesh.addInstance(geometryId);
      matrix.makeTranslation(0, entry.entity.geometry.elevation, 0);
      mesh.setMatrixAt(batchId, matrix);
      mesh.setColorAt(batchId, new THREE.Color(STATUS_CONFIG[entry.lot.status].color));
      entityByBatchId.set(batchId, entry.entity.id);
      batchIdByEntity.set(entry.entity.id, batchId);

      const edgeGeometry = new THREE.EdgesGeometry(geometry, 28);
      const positions = edgeGeometry.getAttribute('position');
      const borderColor = new THREE.Color(STATUS_CONFIG[entry.lot.status].border);
      for (let positionIndex = 0; positionIndex < positions.count; positionIndex += 1) {
        edgePositions.push(
          positions.getX(positionIndex),
          positions.getY(positionIndex) + entry.entity.geometry.elevation + 0.012,
          positions.getZ(positionIndex),
        );
        edgeColors.push(borderColor.r, borderColor.g, borderColor.b);
      }
      edgeGeometry.dispose();
      geometry.dispose();
    });

    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    edgeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(edgeColors, 3));
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.perObjectFrustumCulled = true;
    mesh.sortObjects = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    return { mesh, material, edgeGeometry, entityByBatchId, batchIdByEntity, raycast: mesh.raycast };
  }, [entries]);

  useEffect(() => () => {
    batch?.edgeGeometry.dispose();
    batch?.material.dispose();
    batch?.mesh.dispose();
  }, [batch]);

  const applyVisualState = useCallback((entityId: string) => {
    if (!batch) return;
    const entry = entryByEntity.get(entityId);
    if (!entry) return;
    const batchId = batch.batchIdByEntity.get(entityId);
    if (batchId === undefined) return;
    const { selectedEntityId: currentSelection, hoveredEntityId: currentHover } = visualStateRef.current;
    const selected = currentSelection === entityId;
    const hovered = currentHover === entityId;
    const matrix = new THREE.Matrix4();
    batch.mesh.setColorAt(batchId, lotColor(entry, filtersActive, matchingEntityIds.has(entityId), selected, hovered));
    matrix.makeTranslation(0, entry.entity.geometry.elevation + (selected ? 0.055 : hovered ? 0.035 : 0), 0);
    batch.mesh.setMatrixAt(batchId, matrix);
  }, [batch, entryByEntity, filtersActive, matchingEntityIds]);

  useEffect(() => {
    if (!batch) return;
    entries.forEach((entry) => applyVisualState(entry.entity.id));
    previousTransientRef.current = { ...visualStateRef.current };
    batch.mesh.computeBoundingBox();
    batch.mesh.computeBoundingSphere();
    invalidate();
  }, [applyVisualState, batch, entries, filtersActive, invalidate, matchingEntityIds]);

  useEffect(() => {
    if (!batch) return;
    const previous = previousTransientRef.current;
    const changedIds = new Set([
      previous.selectedEntityId,
      previous.hoveredEntityId,
      selectedEntityId,
      hoveredEntityId,
    ].filter((id): id is string => Boolean(id)));
    changedIds.forEach(applyVisualState);
    previousTransientRef.current = { selectedEntityId, hoveredEntityId };
    if (changedIds.size > 0) invalidate();
  }, [applyVisualState, batch, hoveredEntityId, invalidate, selectedEntityId]);

  useEffect(() => {
    if (!batch) return;
    const opacity = entries.length > 0 ? (layerOpacity[entries[0].entity.layerId] ?? 1) : 1;
    batch.material.opacity = opacity;
    batch.material.transparent = opacity < 0.995;
    batch.material.depthWrite = opacity > 0.42;
    batch.material.needsUpdate = true;
    invalidate();
  }, [batch, entries, invalidate, layerOpacity]);

  useEffect(() => {
    if (!cameraNavigating) return;
    hoveredRef.current = null;
    onHover(null);
    onCursor('grabbing');
  }, [cameraNavigating, onCursor, onHover]);

  if (!batch) return null;
  const selectedEntity = entries.find((entry) => entry.entity.id === selectedEntityId)?.entity;

  const resolveEntityId = (event: ThreeEvent<MouseEvent | PointerEvent>) => {
    const batchId = eventBatchId(event);
    return batchId === null ? null : (batch.entityByBatchId.get(batchId) ?? null);
  };

  return (
    <>
      <primitive
        object={batch.mesh}
        raycast={batch.raycast}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          if (!isMapSelectionClick(event.delta)) return;
          const entityId = resolveEntityId(event);
          if (entityId) onSelect(entityId);
        }}
        onDoubleClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          if (!isMapSelectionClick(event.delta)) return;
          const entityId = resolveEntityId(event);
          if (!entityId) return;
          onSelect(entityId);
          onFocus();
        }}
        onPointerMove={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation();
          if (cameraNavigating) return;
          const entityId = resolveEntityId(event);
          if (entityId === hoveredRef.current) return;
          hoveredRef.current = entityId;
          onCursor(entityId ? 'pointer' : 'grab');
          onHover(entityId);
        }}
        onPointerOut={() => {
          hoveredRef.current = null;
          onCursor(cameraNavigating ? 'grabbing' : 'grab');
          onHover(null);
        }}
      />
      <lineSegments geometry={batch.edgeGeometry} raycast={NO_RAYCAST}>
        <lineBasicMaterial vertexColors transparent opacity={0.7} toneMapped={false} />
      </lineSegments>
      {selectedEntity && <LotSelectionOutline entity={selectedEntity} />}
    </>
  );
}

const EntityLabel = memo(function EntityLabel({
  entity,
  lot,
  selected,
  hovered,
  filtersActive,
  isMatch,
  level,
}: {
  entity: MapEntity;
  lot?: CommercialLot;
  selected: boolean;
  hovered: boolean;
  filtersActive: boolean;
  isMatch: boolean;
  level: MapLabelVisibility;
}) {
  const metadata = useMemo(() => normalizeMapEntityMetadata(entity, lot), [entity, lot]);
  const classification = entity.classification;
  const isRoad = classification === 'ROAD' || classification === 'PEDESTRIAN_PATH';
  const isQuadra = classification === 'QUADRA';
  const isGate = classification === 'GATE';
  const isRestroom = classification === 'RESTROOM' || classification === 'CHEMICAL_RESTROOM';
  const isArchitecturalLandmark = Boolean(resolveStrategicLandmarkKind(entity));
  const dimmed = Boolean(lot && filtersActive && !isMatch && !selected);
  const status = lot ? STATUS_CONFIG[lot.status] : null;
  const labelHeight = entityLabelHeight(entity);

  return (
    <Html
      position={[metadata.labelAnchor[0], entity.geometry.elevation + labelHeight, metadata.labelAnchor[1]]}
      center
      distanceFactor={selected ? isArchitecturalLandmark ? 11.5 : 18 : isArchitecturalLandmark ? 16 : lot ? 28 : level === 'far' ? 42 : 36}
      zIndexRange={[22, 2]}
      style={{ pointerEvents: 'none' }}
    >
      {lot ? (
        <div data-map-entity-id={entity.id} data-map-label-mode={selected ? 'focus' : 'navigation'} className={`commercial-map-label is-lot ${selected ? 'is-selected' : ''} ${dimmed ? 'is-dimmed' : ''}`}>
          <span aria-label={`Lote ${metadata.lotNumber ?? ''}`}>{metadata.lotNumber}</span>
          {(selected || hovered) && metadata.block && <strong>{quadraLabel(metadata.block)}</strong>}
          {(selected || hovered) && status && <small><b aria-hidden="true">{status.symbol}</b> {status.label}</small>}
        </div>
      ) : isRoad ? (
        <div data-map-entity-id={entity.id} data-map-label-mode="navigation" className="commercial-map-label is-road"><span>{metadata.officialDisplayName}</span></div>
      ) : isQuadra ? (
        <div data-map-entity-id={entity.id} data-map-label-mode={selected ? 'focus' : 'navigation'} className={`commercial-map-label is-quadra ${selected ? 'is-selected' : ''}`}>
          <span>{quadraLabel(metadata.officialDisplayName || entity.publicIdentifier)}</span>
        </div>
      ) : (
        <div
          data-map-entity-id={entity.id}
          data-map-label-mode={selected ? 'focus' : 'navigation'}
          className={`commercial-map-label is-structure ${isGate ? 'is-access' : ''} ${isRestroom ? 'is-restroom' : ''} ${isArchitecturalLandmark ? 'is-architectural-landmark' : ''} ${selected ? 'is-selected' : ''}`}
        >
          {metadata.structureCode && <strong className="commercial-map-label-code">{isRestroom ? 'E' : metadata.structureCode}</strong>}
          <span>{isRestroom && !selected ? 'WC' : metadata.officialDisplayName}</span>
        </div>
      )}
    </Html>
  );
});

function useSemanticLabelVisibility({
  entities,
  lotByEntity,
  extent,
  labelsVisible,
  reducedGraphics,
  selectedEntityId,
  hoveredEntityId,
  matchingEntityIds,
  filtersActive,
}: {
  entities: MapEntity[];
  lotByEntity: Map<string, CommercialLot>;
  extent: SceneExtent;
  labelsVisible: boolean;
  reducedGraphics: boolean;
  selectedEntityId: string | null;
  hoveredEntityId: string | null;
  matchingEntityIds: ReadonlySet<string>;
  filtersActive: boolean;
}) {
  const candidates = useMemo(() => entities.map((entity) => {
    const metadata = normalizeMapEntityMetadata(entity, lotByEntity.get(entity.id));
    const labelHeight = entityLabelHeight(entity);
    return {
      entity,
      metadata,
      position: new THREE.Vector3(metadata.labelAnchor[0], entity.geometry.elevation + labelHeight, metadata.labelAnchor[1]),
    };
  }), [entities, lotByEntity]);
  const [visibility, setVisibility] = useState<{ ids: ReadonlySet<string>; level: MapLabelVisibility }>(() => ({ ids: new Set(), level: 'far' }));
  const previousSignature = useRef('');
  const matchingSignature = useMemo(() => [...matchingEntityIds].sort().join('|'), [matchingEntityIds]);
  const labelMode = useMemo(() => resolveMapLabelMode(selectedEntityId), [selectedEntityId]);
  const focusedVisibility = useMemo(() => labelMode.kind === 'focus'
    ? { ids: new Set([labelMode.selectedEntityId]) as ReadonlySet<string>, level: 'near' as MapLabelVisibility }
    : null, [labelMode]);

  useFrame((state) => {
    if (labelMode.kind === 'focus') {
      // Focus is a semantic label mode, not another collision priority. Skip
      // the map-wide projection pass and keep exactly one stable identifier.
      previousSignature.current = '';
      return;
    }
    const controls = (state as unknown as { controls?: OrbitControlsImpl }).controls;
    const target = controls?.target ?? new THREE.Vector3(extent.centerX, 0, extent.centerZ);
    const cameraDistance = state.camera.position.distanceTo(target);
    const level: MapLabelVisibility = cameraDistance <= extent.diagonal * 0.3
      ? 'near'
      : cameraDistance <= extent.diagonal * 0.82
        ? 'medium'
        : 'far';
    const cameraSignature = [
      state.camera.position.x.toFixed(1), state.camera.position.y.toFixed(1), state.camera.position.z.toFixed(1),
      target.x.toFixed(1), target.z.toFixed(1), state.size.width, state.size.height,
      level, selectedEntityId, hoveredEntityId, labelsVisible, reducedGraphics, filtersActive, matchingSignature,
    ].join(':');
    if (cameraSignature === previousSignature.current) return;

    const mobile = state.size.width < 720 || state.size.height < 430;
    const cap = level === 'far' ? (mobile ? 6 : 14) : level === 'medium' ? (mobile ? 16 : 36) : (mobile ? 28 : 72);
    const currentRank = LABEL_LEVEL_RANK[level];
    const viewportWidth = state.size.width;
    const viewportHeight = state.size.height;
    const projected = candidates
      .filter(({ entity, metadata }) => {
        if (!labelBelongsToActiveMode(labelMode, entity.id)) return false;
        if (entity.id === selectedEntityId || entity.id === hoveredEntityId) return true;
        if (!labelsVisible || reducedGraphics && mobile) return false;
        if (filtersActive && !matchingEntityIds.has(entity.id)) {
          const keepsCartographicContext = entity.classification === 'ROAD'
            || entity.classification === 'PEDESTRIAN_PATH'
            || entity.classification === 'QUADRA';
          if (!keepsCartographicContext) return false;
        }
        return LABEL_LEVEL_RANK[metadata.preferredLabelVisibility] <= currentRank;
      })
      .map((candidate) => {
        const point = candidate.position.clone().project(state.camera);
        const isLot = candidate.entity.classification === 'SELLABLE_LOT';
        const isRoad = candidate.entity.classification === 'ROAD' || candidate.entity.classification === 'PEDESTRIAN_PATH';
        const nameLength = candidate.metadata.officialDisplayName.length;
        const width = isLot ? 28 : isRoad ? Math.min(126, Math.max(62, nameLength * 5.2)) : Math.min(180, Math.max(76, nameLength * 5.5));
        const height = isLot ? 20 : 28;
        const forced = candidate.entity.id === selectedEntityId || candidate.entity.id === hoveredEntityId;
        return {
          ...candidate,
          forced,
          visible: point.z >= -1 && point.z <= 1 && Math.abs(point.x) <= 1.08 && Math.abs(point.y) <= 1.08,
          x: (point.x * 0.5 + 0.5) * viewportWidth,
          y: (-point.y * 0.5 + 0.5) * viewportHeight,
          width,
          height,
          priority: candidate.metadata.labelPriority + (forced ? 1000 : 0) + (matchingEntityIds.has(candidate.entity.id) ? 120 : 0),
        };
      })
      .filter((candidate) => candidate.visible)
      .sort((left, right) => right.priority - left.priority);

    const accepted: typeof projected = [];
    for (const candidate of projected) {
      if (!candidate.forced && accepted.length >= cap) continue;
      const overlaps = accepted.some((existing) => Math.abs(candidate.x - existing.x) < (candidate.width + existing.width) / 2 + 7
        && Math.abs(candidate.y - existing.y) < (candidate.height + existing.height) / 2 + 6);
      if (!overlaps || candidate.forced) accepted.push(candidate);
    }
    const ids = accepted.map((candidate) => candidate.entity.id).sort();
    previousSignature.current = cameraSignature;
    if (`${visibility.level}|${[...visibility.ids].sort().join('|')}` === `${level}|${ids.join('|')}`) return;
    setVisibility({ ids: new Set(ids), level });
  });

  return focusedVisibility ?? visibility;
}

function CameraRig({ selectedEntity, extent }: { selectedEntity: MapEntity | null; extent: SceneExtent }) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera, size, invalidate, gl } = useThree();
  const preset = useCommercialMapStore((state) => state.cameraPreset);
  const cameraSequence = useCommercialMapStore((state) => state.cameraSequence);
  const activePanel = useCommercialMapStore((state) => state.activePanel);
  const setCameraNavigating = useCommercialMapStore((state) => state.setCameraNavigating);
  const targetPosition = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3(extent.centerX, 0, extent.centerZ));
  const animating = useRef(true);
  const navigation = useRef({
    active: false,
    navigating: false,
    startPosition: new THREE.Vector3(),
    startTarget: new THREE.Vector3(),
  });
  const initialized = useRef(false);
  const previousPreset = useRef<CameraPreset>(preset);
  const previousSequence = useRef(cameraSequence);
  const previousSelection = useRef<string | null>(selectedEntity?.id ?? null);
  const returnView = useRef(useCommercialMapStore.getState().interiorReturnView);
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  const startCameraMove = useCallback(() => {
    if (reducedMotion) {
      camera.position.copy(targetPosition.current);
      controlsRef.current?.target.copy(targetLookAt.current);
      controlsRef.current?.update();
      animating.current = false;
    } else {
      animating.current = true;
    }
    invalidate();
  }, [camera, invalidate, reducedMotion]);

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
    perspective.fov = 38;
    perspective.near = Math.max(0.05, distance / 1600);
    perspective.far = Math.max(720, extent.diagonal * 9, distance * 4);
    perspective.updateProjectionMatrix();
    startCameraMove();
  }, [camera, extent, size.height, size.width, startCameraMove]);

  const queueSelection = useCallback((entity: MapEntity) => {
    const perspective = camera as THREE.PerspectiveCamera;
    const entityExtent = getEntityExtent(entity);
    const focusProfile = focusProfileForEntity(entity);
    const landmarkKind = resolveStrategicLandmarkKind(entity);
    const hasDetailsPanel = activePanel === 'details';
    const sidePanelLayout = hasDetailsPanel
      && (typeof window === 'undefined' ? size.width > 900 : window.innerWidth > 900);
    const panelWidth = sidePanelLayout ? Math.min(380, size.width * 0.54) : 0;
    const compactPanelRatio = landmarkKind === 'mirante-pavilion'
      ? 0.68
      : size.width <= 640 ? 0.74 : 0.68;
    const panelHeight = hasDetailsPanel && !sidePanelLayout
      ? Math.min(size.height * compactPanelRatio, 610)
      : 0;
    const usableWidth = Math.max(size.width - panelWidth, size.width * 0.48);
    const usableHeight = Math.max(size.height - panelHeight, size.height * 0.26);
    const aspect = usableWidth / Math.max(usableHeight, 1);
    const mobileMiranteSelection = landmarkKind === 'mirante-pavilion' && panelHeight > 0;
    const compactSidePanelMirante = landmarkKind === 'mirante-pavilion'
      && panelWidth > 0
      && usableWidth < 420;
    const entityCenter = new THREE.Vector3(
      entityExtent.centerX,
      entity.geometry.elevation + entityExtent.maxHeight * (mobileMiranteSelection ? -0.32 : 0.28),
      entityExtent.centerZ,
    );
    const currentTarget = controlsRef.current?.target ?? targetLookAt.current;
    const direction = camera.position.clone().sub(currentTarget);
    if (direction.lengthSq() < 0.01) direction.set(0.7, 0.75, 0.8);
    direction.normalize();
    const landmarkFocusDirection = strategicLandmarkFocusDirection(entity);
    if (landmarkFocusDirection) {
      // Preserve a small amount of spatial continuity while making the public
      // facade deterministic after rapid switches or a lateral manual view.
      const deterministicDirection = new THREE.Vector3(...landmarkFocusDirection).normalize();
      if (landmarkKind === 'mirante-pavilion') direction.copy(deterministicDirection);
      else direction.lerp(deterministicDirection, 0.92).normalize();
    }
    direction.y = Math.max(direction.y, focusProfile.minimumDirectionY);
    direction.normalize();
    const fittedDistance = fitDistanceForDirection(entityExtent, perspective.fov || 38, aspect, direction, focusProfile.fitPadding);
    const fittedSelectionDistance = THREE.MathUtils.clamp(
      Math.max(fittedDistance, extent.diagonal * focusProfile.contextRatio),
      Math.max(10, extent.diagonal * focusProfile.minDistanceRatio),
      Math.max(36, extent.diagonal * focusProfile.maxDistanceRatio),
    );
    const distance = mobileMiranteSelection
      ? fittedSelectionDistance * 1.26
      : compactSidePanelMirante
        ? fittedSelectionDistance * 1.36
      : fittedSelectionDistance;
    const viewDirection = direction.clone().negate();
    const right = new THREE.Vector3().crossVectors(viewDirection, new THREE.Vector3(0, 1, 0));
    if (right.lengthSq() < 0.0001) right.set(1, 0, 0);
    else right.normalize();
    const horizontalFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(perspective.fov || 38) / 2) * Math.max(size.width / Math.max(size.height, 1), 0.35));
    const lookAt = entityCenter.clone();
    if (panelWidth > 0) {
      const horizontalShift = distance * Math.tan(horizontalFov / 2) * (panelWidth / Math.max(size.width, 1));
      lookAt.addScaledVector(right, horizontalShift * (compactSidePanelMirante ? 1.04 : 0.72));
    } else if (panelHeight > 0) {
      const viewUp = new THREE.Vector3().crossVectors(right, viewDirection);
      viewUp.y = 0;
      if (viewUp.lengthSq() > 0.0001) {
        viewUp.normalize();
        const verticalShift = distance * Math.tan(THREE.MathUtils.degToRad(perspective.fov || 38) / 2) * (panelHeight / Math.max(size.height, 1));
        // Keep the anchor and its label clear of the mobile details sheet. The
        // sheet's rounded top edge and safe-area spacing need a little more
        // clearance than its raw height alone suggests.
        const mobilePanelClearance = landmarkKind === 'livestock-pavilion'
          ? 1.72
          : landmarkKind === 'mirante-pavilion'
            ? 1.56
            : 0.96;
        lookAt.addScaledVector(viewUp, -verticalShift * mobilePanelClearance);
      }
    }
    targetLookAt.current.copy(lookAt);
    targetPosition.current.copy(lookAt).add(direction.multiplyScalar(distance));
    perspective.fov = 38;
    perspective.near = Math.max(0.035, distance / 1600);
    perspective.far = Math.max(720, extent.diagonal * 9);
    perspective.updateProjectionMatrix();
    startCameraMove();
  }, [activePanel, camera, extent, size.height, size.width, startCameraMove]);

  useEffect(() => {
    const selectedId = selectedEntity?.id ?? null;
    const selectionChanged = selectedId !== previousSelection.current;
    const presetChanged = preset !== previousPreset.current;
    const sequenceChanged = cameraSequence !== previousSequence.current;

    if (!initialized.current) {
      if (returnView.current) {
        const perspective = camera as THREE.PerspectiveCamera;
        targetPosition.current.set(...returnView.current.position);
        targetLookAt.current.set(...returnView.current.target);
        camera.position.copy(targetPosition.current);
        controlsRef.current?.target.copy(targetLookAt.current);
        controlsRef.current?.update();
        perspective.fov = 38;
        perspective.near = Math.max(0.035, camera.position.distanceTo(targetLookAt.current) / 1600);
        perspective.far = Math.max(720, extent.diagonal * 9);
        perspective.updateProjectionMatrix();
        animating.current = false;
        returnView.current = null;
        useCommercialMapStore.getState().setInteriorReturnView(null);
        invalidate();
      } else if (selectedEntity) queueSelection(selectedEntity);
      else queuePreset(preset);
      initialized.current = true;
    } else if (presetChanged) {
      queuePreset(preset);
    } else if (sequenceChanged) {
      if (selectedEntity) queueSelection(selectedEntity);
      else queuePreset(preset);
    } else if (selectionChanged && selectedEntity) {
      queueSelection(selectedEntity);
    } else if (selectionChanged && !selectedEntity) {
      animating.current = false;
    } else if (selectedEntity) {
      queueSelection(selectedEntity);
    }

    previousSelection.current = selectedId;
    previousPreset.current = preset;
    previousSequence.current = cameraSequence;
  }, [camera, cameraSequence, extent.diagonal, invalidate, preset, queuePreset, queueSelection, selectedEntity]);

  const clampTarget = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const margin = Math.max(3, extent.diagonal * 0.08);
    const targetMinimumY = selectedEntity
      && resolveStrategicLandmarkKind(selectedEntity) === 'mirante-pavilion'
      ? -extent.maxHeight * 1.2
      : 0;
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, extent.minX - margin, extent.maxX + margin);
    controls.target.y = THREE.MathUtils.clamp(
      controls.target.y,
      targetMinimumY,
      extent.maxHeight * 2 + 4,
    );
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, extent.minZ - margin, extent.maxZ + margin);
  }, [extent, selectedEntity]);

  const handleControlsStart = useCallback(() => {
    const controls = controlsRef.current;
    animating.current = false;
    navigation.current.active = true;
    navigation.current.navigating = false;
    navigation.current.startPosition.copy(camera.position);
    navigation.current.startTarget.copy(controls?.target ?? targetLookAt.current);
  }, [camera]);

  const handleControlsChange = useCallback(() => {
    const controls = controlsRef.current;
    clampTarget();
    if (controls && navigation.current.active && !navigation.current.navigating) {
      const cameraDelta = camera.position.distanceTo(navigation.current.startPosition);
      const targetDelta = controls.target.distanceTo(navigation.current.startTarget);
      if (isCameraNavigationMovement(cameraDelta, targetDelta)) {
        navigation.current.navigating = true;
        setCameraNavigating(true);
        gl.domElement.style.cursor = 'grabbing';
      }
    }
    invalidate();
  }, [camera, clampTarget, gl, invalidate, setCameraNavigating]);

  const handleControlsEnd = useCallback(() => {
    const wasNavigating = navigation.current.navigating;
    navigation.current.active = false;
    navigation.current.navigating = false;
    if (wasNavigating) {
      setCameraNavigating(false);
      gl.domElement.style.cursor = 'grab';
    }
    invalidate();
  }, [gl, invalidate, setCameraNavigating]);

  useEffect(() => () => {
    const controls = controlsRef.current;
    const store = useCommercialMapStore.getState();
    if (store.interiorEntityId && controls) {
      store.setInteriorReturnView({
        position: camera.position.toArray() as [number, number, number],
        target: controls.target.toArray() as [number, number, number],
      });
    }
    setCameraNavigating(false);
    gl.domElement.style.cursor = '';
  }, [camera, gl, setCameraNavigating]);

  useFrame((_state, delta) => {
    if (!animating.current) return;
    const factor = 1 - Math.exp(-delta * 5.4);
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
    } else {
      invalidate();
    }
  });

  const selectedKind = selectedEntity ? resolveStrategicLandmarkKind(selectedEntity) : null;
  const miranteSelected = selectedKind === 'mirante-pavilion';
  const miranteExtent = miranteSelected && selectedEntity ? getEntityExtent(selectedEntity) : null;
  const miranteMinimumDistance = miranteExtent
    ? Math.max(7.5, miranteExtent.diagonal * 0.8)
    : Math.max(8, extent.diagonal * 0.055);
  const miranteMaximumDistance = miranteExtent
    ? Math.max(30, miranteExtent.diagonal * 4)
    : Math.max(260, extent.diagonal * 4.5);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      regress
      enableDamping={!reducedMotion}
      dampingFactor={0.072}
      enablePan={!miranteSelected}
      minDistance={miranteMinimumDistance}
      maxDistance={miranteMaximumDistance}
      minPolarAngle={0.025}
      maxPolarAngle={Math.PI / 2.08}
      screenSpacePanning
      zoomToCursor={!miranteSelected}
      minAzimuthAngle={miranteSelected ? -2.65 : -Infinity}
      maxAzimuthAngle={miranteSelected ? -0.9 : Infinity}
      onStart={handleControlsStart}
      onEnd={handleControlsEnd}
      onChange={handleControlsChange}
    />
  );
}

function Scene({ entities, lots, calibration, matchingEntityIds, filtersActive }: CommercialMapCanvasProps) {
  const selectedEntityId = useCommercialMapStore((state) => state.selectedEntityId);
  const interiorEntityId = useCommercialMapStore((state) => state.interiorEntityId);
  const hoveredEntityId = useCommercialMapStore((state) => state.hoveredEntityId);
  const setSelectedEntityId = useCommercialMapStore((state) => state.setSelectedEntityId);
  const setHoveredEntityId = useCommercialMapStore((state) => state.setHoveredEntityId);
  const focusSelection = useCommercialMapStore((state) => state.focusSelection);
  const enterInterior = useCommercialMapStore((state) => state.enterInterior);
  const labelsVisible = useCommercialMapStore((state) => state.labelsVisible);
  const layerVisibility = useCommercialMapStore((state) => state.layerVisibility);
  const layerOpacity = useCommercialMapStore((state) => state.layerOpacity);
  const reducedGraphics = useCommercialMapStore((state) => state.reducedGraphics);
  const cameraNavigating = useCommercialMapStore((state) => state.cameraNavigating);
  const { gl, invalidate } = useThree();
  const setCanvasCursor = useCallback((cursor: 'grab' | 'grabbing' | 'pointer') => {
    gl.domElement.style.cursor = cursor;
  }, [gl]);
  const extent = useMemo(() => getSceneExtent(entities), [entities]);
  const sceneCenter = useMemo(() => [extent.centerX, extent.centerZ] as const, [extent.centerX, extent.centerZ]);
  const lotByEntity = useMemo(() => new Map(lots.map((lot) => [lot.entityId, lot])), [lots]);
  const selectedEntity = entities.find((entity) => entity.id === selectedEntityId) ?? null;
  const interiorEntity = entities.find((entity) => (
    entity.id === interiorEntityId && strategicLandmarkSupportsInterior(entity)
  )) ?? null;
  const visibleLayerEntities = useMemo(() => entities.filter((entity) => (
    layerVisibility[entity.layerId] !== false
  )), [entities, layerVisibility]);
  const selectedHiddenEntity = selectedEntity && layerVisibility[selectedEntity.layerId] === false ? selectedEntity : null;
  const renderedEntities = useMemo(() => selectedHiddenEntity
    ? [...visibleLayerEntities, selectedHiddenEntity]
    : visibleLayerEntities, [selectedHiddenEntity, visibleLayerEntities]);
  const lotEntries = useMemo(() => renderedEntities
    .map((entity) => ({ entity, lot: lotByEntity.get(entity.id) }))
    .filter((entry): entry is LotEntry => Boolean(entry.lot)), [lotByEntity, renderedEntities]);
  const nonLotEntities = useMemo(() => renderedEntities.filter((entity) => !lotByEntity.has(entity.id)), [lotByEntity, renderedEntities]);
  const labelVisibility = useSemanticLabelVisibility({
    entities: renderedEntities,
    lotByEntity,
    extent,
    labelsVisible,
    reducedGraphics,
    selectedEntityId,
    hoveredEntityId,
    matchingEntityIds,
    filtersActive,
  });
  const groundMargin = Math.max(8, extent.diagonal * 0.08);
  const shadowSpan = Math.max(extent.width, extent.depth) * 0.58;

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    invalidate();
    return () => { gl.shadowMap.autoUpdate = true; };
  }, [entities, gl, interiorEntityId, invalidate, reducedGraphics]);

  useEffect(() => {
    if (!cameraNavigating) return;
    setHoveredEntityId(null);
  }, [cameraNavigating, setHoveredEntityId]);

  if (interiorEntity) {
    const interiorKind = resolveStrategicLandmarkKind(interiorEntity);
    if (interiorKind === 'livestock-pavilion') {
      return <LivestockPavilionInteriorScene entity={interiorEntity} reducedGraphics={reducedGraphics} />;
    }
    if (interiorKind === 'mirante-pavilion') {
      return <MiranteInteriorScene entity={interiorEntity} reducedGraphics={reducedGraphics} />;
    }
    return <HeadquartersInteriorScene entity={interiorEntity} reducedGraphics={reducedGraphics} />;
  }

  return (
    <>
      <color attach="background" args={['#dfe8de']} />
      <fog attach="fog" args={['#dfe8de', extent.diagonal * 3.2, extent.diagonal * 7.4]} />
      <ambientLight intensity={0.68} />
      <hemisphereLight args={['#fffdf5', '#48634e', 0.9]} />
      <directionalLight
        position={[extent.centerX - extent.width * 0.3, Math.max(54, extent.diagonal * 0.55), extent.centerZ + extent.depth * 0.35]}
        intensity={2.15}
        color="#fff4d8"
        castShadow={!reducedGraphics}
        shadow-mapSize-width={reducedGraphics ? 512 : 2048}
        shadow-mapSize-height={reducedGraphics ? 512 : 2048}
        shadow-camera-left={-shadowSpan}
        shadow-camera-right={shadowSpan}
        shadow-camera-top={shadowSpan}
        shadow-camera-bottom={-shadowSpan}
        shadow-camera-near={0.5}
        shadow-camera-far={Math.max(180, extent.diagonal * 2.2)}
        shadow-bias={-0.00006}
        shadow-normalBias={0.035}
      />
      <directionalLight
        position={[extent.centerX + extent.width * 0.4, Math.max(24, extent.diagonal * 0.22), extent.centerZ - extent.depth * 0.3]}
        intensity={0.38}
        color="#d8e9ff"
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[extent.centerX, -0.08, extent.centerZ]}
        receiveShadow
        raycast={NO_RAYCAST}
      >
        <planeGeometry args={[extent.width + groundMargin, extent.depth + groundMargin]} />
        <meshStandardMaterial color="#cfdccc" roughness={1} metalness={0} />
      </mesh>
      <ReferenceUnderlay calibration={calibration} />
      <BatchedLots
        entries={lotEntries}
        selectedEntityId={selectedEntityId}
        hoveredEntityId={hoveredEntityId}
        matchingEntityIds={matchingEntityIds}
        filtersActive={filtersActive}
        layerOpacity={layerOpacity}
        onSelect={setSelectedEntityId}
        onHover={setHoveredEntityId}
        onFocus={focusSelection}
        cameraNavigating={cameraNavigating}
        onCursor={setCanvasCursor}
      />
      {nonLotEntities.map((entity) => (
        <EntityMesh
          key={entity.id}
          entity={entity}
          selected={selectedEntityId === entity.id}
          hovered={hoveredEntityId === entity.id}
          filtersActive={filtersActive}
          isMatch={matchingEntityIds.has(entity.id)}
          layerOpacity={layerOpacity[entity.layerId] ?? 1}
          sceneCenter={sceneCenter}
          cameraNavigating={cameraNavigating}
          onSelect={setSelectedEntityId}
          onHover={setHoveredEntityId}
          onFocus={focusSelection}
          onEnterInterior={enterInterior}
          onCursor={setCanvasCursor}
        />
      ))}
      {renderedEntities.filter((entity) => labelVisibility.ids.has(entity.id)).map((entity) => (
        <EntityLabel
          key={`label:${entity.id}`}
          entity={entity}
          lot={lotByEntity.get(entity.id)}
          selected={selectedEntityId === entity.id}
          hovered={hoveredEntityId === entity.id}
          filtersActive={filtersActive}
          isMatch={matchingEntityIds.has(entity.id)}
          level={labelVisibility.level}
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

export const CommercialMapCanvas = memo(function CommercialMapCanvas(props: CommercialMapCanvasProps) {
  const { entities, lots, calibration, matchingEntityIds, filtersActive } = props;
  const setSelectedEntityId = useCommercialMapStore((state) => state.setSelectedEntityId);
  const interiorEntityId = useCommercialMapStore((state) => state.interiorEntityId);
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
      frameloop="demand"
      camera={{
        position: initialCameraPosition.toArray(),
        fov: 38,
        near: Math.max(0.05, initialDistance / 1600),
        far: Math.max(720, extent.diagonal * 9),
      }}
      dpr={reducedGraphics ? [0.85, 1.2] : [1, 1.5]}
      shadows={!reducedGraphics}
      gl={{ antialias: !reducedGraphics, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 0.96;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          gl.domElement.style.cursor = 'grab';
        }}
      onPointerMissed={() => {
        if (!interiorEntityId) setSelectedEntityId(null);
      }}
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
});
