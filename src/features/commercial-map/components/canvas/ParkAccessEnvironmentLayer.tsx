import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeBufferGeometries } from 'three-stdlib';
import {
  PARK_ACCESS_AMBIENT_VEGETATION_PALETTE,
  PARK_ACCESS_ENVIRONMENT_PALETTE,
  resolveParkAccessEnvironmentPresentation,
  type ParkAccessEnvironmentSurface,
} from '../../data/parkAccessEnvironment';
import type { ParkAccessPolygon } from '../../data/parkAccessSpatialPlan';
import type { ParkAccessEnvironmentPlacement } from '../../utils/parkAccessEnvironment';

const NO_RAYCAST = () => undefined;

const SURFACE_USER_DATA = Object.freeze({
  layer: 'park-access-environment',
  classification: 'NON_COMMERCIAL_ENVIRONMENT',
  isSellable: false,
  contributesToCommercialMetrics: false,
  source: 'PARK_ACCESS_SPATIAL_PLAN',
});

const VEGETATION_USER_DATA = Object.freeze({
  ...SURFACE_USER_DATA,
  classification: 'AMBIENT_VEGETATION',
  canonicalTreeInventory: false,
  interaction: 'disabled',
});

function openPolygon(points: ParkAccessPolygon) {
  if (points.length < 2) return [...points];
  const first = points[0];
  const last = points[points.length - 1];
  return Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-6
    ? points.slice(0, -1)
    : [...points];
}

function appendShapePath(path: THREE.Shape | THREE.Path, points: ParkAccessPolygon) {
  openPolygon(points).forEach(([x, z], index) => {
    if (index === 0) path.moveTo(x, -z);
    else path.lineTo(x, -z);
  });
  path.closePath();
}

