import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { MapEntity } from '../../types';
import {
  QUADRAS_AB_GROUND_MATERIALS,
  QUADRAS_AB_SPATIAL_REFERENCE,
} from '../../data/quadrasABEnvironment';
import {
  buildQuadrasABEnvironmentPlan,
  type QuadrasABEnvironmentCell,
} from '../../utils/quadrasABEnvironment';
import { commercialSitePolygonBounds } from '../../utils/commercialSiteEnvironment';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';

const NO_RAYCAST = () => undefined;
const UNIT_LEAF = new THREE.CircleGeometry(0.5, 7);
UNIT_LEAF.rotateX(-Math.PI / 2);
const DETAIL_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#6d5438',
  roughness: 1,
  metalness: 0,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

type QuadraId = 'A' | 'B';

interface QuadraGroundTextureBundle {
  map: THREE.DataTexture;
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
  dispose: () => void;
}

function smoothstep(minimum: number, maximum: number, value: number) {
  const normalized = THREE.MathUtils.clamp((value - minimum) / (maximum - minimum), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function ellipseDistance(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
) {
  return Math.hypot((x - centerX) / radiusX, (y - centerY) / radiusY);
}

function hash2(x: number, y: number, seed: number) {
  let value = Math.imul(x + seed * 1013, 374761393) ^ Math.imul(y - seed * 733, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number, frequency: number, seed: number) {
  const sampleX = x * frequency;
  const sampleY = y * frequency;
  const x0 = Math.floor(sampleX);
  const y0 = Math.floor(sampleY);
  const tx = smoothstep(0, 1, sampleX - x0);
  const ty = smoothstep(0, 1, sampleY - y0);
  const north = THREE.MathUtils.lerp(hash2(x0, y0, seed), hash2(x0 + 1, y0, seed), tx);
  const south = THREE.MathUtils.lerp(hash2(x0, y0 + 1, seed), hash2(x0 + 1, y0 + 1, seed), tx);
  return THREE.MathUtils.lerp(north, south, ty);
}

function groundNoise(x: number, y: number, seed: number) {
  return valueNoise(x, y, 3.1, seed) * 0.54
    + valueNoise(x, y, 8.7, seed + 1) * 0.3
    + valueNoise(x, y, 23.4, seed + 2) * 0.16;
}

function groundWeights(quadra: QuadraId, x: number, y: number, noise: number) {
  if (quadra === 'A') {
    const clearing = ellipseDistance(x, y, 0.52, 0.49, 0.24, 0.22);
    const shadeDistance = Math.min(
      ellipseDistance(x, y, 0.13, 0.48, 0.18, 0.42),
      ellipseDistance(x, y, 0.88, 0.5, 0.16, 0.4),
      ellipseDistance(x, y, 0.54, 0.88, 0.36, 0.15),
      ellipseDistance(x, y, 0.48, 0.08, 0.42, 0.13),
    );
    const soil = (1 - smoothstep(0.38, 1.08, clearing)) * (0.58 + noise * 0.34);
    const dryRing = (1 - smoothstep(0.76, 1.48, clearing)) * (1 - soil * 0.62);
    const scatteredDry = smoothstep(0.58, 0.88, noise) * 0.22;
    const shade = (1 - smoothstep(0.52, 1.18, shadeDistance)) * (0.64 + noise * 0.2);
    return { soil, dry: Math.max(dryRing * 0.68, scatteredDry), shade };
  }

  const openGround = ellipseDistance(x, y, 0.56, 0.54, 0.31, 0.34);
  const shadeDistance = Math.min(
    ellipseDistance(x, y, 0.84, 0.49, 0.2, 0.48),
    ellipseDistance(x, y, 0.56, 0.09, 0.37, 0.15),
  );
  const soil = (1 - smoothstep(0.36, 1.02, openGround)) * (0.28 + noise * 0.36);
  const dry = (1 - smoothstep(0.66, 1.38, openGround)) * 0.48
    + smoothstep(0.68, 0.92, noise) * 0.18;
  const shade = (1 - smoothstep(0.5, 1.18, shadeDistance)) * (0.62 + noise * 0.22);
  return { soil, dry, shade };
}

function createQuadraGroundTextures(quadra: QuadraId, maxAnisotropy: number): QuadraGroundTextureBundle {
  const size = 256;
  const pixelCount = size * size;
  const colorData = new Uint8Array(pixelCount * 4);
  const roughnessData = new Uint8Array(pixelCount * 4);
  const normalData = new Uint8Array(pixelCount * 4);
  const heights = new Float32Array(pixelCount);
  const maintained = new THREE.Color(QUADRAS_AB_GROUND_MATERIALS['maintained-grass'].color);
  const dry = new THREE.Color(QUADRAS_AB_GROUND_MATERIALS['dry-grass'].color);
  const soil = new THREE.Color(QUADRAS_AB_GROUND_MATERIALS['exposed-soil'].color);
  const shaded = new THREE.Color(QUADRAS_AB_GROUND_MATERIALS['shaded-ground'].color);
  const seed = quadra === 'A' ? 41 : 83;

  for (let pixelY = 0; pixelY < size; pixelY += 1) {
    for (let pixelX = 0; pixelX < size; pixelX += 1) {
      const index = pixelY * size + pixelX;
      const offset = index * 4;
      const x = pixelX / (size - 1);
      const y = pixelY / (size - 1);
      const lowNoise = groundNoise(x, y, seed);
      const fineNoise = valueNoise(x, y, 56, seed + 7);
      const weights = groundWeights(quadra, x, y, lowNoise);
      const color = maintained.clone()
        .lerp(dry, THREE.MathUtils.clamp(weights.dry, 0, 0.82))
        .lerp(soil, THREE.MathUtils.clamp(weights.soil, 0, 0.9))
        .lerp(shaded, THREE.MathUtils.clamp(weights.shade, 0, 0.86))
        .offsetHSL((fineNoise - 0.5) * 0.006, (lowNoise - 0.5) * 0.018, (fineNoise - 0.5) * 0.045);
      // Color interpolation happens in linear space, but the byte albedo is
      // explicitly sRGB. Encode once here; normal/roughness remain linear data.
      color.convertLinearToSRGB();
      colorData[offset] = Math.round(color.r * 255);
      colorData[offset + 1] = Math.round(color.g * 255);
      colorData[offset + 2] = Math.round(color.b * 255);
      colorData[offset + 3] = 255;

      const roughness = THREE.MathUtils.clamp(
        0.88 + weights.soil * 0.08 + weights.shade * 0.035 + (fineNoise - 0.5) * 0.025,
        0.82,
        1,
      );
      roughnessData[offset] = 255;
      roughnessData[offset + 1] = Math.round(roughness * 255);
      roughnessData[offset + 2] = 255;
      roughnessData[offset + 3] = 255;
      heights[index] = lowNoise * 0.6 + fineNoise * 0.4 + weights.soil * 0.12;
    }
  }

  for (let pixelY = 0; pixelY < size; pixelY += 1) {
    for (let pixelX = 0; pixelX < size; pixelX += 1) {
      const index = pixelY * size + pixelX;
      const offset = index * 4;
      const left = heights[pixelY * size + Math.max(0, pixelX - 1)];
      const right = heights[pixelY * size + Math.min(size - 1, pixelX + 1)];
      const north = heights[Math.max(0, pixelY - 1) * size + pixelX];
      const south = heights[Math.min(size - 1, pixelY + 1) * size + pixelX];
      const normal = new THREE.Vector3((left - right) * 1.5, (north - south) * 1.5, 1).normalize();
      normalData[offset] = Math.round((normal.x * 0.5 + 0.5) * 255);
      normalData[offset + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
      normalData[offset + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
      normalData[offset + 3] = 255;
    }
  }

  const texture = (data: Uint8Array, colorSpace: THREE.ColorSpace) => {
    const result = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    result.colorSpace = colorSpace;
    result.wrapS = THREE.ClampToEdgeWrapping;
    result.wrapT = THREE.ClampToEdgeWrapping;
    result.generateMipmaps = true;
    result.minFilter = THREE.LinearMipmapLinearFilter;
    result.magFilter = THREE.LinearFilter;
    result.anisotropy = Math.min(8, maxAnisotropy);
    result.needsUpdate = true;
    return result;
  };
  const map = texture(colorData, THREE.SRGBColorSpace);
  const normalMap = texture(normalData, THREE.NoColorSpace);
  const roughnessMap = texture(roughnessData, THREE.NoColorSpace);
  map.name = `Quadra${quadra}:organic-color`;
  normalMap.name = `Quadra${quadra}:organic-normal`;
  roughnessMap.name = `Quadra${quadra}:organic-roughness`;
  return {
    map,
    normalMap,
    roughnessMap,
    dispose: () => {
      map.dispose();
      normalMap.dispose();
      roughnessMap.dispose();
    },
  };
}

function createCellGeometry(
  cells: readonly QuadrasABEnvironmentCell[],
  referencePolygon: readonly (readonly [number, number])[],
) {
  const bounds = commercialSitePolygonBounds(referencePolygon);
  const positions = new Float32Array(cells.length * 12);
  const normals = new Float32Array(cells.length * 12);
  const uvs = new Float32Array(cells.length * 8);
  const indices = new Uint32Array(cells.length * 6);
  cells.forEach((cell, cellIndex) => {
    cell.polygon.forEach(([x, z], vertexIndex) => {
      const vertex = cellIndex * 4 + vertexIndex;
      const offset = vertex * 3;
      positions[offset] = x;
      positions[offset + 1] = 0.0315 + Math.sin(x * 0.91 + z * 0.37) * 0.00045;
      positions[offset + 2] = z;
      normals[offset + 1] = 1;
      uvs[vertex * 2] = (x - bounds.minimumX) / Math.max(1e-6, bounds.maximumX - bounds.minimumX);
      uvs[vertex * 2 + 1] = (z - bounds.minimumZ) / Math.max(1e-6, bounds.maximumZ - bounds.minimumZ);
    });
    const vertex = cellIndex * 4;
    const index = cellIndex * 6;
    indices.set([vertex, vertex + 2, vertex + 1, vertex, vertex + 3, vertex + 2], index);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createGroundMaterial(quadra: QuadraId, textures: QuadraGroundTextureBundle) {
  const material = new THREE.MeshStandardMaterial({
    name: `QuadrasAB:organic-blend:${quadra}`,
    color: '#ffffff',
    map: textures.map,
    normalMap: textures.normalMap,
    normalScale: new THREE.Vector2(0.22, 0.22),
    roughnessMap: textures.roughnessMap,
    roughness: 0.96,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -0.62,
    polygonOffsetUnits: -1,
  });
  material.userData.presentationOnly = true;
  return material;
}

function DetailInstances({ anchors, reducedGraphics }: {
  anchors: readonly (readonly [number, number])[];
  reducedGraphics: boolean;
}) {
  const leafRef = useRef<THREE.InstancedMesh>(null);
  const leaves = useMemo(() => anchors.flatMap(([x, z], index) => {
    const count = reducedGraphics ? 1 : 2;
    return Array.from({ length: count }, (_, subIndex) => ({
      x: x + Math.sin(index * 1.7 + subIndex) * 0.13,
      z: z + Math.cos(index * 1.3 + subIndex) * 0.12,
      rotation: index * 0.71 + subIndex * 1.4,
      scale: 0.055 + (index % 4) * 0.01,
    }));
  }), [anchors, reducedGraphics]);

  useLayoutEffect(() => {
    const object = new THREE.Object3D();
    leaves.forEach((leaf, index) => {
      object.position.set(leaf.x, 0.035, leaf.z);
      object.rotation.set(0, leaf.rotation, 0);
      object.scale.set(leaf.scale * 1.7, 1, leaf.scale);
      object.updateMatrix();
      leafRef.current?.setMatrixAt(index, object.matrix);
    });
    if (leafRef.current) {
      leafRef.current.instanceMatrix.needsUpdate = true;
      leafRef.current.computeBoundingBox();
      leafRef.current.computeBoundingSphere();
    }
    const mesh = leafRef.current;
    return () => disposeInstancedMesh(mesh);
  }, [leaves]);

  return (
    <group name="quadras-ab-restrained-ground-detail" raycast={NO_RAYCAST}>
      {leaves.length > 0 && (
        <instancedMesh ref={leafRef} args={[UNIT_LEAF, DETAIL_MATERIAL, leaves.length]} raycast={NO_RAYCAST} receiveShadow dispose={null} />
      )}
    </group>
  );
}

export const QuadrasABEnvironmentLayer = memo(function QuadrasABEnvironmentLayer({
  entities,
  reducedGraphics,
  visible = true,
}: {
  entities: readonly MapEntity[];
  reducedGraphics: boolean;
  visible?: boolean;
}) {
  const renderer = useThree((state) => state.gl);
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const plan = useMemo(
    () => buildQuadrasABEnvironmentPlan({ entities, reducedGraphics }),
    [entities, reducedGraphics],
  );
  const textureBundles = useMemo(() => Object.freeze({
    A: createQuadraGroundTextures('A', maxAnisotropy),
    B: createQuadraGroundTextures('B', maxAnisotropy),
  }), [maxAnisotropy]);
  const batches = useMemo(() => ([
    { quadra: 'A' as const, reference: QUADRAS_AB_SPATIAL_REFERENCE.quadraA },
    { quadra: 'B' as const, reference: QUADRAS_AB_SPATIAL_REFERENCE.quadraB },
  ].flatMap(({ quadra, reference }) => {
    const cells = plan.cells.filter((cell) => cell.quadra === quadra);
    return cells.length ? [Object.freeze({
      quadra,
      geometry: createCellGeometry(cells, reference.polygon),
      material: createGroundMaterial(quadra, textureBundles[quadra]),
      cellCount: cells.length,
    })] : [];
  })), [plan.cells, textureBundles]);

  useEffect(() => () => {
    batches.forEach((batch) => {
      batch.geometry.dispose();
      batch.material.dispose();
    });
  }, [batches]);

  useEffect(() => () => {
    Object.values(textureBundles).forEach((bundle) => bundle.dispose());
  }, [textureBundles]);

  if (!visible || plan.cells.length === 0) return null;
  return (
    <group
      name="quadras-ab-environment"
      dispose={null}
      userData={{
        presentationOnly: true,
        selectable: false,
        cellCount: plan.diagnostics.cellCount,
        drawCalls: batches.length + QUADRAS_AB_SPATIAL_REFERENCE.renderBudget.detailDrawCalls,
        organicBlendTextures: batches.length,
        deterministicSignature: plan.diagnostics.deterministicSignature,
      }}
    >
      {batches.map((batch) => (
        <mesh
          key={batch.quadra}
          name={`quadras-ab-ground:quadra-${batch.quadra.toLowerCase()}`}
          geometry={batch.geometry}
          material={batch.material}
          raycast={NO_RAYCAST}
          receiveShadow
          castShadow={false}
          renderOrder={1}
          userData={{ presentationOnly: true, quadra: batch.quadra, cellCount: batch.cellCount, organicBlend: true }}
        />
      ))}
      <DetailInstances anchors={plan.detailAnchors} reducedGraphics={reducedGraphics} />
    </group>
  );
});
