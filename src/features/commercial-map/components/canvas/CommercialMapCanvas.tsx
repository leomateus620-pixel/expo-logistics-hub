import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, Preload, useTexture } from '@react-three/drei';
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
import { selectCommercialTreesForScene } from '../../utils/treeLayer';
import { selectCommercialElectricalInfrastructureForScene } from '../../utils/electricalInfrastructure';
import { selectCommercialHydrologicalInfrastructureForScene } from '../../utils/hydrologicalInfrastructure';
import {
  HYDROLOGICAL_NODES,
  HYDROLOGICAL_PIPE_SEGMENTS,
  type CommercialHydrologicalNode,
  type CommercialHydrologicalPipeSegment,
} from '../../data/hydrologicalInfrastructure';
import {
  ARENA_FRONT_LAYOUT,
  shouldRenderArenaCourts,
  shouldRenderArenaStructures,
} from '../../data/parkEnvironment';
import {
  NATIONS_DISTRICT_REQUIRED_IDENTIFIERS,
  isNationsDistrictPresentationSurface,
  shouldRenderNationsDistrict,
} from '../../data/nationsDistrict';
import { COMMERCIAL_MAP_ENVIRONMENT_CONFIG } from '../../data/commercialMapEnvironment';
import {
  OPEN_GROUND_PRESENTATION_HEIGHT,
  openGroundTextureForEntity,
  resolveOpenGroundProfile,
} from './openGroundTextures';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
  strategicLandmarkFocusDirection,
  strategicLandmarkSupportsInterior,
  strategicLandmarkVisualHeight,
} from '../../utils/landmarks';
import {
  APOLLO_XIV_LAYOUT,
  treeRemainsVisibleWithSelectedApollo,
} from '../../utils/lunarMemorial';
import {
  labelBelongsToActiveMode,
  requiresSolidRendering,
  RESTROOM_PRESENTATION_LIFT,
  resolveGateAccessMode,
  resolveMapLabelCollisionBox,
  resolveMapLabelCollisionCenterY,
  resolveMarkerPresentationLift,
  resolveMapLabelMode,
  resolveStableMapLabelVisibility,
} from '../../utils/mapPresentation';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import {
  COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_DIRECTION,
  COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_FIT_PADDING,
  COMMERCIAL_MAP_MANUAL_NAVIGATION_REFIT_SUPPRESSION_MS,
  COMMERCIAL_MAP_MIN_POLAR_ANGLE,
  COMMERCIAL_MAP_RESIZE_REFIT_DEBOUNCE_MS,
  COMMERCIAL_MAP_TOP_DIRECTION,
  isCommercialMapHydrologicalPortraitViewport,
  resolveCommercialMapHydrologicalPortraitTargetShift,
  resolveCommercialMapPixelRatio,
  shouldSuppressCommercialMapResizeRefit,
} from '../../utils/viewport';
import type { CameraPreset, CommercialLot, MapCalibration, MapEntity } from '../../types';
import { HeadquartersInteriorScene } from './HeadquartersInteriorScene';
import { LivestockPavilionInteriorScene } from './LivestockPavilionInteriorScene';
import { RoadInfrastructure } from './RoadInfrastructure';
import { StrategicLandmarkMesh } from './StrategicLandmarks';
import { TechnicalValidationOverlay } from './TechnicalValidationOverlay';
import { CommercialTreeLayer } from './CommercialTreeLayer';
import { CommercialElectricalInfrastructureLayer } from './CommercialElectricalInfrastructureLayer';
import { ArenaFrontInfrastructure } from './ArenaFrontInfrastructure';
import { NationsDistrict } from './NationsDistrict';
import { CommercialMapEnvironment } from './CommercialMapEnvironment';
import { ParkAccessEnvironmentLayer } from './ParkAccessEnvironmentLayer';
import { ParkAccessInfrastructure } from './ParkAccessInfrastructure';
import { selectParkAccessCompatibleTreesForPresentation } from '../../data/parkAccessEnvironment';
import { PARK_ACCESS_SPATIAL_PLAN } from '../../data/parkAccessSpatialPlan';
import {
  COMMERCIAL_MAP_SEGMENT_IDS,
  buildCommercialMapSegmentIndex,
  getCommercialMapSegment,
  isSegmentTintClassification,
  type CommercialMapSegmentDefinition,
  type CommercialMapSegmentId,
} from '../../data/commercialMapSegments';
import {
  buildCommercialPavilionModuleVisualStateIndex,
  type CommercialPavilionModuleVisualState,
} from '../../utils/pavilionModuleCommercial';

const MiranteInteriorScene = lazy(async () => {
  const module = await import('./MiranteInteriorScene');
  return { default: module.MiranteInteriorScene };
});

const CommercialPavilionInteriorScene = lazy(async () => {
  const module = await import('./CommercialPavilionInteriorScene');
  return { default: module.CommercialPavilionInteriorScene };
});

const CommercialHydrologicalInfrastructureLayer = lazy(async () => {
  const module = await import('./CommercialHydrologicalInfrastructureLayer');
  return { default: module.CommercialHydrologicalInfrastructureLayer };
});

