import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ROAD_MATERIAL_COLORS, ROAD_SURFACE_PROFILE } from '../../constants';
import { PARK_ACCESS_SPATIAL_PLAN } from '../../data/parkAccessSpatialPlan';
import type { ParkAccessArchitectureInstance } from '../../utils/parkAccessArchitecture';
import {
  buildParkAccessRenderModel,
  disposeParkAccessRenderModel,
} from '../../utils/parkAccessInfrastructure';
import {
  EXPORURAL_PARK_ACCESS_INFRASTRUCTURE_INPUT,
  PARK_ACCESS_INFRASTRUCTURE_INPUT,
} from '../../utils/parkAccessSpatialPlanAdapter';

export type ParkAccessInfrastructureScope = 'all' | 'exporural';

interface ParkAccessInfrastructureProps {
  reducedGraphics: boolean;
  scope?: ParkAccessInfrastructureScope;
  opacity?: number;
  visible?: boolean;
  surfaceOpacity?: number;
  surfacesVisible?: boolean;
  architectureOpacity?: number;
  architectureVisible?: boolean;
}

interface InstanceBatchProps {
  name: string;
  instances: readonly ParkAccessArchitectureInstance[];
  opacity: number;
  reducedGraphics: boolean;
  materialKind: 'opaque' | 'glass' | 'metal';
}

const NO_RAYCAST = () => undefined;
const WHITE = new THREE.Color('#ffffff');
const FEATURE_USER_DATA = Object.freeze({
  featureSet: 'park-access-infrastructure',
  spatialRevision: PARK_ACCESS_SPATIAL_PLAN.revision,
  classification: 'NON_COMMERCIAL_INFRASTRUCTURE',
  isSellable: false,
  contributesToCommercialMetrics: false,
  protectedCommercialGeometry: true,
});

function textureNoise(x: number, y: number, seed: number) {
  let value = (x * 374761393 + y * 668265263 + seed * 1442695041) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
  return ((value ^ (value >>> 16)) & 0xffff) / 0xffff;
}

