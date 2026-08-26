import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ROAD_MATERIAL_COLORS } from '../../constants';
import {
  NATIONS_DISTRICT_LAYOUT,
  type NationsDistrictIsland,
  type NationsDistrictPoint,
} from '../../data/nationsDistrict';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';

const NO_RAYCAST = () => undefined;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);

type Vector3Tuple = [number, number, number];

interface InstanceTransform {
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
}

interface NationsDistrictProps {
  visible: boolean;
  opacity: number;
  reducedGraphics: boolean;
}

export interface NationsBuildingMaterialSet {
  wall: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  green: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  platform: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
}

export interface NationsBuildingProps {
  bounds: { width: number; depth: number };
  height: number;
  materials: NationsBuildingMaterialSet;
  showDetail: boolean;
  showFocusDetail: boolean;
}

function createNoiseTexture(colorValue: string, variance: number) {
  const size = 64;
  const base = new THREE.Color(colorValue);
  const data = new Uint8Array(size * size * 4);
  for (let index = 0; index < size * size; index += 1) {
    const hash = Math.sin((index + 17) * 12.9898) * 43758.5453;
    const noise = hash - Math.floor(hash);
    const multiplier = 1 - variance / 2 + noise * variance;
    data[index * 4] = Math.round(THREE.MathUtils.clamp(base.r * multiplier, 0, 1) * 255);
    data[index * 4 + 1] = Math.round(THREE.MathUtils.clamp(base.g * multiplier, 0, 1) * 255);
    data[index * 4 + 2] = Math.round(THREE.MathUtils.clamp(base.b * multiplier, 0, 1) * 255);
    data[index * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3.5, 3.5);
  texture.needsUpdate = true;
  return texture;
}

const ASPHALT_TEXTURE = createNoiseTexture(ROAD_MATERIAL_COLORS.asphalt, 0.13);
const GRASS_TEXTURE = createNoiseTexture('#758b65', 0.18);

function shapeFromPolygon(points: readonly NationsDistrictPoint[]) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  shape.closePath();
  return shape;
}

