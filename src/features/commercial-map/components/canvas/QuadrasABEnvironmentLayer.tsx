import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { MapEntity } from '../../types';
import {
  QUADRAS_AB_SPATIAL_REFERENCE,
} from '../../data/quadrasABEnvironment';
import {
  buildQuadrasABEnvironmentPlan,
  type QuadrasABEnvironmentCell,
} from '../../utils/quadrasABEnvironment';
import { commercialSitePolygonBounds } from '../../utils/commercialSiteEnvironment';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';
import { useInteriorGroundMaterial } from './interiorGroundMaterial';

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
  const groundMaterial = useInteriorGroundMaterial(1, -0.62, -1);
  const plan = useMemo(
    () => buildQuadrasABEnvironmentPlan({ entities, reducedGraphics }),
    [entities, reducedGraphics],
  );
  const batches = useMemo(() => ([
    { quadra: 'A' as const, reference: QUADRAS_AB_SPATIAL_REFERENCE.quadraA },
    { quadra: 'B' as const, reference: QUADRAS_AB_SPATIAL_REFERENCE.quadraB },
  ].flatMap(({ quadra, reference }) => {
    const cells = plan.cells.filter((cell) => cell.quadra === quadra);
    return cells.length ? [Object.freeze({
      quadra,
      geometry: createCellGeometry(cells, reference.polygon),
      material: groundMaterial,
      cellCount: cells.length,
    })] : [];
  })), [plan.cells, groundMaterial]);

  useEffect(() => () => {
    batches.forEach((batch) => {
      batch.geometry.dispose();
    });
  }, [batches]);

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
        organicBlendTextures: 1,
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
