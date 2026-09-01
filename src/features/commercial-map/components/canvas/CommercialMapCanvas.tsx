import {
  Component,
  lazy,
  memo,
  Profiler,
  Suspense,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  registerMapGestureGuard,
  resolveCameraTransitionDuration,
  resolveCameraTransitionProgress,
  selectionFocusProfile,
} from '../../utils/interaction';
import { normalizeMapEntityMetadata } from '../../utils/mapMetadata';
import { selectCommercialTreesForScene } from '../../utils/treeLayer';
import { selectRearRoadCompatibleTreesForPresentation } from '../../utils/rearRoadTreeClearance';
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
  shouldRenderArenaAccess,
  shouldRenderArenaCourts,
  shouldRenderArenaStructures,
} from '../../data/parkEnvironment';
import {
  NATIONS_DISTRICT_REQUIRED_IDENTIFIERS,
  isNationsDistrictPresentationSurface,
  shouldRenderNationsDistrict,
} from '../../data/nationsDistrict';
import { withGateFourDistrictPresentationEntities } from '../../data/gateFourDistrict';
import { COMMERCIAL_MAP_ENVIRONMENT_CONFIG } from '../../data/commercialMapEnvironment';
import {
  OPEN_GROUND_PRESENTATION_HEIGHT,
  openGroundTextureBundleForEntity,
  resolveOpenGroundProfile,
} from './openGroundTextures';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
  strategicLandmarkFocusDirection,
  strategicLandmarkSupportsInterior,
  strategicLandmarkVisualHeight,
} from '../../utils/landmarks';
import {
  APOLLO_XIV_LAYOUT,
  apolloXivReplicaHeight,
  treeRemainsVisibleWithSelectedApollo,
} from '../../utils/lunarMemorial';
import { LACTALIS_STAGE_LAYOUT } from '../../utils/lactalisStage';
import {
  LUNAR_LAUNCH_TIMELINE,
  lunarLaunchAltitudeAt,
  lunarLaunchPhaseAt,
  rangeProgress,
  sampleLunarLaunchMotion,
  smootherstep,
  type LunarLaunchMotionSample,
} from '../../utils/lunarLaunch';
import {
  requiresSolidRendering,
  RESTROOM_PRESENTATION_LIFT,
  resolveGateAccessMode,
  resolveMarkerPresentationLift,
} from '../../utils/mapPresentation';
import { useContextualMapLabel } from '../../hooks/useContextualMapLabel';
import { InteriorCameraRequestContext, type InteriorCameraRequest } from '../../hooks/useInteriorCameraRequest';
import {
  expandCommercialMapControlAngles,
  prepareOrbitControlsForTransitionHandoff,
  stabilizeCameraTransitionUp,
} from '../../utils/cameraTransition';
import {
  recordCommercialMapFrame,
  recordCommercialMapProfiler,
  registerCommercialMapControlsDiagnostics,
  registerCommercialMapRuntimeDiagnostics,
} from '../../utils/runtimeDiagnostics';

import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import {
  getRearParkingFocusBounds, rearParkingVisibleInArea, rearParkingLayerPresentation,
  REAR_PARKING_SCENE_SUPPORT_POINTS, REAR_PARKING_GROUND_SUPPORTS, reconcileRearParkingTrees, rearParkingEntityForPresentation,
} from '../../data/rearParking';
import { RearParkingLayer } from './RearParkingLayer';
import { resolveParkingCameraFrame, resolveParkingViewportInsets } from '../../utils/parkingViewport';
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
  clampCommercialMapCameraPosition,
  resolveCommercialMapCameraDistanceBounds,
  resolveCommercialMapCameraFarPlane,
  resolveCommercialMapCameraNearPlane,
  shouldSuppressCommercialMapResizeRefit,
} from '../../utils/viewport';
import type { CameraPreset, CommercialLot, MapCalibration, MapEntity } from '../../types';
import { HeadquartersInteriorScene } from './HeadquartersInteriorScene';
import { LivestockPavilionInteriorScene } from './LivestockPavilionInteriorScene';
import { RoadInfrastructure } from './RoadInfrastructure';
import { StrategicLandmarkMesh, StrategicLandmarkSelectionShaderWarmup } from './StrategicLandmarks';
import { CommercialMapInteriorShaderWarmup } from './CommercialMapInteriorShaderWarmup';
import { TechnicalValidationOverlay } from './TechnicalValidationOverlay';
import { CommercialTreeLayer } from './CommercialTreeLayer';
import { CommercialElectricalInfrastructureLayer } from './CommercialElectricalInfrastructureLayer';
import { CommercialHydrologicalInfrastructureLayer } from './CommercialHydrologicalInfrastructureLayer';
import { CommercialPavilionInteriorScene } from './CommercialPavilionInteriorScene';
import { MiranteInteriorScene } from './MiranteInteriorScene';
import { ArenaFrontInfrastructure } from './ArenaFrontInfrastructure';
import { NationsDistrict } from './NationsDistrict';
import { CommercialMapEnvironment } from './CommercialMapEnvironment';
import { createCommercialMapEvents } from './commercialMapEvents';
import { ParkAccessEnvironmentLayer } from './ParkAccessEnvironmentLayer';
import { RearParkRoadNetwork } from './RearParkRoadNetwork';
import { RearParkEnvironmentLayer } from './RearParkEnvironmentLayer';
import { CommercialSiteEnvironmentLayer } from './CommercialSiteEnvironmentLayer';
import { QuadrasABEnvironmentLayer } from './QuadrasABEnvironmentLayer';
import { rearRoadLayerPresentation } from '../../utils/commercialLayerPresentation';
import {
  REAR_ROAD_SCENE_SUPPORT_POINTS,
  REAR_GATE_5_PRESENTATION,
  REPLACED_OFFICIAL_ROAD_IDENTIFIERS,
  rearContextualLabelAnchorForOfficialOwner,
  rearContextualLabelForOfficialOwner,
  rearRoadFocusBoundsForOfficialOwner,
} from '../../data/rearParkRoadNetwork';
import { rearRoadTerrainElevationAt } from '../../utils/rearRoadNetwork';
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

// Never import the exclusion audit or debug textures in the production bundle.
const RearRoadValidationOverlay = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import('./RearRoadValidationOverlay')).RearRoadValidationOverlay }))
  : null;
const QuadrasABValidationOverlay = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import('./QuadrasABValidationOverlay')).QuadrasABValidationOverlay }))
  : null;

interface CommercialMapCanvasProps {
  entities: MapEntity[];
  parkingOwnerEntities?: readonly MapEntity[];
  siteEnvironmentEntities?: readonly MapEntity[];
  lots: CommercialLot[];
  calibration: MapCalibration | null;
  matchingEntityIds: ReadonlySet<string>;
  filtersActive: boolean;
  isolatedArea?: CommercialMapSegmentId | null;
  segmentOverride?: CommercialMapSegmentDefinition | null;
  technicalValidationAllowed?: boolean;
}

class SceneAssetBoundary extends Component<{
  children: ReactNode;
  resetKey: string;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.warn('[CommercialMap] optional scene asset failed; keeping the active map', error, info);
    }
  }

  componentDidUpdate(previous: Readonly<{ children: ReactNode; resetKey: string }>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
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
const CONTEXTUAL_LABEL_POINT = new THREE.Vector3();
/** Keeps the single contextual label anchored, but never clipped by the viewport edges. */
function calculateContextualLabelPosition(
  object: THREE.Object3D,
  camera: THREE.Camera,
  size: { width: number; height: number },
): [number, number] {
  CONTEXTUAL_LABEL_POINT.setFromMatrixPosition(object.matrixWorld).project(camera);
  const x = CONTEXTUAL_LABEL_POINT.x * size.width / 2 + size.width / 2;
  const y = -CONTEXTUAL_LABEL_POINT.y * size.height / 2 + size.height / 2;
  const horizontalMargin = Math.min(112, size.width * 0.26);
  return [
    THREE.MathUtils.clamp(x, horizontalMargin, size.width - horizontalMargin),
    THREE.MathUtils.clamp(y, 46, size.height - 12),
  ];
}
const PRECISE_HOVER_CAPABLE = typeof window === 'undefined'
  || !window.matchMedia
  || window.matchMedia('(any-hover: hover) and (any-pointer: fine)').matches;
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
const OPEN_GROUND_NORMAL_SCALE = new THREE.Vector2(0.22, 0.22);

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
  const correctedRoadBounds = entity.classification === 'ROAD' || entity.publicIdentifier === 'A5'
    ? rearRoadFocusBoundsForOfficialOwner(entity.publicIdentifier)
    : null;
  const coordinates = entity.geometry.coordinates.flat();
  const xs = correctedRoadBounds
    ? [correctedRoadBounds.minX, correctedRoadBounds.maxX]
    : coordinates.map(([x]) => x).filter(Number.isFinite);
  const zs = correctedRoadBounds
    ? [correctedRoadBounds.minZ, correctedRoadBounds.maxZ]
    : coordinates.map(([, z]) => z).filter(Number.isFinite);
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
  if (landmark === 'lactalis-cultural-stage') {
    return { ...profile, contextRatio: 0.03, fitPadding: 1.22, minDistanceRatio: 0.02, maxDistanceRatio: 0.34, minimumDirectionY: LACTALIS_STAGE_LAYOUT.camera.focusMinimumDirectionY };
  }
  if (landmark === 'fenasoja-event-center') {
    return { ...profile, contextRatio: 0.085, fitPadding: 1.32, minDistanceRatio: 0.06, maxDistanceRatio: 0.4, minimumDirectionY: 0.48 };
  }
  if (landmark === 'pavilion-nine') {
    return { ...profile, contextRatio: 0.09, fitPadding: 1.28, minDistanceRatio: 0.065, maxDistanceRatio: 0.42, minimumDirectionY: 0.48 };
  }
  if (landmark === 'crioulos-center') {
    return { ...profile, contextRatio: 0.08, fitPadding: 1.34, minDistanceRatio: 0.06, maxDistanceRatio: 0.4, minimumDirectionY: 0.42 };
  }
  if (landmark === 'gate-four') {
    return { ...profile, contextRatio: 0.07, fitPadding: 1.24, minDistanceRatio: 0.055, maxDistanceRatio: 0.36, minimumDirectionY: 0.4 };
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
  minimumDistance?: number,
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

  return Math.max(distance * padding, minimumDistance ?? extent.maxHeight * 3 + 4);
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
    <SceneAssetBoundary resetKey={imageUrl}>
      <Suspense fallback={null}>
        <ReferenceUnderlaySurface calibration={calibration} imageUrl={imageUrl} opacity={referenceOpacity} />
      </Suspense>
    </SceneAssetBoundary>
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
  sceneDiagonal: number;
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
  const isRearGate5 = isGate && entity.publicIdentifier === 'A5';
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
  const renderer = useThree((state) => state.gl);
  const maxAnisotropy = openGroundProfile ? renderer.capabilities.getMaxAnisotropy() : 1;
  const openGroundTextures = useMemo(
    () => (openGroundProfile ? openGroundTextureBundleForEntity(openGroundProfile, maxAnisotropy) : null),
    [maxAnisotropy, openGroundProfile],
  );

  const geometry = useMemo(
    () => isQuadra || isGate || isNationsPresentationSurface
      ? null
      : createEntityGeometry(
        entity,
        openGroundProfile
          ? openGroundProfile.presentationHeight ?? OPEN_GROUND_PRESENTATION_HEIGHT
          : undefined,
      ),
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
  const markerCenter = useMemo(() => isRearGate5
    ? REAR_GATE_5_PRESENTATION.center
    : geometryCentroid(entity.geometry), [entity.geometry, isRearGate5]);
  const gateRotation = useMemo(() => isRearGate5 ? REAR_GATE_5_PRESENTATION.rotation : Math.atan2(
    sceneCenter[0] - markerCenter[0],
    sceneCenter[1] - markerCenter[1],
  ), [isRearGate5, markerCenter, sceneCenter]);
  const gateAccessMode = useMemo(() => resolveGateAccessMode(entity.name), [entity.name]);
  const baseColor = openGroundProfile
    ? openGroundProfile.baseColor
    : segment && isSegmentTintClassification(entity.classification)
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
  // Large textured ground fields must remain below their circulation ribbons
  // even while selected. Selection is already conveyed by emissive tint and
  // outline; lifting the whole slab made it overtake roads at oblique angles.
  const selectedLift = selected
    ? openGroundProfile ? 0 : isFlat ? 0.055 : 0.11
    : 0;
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
    openGroundTextures?.dispose();
  }, [edges, footprint, geometry, hitSurface, openGroundTextures, roofOutline]);

  const interactionProps = isInteractive ? {
    onClick: (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      if (!isMapSelectionClick(event.delta, event.nativeEvent)) return;
      onSelect(entity.id);
    },
    onDoubleClick: (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      if (!isMapSelectionClick(event.delta, event.nativeEvent)) return;
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
      position={[0, isRearGate5
        ? REAR_GATE_5_PRESENTATION.baseElevation + rearRoadTerrainElevationAt(markerCenter[0], markerCenter[1])
        : entity.geometry.elevation + selectedLift + presentationLift, 0]}
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
            map={openGroundTextures?.map}
            normalMap={openGroundTextures?.normalMap}
            normalScale={openGroundTextures ? OPEN_GROUND_NORMAL_SCALE : undefined}
            roughnessMap={openGroundTextures?.roughnessMap}
            roughness={openGroundProfile ? openGroundProfile.roughness : isPavilion ? 0.82 : isFlat ? 0.9 : 0.72}
            metalness={0}
            transparent={!solidRendering && visualOpacity < 0.995}
            opacity={solidRendering ? 1 : visualOpacity}
            depthTest
            depthWrite={solidRendering || visualOpacity > 0.42}
            emissive={selected || hovered || matched ? (openGroundProfile ? '#e7d489' : baseColor) : '#000000'}
            emissiveIntensity={selected ? 0.13 : hovered ? 0.055 : matched ? 0.03 : 0}
            flatShading={isPavilion}
            polygonOffset
            polygonOffsetFactor={openGroundProfile ? 2 : isFlat ? -2 : 0}
            polygonOffsetUnits={openGroundProfile ? 2 : isFlat ? -2 : 0}
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
          {isRearGate5 ? (
            <group name="gate-5-physical-access">
              {[-1, 1].map((side) => (
                <mesh key={side} position={[side * (REAR_GATE_5_PRESENTATION.clearWidth / 2 + 0.055), 0.44, 0]}
                  raycast={NO_RAYCAST} castShadow receiveShadow>
                  <boxGeometry args={[0.11, 0.88, 0.16]} />
                  <meshStandardMaterial color={gateBaseColor} roughness={0.74} />
                </mesh>
              ))}
              <mesh position={[0, REAR_GATE_5_PRESENTATION.clearHeight + 0.06, 0]}
                raycast={NO_RAYCAST} castShadow>
                <boxGeometry args={[REAR_GATE_5_PRESENTATION.clearWidth + 0.22, 0.12, 0.18]} />
                <meshStandardMaterial color={gateAccentColor} roughness={0.7} metalness={0.03} />
              </mesh>
            </group>
          ) : <group visible={!usesDetailedParkAccessArchitecture}>
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
          </group>}
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
        sceneDiagonal={props.sceneDiagonal}
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
  target = new THREE.Color(),
  blend = new THREE.Color(),
) {
  const status = STATUS_CONFIG[entry.lot.status];
  const color = segment
    ? target.set(status.color).lerp(blend.set(segment.palette.surface), SEGMENT_LOT_SURFACE_WEIGHT)
    : target.set(status.color);
  if (infrastructureMode) color.lerp(blend.set('#c7d1cf'), 0.98);
  else if (filtersActive && !isMatch && !selected) color.lerp(blend.set('#c7d1c9'), 0.76);
  if (hovered) color.lerp(blend.set('#ffffff'), 0.1);
  if (selected) color.lerp(blend.set('#fff4b8'), 0.14);
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
  const pendingHoverRef = useRef<string | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const visualStateRef = useRef({ selectedEntityId, hoveredEntityId });
  const previousTransientRef = useRef({ selectedEntityId: null as string | null, hoveredEntityId: null as string | null });
  const visualScratch = useRef({
    matrix: new THREE.Matrix4(),
    color: new THREE.Color(),
    blend: new THREE.Color(),
  });
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
    const color = new THREE.Color();
    const blend = new THREE.Color();

    sourceGeometries.forEach((geometry, index) => {
      const entry = entries[index];
      const geometryId = mesh.addGeometry(geometry);
      const batchId = mesh.addInstance(geometryId);
      matrix.makeTranslation(0, entry.entity.geometry.elevation, 0);
      mesh.setMatrixAt(batchId, matrix);
      const segment = segmentByEntity.get(entry.entity.id) ?? null;
      mesh.setColorAt(batchId, lotColor(
        entry,
        segment,
        false,
        true,
        false,
        false,
        false,
        color,
        blend,
      ));
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
    const scratch = visualScratch.current;
    batch.mesh.setColorAt(batchId, lotColor(
      entry,
      segmentByEntity.get(entityId) ?? null,
      filtersActive,
      matchingEntityIds.has(entityId),
      selected,
      hovered,
      infrastructureMode,
      scratch.color,
      scratch.blend,
    ));
    scratch.matrix.makeTranslation(0, entry.entity.geometry.elevation + (selected ? 0.055 : hovered ? 0.035 : 0), 0);
    batch.mesh.setMatrixAt(batchId, scratch.matrix);
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
    if (hoverFrameRef.current !== null) cancelAnimationFrame(hoverFrameRef.current);
    hoverFrameRef.current = null;
    pendingHoverRef.current = null;
    hoveredRef.current = null;
    onHover(null);
    onCursor('grabbing');
  }, [cameraNavigating, onCursor, onHover]);

  useEffect(() => () => {
    if (hoverFrameRef.current !== null) cancelAnimationFrame(hoverFrameRef.current);
  }, []);

  const queueHover = useCallback((entityId: string | null) => {
    pendingHoverRef.current = entityId;
    if (hoverFrameRef.current !== null) return;
    hoverFrameRef.current = requestAnimationFrame(() => {
      hoverFrameRef.current = null;
      const next = pendingHoverRef.current;
      if (next === hoveredRef.current) return;
      hoveredRef.current = next;
      onCursor(next ? 'pointer' : 'grab');
      onHover(next);
    });
  }, [onCursor, onHover]);

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
          if (!isMapSelectionClick(event.delta, event.nativeEvent)) return;
          const entityId = resolveEntityId(event);
          if (entityId) onSelect(entityId);
        }}
        onDoubleClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          if (!isMapSelectionClick(event.delta, event.nativeEvent)) return;
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
            queueHover(entityId);
          },
          onPointerOut: () => {
            if (cameraNavigating) return;
            queueHover(null);
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
  cinematicHidden,
}: {
  entity: MapEntity;
  lot?: CommercialLot;
  selected: boolean;
  hovered: boolean;
  filtersActive: boolean;
  isMatch: boolean;
  cinematicHidden: boolean;
}) {
  const metadata = useMemo(() => normalizeMapEntityMetadata(entity, lot), [entity, lot]);
  const classification = entity.classification;
  const isRoad = classification === 'ROAD' || classification === 'PEDESTRIAN_PATH';
  const isQuadra = classification === 'QUADRA' || entity.metadata.renderMode === 'outline';
  const isGate = classification === 'GATE';
  const isRestroom = classification === 'RESTROOM' || classification === 'CHEMICAL_RESTROOM';
  const isArchitecturalLandmark = Boolean(resolveStrategicLandmarkKind(entity));
  const contextualDisplayName = rearContextualLabelForOfficialOwner(entity.publicIdentifier)
    ?? metadata.officialDisplayName;
  const contextualRoadAnchor = rearContextualLabelAnchorForOfficialOwner(entity.publicIdentifier);
  const dimmed = Boolean(lot && filtersActive && !isMatch && !selected);
  const status = lot ? STATUS_CONFIG[lot.status] : null;
  const labelHeight = entityLabelHeight(entity);

  const mode = selected ? 'focus' : 'hover';
  const variant = `is-contextual ${selected ? 'is-selected' : hovered ? 'is-hovered' : 'is-transient'}`;

  return (
    <Html
      position={[
        contextualRoadAnchor?.[0] ?? metadata.labelAnchor[0],
        entity.geometry.elevation + labelHeight,
        contextualRoadAnchor?.[1] ?? metadata.labelAnchor[1],
      ]}
      transform={false}
      eps={0.001}
      zIndexRange={[22, 2]}
      calculatePosition={calculateContextualLabelPosition}
      style={{
        pointerEvents: 'none',
        transform: 'translate3d(-50%, -100%, 0)',
        visibility: cinematicHidden ? 'hidden' : 'visible',
      }}
    >
      {lot ? (
        <div data-map-entity-id={entity.id} data-map-label-mode={mode} className={`commercial-map-label is-lot ${variant} ${dimmed ? 'is-dimmed' : ''}`}>
          <span aria-label={`Lote ${metadata.lotNumber ?? ''}`}>{metadata.lotNumber}</span>
          {metadata.block && <strong>{quadraLabel(metadata.block)}</strong>}
          {lot.officialAreaSqm && (
            <small className="commercial-map-label-area">{AREA_NUMBER.format(lot.officialAreaSqm)} m²</small>
          )}
          {status && <small><b aria-hidden="true">{status.symbol}</b> {status.label}</small>}
        </div>
      ) : isRoad ? (
        <div data-map-entity-id={entity.id} data-map-label-mode={mode} className={`commercial-map-label is-road ${variant}`}><span>{contextualDisplayName}</span></div>
      ) : isQuadra ? (
        <div data-map-entity-id={entity.id} data-map-label-mode={mode} className={`commercial-map-label is-quadra ${variant}`}>
          <span>{quadraLabel(metadata.officialDisplayName || entity.publicIdentifier)}</span>
        </div>
      ) : (
        <div
          data-map-entity-id={entity.id}
          data-map-label-mode={mode}
          className={`commercial-map-label is-structure ${isGate ? 'is-access' : ''} ${isRestroom ? 'is-restroom' : ''} ${isArchitecturalLandmark ? 'is-architectural-landmark' : ''} ${variant}`}
        >
          {metadata.structureCode && <strong className="commercial-map-label-code">{isRestroom ? 'E' : metadata.structureCode}</strong>}
          <span>{contextualDisplayName}</span>
        </div>
      )}

    </Html>
  );
});


