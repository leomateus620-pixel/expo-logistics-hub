import { memo, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { MapEntity } from '../../types';
import {
  COMMERCIAL_SITE_ENVIRONMENT_MATERIALS,
  type CommercialSiteEnvironmentMaterialId,
} from '../../data/commercialSiteEnvironment';
import {
  buildCommercialSiteEnvironmentPlan,
  selectCommercialSiteEnvironmentCells,
  type CommercialSiteEnvironmentCell,
} from '../../utils/commercialSiteEnvironment';
import {
  openGroundTextureBundleForEntity,
  type OpenGroundSurfaceProfile,
  type OpenGroundTextureBundle,
} from './openGroundTextures';

const NO_RAYCAST = () => undefined;

interface CommercialSiteEnvironmentLayerProps {
  entities: readonly MapEntity[];
  reducedGraphics: boolean;
  activeOwnerIdentifiers?: ReadonlySet<string> | null;
  visible?: boolean;
  opacity?: number;
}

interface CommercialSiteEnvironmentBatch {
  materialId: CommercialSiteEnvironmentMaterialId;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  cellCount: number;
}

const SITE_MATERIAL_PROFILES: Readonly<Record<CommercialSiteEnvironmentMaterialId, OpenGroundSurfaceProfile>> = Object.freeze({
  'foundation-contact': Object.freeze({ surface: 'compactedSoil', tileWorldSize: 4.5, baseColor: '#6f705a', roughness: 1 }),
  'concrete-apron': Object.freeze({ surface: 'concrete', tileWorldSize: 5.5, baseColor: '#aaa99d', roughness: 0.94 }),
  'compacted-ground': Object.freeze({ surface: 'compactedGravel', tileWorldSize: 5, baseColor: '#9a8d6f', roughness: 0.99 }),
  'grass-dry-mix': Object.freeze({ surface: 'parkingGrassDryMix', tileWorldSize: 7.5, baseColor: '#718458', roughness: 1 }),
});
const SITE_NORMAL_SCALE = new THREE.Vector2(0.18, 0.18);

function variedColor(materialId: CommercialSiteEnvironmentMaterialId, variation: number) {
  const definition = COMMERCIAL_SITE_ENVIRONMENT_MATERIALS[materialId];
  const color = new THREE.Color(definition.color);
  color.offsetHSL(
    variation * 0.008,
    variation * definition.colorVariation * 0.22,
    variation * definition.colorVariation,
  );
  return color;
}

function createCellBatchGeometry(cells: readonly CommercialSiteEnvironmentCell[]) {
  const positions = new Float32Array(cells.length * 4 * 3);
  const normals = new Float32Array(cells.length * 4 * 3);
  const colors = new Float32Array(cells.length * 4 * 3);
  const uvs = new Float32Array(cells.length * 4 * 2);
  const indices = new Uint32Array(cells.length * 6);
  cells.forEach((cell, cellIndex) => {
    const color = variedColor(cell.materialId, cell.colorVariation);
    cell.polygon.forEach(([x, z], vertexIndex) => {
      const offset = (cellIndex * 4 + vertexIndex) * 3;
      positions[offset] = x;
      positions[offset + 1] = cell.elevation;
      positions[offset + 2] = z;
      normals[offset] = 0;
      normals[offset + 1] = 1;
      normals[offset + 2] = 0;
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
      const uvOffset = (cellIndex * 4 + vertexIndex) * 2;
      // UVs in world units keep all treatments on one physical texture scale.
      uvs[uvOffset] = x;
      uvs[uvOffset + 1] = z;
    });
    const vertexOffset = cellIndex * 4;
    const indexOffset = cellIndex * 6;
    // Counter-clockwise from +Y: the treatment is visible from the map camera.
    indices[indexOffset] = vertexOffset;
    indices[indexOffset + 1] = vertexOffset + 2;
    indices[indexOffset + 2] = vertexOffset + 1;
    indices[indexOffset + 3] = vertexOffset;
    indices[indexOffset + 4] = vertexOffset + 3;
    indices[indexOffset + 5] = vertexOffset + 2;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.cellCount = cells.length;
  return geometry;
}

function createMaterial(
  materialId: CommercialSiteEnvironmentMaterialId,
  opacity: number,
  textures: OpenGroundTextureBundle | null,
) {
  const definition = COMMERCIAL_SITE_ENVIRONMENT_MATERIALS[materialId];
  const material = new THREE.MeshStandardMaterial({
    name: `CommercialSiteEnvironment:${materialId}`,
    color: '#ffffff',
    vertexColors: true,
    map: textures?.map ?? null,
    normalMap: textures?.normalMap ?? null,
    normalScale: textures ? SITE_NORMAL_SCALE : undefined,
    roughnessMap: textures?.roughnessMap ?? null,
    roughness: definition.roughness,
    metalness: 0,
    opacity,
    transparent: opacity < 0.999,
    depthWrite: opacity >= 0.999,
    polygonOffset: true,
    polygonOffsetFactor: definition.polygonOffsetFactor,
    polygonOffsetUnits: -1,
  });
  material.userData.presentationOnly = true;
  return material;
}

export const CommercialSiteEnvironmentLayer = memo(function CommercialSiteEnvironmentLayer({
  entities,
  reducedGraphics,
  activeOwnerIdentifiers,
  visible = true,
  opacity = 1,
}: CommercialSiteEnvironmentLayerProps) {
  const renderer = useThree((state) => state.gl);
  const maximumAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const plan = useMemo(() => buildCommercialSiteEnvironmentPlan({ entities, reducedGraphics }), [entities, reducedGraphics]);
  const activeCells = useMemo(
    () => selectCommercialSiteEnvironmentCells(plan, activeOwnerIdentifiers),
    [activeOwnerIdentifiers, plan],
  );
  const activeCellsByMaterial = useMemo(() => Object.freeze(Object.fromEntries<readonly CommercialSiteEnvironmentCell[]>(
    (Object.keys(SITE_MATERIAL_PROFILES) as CommercialSiteEnvironmentMaterialId[]).map((materialId) => [
      materialId,
      activeCells.filter((cell) => cell.materialId === materialId),
    ]),
  )) as Readonly<Record<CommercialSiteEnvironmentMaterialId, readonly CommercialSiteEnvironmentCell[]>>, [activeCells]);
  const textureBundles = useMemo(() => Object.freeze(Object.fromEntries(
    (Object.keys(SITE_MATERIAL_PROFILES) as CommercialSiteEnvironmentMaterialId[]).map((materialId) => [
      materialId,
      openGroundTextureBundleForEntity(SITE_MATERIAL_PROFILES[materialId], maximumAnisotropy),
    ]),
  )) as Readonly<Record<CommercialSiteEnvironmentMaterialId, OpenGroundTextureBundle | null>>, [maximumAnisotropy]);
  const batches = useMemo(() => (
    (Object.entries(activeCellsByMaterial) as [CommercialSiteEnvironmentMaterialId, readonly CommercialSiteEnvironmentCell[]][])
      .flatMap(([materialId, cells]) => {
        if (cells.length === 0) return [];
        return [{
          materialId,
          geometry: createCellBatchGeometry(cells),
          material: createMaterial(
            materialId,
            Math.max(0, Math.min(1, opacity)),
            textureBundles[materialId],
          ),
          cellCount: cells.length,
        } satisfies CommercialSiteEnvironmentBatch];
      })
  ), [activeCellsByMaterial, opacity, textureBundles]);

  useEffect(() => () => {
    batches.forEach((batch) => {
      batch.geometry.dispose();
      batch.material.dispose();
    });
  }, [batches]);

  useEffect(() => () => {
    Object.values(textureBundles).forEach((bundle) => bundle?.dispose());
  }, [textureBundles]);

  if (!visible || opacity <= 0.001 || activeCells.length === 0) return null;
  const activeTreatmentCount = new Set(activeCells.map((cell) => cell.treatmentId)).size;
  return (
    <group
      name="commercial-site-environment"
      dispose={null}
      userData={{
        presentationOnly: true,
        treatmentCount: activeTreatmentCount,
        cellCount: activeCells.length,
        drawCalls: batches.length,
        deterministicSignature: plan.diagnostics.deterministicSignature,
      }}
    >
      {batches.map((batch) => (
        <mesh
          key={batch.materialId}
          name={`commercial-site-environment:${batch.materialId}`}
          geometry={batch.geometry}
          material={batch.material}
          raycast={NO_RAYCAST}
          receiveShadow
          castShadow={false}
          renderOrder={1}
          userData={{ presentationOnly: true, materialId: batch.materialId, cellCount: batch.cellCount }}
        />
      ))}
    </group>
  );
});
