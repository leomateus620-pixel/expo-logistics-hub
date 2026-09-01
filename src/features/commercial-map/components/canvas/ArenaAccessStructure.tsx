import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ARENA_FRONT_LAYOUT, sourceBoundsToLocal } from '../../data/parkEnvironment';
import { ARENA_TERRAIN_TOP_ELEVATION } from '../../data/arenaTerrain';
import {
  ARENA_ACCESS_REFERENCE,
  createArenaAccessLayout,
  type ArenaAccessBox,
  type ArenaAccessSegment,
} from '../../utils/arenaAccessStructure';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';

const NO_RAYCAST = () => undefined;
const UNIT_X = new THREE.Vector3(1, 0, 0);

interface InstancedTransform {
  matrix: THREE.Matrix4;
}

function boxMatrix(box: ArenaAccessBox) {
  const object = new THREE.Object3D();
  object.position.set(...box.position);
  object.rotation.set(...(box.rotation ?? [0, 0, 0]));
  object.scale.set(...box.scale);
  object.updateMatrix();
  return object.matrix.clone();
}

function beamMatrix(item: ArenaAccessSegment) {
  const start = new THREE.Vector3(...item.start);
  const end = new THREE.Vector3(...item.end);
  const direction = end.clone().sub(start);
  const length = Math.max(0.001, direction.length());
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UNIT_X, direction.normalize());
  return new THREE.Matrix4().compose(
    start.add(end).multiplyScalar(0.5),
    quaternion,
    new THREE.Vector3(length, item.thickness, item.thickness),
  );
}

function InstancedBoxes({
  name,
  items,
  material,
  geometry,
  castShadow = false,
  receiveShadow = false,
}: {
  name: string;
  items: readonly InstancedTransform[];
  material: THREE.Material;
  geometry: THREE.BoxGeometry;
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach(({ matrix }, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [items]);
  useEffect(() => () => disposeInstancedMesh(ref.current), []);
  if (!items.length) return null;
  return (
    <instancedMesh
      ref={ref}
      name={name}
      args={[geometry, material, items.length]}
      count={items.length}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled
      raycast={NO_RAYCAST}
      userData={ARENA_ACCESS_REFERENCE}
      dispose={null}
    />
  );
}

function opacityMaterial(
  color: string,
  roughness: number,
  metalness: number,
  opacity: number,
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    transparent: opacity < 0.999,
    opacity,
    depthWrite: opacity > 0.94,
  });
}

export const ArenaAccessStructure = memo(function ArenaAccessStructure({
  reducedGraphics,
  opacity,
}: {
  reducedGraphics: boolean;
  opacity: number;
}) {
  const { gl, invalidate } = useThree();
  const bounds = useMemo(
    () => sourceBoundsToLocal(ARENA_FRONT_LAYOUT.accessCanopy.sourceBounds),
    [],
  );
  const layout = useMemo(
    () => createArenaAccessLayout(bounds, ARENA_TERRAIN_TOP_ELEVATION, reducedGraphics),
    [bounds, reducedGraphics],
  );
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const normalizedOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
  const materials = useMemo(() => ({
    concrete: opacityMaterial('#aaa79e', 0.96, 0, normalizedOpacity),
    roof: opacityMaterial('#b8b8b1', 0.84, 0.06, normalizedOpacity),
    light: opacityMaterial('#ddd9cc', 0.88, 0.02, normalizedOpacity),
    steel: opacityMaterial('#222929', 0.55, 0.42, normalizedOpacity),
    bench: opacityMaterial('#315b79', 0.72, 0.18, normalizedOpacity),
    tactile: opacityMaterial('#d0a82d', 0.9, 0.02, normalizedOpacity),
  }), [normalizedOpacity]);

  const transforms = useMemo(() => {
    const forBoxes = (roles: readonly ArenaAccessBox['role'][]) => layout.boxes
      .filter((item) => roles.includes(item.role))
      .map((item) => ({ matrix: boxMatrix(item) }));
    return {
      concrete: forBoxes(['PLATFORM', 'CONNECTOR']),
      roof: forBoxes(['ROOF']),
      light: forBoxes(['FASCIA', 'SIDE_WALL']),
      bench: forBoxes(['BENCH']),
      tactile: forBoxes(['TACTILE_STRIP']),
      steel: layout.segments.map((item) => ({ matrix: beamMatrix(item) })),
    };
  }, [layout]);

  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, layout, opacity]);
  useEffect(() => () => {
    geometry.dispose();
    Object.values(materials).forEach((material) => material.dispose());
  }, [geometry, materials]);

  const castShadow = !reducedGraphics && normalizedOpacity > 0.72;
  return (
    <group
      name="conexao-coberta-escadaria-arena"
      position={[bounds.centerX, 0, bounds.centerZ]}
      raycast={NO_RAYCAST}
      userData={ARENA_ACCESS_REFERENCE}
      dispose={null}
    >
      <InstancedBoxes
        name="plataforma-conexao-arena"
        items={transforms.concrete}
        material={materials.concrete}
        geometry={geometry}
        castShadow={castShadow}
        receiveShadow
      />
      <InstancedBoxes
        name="cobertura-corrugada-conexao-arena"
        items={transforms.roof}
        material={materials.roof}
        geometry={geometry}
        castShadow={castShadow}
        receiveShadow
      />
      <InstancedBoxes
        name="fascia-e-parede-lateral-conexao-arena"
        items={transforms.light}
        material={materials.light}
        geometry={geometry}
        castShadow={castShadow}
        receiveShadow
      />
      <InstancedBoxes
        name="apoios-v-e-trelicas-conexao-arena"
        items={transforms.steel}
        material={materials.steel}
        geometry={geometry}
        castShadow={castShadow}
      />
      <InstancedBoxes
        name="bancos-conexao-arena"
        items={transforms.bench}
        material={materials.bench}
        geometry={geometry}
      />
      <InstancedBoxes
        name="faixa-tatil-conexao-arena"
        items={transforms.tactile}
        material={materials.tactile}
        geometry={geometry}
        receiveShadow
      />
    </group>
  );
});