function colorGeometry(geometry: THREE.BufferGeometry, colorValue: string) {
  const color = new THREE.Color(colorValue);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    color.toArray(colors, index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function toNonIndexedOwned(geometry: THREE.BufferGeometry) {
  if (!geometry.index) return geometry;
  const nonIndexed = geometry.toNonIndexed();
  geometry.dispose();
  return nonIndexed;
}

function createSurfaceGeometry(surface: ParkAccessEnvironmentSurface) {
  const shape = new THREE.Shape();
  appendShapePath(shape, surface.polygon);
  surface.holes.forEach((holePolygon) => {
    if (holePolygon.length < 3) return;
    const hole = new THREE.Path();
    appendShapePath(hole, holePolygon);
    shape.holes.push(hole);
  });
  const geometry = new THREE.ShapeGeometry(shape, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, surface.elevation, 0);
  const position = geometry.getAttribute('position');
  const uvs = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    uvs[index * 2] = position.getX(index) * 0.34;
    uvs[index * 2 + 1] = position.getZ(index) * 0.34;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  colorGeometry(geometry, PARK_ACCESS_ENVIRONMENT_PALETTE[surface.kind]);
  geometry.computeVertexNormals();
  return geometry;
}

function mergeSurfaceGeometries(surfaces: readonly ParkAccessEnvironmentSurface[]) {
  const geometries = surfaces
    .filter((surface) => surface.polygon.length >= 3)
    .map(createSurfaceGeometry);
  if (!geometries.length) return new THREE.BufferGeometry();
  const merged = mergeBufferGeometries(geometries, false) ?? new THREE.BufferGeometry();
  geometries.forEach((geometry) => geometry.dispose());
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function proceduralTexture(name: string, seed: number, trail: boolean) {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const fine = Math.sin((x + seed) * 1.73 + y * 2.19) * 0.5 + 0.5;
      const broad = Math.cos(x * 0.31 - y * 0.27 + seed * 0.7) * 0.5 + 0.5;
      const fleck = ((x * 37 + y * 53 + seed * 17) % (trail ? 43 : 61)) === 0 ? 1 : 0;
      const value = THREE.MathUtils.clamp(
        Math.round((trail ? 194 : 205) + fine * 24 + broad * 13 + fleck * (trail ? 22 : 12)),
        0,
        255,
      );
      const offset = (y * size + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = name;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createGroundMaterial(texture: THREE.Texture) {
  return new THREE.MeshStandardMaterial({
    color: '#ffffff',
    map: texture,
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
    depthTest: true,
    depthWrite: true,
  });
}

function createAmbientTreeGeometry(reducedGraphics: boolean) {
  const trunk = toNonIndexedOwned(new THREE.CylinderGeometry(0.095, 0.145, 1.38, 6, 1));
  trunk.translate(0, 0.69, 0);
  trunk.deleteAttribute('uv');
  colorGeometry(trunk, PARK_ACCESS_AMBIENT_VEGETATION_PALETTE.trunk);

  const canopySpecs = reducedGraphics
    ? [
      { y: 1.62, x: 0, z: 0, scale: [0.62, 0.42, 0.58], color: PARK_ACCESS_AMBIENT_VEGETATION_PALETTE.canopy },
      { y: 2.17, x: 0.06, z: -0.03, scale: [0.5, 0.46, 0.48], color: PARK_ACCESS_AMBIENT_VEGETATION_PALETTE.canopyHighlight },
    ]
    : [
      { y: 1.52, x: -0.07, z: 0.04, scale: [0.67, 0.36, 0.6], color: PARK_ACCESS_AMBIENT_VEGETATION_PALETTE.canopy },
      { y: 1.98, x: 0.08, z: -0.04, scale: [0.59, 0.42, 0.55], color: PARK_ACCESS_AMBIENT_VEGETATION_PALETTE.canopyHighlight },
      { y: 2.45, x: -0.03, z: 0.02, scale: [0.48, 0.44, 0.46], color: PARK_ACCESS_AMBIENT_VEGETATION_PALETTE.canopy },
    ];
  const canopies = canopySpecs.map((spec) => {
    const canopy = toNonIndexedOwned(new THREE.IcosahedronGeometry(1, 0));
    canopy.scale(spec.scale[0], spec.scale[1], spec.scale[2]);
    canopy.translate(spec.x, spec.y, spec.z);
    canopy.deleteAttribute('uv');
    return colorGeometry(canopy, spec.color);
  });
  const merged = mergeBufferGeometries([trunk, ...canopies], false) ?? new THREE.BufferGeometry();
  trunk.dispose();
  canopies.forEach((canopy) => canopy.dispose());
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function createUnderstoryGeometry() {
  const specs = [
    { x: -0.1, z: 0.02, radius: 0.115, height: 0.34, color: PARK_ACCESS_AMBIENT_VEGETATION_PALETTE.understory },
    { x: 0.1, z: -0.035, radius: 0.1, height: 0.29, color: PARK_ACCESS_AMBIENT_VEGETATION_PALETTE.understoryHighlight },
    { x: 0, z: 0.09, radius: 0.08, height: 0.25, color: PARK_ACCESS_AMBIENT_VEGETATION_PALETTE.understory },
  ];
  const tufts = specs.map((spec) => {
    const geometry = new THREE.ConeGeometry(spec.radius, spec.height, 4, 1);
    geometry.translate(spec.x, spec.height / 2, spec.z);
    geometry.deleteAttribute('uv');
    return colorGeometry(geometry, spec.color);
  });
  const merged = mergeBufferGeometries(tufts, false) ?? new THREE.BufferGeometry();
  tufts.forEach((tuft) => tuft.dispose());
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function refreshInstanceBounds(mesh: THREE.InstancedMesh | null) {
  if (!mesh) return;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

function writePlacements(
  mesh: THREE.InstancedMesh | null,
  placements: readonly ParkAccessEnvironmentPlacement[],
  baseElevation: number,
) {
  if (!mesh) return;
  const transform = new THREE.Object3D();
  placements.forEach((placement, index) => {
    transform.position.set(placement.position[0], baseElevation, placement.position[1]);
    transform.rotation.set(0, placement.rotation, 0);
    transform.scale.set(...placement.scale);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  });
  refreshInstanceBounds(mesh);
}

export const ParkAccessEnvironmentLayer = memo(function ParkAccessEnvironmentLayer({
  reducedGraphics,
  surfacesVisible = true,
  vegetationVisible = true,
}: {
  reducedGraphics: boolean;
  surfacesVisible?: boolean;
  vegetationVisible?: boolean;
}) {
  const treeRef = useRef<THREE.InstancedMesh>(null);
  const understoryRef = useRef<THREE.InstancedMesh>(null);
  const { invalidate } = useThree();
  const presentation = useMemo(
    () => resolveParkAccessEnvironmentPresentation(reducedGraphics),
    [reducedGraphics],
  );
  const geometries = useMemo(() => ({
    environment: mergeSurfaceGeometries(presentation.environmentalSurfaces),
    trail: mergeSurfaceGeometries(presentation.trailSurfaces),
    tree: createAmbientTreeGeometry(reducedGraphics),
    understory: createUnderstoryGeometry(),
  }), [presentation, reducedGraphics]);
  const textures = useMemo(() => ({
    environment: proceduralTexture('textura-procedural-entorno-acessos', 17, false),
    trail: proceduralTexture('textura-procedural-caminho-bosque', 29, true),
  }), []);
  const materials = useMemo(() => ({
    environment: createGroundMaterial(textures.environment),
    trail: createGroundMaterial(textures.trail),
    tree: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
      flatShading: false,
    }),
    understory: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
      flatShading: true,
    }),
  }), [textures]);

  useLayoutEffect(() => {
    writePlacements(treeRef.current, presentation.ambientTrees, 0.035);
    writePlacements(understoryRef.current, presentation.understory, 0.034);
    invalidate();
  }, [invalidate, presentation]);

  useEffect(() => {
    invalidate();
  }, [invalidate, surfacesVisible, vegetationVisible]);

  useEffect(() => () => {
    Object.values(geometries).forEach((geometry) => geometry.dispose());
  }, [geometries]);

  useEffect(() => () => {
    Object.values(materials).forEach((material) => material.dispose());
  }, [materials]);

  useEffect(() => () => {
    Object.values(textures).forEach((texture) => texture.dispose());
  }, [textures]);

  return (
    <group
      name="camada-ambiental-acessos-parque"
      userData={{ ...SURFACE_USER_DATA, diagnostics: presentation.diagnostics }}
    >
      <group name="superficies-ambientais-acessos" visible={surfacesVisible}>
        <mesh
          name="solos-transicoes-acessos"
          geometry={geometries.environment}
          material={materials.environment}
          renderOrder={0}
          frustumCulled
          castShadow={false}
          receiveShadow={false}
          raycast={NO_RAYCAST}
          dispose={null}
        />
        <mesh
          name="caminho-do-bosque"
          geometry={geometries.trail}
          material={materials.trail}
          renderOrder={0}
          frustumCulled
          castShadow={false}
          receiveShadow={false}
          raycast={NO_RAYCAST}
          dispose={null}
        />
      </group>
      <group name="vegetacao-ambiental-acessos" visible={vegetationVisible} userData={VEGETATION_USER_DATA}>
        {presentation.ambientTrees.length > 0 && (
          <instancedMesh
            ref={treeRef}
            name="arborizacao-enquadramento-benvenuto-costeiros"
            args={[geometries.tree, materials.tree, presentation.ambientTrees.length]}
            count={presentation.ambientTrees.length}
            frustumCulled
            castShadow={false}
            receiveShadow={false}
            raycast={NO_RAYCAST}
            dispose={null}
          />
        )}
        {presentation.understory.length > 0 && (
          <instancedMesh
            ref={understoryRef}
            name="sub-bosque-bordas-naturais"
            args={[geometries.understory, materials.understory, presentation.understory.length]}
            count={presentation.understory.length}
            frustumCulled
            castShadow={false}
            receiveShadow={false}
            raycast={NO_RAYCAST}
            dispose={null}
          />
        )}
      </group>
    </group>
  );
});
