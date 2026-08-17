import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { MapEntity } from '../../types';
import {
  createCommercialPavilionLayout,
  commercialPavilionModelBounds,
  resolveCommercialPavilionDefinition,
  type CommercialPavilionLayout,
  type CommercialPavilionRect,
} from '../../utils/commercialPavilions';
import { strategicLandmarkBounds, strategicLandmarkFacingRadians } from '../../utils/landmarks';
import { createCommercialPavilionTexture } from './commercialPavilionTextures';

const NO_RAYCAST = () => undefined;
const UP = new THREE.Vector3(0, 1, 0);
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

type Vector3Tuple = [number, number, number];

interface InstanceTransform {
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
}

function InteriorInstances({
  material,
  items,
  castShadow = false,
  receiveShadow = false,
}: {
  material: THREE.Material;
  items: InstanceTransform[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);

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
      ref={mesh}
      args={[UNIT_BOX, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      raycast={NO_RAYCAST}
      dispose={null}
    />
  );
}

function containsCrossAisle(centerZ: number, depth: number, aisles: CommercialPavilionRect[]) {
  return aisles.some((aisle) => (
    Math.abs(centerZ - aisle.centerZ) < depth / 2 + aisle.depth / 2 + 0.06
  ));
}

function createExhibitModules(layout: CommercialPavilionLayout) {
  const primary: InstanceTransform[] = [];
  const secondary: InstanceTransform[] = [];
  const partitions: InstanceTransform[] = [];

  layout.interior.exhibitBands.forEach((band, bandIndex) => {
    const moduleCount = THREE.MathUtils.clamp(Math.round(band.depth / 1.2), 2, 7);
    const moduleDepth = band.depth / moduleCount;
    for (let index = 0; index < moduleCount; index += 1) {
      const centerZ = band.centerZ - band.depth / 2 + moduleDepth * (index + 0.5);
      if (containsCrossAisle(centerZ, moduleDepth * 0.72, layout.interior.crossAisles)) continue;
      const target = (index + bandIndex) % 2 === 0 ? primary : secondary;
      target.push({
        position: [band.centerX, layout.interior.floorY + 0.055, centerZ],
        scale: [band.width * 0.82, 0.1, moduleDepth * 0.72],
      });
      partitions.push({
        position: [
          band.centerX + (bandIndex === 0 ? band.width * 0.34 : -band.width * 0.34),
          layout.interior.floorY + 0.23,
          centerZ,
        ],
        scale: [0.045, 0.36, moduleDepth * 0.7],
      });
    }
  });

  return { primary, secondary, partitions };
}

function createLowPerimeter(layout: CommercialPavilionLayout): InstanceTransform[] {
  const { shell, facade } = layout.exterior;
  const wallHeight = Math.min(0.52, layout.height * 0.2);
  const thickness = Math.max(0.07, facade.columnSize * 0.68);
  const walls: InstanceTransform[] = [
    {
      position: [0, wallHeight / 2, shell.backZ],
      scale: [shell.width, wallHeight, thickness],
    },
    {
      position: [-shell.width / 2, wallHeight / 2, 0],
      scale: [thickness, wallHeight, shell.depth],
    },
    {
      position: [shell.width / 2, wallHeight / 2, 0],
      scale: [thickness, wallHeight, shell.depth],
    },
  ];
  const ranges = facade.entrances
    .map((entry) => [entry.centerX - entry.width / 2, entry.centerX + entry.width / 2] as const)
    .sort(([left], [right]) => left - right);
  let cursor = -shell.width / 2;
  ranges.forEach(([left, right]) => {
    if (left - cursor > 0.05) {
      walls.push({
        position: [(cursor + left) / 2, wallHeight / 2, facade.frontZ],
        scale: [left - cursor, wallHeight, thickness],
      });
    }
    cursor = right;
  });
  if (shell.width / 2 - cursor > 0.05) {
    walls.push({
      position: [(cursor + shell.width / 2) / 2, wallHeight / 2, facade.frontZ],
      scale: [shell.width / 2 - cursor, wallHeight, thickness],
    });
  }
  return walls;
}

function PavilionInteriorCameraRig({
  entity,
  layout,
  reducedGraphics,
}: {
  entity: MapEntity;
  layout: CommercialPavilionLayout;
  reducedGraphics: boolean;
}) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const animating = useRef(true);
  const targetPosition = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  const { camera, gl, invalidate, size } = useThree();
  const bounds = useMemo(() => strategicLandmarkBounds(entity), [entity]);
  const facing = strategicLandmarkFacingRadians(entity);
  const center = useMemo(
    () => new THREE.Vector3(bounds.centerX, entity.geometry.elevation, bounds.centerZ),
    [bounds.centerX, bounds.centerZ, entity.geometry.elevation],
  );
  const maximumDimension = Math.max(layout.width, layout.depth);
  const toWorld = useCallback((x: number, y: number, z: number) => (
    new THREE.Vector3(x, y, z).applyAxisAngle(UP, facing).add(center)
  ), [center, facing]);
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

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.075}
      enablePan
      screenSpacePanning
      zoomToCursor
      minDistance={maximumDimension * 0.55}
      maxDistance={maximumDimension * 3.3}
      minPolarAngle={0.025}
      maxPolarAngle={0.82}
      target={toWorld(0, layout.interior.floorY, 0).toArray()}
      onStart={() => {
        animating.current = false;
        gl.domElement.style.cursor = 'grabbing';
      }}
      onEnd={() => {
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
  reducedGraphics,
}: {
  entity: MapEntity;
  reducedGraphics: boolean;
}) {
  const definition = resolveCommercialPavilionDefinition(entity);
  const bounds = useMemo(() => strategicLandmarkBounds(entity), [entity]);
  const facing = strategicLandmarkFacingRadians(entity);
  const modelBounds = useMemo(
    () => commercialPavilionModelBounds(bounds, facing),
    [bounds, facing],
  );
  const layout = useMemo(() => definition
    ? createCommercialPavilionLayout(modelBounds, definition)
    : null, [definition, modelBounds]);
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
    aisle: new THREE.MeshStandardMaterial({ color: '#d4d2c9', roughness: 0.91 }),
    primary: new THREE.MeshStandardMaterial({ color: '#3e7881', roughness: 0.82 }),
    secondary: new THREE.MeshStandardMaterial({ color: '#c79b4a', roughness: 0.84 }),
    divider: new THREE.MeshStandardMaterial({ color: '#e5e2d8', roughness: 0.9 }),
    structure: new THREE.MeshStandardMaterial({
      color: '#485556',
      roughness: 0.56,
      metalness: 0.25,
    }),
    threshold: new THREE.MeshStandardMaterial({ color: '#d6b347', roughness: 0.76 }),
  }), [floorTexture]);

  useEffect(() => () => {
    floorTexture?.dispose();
    Object.values(materials).forEach((material) => material.dispose());
  }, [floorTexture, materials]);

  if (!definition || !layout) return null;
  const exhibitModules = createExhibitModules(layout);
  const perimeter = createLowPerimeter(layout);
  const columns = layout.interior.columns.map((column) => ({
    position: [column.x, layout.interior.floorY + Math.min(0.66, column.height * 0.34) / 2, column.z] as Vector3Tuple,
    scale: [column.size * 1.18, Math.min(0.66, column.height * 0.34), column.size * 1.18] as Vector3Tuple,
  }));
  const beams = reducedGraphics ? [] : layout.exterior.structure.columnZs
    .filter((_, index, items) => index > 0 && index < items.length - 1 && index % 2 === 0)
    .map((z) => ({
      position: [0, Math.min(0.72, layout.height * 0.3), z] as Vector3Tuple,
      scale: [layout.interior.clearWidth, 0.045, 0.045] as Vector3Tuple,
    }));
  const thresholds = layout.exterior.facade.entrances.map((entrance) => ({
    position: [entrance.centerX, layout.interior.floorY + 0.018, entrance.centerZ] as Vector3Tuple,
    scale: [entrance.width * 0.9, 0.035, Math.max(0.14, entrance.depth * 2.2)] as Vector3Tuple,
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
          material={materials.floor}
          receiveShadow
          raycast={NO_RAYCAST}
        >
          <boxGeometry args={[layout.width, layout.interior.floorY, layout.depth]} />
        </mesh>
        <InteriorInstances material={materials.wall} items={perimeter} castShadow receiveShadow />
        <mesh
          position={[
            layout.interior.mainAisle.centerX,
            layout.interior.floorY + 0.012,
            layout.interior.mainAisle.centerZ,
          ]}
          material={materials.aisle}
          receiveShadow
          raycast={NO_RAYCAST}
        >
          <boxGeometry args={[
            layout.interior.mainAisle.width,
            0.024,
            layout.interior.mainAisle.depth,
          ]} />
        </mesh>
        {layout.interior.crossAisles.map((aisle, index) => (
          <mesh
            key={`${aisle.centerZ}:${index}`}
            position={[aisle.centerX, layout.interior.floorY + 0.014, aisle.centerZ]}
            material={materials.aisle}
            receiveShadow
            raycast={NO_RAYCAST}
          >
            <boxGeometry args={[aisle.width, 0.028, aisle.depth]} />
          </mesh>
        ))}
        <InteriorInstances material={materials.primary} items={exhibitModules.primary} receiveShadow />
        <InteriorInstances material={materials.secondary} items={exhibitModules.secondary} receiveShadow />
        {!reducedGraphics && (
          <InteriorInstances material={materials.divider} items={exhibitModules.partitions} castShadow />
        )}
        <InteriorInstances material={materials.structure} items={columns} castShadow />
        <InteriorInstances material={materials.structure} items={beams} castShadow />
        <InteriorInstances material={materials.threshold} items={thresholds} />
      </group>
      <PavilionInteriorCameraRig entity={entity} layout={layout} reducedGraphics={reducedGraphics} />
    </>
  );
});