interface CommercialMapCanvasProps {
  entities: MapEntity[];
  lots: CommercialLot[];
  calibration: MapCalibration | null;
  matchingEntityIds: ReadonlySet<string>;
  filtersActive: boolean;
  isolatedArea?: CommercialMapSegmentId | null;
  segmentOverride?: CommercialMapSegmentDefinition | null;
  technicalValidationAllowed?: boolean;
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

const PAVILION_INTERIOR_TRANSITION_COVER_MS = 180;
const PAVILION_INTERIOR_TRANSITION_REVEAL_MS = 240;

interface PavilionInteriorTransitionState {
  phase: 'covering' | 'revealing';
  targetLabel: string;
}

function PavilionInteriorTransitionOverlay({
  transition,
}: {
  transition: PavilionInteriorTransitionState | null;
}) {
  if (!transition) return null;
  return (
    <Html
      fullscreen
      zIndexRange={[60, 40]}
      style={{ pointerEvents: 'auto' }}
    >
      <div
        className={`commercial-pavilion-view-transition is-${transition.phase}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span aria-hidden="true" />
        <small>Conexão interna</small>
        <strong>{transition.targetLabel}</strong>
      </div>
    </Html>
  );
}

const NO_RAYCAST = () => undefined;
const PRECISE_HOVER_CAPABLE = typeof window === 'undefined'
  || !window.matchMedia
  || window.matchMedia('(any-hover: hover) and (any-pointer: fine)').matches;
const LABEL_LEVEL_RANK: Record<MapLabelVisibility, number> = { far: 0, medium: 1, near: 2, detail: 3 };
const FAR_LABEL_PRIORITY_FLOOR = 94;
const MAP_BACKGROUND_COLOR = new THREE.Color('#dfe8de');
const AREA_NUMBER = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const SEGMENT_LOT_SURFACE_WEIGHT = 0.94;
const STATUS_MARK_LONG_RATIO = 0.34;
const STATUS_MARK_SHORT_RATIO = 0.09;
const DETAILED_PARK_ACCESS_GATE_HIT_AREAS = new Map<string, {
  width: number;
  depth: number;
  height: number;
  rotationRadians: number;
}>(
  Object.values(PARK_ACCESS_SPATIAL_PLAN.gates).map((gate) => [
    gate.officialEntityIdentifier,
    {
      width: gate.width * 1.08,
      depth: gate.depth * 1.7,
      height: 1.35,
      rotationRadians: Math.PI / 2 - gate.approachHeadingRadians,
    },
  ]),
);
const PARK_ACCESS_SURFACE_OWNER_IDENTIFIERS = [
  'AV-BENVENUTO-CONTI',
  'AV-TUPARENDI',
  'CALCADA-ARVOREDO',
] as const;
const PARK_ACCESS_ARCHITECTURE_OWNER_IDENTIFIERS = ['A1', 'A2', 'A3'] as const;
const PARK_ACCESS_SCENE_SUPPORT_POINTS = [
  ...PARK_ACCESS_SPATIAL_PLAN.roadSurfaces.flatMap((surface) => (
    surface.polygon.map((position) => ({ position }))
  )),
  ...PARK_ACCESS_SPATIAL_PLAN.roundabouts.flatMap((roundabout) => {
    const [x, z] = roundabout.center;
    const radius = roundabout.outerRadius;
    return [
      { position: [x - radius, z] as const },
      { position: [x + radius, z] as const },
      { position: [x, z - radius] as const },
      { position: [x, z + radius] as const },
    ];
  }),
] as const;

function parkAccessVisibleInArea(isolatedArea?: string | null) {
  return !isolatedArea || isolatedArea === COMMERCIAL_MAP_SEGMENT_IDS.industry;
}

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

function getSceneExtent(
  entities: MapEntity[],
  supportPoints: readonly { position: readonly [number, number]; height?: number }[] = [],
): SceneExtent {
  const hasSpatialContent = entities.length > 0 || supportPoints.length > 0;
  let minX = hasSpatialContent ? Number.POSITIVE_INFINITY : -MAP_REFERENCE_WIDTH / 2;
  let maxX = hasSpatialContent ? Number.NEGATIVE_INFINITY : MAP_REFERENCE_WIDTH / 2;
  let minZ = hasSpatialContent ? Number.POSITIVE_INFINITY : -MAP_REFERENCE_HEIGHT / 2;
  let maxZ = hasSpatialContent ? Number.NEGATIVE_INFINITY : MAP_REFERENCE_HEIGHT / 2;
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

  supportPoints.forEach(({ position: [x, z], height = 0 }) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
    maxHeight = Math.max(maxHeight, height);
  });

  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) {
    minX = -MAP_REFERENCE_WIDTH / 2;
    maxX = MAP_REFERENCE_WIDTH / 2;
    minZ = -MAP_REFERENCE_HEIGHT / 2;
    maxZ = MAP_REFERENCE_HEIGHT / 2;
  }
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
  if (landmark === 'fenasoja-event-center') {
    return { ...profile, contextRatio: 0.085, fitPadding: 1.32, minDistanceRatio: 0.06, maxDistanceRatio: 0.4, minimumDirectionY: 0.48 };
  }
  if (landmark === 'commercial-pavilion') {
    return { ...profile, contextRatio: 0.075, fitPadding: 1.24, minDistanceRatio: 0.06, maxDistanceRatio: 0.4, minimumDirectionY: 0.48 };
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
  if (landmark === 'african-pavilion' || landmark === 'rotary-house') {
    return { ...profile, contextRatio: 0.06, fitPadding: 1.22, minDistanceRatio: 0.05, maxDistanceRatio: 0.34, minimumDirectionY: 0.34 };
  }
  if (landmark === 'nations-square') {
    return { ...profile, contextRatio: 0.22, fitPadding: 1.4, minDistanceRatio: 0.16, maxDistanceRatio: 0.62, minimumDirectionY: 0.86 };
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

function ReferenceUnderlaySurface({
  calibration,
  imageUrl,
  opacity,
}: {
  calibration: MapCalibration | null;
  imageUrl: string;
  opacity: number;
}) {
  const gl = useThree((state) => state.gl);
  const texture = useTexture(imageUrl);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(16, gl.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
  }, [gl, texture]);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, -THREE.MathUtils.degToRad(calibration?.imageRotationDegrees ?? 0)]}
      position={[calibration?.imageOffsetX ?? 0, -0.035, calibration?.imageOffsetY ?? 0]}
      scale={[calibration?.imageScaleX ?? 1, calibration?.imageScaleY ?? 1, 1]}
      receiveShadow
      raycast={NO_RAYCAST}
    >
      <planeGeometry args={[MAP_REFERENCE_WIDTH, MAP_REFERENCE_HEIGHT]} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function ReferenceUnderlay({ calibration }: { calibration: MapCalibration | null }) {
  const referenceVisible = useCommercialMapStore((state) => state.referenceVisible);
  const referenceOpacity = useCommercialMapStore((state) => state.referenceOpacity);

  // Keep the text-baked calibration raster out of the loading/rendering path
  // until explicitly requested. Semantic navigation labels own the default view.
  if (!referenceVisible) return null;
  const imageUrl = calibration?.referenceImageUrl || calibration?.referenceImagePath || OFFICIAL_REFERENCE_IMAGE;
  return (
    <Suspense fallback={null}>
      <ReferenceUnderlaySurface calibration={calibration} imageUrl={imageUrl} opacity={referenceOpacity} />
    </Suspense>
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

function createEntityGeometry(entity: MapEntity, heightOverride?: number) {
  const shape = createEntityShape(entity);
  const classification = String(entity.classification);
  const surface = ['ROAD', 'PEDESTRIAN_PATH', 'GREEN_AREA', 'PARKING', 'WATER', 'QUADRA'].includes(classification);
  const height = heightOverride ?? (surface ? Math.max(0.018, Math.min(entity.geometry.extrusionHeight, 0.08)) : Math.max(0.025, entity.geometry.extrusionHeight));
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
  segment: CommercialMapSegmentDefinition | null;
  selected: boolean;
  hovered: boolean;
  filtersActive: boolean;
  infrastructureMode: boolean;
  nationsDistrictPresentationAvailable: boolean;
  isMatch: boolean;
  layerOpacity: number;
  sceneCenter: readonly [number, number];
  cameraNavigating: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onFocus: () => void;
  onEnterInterior: (id: string) => void;
  onCursor: (cursor: 'grab' | 'grabbing' | 'pointer') => void;
  moduleStateById?: ReadonlyMap<string, CommercialPavilionModuleVisualState>;
}

const GenericEntityMesh = memo(function GenericEntityMesh({
  entity,
  segment,
  selected,
  hovered,
  filtersActive,
  infrastructureMode,
  nationsDistrictPresentationAvailable,
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
  const isQuadra = classification === 'QUADRA' || entity.metadata.renderMode === 'outline';
  const isPavilion = classification === 'PAVILION';
  const isGate = classification === 'GATE';
  const detailedParkAccessHitArea = isGate
    ? DETAILED_PARK_ACCESS_GATE_HIT_AREAS.get(entity.publicIdentifier)
    : undefined;
  const usesDetailedParkAccessArchitecture = Boolean(detailedParkAccessHitArea);
  const isNationsPresentationSurface = nationsDistrictPresentationAvailable
    && isNationsDistrictPresentationSurface(entity);
  const isRestroom = classification === 'RESTROOM' || classification === 'CHEMICAL_RESTROOM';
  const isFlat = entity.geometry.extrusionHeight < 0.3 || isRoad || isQuadra || isNationsPresentationSurface;
  const isInteractive = isSelectableMapClassification(entity.classification);
  const solidRendering = requiresSolidRendering(entity.classification);
  // Presentation-only ground dressing for the large open fields (motor home
  // and test drive). The official geometry and support elevations are
  // untouched: only the rendered slab and its material change.
  const openGroundProfile = useMemo(
    () => resolveOpenGroundProfile(entity.publicIdentifier),
    [entity.publicIdentifier],
  );
  const openGroundTexture = useMemo(
    () => (openGroundProfile ? openGroundTextureForEntity(openGroundProfile) : null),
    [openGroundProfile],
  );
  const geometry = useMemo(
    () => isQuadra || isGate || isNationsPresentationSurface
      ? null
      : createEntityGeometry(entity, openGroundProfile ? OPEN_GROUND_PRESENTATION_HEIGHT : undefined),
    [entity, isGate, isNationsPresentationSurface, isQuadra, openGroundProfile],
  );
  const hitSurface = useMemo(
    () => isQuadra || isNationsPresentationSurface ? createHitSurfaceGeometry(entity) : null,
    [entity, isNationsPresentationSurface, isQuadra],
  );
  const edges = useMemo(() => geometry && !isRoad && !isPavilion ? new THREE.EdgesGeometry(geometry, 28) : null, [geometry, isPavilion, isRoad]);
  const roofOutline = useMemo(() => isPavilion ? createRoofOutlineGeometry(entity) : null, [entity, isPavilion]);
  const footprint = useMemo(
    () => isRoad || isQuadra || isNationsPresentationSurface ? createFootprintGeometry(entity) : null,
    [entity, isNationsPresentationSurface, isQuadra, isRoad],
  );
  const markerCenter = useMemo(() => geometryCentroid(entity.geometry), [entity.geometry]);
  const gateRotation = useMemo(() => Math.atan2(
    sceneCenter[0] - markerCenter[0],
    sceneCenter[1] - markerCenter[1],
  ), [markerCenter, sceneCenter]);
  const gateAccessMode = useMemo(() => resolveGateAccessMode(entity.name), [entity.name]);
  const baseColor = segment && isSegmentTintClassification(entity.classification)
    ? segment.palette.surface
    : CLASSIFICATION_COLORS[entity.classification] ?? '#78907d';
  const matched = Boolean(filtersActive && isMatch);
  const filterStrength = infrastructureMode
    ? 0.26
    : filtersActive && !isMatch && !selected
      ? 0.42
      : 1;
  const visualOpacity = selected ? Math.max(0.94, layerOpacity) : layerOpacity * filterStrength;
  const presentationLift = resolveMarkerPresentationLift(classification);
  const selectedLift = selected ? (isFlat ? 0.055 : 0.11) : 0;
  const displayColor = useMemo(() => {
    if (!solidRendering || selected) return baseColor;
    const strength = THREE.MathUtils.clamp(layerOpacity * filterStrength, 0, 1);
    return `#${new THREE.Color(baseColor).lerp(MAP_BACKGROUND_COLOR, (1 - strength) * 0.82).getHexString()}`;
  }, [baseColor, filterStrength, layerOpacity, selected, solidRendering]);
  const gateBaseColor = infrastructureMode
    ? '#607b7b'
    : selected
      ? '#e7bd37'
      : hovered
        ? '#256b43'
        : '#174c31';
  const gateAccentColor = infrastructureMode
    ? '#a7b9b5'
    : selected
      ? '#174c31'
      : '#e9c84b';
  const outlineGeometry = isNationsPresentationSurface
    ? selected || hovered ? footprint : null
    : isPavilion ? roofOutline : isRoad || isQuadra ? footprint : edges;
  const outlineColor = selected
    ? '#fff1a8'
    : hovered && isInteractive
      ? '#f0d36a'
      : isQuadra
        ? segment?.palette.edge ?? '#3f7b4d'
        : isRoad
          ? '#7c857f'
          : isPavilion
            ? segment?.palette.edge ?? '#21313a'
            : '#1f3327';
  const displayOutlineColor = useMemo(() => {
    if (!solidRendering || selected || hovered) return outlineColor;
    const strength = THREE.MathUtils.clamp(layerOpacity * filterStrength, 0, 1);
    return `#${new THREE.Color(outlineColor).lerp(MAP_BACKGROUND_COLOR, (1 - strength) * 0.82).getHexString()}`;
  }, [filterStrength, hovered, layerOpacity, outlineColor, selected, solidRendering]);
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
    ...(PRECISE_HOVER_CAPABLE ? {
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
    } : {}),
  } : { raycast: NO_RAYCAST };

