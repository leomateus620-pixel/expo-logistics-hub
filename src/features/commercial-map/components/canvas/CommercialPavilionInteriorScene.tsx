import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { CommercialLot, MapEntity } from '../../types';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import {
  createCommercialPavilionLayout,
  commercialPavilionInteriorPresentationBounds,
  commercialPavilionModelBounds,
  commercialPavilionInteriorViewRotationRadians,
  resolveCommercialPavilionDefinition,
  type CommercialPavilionLayout,
} from '../../utils/commercialPavilions';
import {
  createCommercialPavilionModuleProjectionFrame,
  projectCommercialPavilionOfficialContentEnvelope,
  projectCommercialPavilionModuleRect,
  resolveCommercialPavilionModulePlan,
  type CommercialPavilionLocalRect,
  type CommercialPavilionModulePlan,
} from '../../utils/commercialPavilionModules';
import type {
  CommercialPavilionReferenceRect,
} from '../../data/commercialPavilionReference';
import {
  buildCommercialPavilionModuleVisualStateIndex,
  type CommercialPavilionModuleVisualState,
} from '../../utils/pavilionModuleCommercial';
import { strategicLandmarkBounds, strategicLandmarkFacingRadians } from '../../utils/landmarks';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';
import { createCommercialPavilionTexture } from './commercialPavilionTextures';
import { CommercialPavilionModuleLayer } from './CommercialPavilionModuleLayer';
import { CommercialPavilionWayfindingLayer } from './CommercialPavilionWayfindingLayer';

const NO_RAYCAST = () => undefined;
const UP = new THREE.Vector3(0, 1, 0);

type Vector3Tuple = [number, number, number];

interface InstanceTransform {
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
}

function moduleRenderParts(
  cell: CommercialPavilionModulePlan['cells'][number],
): readonly CommercialPavilionReferenceRect[] {
  return cell.shape?.renderParts.length ? cell.shape.renderParts : [cell];
}

function rectanglesOverlap(
  first: CommercialPavilionLocalRect,
  second: CommercialPavilionLocalRect,
  clearance: number,
) {
  return Math.abs(first.centerX - second.centerX) * 2
      < first.width + second.width + clearance * 2
    && Math.abs(first.centerZ - second.centerZ) * 2
      < first.depth + second.depth + clearance * 2;
}

function buildProtectedPlanRects(
  plan: CommercialPavilionModulePlan,
  layout: CommercialPavilionLayout,
) {
  const footprint = {
    width: layout.interior.clearWidth,
    depth: layout.interior.clearDepth,
  };
  const projectionFrame = createCommercialPavilionModuleProjectionFrame(plan, footprint);
  return [
    ...plan.cells.flatMap((cell) => moduleRenderParts(cell).map((part) => (
      projectCommercialPavilionModuleRect(part, projectionFrame)
    ))),
    ...plan.corridors.map((corridor) => (
      projectCommercialPavilionModuleRect(corridor, projectionFrame)
    )),
    ...plan.supportSpaces.map((supportSpace) => (
      projectCommercialPavilionModuleRect(supportSpace, projectionFrame)
    )),
  ];
}

