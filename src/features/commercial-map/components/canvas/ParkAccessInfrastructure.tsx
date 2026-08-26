import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PARK_ACCESS_SPATIAL_PLAN } from '../../data/parkAccessSpatialPlan';
import type { ParkAccessArchitectureInstance } from '../../utils/parkAccessArchitecture';
import {
  buildParkAccessRenderModel,
  disposeParkAccessRenderModel,
} from '../../utils/parkAccessInfrastructure';
import { PARK_ACCESS_INFRASTRUCTURE_INPUT } from '../../utils/parkAccessSpatialPlanAdapter';

interface ParkAccessInfrastructureProps {
  reducedGraphics: boolean;
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

const ASPHALT_TEXTURE = createInfrastructureTexture(3107, [178, 181, 181], 16);
const ASPHALT_ROUGHNESS = roughnessTexture(ASPHALT_TEXTURE);
const GRAVEL_TEXTURE = createInfrastructureTexture(851, [176, 156, 126], 34);
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
  const depthWrite = opacity > 0.42;
  if (kind === 'asphalt') return (
    <meshStandardMaterial
      color="#555b5d"
      map={reducedGraphics ? undefined : ASPHALT_TEXTURE}
      roughnessMap={reducedGraphics ? undefined : ASPHALT_ROUGHNESS}
      bumpMap={reducedGraphics ? undefined : ASPHALT_ROUGHNESS}
      bumpScale={0.0045}
      roughness={0.98}
      metalness={0}
      transparent={transparent}
      opacity={opacity}
      depthWrite={depthWrite}
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
      depthWrite={depthWrite}
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
      depthWrite={depthWrite}
    />
  );
  if (kind === 'curbs' || kind === 'roundaboutCurb') return (
    <meshStandardMaterial
      color={kind === 'roundaboutCurb' ? '#dad6cb' : '#d3d4cf'}
      roughness={0.92}
      metalness={0}
      transparent={transparent}
      opacity={opacity}
      depthWrite={depthWrite}
    />
  );
  if (kind === 'landscape') return (
    <meshStandardMaterial
      color="#668351"
      roughness={1}
      metalness={0}
      transparent={transparent}
      opacity={opacity}
      depthWrite={depthWrite}
    />
  );
  return (
    <meshStandardMaterial
      color={kind === 'yellowMarkings' ? '#e2b43b' : '#ecebe4'}
      roughness={0.82}
      metalness={0}
      transparent={transparent}
      opacity={opacity}
      depthWrite={depthWrite}
      polygonOffset
      polygonOffsetFactor={-2}
      polygonOffsetUnits={-2}
    />
  );
}

export const ParkAccessInfrastructure = memo(function ParkAccessInfrastructure({
  reducedGraphics,
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
  const model = useMemo(
    () => buildParkAccessRenderModel(
      PARK_ACCESS_INFRASTRUCTURE_INPUT,
      { reducedGraphics },
    ),
    [reducedGraphics],
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
          renderOrder={kind === 'whiteMarkings' || kind === 'yellowMarkings' ? 3 : 1}
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