  return (
    <group
      position={[0, entity.geometry.elevation + selectedLift + presentationLift, 0]}
      visible={!solidRendering || selected || layerOpacity > 0.015}
    >
      {!isQuadra && !isGate && !isNationsPresentationSurface && (
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
          {detailedParkAccessHitArea ? (
            <mesh
              position={[0, detailedParkAccessHitArea.height / 2, 0]}
              rotation={[0, detailedParkAccessHitArea.rotationRadians - gateRotation, 0]}
              {...interactionProps}
            >
              <boxGeometry args={[
                detailedParkAccessHitArea.width,
                detailedParkAccessHitArea.height,
                detailedParkAccessHitArea.depth,
              ]} />
              <meshBasicMaterial visible={false} />
            </mesh>
          ) : (
            <mesh position={[0, 0.55, 0]} {...interactionProps}>
              <cylinderGeometry args={[0.72, 0.72, 1.18, 10]} />
              <meshBasicMaterial visible={false} />
            </mesh>
          )}
          <group visible={!usesDetailedParkAccessArchitecture}>
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
        </group>
      )}

      {(isQuadra || isNationsPresentationSurface) && hitSurface && (
        <mesh geometry={hitSurface} position={[0, 0.003, 0]} {...interactionProps}>
          <meshBasicMaterial visible={false} />
        </mesh>
      )}

      {outlineGeometry && (
        <lineSegments
          geometry={outlineGeometry}
          position={[0, isRoad || isQuadra || isNationsPresentationSurface ? 0.004 : isPavilion ? 0 : 0.012, 0]}
          raycast={NO_RAYCAST}
          renderOrder={selected ? 4 : solidRendering ? 2 : 1}
        >
          <lineBasicMaterial
            color={displayOutlineColor}
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
        segment={props.segment}
        selected={props.selected}
        hovered={props.hovered}
        filtersActive={props.filtersActive}
        isMatch={props.isMatch}
        layerOpacity={props.layerOpacity}
        cameraNavigating={props.cameraNavigating}
        hoverEnabled={PRECISE_HOVER_CAPABLE}
        onSelect={props.onSelect}
        onHover={props.onHover}
        onFocus={props.onFocus}
        onEnterInterior={props.onEnterInterior}
        onCursor={props.onCursor}
        moduleStateById={props.moduleStateById}
      />
    );
  }
  return <GenericEntityMesh {...props} />;
});

interface LotEntry {
  entity: MapEntity;
  lot: CommercialLot;
}