function createInfrastructureTexture(
  seed: number,
  base: readonly [number, number, number],
  amplitude: number,
  jointEvery = 0,
) {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const noise = (textureNoise(x, y, seed) - 0.5) * amplitude;
      const broad = Math.sin((x + seed) * 0.17) * 2.2 + Math.cos((y - seed) * 0.13) * 1.8;
      const joint = jointEvery > 0 && (x % jointEvery <= 1 || y % jointEvery <= 1) ? -18 : 0;
      const offset = (y * size + x) * 4;
      data[offset] = THREE.MathUtils.clamp(Math.round(base[0] + noise + broad + joint), 0, 255);
      data[offset + 1] = THREE.MathUtils.clamp(Math.round(base[1] + noise + broad + joint), 0, 255);
      data[offset + 2] = THREE.MathUtils.clamp(Math.round(base[2] + noise + broad + joint), 0, 255);
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.42, 0.42);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function roughnessTexture(colorTexture: THREE.DataTexture) {
  const texture = colorTexture.clone();
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createAsphaltTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const fine = (textureNoise(x, y, 3107) - 0.5) * 18;
      const aggregateNoise = textureNoise(Math.floor(x / 2), Math.floor(y / 2), 7739);
      const aggregate = aggregateNoise > 0.88
        ? 24 + (aggregateNoise - 0.88) * 70
        : aggregateNoise < 0.09 ? -18 : 0;
      const wear = Math.sin(x * 0.15 + y * 0.08) * 2.4
        + Math.cos(y * 0.19 - x * 0.05) * 1.8;
      const offset = (y * size + x) * 4;
      data[offset] = THREE.MathUtils.clamp(Math.round(176 + fine + aggregate + wear), 0, 255);
      data[offset + 1] = THREE.MathUtils.clamp(Math.round(179 + fine + aggregate + wear), 0, 255);
      data[offset + 2] = THREE.MathUtils.clamp(Math.round(179 + fine + aggregate + wear * 0.8), 0, 255);
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.5, 0.5);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createGravelTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const cellSize = 4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cellX = Math.floor(x / cellSize);
      const cellY = Math.floor(y / cellSize);
      const centerX = (cellX + 0.22 + textureNoise(cellX, cellY, 851) * 0.56) * cellSize;
      const centerY = (cellY + 0.22 + textureNoise(cellX, cellY, 1291) * 0.56) * cellSize;
      const distance = Math.hypot(x - centerX, (y - centerY) * 1.18);
      const stone = distance < 1.35;
      const stoneTone = (textureNoise(cellX, cellY, 4211) - 0.5) * 42;
      const dust = (textureNoise(x, y, 6907) - 0.5) * 20;
      const rut = Math.sin((x + y * 0.18) * 0.21) * 3.2;
      const base = stone ? [181, 165, 139] : [157, 139, 113];
      const shade = dust + rut + (stone ? stoneTone : 0);
      const offset = (y * size + x) * 4;
      data[offset] = THREE.MathUtils.clamp(Math.round(base[0] + shade), 0, 255);
      data[offset + 1] = THREE.MathUtils.clamp(Math.round(base[1] + shade * 0.9), 0, 255);
      data[offset + 2] = THREE.MathUtils.clamp(Math.round(base[2] + shade * 0.72), 0, 255);
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.62, 0.62);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createCobblestoneTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const stoneWidth = 16;
  const stoneHeight = 10;
  for (let y = 0; y < size; y += 1) {
    const row = Math.floor(y / stoneHeight);
    for (let x = 0; x < size; x += 1) {
      const staggeredX = x + (row % 2) * stoneWidth * 0.5;
      const stoneX = Math.floor(staggeredX / stoneWidth);
      const horizontalJoint = [row, row + 1].some((boundaryRow) => {
        const segment = Math.floor(x / 7);
        const horizontalJointJitter = (textureNoise(boundaryRow, segment, 9127) - 0.5) * 3.2
          + Math.sin((x + boundaryRow * 11) * 0.19) * 0.65;
        return Math.abs(y - (boundaryRow * stoneHeight + horizontalJointJitter)) <= 1.15;
      });
      const verticalJoint = [stoneX, stoneX + 1].some((boundaryStone) => {
        const verticalJointJitter = (textureNoise(row, boundaryStone, 4813) - 0.5) * 4.6
          + Math.sin((y + row * 5 + boundaryStone * 3) * 0.31) * 0.75;
        const boundaryX = boundaryStone * stoneWidth
          - (row % 2) * stoneWidth * 0.5
          + verticalJointJitter;
        return Math.abs(x - boundaryX) <= 1.1;
      });
      const joint = horizontalJoint || verticalJoint;
      const stoneNoise = (textureNoise(stoneX, row, 4813) - 0.5) * 20;
      const fineNoise = (textureNoise(x, y, 7349) - 0.5) * 10;
      const base = joint ? [66, 61, 55] : [155, 146, 132];
      const noise = joint ? fineNoise * 0.28 : stoneNoise + fineNoise;
      const offset = (y * size + x) * 4;
      data[offset] = THREE.MathUtils.clamp(Math.round(base[0] + noise), 0, 255);
      data[offset + 1] = THREE.MathUtils.clamp(Math.round(base[1] + noise), 0, 255);
      data[offset + 2] = THREE.MathUtils.clamp(Math.round(base[2] + noise), 0, 255);
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.56, 0.56);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const ASPHALT_TEXTURE = createAsphaltTexture();
const ASPHALT_ROUGHNESS = roughnessTexture(ASPHALT_TEXTURE);
const COBBLESTONE_TEXTURE = createCobblestoneTexture();
const COBBLESTONE_ROUGHNESS = roughnessTexture(COBBLESTONE_TEXTURE);
const GRAVEL_TEXTURE = createGravelTexture();
const GRAVEL_ROUGHNESS = roughnessTexture(GRAVEL_TEXTURE);
const PAVER_TEXTURE = createInfrastructureTexture(1947, [210, 205, 194], 13, 16);
const PAVER_ROUGHNESS = roughnessTexture(PAVER_TEXTURE);

function configureInstanceMaterial(
  material: THREE.MeshStandardMaterial,
  opacity: number,
  materialKind: InstanceBatchProps['materialKind'],
) {
  const normalized = THREE.MathUtils.clamp(opacity, 0, 1);
  const glass = materialKind === 'glass';
  const effectiveOpacity = glass ? normalized * 0.7 : normalized;
  const transparent = glass || effectiveOpacity < 0.995;
  const depthWrite = !glass && effectiveOpacity > 0.42;
  if (
    material.opacity === effectiveOpacity
    && material.transparent === transparent
    && material.depthWrite === depthWrite
  ) return;
  material.opacity = effectiveOpacity;
  material.transparent = transparent;
  material.depthWrite = depthWrite;
  material.needsUpdate = true;
}

const InstanceBatch = memo(function InstanceBatch({
  name,
  instances,
  opacity,
  reducedGraphics,
  materialKind,
}: InstanceBatchProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { gl, invalidate } = useThree();
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: WHITE,
    roughness: materialKind === 'glass' ? 0.34 : materialKind === 'metal' ? 0.62 : 0.8,
    metalness: materialKind === 'metal' ? 0.24 : 0.02,
    transparent: materialKind === 'glass',
    opacity: materialKind === 'glass' ? 0.7 : 1,
    depthWrite: materialKind !== 'glass',
  }), [materialKind]);

  useEffect(() => {
    configureInstanceMaterial(material, opacity, materialKind);
    invalidate();
  }, [invalidate, material, materialKind, opacity]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    instances.forEach((instance, index) => {
      position.fromArray(instance.position);
      quaternion.fromArray(instance.quaternion);
      scale.fromArray(instance.scale);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, color.set(instance.color));
    });
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.castShadow = materialKind !== 'glass' && !reducedGraphics && opacity > 0.72;
    mesh.receiveShadow = materialKind !== 'glass';
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, instances, invalidate, materialKind, opacity, reducedGraphics]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  if (!instances.length || opacity <= 0.015) return null;
  return (
    <instancedMesh
      ref={ref}
      name={name}
      args={[geometry, material, instances.length]}
      count={instances.length}
      castShadow={materialKind !== 'glass' && !reducedGraphics && opacity > 0.72}
      receiveShadow={materialKind !== 'glass'}
      frustumCulled
      raycast={NO_RAYCAST}
      userData={FEATURE_USER_DATA}
      dispose={null}
    />
  );
});

