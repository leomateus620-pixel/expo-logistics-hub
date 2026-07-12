import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useCommercialMapStore } from '../../state/useCommercialMapStore';
import type { MapEntity } from '../../types';
import { withoutClosingPoint } from '../../utils/geometry';
import { isMapSelectionClick } from '../../utils/interaction';
import {
  resolveStrategicLandmarkKind,
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
  strategicLandmarkVisualHeight,
  type StrategicLandmarkBounds,
  type StrategicLandmarkKind,
} from '../../utils/landmarks';

const NO_RAYCAST = () => undefined;
const MAP_BACKGROUND_COLOR = new THREE.Color('#dfe8de');
const SELECTION_COLOR = '#f7d56a';
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const UNIT_CONE = new THREE.ConeGeometry(0.5, 1, 16);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
const SHARED_INVISIBLE_HIT_MATERIAL = new THREE.MeshBasicMaterial({ visible: false });
const SHARED_SELECTED_SURFACE_MATERIAL = new THREE.MeshBasicMaterial({
  color: SELECTION_COLOR,
  transparent: true,
  opacity: 0.14,
  depthWrite: false,
  toneMapped: false,
});
const SHARED_HOVERED_SURFACE_MATERIAL = new THREE.MeshBasicMaterial({
  color: SELECTION_COLOR,
  transparent: true,
  opacity: 0.07,
  depthWrite: false,
  toneMapped: false,
});
const SHARED_SELECTED_LINE_MATERIAL = new THREE.LineBasicMaterial({ color: '#ffe797', toneMapped: false });
const SHARED_HOVERED_LINE_MATERIAL = new THREE.LineBasicMaterial({ color: '#f0d36a', toneMapped: false });
const SHARED_GERMAN_RED_MATERIAL = new THREE.MeshStandardMaterial({ color: '#ba2c35', roughness: 0.8 });
const SHARED_GERMAN_GOLD_MATERIAL = new THREE.MeshStandardMaterial({ color: '#e5b82f', roughness: 0.82 });
const SHARED_BRAZIL_YELLOW_MATERIAL = new THREE.MeshStandardMaterial({ color: '#f1ce3f', roughness: 0.82 });

type Vector3Tuple = [number, number, number];

interface InstanceTransform {
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
}

interface LandmarkMaterialSet {
  wall: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  green: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  platform: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
}

type LandmarkPalette = Record<keyof LandmarkMaterialSet, string>;

const LANDMARK_PALETTES: Record<StrategicLandmarkKind, LandmarkPalette> = {
  'german-pavilion': {
    wall: '#eee5d5',
    accent: '#c8ae8e',
    roof: '#a44c2f',
    trim: '#4b362d',
    dark: '#263333',
    glass: '#49636b',
    green: '#2f6b40',
    white: '#f5f1e6',
    platform: '#9b8b74',
    metal: '#424a47',
  },
  'fenasoja-restaurant': {
    wall: '#d8c9ad',
    accent: '#b9a17e',
    roof: '#4b413e',
    trim: '#58493f',
    dark: '#242a29',
    glass: '#43565b',
    green: '#16834d',
    white: '#f3efe4',
    platform: '#9f9585',
    metal: '#5c615d',
  },
  'sicredi-arena': {
    wall: '#d9ddd6',
    accent: '#b9c3bb',
    roof: '#ecebe2',
    trim: '#0a7b4c',
    dark: '#151b1b',
    glass: '#263537',
    green: '#079255',
    white: '#f5f5ee',
    platform: '#797d75',
    metal: '#727b78',
  },
};

