import { memo, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { MapEntity } from '../../types';
import {
  createVisitorFenceParts,
  createVisitorFenceRuns,
  createVisitorGateParts,
  type GrillePart,
  type VisitorGateId,
  type VisitorGateProfile,
} from '../../utils/visitorGateArchitecture';

const NO_RAYCAST = () => undefined;

/** One unit geometry and at most three instanced submissions per assembly. */
export function buildGrilleBatches(parts: readonly GrillePart[]) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const batches: THREE.InstancedMesh[] = [];
  const matrix = new THREE.Matrix4(),
    quaternion = new THREE.Quaternion(),
    scale = new THREE.Vector3(),
    position = new THREE.Vector3();
  for (const kind of ['steel', 'hardware', 'concrete'] as const) {
    const instances = parts.filter((p) => p.material === kind);
    if (!instances.length) continue;
    const material = new THREE.MeshStandardMaterial({
      color: kind === 'steel' ? '#34483f' : kind === 'hardware' ? '#969f99' : '#b5b1a2',
      roughness: kind === 'steel' ? 0.66 : kind === 'hardware' ? 0.42 : 0.94,
      metalness: kind === 'concrete' ? 0 : 0.38,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
    mesh.name = `visitor-grille-${kind}`;
    mesh.raycast = NO_RAYCAST;
    mesh.receiveShadow = true;
    // Small pickets do not need an additional shadow-map submission.
    mesh.castShadow = false;
    instances.forEach((part, index) => {
      position.set(...part.position);
      scale.set(...part.size);
      quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, part.yaw || 0);
      mesh.setMatrixAt(index, matrix.compose(position, quaternion, scale));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    batches.push(mesh);
  }
  return {
    batches,
    dispose() {
      batches.forEach((mesh) => {
        mesh.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      geometry.dispose();
    },
  };
}
const GrilleAssembly = memo(function GrilleAssembly({ parts }: { parts: readonly GrillePart[] }) {
  const resources = useMemo(() => buildGrilleBatches(parts), [parts]);
  useEffect(() => () => resources.dispose(), [resources]);
  return (
    <group dispose={null}>
      {resources.batches.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </group>
  );
});

export const VisitorGateGrille = memo(function VisitorGateGrille({
  identifier,
  reducedGraphics,
  profile,
}: {
  profile: VisitorGateProfile;
  identifier: VisitorGateId;
  reducedGraphics: boolean;
}) {
  const parts = useMemo(
    () => createVisitorGateParts(identifier, reducedGraphics, profile),
    [identifier, reducedGraphics, profile],
  );
  const badge = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1e392e';
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#d0b66b';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, 500, 244);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eee8d8';
    ctx.font = '600 48px sans-serif';
    ctx.fillText('PORTÃO', 256, 85);
    ctx.font = '700 120px sans-serif';
    ctx.fillText(identifier.slice(1), 256, 211);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, side: THREE.DoubleSide });
    const geometry = new THREE.PlaneGeometry(0.24, 0.12);
    return { texture, material, geometry };
  }, [identifier]);
  useEffect(
    () => () => {
      badge.texture.dispose();
      badge.material.dispose();
      badge.geometry.dispose();
    },
    [badge],
  );
  return (
    <group name={`visitor-gate-${identifier}`}>
      <GrilleAssembly parts={parts} />
      <mesh
        geometry={badge.geometry}
        material={badge.material}
        position={[profile.left - 0.065, 0.47, -0.04]}
        rotation={[0, Math.PI, 0]}
        raycast={NO_RAYCAST}
        dispose={null}
      />
    </group>
  );
});

export const VisitorGateFences = memo(function VisitorGateFences({
  entities,
  reducedGraphics,
  visible = true,
}: {
  entities: readonly MapEntity[];
  reducedGraphics: boolean;
  visible?: boolean;
}) {
  const parts = useMemo(
    () => createVisitorFenceParts(createVisitorFenceRuns(entities), reducedGraphics),
    [entities, reducedGraphics],
  );
  return (
    <group name="visitor-gate-connected-fences" visible={visible}>
      <GrilleAssembly parts={parts} />
    </group>
  );
});