function SurfaceMaterial({
  kind,
  opacity,
  reducedGraphics,
}: {
  kind: keyof ReturnType<typeof buildParkAccessRenderModel>['geometries'];
  opacity: number;
  reducedGraphics: boolean;
}) {
  const transparent = opacity < 0.995;
  if (kind === 'asphalt') return (
    <meshStandardMaterial
      color={ROAD_MATERIAL_COLORS.asphalt}
      map={reducedGraphics ? undefined : ASPHALT_TEXTURE}
      roughnessMap={reducedGraphics ? undefined : ASPHALT_ROUGHNESS}
      bumpMap={reducedGraphics ? undefined : ASPHALT_ROUGHNESS}
      bumpScale={ROAD_SURFACE_PROFILE.asphaltBumpScale}
      roughness={ROAD_SURFACE_PROFILE.asphaltRoughness}
      metalness={0}
      transparent={transparent}
      opacity={opacity}
      depthTest
      depthWrite
      polygonOffset
      polygonOffsetFactor={-1}
      polygonOffsetUnits={-1}
    />
  );
  if (kind === 'cobblestone') return (
    <meshStandardMaterial
      color="#9b9284"
      map={reducedGraphics ? undefined : COBBLESTONE_TEXTURE}
      roughnessMap={reducedGraphics ? undefined : COBBLESTONE_ROUGHNESS}
      bumpMap={reducedGraphics ? undefined : COBBLESTONE_ROUGHNESS}
      bumpScale={0.008}
      roughness={0.99}
      metalness={0}
      transparent={transparent}
      opacity={opacity}
      depthTest
      depthWrite
      polygonOffset
      polygonOffsetFactor={-1}
      polygonOffsetUnits={-1}
    />
  );
  if (kind === 'gravel') return (
    <meshStandardMaterial
      color="#927b5d"
      map={reducedGraphics ? undefined : GRAVEL_TEXTURE}
      roughnessMap={reducedGraphics ? undefined : GRAVEL_ROUGHNESS}
      bumpMap={reducedGraphics ? undefined : GRAVEL_ROUGHNESS}
      bumpScale={0.009}
      roughness={1}
      metalness={0}
      transparent={transparent}
      opacity={opacity}
      depthTest
      depthWrite
      polygonOffset
      polygonOffsetFactor={-1}
      polygonOffsetUnits={-1}
    />
  );
  if (kind === 'sidewalks') return (
    <meshStandardMaterial
      color="#c9c4b8"
      map={reducedGraphics ? undefined : PAVER_TEXTURE}
      roughnessMap={reducedGraphics ? undefined : PAVER_ROUGHNESS}
      bumpMap={reducedGraphics ? undefined : PAVER_ROUGHNESS}
      bumpScale={0.005}
      roughness={0.95}
      metalness={0}
      transparent={transparent}
      opacity={opacity}
      depthTest
      depthWrite
    />
  );
  if (kind === 'curbs' || kind === 'roundaboutCurb') return (
    <meshStandardMaterial
      color={kind === 'roundaboutCurb' ? '#dad6cb' : ROAD_MATERIAL_COLORS.curb}
      roughness={0.92}
      metalness={0}
      transparent={transparent}
      opacity={opacity}
      depthTest
      depthWrite
    />
  );
  if (kind === 'landscape') return (
    <meshStandardMaterial
      color="#668351"
      roughness={1}
      metalness={0}
      transparent={transparent}
      opacity={opacity}
      depthTest
      depthWrite
    />
  );
  return (
    <meshStandardMaterial
      color={kind === 'yellowMarkings' ? '#e2b43b' : '#ecebe4'}
      roughness={0.82}
      metalness={0}
      transparent={transparent}
      opacity={opacity}
      depthTest
      depthWrite
      polygonOffset
      polygonOffsetFactor={-2}
      polygonOffsetUnits={-2}
    />
  );
}