function lotColor(
  entry: LotEntry,
  segment: CommercialMapSegmentDefinition | null,
  filtersActive: boolean,
  isMatch: boolean,
  selected: boolean,
  hovered: boolean,
  infrastructureMode = false,
) {
  const status = STATUS_CONFIG[entry.lot.status];
  const color = segment
    ? new THREE.Color(status.color).lerp(new THREE.Color(segment.palette.surface), SEGMENT_LOT_SURFACE_WEIGHT)
    : new THREE.Color(status.color);
  if (infrastructureMode) color.lerp(new THREE.Color('#c7d1cf'), 0.98);
  else if (filtersActive && !isMatch && !selected) color.lerp(new THREE.Color('#c7d1c9'), 0.76);
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

function SegmentLotAccents({
  entries,
  segmentByEntity,
  matchingEntityIds,
  filtersActive,
  layerOpacity,
}: {
  entries: LotEntry[];
  segmentByEntity: ReadonlyMap<string, CommercialMapSegmentDefinition>;
  matchingEntityIds: ReadonlySet<string>;
  filtersActive: boolean;
  layerOpacity: Record<string, number>;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const accents = useMemo(() => {
    const accentedEntries = entries.filter((entry) => segmentByEntity.has(entry.entity.id));
    if (accentedEntries.length === 0) return null;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.66,
      metalness: 0.04,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, accentedEntries.length);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();

    accentedEntries.forEach(({ entity }, index) => {
      const ring = withoutClosingPoint(entity.geometry.coordinates[0] ?? []);
      const xs = ring.map(([x]) => x);
      const zs = ring.map(([, z]) => z);
      const width = ring.length > 0
        ? Math.max(0.12, Math.max(...xs) - Math.min(...xs))
        : 0.12;
      const depth = ring.length > 0
        ? Math.max(0.12, Math.max(...zs) - Math.min(...zs))
        : 0.12;
      const horizontal = width >= depth;
      const [centerX, centerZ] = geometryCentroid(entity.geometry);
      position.set(
        centerX,
        entity.geometry.elevation + Math.max(0.025, entity.geometry.extrusionHeight) + 0.024,
        centerZ,
      );
      scale.set(
        horizontal ? Math.max(0.14, width * STATUS_MARK_LONG_RATIO) : Math.max(0.06, width * STATUS_MARK_SHORT_RATIO),
        0.028,
        horizontal ? Math.max(0.06, depth * STATUS_MARK_SHORT_RATIO) : Math.max(0.14, depth * STATUS_MARK_LONG_RATIO),
      );
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 3;
    return { accentedEntries, geometry, material, mesh };
  }, [entries, segmentByEntity]);

  useEffect(() => () => {
    accents?.mesh.dispose?.();
    accents?.geometry.dispose();
    accents?.material.dispose();
  }, [accents]);

  useEffect(() => {
    if (!accents) return;
    accents.accentedEntries.forEach(({ entity, lot }, index) => {
      const segment = segmentByEntity.get(entity.id)!;
      // Segment owns the lot surface; this roof band keeps commercial status visible as a second channel.
      const color = new THREE.Color(STATUS_CONFIG[lot.status].color)
        .lerp(new THREE.Color(segment.palette.accent), 0.08);
      if (filtersActive && !matchingEntityIds.has(entity.id)) color.lerp(MAP_BACKGROUND_COLOR, 0.86);
      accents.mesh.setColorAt(index, color);
    });
    if (accents.mesh.instanceColor) accents.mesh.instanceColor.needsUpdate = true;
    invalidate();
  }, [accents, filtersActive, invalidate, matchingEntityIds, segmentByEntity]);

  useEffect(() => {
    if (!accents) return;
    const opacity = entries.length > 0 ? (layerOpacity[entries[0].entity.layerId] ?? 1) : 1;
    accents.material.opacity = opacity;
    accents.material.transparent = opacity < 0.995;
    accents.material.depthWrite = opacity > 0.42;
    accents.material.needsUpdate = true;
    invalidate();
  }, [accents, entries, invalidate, layerOpacity]);

  return accents
    ? <primitive object={accents.mesh} raycast={NO_RAYCAST} dispose={null} />
    : null;
}

function BatchedLots({
  entries,
  selectedEntityId,
  hoveredEntityId,
  matchingEntityIds,
  filtersActive,
  infrastructureMode,
  layerOpacity,
  segmentByEntity,
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
  infrastructureMode: boolean;
  layerOpacity: Record<string, number>;
  segmentByEntity: ReadonlyMap<string, CommercialMapSegmentDefinition>;
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
      const segment = segmentByEntity.get(entry.entity.id) ?? null;
      mesh.setColorAt(batchId, lotColor(entry, segment, false, true, false, false));
      entityByBatchId.set(batchId, entry.entity.id);
      batchIdByEntity.set(entry.entity.id, batchId);

      const edgeGeometry = new THREE.EdgesGeometry(geometry, 28);
      const positions = edgeGeometry.getAttribute('position');
      const borderColor = segment
        ? new THREE.Color(segment.palette.edge).lerp(new THREE.Color(STATUS_CONFIG[entry.lot.status].border), 0.12)
        : new THREE.Color(STATUS_CONFIG[entry.lot.status].border);
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
  }, [entries, segmentByEntity]);

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
    batch.mesh.setColorAt(batchId, lotColor(
      entry,
      segmentByEntity.get(entityId) ?? null,
      filtersActive,
      matchingEntityIds.has(entityId),
      selected,
      hovered,
      infrastructureMode,
    ));
    matrix.makeTranslation(0, entry.entity.geometry.elevation + (selected ? 0.055 : hovered ? 0.035 : 0), 0);
    batch.mesh.setMatrixAt(batchId, matrix);
  }, [batch, entryByEntity, filtersActive, infrastructureMode, matchingEntityIds, segmentByEntity]);

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
      {!infrastructureMode ? (
        <SegmentLotAccents
          entries={entries}
          segmentByEntity={segmentByEntity}
          matchingEntityIds={matchingEntityIds}
          filtersActive={filtersActive}
          layerOpacity={layerOpacity}
        />
      ) : null}
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
        {...(PRECISE_HOVER_CAPABLE ? {
          onPointerMove: (event: ThreeEvent<PointerEvent>) => {
            event.stopPropagation();
            if (cameraNavigating) return;
            const entityId = resolveEntityId(event);
            if (entityId === hoveredRef.current) return;
            hoveredRef.current = entityId;
            onCursor(entityId ? 'pointer' : 'grab');
            onHover(entityId);
          },
          onPointerOut: () => {
            hoveredRef.current = null;
            onCursor(cameraNavigating ? 'grabbing' : 'grab');
            onHover(null);
          },
        } : {})}
      />
      <lineSegments geometry={batch.edgeGeometry} raycast={NO_RAYCAST}>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={Math.min(
            infrastructureMode ? 0.06 : 0.7,
            (entries.length > 0 ? layerOpacity[entries[0].entity.layerId] ?? 1 : 1)
              * (infrastructureMode ? 0.06 : filtersActive ? 0.46 : 0.7),
          )}
          toneMapped={false}
        />
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
}: {
  entity: MapEntity;
  lot?: CommercialLot;
  selected: boolean;
  hovered: boolean;
  filtersActive: boolean;
  isMatch: boolean;
}) {
  const metadata = useMemo(() => normalizeMapEntityMetadata(entity, lot), [entity, lot]);
  const classification = entity.classification;
  const isRoad = classification === 'ROAD' || classification === 'PEDESTRIAN_PATH';
  const isQuadra = classification === 'QUADRA' || entity.metadata.renderMode === 'outline';
  const isGate = classification === 'GATE';
  const isRestroom = classification === 'RESTROOM' || classification === 'CHEMICAL_RESTROOM';
  const isArchitecturalLandmark = Boolean(resolveStrategicLandmarkKind(entity));
  const dimmed = Boolean(lot && filtersActive && !isMatch && !selected);
  const status = lot ? STATUS_CONFIG[lot.status] : null;
  const labelHeight = entityLabelHeight(entity);

  return (
    <Html
      position={[metadata.labelAnchor[0], entity.geometry.elevation + labelHeight, metadata.labelAnchor[1]]}
      transform={false}
      eps={0.001}
      zIndexRange={[22, 2]}
      style={{ pointerEvents: 'none', transform: 'translate3d(-50%, -100%, 0)' }}
    >
      {lot ? (
        <div data-map-entity-id={entity.id} data-map-label-mode={selected ? 'focus' : 'navigation'} className={`commercial-map-label is-lot ${selected ? 'is-selected' : ''} ${dimmed ? 'is-dimmed' : ''}`}>
          <span aria-label={`Lote ${metadata.lotNumber ?? ''}`}>{metadata.lotNumber}</span>
          {(selected || hovered) && metadata.block && <strong>{quadraLabel(metadata.block)}</strong>}
          {(selected || hovered) && lot.officialAreaSqm && (
            <small className="commercial-map-label-area">{AREA_NUMBER.format(lot.officialAreaSqm)} m²</small>
          )}
          {(selected || hovered) && status && <small><b aria-hidden="true">{status.symbol}</b> {status.label}</small>}
        </div>
      ) : isRoad ? (
        <div data-map-entity-id={entity.id} data-map-label-mode={selected ? 'focus' : 'navigation'} className={`commercial-map-label is-road ${selected ? 'is-selected' : ''}`}><span>{metadata.officialDisplayName}</span></div>
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
  const stableLevel = useRef<MapLabelVisibility>('far');
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
    const level = resolveStableMapLabelVisibility(cameraDistance, extent.diagonal, stableLevel.current);
    stableLevel.current = level;
    const cameraSignature = [
      state.camera.position.x.toFixed(1), state.camera.position.y.toFixed(1), state.camera.position.z.toFixed(1),
      target.x.toFixed(1), target.z.toFixed(1), state.size.width, state.size.height,
      level, selectedEntityId, hoveredEntityId, labelsVisible, reducedGraphics, filtersActive, matchingSignature,
    ].join(':');
    if (cameraSignature === previousSignature.current) return;

    const mobile = state.size.width < 720 || state.size.height < 430;
    const cap = level === 'far'
      ? (mobile ? 3 : 4)
      : level === 'medium'
        ? (mobile ? 10 : 16)
        : level === 'near'
          ? (mobile ? 20 : 36)
          : (mobile ? 28 : 72);
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
        if (level === 'far' && metadata.labelPriority < FAR_LABEL_PRIORITY_FLOOR) return false;
        return LABEL_LEVEL_RANK[metadata.preferredLabelVisibility] <= currentRank;
      })
      .map((candidate) => {
        const point = candidate.position.clone().project(state.camera);
        const isLot = candidate.entity.classification === 'SELLABLE_LOT';
        const isRoad = candidate.entity.classification === 'ROAD' || candidate.entity.classification === 'PEDESTRIAN_PATH';
        const forced = candidate.entity.id === selectedEntityId || candidate.entity.id === hoveredEntityId;
        const expandedLot = isLot && forced;
        const nameLength = candidate.metadata.officialDisplayName.length;
        const collisionBox = resolveMapLabelCollisionBox(
          isLot ? 'lot' : isRoad ? 'road' : 'structure',
          nameLength,
          expandedLot,
        );
        const anchorY = (-point.y * 0.5 + 0.5) * viewportHeight;
        return {
          ...candidate,
          forced,
          visible: point.z >= -1 && point.z <= 1 && Math.abs(point.x) <= 1.08 && Math.abs(point.y) <= 1.08,
          x: (point.x * 0.5 + 0.5) * viewportWidth,
          y: resolveMapLabelCollisionCenterY(anchorY, collisionBox),
          width: collisionBox.width,
          height: collisionBox.height,
          priority: candidate.metadata.labelPriority
            + (forced ? 1000 : 0)
            + (matchingEntityIds.has(candidate.entity.id) ? 120 : 0)
            + (visibility.ids.has(candidate.entity.id) ? 12 : 0),
        };
      })
      .filter((candidate) => candidate.visible)
      .sort((left, right) => (
        right.priority - left.priority || left.entity.id.localeCompare(right.entity.id)
      ));

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

function CameraRig({
  selectedEntity,
  extent,
  isolatedArea,
  activeSegment,
  activeSegmentEntities,
  hydrologicalModeActive,
}: {
  selectedEntity: MapEntity | null;
  extent: SceneExtent;
  isolatedArea?: CommercialMapSegmentId | null;
  activeSegment: CommercialMapSegmentDefinition | null;
  activeSegmentEntities: MapEntity[];
  hydrologicalModeActive: boolean;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);
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
  const previousSegment = useRef(activeSegment?.id ?? null);
  const previousDetailsLayout = useRef(activePanel === 'details');
  const returnView = useRef(useCommercialMapStore.getState().interiorReturnView);
  const previousViewportSize = useRef({ width: size.width, height: size.height });
  const resizeRefitTimer = useRef<number | null>(null);
  const pendingResizeRefit = useRef(false);
  const resizeRefitSuppressedUntil = useRef(0);
  const resizeRefitView = useRef<() => void>(() => undefined);
  const startCameraMove = useCallback(() => {
    animating.current = true;
    invalidate();
  }, [invalidate]);

  const queuePreset = useCallback((nextPreset: CameraPreset) => {
    const perspective = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(size.height, 1);
    const config = CAMERA_PRESETS[nextPreset];
    const hydrologicalPortraitOverview = hydrologicalModeActive
      && nextPreset === 'overview'
      && isCommercialMapHydrologicalPortraitViewport(size.width, size.height);
    const useFullExtent = nextPreset === 'overview'
      || nextPreset === 'top'
      || nextPreset === 'isometric'
      || nextPreset === 'exporural';
    const lookAt = useFullExtent
      ? new THREE.Vector3(extent.centerX, Math.min(extent.maxHeight * 0.12, 1.2), extent.centerZ)
      : new THREE.Vector3(...config.target);
    const configuredDirection = new THREE.Vector3(...config.position).sub(new THREE.Vector3(...config.target));
    const direction = nextPreset === 'overview'
      ? new THREE.Vector3(...(
          hydrologicalPortraitOverview
            ? COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_DIRECTION
            : [0.04, 0.72, 0.69] as const
        ))
      : nextPreset === 'top'
        ? new THREE.Vector3(...COMMERCIAL_MAP_TOP_DIRECTION)
        : nextPreset === 'isometric'
          ? new THREE.Vector3(0.64, 0.58, 0.64)
          : configuredDirection;
    direction.normalize();
    const fullDistance = fitDistanceForDirection(
      extent,
      perspective.fov || 38,
      aspect,
      direction,
      nextPreset === 'top'
        ? 1.08
        : nextPreset === 'isometric'
          ? 0.92
          : nextPreset === 'exporural'
            ? 1.02
            : hydrologicalPortraitOverview
              ? COMMERCIAL_MAP_HYDROLOGICAL_PORTRAIT_FIT_PADDING
              : 1.1,
    );
    const focusScale = nextPreset === 'quadra-r'
      ? 0.62
      : nextPreset === 'quadra-s'
        ? 0.48
        : nextPreset === 'semear'
          ? 0.28
          : 1;
    const distance = Math.max(11, fullDistance * focusScale);
    if (hydrologicalPortraitOverview) {
      const horizontalDirection = new THREE.Vector3(direction.x, 0, direction.z).normalize();
      lookAt.addScaledVector(
        horizontalDirection,
        resolveCommercialMapHydrologicalPortraitTargetShift(extent.diagonal),
      );
    }
    targetLookAt.current.copy(lookAt);
    targetPosition.current.copy(lookAt).add(direction.multiplyScalar(distance));
    perspective.fov = 38;
    perspective.near = Math.max(0.05, distance / 1600);
    perspective.far = Math.max(720, extent.diagonal * 9, distance * 4);
    perspective.updateProjectionMatrix();
    startCameraMove();
  }, [camera, extent, hydrologicalModeActive, size.height, size.width, startCameraMove]);

  const queueSelection = useCallback((entity: MapEntity) => {
    const perspective = camera as THREE.PerspectiveCamera;
    const entityExtent = getEntityExtent(entity);
    const focusProfile = focusProfileForEntity(entity);
    const landmarkKind = resolveStrategicLandmarkKind(entity);
    const hasDetailsPanel = activePanel === 'details';
    const sidePanelLayout = hasDetailsPanel && size.width > 900;
    const panelWidth = sidePanelLayout ? Math.min(380, size.width * 0.54) : 0;
    const usableWidth = Math.max(size.width - panelWidth, size.width * 0.48);
    const usableHeight = size.height;
    const aspect = usableWidth / Math.max(usableHeight, 1);
    const compactSidePanelMirante = landmarkKind === 'mirante-pavilion'
      && panelWidth > 0
      && usableWidth < 420;
    const entityCenter = new THREE.Vector3(
      entityExtent.centerX,
      entity.geometry.elevation + entityExtent.maxHeight * 0.28,
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
    const distance = compactSidePanelMirante
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
    }
    targetLookAt.current.copy(lookAt);
    targetPosition.current.copy(lookAt).add(direction.multiplyScalar(distance));
    perspective.fov = 38;
    perspective.near = Math.max(0.035, distance / 1600);
    perspective.far = Math.max(720, extent.diagonal * 9);
    perspective.updateProjectionMatrix();
    startCameraMove();
  }, [activePanel, camera, extent, size.height, size.width, startCameraMove]);

  const queueSegment = useCallback((segment: CommercialMapSegmentDefinition, segmentEntities: MapEntity[]) => {
    if (segmentEntities.length === 0) {
      queuePreset(preset);
      return;
    }
    const perspective = camera as THREE.PerspectiveCamera;
    const segmentExtent = getSceneExtent(segmentEntities);
    const aspect = size.width / Math.max(size.height, 1);
    const direction = preset === 'top'
      ? new THREE.Vector3(...COMMERCIAL_MAP_TOP_DIRECTION)
      : preset === 'isometric'
        ? new THREE.Vector3(0.64, 0.58, 0.64)
        : new THREE.Vector3(...segment.camera.direction);
    direction.normalize();
    const lookAt = new THREE.Vector3(
      segmentExtent.centerX,
      Math.min(segmentExtent.maxHeight * 0.16, 1.4),
      segmentExtent.centerZ,
    );
    const fittedDistance = fitDistanceForDirection(
      segmentExtent,
      perspective.fov || 38,
      aspect,
      direction,
      segment.camera.padding * (preset === 'top' ? 1.04 : preset === 'isometric' ? 0.96 : 1),
    );
    const distance = THREE.MathUtils.clamp(
      fittedDistance,
      Math.max(10, segmentExtent.diagonal * segment.camera.minDistanceRatio),
      Math.max(72, segmentExtent.diagonal * segment.camera.maxDistanceRatio),
    );
    targetLookAt.current.copy(lookAt);
    targetPosition.current.copy(lookAt).add(direction.multiplyScalar(distance));
    perspective.fov = 38;
    perspective.near = Math.max(0.04, distance / 1600);
    perspective.far = Math.max(720, extent.diagonal * 9, distance * 4);
    perspective.updateProjectionMatrix();
    startCameraMove();
  }, [camera, extent.diagonal, preset, queuePreset, size.height, size.width, startCameraMove]);

  resizeRefitView.current = () => {
    if (selectedEntity) queueSelection(selectedEntity);
    else if (activeSegment) queueSegment(activeSegment, activeSegmentEntities);
    else queuePreset(preset);
  };

  const cancelScheduledResizeRefit = useCallback(() => {
    if (resizeRefitTimer.current === null) return;
    window.clearTimeout(resizeRefitTimer.current);
    resizeRefitTimer.current = null;
  }, []);

  const scheduleResizeRefit = useCallback(() => {
    if (shouldSuppressCommercialMapResizeRefit(Date.now(), resizeRefitSuppressedUntil.current)) {
      pendingResizeRefit.current = false;
      cancelScheduledResizeRefit();
      return;
    }
    pendingResizeRefit.current = true;
    cancelScheduledResizeRefit();
    if (navigation.current.active) return;

    const runRefit = () => {
      resizeRefitTimer.current = null;
      if (navigation.current.active) return;
      if (shouldSuppressCommercialMapResizeRefit(Date.now(), resizeRefitSuppressedUntil.current)) {
        pendingResizeRefit.current = false;
        return;
      }

      const detailSheetDragging = gl.domElement
        .closest('.commercial-map-viewport')
        ?.classList.contains('is-detail-sheet-dragging') ?? false;
      if (detailSheetDragging) {
        resizeRefitTimer.current = window.setTimeout(
          runRefit,
          COMMERCIAL_MAP_RESIZE_REFIT_DEBOUNCE_MS,
        );
        return;
      }

      pendingResizeRefit.current = false;
      resizeRefitView.current();
    };

    resizeRefitTimer.current = window.setTimeout(
      runRefit,
      COMMERCIAL_MAP_RESIZE_REFIT_DEBOUNCE_MS,
    );
  }, [cancelScheduledResizeRefit, gl]);

  useEffect(() => {
    const selectedId = selectedEntity?.id ?? null;
    const selectionChanged = selectedId !== previousSelection.current;
    const segmentId = activeSegment?.id ?? null;
    const segmentChanged = segmentId !== previousSegment.current;
    const presetChanged = preset !== previousPreset.current;
    const sequenceChanged = cameraSequence !== previousSequence.current;
    const detailsLayoutChanged = (activePanel === 'details') !== previousDetailsLayout.current;

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
      else if (activeSegment) queueSegment(activeSegment, activeSegmentEntities);
      else queuePreset(preset);
      initialized.current = true;
    } else if (presetChanged) {
      if (activeSegment) queueSegment(activeSegment, activeSegmentEntities);
      else queuePreset(preset);
    } else if (segmentChanged) {
      if (activeSegment) queueSegment(activeSegment, activeSegmentEntities);
      else queuePreset(preset);
    } else if (sequenceChanged) {
      if (selectedEntity) queueSelection(selectedEntity);
      else if (activeSegment) queueSegment(activeSegment, activeSegmentEntities);
      else queuePreset(preset);
    } else if (selectionChanged && selectedEntity) {
      queueSelection(selectedEntity);
    } else if (selectionChanged && !selectedEntity) {
      animating.current = false;
    } else if (detailsLayoutChanged && selectedEntity) {
      queueSelection(selectedEntity);
    }

    previousSelection.current = selectedId;
    previousPreset.current = preset;
    previousSequence.current = cameraSequence;
    previousSegment.current = segmentId;
    previousDetailsLayout.current = activePanel === 'details';
  }, [
    activePanel,
    activeSegment,
    activeSegmentEntities,
    camera,
    cameraSequence,
    extent.diagonal,
    invalidate,
    preset,
    queuePreset,
    queueSegment,
    queueSelection,
    selectedEntity,
  ]);

  useEffect(() => {
    const previous = previousViewportSize.current;
    const resized = Math.abs(previous.width - size.width) >= 2
      || Math.abs(previous.height - size.height) >= 2;

    if (!resized || !initialized.current) return undefined;
    previousViewportSize.current = { width: size.width, height: size.height };

    scheduleResizeRefit();
    return undefined;
  }, [
    scheduleResizeRefit,
    size.height,
    size.width,
  ]);

  const clampTarget = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const margin = isolatedArea
      ? Math.max(1.6, extent.diagonal * 0.035)
      : Math.max(3, extent.diagonal * 0.08);
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
  }, [extent, isolatedArea, selectedEntity]);

  const handleControlsStart = useCallback(() => {
    const controls = controlsRef.current;
    cancelScheduledResizeRefit();
    animating.current = false;
    navigation.current.active = true;
    navigation.current.navigating = false;
    navigation.current.startPosition.copy(camera.position);
    navigation.current.startTarget.copy(controls?.target ?? targetLookAt.current);
  }, [camera, cancelScheduledResizeRefit]);

  const handleControlsChange = useCallback(() => {
    const controls = controlsRef.current;
    clampTarget();
    if (controls && navigation.current.active) {
      const cameraDelta = camera.position.distanceTo(navigation.current.startPosition);
      const targetDelta = controls.target.distanceTo(navigation.current.startTarget);
      if (isCameraNavigationMovement(cameraDelta, targetDelta)) {
        resizeRefitSuppressedUntil.current = Date.now()
          + COMMERCIAL_MAP_MANUAL_NAVIGATION_REFIT_SUPPRESSION_MS;
        pendingResizeRefit.current = false;
        cancelScheduledResizeRefit();
        if (!navigation.current.navigating) {
          navigation.current.navigating = true;
          setCameraNavigating(true);
          gl.domElement.style.cursor = 'grabbing';
        }
      }
    }
    invalidate();
  }, [camera, cancelScheduledResizeRefit, clampTarget, gl, invalidate, setCameraNavigating]);

  const handleControlsEnd = useCallback(() => {
    const wasNavigating = navigation.current.navigating;
    navigation.current.active = false;
    navigation.current.navigating = false;
    if (wasNavigating) {
      setCameraNavigating(false);
      gl.domElement.style.cursor = 'grab';
    }
    if (pendingResizeRefit.current && !wasNavigating) scheduleResizeRefit();
    else pendingResizeRefit.current = false;
    invalidate();
  }, [gl, invalidate, scheduleResizeRefit, setCameraNavigating]);

  useEffect(() => () => {
    cancelScheduledResizeRefit();
    pendingResizeRefit.current = false;
    resizeRefitSuppressedUntil.current = 0;
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
  }, [camera, cancelScheduledResizeRefit, gl, setCameraNavigating]);

  useFrame((_state, delta) => {
    if (animating.current) {
      const factor = 1 - Math.exp(-delta * 5.4);
      camera.position.lerp(targetPosition.current, factor);
      if (controlsRef.current) {
        controlsRef.current.target.lerp(targetLookAt.current, factor);
        clampTarget();
        controlsRef.current.update();
      }
      if (camera.position.distanceTo(targetPosition.current) < 0.006
        && (!controlsRef.current || controlsRef.current.target.distanceTo(targetLookAt.current) < 0.004)) {
        camera.position.copy(targetPosition.current);
        controlsRef.current?.target.copy(targetLookAt.current);
        controlsRef.current?.update();
        animating.current = false;
      } else {
        invalidate();
      }
    }
  });

  const selectedKind = selectedEntity ? resolveStrategicLandmarkKind(selectedEntity) : null;
  const miranteSelected = selectedKind === 'mirante-pavilion';
  const miranteExtent = miranteSelected && selectedEntity ? getEntityExtent(selectedEntity) : null;
  const segmentExtent = activeSegment && activeSegmentEntities.length > 0
    ? getSceneExtent(activeSegmentEntities)
    : null;
  const miranteMinimumDistance = miranteExtent
    ? Math.max(7.5, miranteExtent.diagonal * 0.8)
    : segmentExtent && activeSegment
      ? Math.max(6.5, segmentExtent.diagonal * activeSegment.camera.minDistanceRatio)
    : isolatedArea
      ? Math.max(6.5, extent.diagonal * 0.12)
      : Math.max(8, extent.diagonal * 0.055);
  const miranteMaximumDistance = miranteExtent
    ? Math.max(30, miranteExtent.diagonal * 4)
    : segmentExtent && activeSegment
      ? Math.max(96, segmentExtent.diagonal * activeSegment.camera.maxDistanceRatio)
    : isolatedArea
      ? Math.max(96, extent.diagonal * 2.15)
      : Math.max(260, extent.diagonal * 4.5);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.072}
      enablePan
      enableRotate
      enableZoom
      minDistance={miranteMinimumDistance}
      maxDistance={miranteMaximumDistance}
      minPolarAngle={COMMERCIAL_MAP_MIN_POLAR_ANGLE}
      maxPolarAngle={Math.PI / 2.08}
      screenSpacePanning={false}
      zoomToCursor={!miranteSelected}
      touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
      minAzimuthAngle={miranteSelected ? -2.65 : -Infinity}
      maxAzimuthAngle={miranteSelected ? -0.9 : Infinity}
      onStart={handleControlsStart}
      onEnd={handleControlsEnd}
      onChange={handleControlsChange}
    />
  );
}