function InteriorInstances({
  geometry,
  material,
  items,
  castShadow = false,
  receiveShadow = false,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  items: InstanceTransform[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const setMesh = useCallback((next: THREE.InstancedMesh | null) => {
    const previous = mesh.current;
    if (previous && previous !== next) disposeInstancedMesh(previous);
    mesh.current = next;
  }, []);

  useLayoutEffect(() => {
    if (!mesh.current) return;
    const object = new THREE.Object3D();
    items.forEach((item, index) => {
      object.position.set(...item.position);
      object.rotation.set(...(item.rotation ?? [0, 0, 0]));
      object.scale.set(...item.scale);
      object.updateMatrix();
      mesh.current?.setMatrixAt(index, object.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.computeBoundingBox();
    mesh.current.computeBoundingSphere();
  }, [items]);

  if (!items.length) return null;
  return (
    <instancedMesh
      ref={setMesh}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      raycast={NO_RAYCAST}
      dispose={null}
    />
  );
}

function createLowPerimeter(layout: CommercialPavilionLayout): InstanceTransform[] {
  const { shell, facade } = layout.exterior;
  const wallHeight = Math.min(0.52, layout.height * 0.2);
  const thickness = Math.max(0.07, facade.columnSize * 0.68);
  const wallSegments = (
    wallZ: number,
    entrances: CommercialPavilionLayout['exterior']['facade']['entrances'],
  ): InstanceTransform[] => {
    const ranges = entrances
      .map((entry) => [entry.centerX - entry.width / 2, entry.centerX + entry.width / 2] as const)
      .sort(([left], [right]) => left - right);
    const segments: InstanceTransform[] = [];
    let cursor = -shell.width / 2;
    ranges.forEach(([left, right]) => {
      if (left - cursor > 0.05) {
        segments.push({
          position: [(cursor + left) / 2, wallHeight / 2, wallZ],
          scale: [left - cursor, wallHeight, thickness],
        });
      }
      cursor = right;
    });
    if (shell.width / 2 - cursor > 0.05) {
      segments.push({
        position: [(cursor + shell.width / 2) / 2, wallHeight / 2, wallZ],
        scale: [shell.width / 2 - cursor, wallHeight, thickness],
      });
    }
    return segments;
  };
  const sideWallSegments = (
    wallX: number,
    entrances: CommercialPavilionLayout['exterior']['facade']['leftEntrances'],
  ): InstanceTransform[] => {
    const ranges = entrances
      .map((entry) => [entry.centerZ - entry.depth / 2, entry.centerZ + entry.depth / 2] as const)
      .sort(([near], [far]) => near - far);
    const segments: InstanceTransform[] = [];
    let cursor = -shell.depth / 2;
    ranges.forEach(([near, far]) => {
      if (near - cursor > 0.05) {
        segments.push({
          position: [wallX, wallHeight / 2, (cursor + near) / 2],
          scale: [thickness, wallHeight, near - cursor],
        });
      }
      cursor = far;
    });
    if (shell.depth / 2 - cursor > 0.05) {
      segments.push({
        position: [wallX, wallHeight / 2, (cursor + shell.depth / 2) / 2],
        scale: [thickness, wallHeight, shell.depth / 2 - cursor],
      });
    }
    return segments;
  };
  return [
    ...wallSegments(shell.backZ, facade.rearEntrances),
    ...sideWallSegments(-shell.width / 2, facade.leftEntrances),
    ...sideWallSegments(shell.width / 2, facade.rightEntrances),
    ...wallSegments(facade.frontZ, facade.entrances),
  ];
}

function PavilionInteriorCameraRig({
  entity,
  layout,
  reducedGraphics,
  interiorViewRotation,
}: {
  entity: MapEntity;
  layout: CommercialPavilionLayout;
  reducedGraphics: boolean;
  interiorViewRotation: number;
}) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const animating = useRef(true);
  const targetPosition = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  const { camera, gl, invalidate, size } = useThree();
  const setCameraNavigating = useCommercialMapStore((state) => state.setCameraNavigating);
  const bounds = useMemo(() => strategicLandmarkBounds(entity), [entity]);
  const facing = strategicLandmarkFacingRadians(entity);
  const cameraFacing = facing + interiorViewRotation;
  const center = useMemo(
    () => new THREE.Vector3(bounds.centerX, entity.geometry.elevation, bounds.centerZ),
    [bounds.centerX, bounds.centerZ, entity.geometry.elevation],
  );
  const maximumDimension = Math.max(layout.width, layout.depth);
  const toWorld = useCallback((x: number, y: number, z: number) => (
    new THREE.Vector3(x, y, z).applyAxisAngle(UP, cameraFacing).add(center)
  ), [cameraFacing, center]);
  const clampTarget = useCallback(() => {
    const target = controls.current?.target;
    if (!target) return;
    const local = target.clone().sub(center).applyAxisAngle(UP, -facing);
    local.x = THREE.MathUtils.clamp(
      local.x,
      -layout.interior.clearWidth * 0.62,
      layout.interior.clearWidth * 0.62,
    );
    local.z = THREE.MathUtils.clamp(
      local.z,
      -layout.interior.clearDepth * 0.62,
      layout.interior.clearDepth * 0.62,
    );
    local.y = THREE.MathUtils.clamp(local.y, 0, layout.height * 0.32);
    target.copy(local.applyAxisAngle(UP, facing).add(center));
  }, [center, facing, layout.height, layout.interior.clearDepth, layout.interior.clearWidth]);

  useEffect(() => {
    const compact = size.width < 720 || size.height < 540;
    const portrait = size.height > size.width * 1.12;
    const heightMultiplier = portrait ? 1.95 : compact ? 1.72 : 1.5;
    const destination = toWorld(
      0,
      maximumDimension * heightMultiplier,
      maximumDimension * (portrait ? 0.18 : 0.24),
    );
    const start = toWorld(
      -layout.width * 0.12,
      maximumDimension * (heightMultiplier + 0.52),
      maximumDimension * 0.56,
    );
    const lookAt = toWorld(0, layout.interior.floorY, 0);
    targetPosition.current.copy(destination);
    targetLookAt.current.copy(lookAt);
    camera.position.copy(reducedGraphics ? destination : start);
    camera.lookAt(lookAt);
    camera.near = 0.035;
    camera.far = Math.max(120, maximumDimension * 12);
    if (camera instanceof THREE.PerspectiveCamera) camera.fov = portrait ? 47 : compact ? 44 : 40;
    camera.updateProjectionMatrix();
    controls.current?.target.copy(lookAt);
    controls.current?.update();
    animating.current = !reducedGraphics;
    gl.domElement.style.cursor = 'grab';
    invalidate();
    return () => {
      gl.domElement.style.cursor = 'grab';
    };
  }, [camera, gl, invalidate, layout.interior.floorY, layout.width, maximumDimension, reducedGraphics, size.height, size.width, toWorld]);

  useFrame((_state, delta) => {
    if (!animating.current) return;
    const factor = 1 - Math.exp(-delta * 5.2);
    camera.position.lerp(targetPosition.current, factor);
    if (controls.current) {
      controls.current.target.lerp(targetLookAt.current, factor);
      clampTarget();
      controls.current.update();
    }
    if (camera.position.distanceTo(targetPosition.current) < 0.035
      && (!controls.current || controls.current.target.distanceTo(targetLookAt.current) < 0.025)) {
      camera.position.copy(targetPosition.current);
      controls.current?.target.copy(targetLookAt.current);
      controls.current?.update();
      animating.current = false;
    } else {
      invalidate();
    }
  });

  useEffect(() => () => setCameraNavigating(false), [setCameraNavigating]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.075}
      enablePan
      screenSpacePanning
      zoomToCursor
      minDistance={maximumDimension * 0.2}
      maxDistance={maximumDimension * 3.3}
      minPolarAngle={0.025}
      maxPolarAngle={0.82}
      touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
      target={toWorld(0, layout.interior.floorY, 0).toArray()}
      onStart={() => {
        animating.current = false;
        setCameraNavigating(true);
        gl.domElement.style.cursor = 'grabbing';
      }}
      onEnd={() => {
        setCameraNavigating(false);
        gl.domElement.style.cursor = 'grab';
      }}
      onChange={() => {
        clampTarget();
        invalidate();
      }}
    />
  );
}

export const CommercialPavilionInteriorScene = memo(function CommercialPavilionInteriorScene({
  entity,
  entities,
  lots,
  reducedGraphics,
}: {
  entity: MapEntity;
  entities: MapEntity[];
  lots: CommercialLot[];
  reducedGraphics: boolean;
}) {
  const definition = resolveCommercialPavilionDefinition(entity);
  const modulePlan = resolveCommercialPavilionModulePlan(entity);
  const enterInterior = useCommercialMapStore((state) => state.enterInterior);
  const bounds = useMemo(() => strategicLandmarkBounds(entity), [entity]);
  const facing = strategicLandmarkFacingRadians(entity);
  const interiorViewRotation = commercialPavilionInteriorViewRotationRadians(entity);
  const physicalModelBounds = useMemo(
    () => commercialPavilionModelBounds(bounds, facing),
    [bounds, facing],
  );
  const layout = useMemo(() => {
    if (!definition) return null;
    const physicalLayout = createCommercialPavilionLayout(
      physicalModelBounds,
      definition,
      undefined,
      modulePlan,
    );
    if (!modulePlan) return physicalLayout;
    const contentEnvelope = projectCommercialPavilionOfficialContentEnvelope(
      modulePlan,
      {
        width: physicalLayout.interior.clearWidth,
        depth: physicalLayout.interior.clearDepth,
      },
    );
    if (!contentEnvelope) return physicalLayout;
    const presentationBounds = commercialPavilionInteriorPresentationBounds(
      physicalModelBounds,
      contentEnvelope,
    );
    return createCommercialPavilionLayout(
      presentationBounds,
      definition,
      physicalLayout.height,
      modulePlan,
    );
  }, [definition, modulePlan, physicalModelBounds]);
  const floorTexture = useMemo(() => createCommercialPavilionTexture('floor'), []);
  const materials = useMemo(() => ({
    floor: new THREE.MeshStandardMaterial({
      color: '#a8aaa5',
      map: floorTexture,
      bumpMap: floorTexture,
      bumpScale: 0.012,
      roughness: 0.96,
    }),
    wall: new THREE.MeshStandardMaterial({ color: '#c7c5bd', roughness: 0.94 }),
    structure: new THREE.MeshStandardMaterial({
      color: '#485556',
      roughness: 0.56,
      metalness: 0.25,
    }),
    threshold: new THREE.MeshStandardMaterial({ color: '#d6b347', roughness: 0.76 }),
  }), [floorTexture]);
  const unitBoxGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const floorGeometry = useMemo(() => layout
    ? new THREE.BoxGeometry(layout.width, layout.interior.floorY, layout.depth)
    : null, [layout]);
  const moduleStateById = useMemo(
    () => {
      if (!modulePlan) return new Map<string, CommercialPavilionModuleVisualState>();
      const validModuleKeys = new Set(modulePlan.cells.map((cell) => cell.id));
      return buildCommercialPavilionModuleVisualStateIndex(
        entity,
        entities,
        lots,
        validModuleKeys,
      );
    },
    [entities, entity, lots, modulePlan],
  );

  useEffect(() => () => {
    floorTexture?.dispose();
    Object.values(materials).forEach((material) => material.dispose());
  }, [floorTexture, materials]);

  useEffect(() => () => {
    unitBoxGeometry.dispose();
  }, [unitBoxGeometry]);

  useEffect(() => () => {
    floorGeometry?.dispose();
  }, [floorGeometry]);

  if (!definition || !layout || !modulePlan || !floorGeometry) return null;
  const perimeter = createLowPerimeter(layout);
  const hasReferenceGeometry = modulePlan.source.interpretation === 'official-reference-runs'
    || modulePlan.supportSpaces.length > 0
    || modulePlan.cells.some((cell) => Boolean(cell.shape));
  const protectedPlanRects = hasReferenceGeometry
    ? buildProtectedPlanRects(modulePlan, layout)
    : [];
  const structureClearance = Math.max(
    0.018,
    Math.min(layout.interior.clearWidth, layout.interior.clearDepth) * 0.0035,
  );
  const columns = layout.interior.columns
    .filter((column) => !protectedPlanRects.some((protectedRect) => rectanglesOverlap(
      {
        centerX: column.x,
        centerZ: column.z,
        width: column.size * 1.18,
        depth: column.size * 1.18,
      },
      protectedRect,
      structureClearance,
    )))
    .map((column) => ({
      position: [column.x, layout.interior.floorY + Math.min(0.66, column.height * 0.34) / 2, column.z] as Vector3Tuple,
      scale: [column.size * 1.18, Math.min(0.66, column.height * 0.34), column.size * 1.18] as Vector3Tuple,
    }));
  const beams = reducedGraphics ? [] : layout.exterior.structure.columnZs
    .filter((_, index, items) => index > 0 && index < items.length - 1 && index % 2 === 0)
    .filter((z) => !protectedPlanRects.some((protectedRect) => rectanglesOverlap(
      {
        centerX: 0,
        centerZ: z,
        width: layout.interior.clearWidth,
        depth: 0.045,
      },
      protectedRect,
      structureClearance,
    )))
    .map((z) => ({
      position: [0, Math.min(0.72, layout.height * 0.3), z] as Vector3Tuple,
      scale: [layout.interior.clearWidth, 0.045, 0.045] as Vector3Tuple,
    }));
  const thresholds = [
    ...layout.exterior.facade.entrances,
    ...layout.exterior.facade.rearEntrances,
    ...layout.exterior.facade.leftEntrances,
    ...layout.exterior.facade.rightEntrances,
  ].map((entrance) => ({
    position: [entrance.centerX, layout.interior.floorY + 0.018, entrance.centerZ] as Vector3Tuple,
    scale: entrance.edge === 'front' || entrance.edge === 'rear'
      ? [entrance.width * 0.9, 0.035, Math.max(0.14, entrance.depth * 2.2)] as Vector3Tuple
      : [Math.max(0.14, entrance.width * 2.2), 0.035, entrance.depth * 0.9] as Vector3Tuple,
  }));

  return (
    <>
      <color attach="background" args={['#e5e5de']} />
      <fog attach="fog" args={['#e5e5de', Math.max(layout.width, layout.depth) * 4.5, Math.max(layout.width, layout.depth) * 9]} />
      <ambientLight intensity={0.72} />
      <hemisphereLight args={['#fffdf5', '#5a685e', 0.94]} />
      <directionalLight
        position={[bounds.centerX - layout.width, layout.height * 5, bounds.centerZ + layout.depth]}
        intensity={1.72}
        color="#fff4d9"
        castShadow={!reducedGraphics}
        shadow-mapSize-width={reducedGraphics ? 256 : 1024}
        shadow-mapSize-height={reducedGraphics ? 256 : 1024}
        shadow-bias={-0.00012}
        shadow-normalBias={0.035}
      />
      <group
        position={[bounds.centerX, entity.geometry.elevation, bounds.centerZ]}
        rotation={[0, facing, 0]}
        dispose={null}
      >
        <mesh
          position={[0, layout.interior.floorY / 2, 0]}
          geometry={floorGeometry}
          material={materials.floor}
          receiveShadow
          raycast={NO_RAYCAST}
          dispose={null}
        />
        <InteriorInstances geometry={unitBoxGeometry} material={materials.wall} items={perimeter} castShadow receiveShadow />
        <CommercialPavilionModuleLayer
          layout={layout}
          plan={modulePlan}
          mode="interior"
          reducedGraphics={reducedGraphics}
          moduleStateById={moduleStateById}
          labelRotationRadians={interiorViewRotation}
        />
        <CommercialPavilionWayfindingLayer
          layout={layout}
          plan={modulePlan}
          entities={entities}
          onNavigate={enterInterior}
        />
        <InteriorInstances geometry={unitBoxGeometry} material={materials.structure} items={columns} castShadow />
        <InteriorInstances geometry={unitBoxGeometry} material={materials.structure} items={beams} castShadow />
        <InteriorInstances geometry={unitBoxGeometry} material={materials.threshold} items={thresholds} />
      </group>
      <PavilionInteriorCameraRig
        entity={entity}
        layout={layout}
        reducedGraphics={reducedGraphics}
        interiorViewRotation={interiorViewRotation}
      />
    </>
  );
});
