import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  REAR_CONTEXT_BLOCKS,
  REAR_TERRAIN_PATCHES,
  buildRearPoleInstances,
  buildRearTreeInstances,
  sourceBoundsToLocal,
} from '../../data/rearParkEnvironment';
import { getOpenGroundTexture } from './openGroundTextures';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';

interface RearParkEnvironmentLayerProps {
  reducedGraphics: boolean;
  visible?: boolean;
  vegetationVisible?: boolean;
}

const NO_RAYCAST = () => undefined;

function reliefAt(x: number, z: number, amplitude: number) {
  return (
    Math.sin(x * 0.21 + z * 0.13) * 0.55
    + Math.sin(x * 0.07 - z * 0.31) * 0.45
  ) * amplitude;
}

/**
 * Terreno ampliado até além da BR-472, vegetação instanciada, iluminação viária
 * e contexto externo simplificado. Nenhuma geometria oficial é lida ou alterada.
 */
export const RearParkEnvironmentLayer = memo(function RearParkEnvironmentLayer({
  reducedGraphics,
  visible = true,
  vegetationVisible = true,
}: RearParkEnvironmentLayerProps) {
  const canopyRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const poleRef = useRef<THREE.InstancedMesh>(null);

  const terrain = useMemo(() => REAR_TERRAIN_PATCHES.map((patch) => {
    const bounds = sourceBoundsToLocal(patch.sourceBounds);
    const segments = Math.max(6, Math.round(patch.segments * (reducedGraphics ? 0.4 : 1)));
    const geometry = new THREE.PlaneGeometry(
      bounds.width,
      bounds.depth,
      segments,
      Math.max(4, Math.round(segments * (bounds.depth / Math.max(bounds.width, 0.001)))),
    );
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index) + bounds.centerX;
      const z = position.getZ(index) + bounds.centerZ;
      position.setY(index, patch.baseElevation + reliefAt(x, z, patch.relief));
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return { patch, bounds, geometry };
  }), [reducedGraphics]);

  useEffect(() => () => terrain.forEach((entry) => entry.geometry.dispose()), [terrain]);

  const grassTexture = useMemo(() => {
    const shared = getOpenGroundTexture('grass');
    if (!shared) return null;
    const texture = shared.clone();
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(9, 9);
    texture.needsUpdate = true;
    return texture;
  }, []);

  useEffect(() => () => grassTexture?.dispose(), [grassTexture]);

  const trees = useMemo(
    () => (vegetationVisible ? buildRearTreeInstances(reducedGraphics) : []),
    [reducedGraphics, vegetationVisible],
  );
  const poles = useMemo(() => buildRearPoleInstances(reducedGraphics), [reducedGraphics]);

  useLayoutEffect(() => {
    const canopy = canopyRef.current;
    const trunk = trunkRef.current;
    if (!canopy || !trunk || trees.length === 0) return;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    trees.forEach((tree, index) => {
      const canopyScale = tree.scale;
      matrix.compose(
        new THREE.Vector3(tree.x, canopyScale * 0.92, tree.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, tree.rotation, 0)),
        new THREE.Vector3(canopyScale, canopyScale * (0.85 + tree.tint * 0.5), canopyScale),
      );
      canopy.setMatrixAt(index, matrix);
      color.setHSL(0.26 - tree.tint * 0.05, 0.32 + tree.tint * 0.16, 0.24 + tree.tint * 0.12);
      canopy.setColorAt(index, color);

      matrix.compose(
        new THREE.Vector3(tree.x, canopyScale * 0.34, tree.z),
        new THREE.Quaternion(),
        new THREE.Vector3(canopyScale * 0.16, canopyScale * 0.7, canopyScale * 0.16),
      );
      trunk.setMatrixAt(index, matrix);
    });

    canopy.count = trees.length;
    trunk.count = trees.length;
    canopy.instanceMatrix.needsUpdate = true;
    trunk.instanceMatrix.needsUpdate = true;
    if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
    canopy.computeBoundingSphere();
    trunk.computeBoundingSphere();
  }, [trees]);

  useLayoutEffect(() => {
    const mesh = poleRef.current;
    if (!mesh || poles.length === 0) return;
    const matrix = new THREE.Matrix4();
    poles.forEach((pole, index) => {
      matrix.compose(
        new THREE.Vector3(pole.x, 0.42, pole.z),
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1, 1),
      );
      mesh.setMatrixAt(index, matrix);
    });
    mesh.count = poles.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [poles]);

  useEffect(() => () => {
    disposeInstancedMesh(canopyRef.current);
    disposeInstancedMesh(trunkRef.current);
    disposeInstancedMesh(poleRef.current);
  }, []);

  if (!visible) return null;

  return (
    <group name="rear-park-environment">
      {terrain.map((entry) => (
        <mesh
          key={entry.patch.id}
          geometry={entry.geometry}
          position={[entry.bounds.centerX, 0, entry.bounds.centerZ]}
          raycast={NO_RAYCAST}
          receiveShadow={!reducedGraphics}
          dispose={null}
        >
          <meshStandardMaterial
            map={grassTexture ?? undefined}
            color="#8aa465"
            roughness={0.97}
            metalness={0}
          />
        </mesh>
      ))}

      {REAR_CONTEXT_BLOCKS.map((block) => {
        const bounds = sourceBoundsToLocal(block.sourceBounds);
        if (block.kind === 'farmland') {
          return (
            <mesh
              key={block.id}
              position={[bounds.centerX, 0.008, bounds.centerZ]}
              rotation={[-Math.PI / 2, 0, 0]}
              raycast={NO_RAYCAST}
              dispose={null}
            >
              <planeGeometry args={[bounds.width, bounds.depth]} />
              <meshStandardMaterial color={block.tone} roughness={0.98} metalness={0} />
            </mesh>
          );
        }
        return (
          <mesh
            key={block.id}
            position={[bounds.centerX, block.height / 2, bounds.centerZ]}
            raycast={NO_RAYCAST}
            castShadow={!reducedGraphics}
            dispose={null}
          >
            <boxGeometry args={[bounds.width, block.height, bounds.depth]} />
            <meshStandardMaterial color={block.tone} roughness={0.86} metalness={0} />
          </mesh>
        );
      })}

      {trees.length > 0 && (
        <>
          <instancedMesh
            ref={trunkRef}
            args={[undefined, undefined, trees.length]}
            raycast={NO_RAYCAST}
            dispose={null}
          >
            <cylinderGeometry args={[0.055, 0.085, 1, reducedGraphics ? 4 : 6]} />
            <meshStandardMaterial color="#6a5340" roughness={0.95} metalness={0} />
          </instancedMesh>
          <instancedMesh
            ref={canopyRef}
            args={[undefined, undefined, trees.length]}
            raycast={NO_RAYCAST}
            castShadow={!reducedGraphics}
            dispose={null}
          >
            <icosahedronGeometry args={[0.5, reducedGraphics ? 0 : 1]} />
            <meshStandardMaterial color="#ffffff" roughness={0.92} metalness={0} flatShading />
          </instancedMesh>
        </>
      )}

      {poles.length > 0 && (
        <instancedMesh
          ref={poleRef}
          args={[undefined, undefined, poles.length]}
          raycast={NO_RAYCAST}
          dispose={null}
        >
          <cylinderGeometry args={[0.022, 0.03, 0.84, 5]} />
          <meshStandardMaterial color="#9aa0a2" roughness={0.7} metalness={0.2} />
        </instancedMesh>
      )}
    </group>
  );
});