function Scene({
  entities,
  lots,
  calibration,
  matchingEntityIds,
  filtersActive,
  isolatedArea,
  segmentOverride,
  technicalValidationAllowed = false,
}: CommercialMapCanvasProps) {
  const selectedEntityId = useCommercialMapStore((state) => state.selectedEntityId);
  const interiorEntityId = useCommercialMapStore((state) => state.interiorEntityId);
  const hoveredEntityId = useCommercialMapStore((state) => state.hoveredEntityId);
  const setSelectedEntityId = useCommercialMapStore((state) => state.setSelectedEntityId);
  const setHoveredEntityId = useCommercialMapStore((state) => state.setHoveredEntityId);
  const focusSelection = useCommercialMapStore((state) => state.focusSelection);
  const enterInterior = useCommercialMapStore((state) => state.enterInterior);
  const switchInterior = useCommercialMapStore((state) => state.switchInterior);
  const labelsVisible = useCommercialMapStore((state) => state.labelsVisible);
  const treesVisible = useCommercialMapStore((state) => state.treesVisible);
  const hydrologicalModeActive = useCommercialMapStore((state) => state.hydrologicalModeActive);
  const setSelectedHydrologicalElementId = useCommercialMapStore(
    (state) => state.setSelectedHydrologicalElementId,
  );
  const layerVisibility = useCommercialMapStore((state) => state.layerVisibility);
  const layerOpacity = useCommercialMapStore((state) => state.layerOpacity);
  const reducedGraphics = useCommercialMapStore((state) => state.reducedGraphics);
  const cameraNavigating = useCommercialMapStore((state) => state.cameraNavigating);
  const technicalValidationVisible = useCommercialMapStore((state) => state.technicalValidationVisible);
  const activeSegmentId = useCommercialMapStore((state) => state.activeSegmentId);
  const [pavilionInteriorTransition, setPavilionInteriorTransition] = useState<
    PavilionInteriorTransitionState | null
  >(null);
  const pavilionTransitionTimer = useRef<number | null>(null);
  const pavilionTransitionFrame = useRef<number | null>(null);
  const pavilionTransitionActive = useRef(false);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const setCanvasCursor = useCallback((cursor: 'grab' | 'grabbing' | 'pointer') => {
    gl.domElement.style.cursor = cursor;
  }, [gl]);
  const sceneElectricalInfrastructure = useMemo(
    () => selectCommercialElectricalInfrastructureForScene(entities, lots),
    [entities, lots],
  );
  const sceneHydrologicalInfrastructure = useMemo(
    () => selectCommercialHydrologicalInfrastructureForScene(
      HYDROLOGICAL_NODES,
      HYDROLOGICAL_PIPE_SEGMENTS,
      entities,
    ),
    [entities],
  );
  const extent = useMemo(
    () => getSceneExtent(
      entities,
      [
        ...(parkAccessVisibleInArea(isolatedArea) ? PARK_ACCESS_SCENE_SUPPORT_POINTS : []),
        ...(hydrologicalModeActive
          ? [...sceneElectricalInfrastructure.nodes, ...sceneHydrologicalInfrastructure.nodes]
          : sceneElectricalInfrastructure.nodes),
      ],
    ),
    [
      entities,
      hydrologicalModeActive,
      isolatedArea,
      sceneElectricalInfrastructure.nodes,
      sceneHydrologicalInfrastructure.nodes,
    ],
  );
  const sceneCenter = useMemo(() => [extent.centerX, extent.centerZ] as const, [extent.centerX, extent.centerZ]);
  const presentedMatchingEntityIds = useMemo(
    () => hydrologicalModeActive ? new Set<string>() : matchingEntityIds,
    [hydrologicalModeActive, matchingEntityIds],
  );
  const entityFiltersActive = filtersActive || hydrologicalModeActive;
  const handleEntitySelect = useCallback((entityId: string) => {
    if (!hydrologicalModeActive) setSelectedEntityId(entityId);
  }, [hydrologicalModeActive, setSelectedEntityId]);
  const handleEntityHover = useCallback((entityId: string | null) => {
    if (!hydrologicalModeActive) setHoveredEntityId(entityId);
  }, [hydrologicalModeActive, setHoveredEntityId]);
  const handleEntityFocus = useCallback(() => {
    if (!hydrologicalModeActive) focusSelection();
  }, [focusSelection, hydrologicalModeActive]);
  const clearPavilionTransitionSchedule = useCallback(() => {
    if (pavilionTransitionTimer.current !== null) {
      window.clearTimeout(pavilionTransitionTimer.current);
      pavilionTransitionTimer.current = null;
    }
    if (pavilionTransitionFrame.current !== null) {
      window.cancelAnimationFrame(pavilionTransitionFrame.current);
      pavilionTransitionFrame.current = null;
    }
    pavilionTransitionActive.current = false;
  }, []);
  const handlePavilionInteriorNavigate = useCallback((targetEntityId: string) => {
    if (pavilionTransitionActive.current || targetEntityId === interiorEntityId) return;
    const sourceInteriorEntityId = interiorEntityId;
    if (!sourceInteriorEntityId) return;
    const targetEntity = entities.find((candidate) => (
      candidate.id === targetEntityId
      && resolveStrategicLandmarkKind(candidate) === 'commercial-pavilion'
    ));
    if (!targetEntity) return;

    const prefersReducedMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedGraphics || prefersReducedMotion) {
      switchInterior(targetEntityId);
      return;
    }

    const targetLabel = targetEntity.name.match(/^Pavilhão\s+\d+/i)?.[0]
      ?? targetEntity.name;
    pavilionTransitionActive.current = true;
    setPavilionInteriorTransition({ phase: 'covering', targetLabel });
    pavilionTransitionTimer.current = window.setTimeout(() => {
      if (
        !pavilionTransitionActive.current
        || useCommercialMapStore.getState().interiorEntityId !== sourceInteriorEntityId
      ) {
        clearPavilionTransitionSchedule();
        setPavilionInteriorTransition(null);
        return;
      }
      switchInterior(targetEntityId);
      pavilionTransitionTimer.current = null;
      pavilionTransitionFrame.current = window.requestAnimationFrame(() => {
        if (useCommercialMapStore.getState().interiorEntityId !== targetEntityId) {
          clearPavilionTransitionSchedule();
          setPavilionInteriorTransition(null);
          return;
        }
        pavilionTransitionFrame.current = null;
        setPavilionInteriorTransition({ phase: 'revealing', targetLabel });
        pavilionTransitionTimer.current = window.setTimeout(() => {
          pavilionTransitionTimer.current = null;
          pavilionTransitionActive.current = false;
          setPavilionInteriorTransition(null);
        }, PAVILION_INTERIOR_TRANSITION_REVEAL_MS);
      });
    }, PAVILION_INTERIOR_TRANSITION_COVER_MS);
  }, [clearPavilionTransitionSchedule, entities, interiorEntityId, reducedGraphics, switchInterior]);
  const handleHydrologicalSelect = useCallback((
    element: CommercialHydrologicalNode | CommercialHydrologicalPipeSegment,
  ) => {
    setSelectedHydrologicalElementId(element.id);
  }, [setSelectedHydrologicalElementId]);
  const lotByEntity = useMemo(() => new Map(lots.map((lot) => [lot.entityId, lot])), [lots]);
  const resolvedSegmentByEntity = useMemo(
    () => buildCommercialMapSegmentIndex(entities, lots),
    [entities, lots],
  );
  const requestedSegment = segmentOverride?.id === activeSegmentId
    ? segmentOverride
    : getCommercialMapSegment(activeSegmentId);
  const activeSegment = requestedSegment?.behavior.interaction === 'filter-and-focus'
    ? requestedSegment
    : null;
  const segmentByEntity = useMemo(() => {
    if ([...resolvedSegmentByEntity.values()].every((segment) => segment.behavior.visibleByDefault)) {
      return resolvedSegmentByEntity;
    }
    return new Map(
      [...resolvedSegmentByEntity].filter(([, segment]) => (
        segment.behavior.visibleByDefault || segment.id === activeSegmentId
      )),
    );
  }, [activeSegmentId, resolvedSegmentByEntity]);
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
  const commercialPavilionIdentity = useMemo(() => {
    const pavilionEntities = entities.filter((entity) => (
      resolveStrategicLandmarkKind(entity) === 'commercial-pavilion'
    ));
    return {
      ids: new Set(pavilionEntities.map((entity) => entity.id)),
      publicIdentifiers: new Set(pavilionEntities.map((entity) => (
        entity.publicIdentifier.trim().toLocaleUpperCase('pt-BR')
      ))),
    };
  }, [entities]);
  const exteriorRenderedEntities = useMemo(() => renderedEntities.filter((entity) => {
    if (entity.classification !== 'INTERNAL_STAND') return true;
    if (entity.parentEntityId && commercialPavilionIdentity.ids.has(entity.parentEntityId)) {
      return false;
    }
    const metadataPavilion = typeof entity.metadata.pavilionPublicIdentifier === 'string'
      ? entity.metadata.pavilionPublicIdentifier.trim().toLocaleUpperCase('pt-BR')
      : null;
    if (metadataPavilion && commercialPavilionIdentity.publicIdentifiers.has(metadataPavilion)) {
      return false;
    }
    const publicIdentifier = entity.publicIdentifier.trim().toLocaleUpperCase('pt-BR');
    return ![...commercialPavilionIdentity.publicIdentifiers].some((pavilionIdentifier) => (
      new RegExp(`^${pavilionIdentifier}-M\\d{3}$`).test(publicIdentifier)
    ));
  }), [commercialPavilionIdentity, renderedEntities]);
  const selectedPavilionModuleState = useMemo(() => {
    const pavilion = entities.find((entity) => entity.id === selectedEntityId);
    if (!pavilion || resolveStrategicLandmarkKind(pavilion) !== 'commercial-pavilion') {
      return new Map<string, CommercialPavilionModuleVisualState>();
    }
    return buildCommercialPavilionModuleVisualStateIndex(pavilion, entities, lots);
  }, [entities, lots, selectedEntityId]);
  const lotEntries = useMemo(() => exteriorRenderedEntities
    .map((entity) => ({ entity, lot: lotByEntity.get(entity.id) }))
    .filter((entry): entry is LotEntry => Boolean(entry.lot)), [exteriorRenderedEntities, lotByEntity]);
  const nonLotEntities = useMemo(() => exteriorRenderedEntities.filter((entity) => (
    !lotByEntity.has(entity.id)
  )), [exteriorRenderedEntities, lotByEntity]);
  const circulationEntities = useMemo(() => nonLotEntities.filter((entity) => (
    entity.classification === 'ROAD' || entity.classification === 'PEDESTRIAN_PATH'
  )), [nonLotEntities]);
  const structuralEntities = useMemo(() => nonLotEntities.filter((entity) => (
    entity.classification !== 'ROAD' && entity.classification !== 'PEDESTRIAN_PATH'
  )), [nonLotEntities]);
  const sceneTrees = useMemo(
    () => selectCommercialTreesForScene(entities, lots),
    [entities, lots],
  );
  const presentedSceneTrees = useMemo(() => {
    const parkAccessCompatibleTrees = (!isolatedArea
      || isolatedArea === COMMERCIAL_MAP_SEGMENT_IDS.industry)
      ? selectParkAccessCompatibleTreesForPresentation(sceneTrees)
      : sceneTrees;
    if (!selectedEntity || resolveStrategicLandmarkKind(selectedEntity) !== 'lunar-tree') {
      return parkAccessCompatibleTrees;
    }
    const bounds = strategicLandmarkBounds(selectedEntity);
    const memorialCenter = [
      bounds.centerX + APOLLO_XIV_LAYOUT.replicaOffset[0],
      bounds.centerZ + APOLLO_XIV_LAYOUT.replicaOffset[1],
    ] as const;
    return parkAccessCompatibleTrees.filter((tree) => (
      treeRemainsVisibleWithSelectedApollo(tree, memorialCenter)
    ));
  }, [isolatedArea, sceneTrees, selectedEntity]);
  const parkAccessPresentation = useMemo(() => {
    const enabledForScope = !isolatedArea
      || isolatedArea === COMMERCIAL_MAP_SEGMENT_IDS.industry;
    const resolveOwners = (identifiers: readonly string[]) => {
      if (!enabledForScope) return { visible: false, opacity: 0 };
      const identifierSet = new Set<string>(identifiers);
      const owners = entities.filter((entity) => identifierSet.has(entity.publicIdentifier));
      if (owners.some((entity) => layerVisibility[entity.layerId] === false)) {
        return { visible: false, opacity: 0 };
      }
      const filterStrength = entityFiltersActive
        && owners.length > 0
        && !owners.some((entity) => presentedMatchingEntityIds.has(entity.id))
        ? 0.28
        : 1;
      const opacity = owners.length > 0
        ? Math.min(...owners.map((entity) => layerOpacity[entity.layerId] ?? 1)) * filterStrength
        : 1;
      return { visible: opacity > 0.015, opacity };
    };
    return {
      surfaces: resolveOwners(PARK_ACCESS_SURFACE_OWNER_IDENTIFIERS),
      architecture: resolveOwners(PARK_ACCESS_ARCHITECTURE_OWNER_IDENTIFIERS),
    };
  }, [
    entities,
    entityFiltersActive,
    isolatedArea,
    layerOpacity,
    layerVisibility,
    presentedMatchingEntityIds,
  ]);
  const arenaFrontInfrastructurePresentation = useMemo(() => {
    const entityByIdentifier = new Map(entities.map((entity) => [entity.publicIdentifier, entity]));
    const resolvePresentation = (
      canRender: boolean,
      ownerIdentifiers: readonly string[],
    ) => {
      const owners = ownerIdentifiers
        .map((identifier) => entityByIdentifier.get(identifier))
        .filter((entity): entity is MapEntity => Boolean(entity));
      if (
        !canRender
        || owners.length !== ownerIdentifiers.length
        || owners.some((entity) => layerVisibility[entity.layerId] === false)
      ) return { visible: false, opacity: 0 };
      const filterStrength = entityFiltersActive
        && !owners.some((entity) => presentedMatchingEntityIds.has(entity.id))
        ? 0.28
        : 1;
      const opacity = Math.min(...owners.map((entity) => layerOpacity[entity.layerId] ?? 1)) * filterStrength;
      return { visible: opacity > 0.015, opacity };
    };
    return {
      arenaStructures: resolvePresentation(
        shouldRenderArenaStructures(entities),
        ARENA_FRONT_LAYOUT.arenaStructureOwners,
      ),
      courts: resolvePresentation(
        shouldRenderArenaCourts(entities),
        ARENA_FRONT_LAYOUT.courtOwners,
      ),
    };
  }, [entities, entityFiltersActive, layerOpacity, layerVisibility, presentedMatchingEntityIds]);
  const nationsDistrictPresentationAvailable = useMemo(
    () => shouldRenderNationsDistrict(entities),
    [entities],
  );
  const nationsDistrictPresentation = useMemo(() => {
    const entityByIdentifier = new Map(entities.map((entity) => [
      entity.publicIdentifier.trim().toLocaleUpperCase('pt-BR'),
      entity,
    ]));
    const owners = NATIONS_DISTRICT_REQUIRED_IDENTIFIERS
      .map((identifier) => entityByIdentifier.get(identifier))
      .filter((entity): entity is MapEntity => Boolean(entity));
    if (
      !nationsDistrictPresentationAvailable
      || owners.length !== NATIONS_DISTRICT_REQUIRED_IDENTIFIERS.length
      || owners.some((entity) => layerVisibility[entity.layerId] === false)
    ) return { visible: false, opacity: 0 };
    const filterStrength = entityFiltersActive
      && !owners.some((entity) => presentedMatchingEntityIds.has(entity.id))
      ? 0.28
      : 1;
    const opacity = Math.min(...owners.map((entity) => layerOpacity[entity.layerId] ?? 1)) * filterStrength;
    return { visible: opacity > 0.015, opacity };
  }, [
    entities,
    entityFiltersActive,
    layerOpacity,
    layerVisibility,
    nationsDistrictPresentationAvailable,
    presentedMatchingEntityIds,
  ]);
  const activeSegmentEntities = useMemo(
    () => activeSegment
      ? exteriorRenderedEntities.filter((entity) => segmentByEntity.get(entity.id)?.id === activeSegment.id)
      : [],
    [activeSegment, exteriorRenderedEntities, segmentByEntity],
  );
  const labelVisibility = useSemanticLabelVisibility({
    entities: exteriorRenderedEntities,
    lotByEntity,
    extent,
    labelsVisible: labelsVisible && !hydrologicalModeActive,
    reducedGraphics,
    selectedEntityId,
    hoveredEntityId,
    matchingEntityIds: presentedMatchingEntityIds,
    filtersActive: entityFiltersActive,
  });
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    invalidate();
    return () => { gl.shadowMap.autoUpdate = true; };
  }, [
    entities,
    gl,
    hydrologicalModeActive,
    interiorEntityId,
    invalidate,
    presentedSceneTrees,
    reducedGraphics,
    treesVisible,
  ]);

  useEffect(() => {
    if (!cameraNavigating) return;
    setHoveredEntityId(null);
  }, [cameraNavigating, setHoveredEntityId]);

  useEffect(() => () => clearPavilionTransitionSchedule(), [clearPavilionTransitionSchedule]);

  useEffect(() => {
    if (interiorEntityId || !pavilionTransitionActive.current) return;
    clearPavilionTransitionSchedule();
    setPavilionInteriorTransition(null);
  }, [clearPavilionTransitionSchedule, interiorEntityId]);

  if (interiorEntity) {
    const interiorKind = resolveStrategicLandmarkKind(interiorEntity);
    if (interiorKind === 'commercial-pavilion') {
      return (
        <>
          <CommercialPavilionInteriorScene
            entity={interiorEntity}
            entities={entities}
            lots={lots}
            reducedGraphics={reducedGraphics}
            onNavigate={handlePavilionInteriorNavigate}
          />
          <PavilionInteriorTransitionOverlay transition={pavilionInteriorTransition} />
        </>
      );
    }
    if (interiorKind === 'livestock-pavilion') {
      return <LivestockPavilionInteriorScene entity={interiorEntity} reducedGraphics={reducedGraphics} />;
    }
    if (interiorKind === 'mirante-pavilion') {
      return <MiranteInteriorScene entity={interiorEntity} reducedGraphics={reducedGraphics} />;
    }
    if (interiorKind === 'fenasoja-headquarters') {
      return <HeadquartersInteriorScene entity={interiorEntity} reducedGraphics={reducedGraphics} />;
    }
    return null;
  }

  return (
    <>
      <CommercialMapEnvironment
        extent={extent}
        hydrologicalModeActive={hydrologicalModeActive}
        reducedGraphics={reducedGraphics}
      />
      {!isolatedArea && !hydrologicalModeActive && <ReferenceUnderlay calibration={calibration} />}
      <RoadInfrastructure
        entities={circulationEntities}
        selectedEntityId={selectedEntityId}
        matchingEntityIds={matchingEntityIds}
        filtersActive={filtersActive}
        layerOpacity={layerOpacity}
        reducedGraphics={reducedGraphics}
      />
      {(!isolatedArea || isolatedArea === COMMERCIAL_MAP_SEGMENT_IDS.industry)
        && !hydrologicalModeActive && (
          <>
            <ParkAccessEnvironmentLayer
              reducedGraphics={reducedGraphics}
              surfacesVisible
              vegetationVisible={treesVisible}
            />
            <ParkAccessInfrastructure
              reducedGraphics={reducedGraphics}
              surfacesVisible={parkAccessPresentation.surfaces.visible}
              surfaceOpacity={parkAccessPresentation.surfaces.opacity}
              architectureVisible={parkAccessPresentation.architecture.visible}
              architectureOpacity={parkAccessPresentation.architecture.opacity}
            />
          </>
        )}
      <BatchedLots
        entries={lotEntries}
        selectedEntityId={selectedEntityId}
        hoveredEntityId={hoveredEntityId}
        matchingEntityIds={presentedMatchingEntityIds}
        filtersActive={entityFiltersActive}
        infrastructureMode={hydrologicalModeActive}
        layerOpacity={layerOpacity}
        segmentByEntity={segmentByEntity}
        onSelect={handleEntitySelect}
        onHover={handleEntityHover}
        onFocus={handleEntityFocus}
        cameraNavigating={cameraNavigating}
        onCursor={setCanvasCursor}
      />
      {structuralEntities.map((entity) => (
        <EntityMesh
          key={entity.id}
          entity={entity}
          segment={segmentByEntity.get(entity.id) ?? null}
          selected={selectedEntityId === entity.id}
          hovered={hoveredEntityId === entity.id}
          filtersActive={entityFiltersActive}
          infrastructureMode={hydrologicalModeActive}
          nationsDistrictPresentationAvailable={nationsDistrictPresentationAvailable}
          isMatch={presentedMatchingEntityIds.has(entity.id)}
          layerOpacity={layerOpacity[entity.layerId] ?? 1}
          sceneCenter={sceneCenter}
          cameraNavigating={cameraNavigating}
          onSelect={handleEntitySelect}
          onHover={handleEntityHover}
          onFocus={handleEntityFocus}
          onEnterInterior={enterInterior}
          onCursor={setCanvasCursor}
          moduleStateById={selectedEntityId === entity.id ? selectedPavilionModuleState : undefined}
        />
      ))}
      <NationsDistrict
        visible={nationsDistrictPresentation.visible}
        opacity={nationsDistrictPresentation.opacity}
        reducedGraphics={reducedGraphics}
      />
      {(arenaFrontInfrastructurePresentation.arenaStructures.visible
        || arenaFrontInfrastructurePresentation.courts.visible) && (
        <ArenaFrontInfrastructure
          reducedGraphics={reducedGraphics}
          showArenaStructures={arenaFrontInfrastructurePresentation.arenaStructures.visible}
          showCourts={arenaFrontInfrastructurePresentation.courts.visible}
          arenaStructuresOpacity={arenaFrontInfrastructurePresentation.arenaStructures.opacity}
          courtsOpacity={arenaFrontInfrastructurePresentation.courts.opacity}
        />
      )}
      <CommercialTreeLayer
        trees={presentedSceneTrees}
        surfaceEntities={exteriorRenderedEntities}
        visible={treesVisible && !hydrologicalModeActive}
        reducedGraphics={reducedGraphics}
      />
      <CommercialElectricalInfrastructureLayer
        nodes={sceneElectricalInfrastructure.nodes}
        connections={sceneElectricalInfrastructure.connections}
        surfaceEntities={entities}
        visible={treesVisible && !hydrologicalModeActive}
        reducedGraphics={reducedGraphics}
      />
      {hydrologicalModeActive ? (
        <Suspense fallback={null}>
          <CommercialHydrologicalInfrastructureLayer
            nodes={sceneHydrologicalInfrastructure.nodes}
            segments={sceneHydrologicalInfrastructure.segments}
            surfaceEntities={exteriorRenderedEntities}
            active
            reducedGraphics={reducedGraphics}
            onSelect={handleHydrologicalSelect}
          />
        </Suspense>
      ) : null}
      {exteriorRenderedEntities.filter((entity) => labelVisibility.ids.has(entity.id)).map((entity) => (
        <EntityLabel
          key={`label:${entity.id}`}
          entity={entity}
          lot={lotByEntity.get(entity.id)}
          selected={selectedEntityId === entity.id}
          hovered={hoveredEntityId === entity.id}
          filtersActive={entityFiltersActive}
          isMatch={presentedMatchingEntityIds.has(entity.id)}
        />
      ))}
      {technicalValidationAllowed
        && isolatedArea === 'exporural'
        && technicalValidationVisible
        && !hydrologicalModeActive
        && (
          <TechnicalValidationOverlay
            entities={exteriorRenderedEntities}
            lots={lots}
          />
        )}
      <CameraRig
        selectedEntity={selectedEntity}
        extent={extent}
        isolatedArea={isolatedArea}
        activeSegment={activeSegment}
        activeSegmentEntities={activeSegmentEntities}
        hydrologicalModeActive={hydrologicalModeActive}
      />
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
  const {
    entities,
    lots,
    calibration,
    matchingEntityIds,
    filtersActive,
    isolatedArea,
    segmentOverride,
    technicalValidationAllowed,
  } = props;
  const setSelectedEntityId = useCommercialMapStore((state) => state.setSelectedEntityId);
  const hydrologicalModeActive = useCommercialMapStore((state) => state.hydrologicalModeActive);
  const setSelectedHydrologicalElementId = useCommercialMapStore(
    (state) => state.setSelectedHydrologicalElementId,
  );
  const interiorEntityId = useCommercialMapStore((state) => state.interiorEntityId);
  const reducedGraphics = useCommercialMapStore((state) => state.reducedGraphics);
  const cameraNavigating = useCommercialMapStore((state) => state.cameraNavigating);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const [viewportMetrics, setViewportMetrics] = useState(() => ({
    width: typeof window === 'undefined' ? 1366 : window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.innerHeight,
    dpr: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
  }));

  useEffect(() => {
    const canvasHost = canvasElement?.parentElement;
    if (!canvasHost) return undefined;
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const bounds = canvasHost.getBoundingClientRect();
        setViewportMetrics((current) => {
          const next = {
            width: Math.max(1, bounds.width),
            height: Math.max(1, bounds.height),
            dpr: window.devicePixelRatio,
          };
          return Math.abs(current.width - next.width) < 0.5
            && Math.abs(current.height - next.height) < 0.5
            && current.dpr === next.dpr
            ? current
            : next;
        });
      });
    };
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    resizeObserver?.observe(canvasHost);
    window.addEventListener('resize', update, { passive: true });
    window.visualViewport?.addEventListener('resize', update, { passive: true });
    update();
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, [canvasElement]);

  const pixelRatio = useMemo(() => resolveCommercialMapPixelRatio({
    devicePixelRatio: viewportMetrics.dpr,
    viewportWidth: viewportMetrics.width,
    viewportHeight: viewportMetrics.height,
    reducedGraphics,
    cameraNavigating,
  }), [cameraNavigating, reducedGraphics, viewportMetrics]);
  const extent = useMemo(
    () => getSceneExtent(
      entities,
      parkAccessVisibleInArea(isolatedArea) ? PARK_ACCESS_SCENE_SUPPORT_POINTS : [],
    ),
    [entities, isolatedArea],
  );
  const initialDirection = new THREE.Vector3(0.04, 0.72, 0.69).normalize();
  const initialDistance = fitDistanceForDirection(
    extent,
    38,
    1,
    initialDirection,
    1.1,
  );
  const initialTarget = new THREE.Vector3(extent.centerX, 0, extent.centerZ);
  const initialCameraPosition = initialTarget.clone().add(initialDirection.multiplyScalar(initialDistance));

  return (
    <Canvas
      ref={setCanvasElement}
      className="commercial-map-canvas"
      frameloop="demand"
      camera={{
        position: initialCameraPosition.toArray(),
        fov: 38,
        near: Math.max(0.05, initialDistance / 1600),
        far: Math.max(720, extent.diagonal * 9),
      }}
      dpr={pixelRatio}
      shadows={!reducedGraphics}
      gl={{ antialias: !reducedGraphics, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.toneMappingExposure;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          gl.domElement.style.cursor = 'grab';
      }}
      onPointerMissed={() => {
        if (hydrologicalModeActive) {
          setSelectedHydrologicalElementId(null);
          return;
        }
        if (interiorEntityId) {
          useCommercialMapStore.getState().setSelectedModuleId(null);
          return;
        }
        setSelectedEntityId(null);
      }}
    >
      <Suspense fallback={<CanvasLoader />}>
        <Scene
          entities={entities}
          lots={lots}
          calibration={calibration}
          matchingEntityIds={matchingEntityIds}
          filtersActive={filtersActive}
          isolatedArea={isolatedArea}
          segmentOverride={segmentOverride}
          technicalValidationAllowed={technicalValidationAllowed}
        />
      </Suspense>
    </Canvas>
  );
});