interface LunarCameraControlSnapshot {
  enabled: boolean;
  enableDamping: boolean;
  dampingFactor: number;
  enablePan: boolean;
  enableRotate: boolean;
  enableZoom: boolean;
  zoomToCursor: boolean;
  autoRotate: boolean;
}

interface CameraLensState {
  fov: number;
  near: number;
  far: number;
  zoom: number;
}

interface DeterministicCameraTransition {
  active: boolean;
  sequence: number;
  source: string;
  startedAt: number;
  durationMs: number;
  fromPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  fromQuaternion: THREE.Quaternion;
  fromLens: CameraLensState;
  toPosition: THREE.Vector3;
  toTarget: THREE.Vector3;
  toQuaternion: THREE.Quaternion;
  toLens: CameraLensState;
}

interface LunarCameraSnapshot {
  position: THREE.Vector3;
  target: THREE.Vector3;
  quaternion: THREE.Quaternion;
  fov: number;
  near: number;
  far: number;
  zoom: number;
  exposure: number;
  controls: LunarCameraControlSnapshot;
}

interface LunarCameraPathState {
  active: boolean;
  returning: boolean;
  sequence: number;
  returnSequence: number;
  startedAt: number;
  returnStartedAt: number;
  lastPhase: ReturnType<typeof lunarLaunchPhaseAt>;
  snapshot: LunarCameraSnapshot | null;
  anchor: THREE.Vector3;
  mapTarget: THREE.Vector3;
  outward: THREE.Vector3;
  side: THREE.Vector3;
  exteriorPosition: THREE.Vector3;
  exteriorTarget: THREE.Vector3;
  chasePosition: THREE.Vector3;
  chaseTarget: THREE.Vector3;
  completionPosition: THREE.Vector3;
  completionTarget: THREE.Vector3;
  finalPosition: THREE.Vector3;
  finalTarget: THREE.Vector3;
  returnPosition: THREE.Vector3;
  returnTarget: THREE.Vector3;
  returnQuaternion: THREE.Quaternion;
  returnFov: number;
  returnNear: number;
  returnFar: number;
  returnZoom: number;
  returnExposure: number;
  rocketHeight: number;
  exteriorDistance: number;
  exteriorSideOffset: number;
  exteriorHeightRatio: number;
  exteriorTargetHeightRatio: number;
  chaseDistance: number;
  chaseSideOffset: number;
  exteriorFov: number;
  chaseFov: number;
  finalFov: number;
}

const LUNAR_CAMERA_INITIAL_SETTLE_END = 0.88;
const LUNAR_CAMERA_RETURN_DURATION = 1.18;

function writeLunarExteriorPose(
  path: LunarCameraPathState,
  altitude: number,
  position: THREE.Vector3,
  target: THREE.Vector3,
) {
  position.copy(path.anchor)
    .addScaledVector(path.outward, path.exteriorDistance)
    .addScaledVector(path.side, path.exteriorSideOffset);
  position.y = path.anchor.y + path.rocketHeight * path.exteriorHeightRatio + altitude;
  target.copy(path.anchor);
  target.y = path.anchor.y + path.rocketHeight * path.exteriorTargetHeightRatio + altitude;
}

function writeLunarChasePose(
  path: LunarCameraPathState,
  altitude: number,
  position: THREE.Vector3,
  target: THREE.Vector3,
) {
  position.copy(path.anchor)
    .addScaledVector(path.outward, path.chaseDistance)
    .addScaledVector(path.side, path.chaseSideOffset);
  position.y = path.anchor.y + altitude + path.rocketHeight * 0.7;
  target.lerpVectors(path.anchor, path.mapTarget, 0.72);
  target.y = Math.max(path.mapTarget.y, path.anchor.y + altitude * 0.075);
}

function setLunarLookQuaternion(
  quaternion: THREE.Quaternion,
  matrix: THREE.Matrix4,
  position: THREE.Vector3,
  target: THREE.Vector3,
  up: THREE.Vector3,
) {
  matrix.lookAt(position, target, up);
  quaternion.setFromRotationMatrix(matrix);
}