function surfaceRenderOrder(
  kind: keyof ReturnType<typeof buildParkAccessRenderModel>['geometries'],
) {
  if (kind === 'whiteMarkings' || kind === 'yellowMarkings') return 3;
  if (
    kind === 'sidewalks'
    || kind === 'curbs'
    || kind === 'roundaboutCurb'
    || kind === 'landscape'
  ) return 2;
  return 1;
}

export const ParkAccessInfrastructure = memo(function ParkAccessInfrastructure({
  reducedGraphics,
  scope = 'all',
  opacity = 1,
  visible = true,
  surfaceOpacity = opacity,
  surfacesVisible = visible,
  architectureOpacity = opacity,
  architectureVisible = visible,
}: ParkAccessInfrastructureProps) {
  const { invalidate } = useThree();
  const normalizedSurfaceOpacity = THREE.MathUtils.clamp(surfaceOpacity, 0, 1);
  const normalizedArchitectureOpacity = THREE.MathUtils.clamp(architectureOpacity, 0, 1);
  const resolvedSurfacesVisible = visible && surfacesVisible && normalizedSurfaceOpacity > 0.015;
  const resolvedArchitectureVisible = visible
    && architectureVisible
    && normalizedArchitectureOpacity > 0.015;
  const input = scope === 'exporural'
    ? EXPORURAL_PARK_ACCESS_INFRASTRUCTURE_INPUT
    : PARK_ACCESS_INFRASTRUCTURE_INPUT;
  const model = useMemo(
    () => buildParkAccessRenderModel(
      input,
      { reducedGraphics },
    ),
    [input, reducedGraphics],
  );

  useEffect(() => {
    invalidate();
  }, [
    invalidate,
    model,
    normalizedArchitectureOpacity,
    normalizedSurfaceOpacity,
    resolvedArchitectureVisible,
    resolvedSurfacesVisible,
  ]);

  useEffect(() => () => {
    disposeParkAccessRenderModel(model);
  }, [model]);

  if (!resolvedSurfacesVisible && !resolvedArchitectureVisible) return null;
  const surfaceEntries = Object.entries(model.geometries) as Array<[
    keyof typeof model.geometries,
    THREE.BufferGeometry | null,
  ]>;

  return (
    <group name="infraestrutura-acessos-parque" userData={FEATURE_USER_DATA}>
      {resolvedSurfacesVisible && surfaceEntries.map(([kind, geometry]) => geometry && (
        <mesh
          key={kind}
          name={`park-access-${kind}`}
          geometry={geometry}
          receiveShadow={kind !== 'whiteMarkings' && kind !== 'yellowMarkings'}
          raycast={NO_RAYCAST}
          renderOrder={surfaceRenderOrder(kind)}
          userData={FEATURE_USER_DATA}
          dispose={null}
        >
          <SurfaceMaterial
            kind={kind}
            opacity={normalizedSurfaceOpacity}
            reducedGraphics={reducedGraphics}
          />
        </mesh>
      ))}
      {resolvedArchitectureVisible && (
        <>
          <InstanceBatch
            name="park-access-architecture-opaque"
            instances={model.architecture.opaque}
            opacity={normalizedArchitectureOpacity}
            reducedGraphics={reducedGraphics}
            materialKind="opaque"
          />
          <InstanceBatch
            name="park-access-architecture-glass"
            instances={model.architecture.glass}
            opacity={normalizedArchitectureOpacity}
            reducedGraphics={reducedGraphics}
            materialKind="glass"
          />
          <InstanceBatch
            name="park-access-architecture-metal"
            instances={model.architecture.metal}
            opacity={normalizedArchitectureOpacity}
            reducedGraphics={reducedGraphics}
            materialKind="metal"
          />
        </>
      )}
    </group>
  );
});