function createHorizontalGeometry(polygons: readonly (readonly NationsDistrictPoint[])[]) {
  const geometry = new THREE.ShapeGeometry(polygons.map(shapeFromPolygon), 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function islandPolygon(island: NationsDistrictIsland, scale = 1): readonly NationsDistrictPoint[] {
  const [centerX, centerZ] = island.center;
  const halfWidth = island.width * scale / 2;
  const halfDepth = island.depth * scale / 2;
  const chamferX = halfWidth * 0.34;
  const chamferZ = halfDepth * 0.18;
  return [
    [centerX - halfWidth + chamferX, centerZ - halfDepth],
    [centerX + halfWidth - chamferX, centerZ - halfDepth],
    [centerX + halfWidth, centerZ - halfDepth + chamferZ],
    [centerX + halfWidth, centerZ + halfDepth - chamferZ],
    [centerX + halfWidth - chamferX, centerZ + halfDepth],
    [centerX - halfWidth + chamferX, centerZ + halfDepth],
    [centerX - halfWidth, centerZ + halfDepth - chamferZ],
    [centerX - halfWidth, centerZ - halfDepth + chamferZ],
  ] as const;
}

function polygonEdgeTransforms(
  polygon: readonly NationsDistrictPoint[],
  y: number,
  width: number,
  height: number,
): InstanceTransform[] {
  return polygon.map(([x, z], index) => {
    const [nextX, nextZ] = polygon[(index + 1) % polygon.length] ?? [x, z];
    const dx = nextX - x;
    const dz = nextZ - z;
    return {
      position: [(x + nextX) / 2, y, (z + nextZ) / 2],
      scale: [Math.hypot(dx, dz), height, width],
      rotation: [0, -Math.atan2(dz, dx), 0],
    };
  });
}

function InstancedBatch({
  geometry = UNIT_BOX,
  material,
  items,
  castShadow = false,
  receiveShadow = false,
}: {
  geometry?: THREE.BufferGeometry;
  material: THREE.Material;
  items: readonly InstanceTransform[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  const setMesh = useCallback((next: THREE.InstancedMesh | null) => {
    const previous = meshRef.current;
    if (previous && previous !== next) disposeInstancedMesh(previous);
    meshRef.current = next;
  }, []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    items.forEach((item, index) => {
      position.fromArray(item.position);
      scale.fromArray(item.scale);
      euler.fromArray(item.rotation ?? [0, 0, 0]);
      quaternion.setFromEuler(euler);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    invalidate();
  }, [invalidate, items]);

  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={setMesh}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled
      raycast={NO_RAYCAST}
      dispose={null}
    />
  );
}

function createMaterials() {
  const common = { transparent: false, opacity: 1, depthWrite: true };
  return {
    grass: new THREE.MeshStandardMaterial({
      ...common,
      color: '#ffffff',
      map: GRASS_TEXTURE,
      roughness: 0.97,
    }),
    asphalt: new THREE.MeshStandardMaterial({
      ...common,
      color: '#ffffff',
      map: ASPHALT_TEXTURE,
      roughness: 0.94,
    }),
    paver: new THREE.MeshStandardMaterial({ ...common, color: '#8b6555', roughness: 0.91 }),
    curb: new THREE.MeshStandardMaterial({ ...common, color: ROAD_MATERIAL_COLORS.curb, roughness: 0.86 }),
    concrete: new THREE.MeshStandardMaterial({ ...common, color: '#c7c4b9', roughness: 0.9 }),
    wall: new THREE.MeshStandardMaterial({ ...common, color: '#d8d2c3', roughness: 0.84 }),
    charcoal: new THREE.MeshStandardMaterial({ ...common, color: '#3d4240', roughness: 0.76 }),
    metal: new THREE.MeshStandardMaterial({ ...common, color: '#a8aeaa', roughness: 0.68, metalness: 0.1 }),
    timber: new THREE.MeshStandardMaterial({ ...common, color: '#594337', roughness: 0.86 }),
    warm: new THREE.MeshStandardMaterial({ ...common, color: '#b88658', roughness: 0.84 }),
  };
}

export function NationsDistrict({ visible, opacity, reducedGraphics }: NationsDistrictProps) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const presentationVisible = visible && opacity > 0.015;
  const grassGeometry = useMemo(
    () => createHorizontalGeometry([NATIONS_DISTRICT_LAYOUT.grassBoundary]),
    [],
  );
  const asphaltGeometry = useMemo(
    () => createHorizontalGeometry([
      NATIONS_DISTRICT_LAYOUT.mainAsphalt,
      NATIONS_DISTRICT_LAYOUT.northApproach,
      NATIONS_DISTRICT_LAYOUT.southApproach,
      NATIONS_DISTRICT_LAYOUT.stageApron,
    ]),
    [],
  );
  const civicGeometry = useMemo(
    () => createHorizontalGeometry([NATIONS_DISTRICT_LAYOUT.civicPaving]),
    [],
  );
  const islandPaverGeometry = useMemo(() => createHorizontalGeometry(
    NATIONS_DISTRICT_LAYOUT.islands.map((island) => islandPolygon(island)),
  ), []);
  const islandGrassGeometry = useMemo(() => createHorizontalGeometry(
    NATIONS_DISTRICT_LAYOUT.islands.map((island) => islandPolygon(island, island.insetScale)),
  ), []);
  const materials = useMemo(() => createMaterials(), []);
  const curbItems = useMemo(() => [
    ...polygonEdgeTransforms(NATIONS_DISTRICT_LAYOUT.mainAsphalt, 0.105, 0.075, 0.075),
    ...NATIONS_DISTRICT_LAYOUT.islands.flatMap((island) => (
      polygonEdgeTransforms(islandPolygon(island), 0.132, 0.055, 0.055)
    )),
  ], []);
  const stairBands = useMemo<InstanceTransform[]>(() => (
    NATIONS_DISTRICT_LAYOUT.islands.flatMap((island) => (
      Array.from({ length: island.stairBands }, (_, index) => {
        const spread = island.depth * 0.38;
        const z = island.center[1] - spread / 2 + spread * index / Math.max(1, island.stairBands - 1);
        return {
          position: [island.center[0], 0.174, z],
          scale: [island.width * 0.58, 0.035, 0.055],
        } as InstanceTransform;
      })
    ))
  ), []);
  const benchItems = useMemo<InstanceTransform[]>(() => (
    NATIONS_DISTRICT_LAYOUT.islands.flatMap((island, index) => ([
      {
        position: [island.center[0] - island.width * 0.72, 0.21, island.center[1] + (index % 2 ? -0.2 : 0.2)],
        scale: [island.width * 0.42, 0.09, 0.16],
      },
      {
        position: [island.center[0] + island.width * 0.72, 0.21, island.center[1] + (index % 2 ? 0.2 : -0.2)],
        scale: [island.width * 0.42, 0.09, 0.16],
      },
    ] as InstanceTransform[]))
  ), []);
  const lightPosts = useMemo<InstanceTransform[]>(() => {
    const [centerX] = NATIONS_DISTRICT_LAYOUT.center;
    const zValues = [-4.55, -2.35, 0, 2.35, 4.55];
    return zValues.flatMap((offset) => ([-1, 1].map((side) => ({
      position: [centerX + side * 3.2, 0.7, NATIONS_DISTRICT_LAYOUT.center[1] + offset] as Vector3Tuple,
      scale: [0.055, 1.4, 0.055] as Vector3Tuple,
    }))));
  }, []);
  const lightCaps = useMemo<InstanceTransform[]>(() => lightPosts.map((post) => ({
    position: [post.position[0], 1.42, post.position[2]],
    scale: [0.18, 0.13, 0.18],
  })), [lightPosts]);
  const stage = NATIONS_DISTRICT_LAYOUT.stage;
  const stageBodyItems = useMemo<InstanceTransform[]>(() => [
    { position: [0, 0.13, 0], scale: [stage.width * 1.08, 0.2, stage.depth * 1.05] },
    { position: [0, stage.height * 0.34, stage.depth * 0.08], scale: [stage.width * 0.88, stage.height * 0.56, stage.depth * 0.62] },
    { position: [-stage.width * 0.47, stage.height * 0.28, stage.depth * 0.08], scale: [stage.width * 0.12, stage.height * 0.42, stage.depth * 0.7] },
    { position: [stage.width * 0.47, stage.height * 0.28, stage.depth * 0.08], scale: [stage.width * 0.12, stage.height * 0.42, stage.depth * 0.7] },
  ], [stage.depth, stage.height, stage.width]);
  const stageDarkItems = useMemo<InstanceTransform[]>(() => [
    { position: [0, stage.height * 0.37, stage.depth * 0.405], scale: [stage.width * 0.7, stage.height * 0.48, 0.08] },
    { position: [0, stage.height * 0.08, stage.depth * 0.59], scale: [stage.width * 0.76, 0.1, stage.depth * 0.2] },
  ], [stage.depth, stage.height, stage.width]);
  const roofRise = stage.height * 0.31;
  const roofPitch = Math.atan2(roofRise, stage.width * 0.48);
  const roofLength = Math.hypot(stage.width * 0.5, roofRise);
  const stageRoofItems = useMemo<InstanceTransform[]>(() => [
    {
      position: [-stage.width * 0.24, stage.height * 0.7 + roofRise * 0.5, 0],
      scale: [roofLength, 0.1, stage.depth * 0.88],
      rotation: [0, 0, roofPitch],
    },
    {
      position: [stage.width * 0.24, stage.height * 0.7 + roofRise * 0.5, 0],
      scale: [roofLength, 0.1, stage.depth * 0.88],
      rotation: [0, 0, -roofPitch],
    },
    {
      position: [0, stage.height * 0.68, stage.depth * 0.48],
      scale: [stage.width * 0.84, 0.08, stage.depth * 0.3],
      rotation: [-0.08, 0, 0],
    },
  ], [roofLength, roofPitch, roofRise, stage.depth, stage.height, stage.width]);
  const stageMetalItems = useMemo<InstanceTransform[]>(() => [
    ...[-0.42, -0.14, 0.14, 0.42].map((ratio) => ({
      position: [ratio * stage.width, stage.height * 0.45, stage.depth * 0.5] as Vector3Tuple,
      scale: [0.055, stage.height * 0.76, 0.055] as Vector3Tuple,
    })),
    { position: [0, stage.height * 0.78, stage.depth * 0.5], scale: [stage.width * 0.91, 0.055, 0.055] },
  ], [stage.depth, stage.height, stage.width]);

  useEffect(() => () => {
    grassGeometry.dispose();
    asphaltGeometry.dispose();
    civicGeometry.dispose();
    islandPaverGeometry.dispose();
    islandGrassGeometry.dispose();
  }, [asphaltGeometry, civicGeometry, grassGeometry, islandGrassGeometry, islandPaverGeometry]);

  useEffect(() => () => Object.values(materials).forEach((material) => material.dispose()), [materials]);

  useEffect(() => {
    const transparent = opacity < 0.995;
    Object.values(materials).forEach((material) => {
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
      material.opacity = opacity;
      material.depthWrite = opacity > 0.42;
    });
    invalidate();
  }, [invalidate, materials, opacity]);

  useEffect(() => {
    const grassMap = reducedGraphics ? null : GRASS_TEXTURE;
    const asphaltMap = reducedGraphics ? null : ASPHALT_TEXTURE;
    materials.grass.color.set(reducedGraphics ? '#758b65' : '#ffffff');
    materials.asphalt.color.set(reducedGraphics ? ROAD_MATERIAL_COLORS.asphalt : '#ffffff');
    if (materials.grass.map !== grassMap) {
      materials.grass.map = grassMap;
      materials.grass.needsUpdate = true;
    }
    if (materials.asphalt.map !== asphaltMap) {
      materials.asphalt.map = asphaltMap;
      materials.asphalt.needsUpdate = true;
    }
    invalidate();
  }, [invalidate, materials, reducedGraphics]);

  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, presentationVisible, reducedGraphics]);

  return (
    <group visible={presentationVisible} dispose={null}>
      <mesh geometry={grassGeometry} material={materials.grass} position={[0, 0.022, 0]} receiveShadow raycast={NO_RAYCAST} />
      <mesh geometry={asphaltGeometry} material={materials.asphalt} position={[0, 0.062, 0]} receiveShadow raycast={NO_RAYCAST} />
      <mesh geometry={civicGeometry} material={materials.paver} position={[0, 0.096, 0]} receiveShadow raycast={NO_RAYCAST} />
      <mesh geometry={islandPaverGeometry} material={materials.concrete} position={[0, 0.136, 0]} receiveShadow raycast={NO_RAYCAST} />
      <mesh geometry={islandGrassGeometry} material={materials.grass} position={[0, 0.172, 0]} receiveShadow raycast={NO_RAYCAST} />
      <InstancedBatch material={materials.curb} items={curbItems} receiveShadow />
      <InstancedBatch material={materials.timber} items={stairBands} />
      {!reducedGraphics && <InstancedBatch material={materials.timber} items={benchItems} />}
      {!reducedGraphics && <InstancedBatch geometry={UNIT_CYLINDER} material={materials.metal} items={lightPosts} />}
      {!reducedGraphics && <InstancedBatch material={materials.warm} items={lightCaps} />}

      <group position={[stage.center[0], 0, stage.center[1]]} rotation={[0, stage.facingRadians, 0]} dispose={null}>
        <InstancedBatch material={materials.wall} items={stageBodyItems} castShadow={!reducedGraphics} receiveShadow />
        <InstancedBatch material={materials.charcoal} items={stageDarkItems} />
        <InstancedBatch material={materials.charcoal} items={stageRoofItems} castShadow={!reducedGraphics} receiveShadow />
        {!reducedGraphics && <InstancedBatch geometry={UNIT_CYLINDER} material={materials.metal} items={stageMetalItems} />}
      </group>
    </group>
  );
}

function createHipRoofGeometry(width: number, depth: number, rise: number) {
  const ridgeHalf = Math.max(width * 0.08, (width - depth) * 0.42);
  const leftFront = [-width / 2, 0, depth / 2] as Vector3Tuple;
  const rightFront = [width / 2, 0, depth / 2] as Vector3Tuple;
  const rightBack = [width / 2, 0, -depth / 2] as Vector3Tuple;
  const leftBack = [-width / 2, 0, -depth / 2] as Vector3Tuple;
  const ridgeLeft = [-ridgeHalf, rise, 0] as Vector3Tuple;
  const ridgeRight = [ridgeHalf, rise, 0] as Vector3Tuple;
  const vertices = [
    leftFront, rightFront, ridgeRight, leftFront, ridgeRight, ridgeLeft,
    rightFront, rightBack, ridgeRight,
    rightBack, leftBack, ridgeLeft, rightBack, ridgeLeft, ridgeRight,
    leftBack, leftFront, ridgeLeft,
    leftBack, rightBack, rightFront, leftBack, rightFront, leftFront,
  ].flat();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function AfricanPavilion({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: NationsBuildingProps) {
  const width = bounds.width;
  const depth = bounds.depth;
  const bodyWidth = width * 0.86;
  const bodyDepth = depth * 0.72;
  const wallHeight = height * 0.48;
  const roofRise = height * 0.25;
  const frontZ = bodyDepth / 2;
  const verandaDepth = depth * 0.2;
  const roofGeometry = useMemo(
    () => createHipRoofGeometry(bodyWidth * 1.08, bodyDepth + depth * 0.12, roofRise),
    [bodyDepth, bodyWidth, depth, roofRise],
  );
  const annexRoofGeometry = useMemo(
    () => createHipRoofGeometry(width * 0.42, depth * 0.34, roofRise * 0.56),
    [depth, roofRise, width],
  );
  const openings = useMemo<InstanceTransform[]>(() => [
    { position: [-bodyWidth * 0.27, wallHeight * 0.52 + 0.09, frontZ + 0.035], scale: [bodyWidth * 0.19, wallHeight * 0.42, 0.04] },
    { position: [bodyWidth * 0.27, wallHeight * 0.52 + 0.09, frontZ + 0.035], scale: [bodyWidth * 0.19, wallHeight * 0.42, 0.04] },
    { position: [0, wallHeight * 0.42 + 0.09, frontZ + 0.045], scale: [bodyWidth * 0.15, wallHeight * 0.65, 0.05] },
  ], [bodyWidth, frontZ, wallHeight]);
  const columns = useMemo<InstanceTransform[]>(() => [-0.42, -0.14, 0.14, 0.42].map((ratio) => ({
    position: [ratio * bodyWidth, wallHeight * 0.42 + 0.08, frontZ + verandaDepth * 0.72] as Vector3Tuple,
    scale: [0.05, wallHeight * 0.84, 0.05] as Vector3Tuple,
  })), [bodyWidth, frontZ, verandaDepth, wallHeight]);
  const steps = useMemo<InstanceTransform[]>(() => Array.from({ length: 4 }, (_, index) => ({
    position: [0, 0.04 + index * 0.045, frontZ + verandaDepth * (1.18 - index * 0.12)] as Vector3Tuple,
    scale: [bodyWidth * (0.34 + index * 0.035), 0.07, verandaDepth * (0.38 + index * 0.13)] as Vector3Tuple,
  })), [bodyWidth, frontZ, verandaDepth]);

  useEffect(() => () => {
    roofGeometry.dispose();
    annexRoofGeometry.dispose();
  }, [annexRoofGeometry, roofGeometry]);

  return (
    <group dispose={null}>
      <mesh geometry={UNIT_BOX} material={materials.platform} position={[0, 0.055, 0]} scale={[width * 0.98, 0.11, depth * 0.98]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={UNIT_BOX} material={materials.wall} position={[0, wallHeight / 2 + 0.1, 0]} scale={[bodyWidth, wallHeight, bodyDepth]} castShadow receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={roofGeometry} material={materials.roof} position={[0, wallHeight + 0.1, 0]} castShadow receiveShadow raycast={NO_RAYCAST} />
      <mesh geometry={UNIT_BOX} material={materials.white} position={[-width * 0.27, wallHeight * 0.34 + 0.1, -depth * 0.31]} scale={[width * 0.42, wallHeight * 0.62, depth * 0.3]} castShadow receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={annexRoofGeometry} material={materials.metal} position={[-width * 0.27, wallHeight * 0.65 + 0.1, -depth * 0.31]} castShadow raycast={NO_RAYCAST} />
      <mesh geometry={UNIT_BOX} material={materials.platform} position={[0, 0.13, frontZ + verandaDepth * 0.56]} scale={[bodyWidth * 0.94, 0.1, verandaDepth]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={UNIT_BOX} material={materials.roof} position={[0, wallHeight * 0.86 + 0.1, frontZ + verandaDepth * 0.5]} rotation={[-0.1, 0, 0]} scale={[bodyWidth * 1.02, 0.07, verandaDepth * 1.16]} castShadow raycast={NO_RAYCAST} dispose={null} />
      <InstancedBatch material={materials.dark} items={openings} />
      <InstancedBatch material={materials.trim} items={columns} castShadow />
      <InstancedBatch material={materials.accent} items={[
        { position: [0, wallHeight * 0.77 + 0.1, frontZ + 0.052], scale: [bodyWidth * 0.9, 0.08, 0.035] },
        { position: [0, wallHeight * 0.18 + 0.1, frontZ + 0.052], scale: [bodyWidth * 0.9, 0.055, 0.035] },
      ]} />
      {showDetail && <InstancedBatch material={materials.platform} items={steps} receiveShadow />}
      {showDetail && <InstancedBatch material={materials.trim} items={[
        { position: [0, wallHeight * 0.26 + 0.1, frontZ + verandaDepth * 0.84], scale: [bodyWidth * 0.82, 0.04, 0.035] },
        ...[-0.36, -0.24, -0.12, 0.12, 0.24, 0.36].map((ratio) => ({
          position: [ratio * bodyWidth, wallHeight * 0.2 + 0.1, frontZ + verandaDepth * 0.84] as Vector3Tuple,
          scale: [0.024, wallHeight * 0.25, 0.03] as Vector3Tuple,
        })),
      ]} />}
      {showFocusDetail && <InstancedBatch material={materials.trim} items={openings.slice(0, 2).flatMap((opening) => ([
        { position: [opening.position[0], opening.position[1], opening.position[2] + 0.025], scale: [0.022, opening.scale[1], 0.022] },
        { position: [opening.position[0], opening.position[1], opening.position[2] + 0.027], scale: [opening.scale[0], 0.022, 0.022] },
      ]))} />}
    </group>
  );
}

export function RotaryHouse({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: NationsBuildingProps) {
  const width = bounds.width;
  const depth = bounds.depth;
  const wallHeight = height * 0.43;
  const mainWidth = width * 0.82;
  const mainDepth = depth * 0.54;
  const wingWidth = width * 0.38;
  const wingDepth = depth * 0.46;
  const roofRise = height * 0.18;
  const pitch = Math.atan2(roofRise, mainWidth * 0.5);
  const mainRoofLength = Math.hypot(mainWidth * 0.5 + width * 0.035, roofRise);
  const wingPitch = Math.atan2(roofRise * 0.72, wingWidth * 0.5);
  const wingRoofLength = Math.hypot(wingWidth * 0.5 + width * 0.025, roofRise * 0.72);
  const walls = useMemo<InstanceTransform[]>(() => [
    { position: [0, wallHeight / 2 + 0.09, -depth * 0.08], scale: [mainWidth, wallHeight, mainDepth] },
    { position: [-width * 0.27, wallHeight * 0.43 + 0.09, depth * 0.27], scale: [wingWidth, wallHeight * 0.82, wingDepth] },
    { position: [width * 0.23, wallHeight * 0.36 + 0.09, depth * 0.23], scale: [width * 0.3, wallHeight * 0.68, depth * 0.32] },
  ], [depth, mainDepth, mainWidth, wallHeight, width, wingDepth, wingWidth]);
  const roofs = useMemo<InstanceTransform[]>(() => [
    { position: [-mainWidth * 0.25, wallHeight + roofRise * 0.5 + 0.09, -depth * 0.08], scale: [mainRoofLength, 0.085, mainDepth + depth * 0.12], rotation: [0, 0, pitch] },
    { position: [mainWidth * 0.25, wallHeight + roofRise * 0.5 + 0.09, -depth * 0.08], scale: [mainRoofLength, 0.085, mainDepth + depth * 0.12], rotation: [0, 0, -pitch] },
    { position: [-width * 0.27 - wingWidth * 0.25, wallHeight * 0.82 + roofRise * 0.36 + 0.09, depth * 0.27], scale: [wingRoofLength, 0.07, wingDepth + depth * 0.08], rotation: [0, 0, wingPitch] },
    { position: [-width * 0.27 + wingWidth * 0.25, wallHeight * 0.82 + roofRise * 0.36 + 0.09, depth * 0.27], scale: [wingRoofLength, 0.07, wingDepth + depth * 0.08], rotation: [0, 0, -wingPitch] },
  ], [depth, mainDepth, mainRoofLength, mainWidth, pitch, roofRise, wallHeight, width, wingDepth, wingPitch, wingRoofLength, wingWidth]);
  const windows = useMemo<InstanceTransform[]>(() => [-0.28, 0, 0.28].map((ratio) => ({
    position: [ratio * mainWidth, wallHeight * 0.52 + 0.09, mainDepth * 0.5 + depth * 0.025] as Vector3Tuple,
    scale: [mainWidth * 0.16, wallHeight * 0.36, 0.04] as Vector3Tuple,
  })), [depth, mainDepth, mainWidth, wallHeight]);
  const rotaryWheel = useMemo(() => new THREE.TorusGeometry(0.5, 0.085, 8, 20), []);
  const wheelSpokes = useMemo<InstanceTransform[]>(() => Array.from({ length: 8 }, (_, index) => ({
    position: [0, 0, 0],
    scale: [width * 0.16, 0.026, 0.026],
    rotation: [0, 0, index * Math.PI / 4],
  })), [width]);

  useEffect(() => () => rotaryWheel.dispose(), [rotaryWheel]);

  return (
    <group dispose={null}>
      <mesh geometry={UNIT_BOX} material={materials.platform} position={[0, 0.055, 0]} scale={[width * 0.98, 0.11, depth * 0.98]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <InstancedBatch material={materials.wall} items={walls} castShadow receiveShadow />
      <InstancedBatch material={materials.metal} items={roofs} castShadow receiveShadow />
      <InstancedBatch material={materials.glass} items={windows} />
      <mesh geometry={UNIT_BOX} material={materials.trim} position={[0, 0.16, mainDepth * 0.58]} scale={[mainWidth * 0.94, 0.1, depth * 0.18]} receiveShadow raycast={NO_RAYCAST} dispose={null} />
      <mesh geometry={UNIT_BOX} material={materials.dark} position={[mainWidth * 0.36, wallHeight * 0.42 + 0.09, mainDepth * 0.51 + depth * 0.03]} scale={[mainWidth * 0.15, wallHeight * 0.64, 0.05]} raycast={NO_RAYCAST} dispose={null} />
      {showDetail && (
        <group position={[-mainWidth * 0.34, wallHeight * 0.62 + 0.14, mainDepth * 0.53 + depth * 0.035]} dispose={null}>
          <mesh geometry={rotaryWheel} material={materials.accent} scale={[width * 0.24, width * 0.24, width * 0.24]} raycast={NO_RAYCAST} />
          <InstancedBatch material={materials.accent} items={wheelSpokes} />
        </group>
      )}
      {showDetail && <InstancedBatch material={materials.trim} items={windows.flatMap((window) => ([
        { position: [window.position[0], window.position[1], window.position[2] + 0.025], scale: [0.02, window.scale[1], 0.02] },
        { position: [window.position[0], window.position[1], window.position[2] + 0.027], scale: [window.scale[0], 0.02, 0.02] },
      ]))} />}
      {showFocusDetail && <InstancedBatch material={materials.metal} items={[
        { position: [0, wallHeight + roofRise + 0.12, -depth * 0.08], scale: [mainWidth * 0.92, 0.028, 0.028] },
        { position: [-width * 0.27, wallHeight * 0.82 + roofRise * 0.72 + 0.12, depth * 0.27], scale: [wingWidth * 0.88, 0.024, 0.024] },
      ]} />}
    </group>
  );
}