function CameraRig({
  selectedEntity,
  interiorEntity,
  interiorRequest,
  extent,
  lunarTreeEntity,
  isolatedArea,
  activeSegment,
  activeSegmentEntities,
  hydrologicalModeActive,
}: {
  selectedEntity: MapEntity | null;
  interiorEntity: MapEntity | null;
  interiorRequest: InteriorCameraRequest | null;
  extent: SceneExtent;
  lunarTreeEntity: MapEntity | null;
  isolatedArea?: CommercialMapSegmentId | null;
  activeSegment: CommercialMapSegmentDefinition | null;
  activeSegmentEntities: MapEntity[];
  hydrologicalModeActive: boolean;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  useEffect(() => {
    const controls = controlsRef.current;
    if (controls) return registerCommercialMapControlsDiagnostics(controls);
  }, []);
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);
  const interiorFrame = interiorRequest?.entityId === interiorEntity?.id ? interiorRequest : null;
  const desiredAngles = useMemo(() => ({
    minPolarAngle: interiorFrame?.minPolarAngle ?? COMMERCIAL_MAP_MIN_POLAR_ANGLE,
    maxPolarAngle: interiorFrame?.maxPolarAngle ?? Math.PI / 2.08,
    minAzimuthAngle: interiorFrame?.minAzimuthAngle ?? (!interiorEntity && selectedEntity && resolveStrategicLandmarkKind(selectedEntity) === 'mirante-pavilion' ? -2.65 : -Infinity),
    maxAzimuthAngle: interiorFrame?.maxAzimuthAngle ?? (!interiorEntity && selectedEntity && resolveStrategicLandmarkKind(selectedEntity) === 'mirante-pavilion' ? -0.9 : Infinity),
  }), [interiorEntity, interiorFrame, selectedEntity]);
  const [appliedAngles, setAppliedAngles] = useState(desiredAngles);
  const preset = useCommercialMapStore((state) => state.cameraPreset);
  const cameraSequence = useCommercialMapStore((state) => state.cameraSequence);
  const parkingInspectionOpen = useCommercialMapStore((state) => state.parkingInspectionOpen);
  const parkingCameraSequence = useCommercialMapStore((state) => state.parkingCameraSequence);
  const parkingCameraView = useCommercialMapStore((state) => state.parkingCameraView);
  const selectedParkingBlockId = useCommercialMapStore((state) => state.selectedParkingBlockId);
  const selectedParkingSpaceId = useCommercialMapStore((state) => state.selectedParkingSpaceId);
  const activePanel = useCommercialMapStore((state) => state.activePanel);
  const setCameraNavigating = useCommercialMapStore((state) => state.setCameraNavigating);
  const parkingActive = parkingInspectionOpen
    && rearParkingVisibleInArea(isolatedArea)
    && !hydrologicalModeActive;
  const parkingFocusBounds = useMemo(
    () => getRearParkingFocusBounds(
      selectedParkingBlockId,
      parkingCameraView === 'detail' ? selectedParkingSpaceId : null,
      parkingCameraView,
    ),
    [
      parkingCameraView,
      selectedParkingBlockId,
      selectedParkingSpaceId,
    ],
  );
  const parkingFramingExtent = useMemo<SceneExtent>(() => {
    const width = Math.max(1, parkingFocusBounds.maxX - parkingFocusBounds.minX);
    const depth = Math.max(1, parkingFocusBounds.maxZ - parkingFocusBounds.minZ);
    return {
      ...parkingFocusBounds,
      width,
      depth,
      centerX: (parkingFocusBounds.minX + parkingFocusBounds.maxX) / 2,
      centerZ: (parkingFocusBounds.minZ + parkingFocusBounds.maxZ) / 2,
      maxHeight: 1,
      diagonal: Math.hypot(width, depth),
    };
  }, [parkingFocusBounds]);
  // Parking may temporarily use a closer minimum; closing it transitions back
  // to the exterior safety envelope through the same damped camera path.
  const [parkingControlLimits, setParkingControlLimits] = useState<{
    minDistance: number;
    maxDistance: number;
  } | null>(null);
  const lunarLaunchPhase = useCommercialMapStore((state) => state.lunarLaunchPhase);
  const lunarLaunchSequence = useCommercialMapStore((state) => state.lunarLaunchSequence);
  const lunarLaunchStartedAt = useCommercialMapStore((state) => state.lunarLaunchStartedAt);
  const lunarLaunchSkipRequested = useCommercialMapStore((state) => state.lunarLaunchSkipRequested);
  const lunarLaunchReturnSequence = useCommercialMapStore((state) => state.lunarLaunchReturnSequence);
  const lunarLaunchReturning = useCommercialMapStore((state) => state.lunarLaunchReturning);
  const lunarCameraLocked = lunarLaunchPhase !== 'idle' || lunarLaunchReturning;
  const lunarCameraLockedRef = useRef(lunarCameraLocked);
  lunarCameraLockedRef.current = lunarCameraLocked;
  const cameraDistanceBounds = useMemo(
    () => resolveCommercialMapCameraDistanceBounds({
      bounds: extent,
      verticalFovDegrees: 38,
      aspect: size.width / Math.max(size.height, 1),
    }),
    [extent, size.height, size.width],
  );
  const cameraFarPlane = useMemo(
    () => resolveCommercialMapCameraFarPlane(extent, cameraDistanceBounds.maxDistance),
    [cameraDistanceBounds.maxDistance, extent],
  );
  const selectedKind = selectedEntity ? resolveStrategicLandmarkKind(selectedEntity) : null;
  const lactalisSelected = !interiorEntity && selectedKind === 'lactalis-cultural-stage';
  const miranteSelected = !interiorEntity && selectedKind === 'mirante-pavilion';
  const miranteExtent = useMemo(
    () => (miranteSelected && selectedEntity ? getEntityExtent(selectedEntity) : null),
    [miranteSelected, selectedEntity],
  );
  const segmentExtent = useMemo(
    () => (activeSegment && activeSegmentEntities.length > 0
      ? getSceneExtent(activeSegmentEntities)
      : null),
    [activeSegment, activeSegmentEntities],
  );
  const focusedCameraDistanceBounds = useMemo(
    () => resolveCommercialMapCameraDistanceBounds({
      bounds: miranteExtent ?? segmentExtent ?? extent,
      verticalFovDegrees: 38,
      aspect: size.width / Math.max(size.height, 1),
    }),
    [extent, miranteExtent, segmentExtent, size.height, size.width],
  );
  // B13 is a compact open stage. Its own close-view range keeps the camera
  // between the audience apron and the existing D canopies, without changing
  // the exterior limits or the camera behavior of any neighboring structure.
  const requestedMinimumDistance = lactalisSelected
    ? LACTALIS_STAGE_LAYOUT.camera.minimumDistance
    : miranteExtent
    ? Math.max(7.5, miranteExtent.diagonal * 0.8)
    : segmentExtent && activeSegment
      ? Math.max(6.5, segmentExtent.diagonal * activeSegment.camera.minDistanceRatio)
      : isolatedArea
        ? Math.max(6.5, extent.diagonal * 0.12)
        : cameraDistanceBounds.minDistance;
  const requestedMaximumDistance = miranteExtent
    ? Math.max(30, miranteExtent.diagonal * 4, focusedCameraDistanceBounds.maxDistance)
    : segmentExtent && activeSegment
      ? Math.max(
          96,
          segmentExtent.diagonal * activeSegment.camera.maxDistanceRatio,
          focusedCameraDistanceBounds.maxDistance,
        )
      : isolatedArea
        ? Math.max(96, extent.diagonal * 2.15, focusedCameraDistanceBounds.maxDistance)
        : cameraDistanceBounds.maxDistance;
  const controlsMinimumDistance = Math.min(
    requestedMinimumDistance,
    cameraDistanceBounds.maxDistance,
  );
  const controlsMaximumDistance = Math.max(
    controlsMinimumDistance,
    Math.min(requestedMaximumDistance, cameraDistanceBounds.maxDistance),
  );
  const effectiveControlsMinimumDistance = interiorFrame?.minDistance ?? parkingControlLimits?.minDistance
    ?? controlsMinimumDistance;
  const effectiveControlsMaximumDistance = interiorFrame?.maxDistance ?? parkingControlLimits?.maxDistance
    ?? controlsMaximumDistance;
  const [appliedControlLimits, setAppliedControlLimits] = useState(() => ({
    minDistance: effectiveControlsMinimumDistance,
    maxDistance: effectiveControlsMaximumDistance,
  }));
  const targetPosition = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3(extent.centerX, 0, extent.centerZ));
  const animating = useRef(false);
  const [transitionControlsLocked, setTransitionControlsLocked] = useState(false);
  const cameraTransition = useRef<DeterministicCameraTransition>({
    active: false,
    sequence: 0,
    source: 'initial',
    startedAt: 0,
    durationMs: 0,
    fromPosition: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    fromQuaternion: new THREE.Quaternion(),
    fromLens: { fov: 38, near: 0.05, far: 720, zoom: 1 },
    toPosition: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
    toQuaternion: new THREE.Quaternion(),
    toLens: { fov: 38, near: 0.05, far: 720, zoom: 1 },
  });
  const transitionScratch = useRef({
    matrix: new THREE.Matrix4(),
    up: new THREE.Vector3(0, 1, 0),
    direction: new THREE.Vector3(),
    spherical: new THREE.Spherical(),
  });
  const navigation = useRef({
    active: false,
    navigating: false,
    settling: false,
    stableFrames: 0,
    startPosition: new THREE.Vector3(),
    startTarget: new THREE.Vector3(),
    lastPosition: new THREE.Vector3(),
    lastTarget: new THREE.Vector3(),
  });
  const initialized = useRef(false);
  const previousPreset = useRef<CameraPreset>(preset);
  const previousSequence = useRef(cameraSequence);
  const previousSelection = useRef<string | null>(selectedEntity?.id ?? null);
  const previousInterior = useRef<string | null>(null);
  const previousInteriorFrame = useRef<InteriorCameraRequest | null>(null);
  const previousSegment = useRef(activeSegment?.id ?? null);
  const previousDetailsLayout = useRef(activePanel === 'details');
  const previousParking = useRef({
    active: parkingActive,
    sequence: parkingCameraSequence,
    blockId: selectedParkingBlockId,
    spaceId: selectedParkingSpaceId,
    view: parkingCameraView,
  });
  const returnView = useRef(useCommercialMapStore.getState().interiorReturnView);
  const interiorReturnLens = useRef<CameraLensState | null>(null);
  const previousViewportSize = useRef({ width: size.width, height: size.height });
  const resizeRefitTimer = useRef<number | null>(null);
  const pendingResizeRefit = useRef(false);
  const preserveManualView = useRef(false);
  const resizeRefitSuppressedUntil = useRef(0);
  const resizeRefitView = useRef<() => void>(() => undefined);
  const suppressNextDetailsRefit = useRef(false);
  const lunarReturnBoundsSignature = useRef('');
  const lunarPath = useRef<LunarCameraPathState>({
    active: false,
    returning: false,
    sequence: -1,
    returnSequence: -1,
    startedAt: 0,
    returnStartedAt: 0,
    lastPhase: 'idle',
    snapshot: null,
    anchor: new THREE.Vector3(),
    mapTarget: new THREE.Vector3(),
    outward: new THREE.Vector3(0, 0, 1),
    side: new THREE.Vector3(1, 0, 0),
    exteriorPosition: new THREE.Vector3(),
    exteriorTarget: new THREE.Vector3(),
    chasePosition: new THREE.Vector3(),
    chaseTarget: new THREE.Vector3(),
    completionPosition: new THREE.Vector3(),
    completionTarget: new THREE.Vector3(),
    finalPosition: new THREE.Vector3(),
    finalTarget: new THREE.Vector3(),
    returnPosition: new THREE.Vector3(),
    returnTarget: new THREE.Vector3(),
    returnQuaternion: new THREE.Quaternion(),
    returnFov: 38,
    returnNear: 0.05,
    returnFar: 720,
    returnZoom: 1,
    returnExposure: COMMERCIAL_MAP_ENVIRONMENT_CONFIG.toneMappingExposure,
    rocketHeight: APOLLO_XIV_LAYOUT.minimumHeight,
    exteriorDistance: 6,
    exteriorSideOffset: 2,
    exteriorHeightRatio: 1.35,
    exteriorTargetHeightRatio: 0.5,
    chaseDistance: 4,
    chaseSideOffset: 1.5,
    exteriorFov: 38,
    chaseFov: 40,
    finalFov: 38,
  });
  const lunarScratch = useRef({
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    fromPosition: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    fromQuaternion: new THREE.Quaternion(),
    toQuaternion: new THREE.Quaternion(),
    matrix: new THREE.Matrix4(),
    up: new THREE.Vector3(0, 1, 0),
    motion: {
      phase: 'idle',
      altitude: 0,
      thrust: 0,
      groundLight: 0,
      vibration: 0,
      ascentProgress: 0,
    } as LunarLaunchMotionSample,
  });
  const cameraScratch = useRef({
    targetBeforeClamp: new THREE.Vector3(),
    targetShift: new THREE.Vector3(),
    interiorTarget: new THREE.Vector3(),
  });
  const cameraDiagnosticsAt = useRef(0);
  const clampCameraTarget = useCallback((
    target: THREE.Vector3,
    position: THREE.Vector3,
    distance: number,
    maximumDistance: number,
  ) => {
    if (interiorEntity) {
      const bounds = interiorFrame?.panBounds;
      if (!bounds) return;
      const local = cameraScratch.current.interiorTarget.copy(target).sub(bounds.center)
        .applyAxisAngle(transitionScratch.current.up, -bounds.facing);
      local.set(
        THREE.MathUtils.clamp(local.x, bounds.min[0], bounds.max[0]),
        THREE.MathUtils.clamp(local.y, bounds.min[1], bounds.max[1]),
        THREE.MathUtils.clamp(local.z, bounds.min[2], bounds.max[2]),
      );
      target.copy(local.applyAxisAngle(transitionScratch.current.up, bounds.facing).add(bounds.center));
      return;
    }
    const framingExtent = parkingActive
      ? parkingFramingExtent
      : miranteExtent ?? segmentExtent ?? extent;
    const margin = isolatedArea
      ? Math.max(1.6, framingExtent.diagonal * 0.035)
      : Math.max(3, framingExtent.diagonal * 0.08);
    const boundaryStart = maximumDistance * 0.72;
    const boundaryRange = Math.max(0.001, maximumDistance - boundaryStart);
    const rawBoundaryProgress = THREE.MathUtils.clamp(
      (distance - boundaryStart) / boundaryRange,
      0,
      1,
    );
    const boundaryProgress = rawBoundaryProgress * rawBoundaryProgress
      * (3 - 2 * rawBoundaryProgress);
    const targetSlack = Math.max(
      1.5,
      Math.hypot(framingExtent.width, framingExtent.depth) * 0.018,
    );
    const minimumX = THREE.MathUtils.lerp(
      framingExtent.minX - margin,
      framingExtent.centerX - targetSlack,
      boundaryProgress,
    );
    const maximumX = THREE.MathUtils.lerp(
      framingExtent.maxX + margin,
      framingExtent.centerX + targetSlack,
      boundaryProgress,
    );
    const minimumZ = THREE.MathUtils.lerp(
      framingExtent.minZ - margin,
      framingExtent.centerZ - targetSlack,
      boundaryProgress,
    );
    const maximumZ = THREE.MathUtils.lerp(
      framingExtent.maxZ + margin,
      framingExtent.centerZ + targetSlack,
      boundaryProgress,
    );
    const targetMinimumY = miranteSelected ? -framingExtent.maxHeight * 1.2 : 0;
    const targetMaximumY = THREE.MathUtils.lerp(
      framingExtent.maxHeight * 2 + 4,
      Math.max(1, framingExtent.maxHeight * 0.55),
      boundaryProgress,
    );
    const scratch = cameraScratch.current;
    scratch.targetBeforeClamp.copy(target);
    target.set(
      THREE.MathUtils.clamp(target.x, minimumX, maximumX),
      THREE.MathUtils.clamp(target.y, targetMinimumY, targetMaximumY),
      THREE.MathUtils.clamp(target.z, minimumZ, maximumZ),
    );
    scratch.targetShift.subVectors(target, scratch.targetBeforeClamp);
    if (scratch.targetShift.lengthSq() > 0) position.add(scratch.targetShift);
  }, [
    extent,
    isolatedArea,
    interiorEntity,
    interiorFrame,
    miranteExtent,
    miranteSelected,
    parkingActive,
    parkingFramingExtent,
    segmentExtent,
  ]);
  const clampQueuedCameraPose = useCallback((
    minDistance = controlsMinimumDistance,
    maxDistance = controlsMaximumDistance,
    clampTarget = true,
  ) => {
    if (clampTarget) {
      clampCameraTarget(
        targetLookAt.current,
        targetPosition.current,
        targetPosition.current.distanceTo(targetLookAt.current),
        maxDistance,
      );
    }
    const clamped = clampCommercialMapCameraPosition({
      position: targetPosition.current.toArray() as [number, number, number],
      target: targetLookAt.current.toArray() as [number, number, number],
      minDistance,
      maxDistance,
    });
    targetPosition.current.set(...clamped.position);
    const scratch = transitionScratch.current;
    scratch.direction.subVectors(targetPosition.current, targetLookAt.current);
    scratch.spherical.setFromVector3(scratch.direction);
    scratch.spherical.phi = THREE.MathUtils.clamp(scratch.spherical.phi, desiredAngles.minPolarAngle, desiredAngles.maxPolarAngle);
    scratch.spherical.theta = THREE.MathUtils.clamp(scratch.spherical.theta, desiredAngles.minAzimuthAngle, desiredAngles.maxAzimuthAngle);
    targetPosition.current.copy(targetLookAt.current).add(scratch.direction.setFromSpherical(scratch.spherical));
    return clamped.distance;
  }, [
    clampCameraTarget,
    controlsMaximumDistance,
    controlsMinimumDistance,
    desiredAngles,
  ]);
  const clampLunarSnapshot = useCallback((snapshot: LunarCameraSnapshot) => {
    const position = snapshot.position.clone();
    const target = snapshot.target.clone();
    clampCameraTarget(
      target,
      position,
      position.distanceTo(target),
      controlsMaximumDistance,
    );
    const clamped = clampCommercialMapCameraPosition({
      position: position.toArray() as [number, number, number],
      target: target.toArray() as [number, number, number],
      minDistance: controlsMinimumDistance,
      maxDistance: controlsMaximumDistance,
    });
    snapshot.position.set(...clamped.position);
    snapshot.target.copy(target);
    snapshot.near = resolveCommercialMapCameraNearPlane(
      clamped.distance,
      snapshot.position.y,
    );
    snapshot.far = cameraFarPlane;
    return snapshot;
  }, [
    cameraFarPlane,
    clampCameraTarget,
    controlsMaximumDistance,
    controlsMinimumDistance,
  ]);
  const writeCameraDiagnostics = useCallback((force = false) => {
    if (!import.meta.env.DEV || !(camera instanceof THREE.PerspectiveCamera)) return;
    const now = typeof performance === 'undefined' ? Date.now() : performance.now();
    if (!force && now - cameraDiagnosticsAt.current < 90) return;
    cameraDiagnosticsAt.current = now;
    const target = controlsRef.current?.target ?? targetLookAt.current;
    gl.domElement.dataset.commercialMapCameraDiagnostics = JSON.stringify({
      position: camera.position.toArray().map((value) => Number(value.toFixed(4))),
      target: target.toArray().map((value) => Number(value.toFixed(4))),
      quaternion: camera.quaternion.toArray().map((value) => Number(value.toFixed(6))),
      controlsEnabled: controlsRef.current?.enabled,
      interiorEntityId: interiorEntity?.id ?? null,
      fov: camera.fov,
      near: Number(camera.near.toFixed(5)),
      far: Number(camera.far.toFixed(3)),
      distance: Number(camera.position.distanceTo(target).toFixed(4)),
      minDistance: Number(appliedControlLimits.minDistance.toFixed(4)),
      maxDistance: Number(appliedControlLimits.maxDistance.toFixed(4)),
      desiredMinDistance: Number(effectiveControlsMinimumDistance.toFixed(4)),
      desiredMaxDistance: Number(effectiveControlsMaximumDistance.toFixed(4)),
      calculatedMaxDistance: Number(cameraDistanceBounds.maxDistance.toFixed(4)),
      boundingSphereRadius: Number(cameraDistanceBounds.boundingSphereRadius.toFixed(4)),
      viewport: {
        width: size.width,
        height: size.height,
        aspect: Number((size.width / Math.max(size.height, 1)).toFixed(5)),
        dpr: gl.getPixelRatio(),
      },
    });
  }, [
    appliedControlLimits.maxDistance,
    appliedControlLimits.minDistance,
    camera,
    cameraDistanceBounds.boundingSphereRadius,
    cameraDistanceBounds.maxDistance,
    effectiveControlsMaximumDistance,
    effectiveControlsMinimumDistance,
    gl,
    interiorEntity,
    size.height,
    size.width,
  ]);
  const startCameraMove = useCallback((
    minDistance = controlsMinimumDistance,
    maxDistance = controlsMaximumDistance,
    clampTarget = true,
    nextLens: Partial<CameraLensState> = {},
    source = 'navigation',
  ) => {
    clampQueuedCameraPose(minDistance, maxDistance, clampTarget);
    const controls = controlsRef.current;
    const currentTarget = controls?.target ?? targetLookAt.current;
    const currentDistance = camera.position.distanceTo(currentTarget);
    const scratch = transitionScratch.current;
    scratch.spherical.setFromVector3(scratch.direction.subVectors(camera.position, currentTarget));
    setAppliedAngles(expandCommercialMapControlAngles(
      desiredAngles,
      scratch.spherical.phi,
      scratch.spherical.theta,
    ));
    setAppliedControlLimits((previous) => ({
      minDistance: Math.min(previous.minDistance, minDistance, currentDistance),
      maxDistance: Math.max(previous.maxDistance, maxDistance, currentDistance),
    }));
    if (camera instanceof THREE.PerspectiveCamera) {
      const transition = cameraTransition.current;
      transition.active = true;
      transition.sequence += 1;
      transition.source = source;
      transition.startedAt = typeof performance === 'undefined' ? Date.now() : performance.now();
      transition.fromPosition.copy(camera.position);
      transition.fromTarget.copy(currentTarget);
      transition.fromQuaternion.copy(camera.quaternion);
      if (controls) {
        // Drain residual OrbitControls damping without changing the visible pose.
        controls.enabled = false;
        controls.enableDamping = false;
        controls.update();
        camera.position.copy(transition.fromPosition);
        controls.target.copy(transition.fromTarget);
        camera.quaternion.copy(transition.fromQuaternion);
      }
      transition.fromLens = {
        fov: camera.fov,
        near: camera.near,
        far: camera.far,
        zoom: camera.zoom,
      };
      transition.toPosition.copy(targetPosition.current);
      transition.toTarget.copy(targetLookAt.current);
      transitionScratch.current.matrix.lookAt(
        transition.toPosition,
        transition.toTarget,
        transitionScratch.current.up,
      );
      transition.toQuaternion.setFromRotationMatrix(transitionScratch.current.matrix);
      transition.toLens = {
        fov: nextLens.fov ?? camera.fov,
        near: nextLens.near ?? resolveCommercialMapCameraNearPlane(
          transition.toPosition.distanceTo(transition.toTarget),
          transition.toPosition.y,
        ),
        far: nextLens.far ?? cameraFarPlane,
        zoom: nextLens.zoom ?? camera.zoom,
      };
      const travel = transition.fromPosition.distanceTo(transition.toPosition)
        + transition.fromTarget.distanceTo(transition.toTarget) * 0.65;
      transition.durationMs = resolveCameraTransitionDuration(travel);
      gl.domElement.dataset.commercialMapCameraTransition = JSON.stringify({
        status: 'running',
        source,
        sequence: transition.sequence,
        startedAt: Number(transition.startedAt.toFixed(2)),
        durationMs: Number(transition.durationMs.toFixed(2)),
      });
    }
    if (controls) controls.enabled = false;
    navigation.current.active = false;
    navigation.current.navigating = false;
    navigation.current.settling = false;
    setTransitionControlsLocked(true);
    setCameraNavigating(true);
    preserveManualView.current = false;
    animating.current = true;
    invalidate();
  }, [
    camera,
    cameraFarPlane,
    clampQueuedCameraPose,
    controlsMaximumDistance,
    controlsMinimumDistance,
    desiredAngles,
    gl,
    invalidate,
    setCameraNavigating,
  ]);

  const cancelCameraTransition = useCallback((preserveView = true) => {
    const transition = cameraTransition.current;
    if (!transition.active) return;
    transition.active = false;
    animating.current = false;
    const controls = controlsRef.current;
    if (controls) {
      // Quaternion and target interpolation need not have the same intermediate
      // look ray. Align the orbit pivot before yielding to the first gesture.
      const handoff = prepareOrbitControlsForTransitionHandoff(
        camera,
        controls,
        desiredAngles,
        effectiveControlsMinimumDistance,
        effectiveControlsMaximumDistance,
        transitionScratch.current,
      );
      setAppliedAngles(handoff.angles);
      setAppliedControlLimits(handoff.limits);
      if (!lunarCameraLockedRef.current) {
        controls.enabled = true;
        controls.enableDamping = true;
        controls.enablePan = interiorFrame?.enablePan ?? true;
        controls.enableRotate = true;
        controls.enableZoom = true;
        controls.zoomToCursor = interiorFrame?.zoomToCursor ?? !miranteSelected;
      }
    }
    targetPosition.current.copy(camera.position);
    targetLookAt.current.copy(controls?.target ?? targetLookAt.current);
    if (preserveView) preserveManualView.current = true;
    navigation.current.active = false;
    navigation.current.navigating = false;
    navigation.current.settling = false;
    setTransitionControlsLocked(false);
    setCameraNavigating(false);
    gl.domElement.dataset.commercialMapCameraTransition = JSON.stringify({
      status: 'cancelled',
      sequence: transition.sequence,
      cancelledAt: Number((typeof performance === 'undefined' ? Date.now() : performance.now()).toFixed(2)),
    });
    invalidate();
  }, [
    camera,
    desiredAngles,
    effectiveControlsMaximumDistance,
    effectiveControlsMinimumDistance,
    gl,
    interiorFrame,
    invalidate,
    miranteSelected,
    setCameraNavigating,
  ]);

  useEffect(() => {
    const interruptTransition = () => cancelCameraTransition(true);
    const canvas = gl.domElement;
    canvas.addEventListener('pointerdown', interruptTransition, true);
    canvas.addEventListener('wheel', interruptTransition, { capture: true, passive: true });
    return () => {
      canvas.removeEventListener('pointerdown', interruptTransition, true);
      canvas.removeEventListener('wheel', interruptTransition, true);
    };
  }, [cancelCameraTransition, gl]);

  useEffect(() => {
    let pausedAt: number | null = null;
    const handleVisibility = () => {
      const now = performance.now();
      if (document.hidden) {
        pausedAt ??= now;
        return;
      }
      if (pausedAt !== null) {
        const elapsed = now - pausedAt;
        if (cameraTransition.current.active) cameraTransition.current.startedAt += elapsed;
        if (lunarPath.current.active) {
          lunarPath.current.startedAt += elapsed;
          const startedAt = useCommercialMapStore.getState().lunarLaunchStartedAt;
          if (startedAt !== null) useCommercialMapStore.setState({ lunarLaunchStartedAt: startedAt + elapsed });
        }
        if (lunarPath.current.returning) lunarPath.current.returnStartedAt += elapsed;
        pausedAt = null;
      }
      invalidate();
    };
    const restoreFrame = () => invalidate();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pageshow', restoreFrame);
    gl.domElement.addEventListener('webglcontextrestored', restoreFrame);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', restoreFrame);
      gl.domElement.removeEventListener('webglcontextrestored', restoreFrame);
    };
  }, [gl, invalidate]);

  const enforceDesiredCameraLimits = useCallback(() => {
    const controls = controlsRef.current;
    const currentTarget = controls?.target ?? targetLookAt.current;
    targetPosition.current.copy(camera.position);
    targetLookAt.current.copy(currentTarget);
    clampQueuedCameraPose(
      effectiveControlsMinimumDistance,
      effectiveControlsMaximumDistance,
    );
    const needsMotion = camera.position.distanceTo(targetPosition.current) > 0.0001
      || currentTarget.distanceTo(targetLookAt.current) > 0.0001;
    if (needsMotion) {
      startCameraMove(effectiveControlsMinimumDistance, effectiveControlsMaximumDistance, true, interiorFrame ?? {}, 'safety-limits');
      preserveManualView.current = true;
      return true;
    }
    setAppliedControlLimits({
      minDistance: effectiveControlsMinimumDistance,
      maxDistance: effectiveControlsMaximumDistance,
    });
    setAppliedAngles(desiredAngles);
    return false;
  }, [
    camera,
    clampQueuedCameraPose,
    desiredAngles,
    effectiveControlsMaximumDistance,
    effectiveControlsMinimumDistance,
    interiorFrame,
    startCameraMove,
  ]);

  useEffect(() => {
    if (lunarCameraLockedRef.current || !(camera instanceof THREE.PerspectiveCamera)) return;
    if (interiorEntity && !interiorFrame) return;
    if (navigation.current.active || navigation.current.settling) {
      const activeTarget = controlsRef.current?.target ?? targetLookAt.current;
      const currentDistance = camera.position.distanceTo(activeTarget);
      setAppliedControlLimits((previous) => ({
        minDistance: Math.min(
          previous.minDistance,
          effectiveControlsMinimumDistance,
          currentDistance,
        ),
        maxDistance: Math.max(
          previous.maxDistance,
          effectiveControlsMaximumDistance,
          currentDistance,
        ),
      }));
      invalidate();
      return;
    }
    if (animating.current) {
      invalidate();
      return;
    }
    const activeTarget = controlsRef.current?.target ?? targetLookAt.current;
    const desiredTarget = activeTarget.clone();
    const desiredPosition = camera.position.clone();
    clampCameraTarget(
      desiredTarget,
      desiredPosition,
      desiredPosition.distanceTo(desiredTarget),
      effectiveControlsMaximumDistance,
    );
    const clamped = clampCommercialMapCameraPosition({
      position: desiredPosition.toArray() as [number, number, number],
      target: desiredTarget.toArray() as [number, number, number],
      minDistance: effectiveControlsMinimumDistance,
      maxDistance: effectiveControlsMaximumDistance,
    });
    const targetWasClamped = desiredTarget.distanceTo(activeTarget) > 0.0001;
    if (clamped.wasClamped || targetWasClamped) {
      const currentDistance = camera.position.distanceTo(activeTarget);
      setAppliedControlLimits((previous) => ({
        minDistance: Math.min(
          previous.minDistance,
          effectiveControlsMinimumDistance,
          currentDistance,
        ),
        maxDistance: Math.max(
          previous.maxDistance,
          effectiveControlsMaximumDistance,
          currentDistance,
        ),
      }));
      targetPosition.current.set(...clamped.position);
      targetLookAt.current.copy(desiredTarget);
      startCameraMove(effectiveControlsMinimumDistance, effectiveControlsMaximumDistance, true, interiorFrame ?? {}, 'viewport-limits');
      preserveManualView.current = true;
    } else if (!animating.current) {
      setAppliedControlLimits({
        minDistance: effectiveControlsMinimumDistance,
        maxDistance: effectiveControlsMaximumDistance,
      });
    }
    invalidate();
  }, [
    camera,
    cameraFarPlane,
    clampCameraTarget,
    effectiveControlsMaximumDistance,
    effectiveControlsMinimumDistance,
    interiorEntity,
    interiorFrame,
    invalidate,
    startCameraMove,
  ]);

  const queuePreset = useCallback((nextPreset: CameraPreset) => {
    setParkingControlLimits(null);
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
    startCameraMove(
      cameraDistanceBounds.minDistance,
      cameraDistanceBounds.maxDistance,
      true,
      { fov: 38, near: Math.max(0.05, distance / 1600), far: cameraFarPlane, zoom: 1 },
      `preset:${nextPreset}`,
    );
  }, [
    camera,
    cameraDistanceBounds.maxDistance,
    cameraDistanceBounds.minDistance,
    cameraFarPlane,
    extent,
    hydrologicalModeActive,
    size.height,
    size.width,
    startCameraMove,
  ]);

  const queueSelection = useCallback((entity: MapEntity) => {
    setParkingControlLimits(null);
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
      if (landmarkKind === 'mirante-pavilion' || landmarkKind === 'lactalis-cultural-stage') direction.copy(deterministicDirection);
      else direction.lerp(deterministicDirection, 0.92).normalize();
    }
    const compactStage = landmarkKind === 'lactalis-cultural-stage';
    const minimumDirectionY = compactStage && aspect < 0.72
      ? LACTALIS_STAGE_LAYOUT.camera.focusPortraitMinimumDirectionY
      : focusProfile.minimumDirectionY;
    direction.y = Math.max(direction.y, minimumDirectionY);
    direction.normalize();
    const fittedDistance = fitDistanceForDirection(
      entityExtent,
      perspective.fov || 38,
      aspect,
      direction,
      focusProfile.fitPadding,
      compactStage ? LACTALIS_STAGE_LAYOUT.camera.minimumDistance : undefined,
    );
    const fittedSelectionDistance = THREE.MathUtils.clamp(
      Math.max(fittedDistance, compactStage ? LACTALIS_STAGE_LAYOUT.camera.focusedDistance : extent.diagonal * focusProfile.contextRatio),
      compactStage ? LACTALIS_STAGE_LAYOUT.camera.minimumDistance : Math.max(10, extent.diagonal * focusProfile.minDistanceRatio),
      controlsMaximumDistance,
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
    startCameraMove(
      controlsMinimumDistance,
      controlsMaximumDistance,
      true,
      { fov: 38, near: Math.max(0.035, distance / 1600), far: cameraFarPlane, zoom: 1 },
      `selection:${entity.id}`,
    );
  }, [
    activePanel,
    camera,
    cameraFarPlane,
    controlsMaximumDistance,
    controlsMinimumDistance,
    extent,
    size.height,
    size.width,
    startCameraMove,
  ]);

  const queueSegment = useCallback((segment: CommercialMapSegmentDefinition, segmentEntities: MapEntity[]) => {
    setParkingControlLimits(null);
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
      controlsMaximumDistance,
    );
    targetLookAt.current.copy(lookAt);
    targetPosition.current.copy(lookAt).add(direction.multiplyScalar(distance));
    startCameraMove(
      controlsMinimumDistance,
      controlsMaximumDistance,
      true,
      { fov: 38, near: Math.max(0.04, distance / 1600), far: cameraFarPlane, zoom: 1 },
      `segment:${segment.id}`,
    );
  }, [
    camera,
    cameraFarPlane,
    controlsMaximumDistance,
    controlsMinimumDistance,
    preset,
    queuePreset,
    size.height,
    size.width,
    startCameraMove,
  ]);

  const queueParking = useCallback(() => {
    const insets = resolveParkingViewportInsets(size.width, size.height);
    const canvasRect = gl.domElement.getBoundingClientRect();
    const panelRect = gl.domElement.closest('.commercial-map-viewport')
      ?.querySelector<HTMLElement>('[data-parking-inspector]')
      ?.getBoundingClientRect();
    if (panelRect && panelRect.width > 0 && panelRect.height > 0 && canvasRect.height > 0) {
      const useSideClearance = size.width >= 740 && size.height <= 540 && size.width > size.height;
      if (useSideClearance) insets.left = Math.max(insets.left, panelRect.right - canvasRect.left + 12);
      else insets.bottom = Math.max(insets.bottom, canvasRect.bottom - panelRect.top + 12);
    }
    const frame = resolveParkingCameraFrame({
      bounds: parkingFocusBounds,
      view: parkingCameraView,
      viewportWidth: size.width,
      viewportHeight: size.height,
      insets,
    });
    const limits = {
      minDistance: Math.min(frame.minDistance, cameraDistanceBounds.maxDistance),
      maxDistance: cameraDistanceBounds.maxDistance,
    };
    setParkingControlLimits((previous) => (
      previous?.minDistance === limits.minDistance && previous.maxDistance === limits.maxDistance
        ? previous
        : limits
    ));
    const controls = controlsRef.current;
    if (controls) {
      controls.minDistance = limits.minDistance;
      controls.maxDistance = limits.maxDistance;
    }
    targetPosition.current.set(...frame.position);
    targetLookAt.current.set(...frame.target);
    startCameraMove(
      limits.minDistance,
      limits.maxDistance,
      false,
      { fov: frame.fov, near: frame.near, far: Math.max(frame.far, cameraFarPlane), zoom: 1 },
      `parking:${parkingCameraView}`,
    );
  }, [
    cameraDistanceBounds.maxDistance,
    cameraFarPlane,
    gl,
    parkingCameraView,
    parkingFocusBounds,
    size.height,
    size.width,
    startCameraMove,
  ]);

  const queueInterior = useCallback(() => {
    if (!interiorFrame) return;
    setParkingControlLimits(null);
    targetPosition.current.copy(interiorFrame.position);
    targetLookAt.current.copy(interiorFrame.target);
    startCameraMove(interiorFrame.minDistance, interiorFrame.maxDistance, true, { ...interiorFrame, zoom: 1 }, `interior:${interiorFrame.entityId}`);
  }, [interiorFrame, startCameraMove]);

  resizeRefitView.current = () => {
    // Panel/viewport resizing must not undo a manual orbit, zoom or a close-up
    // just deselected. R3F updates the aspect; only an explicit focus resets it.
    if (preserveManualView.current) return;
    if (interiorEntity) queueInterior();
    else if (parkingActive) queueParking();
    else if (selectedEntity) queueSelection(selectedEntity);
    else if (activeSegment) queueSegment(activeSegment, activeSegmentEntities);
    else queuePreset(preset);
  };

  const cancelScheduledResizeRefit = useCallback(() => {
    if (resizeRefitTimer.current === null) return;
    window.clearTimeout(resizeRefitTimer.current);
    resizeRefitTimer.current = null;
  }, []);

  const captureLunarCamera = useCallback((): LunarCameraSnapshot | null => {
    const controls = controlsRef.current;
    if (!controls || !(camera instanceof THREE.PerspectiveCamera)) return null;
    return {
      position: camera.position.clone(),
      target: controls.target.clone(),
      quaternion: camera.quaternion.clone(),
      fov: camera.fov,
      near: camera.near,
      far: camera.far,
      zoom: camera.zoom,
      exposure: gl.toneMappingExposure,
      controls: {
        enabled: controls.enabled,
        enableDamping: controls.enableDamping,
        dampingFactor: controls.dampingFactor,
        enablePan: controls.enablePan,
        enableRotate: controls.enableRotate,
        enableZoom: controls.enableZoom,
        zoomToCursor: controls.zoomToCursor,
        autoRotate: controls.autoRotate,
      },
    };
  }, [camera, gl]);

  const lockLunarCamera = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.enabled = false;
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.enableRotate = false;
    controls.enableZoom = false;
    controls.autoRotate = false;
    navigation.current.active = false;
    navigation.current.navigating = false;
    gl.domElement.style.cursor = 'default';
  }, [gl]);

  const restoreLunarControlState = useCallback((snapshot: LunarCameraSnapshot) => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.enabled = snapshot.controls.enabled;
    controls.enableDamping = snapshot.controls.enableDamping;
    controls.dampingFactor = snapshot.controls.dampingFactor;
    controls.enablePan = snapshot.controls.enablePan;
    controls.enableRotate = snapshot.controls.enableRotate;
    controls.enableZoom = snapshot.controls.enableZoom;
    controls.zoomToCursor = snapshot.controls.zoomToCursor;
    controls.autoRotate = snapshot.controls.autoRotate;
    gl.domElement.style.cursor = snapshot.controls.enabled ? 'grab' : '';
  }, [gl]);

  const restoreLunarCamera = useCallback((snapshot: LunarCameraSnapshot) => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const controls = controlsRef.current;
    const safeSnapshot = clampLunarSnapshot(snapshot);
    animating.current = false;
    camera.position.copy(safeSnapshot.position);
    camera.quaternion.copy(safeSnapshot.quaternion);
    camera.fov = safeSnapshot.fov;
    camera.near = safeSnapshot.near;
    camera.far = cameraFarPlane;
    camera.zoom = safeSnapshot.zoom;
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.copy(safeSnapshot.target);
      restoreLunarControlState(safeSnapshot);
      controls.minDistance = controlsMinimumDistance;
      controls.maxDistance = controlsMaximumDistance;
      controls.update();
      // Preserve any deliberate camera roll even though OrbitControls normally has none.
      camera.quaternion.copy(safeSnapshot.quaternion);
    }
    setAppliedControlLimits({
      minDistance: controlsMinimumDistance,
      maxDistance: controlsMaximumDistance,
    });
    gl.toneMappingExposure = safeSnapshot.exposure;
    invalidate();
  }, [
    camera,
    cameraFarPlane,
    clampLunarSnapshot,
    controlsMaximumDistance,
    controlsMinimumDistance,
    gl,
    invalidate,
    restoreLunarControlState,
  ]);
  const restoreLunarCameraRef = useRef(restoreLunarCamera);
  useEffect(() => {
    restoreLunarCameraRef.current = restoreLunarCamera;
  }, [restoreLunarCamera]);

  const configureLunarPath = useCallback(() => {
    if (!lunarTreeEntity || !(camera instanceof THREE.PerspectiveCamera)) return false;
    const path = lunarPath.current;
    const scratch = lunarScratch.current;
    const bounds = strategicLandmarkBounds(lunarTreeEntity);
    const facing = strategicLandmarkFacingRadians(lunarTreeEntity);
    const offsetX = APOLLO_XIV_LAYOUT.replicaOffset[0];
    const offsetZ = APOLLO_XIV_LAYOUT.replicaOffset[1];
    const cosine = Math.cos(facing);
    const sine = Math.sin(facing);
    path.anchor.set(
      bounds.centerX + cosine * offsetX + sine * offsetZ,
      lunarTreeEntity.geometry.elevation,
      bounds.centerZ - sine * offsetX + cosine * offsetZ,
    );
    path.rocketHeight = apolloXivReplicaHeight(
      strategicLandmarkVisualHeight(lunarTreeEntity) ?? lunarTreeEntity.geometry.extrusionHeight,
    );
    path.mapTarget.set(
      extent.centerX,
      Math.min(1.6, extent.maxHeight * 0.1),
      extent.centerZ,
    );
    const clearViewPosition = path.active && path.snapshot
      ? path.snapshot.position
      : camera.position;
    path.outward.copy(clearViewPosition).sub(path.anchor);
    path.outward.y = 0;
    if (path.outward.lengthSq() < 0.001) {
      const fallbackYaw = facing + APOLLO_XIV_LAYOUT.displayYaw;
      path.outward.set(Math.sin(fallbackYaw), 0, Math.cos(fallbackYaw));
    } else path.outward.normalize();
    path.side.set(-path.outward.z, 0, path.outward.x).normalize();

    const mobile = Math.min(size.width, size.height) <= 720;
    const portrait = size.height > size.width * 1.04;
    path.exteriorDistance = Math.max(
      mobile ? 8.4 : 11.5,
      path.rocketHeight * (portrait ? 2.4 : mobile ? 2.55 : 3.2),
    );
    path.exteriorSideOffset = mobile
      ? path.rocketHeight * (portrait ? 1.18 : 1.42)
      : 0;
    path.exteriorHeightRatio = mobile ? (portrait ? 1.54 : 1.62) : 1.35;
    path.exteriorTargetHeightRatio = mobile ? (portrait ? 0.58 : 0.62) : 0.5;
    path.chaseDistance = path.rocketHeight * (portrait ? 1.04 : mobile ? 1.18 : 1.3);
    path.chaseSideOffset = path.rocketHeight * (portrait ? 0.38 : mobile ? 0.48 : 0.58);
    path.exteriorFov = portrait ? 43 : mobile ? 40 : 36;
    path.chaseFov = portrait ? 45 : mobile ? 42 : 39;
    path.finalFov = portrait ? 42 : mobile ? 40 : 38;

    writeLunarExteriorPose(path, 0, path.exteriorPosition, path.exteriorTarget);
    writeLunarChasePose(
      path,
      lunarLaunchAltitudeAt(
        LUNAR_LAUNCH_TIMELINE.completionStart,
        extent.diagonal,
        path.rocketHeight,
      ),
      path.completionPosition,
      path.completionTarget,
    );

    path.finalTarget.copy(path.mapTarget);
    scratch.fromPosition.set(
      portrait ? 0.06 : 0.22,
      portrait ? 0.93 : mobile ? 0.88 : 0.84,
      portrait ? 0.37 : 0.48,
    ).normalize();
    const finalDistance = fitDistanceForDirection(
      extent,
      path.finalFov,
      size.width / Math.max(size.height, 1),
      scratch.fromPosition,
      portrait ? 0.94 : mobile ? 0.98 : 1.04,
    );
    path.finalPosition.copy(path.finalTarget).addScaledVector(scratch.fromPosition, finalDistance);
    const clampedFinal = clampCommercialMapCameraPosition({
      position: path.finalPosition.toArray() as [number, number, number],
      target: path.finalTarget.toArray() as [number, number, number],
      minDistance: controlsMinimumDistance,
      maxDistance: controlsMaximumDistance,
    });
    path.finalPosition.set(...clampedFinal.position);
    return true;
  }, [
    camera,
    controlsMaximumDistance,
    controlsMinimumDistance,
    extent,
    lunarTreeEntity,
    size.height,
    size.width,
  ]);

  const scheduleResizeRefit = useCallback(() => {
    if (
      lunarCameraLockedRef.current
      || shouldSuppressCommercialMapResizeRefit(Date.now(), resizeRefitSuppressedUntil.current)
    ) {
      pendingResizeRefit.current = false;
      cancelScheduledResizeRefit();
      return;
    }
    pendingResizeRefit.current = true;
    cancelScheduledResizeRefit();
    if (navigation.current.active) return;

    const runRefit = () => {
      resizeRefitTimer.current = null;
      if (navigation.current.active || lunarCameraLockedRef.current) return;
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

  // Claim the next frame during commit, before panel effects can schedule work.
  // Camera coordinates still change only inside the single frame controller.
  useLayoutEffect(() => {
    const selectedId = selectedEntity?.id ?? null;
    const interiorId = interiorEntity?.id ?? null;
    const interiorChanged = interiorId !== previousInterior.current;
    const exitingInterior = !interiorId && previousInterior.current !== null;
    const selectionChanged = selectedId !== previousSelection.current;
    const segmentId = activeSegment?.id ?? null;
    const segmentChanged = segmentId !== previousSegment.current;
    const presetChanged = preset !== previousPreset.current;
    const sequenceChanged = cameraSequence !== previousSequence.current;
    const detailsLayoutChanged = (activePanel === 'details') !== previousDetailsLayout.current;
    const parkingChanged = parkingActive && (
      !previousParking.current.active
      || previousParking.current.sequence !== parkingCameraSequence
      || previousParking.current.blockId !== selectedParkingBlockId
      || previousParking.current.spaceId !== selectedParkingSpaceId
      || previousParking.current.view !== parkingCameraView
    );
    const parkingClosed = previousParking.current.active && !parkingActive;
    const suppressDetailsRefit = detailsLayoutChanged && suppressNextDetailsRefit.current;

    if (lunarCameraLocked) {
      previousSelection.current = selectedId;
      previousPreset.current = preset;
      previousSequence.current = cameraSequence;
      previousSegment.current = segmentId;
      previousDetailsLayout.current = activePanel === 'details';
      return;
    }
    if (suppressDetailsRefit) suppressNextDetailsRefit.current = false;

    if (interiorEntity) {
      if (previousInterior.current === null) {
        cancelCameraTransition(true);
        const controls = controlsRef.current;
        if (controls && camera instanceof THREE.PerspectiveCamera) {
          useCommercialMapStore.getState().setInteriorReturnView({
            position: camera.position.toArray() as [number, number, number],
            target: controls.target.toArray() as [number, number, number],
          });
          interiorReturnLens.current = { fov: camera.fov, near: camera.near, far: camera.far, zoom: camera.zoom };
        }
      }
      if (interiorFrame && (interiorChanged || interiorFrame !== previousInteriorFrame.current)) queueInterior();
      previousInterior.current = interiorId;
      previousInteriorFrame.current = interiorFrame;
      previousSelection.current = selectedId;
      previousPreset.current = preset;
      previousSequence.current = cameraSequence;
      previousSegment.current = segmentId;
      previousDetailsLayout.current = activePanel === 'details';
      initialized.current = true;
      return;
    }

    if (exitingInterior) {
      const snapshot = useCommercialMapStore.getState().interiorReturnView;
      if (snapshot) {
        targetPosition.current.set(...snapshot.position);
        targetLookAt.current.set(...snapshot.target);
        startCameraMove(controlsMinimumDistance, controlsMaximumDistance, true, interiorReturnLens.current ?? { fov: 38, far: cameraFarPlane, zoom: 1 }, 'interior-return');
        preserveManualView.current = true;
        useCommercialMapStore.getState().setInteriorReturnView(null);
        interiorReturnLens.current = null;
      } else if (selectedEntity) queueSelection(selectedEntity);
      else if (activeSegment) queueSegment(activeSegment, activeSegmentEntities);
      else queuePreset(preset);
    } else if (!initialized.current) {
      if (parkingActive) queueParking();
      else if (returnView.current) {
        targetPosition.current.set(...returnView.current.position);
        targetLookAt.current.set(...returnView.current.target);
        startCameraMove(
          cameraDistanceBounds.minDistance,
          cameraDistanceBounds.maxDistance,
          true,
          { fov: 38, far: cameraFarPlane, zoom: 1 },
          'interior-return',
        );
        returnView.current = null;
        useCommercialMapStore.getState().setInteriorReturnView(null);
      } else if (selectedEntity) queueSelection(selectedEntity);
      else if (activeSegment) queueSegment(activeSegment, activeSegmentEntities);
      else queuePreset(preset);
      initialized.current = true;
    } else if (parkingActive) {
      // Opening parking clears the ordinary selection in the same store update;
      // do not let selectionChanged cancel the newly requested parking frame.
      if (parkingChanged) {
        cancelScheduledResizeRefit();
        pendingResizeRefit.current = false;
        queueParking();
      }
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
    } else if (parkingClosed) {
      cancelCameraTransition(true);
      preserveManualView.current = true;
      cancelScheduledResizeRefit();
      pendingResizeRefit.current = false;
      targetPosition.current.copy(camera.position);
      targetLookAt.current.copy(controlsRef.current?.target ?? targetLookAt.current);
      clampQueuedCameraPose(controlsMinimumDistance, controlsMaximumDistance);
      const needsSafetyTransition = camera.position.distanceTo(targetPosition.current) > 0.0001
        || (controlsRef.current?.target.distanceTo(targetLookAt.current) ?? 0) > 0.0001;
      setParkingControlLimits(null);
      if (needsSafetyTransition) {
        const currentDistance = camera.position.distanceTo(
          controlsRef.current?.target ?? targetLookAt.current,
        );
        setAppliedControlLimits({
          minDistance: Math.min(controlsMinimumDistance, currentDistance),
          maxDistance: Math.max(controlsMaximumDistance, currentDistance),
        });
        startCameraMove(controlsMinimumDistance, controlsMaximumDistance, true, {}, 'parking-return-limits');
        preserveManualView.current = true;
      } else {
        animating.current = false;
        setAppliedControlLimits({
          minDistance: controlsMinimumDistance,
          maxDistance: controlsMaximumDistance,
        });
      }
    } else if (selectionChanged && !selectedEntity) {
      cancelCameraTransition(true);
      preserveManualView.current = true;
      cancelScheduledResizeRefit();
      pendingResizeRefit.current = false;
      animating.current = false;
    } else if (detailsLayoutChanged && selectedEntity && !suppressDetailsRefit) {
      queueSelection(selectedEntity);
    }

    previousSelection.current = selectedId;
    previousInterior.current = interiorId;
    previousInteriorFrame.current = null;
    previousPreset.current = preset;
    previousSequence.current = cameraSequence;
    previousSegment.current = segmentId;
    previousDetailsLayout.current = activePanel === 'details';
    previousParking.current = {
      active: parkingActive,
      sequence: parkingCameraSequence,
      blockId: selectedParkingBlockId,
      spaceId: selectedParkingSpaceId,
      view: parkingCameraView,
    };
  }, [
    activePanel,
    activeSegment,
    activeSegmentEntities,
    camera,
    cameraDistanceBounds.maxDistance,
    cameraDistanceBounds.minDistance,
    cameraFarPlane,
    cameraSequence,
    cancelCameraTransition,
    cancelScheduledResizeRefit,
    clampQueuedCameraPose,
    controlsMaximumDistance,
    controlsMinimumDistance,
    interiorEntity,
    interiorFrame,
    invalidate,
    parkingActive,
    parkingCameraSequence,
    parkingCameraView,
    lunarCameraLocked,
    preset,
    queueParking,
    queueInterior,
    queuePreset,
    queueSegment,
    queueSelection,
    selectedEntity,
    selectedParkingBlockId,
    selectedParkingSpaceId,
    startCameraMove,
  ]);

  useEffect(() => {
    const previous = previousViewportSize.current;
    const resized = Math.abs(previous.width - size.width) >= 2
      || Math.abs(previous.height - size.height) >= 2;

    if (!resized || !initialized.current) return undefined;
    previousViewportSize.current = { width: size.width, height: size.height };

    if (lunarCameraLocked) return undefined;

    scheduleResizeRefit();
    return undefined;
  }, [
    scheduleResizeRefit,
    size.height,
    size.width,
    lunarCameraLocked,
  ]);

  const clampTarget = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    clampCameraTarget(
      controls.target,
      camera.position,
      camera.position.distanceTo(controls.target),
      effectiveControlsMaximumDistance,
    );
  }, [camera, clampCameraTarget, effectiveControlsMaximumDistance]);

  const handleControlsStart = useCallback(() => {
    if (lunarCameraLockedRef.current) return;
    const controls = controlsRef.current;
    const alreadyNavigating = navigation.current.navigating
      || navigation.current.settling;
    const currentTarget = controls?.target ?? targetLookAt.current;
    const currentDistance = camera.position.distanceTo(currentTarget);
    cancelScheduledResizeRefit();
    animating.current = false;
    setAppliedControlLimits({
      minDistance: Math.min(effectiveControlsMinimumDistance, currentDistance),
      maxDistance: Math.max(effectiveControlsMaximumDistance, currentDistance),
    });
    navigation.current.active = true;
    navigation.current.navigating = alreadyNavigating;
    navigation.current.settling = false;
    navigation.current.stableFrames = 0;
    navigation.current.startPosition.copy(camera.position);
    navigation.current.startTarget.copy(controls?.target ?? targetLookAt.current);
  }, [
    camera,
    cancelScheduledResizeRefit,
    effectiveControlsMaximumDistance,
    effectiveControlsMinimumDistance,
  ]);

  const handleControlsChange = useCallback(() => {
    if (lunarCameraLockedRef.current || cameraTransition.current.active) return;
    const controls = controlsRef.current;
    clampTarget();
    if (controls && navigation.current.active) {
      const cameraDelta = camera.position.distanceTo(navigation.current.startPosition);
      const targetDelta = controls.target.distanceTo(navigation.current.startTarget);
      if (isCameraNavigationMovement(cameraDelta, targetDelta)) {
        preserveManualView.current = true;
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
    writeCameraDiagnostics();
    invalidate();
  }, [
    camera,
    cancelScheduledResizeRefit,
    clampTarget,
    gl,
    invalidate,
    setCameraNavigating,
    writeCameraDiagnostics,
  ]);

  const handleControlsEnd = useCallback(() => {
    if (lunarCameraLockedRef.current) return;
    const wasNavigating = navigation.current.navigating;
    navigation.current.active = false;
    if (wasNavigating) {
      navigation.current.settling = true;
      navigation.current.stableFrames = 0;
      navigation.current.lastPosition.copy(camera.position);
      navigation.current.lastTarget.copy(controlsRef.current?.target ?? targetLookAt.current);
      gl.domElement.style.cursor = 'grabbing';
    } else {
      navigation.current.navigating = false;
      navigation.current.settling = false;
      enforceDesiredCameraLimits();
    }
    if (pendingResizeRefit.current && !wasNavigating) scheduleResizeRefit();
    else pendingResizeRefit.current = false;
    invalidate();
  }, [camera, enforceDesiredCameraLimits, gl, invalidate, scheduleResizeRefit]);

  useEffect(() => {
    if (
      lunarLaunchPhase === 'idle'
      || lunarLaunchSequence === lunarPath.current.sequence
    ) return;
    cancelCameraTransition(false);
    const snapshot = captureLunarCamera();
    if (!snapshot || !configureLunarPath()) {
      useCommercialMapStore.getState().completeLunarLaunch(true);
      return;
    }

    const path = lunarPath.current;
    path.snapshot = snapshot;
    path.active = true;
    path.returning = false;
    path.sequence = lunarLaunchSequence;
    path.startedAt = lunarLaunchStartedAt
      ?? (typeof performance === 'undefined' ? Date.now() : performance.now());
    path.lastPhase = 'ignition';
    animating.current = false;
    pendingResizeRefit.current = false;
    cancelScheduledResizeRefit();
    resizeRefitSuppressedUntil.current = Date.now()
      + (LUNAR_LAUNCH_TIMELINE.end + 1) * 1000;
    lockLunarCamera();
    invalidate();
  }, [
    cancelCameraTransition,
    cancelScheduledResizeRefit,
    captureLunarCamera,
    configureLunarPath,
    invalidate,
    lockLunarCamera,
    lunarLaunchPhase,
    lunarLaunchSequence,
    lunarLaunchStartedAt,
  ]);

  useEffect(() => {
    if (!lunarPath.current.active) return;
    configureLunarPath();
    invalidate();
  }, [configureLunarPath, invalidate, size.height, size.width]);

  useEffect(() => {
    const path = lunarPath.current;
    if (!lunarLaunchSkipRequested || !path.active || !path.snapshot) return;
    path.active = false;
    path.returning = false;
    suppressNextDetailsRefit.current = true;
    pendingResizeRefit.current = false;
    cancelScheduledResizeRefit();
    resizeRefitSuppressedUntil.current = 0;
    restoreLunarCamera(path.snapshot);
    useCommercialMapStore.getState().completeLunarLaunch(true);
  }, [cancelScheduledResizeRefit, lunarLaunchSkipRequested, restoreLunarCamera]);

  useEffect(() => {
    const path = lunarPath.current;
    if (
      lunarLaunchPhase !== 'idle'
      || (!path.active && !path.returning)
      || !path.snapshot
    ) return;
    path.active = false;
    path.returning = false;
    suppressNextDetailsRefit.current = true;
    pendingResizeRefit.current = false;
    cancelScheduledResizeRefit();
    resizeRefitSuppressedUntil.current = 0;
    restoreLunarCamera(path.snapshot);
    setCameraNavigating(false);
  }, [
    cancelScheduledResizeRefit,
    lunarLaunchPhase,
    restoreLunarCamera,
    setCameraNavigating,
  ]);

  useEffect(() => {
    const path = lunarPath.current;
    if (
      !lunarLaunchReturning
      || lunarLaunchReturnSequence === path.returnSequence
    ) return;
    // A return may be requested while an ordinary selection flight is running.
    // Release that controller's lock before the lunar timeline takes ownership.
    cancelCameraTransition(false);
    if (!path.snapshot || !(camera instanceof THREE.PerspectiveCamera)) {
      useCommercialMapStore.getState().completeLunarLaunchReturn();
      return;
    }
    const controls = controlsRef.current;
    clampLunarSnapshot(path.snapshot);
    path.returnSequence = lunarLaunchReturnSequence;
    path.returning = true;
    path.active = false;
    path.returnStartedAt = typeof performance === 'undefined' ? Date.now() : performance.now();
    path.returnPosition.copy(camera.position);
    path.returnTarget.copy(controls?.target ?? targetLookAt.current);
    path.returnQuaternion.copy(camera.quaternion);
    path.returnFov = camera.fov;
    path.returnNear = camera.near;
    path.returnFar = camera.far;
    path.returnZoom = camera.zoom;
    path.returnExposure = gl.toneMappingExposure;
    animating.current = false;
    pendingResizeRefit.current = false;
    cancelScheduledResizeRefit();
    resizeRefitSuppressedUntil.current = Date.now()
      + (LUNAR_CAMERA_RETURN_DURATION + 0.8) * 1000;
    lockLunarCamera();
    invalidate();
  }, [
    camera,
    cancelCameraTransition,
    cancelScheduledResizeRefit,
    clampLunarSnapshot,
    gl,
    invalidate,
    lockLunarCamera,
    lunarLaunchReturnSequence,
    lunarLaunchReturning,
  ]);

  useEffect(() => {
    const path = lunarPath.current;
    if (!path.returning || !path.snapshot || !(camera instanceof THREE.PerspectiveCamera)) {
      lunarReturnBoundsSignature.current = '';
      return;
    }
    const signature = [
      controlsMinimumDistance.toFixed(4),
      controlsMaximumDistance.toFixed(4),
      size.width.toFixed(2),
      size.height.toFixed(2),
    ].join(':');
    if (signature === lunarReturnBoundsSignature.current) return;
    lunarReturnBoundsSignature.current = signature;
    clampLunarSnapshot(path.snapshot);
    const controls = controlsRef.current;
    path.returnStartedAt = typeof performance === 'undefined' ? Date.now() : performance.now();
    path.returnPosition.copy(camera.position);
    path.returnTarget.copy(controls?.target ?? targetLookAt.current);
    path.returnQuaternion.copy(camera.quaternion);
    path.returnFov = camera.fov;
    path.returnNear = camera.near;
    path.returnFar = camera.far;
    path.returnZoom = camera.zoom;
    path.returnExposure = gl.toneMappingExposure;
    invalidate();
  }, [
    camera,
    clampLunarSnapshot,
    controlsMaximumDistance,
    controlsMinimumDistance,
    gl,
    invalidate,
    size.height,
    size.width,
  ]);

  useEffect(() => () => {
    cancelScheduledResizeRefit();
    pendingResizeRefit.current = false;
    resizeRefitSuppressedUntil.current = 0;
    const controls = controlsRef.current;
    const store = useCommercialMapStore.getState();
    const path = lunarPath.current;
    if ((path.active || path.returning) && path.snapshot) {
      restoreLunarCameraRef.current(path.snapshot);
    }
    if (store.lunarLaunchPhase !== 'idle') store.completeLunarLaunch(true);
    else if (store.lunarLaunchReturning) store.completeLunarLaunchReturn();
    else if (store.lunarLaunchReturnAvailable) store.resetLunarLaunch();
    path.active = false;
    path.returning = false;
    cameraTransition.current.active = false;
    setCameraNavigating(false);
    gl.domElement.style.cursor = '';
  }, [camera, cancelScheduledResizeRefit, gl, setCameraNavigating]);

  useFrame(() => {
    const path = lunarPath.current;
    const snapshot = path.snapshot;
    const perspective = camera instanceof THREE.PerspectiveCamera ? camera : null;
    const controls = controlsRef.current;
    const now = typeof performance === 'undefined' ? Date.now() : performance.now();

    if (path.returning && snapshot && perspective) {
      const progress = smootherstep(rangeProgress(
        (now - path.returnStartedAt) / 1000,
        0,
        LUNAR_CAMERA_RETURN_DURATION,
      ));
      const scratch = lunarScratch.current;
      scratch.position.lerpVectors(path.returnPosition, snapshot.position, progress);
      scratch.target.lerpVectors(path.returnTarget, snapshot.target, progress);
      scratch.quaternion.slerpQuaternions(path.returnQuaternion, snapshot.quaternion, progress);
      perspective.position.copy(scratch.position);
      perspective.quaternion.copy(scratch.quaternion);
      perspective.fov = THREE.MathUtils.lerp(path.returnFov, snapshot.fov, progress);
      perspective.near = THREE.MathUtils.lerp(path.returnNear, snapshot.near, progress);
      perspective.far = THREE.MathUtils.lerp(path.returnFar, snapshot.far, progress);
      perspective.zoom = THREE.MathUtils.lerp(path.returnZoom, snapshot.zoom, progress);
      perspective.updateProjectionMatrix();
      controls?.target.copy(scratch.target);
      gl.toneMappingExposure = THREE.MathUtils.lerp(
        path.returnExposure,
        snapshot.exposure,
        progress,
      );

      if (progress >= 0.99999) {
        path.returning = false;
        suppressNextDetailsRefit.current = true;
        restoreLunarCamera(snapshot);
        useCommercialMapStore.getState().completeLunarLaunchReturn();
      } else invalidate();
      return;
    }

    if (path.active && snapshot && perspective) {
      // Read the store synchronously as well as through the React subscription.
      // A skip requested during the 260 ms cleanup window must win over the
      // natural completion frame even if React has not committed the effect yet.
      const liveLaunchState = useCommercialMapStore.getState();
      if (liveLaunchState.lunarLaunchSkipRequested) {
        path.active = false;
        path.returning = false;
        suppressNextDetailsRefit.current = true;
        pendingResizeRefit.current = false;
        cancelScheduledResizeRefit();
        resizeRefitSuppressedUntil.current = 0;
        restoreLunarCamera(snapshot);
        liveLaunchState.completeLunarLaunch(true);
        return;
      }
      try {
        const elapsed = Math.max(0, (now - path.startedAt) / 1000);
        const sample = sampleLunarLaunchMotion(
          elapsed,
          extent.diagonal,
          path.rocketHeight,
          lunarScratch.current.motion,
        );
        const phase = sample.phase;
        const scratch = lunarScratch.current;
        let nextFov = path.exteriorFov;
        let nextZoom = 1;

        if (phase !== 'idle' && phase !== path.lastPhase) {
          path.lastPhase = phase;
          useCommercialMapStore.getState().setLunarLaunchPhase(phase, path.sequence);
        }

        if (elapsed < LUNAR_CAMERA_INITIAL_SETTLE_END) {
          const progress = smootherstep(rangeProgress(
            elapsed,
            0,
            LUNAR_CAMERA_INITIAL_SETTLE_END,
          ));
          writeLunarExteriorPose(path, 0, path.exteriorPosition, path.exteriorTarget);
          scratch.position.lerpVectors(snapshot.position, path.exteriorPosition, progress);
          scratch.target.lerpVectors(snapshot.target, path.exteriorTarget, progress);
          setLunarLookQuaternion(
            scratch.toQuaternion,
            scratch.matrix,
            path.exteriorPosition,
            path.exteriorTarget,
            scratch.up,
          );
          scratch.quaternion.slerpQuaternions(
            snapshot.quaternion,
            scratch.toQuaternion,
            progress,
          );
          nextFov = THREE.MathUtils.lerp(snapshot.fov, path.exteriorFov, progress);
          nextZoom = THREE.MathUtils.lerp(snapshot.zoom, 1, progress);
        } else if (elapsed < LUNAR_LAUNCH_TIMELINE.cameraTransitionStart) {
          writeLunarExteriorPose(path, sample.altitude, scratch.position, scratch.target);
          setLunarLookQuaternion(
            scratch.quaternion,
            scratch.matrix,
            scratch.position,
            scratch.target,
            scratch.up,
          );
        } else if (elapsed < LUNAR_LAUNCH_TIMELINE.cinematicAscentStart) {
          const progress = smootherstep(rangeProgress(
            elapsed,
            LUNAR_LAUNCH_TIMELINE.cameraTransitionStart,
            LUNAR_LAUNCH_TIMELINE.cinematicAscentStart,
          ));
          writeLunarExteriorPose(path, sample.altitude, scratch.fromPosition, scratch.fromTarget);
          writeLunarChasePose(path, sample.altitude, scratch.position, scratch.target);
          setLunarLookQuaternion(
            scratch.fromQuaternion,
            scratch.matrix,
            scratch.fromPosition,
            scratch.fromTarget,
            scratch.up,
          );
          setLunarLookQuaternion(
            scratch.toQuaternion,
            scratch.matrix,
            scratch.position,
            scratch.target,
            scratch.up,
          );
          const lookProgress = progress * progress;
          scratch.position.lerpVectors(scratch.fromPosition, scratch.position, progress);
          scratch.target.lerpVectors(scratch.fromTarget, scratch.target, lookProgress);
          scratch.quaternion.slerpQuaternions(
            scratch.fromQuaternion,
            scratch.toQuaternion,
            lookProgress,
          );
          nextFov = THREE.MathUtils.lerp(path.exteriorFov, path.chaseFov, progress);
        } else if (elapsed < LUNAR_LAUNCH_TIMELINE.completionStart) {
          writeLunarChasePose(path, sample.altitude, scratch.position, scratch.target);
          setLunarLookQuaternion(
            scratch.quaternion,
            scratch.matrix,
            scratch.position,
            scratch.target,
            scratch.up,
          );
          nextFov = path.chaseFov;
        } else {
          const progress = smootherstep(rangeProgress(
            elapsed,
            LUNAR_LAUNCH_TIMELINE.completionStart,
            LUNAR_LAUNCH_TIMELINE.cleanupStart,
          ));
          scratch.position.lerpVectors(path.completionPosition, path.finalPosition, progress);
          scratch.target.lerpVectors(path.completionTarget, path.finalTarget, progress);
          setLunarLookQuaternion(
            scratch.fromQuaternion,
            scratch.matrix,
            path.completionPosition,
            path.completionTarget,
            scratch.up,
          );
          setLunarLookQuaternion(
            scratch.toQuaternion,
            scratch.matrix,
            path.finalPosition,
            path.finalTarget,
            scratch.up,
          );
          scratch.quaternion.slerpQuaternions(
            scratch.fromQuaternion,
            scratch.toQuaternion,
            progress,
          );
          nextFov = THREE.MathUtils.lerp(path.chaseFov, path.finalFov, progress);
        }

        const shake = sample.vibration * path.rocketHeight * 0.0032;
        const lateralShake = Math.sin(elapsed * 47.3) * shake;
        const verticalShake = Math.sin(elapsed * 39.1 + 0.72) * shake * 0.55;
        scratch.position.addScaledVector(path.side, lateralShake);
        scratch.position.y += verticalShake;
        scratch.target.addScaledVector(path.side, lateralShake);
        scratch.target.y += verticalShake;
        const cinematicDistance = scratch.position.distanceTo(scratch.target);
        if (cinematicDistance > controlsMaximumDistance) {
          scratch.position.sub(scratch.target)
            .setLength(controlsMaximumDistance)
            .add(scratch.target);
        }

        perspective.position.copy(scratch.position);
        perspective.quaternion.copy(scratch.quaternion);
        perspective.fov = nextFov;
        perspective.near = Math.min(snapshot.near, 0.04);
        perspective.far = Math.max(cameraFarPlane, 900, extent.diagonal * 12);
        perspective.zoom = nextZoom;
        perspective.updateProjectionMatrix();
        controls?.target.copy(scratch.target);
        targetPosition.current.copy(scratch.position);
        targetLookAt.current.copy(scratch.target);
        const revealProgress = smootherstep(rangeProgress(
          elapsed,
          LUNAR_LAUNCH_TIMELINE.completionStart,
          LUNAR_LAUNCH_TIMELINE.cleanupStart,
        ));
        gl.toneMappingExposure = snapshot.exposure * (
          1
          + sample.groundLight * 0.055
          - sample.ascentProgress * (1 - revealProgress) * 0.018
        );

        if (elapsed >= LUNAR_LAUNCH_TIMELINE.end) {
          path.active = false;
          path.lastPhase = 'idle';
          perspective.position.copy(path.finalPosition);
          controls?.target.copy(path.finalTarget);
          setLunarLookQuaternion(
            perspective.quaternion,
            scratch.matrix,
            path.finalPosition,
            path.finalTarget,
            scratch.up,
          );
          perspective.fov = path.finalFov;
          perspective.updateProjectionMatrix();
          gl.toneMappingExposure = snapshot.exposure;
          restoreLunarControlState(snapshot);
          if (controls) {
            controls.minDistance = controlsMinimumDistance;
            controls.maxDistance = controlsMaximumDistance;
          }
          controls?.update();
          setAppliedControlLimits({
            minDistance: controlsMinimumDistance,
            maxDistance: controlsMaximumDistance,
          });
          animating.current = false;
          lunarCameraLockedRef.current = false;
          useCommercialMapStore.getState().completeLunarLaunch(false);
        } else invalidate();
      } catch (error) {
        path.active = false;
        suppressNextDetailsRefit.current = true;
        restoreLunarCamera(snapshot);
        useCommercialMapStore.getState().completeLunarLaunch(true);
        if (import.meta.env.DEV) console.error('[CommercialMap] lunar camera cleanup after runtime failure', error);
      }
      return;
    }

    if (lunarCameraLockedRef.current) return;
    if (animating.current) {
      const transition = cameraTransition.current;
      if (transition.active && perspective) {
        const progress = resolveCameraTransitionProgress(
          now - transition.startedAt,
          transition.durationMs,
        );
        perspective.position.lerpVectors(
          transition.fromPosition,
          transition.toPosition,
          progress,
        );
        perspective.quaternion.slerpQuaternions(
          transition.fromQuaternion,
          transition.toQuaternion,
          progress,
        );
        stabilizeCameraTransitionUp(
          perspective.quaternion,
          perspective.up,
          transitionScratch.current.direction,
          transitionScratch.current.matrix,
        );
        controls?.target.lerpVectors(
          transition.fromTarget,
          transition.toTarget,
          progress,
        );
        perspective.fov = THREE.MathUtils.lerp(
          transition.fromLens.fov,
          transition.toLens.fov,
          progress,
        );
        perspective.near = THREE.MathUtils.lerp(
          transition.fromLens.near,
          transition.toLens.near,
          progress,
        );
        perspective.far = THREE.MathUtils.lerp(
          transition.fromLens.far,
          transition.toLens.far,
          progress,
        );
        perspective.zoom = THREE.MathUtils.lerp(
          transition.fromLens.zoom,
          transition.toLens.zoom,
          progress,
        );
        perspective.updateProjectionMatrix();

        if (progress >= 0.99999) {
          transition.active = false;
          animating.current = false;
          perspective.position.copy(transition.toPosition);
          perspective.quaternion.copy(transition.toQuaternion);
          perspective.fov = transition.toLens.fov;
          perspective.near = transition.toLens.near;
          perspective.far = transition.toLens.far;
          perspective.zoom = transition.toLens.zoom;
          perspective.updateProjectionMatrix();
          controls?.target.copy(transition.toTarget);
          perspective.quaternion.copy(transition.toQuaternion);
          if (controls) {
            controls.enabled = true;
            controls.enableDamping = true;
            controls.enablePan = interiorFrame?.enablePan ?? true;
            controls.enableRotate = true;
            controls.enableZoom = true;
            controls.zoomToCursor = interiorFrame?.zoomToCursor ?? !miranteSelected;
          }
          setTransitionControlsLocked(false);
          setCameraNavigating(false);
          gl.domElement.style.cursor = 'grab';
          gl.domElement.dataset.commercialMapCameraTransition = JSON.stringify({
            status: 'completed',
            source: transition.source,
            sequence: transition.sequence,
            startedAt: Number(transition.startedAt.toFixed(2)),
            durationMs: Number(transition.durationMs.toFixed(2)),
            completedAt: Number(now.toFixed(2)),
            elapsedMs: Number((now - transition.startedAt).toFixed(2)),
          });
          setAppliedControlLimits({
            minDistance: effectiveControlsMinimumDistance,
            maxDistance: effectiveControlsMaximumDistance,
          });
          setAppliedAngles(desiredAngles);
          writeCameraDiagnostics(true);
        } else {
          writeCameraDiagnostics();
          invalidate();
        }
      }
    }
    if (!animating.current && camera instanceof THREE.PerspectiveCamera) {
      const range = camera.position.distanceTo(controlsRef.current?.target ?? targetLookAt.current);
      const near = interiorFrame?.near ?? resolveCommercialMapCameraNearPlane(range, camera.position.y);
      const far = interiorFrame?.far ?? cameraFarPlane;
      if (Math.abs(camera.near - near) > 0.00001 || camera.far !== far) {
        camera.near = near;
        camera.far = far;
        camera.updateProjectionMatrix();
        invalidate();
      }
    }
    if (navigation.current.settling && controls) {
      const cameraDelta = camera.position.distanceTo(navigation.current.lastPosition);
      const targetDelta = controls.target.distanceTo(navigation.current.lastTarget);
      navigation.current.lastPosition.copy(camera.position);
      navigation.current.lastTarget.copy(controls.target);
      if (cameraDelta < 0.00008 && targetDelta < 0.00008) {
        navigation.current.stableFrames += 1;
      } else {
        navigation.current.stableFrames = 0;
      }
      if (navigation.current.stableFrames >= 3) {
        navigation.current.settling = false;
        navigation.current.navigating = false;
        setCameraNavigating(false);
        gl.domElement.style.cursor = 'grab';
        enforceDesiredCameraLimits();
        writeCameraDiagnostics(true);
      } else {
        invalidate();
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={!lunarCameraLocked && !transitionControlsLocked}
      enableDamping={!lunarCameraLocked && !transitionControlsLocked}
      dampingFactor={interiorFrame?.dampingFactor ?? (interiorEntity ? 0.075 : 0.072)}
      enablePan={!lunarCameraLocked && !transitionControlsLocked && (interiorFrame?.enablePan ?? true)}
      enableRotate={!lunarCameraLocked && !transitionControlsLocked}
      enableZoom={!lunarCameraLocked && !transitionControlsLocked}
      minDistance={appliedControlLimits.minDistance}
      maxDistance={appliedControlLimits.maxDistance}
      minPolarAngle={appliedAngles.minPolarAngle}
      maxPolarAngle={appliedAngles.maxPolarAngle}
      screenSpacePanning={Boolean(interiorEntity)}
      zoomToCursor={(interiorFrame?.zoomToCursor ?? !miranteSelected) && !lunarCameraLocked && !transitionControlsLocked}
      touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
      minAzimuthAngle={appliedAngles.minAzimuthAngle}
      maxAzimuthAngle={appliedAngles.maxAzimuthAngle}
      onStart={handleControlsStart}
      onEnd={handleControlsEnd}
      onChange={handleControlsChange}
    />
  );
}

function RuntimeFrameDiagnostics() {
  const active = useRef(false);
  const frameCount = useRef(0);
  useFrame(({ gl }, delta) => {
    if (!import.meta.env.DEV) return;
    if (frameCount.current % 30 === 0) window.__commercialMapRuntimeDiagnostics?.capture();
    gl.info.reset();
    const state = useCommercialMapStore.getState();
    const measuring = state.cameraNavigating
      || state.lunarLaunchPhase !== 'idle'
      || state.lunarLaunchReturning;
    if (!measuring) {
      active.current = false;
      frameCount.current = 0;
      return;
    }
    if (!active.current) {
      active.current = true;
      return;
    }
    recordCommercialMapFrame(delta * 1000);
    frameCount.current += 1;
  }, -100);
  return null;
}

function Scene({
  entities,
  parkingOwnerEntities = entities,
  siteEnvironmentEntities = entities,
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
  const parkingInspectionOpen = useCommercialMapStore((state) => state.parkingInspectionOpen);
  const parkingPresentation = useMemo(
    () => rearParkingLayerPresentation(parkingOwnerEntities, layerVisibility, layerOpacity),
    [layerOpacity, layerVisibility, parkingOwnerEntities],
  );
  const rearParkingEnabled = rearParkingVisibleInArea(isolatedArea) && !hydrologicalModeActive && parkingPresentation.visible;
  const reducedGraphics = useCommercialMapStore((state) => state.reducedGraphics);
  const cameraNavigating = useCommercialMapStore((state) => state.cameraNavigating);
  const lunarLaunchPhase = useCommercialMapStore((state) => state.lunarLaunchPhase);
  const lunarLaunchReturning = useCommercialMapStore((state) => state.lunarLaunchReturning);
  const lunarCinematicActive = lunarLaunchPhase !== 'idle' || lunarLaunchReturning;
  const technicalValidationVisible = useCommercialMapStore((state) => state.technicalValidationVisible);
  const activeSegmentId = useCommercialMapStore((state) => state.activeSegmentId);
  const [interiorCameraRequest, setInteriorCameraRequest] = useState<InteriorCameraRequest | null>(null);
  const exteriorGroup = useRef<THREE.Group>(null);
  const sceneObject = useThree((state) => state.scene);
  const raycaster = useThree((state) => state.raycaster);
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
        ...(rearParkingVisibleInArea(isolatedArea) ? REAR_PARKING_SCENE_SUPPORT_POINTS : []),
        ...(!isolatedArea && !hydrologicalModeActive ? REAR_ROAD_SCENE_SUPPORT_POINTS : []),
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
  const rearRoadPresentation = useMemo(
    () => rearRoadLayerPresentation(
      entities,
      layerVisibility,
      layerOpacity,
      entityFiltersActive,
    ),
    [entities, entityFiltersActive, layerOpacity, layerVisibility],
  );
  const rearRoadDebugVisible = useMemo(() => import.meta.env.DEV
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('rearRoadDebug'), []);
  const quadrasABDebugVisible = useMemo(() => import.meta.env.DEV
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('quadrasABDebug'), []);
  const activeSiteEnvironmentOwnerIdentifiers = useMemo(() => (
    isolatedArea
      ? new Set(entities.map((entity) => entity.publicIdentifier))
      : null
  ), [entities, isolatedArea]);
  const handleEntitySelect = useCallback((entityId: string) => {
    if (!hydrologicalModeActive) setSelectedEntityId(entityId);
  }, [hydrologicalModeActive, setSelectedEntityId]);
  const handleEntityHover = useCallback((entityId: string | null) => {
    if (!hydrologicalModeActive) setHoveredEntityId(entityId);
  }, [hydrologicalModeActive, setHoveredEntityId]);
  const handleEntityFocus = useCallback(() => {
    if (!hydrologicalModeActive) focusSelection();
  }, [focusSelection, hydrologicalModeActive]);
  const handlePavilionInteriorNavigate = useCallback((targetEntityId: string) => {
    const currentInterior = useCommercialMapStore.getState().interiorEntityId;
    if (!currentInterior || targetEntityId === currentInterior) return;
    const targetEntity = entities.find((candidate) => (
      candidate.id === targetEntityId
      && resolveStrategicLandmarkKind(candidate) === 'commercial-pavilion'
    ));
    // Navigation is immediate. The persistent controller replaces its current
    // flight from the current pose; no covering layer or timer owns this path.
    if (targetEntity) switchInterior(targetEntityId);
  }, [entities, switchInterior]);
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
  const lunarTreeEntity = useMemo(
    () => entities.find((entity) => resolveStrategicLandmarkKind(entity) === 'lunar-tree') ?? null,
    [entities],
  );
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
  const circulationEntities = useMemo(() => (
    withGateFourDistrictPresentationEntities(nonLotEntities).filter((entity) => (
      (entity.classification === 'ROAD' || entity.classification === 'PEDESTRIAN_PATH')
      // Rua Brasília is intentionally retained here: its persisted surface is
      // the only canonical pavement from Quadra E through D1/D2/D3 to Q-R-02.
      // The rear-road layer complements it beyond this internal axis.
      && (isolatedArea || hydrologicalModeActive
        || !REPLACED_OFFICIAL_ROAD_IDENTIFIERS.includes(entity.publicIdentifier))
    ))
  ), [hydrologicalModeActive, isolatedArea, nonLotEntities]);
  const structuralEntities = useMemo(() => nonLotEntities.filter((entity) => (
    entity.classification !== 'ROAD' && entity.classification !== 'PEDESTRIAN_PATH'
  )).map((entity) => rearParkingEnabled ? rearParkingEntityForPresentation(entity) : entity), [nonLotEntities, rearParkingEnabled]);
  const sceneTrees = useMemo(
    () => selectCommercialTreesForScene(entities, lots),
    [entities, lots],
  );
  const rearRoadCompatibleSceneTrees = useMemo(() => {
    const baseTrees = (!isolatedArea
      || isolatedArea === COMMERCIAL_MAP_SEGMENT_IDS.industry)
      ? selectParkAccessCompatibleTreesForPresentation(sceneTrees)
      : sceneTrees;
    const parkAccessCompatibleTrees = rearParkingEnabled
      ? [...baseTrees, ...reconcileRearParkingTrees(baseTrees, entities)]
      : baseTrees;
    const rearRoadCompatibleTrees = !isolatedArea && !hydrologicalModeActive
      ? selectRearRoadCompatibleTreesForPresentation(parkAccessCompatibleTrees)
      : parkAccessCompatibleTrees;
    return rearRoadCompatibleTrees;
  }, [entities, hydrologicalModeActive, isolatedArea, rearParkingEnabled, sceneTrees]);
  const selectedLunarTreeEntity = selectedEntity
    && resolveStrategicLandmarkKind(selectedEntity) === 'lunar-tree'
    ? selectedEntity
    : null;
  const presentedSceneTrees = useMemo(() => {
    if (!selectedLunarTreeEntity) return rearRoadCompatibleSceneTrees;
    const bounds = strategicLandmarkBounds(selectedLunarTreeEntity);
    const memorialCenter = [
      bounds.centerX + APOLLO_XIV_LAYOUT.replicaOffset[0],
      bounds.centerZ + APOLLO_XIV_LAYOUT.replicaOffset[1],
    ] as const;
    return rearRoadCompatibleSceneTrees.filter((tree) => (
      treeRemainsVisibleWithSelectedApollo(tree, memorialCenter)
    ));
  }, [rearRoadCompatibleSceneTrees, selectedLunarTreeEntity]);
  const treeSurfaceEntities = useMemo(() => rearParkingEnabled
    ? [...exteriorRenderedEntities, ...REAR_PARKING_GROUND_SUPPORTS]
    : exteriorRenderedEntities, [exteriorRenderedEntities, rearParkingEnabled]);
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
      arenaAccess: resolvePresentation(
        shouldRenderArenaAccess(entities),
        ARENA_FRONT_LAYOUT.arenaAccessOwners,
      ),
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
  const contextualLabel = useContextualMapLabel({
    selectedEntityId,
    hoveredEntityId,
    cameraNavigating,
    enabled: labelsVisible && !interiorEntity && !hydrologicalModeActive && !lunarCinematicActive,
  });
  const contextualLabelEntities = useMemo(() => {
    const ids = [contextualLabel.selectedId, contextualLabel.hoveredId].filter(
      (id): id is string => Boolean(id),
    );
    if (ids.length === 0) return [];
    return exteriorRenderedEntities.filter((entity) => ids.includes(entity.id));
  }, [contextualLabel.hoveredId, contextualLabel.selectedId, exteriorRenderedEntities]);
  const rearRoadOwnerEntityIds = useMemo(() => new Map(
    entities.map((entity) => [entity.publicIdentifier, entity.id] as const),
  ), [entities]);

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

  useLayoutEffect(() => {
    // The exterior remains cached, but only the active inspection scene can
    // participate in picking. Layer 0 remains enabled for normal rendering.
    if (interiorEntityId) {
      sceneObject.children.forEach((object) => {
        if (object !== exteriorGroup.current) object.traverse((child) => child.layers.enable(1));
      });
    }
    raycaster.layers.set(interiorEntityId ? 1 : 0);
    return () => { raycaster.layers.set(0); };
  }, [interiorEntityId, raycaster, sceneObject]);

  const interiorKind = interiorEntity ? resolveStrategicLandmarkKind(interiorEntity) : null;
  const interiorContent = interiorEntity && (
    interiorKind === 'commercial-pavilion'
      ? <CommercialPavilionInteriorScene entity={interiorEntity} entities={entities} lots={lots} reducedGraphics={reducedGraphics} onNavigate={handlePavilionInteriorNavigate} />
      : interiorKind === 'livestock-pavilion'
        ? <LivestockPavilionInteriorScene entity={interiorEntity} reducedGraphics={reducedGraphics} />
        : interiorKind === 'mirante-pavilion'
          ? <MiranteInteriorScene entity={interiorEntity} reducedGraphics={reducedGraphics} />
          : interiorKind === 'fenasoja-headquarters'
            ? <HeadquartersInteriorScene entity={interiorEntity} reducedGraphics={reducedGraphics} />
            : null
  );

  return (
    <>
      <CommercialMapEnvironment
        extent={extent}
        active={!interiorEntity}
        hydrologicalModeActive={hydrologicalModeActive}
        reducedGraphics={reducedGraphics}
      />
      <InteriorCameraRequestContext.Provider value={setInteriorCameraRequest}>
        {interiorContent}
        <group ref={exteriorGroup} visible={!interiorEntity}>
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
        <CommercialSiteEnvironmentLayer
          entities={siteEnvironmentEntities}
          activeOwnerIdentifiers={activeSiteEnvironmentOwnerIdentifiers}
          reducedGraphics={reducedGraphics}
        />
      )}
      {!isolatedArea && !hydrologicalModeActive && (
        <QuadrasABEnvironmentLayer
          entities={siteEnvironmentEntities}
          reducedGraphics={reducedGraphics}
        />
      )}
      {!isolatedArea && !hydrologicalModeActive && (
        <>
          <RearParkEnvironmentLayer
            reducedGraphics={reducedGraphics}
            vegetationVisible={treesVisible}
          />
          <RearParkRoadNetwork
            reducedGraphics={reducedGraphics}
            visible={rearRoadPresentation.visible}
            opacity={rearRoadPresentation.opacity}
            ownerEntityIdByIdentifier={rearRoadOwnerEntityIds}
            cameraNavigating={cameraNavigating}
            hoverEnabled={PRECISE_HOVER_CAPABLE}
            onSelect={handleEntitySelect}
            onHover={handleEntityHover}
            onFocus={handleEntityFocus}
            onCursor={setCanvasCursor}
          />
        </>
      )}
      {rearParkingEnabled && (
        <RearParkingLayer reducedGraphics={reducedGraphics} labelsVisible={labelsVisible} opacity={parkingPresentation.opacity} />
      )}
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
          sceneDiagonal={extent.diagonal}
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
        || arenaFrontInfrastructurePresentation.arenaAccess.visible
        || arenaFrontInfrastructurePresentation.courts.visible) && (
        <ArenaFrontInfrastructure
          reducedGraphics={reducedGraphics}
          showArenaStructures={arenaFrontInfrastructurePresentation.arenaStructures.visible}
          showArenaAccess={arenaFrontInfrastructurePresentation.arenaAccess.visible}
          showCourts={arenaFrontInfrastructurePresentation.courts.visible}
          arenaStructuresOpacity={arenaFrontInfrastructurePresentation.arenaStructures.opacity}
          arenaAccessOpacity={arenaFrontInfrastructurePresentation.arenaAccess.opacity}
          courtsOpacity={arenaFrontInfrastructurePresentation.courts.opacity}
        />
      )}
      <CommercialTreeLayer
        trees={presentedSceneTrees}
        surfaceEntities={treeSurfaceEntities}
        visible={treesVisible && !hydrologicalModeActive}
        reducedGraphics={reducedGraphics}
      />
      <CommercialElectricalInfrastructureLayer
        nodes={sceneElectricalInfrastructure.nodes}
        connections={sceneElectricalInfrastructure.connections}
        surfaceEntities={entities}
        rearRoadsActive={!isolatedArea && !hydrologicalModeActive}
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
      {contextualLabelEntities.filter((entity) => (
        (!parkingInspectionOpen || ['PAVILHAO-09', 'D5', 'PISTA-CAMPEIRA', 'J'].includes(entity.publicIdentifier))
      )).map((entity) => (
        <EntityLabel
          key={`label:${entity.id}`}
          entity={entity}
          lot={lotByEntity.get(entity.id)}
          selected={contextualLabel.selectedId === entity.id}
          hovered={contextualLabel.hoveredId === entity.id}
          filtersActive={entityFiltersActive}
          isMatch={presentedMatchingEntityIds.has(entity.id)}
          cinematicHidden={lunarCinematicActive}
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
      {!isolatedArea && !hydrologicalModeActive && rearRoadDebugVisible && RearRoadValidationOverlay && (
        <Suspense fallback={null}>
          <RearRoadValidationOverlay />
        </Suspense>
      )}
      {!isolatedArea && !hydrologicalModeActive && quadrasABDebugVisible && QuadrasABValidationOverlay && (
        <Suspense fallback={null}>
          <QuadrasABValidationOverlay />
        </Suspense>
      )}
        </group>
      </InteriorCameraRequestContext.Provider>
      <CameraRig
        selectedEntity={selectedEntity}
        interiorEntity={interiorEntity}
        interiorRequest={interiorCameraRequest}
        extent={extent}
        lunarTreeEntity={lunarTreeEntity}
        isolatedArea={isolatedArea}
        activeSegment={activeSegment}
        activeSegmentEntities={activeSegmentEntities}
        hydrologicalModeActive={hydrologicalModeActive}
      />
      <RuntimeFrameDiagnostics />
      <StrategicLandmarkSelectionShaderWarmup />
      <CommercialMapInteriorShaderWarmup reducedGraphics={reducedGraphics} />
      <Preload all />
    </>
  );
}

export const CommercialMapCanvas = memo(function CommercialMapCanvas(props: CommercialMapCanvasProps) {
  const {
    entities,
    parkingOwnerEntities,
    siteEnvironmentEntities,
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
  const canvasCleanup = useRef<(() => void) | null>(null);
  const initialViewport = useRef({
    width: typeof window === 'undefined' ? 1366 : window.innerWidth,
    height: typeof window === 'undefined' ? 768 : window.innerHeight,
    dpr: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
    reducedGraphics,
  });
  const pixelRatio = useRef(resolveCommercialMapPixelRatio({
    devicePixelRatio: initialViewport.current.dpr,
    viewportWidth: initialViewport.current.width,
    viewportHeight: initialViewport.current.height,
    reducedGraphics: initialViewport.current.reducedGraphics,
  })).current;
  const extent = useMemo(
    () => getSceneExtent(
      entities,
      [
        ...(parkAccessVisibleInArea(isolatedArea) ? PARK_ACCESS_SCENE_SUPPORT_POINTS : []),
        ...(rearParkingVisibleInArea(isolatedArea) ? REAR_PARKING_SCENE_SUPPORT_POINTS : []),
        ...(!isolatedArea && !hydrologicalModeActive ? REAR_ROAD_SCENE_SUPPORT_POINTS : []),
      ],
    ),
    [entities, hydrologicalModeActive, isolatedArea],
  );
  const initialRenderConfig = useRef<{
    camera: { position: [number, number, number]; fov: number; near: number; far: number };
    renderer: { antialias: boolean; alpha: boolean; powerPreference: 'high-performance'; preserveDrawingBuffer: boolean };
  } | null>(null);
  if (!initialRenderConfig.current) {
    const initialDirection = new THREE.Vector3(0.04, 0.72, 0.69).normalize();
    const initialAspect = initialViewport.current.width / Math.max(initialViewport.current.height, 1);
    const initialCameraBounds = resolveCommercialMapCameraDistanceBounds({
      bounds: extent,
      verticalFovDegrees: 38,
      aspect: initialAspect,
    });
    const requestedInitialDistance = fitDistanceForDirection(
      extent,
      38,
      initialAspect,
      initialDirection,
      1.1,
    );
    const initialTarget = new THREE.Vector3(extent.centerX, 0, extent.centerZ);
    const initialDistance = THREE.MathUtils.clamp(
      requestedInitialDistance,
      initialCameraBounds.minDistance,
      initialCameraBounds.maxDistance,
    );
    const initialCameraPosition = initialTarget.clone().add(
      initialDirection.multiplyScalar(initialDistance),
    );
    initialRenderConfig.current = {
      camera: {
        position: initialCameraPosition.toArray() as [number, number, number],
        fov: 38,
        near: Math.max(0.05, initialDistance / 1600),
        far: resolveCommercialMapCameraFarPlane(extent, initialCameraBounds.maxDistance),
      },
      renderer: {
        antialias: !reducedGraphics,
        alpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      },
    };
  }

  useEffect(() => () => {
    canvasCleanup.current?.();
    canvasCleanup.current = null;
  }, []);

  return (
    <Canvas
      className="commercial-map-canvas"
      events={createCommercialMapEvents}
      frameloop="demand"
      camera={initialRenderConfig.current.camera}
      dpr={pixelRatio}
      shadows={!reducedGraphics}
      gl={initialRenderConfig.current.renderer}
        onCreated={({ gl, scene, camera }) => {
          canvasCleanup.current?.();
          const disposeGestureGuard = registerMapGestureGuard(gl.domElement);
          const disposeDiagnostics = registerCommercialMapRuntimeDiagnostics({ gl, scene, camera });
          canvasCleanup.current = () => {
            disposeDiagnostics();
            disposeGestureGuard();
          };
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = COMMERCIAL_MAP_ENVIRONMENT_CONFIG.toneMappingExposure;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          gl.domElement.style.cursor = 'grab';
      }}
      onPointerMissed={(event) => {
        if (!isMapSelectionClick(undefined, event)) return;
        // Empty-ground orbit/pan must not close parking or reset a close-up camera.
        const interactionState = useCommercialMapStore.getState();
        if (interactionState.parkingInspectionOpen || interactionState.cameraNavigating) return;
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
      <Profiler id="CommercialMapScene" onRender={recordCommercialMapProfiler}>
        <Scene
          entities={entities}
          parkingOwnerEntities={parkingOwnerEntities}
          siteEnvironmentEntities={siteEnvironmentEntities}
          lots={lots}
          calibration={calibration}
          matchingEntityIds={matchingEntityIds}
          filtersActive={filtersActive}
          isolatedArea={isolatedArea}
          segmentOverride={segmentOverride}
          technicalValidationAllowed={technicalValidationAllowed}
        />
      </Profiler>
    </Canvas>
  );
});
