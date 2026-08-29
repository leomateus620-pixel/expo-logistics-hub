import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CommercialMapTree, CommercialTreeSpeciesGroup } from '../../data/commercialTrees';
import type { MapEntity } from '../../types';
import {
  COMMERCIAL_TREE_BRANCHES,
  COMMERCIAL_TREE_CANOPY_LOBES,
  COMMERCIAL_TREE_REDUCED_CANOPY_LOBES,
  commercialTreeGroundElevation,
  commercialTreeShadowElevationAtPosition,
} from '../../utils/treeLayer';

const NO_RAYCAST = () => undefined;
const SHADOW_OPACITY = 0.105;
const CONTACT_PATCH_OPACITY = 0.38;
const UNIT_Y = new THREE.Vector3(0, 1, 0);

// Renderer-free QA imports these pure presentation contracts without mounting WebGL.
// eslint-disable-next-line react-refresh/only-export-components
export const COMMERCIAL_TREE_PRESENTATION_DRAW_CALLS = {
  fullGraphics: 5,
  reducedGraphics: 4,
  fullGraphicsShadowPass: 3,
  reducedGraphicsShadowPass: 0,
} as const;

// eslint-disable-next-line react-refresh/only-export-components
export const COMMERCIAL_TREE_FOLIAGE_PALETTES: Readonly<Record<CommercialTreeSpeciesGroup, readonly [string, string, string, string]>> = {
  MATURE_BROADLEAF: ['#81a878', '#8db585', '#9ac292', '#a7cd9f'],
  OPEN_CANOPY: ['#86ad7d', '#93b98a', '#a0c697', '#aed2a4'],
  ORNAMENTAL_COMPACT: ['#7ea474', '#8ab081', '#97bc8e', '#a4c99b'],
  FLOWERING_ORNAMENTAL: ['#839b78', '#aa7284', '#bd7f91', '#cc8e9e'],
};

const TRUNK_PALETTES: Record<CommercialTreeSpeciesGroup, readonly [string, string]> = {
  MATURE_BROADLEAF: ['#75553b', '#886646'],
  OPEN_CANOPY: ['#7c5c40', '#916c4b'],
  ORNAMENTAL_COMPACT: ['#705138', '#835f42'],
  FLOWERING_ORNAMENTAL: ['#6d4e37', '#805d40'],
};

const CONTACT_PATCH_PALETTE = ['#586345', '#62684a', '#6b6648', '#70634a'] as const;

