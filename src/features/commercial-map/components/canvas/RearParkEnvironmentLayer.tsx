import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  REAR_TERRAIN_PATCHES,
  buildRearPoleInstances,
  buildRearTreeInstances,
  sourcePolygonToLocal,
} from '../../data/rearParkEnvironment';
import { getOpenGroundTexture } from './openGroundTextures';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';
import { rearRoadTerrainElevationAt } from '../../utils/rearRoadNetwork';

interface RearParkEnvironmentLayerProps {
  reducedGraphics: boolean;
  visible?: boolean;
  vegetationVisible?: boolean;
}

const NO_RAYCAST = () => undefined;

/**
 * Extensão irregular e contínua do terreno até além da BR-472, com vegetação
 * instanciada e iluminação localizada. Nenhuma geometria oficial é alterada.
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
    const outline = sourcePolygonToLocal(patch.sourcePolygon);
    const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
    const geometry = new THREE.ShapeGeometry(shape);
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const z = position.getY(index);
      position.setXYZ(index, x, patch.baseElevation + rearRoadTerrainElevationAt(x, z), z);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return { patch, geometry };
  }), []);

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