function material(color: string, roughness: number, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function useLandmarkMaterials(
  kind: StrategicLandmarkKind,
  toneDown: number,
  selected: boolean,
  hovered: boolean,
): LandmarkMaterialSet {
  const invalidate = useThree((state) => state.invalidate);
  const materials = useMemo<LandmarkMaterialSet>(() => {
    const palette = LANDMARK_PALETTES[kind];
    const result = {
      wall: material(palette.wall, 0.84),
      accent: material(palette.accent, 0.8),
      roof: material(palette.roof, 0.88),
      trim: material(palette.trim, 0.74),
      dark: material(palette.dark, 0.86),
      glass: material(palette.glass, 0.38, 0.03),
      green: material(palette.green, 0.78),
      white: material(palette.white, 0.86),
      platform: material(palette.platform, 0.94),
      metal: material(palette.metal, 0.62, 0.16),
    };
    result.white.side = THREE.DoubleSide;
    return result;
  }, [kind]);

  useEffect(() => {
    const palette = LANDMARK_PALETTES[kind];
    (Object.keys(materials) as Array<keyof LandmarkMaterialSet>).forEach((key) => {
      const item = materials[key];
      const baseColor = new THREE.Color(palette[key]);
      item.color.copy(baseColor).lerp(MAP_BACKGROUND_COLOR, THREE.MathUtils.clamp(toneDown, 0, 0.9) * 0.82);
      if (selected) item.color.lerp(new THREE.Color('#fff1bd'), 0.06);
      item.emissive.copy(baseColor);
      item.emissiveIntensity = selected ? 0.055 : hovered ? 0.018 : 0;
    });
    invalidate();
  }, [hovered, invalidate, kind, materials, selected, toneDown]);

  useEffect(() => () => {
    Object.values(materials).forEach((item) => item.dispose());
  }, [materials]);

  return materials;
}

function ScaledInstances({
  geometry = UNIT_BOX,
  material: meshMaterial,
  items,
  castShadow = false,
  receiveShadow = false,
}: {
  geometry?: THREE.BufferGeometry;
  material: THREE.Material;
  items: InstanceTransform[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const object = new THREE.Object3D();
    items.forEach((item, index) => {
      object.position.set(...item.position);
      object.rotation.set(...(item.rotation ?? [0, 0, 0]));
      object.scale.set(...item.scale);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [items]);

  useEffect(() => {
    const mesh = ref.current;
    return () => mesh?.dispose();
  }, []);

  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, meshMaterial, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      raycast={NO_RAYCAST}
    />
  );
}

function createLocalFootprintShape(entity: MapEntity, bounds: StrategicLandmarkBounds) {
  const outer = withoutClosingPoint(entity.geometry.coordinates[0] ?? []);
  const shape = new THREE.Shape();
  outer.forEach(([x, z], index) => {
    const localX = x - bounds.centerX;
    const localZ = z - bounds.centerZ;
    if (index === 0) shape.moveTo(localX, -localZ);
    else shape.lineTo(localX, -localZ);
  });
  entity.geometry.coordinates.slice(1).forEach((sourceRing) => {
    const hole = new THREE.Path();
    withoutClosingPoint(sourceRing).forEach(([x, z], index) => {
      const localX = x - bounds.centerX;
      const localZ = z - bounds.centerZ;
      if (index === 0) hole.moveTo(localX, -localZ);
      else hole.lineTo(localX, -localZ);
    });
    shape.holes.push(hole);
  });
  return shape;
}

function createLocalFootprintGeometry(entity: MapEntity, bounds: StrategicLandmarkBounds) {
  const geometry = new THREE.ShapeGeometry(createLocalFootprintShape(entity, bounds), 2);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createLocalHitVolumeGeometry(
  entity: MapEntity,
  bounds: StrategicLandmarkBounds,
  height: number,
) {
  const geometry = new THREE.ExtrudeGeometry(createLocalFootprintShape(entity, bounds), {
    depth: Math.max(0.2, height),
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createLocalFootprintOutline(entity: MapEntity, bounds: StrategicLandmarkBounds) {
  const vertices: number[] = [];
  entity.geometry.coordinates.forEach((sourceRing) => {
    const ring = withoutClosingPoint(sourceRing);
    ring.forEach(([x, z], index) => {
      const [nextX, nextZ] = ring[(index + 1) % ring.length] ?? [x, z];
      vertices.push(
        x - bounds.centerX, 0.052, z - bounds.centerZ,
        nextX - bounds.centerX, 0.052, nextZ - bounds.centerZ,
      );
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createGableBodyGeometry(width: number, depth: number, wallHeight: number, roofRise: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, wallHeight);
  shape.lineTo(0, wallHeight + roofRise);
  shape.lineTo(-width / 2, wallHeight);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function createHipRoofGeometry(width: number, depth: number, rise: number) {
  const ridgeHalf = Math.max(width * 0.08, (width - depth) * 0.42);
  const leftFront = [-width / 2, 0, depth / 2] as Vector3Tuple;
  const rightFront = [width / 2, 0, depth / 2] as Vector3Tuple;
  const rightBack = [width / 2, 0, -depth / 2] as Vector3Tuple;
  const leftBack = [-width / 2, 0, -depth / 2] as Vector3Tuple;
  const ridgeLeft = [-ridgeHalf, rise, 0] as Vector3Tuple;
  const ridgeRight = [ridgeHalf, rise, 0] as Vector3Tuple;
  const vertices = [
    leftFront, rightFront, ridgeRight, leftFront, ridgeRight, ridgeLeft,
    rightFront, rightBack, ridgeRight,
    rightBack, leftBack, ridgeLeft, rightBack, ridgeLeft, ridgeRight,
    leftBack, leftFront, ridgeLeft,
  ].flat();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createArenaShellGeometry(radius: number, depth: number) {
  const geometry = new THREE.CylinderGeometry(
    radius,
    radius,
    depth,
    28,
    1,
    true,
    Math.PI / 2,
    Math.PI,
  );
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function createArchedFacadeGeometry(radius: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-radius, 0);
  shape.absarc(0, 0, radius, Math.PI, 0, true);
  shape.lineTo(-radius, 0);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 28);
  geometry.computeVertexNormals();
  return geometry;
}

function SignagePanel({
  title,
  subtitle,
  position,
  size,
  background,
  foreground = '#ffffff',
}: {
  title: string;
  subtitle?: string;
  position: Vector3Tuple;
  size: [number, number];
  background: string;
  foreground?: string;
}) {
  const { texture, signMaterial } = useMemo(() => {
    let canvasTexture: THREE.CanvasTexture | null = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 160;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = background;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = foreground;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.font = '700 58px Arial, sans-serif';
        context.fillText(title, canvas.width / 2, subtitle ? 68 : 82);
        if (subtitle) {
          context.globalAlpha = 0.86;
          context.font = '600 28px Arial, sans-serif';
          context.fillText(subtitle, canvas.width / 2, 120);
        }
        canvasTexture = new THREE.CanvasTexture(canvas);
        canvasTexture.colorSpace = THREE.SRGBColorSpace;
        canvasTexture.anisotropy = 4;
      }
    }
    return {
      texture: canvasTexture,
      signMaterial: new THREE.MeshBasicMaterial({
        color: canvasTexture ? '#ffffff' : foreground,
        map: canvasTexture,
        toneMapped: false,
      }),
    };
  }, [background, foreground, subtitle, title]);

  useEffect(() => () => {
    texture?.dispose();
    signMaterial.dispose();
  }, [signMaterial, texture]);

  return (
    <mesh
      geometry={UNIT_PLANE}
      material={signMaterial}
      position={position}
      scale={[size[0], size[1], 1]}
      raycast={NO_RAYCAST}
      dispose={null}
    />
  );
}

function useArchitecturalDetail(
  kind: StrategicLandmarkKind,
  bounds: StrategicLandmarkBounds,
  selected: boolean,
) {
  const reducedGraphics = useCommercialMapStore((state) => state.reducedGraphics);
  const invalidate = useThree((state) => state.invalidate);
  const [near, setNear] = useState(selected);
  const nearRef = useRef(near);
  const center = useMemo(
    () => new THREE.Vector3(bounds.centerX, 0, bounds.centerZ),
    [bounds.centerX, bounds.centerZ],
  );

  useEffect(() => {
    if (!selected || nearRef.current) return;
    nearRef.current = true;
    setNear(true);
    invalidate();
  }, [invalidate, selected]);

  useFrame(({ camera }) => {
    if (selected) return;
    const threshold = kind === 'sicredi-arena'
      ? Math.max(30, bounds.width * 3.1)
      : kind === 'fenasoja-restaurant'
        ? Math.max(20, bounds.width * 5)
        : Math.max(18, bounds.width * 6.2);
    const distance = camera.position.distanceTo(center);
    const nextNear = distance <= threshold;
    if (nearRef.current === nextNear) return;
    nearRef.current = nextNear;
    setNear(nextNear);
    invalidate();
  });

  return {
    showDetail: selected || near && !reducedGraphics,
    showFocusDetail: selected && !reducedGraphics,
  };
}

function GermanPavilion({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: LandmarkModelProps) {
  const width = bounds.width;
  const depth = bounds.depth;
  const bodyWidth = width * 0.86;
  const bodyDepth = depth * 0.62;
  const wallHeight = height * 0.57;
  const roofRise = height * 0.31;
  const frontZ = bodyDepth / 2;
  const bodyGeometry = useMemo(
    () => createGableBodyGeometry(bodyWidth, bodyDepth, wallHeight, roofRise),
    [bodyDepth, bodyWidth, roofRise, wallHeight],
  );
  const roofPitch = Math.atan2(roofRise, bodyWidth / 2);
  const roofLength = Math.hypot(bodyWidth / 2 + width * 0.045, roofRise);
  const windows = [-0.31, -0.1, 0.1, 0.31].map((x) => ({
    position: [x * bodyWidth, wallHeight * 0.52, frontZ + 0.026] as Vector3Tuple,
    scale: [bodyWidth * 0.145, wallHeight * 0.35, 0.035] as Vector3Tuple,
  }));
  const frames: InstanceTransform[] = [
    ...[-0.43, -0.22, 0, 0.22, 0.43].map((x) => ({
      position: [x * bodyWidth, wallHeight * 0.57, frontZ + 0.048] as Vector3Tuple,
      scale: [0.045, wallHeight * 0.96, 0.045] as Vector3Tuple,
    })),
    { position: [0, wallHeight * 0.76, frontZ + 0.05], scale: [bodyWidth * 0.84, 0.045, 0.045] },
    { position: [-bodyWidth * 0.24, wallHeight + roofRise * 0.48, frontZ + 0.052], scale: [bodyWidth * 0.49, 0.042, 0.042], rotation: [0, 0, roofPitch] },
    { position: [bodyWidth * 0.24, wallHeight + roofRise * 0.48, frontZ + 0.052], scale: [bodyWidth * 0.49, 0.042, 0.042], rotation: [0, 0, -roofPitch] },
  ];
  const porchColumns = [-0.42, -0.2, 0.2, 0.42].map((x) => ({
    position: [x * width, wallHeight * 0.31, frontZ + depth * 0.15] as Vector3Tuple,
    scale: [0.055, wallHeight * 0.62, 0.055] as Vector3Tuple,
  }));
  const stairItems = [0, 1, 2].map((index) => ({
    position: [width * 0.34, 0.035 + index * 0.045, depth * (0.39 - index * 0.045)] as Vector3Tuple,
    scale: [width * 0.25, 0.07, depth * 0.11] as Vector3Tuple,
  }));

  useEffect(() => () => bodyGeometry.dispose(), [bodyGeometry]);

  return (
    <group dispose={null}>
      <mesh geometry={UNIT_BOX} material={materials.platform} position={[0, 0.055, 0]} scale={[width * 0.98, 0.11, depth * 0.98]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={bodyGeometry} material={materials.wall} castShadow receiveShadow raycast={NO_RAYCAST} />
      <ScaledInstances material={materials.roof} castShadow receiveShadow items={[
        { position: [-bodyWidth * 0.25, wallHeight + roofRise * 0.52, 0], scale: [roofLength, 0.085, bodyDepth + depth * 0.09], rotation: [0, 0, roofPitch] },
        { position: [bodyWidth * 0.25, wallHeight + roofRise * 0.52, 0], scale: [roofLength, 0.085, bodyDepth + depth * 0.09], rotation: [0, 0, -roofPitch] },
      ]} />
      <mesh geometry={UNIT_BOX} material={materials.accent} position={[0, 0.16, frontZ + depth * 0.09]} scale={[width * 0.92, 0.12, depth * 0.18]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={UNIT_BOX} material={materials.roof} position={[0, wallHeight * 0.66, frontZ + depth * 0.085]} rotation={[-0.08, 0, 0]} scale={[width * 0.96, 0.075, depth * 0.19]} castShadow raycast={NO_RAYCAST} dispose={null} />
      <ScaledInstances material={materials.glass} items={windows} />
      <ScaledInstances material={materials.trim} items={frames} castShadow />
      <ScaledInstances material={materials.trim} items={porchColumns} castShadow />
      {showDetail && (
        <>
          <ScaledInstances material={materials.trim} items={[
            { position: [0, wallHeight * 0.25, frontZ + depth * 0.16], scale: [width * 0.83, 0.045, 0.04] },
            ...[-0.4, -0.3, -0.2, -0.1, 0.1, 0.2, 0.3, 0.4].map((x) => ({
              position: [x * width, wallHeight * 0.2, frontZ + depth * 0.16] as Vector3Tuple,
              scale: [0.028, wallHeight * 0.3, 0.035] as Vector3Tuple,
            })),
          ]} />
          <ScaledInstances material={materials.platform} items={stairItems} receiveShadow />
          <mesh geometry={UNIT_BOX} material={materials.platform} position={[0, height * 0.115, depth * 0.45]} scale={[width * 0.5, height * 0.16, depth * 0.08]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
          <SignagePanel title="ETNIA ALEMÃ" position={[0, height * 0.12, depth * 0.492]} size={[width * 0.42, height * 0.075]} background="#4b362d" />
        </>
      )}
      {showFocusDetail && (
        <>
          <ScaledInstances geometry={UNIT_CYLINDER} material={materials.metal} items={[
            { position: [width * 0.28, height * 0.48, depth * 0.44], scale: [0.035, height * 0.92, 0.035] },
            { position: [width * 0.4, height * 0.48, depth * 0.44], scale: [0.035, height * 0.92, 0.035] },
          ]} />
          <ScaledInstances material={materials.green} items={[
            { position: [width * 0.33, height * 0.74, depth * 0.445], scale: [width * 0.11, height * 0.075, 0.025] },
          ]} />
          <ScaledInstances material={SHARED_BRAZIL_YELLOW_MATERIAL} items={[
            { position: [width * 0.33, height * 0.74, depth * 0.46], scale: [width * 0.035, height * 0.035, 0.026] },
          ]} />
          <ScaledInstances material={materials.dark} items={[
            { position: [width * 0.45, height * 0.77, depth * 0.445], scale: [width * 0.09, height * 0.025, 0.025] },
          ]} />
          <ScaledInstances material={SHARED_GERMAN_RED_MATERIAL} items={[
            { position: [width * 0.45, height * 0.745, depth * 0.445], scale: [width * 0.09, height * 0.025, 0.025] },
          ]} />
          <ScaledInstances material={SHARED_GERMAN_GOLD_MATERIAL} items={[
            { position: [width * 0.45, height * 0.72, depth * 0.445], scale: [width * 0.09, height * 0.025, 0.025] },
          ]} />
        </>
      )}
    </group>
  );
}

function FenasojaRestaurant({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: LandmarkModelProps) {
  const width = bounds.width;
  const depth = bounds.depth;
  const wallHeight = height * 0.36;
  const bodyDepth = depth * 0.72;
  const frontZ = bodyDepth / 2;
  const mainRoof = useMemo(
    () => createHipRoofGeometry(width * 0.98, depth * 0.9, height * 0.34),
    [depth, height, width],
  );
  const upperRoof = useMemo(
    () => createHipRoofGeometry(width * 0.46, depth * 0.42, height * 0.18),
    [depth, height, width],
  );
  const entranceBody = useMemo(
    () => createGableBodyGeometry(width * 0.27, depth * 0.16, wallHeight * 0.83, height * 0.16),
    [depth, height, wallHeight, width],
  );
  const windowTransforms = [-0.41, -0.29, -0.17, 0.17, 0.29, 0.41].map((x) => ({
    position: [x * width, wallHeight * 0.5, frontZ + 0.035] as Vector3Tuple,
    scale: [width * 0.095, wallHeight * 0.48, 0.04] as Vector3Tuple,
  }));
  const facadePosts = [-0.48, -0.36, -0.24, -0.12, 0.12, 0.24, 0.36, 0.48].map((x) => ({
    position: [x * width, wallHeight * 0.53, frontZ + 0.058] as Vector3Tuple,
    scale: [0.038, wallHeight * 0.96, 0.045] as Vector3Tuple,
  }));
  const umbrellaPositions = [-0.37, -0.18, 0.18, 0.37].map((x) => x * width);

  useEffect(() => () => {
    mainRoof.dispose();
    upperRoof.dispose();
    entranceBody.dispose();
  }, [entranceBody, mainRoof, upperRoof]);

  return (
    <group dispose={null}>
      <mesh geometry={UNIT_BOX} material={materials.platform} position={[0, 0.045, 0]} scale={[width * 0.98, 0.09, depth * 0.98]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={UNIT_BOX} material={materials.wall} position={[0, wallHeight / 2 + 0.08, -depth * 0.04]} scale={[width * 0.9, wallHeight, bodyDepth]} castShadow receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={mainRoof} material={materials.roof} position={[0, wallHeight + 0.08, -depth * 0.04]} castShadow receiveShadow raycast={NO_RAYCAST} />
      <mesh geometry={UNIT_BOX} material={materials.accent} position={[0, wallHeight + height * 0.31, -depth * 0.08]} scale={[width * 0.37, height * 0.13, depth * 0.25]} castShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={upperRoof} material={materials.roof} position={[0, wallHeight + height * 0.38, -depth * 0.08]} castShadow raycast={NO_RAYCAST} />
      <mesh geometry={entranceBody} material={materials.white} position={[0, 0.08, frontZ + depth * 0.04]} castShadow receiveShadow raycast={NO_RAYCAST} />
      <ScaledInstances material={materials.glass} items={windowTransforms} />
      <ScaledInstances material={materials.trim} items={facadePosts} castShadow />
      <ScaledInstances material={materials.green} items={[
        { position: [-width * 0.31, 0.18, frontZ + depth * 0.11], scale: [width * 0.25, 0.16, depth * 0.08] },
        { position: [width * 0.31, 0.18, frontZ + depth * 0.11], scale: [width * 0.25, 0.16, depth * 0.08] },
      ]} />
      {showDetail && (
        <>
          <SignagePanel title="FENASOJA" subtitle="RESTAURANTE" position={[0, wallHeight * 0.76, frontZ + depth * 0.135]} size={[width * 0.24, height * 0.1]} background="#176f43" />
          <ScaledInstances geometry={UNIT_CYLINDER} material={materials.metal} items={umbrellaPositions.map((x) => ({
            position: [x, height * 0.22, depth * 0.42] as Vector3Tuple,
            scale: [0.028, height * 0.42, 0.028] as Vector3Tuple,
          }))} />
          <ScaledInstances geometry={UNIT_CONE} material={materials.green} items={umbrellaPositions.map((x) => ({
            position: [x, height * 0.4, depth * 0.42] as Vector3Tuple,
            scale: [width * 0.085, height * 0.09, width * 0.085] as Vector3Tuple,
          }))} castShadow />
        </>
      )}
      {showFocusDetail && (
        <ScaledInstances material={materials.trim} items={[
          { position: [-width * 0.31, 0.13, depth * 0.47], scale: [width * 0.17, 0.07, 0.07] },
          { position: [-width * 0.31, 0.22, depth * 0.47], scale: [width * 0.14, 0.035, 0.12] },
          { position: [width * 0.31, 0.13, depth * 0.47], scale: [width * 0.17, 0.07, 0.07] },
          { position: [width * 0.31, 0.22, depth * 0.47], scale: [width * 0.14, 0.035, 0.12] },
        ]} />
      )}
    </group>
  );
}

function SicrediArena({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: LandmarkModelProps) {
  const width = bounds.width;
  const depth = bounds.depth;
  const radius = Math.min(width * 0.44, height * 0.94);
  const shellDepth = depth * 0.58;
  const shellZ = -depth * 0.1;
  const shellFrontZ = shellZ + shellDepth / 2;
  const shellGeometry = useMemo(() => createArenaShellGeometry(radius, shellDepth), [radius, shellDepth]);
  const rearArch = useMemo(() => createArchedFacadeGeometry(radius * 0.86), [radius]);
  const greenArch = useMemo(
    () => new THREE.TorusGeometry(radius - width * 0.025, width * 0.034, 8, 32, Math.PI),
    [radius, width],
  );
  const innerArch = useMemo(
    () => new THREE.TorusGeometry(radius - width * 0.074, width * 0.012, 6, 28, Math.PI),
    [radius, width],
  );
  const trussItems: InstanceTransform[] = [
    ...[-0.62, -0.35, 0.35, 0.62].map((x) => ({
      position: [x * radius, radius * 0.36, shellFrontZ + 0.07] as Vector3Tuple,
      scale: [0.07, radius * 0.72, 0.07] as Vector3Tuple,
    })),
    { position: [0, radius * 0.69, shellFrontZ + 0.07], scale: [radius * 1.22, 0.07, 0.07] },
  ];

  useEffect(() => () => {
    shellGeometry.dispose();
    rearArch.dispose();
    greenArch.dispose();
    innerArch.dispose();
  }, [greenArch, innerArch, rearArch, shellGeometry]);

  return (
    <group dispose={null}>
      <mesh geometry={UNIT_BOX} material={materials.platform} position={[0, 0.07, depth * 0.34]} scale={[width * 0.94, 0.14, depth * 0.3]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={UNIT_BOX} material={materials.dark} position={[0, 0.14, shellZ]} scale={[radius * 1.72, 0.22, shellDepth * 0.88]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={shellGeometry} material={materials.white} position={[0, 0.18, shellZ]} castShadow receiveShadow raycast={NO_RAYCAST} />
      <mesh geometry={rearArch} material={materials.dark} position={[0, 0.18, shellZ - shellDepth * 0.49]} raycast={NO_RAYCAST} />
      <mesh geometry={greenArch} material={materials.green} position={[0, 0.18, shellFrontZ + 0.06]} castShadow raycast={NO_RAYCAST} />
      <mesh geometry={innerArch} material={materials.white} position={[0, 0.18, shellFrontZ + 0.085]} raycast={NO_RAYCAST} />
      <ScaledInstances material={materials.green} items={[
        { position: [-radius * 0.91, radius * 0.27, shellZ], scale: [width * 0.075, radius * 0.55, shellDepth * 0.9], rotation: [0, 0, -0.13] },
        { position: [radius * 0.91, radius * 0.27, shellZ], scale: [width * 0.075, radius * 0.55, shellDepth * 0.9], rotation: [0, 0, 0.13] },
      ]} castShadow />
      <ScaledInstances material={materials.dark} items={[
        { position: [-radius * 0.72, radius * 0.34, shellFrontZ + 0.1], scale: [width * 0.09, radius * 0.42, depth * 0.08] },
        { position: [radius * 0.72, radius * 0.34, shellFrontZ + 0.1], scale: [width * 0.09, radius * 0.42, depth * 0.08] },
      ]} />
      {showDetail && (
        <>
          <ScaledInstances material={materials.metal} items={trussItems} />
          <SignagePanel title="SICREDI  |  ICATU" subtitle="COOPERA" position={[0, radius * 0.76, shellFrontZ + 0.14]} size={[radius * 1.04, radius * 0.14]} background="#164936" />
          <ScaledInstances material={materials.accent} items={[
            { position: [0, 0.16, depth * 0.25], scale: [width * 0.68, 0.055, depth * 0.04] },
            { position: [0, 0.12, depth * 0.3], scale: [width * 0.74, 0.045, depth * 0.04] },
          ]} />
        </>
      )}
      {showFocusDetail && (
        <>
          <ScaledInstances material={materials.metal} items={[-0.82, -0.55, 0.55, 0.82].map((x) => ({
            position: [x * radius, radius * 0.19, shellZ - shellDepth * 0.18] as Vector3Tuple,
            scale: [0.045, radius * 0.38, 0.045] as Vector3Tuple,
          }))} />
          <ScaledInstances material={materials.dark} items={[
            { position: [-radius * 0.42, radius * 0.17, shellZ - shellDepth * 0.29], scale: [width * 0.1, radius * 0.27, depth * 0.06] },
            { position: [radius * 0.42, radius * 0.17, shellZ - shellDepth * 0.29], scale: [width * 0.1, radius * 0.27, depth * 0.06] },
          ]} />
        </>
      )}
    </group>
  );
}

interface LandmarkModelProps {
  bounds: StrategicLandmarkBounds;
  height: number;
  materials: LandmarkMaterialSet;
  showDetail: boolean;
  showFocusDetail: boolean;
}

export interface StrategicLandmarkMeshProps {
  entity: MapEntity;
  selected: boolean;
  hovered: boolean;
  filtersActive: boolean;
  isMatch: boolean;
  layerOpacity: number;
  cameraNavigating: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onFocus: () => void;
  onCursor: (cursor: 'grab' | 'grabbing' | 'pointer') => void;
}

export function StrategicLandmarkMesh({
  entity,
  selected,
  hovered,
  filtersActive,
  isMatch,
  layerOpacity,
  cameraNavigating,
  onSelect,
  onHover,
  onFocus,
  onCursor,
}: StrategicLandmarkMeshProps) {
  const kind = resolveStrategicLandmarkKind(entity);
  const bounds = useMemo(() => strategicLandmarkBounds(entity), [entity]);
  const height = strategicLandmarkVisualHeight(entity) ?? entity.geometry.extrusionHeight;
  const footprint = useMemo(() => createLocalFootprintGeometry(entity, bounds), [bounds, entity]);
  const hitVolume = useMemo(
    () => createLocalHitVolumeGeometry(entity, bounds, height),
    [bounds, entity, height],
  );
  const outline = useMemo(() => createLocalFootprintOutline(entity, bounds), [bounds, entity]);
  const filterStrength = filtersActive && !isMatch && !selected ? 0.42 : 1;
  const toneDown = 1 - THREE.MathUtils.clamp(layerOpacity * filterStrength, 0, 1);
  const materials = useLandmarkMaterials(kind ?? 'german-pavilion', toneDown, selected, hovered);
  const { showDetail, showFocusDetail } = useArchitecturalDetail(
    kind ?? 'german-pavilion',
    bounds,
    selected,
  );
  const selectedLift = selected ? 0.075 : 0;
  const facingRadians = strategicLandmarkFacingRadians(entity);
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => () => {
    footprint.dispose();
    hitVolume.dispose();
    outline.dispose();
  }, [footprint, hitVolume, outline]);

  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, selected, showDetail, showFocusDetail]);

  if (!kind) return null;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (!isMapSelectionClick(event.delta)) return;
    onSelect(entity.id);
  };
  const handleDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (!isMapSelectionClick(event.delta)) return;
    onSelect(entity.id);
    onFocus();
  };

  const modelProps: LandmarkModelProps = {
    bounds,
    height,
    materials,
    showDetail,
    showFocusDetail,
  };

  return (
    <group
      position={[bounds.centerX, entity.geometry.elevation + selectedLift, bounds.centerZ]}
      visible={selected || layerOpacity > 0.015}
      dispose={null}
    >
      <mesh
        geometry={hitVolume}
        material={SHARED_INVISIBLE_HIT_MATERIAL}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onPointerOver={(event) => {
          event.stopPropagation();
          if (cameraNavigating) return;
          onCursor('pointer');
          onHover(entity.id);
        }}
        onPointerOut={() => {
          onCursor(cameraNavigating ? 'grabbing' : 'grab');
          onHover(null);
        }}
        dispose={null}
      />
      <group rotation={[0, facingRadians, 0]} dispose={null}>
        {kind === 'german-pavilion' && <GermanPavilion {...modelProps} />}
        {kind === 'fenasoja-restaurant' && <FenasojaRestaurant {...modelProps} />}
        {kind === 'sicredi-arena' && <SicrediArena {...modelProps} />}
      </group>
      {(selected || hovered) && (
        <>
          <mesh
            geometry={footprint}
            material={selected ? SHARED_SELECTED_SURFACE_MATERIAL : SHARED_HOVERED_SURFACE_MATERIAL}
            position={[0, 0.04, 0]}
            raycast={NO_RAYCAST}
            dispose={null}
          />
          <lineSegments
            geometry={outline}
            material={selected ? SHARED_SELECTED_LINE_MATERIAL : SHARED_HOVERED_LINE_MATERIAL}
            raycast={NO_RAYCAST}
            renderOrder={5}
            dispose={null}
          />
        </>
      )}
    </group>
  );
}