/** Deterministic 0..1 jitter so every tree keeps a stable, unique silhouette. */
function lobeNoise(seed: number, salt: number) {
  const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/** Stable visual seed: source IDs/positions stay canonical while presentation varies per tree. */
// eslint-disable-next-line react-refresh/only-export-components
export function commercialTreePresentationSeed(
  tree: Pick<CommercialMapTree, 'id' | 'position' | 'visualVariant'>,
) {
  const identity = `${tree.id}|${tree.position[0].toFixed(4)}|${tree.position[1].toFixed(4)}|${tree.visualVariant}`;
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

// eslint-disable-next-line react-refresh/only-export-components
export function commercialTreePresentationProfile(
  tree: Pick<CommercialMapTree, 'id' | 'position' | 'visualVariant' | 'canopyRadius' | 'placement'>,
) {
  const seed = commercialTreePresentationSeed(tree);
  const noiseSeed = seed * 997 + tree.visualVariant * 13.7 + 1;
  const contactPatchVisible = tree.placement !== 'STREET_EDGE'
    && tree.placement !== 'SIDEWALK_EDGE'
    && tree.placement !== 'PARKING_EDGE';
  return {
    seed,
    rotation: lobeNoise(noiseSeed, 2.1) * Math.PI * 2,
    trunkScaleX: 0.9 + lobeNoise(noiseSeed, 3.7) * 0.2,
    trunkScaleZ: 0.9 + lobeNoise(noiseSeed, 4.9) * 0.2,
    crownScaleX: 0.9 + lobeNoise(noiseSeed, 6.3) * 0.22,
    crownScaleZ: 0.9 + lobeNoise(noiseSeed, 7.7) * 0.22,
    crownLift: (lobeNoise(noiseSeed, 9.1) - 0.5) * tree.canopyRadius * 0.08,
    contactPatchVisible,
    contactScaleX: contactPatchVisible
      ? tree.canopyRadius * (0.34 + lobeNoise(noiseSeed, 10.7) * 0.13)
      : 0,
    contactScaleZ: contactPatchVisible
      ? tree.canopyRadius * (0.27 + lobeNoise(noiseSeed, 12.3) * 0.11)
      : 0,
    contactRotation: lobeNoise(noiseSeed, 14.1) * Math.PI * 2,
    contactColor: CONTACT_PATCH_PALETTE[
      Math.floor(lobeNoise(noiseSeed, 15.9) * CONTACT_PATCH_PALETTE.length)
        % CONTACT_PATCH_PALETTE.length
    ],
  } as const;
}

function createCrownGeometry(reducedGraphics: boolean) {
  const geometry = new THREE.IcosahedronGeometry(1, reducedGraphics ? 0 : 1);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  const vector = new THREE.Vector3();
  for (let index = 0; index < positions.count; index += 1) {
    vector.fromBufferAttribute(positions, index);
    // Stronger, multi-frequency perturbation breaks the "solid ball" reading
    // and gives each lobe a leafy, irregular contour.
    const irregularity = 1
      + Math.sin(vector.x * 6.7 + vector.y * 4.1) * 0.115
      + Math.cos(vector.z * 7.9 - vector.y * 3.2) * 0.095
      + Math.sin(vector.x * 13.4 + vector.z * 11.7) * 0.055;
    const verticalTaper = 0.86 + Math.max(0, vector.y) * 0.12;
    positions.setXYZ(
      index,
      vector.x * irregularity,
      vector.y * irregularity * verticalTaper,
      vector.z * (1 + (irregularity - 1) * 0.86),
    );
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createSoftShadowTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const normalizedX = ((x + 0.5) / size) * 2 - 1;
      const normalizedY = ((y + 0.5) / size) * 2 - 1;
      const angle = Math.atan2(normalizedY, normalizedX);
      const edgeVariation = 1
        + Math.sin(angle * 3 + 0.7) * 0.09
        + Math.cos(angle * 5 - 0.35) * 0.055
        + Math.sin(normalizedX * 11.3 + normalizedY * 8.7) * 0.025;
      const stretchedDistance = Math.hypot(normalizedX * 0.94, normalizedY * 1.08) / edgeVariation;
      const mottling = 0.9
        + Math.sin(normalizedX * 17.1 + normalizedY * 9.3) * 0.045
        + Math.cos(normalizedY * 15.7 - normalizedX * 6.1) * 0.035;
      const alpha = stretchedDistance >= 1
        ? 0
        : Math.pow(1 - stretchedDistance, 1.72) * mottling;
      const offset = (y * size + x) * 4;
      data[offset] = 30;
      data[offset + 1] = 42;
      data[offset + 2] = 31;
      data[offset + 3] = Math.round(THREE.MathUtils.clamp(alpha, 0, 1) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'sombra-suave-arvores-comerciais';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createIrregularContactPatchGeometry() {
  const geometry = new THREE.CircleGeometry(1, 12);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let index = 1; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const angle = Math.atan2(y, x);
    const radius = 0.86
      + Math.sin(angle * 3 + 0.4) * 0.08
      + Math.cos(angle * 5 - 0.9) * 0.055
      + Math.sin(angle * 7 + 1.2) * 0.025;
    positions.setXY(index, x * radius, y * radius);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createTreeMaterials(shadowTexture: THREE.Texture) {
  return {
    trunk: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.96,
      metalness: 0,
      vertexColors: true,
      transparent: true,
      emissive: '#261b13',
      emissiveIntensity: 0.08,
    }),
    crown: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.94,
      metalness: 0,
      vertexColors: true,
      transparent: true,
      // A small green bounce keeps shaded crowns readable without flattening
      // the directional-light response or making the foliage self-lit.
      emissive: '#416946',
      emissiveIntensity: 0.3,
    }),
    contactPatch: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 1,
      metalness: 0,
      vertexColors: true,
      transparent: true,
      opacity: CONTACT_PATCH_OPACITY,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -0.7,
      polygonOffsetUnits: -0.7,
    }),
    shadow: new THREE.MeshBasicMaterial({
      color: '#ffffff',
      map: shadowTexture,
      transparent: true,
      opacity: SHADOW_OPACITY,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.NormalBlending,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  };
}

/**
 * Smaller, flattened lobes distributed over two tiers with deterministic
 * jitter. The canopy reads as foliage instead of one opaque green mass, and it
 * hides less of the lots and labels underneath.
 */
function crownLobeTransform(tree: CommercialMapTree, lobeIndex: number, lobeCount: number) {
  const profile = commercialTreePresentationProfile(tree);
  const seed = profile.seed * 997 + tree.visualVariant * 13.7 + 1;
  const isCentral = lobeIndex === 0;
  const ringIndex = Math.max(0, lobeIndex - 1);
  const ringCount = Math.max(1, lobeCount - 1);
  const upperTier = !isCentral && ringIndex % 2 === 1;
  const angleJitter = (lobeNoise(seed, lobeIndex * 3.1) - 0.5) * 0.72;
  const ringPhase = seed * 0.44 + (ringIndex / ringCount) * Math.PI * 2 + angleJitter;
  const radialJitter = 0.82 + lobeNoise(seed, lobeIndex * 5.7) * 0.46;
  const radius = isCentral
    ? tree.canopyRadius * 0.06
    : tree.canopyRadius * (upperTier ? 0.26 : 0.42) * radialJitter;
  const widthVariation = 0.82 + lobeNoise(seed, lobeIndex * 7.3) * 0.34;
  const depthVariation = 0.8 + lobeNoise(seed, lobeIndex * 9.1) * 0.36;
  const verticalVariation = 0.78 + lobeNoise(seed, lobeIndex * 11.5) * 0.32;
  const tierHeight = isCentral
    ? 0.16
    : upperTier
      ? 0.24 + lobeNoise(seed, lobeIndex * 2.3) * 0.1
      : -0.06 + lobeNoise(seed, lobeIndex * 4.9) * 0.09;
  const lobeSpread = isCentral ? 0.62 : upperTier ? 0.42 : 0.5;
  const lobeHeight = isCentral ? 0.42 : upperTier ? 0.3 : 0.32;
  return {
    offsetX: Math.cos(ringPhase) * radius,
    offsetY: tree.crownHeight * tierHeight,
    offsetZ: Math.sin(ringPhase) * radius,
    rotation: profile.rotation + seed * 0.83 + lobeIndex * 2.14,
    scaleX: tree.canopyRadius * lobeSpread * widthVariation * profile.crownScaleX,
    scaleY: tree.crownHeight * lobeHeight * verticalVariation,
    scaleZ: tree.canopyRadius * lobeSpread * 0.96 * depthVariation * profile.crownScaleZ,
    lift: profile.crownLift,
  };
}

function refreshInstanceBounds(mesh: THREE.InstancedMesh | null) {
  if (!mesh) return;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
}

function CommercialTreeInstances({
  trees,
  surfaceEntities,
  visible,
  reducedGraphics,
}: {
  trees: readonly CommercialMapTree[];
  surfaceEntities: readonly MapEntity[];
  visible: boolean;
  reducedGraphics: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const branchRef = useRef<THREE.InstancedMesh>(null);
  const crownRef = useRef<THREE.InstancedMesh>(null);
  const shadowRef = useRef<THREE.InstancedMesh>(null);
  const contactPatchRef = useRef<THREE.InstancedMesh>(null);
  const visibilityProgress = useRef(visible ? 1 : 0);
  const transitionPending = useRef(true);
  const { gl, invalidate } = useThree();
  const lobeCount = reducedGraphics ? COMMERCIAL_TREE_REDUCED_CANOPY_LOBES : COMMERCIAL_TREE_CANOPY_LOBES;
  const geometries = useMemo(() => ({
    trunk: new THREE.CylinderGeometry(0.62, 1, 1, reducedGraphics ? 6 : 8, 2),
    branch: new THREE.CylinderGeometry(0.42, 0.74, 1, 6, 1),
    crown: createCrownGeometry(reducedGraphics),
    shadow: new THREE.PlaneGeometry(2, 2, 1, 1),
    contactPatch: createIrregularContactPatchGeometry(),
  }), [reducedGraphics]);
  const shadowTexture = useMemo(createSoftShadowTexture, []);
  const materials = useMemo(() => createTreeMaterials(shadowTexture), [shadowTexture]);

  useLayoutEffect(() => {
    const trunkMesh = trunkRef.current;
    const branchMesh = branchRef.current;
    const crownMesh = crownRef.current;
    const shadowMesh = shadowRef.current;
    const contactPatchMesh = contactPatchRef.current;
    if (
      !trunkMesh
      || !branchMesh
      || !crownMesh
      || !shadowMesh
      || (!reducedGraphics && !contactPatchMesh)
    ) return;

    const transform = new THREE.Object3D();
    const direction = new THREE.Vector3();
    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    const midpoint = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const trunkColor = new THREE.Color();
    const crownColor = new THREE.Color();
    const contactPatchColor = new THREE.Color();

    trees.forEach((tree, treeIndex) => {
      const [x, z] = tree.position;
      const groundY = commercialTreeGroundElevation(tree, surfaceEntities);
      const trunkPalette = TRUNK_PALETTES[tree.speciesGroup];
      const foliagePalette = COMMERCIAL_TREE_FOLIAGE_PALETTES[tree.speciesGroup];
      const profile = commercialTreePresentationProfile(tree);

      transform.position.set(x, groundY + tree.trunkHeight / 2, z);
      transform.rotation.set(0, profile.rotation, 0);
      transform.scale.set(
        tree.trunkRadius * profile.trunkScaleX,
        tree.trunkHeight,
        tree.trunkRadius * profile.trunkScaleZ,
      );
      transform.updateMatrix();
      trunkMesh.setMatrixAt(treeIndex, transform.matrix);
      trunkColor.set(trunkPalette[tree.visualVariant % trunkPalette.length]);
      trunkMesh.setColorAt(treeIndex, trunkColor);

      for (let branchIndex = 0; branchIndex < COMMERCIAL_TREE_BRANCHES; branchIndex += 1) {
        const instanceIndex = treeIndex * COMMERCIAL_TREE_BRANCHES + branchIndex;
        const angle = profile.rotation + tree.visualVariant * 0.71 + branchIndex * Math.PI * 0.93;
        const branchLength = tree.crownHeight * (0.34 + branchIndex * 0.045);
        start.set(x, groundY + tree.trunkHeight * (0.58 + branchIndex * 0.08), z);
        end.set(
          x + Math.cos(angle) * tree.canopyRadius * 0.3,
          start.y + branchLength,
          z + Math.sin(angle) * tree.canopyRadius * 0.3,
        );
        direction.subVectors(end, start);
        midpoint.addVectors(start, end).multiplyScalar(0.5);
        quaternion.setFromUnitVectors(UNIT_Y, direction.clone().normalize());
        transform.position.copy(midpoint);
        transform.quaternion.copy(quaternion);
        transform.scale.set(tree.trunkRadius * 0.52, direction.length(), tree.trunkRadius * 0.52);
        transform.updateMatrix();
        branchMesh.setMatrixAt(instanceIndex, transform.matrix);
        branchMesh.setColorAt(instanceIndex, trunkColor);
      }

      const crownBaseY = groundY + tree.trunkHeight + tree.crownHeight * 0.32;
      for (let lobeIndex = 0; lobeIndex < lobeCount; lobeIndex += 1) {
        const instanceIndex = treeIndex * lobeCount + lobeIndex;
        const lobe = crownLobeTransform(tree, lobeIndex, lobeCount);
        transform.position.set(
          x + lobe.offsetX,
          crownBaseY + lobe.offsetY + lobe.lift,
          z + lobe.offsetZ,
        );
        transform.rotation.set(lobe.rotation * 0.08, lobe.rotation, -lobe.rotation * 0.045);
        transform.scale.set(lobe.scaleX, lobe.scaleY, lobe.scaleZ);
        transform.updateMatrix();
        crownMesh.setMatrixAt(instanceIndex, transform.matrix);
        const foliageIndex = (
          tree.visualVariant
          + lobeIndex
          + Math.floor(lobeNoise(profile.seed * 997 + 1, lobeIndex * 1.73) * foliagePalette.length)
        ) % foliagePalette.length;
        crownColor.set(foliagePalette[foliageIndex]);
        crownColor.offsetHSL(
          (lobeNoise(profile.seed * 997 + 3, lobeIndex * 2.31) - 0.5) * 0.015,
          (lobeNoise(profile.seed * 997 + 5, lobeIndex * 2.79) - 0.5) * 0.045,
          (lobeNoise(profile.seed * 997 + 7, lobeIndex * 3.17) - 0.5) * 0.055,
        );
        crownMesh.setColorAt(instanceIndex, crownColor);
      }

      if (contactPatchMesh) {
        transform.position.set(x, groundY - 0.001, z);
        transform.rotation.set(-Math.PI / 2, 0, profile.contactRotation);
        transform.scale.set(profile.contactScaleX, profile.contactScaleZ, 1);
        transform.updateMatrix();
        contactPatchMesh.setMatrixAt(treeIndex, transform.matrix);
        contactPatchColor.set(profile.contactColor);
        contactPatchMesh.setColorAt(treeIndex, contactPatchColor);
      }

      const shadowOffset = tree.canopyRadius * 0.55;
      const shadowPosition = [
        x + tree.shadowDirection[0] * shadowOffset,
        z + tree.shadowDirection[1] * shadowOffset,
      ] as const;
      const shadowGroundY = commercialTreeShadowElevationAtPosition(
        tree,
        shadowPosition,
        surfaceEntities,
      );
      transform.position.set(
        shadowPosition[0],
        shadowGroundY,
        shadowPosition[1],
      );
      transform.rotation.set(-Math.PI / 2, 0, tree.shadowRotation);
      transform.scale.set(tree.shadowSize[0], tree.shadowSize[1], 1);
      transform.updateMatrix();
      shadowMesh.setMatrixAt(treeIndex, transform.matrix);
    });

    [trunkMesh, branchMesh, crownMesh, shadowMesh, contactPatchMesh].forEach(refreshInstanceBounds);
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, lobeCount, reducedGraphics, surfaceEntities, trees]);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (visible && group) group.visible = true;
    if (group) group.scale.setScalar(1);
    [trunkRef.current, branchRef.current, crownRef.current].forEach((mesh) => {
      if (mesh) mesh.castShadow = false;
    });
    transitionPending.current = true;
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, visible]);

  useEffect(() => () => {
    Object.values(geometries).forEach((geometry) => geometry.dispose());
  }, [geometries]);

  useEffect(() => () => {
    Object.values(materials).forEach((material) => material.dispose());
    shadowTexture.dispose();
  }, [materials, shadowTexture]);

  useFrame((_state, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const target = visible ? 1 : 0;
    const previous = visibilityProgress.current;
    const next = THREE.MathUtils.damp(previous, target, visible ? 9 : 12, delta);
    const settled = Math.abs(next - target) < 0.002;
    visibilityProgress.current = settled ? target : next;
    const progress = visibilityProgress.current;
    group.position.y = (1 - progress) * -0.16;
    materials.trunk.opacity = progress;
    materials.crown.opacity = progress * 0.95;
    materials.shadow.opacity = SHADOW_OPACITY * progress;
    materials.contactPatch.opacity = CONTACT_PATCH_OPACITY * progress;
    if (settled) {
      group.visible = visible;
      if (transitionPending.current) {
        const castShadow = visible && !reducedGraphics;
        [trunkRef.current, branchRef.current, crownRef.current].forEach((mesh) => {
          if (mesh) mesh.castShadow = castShadow;
        });
        transitionPending.current = false;
        gl.shadowMap.needsUpdate = true;
      }
      return;
    }
    invalidate();
  });

  const castsInitialShadow = visible && !reducedGraphics && visibilityProgress.current >= 0.998;

  return (
    <group ref={groupRef} name="camada-arvores-comerciais" visible={visible || visibilityProgress.current > 0.002}>
      <instancedMesh
        ref={shadowRef}
        name="sombras-arvores-comerciais"
        args={[geometries.shadow, materials.shadow, trees.length]}
        count={trees.length}
        frustumCulled
        renderOrder={3}
        raycast={NO_RAYCAST}
      />
      {!reducedGraphics && (
        <instancedMesh
          ref={contactPatchRef}
          name="contato-solo-arvores-comerciais"
          args={[geometries.contactPatch, materials.contactPatch, trees.length]}
          count={trees.length}
          frustumCulled
          renderOrder={2}
          raycast={NO_RAYCAST}
        />
      )}
      <instancedMesh
        ref={trunkRef}
        name="troncos-arvores-comerciais"
        args={[geometries.trunk, materials.trunk, trees.length]}
        count={trees.length}
        castShadow={castsInitialShadow}
        frustumCulled
        raycast={NO_RAYCAST}
      />
      <instancedMesh
        ref={branchRef}
        name="galhos-arvores-comerciais"
        args={[geometries.branch, materials.trunk, trees.length * COMMERCIAL_TREE_BRANCHES]}
        count={trees.length * COMMERCIAL_TREE_BRANCHES}
        castShadow={castsInitialShadow}
        frustumCulled
        raycast={NO_RAYCAST}
      />
      <instancedMesh
        ref={crownRef}
        name="copas-arvores-comerciais"
        args={[geometries.crown, materials.crown, trees.length * lobeCount]}
        count={trees.length * lobeCount}
        castShadow={castsInitialShadow}
        frustumCulled
        raycast={NO_RAYCAST}
      />
    </group>
  );
}

export const CommercialTreeLayer = memo(function CommercialTreeLayer(props: {
  trees: readonly CommercialMapTree[];
  surfaceEntities: readonly MapEntity[];
  visible: boolean;
  reducedGraphics: boolean;
}) {
  if (props.trees.length === 0) return null;
  return <CommercialTreeInstances {...props} />;
});
