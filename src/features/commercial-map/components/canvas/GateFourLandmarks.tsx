import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  GATE_FOUR_DISTRICT_LAYOUT,
  GATE_FOUR_DISTRICT_RENDER_BUDGET,
  resolveCrioulosArchitectureEnvelope,
} from '../../data/gateFourDistrict';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';

const NO_RAYCAST = () => undefined;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
const CRIOULOS_FLAG_COLORS = ['#215c3f', '#d7b341', '#f1ead8', '#9a4a35'] as const;

type Vector3Tuple = [number, number, number];

interface InstanceTransform {
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
  color?: string;
}

export interface GateFourLandmarkMaterialSet {
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

/**
 * Deliberately structural so the landmark renderer can pass its existing
 * material/bounds contract without coupling this district to its private types.
 */
export interface GateFourLandmarkProps {
  bounds: { width: number; depth: number };
  height: number;
  materials: GateFourLandmarkMaterialSet;
  showDetail: boolean;
  showFocusDetail: boolean;
}

/** Static, demand-rendered budgets. Repeated parts are instanced by material. */
// eslint-disable-next-line react-refresh/only-export-components
export const GATE_FOUR_LANDMARK_RENDER_BUDGET = {
  pavilionNine: {
    basePrimaryDrawCalls: GATE_FOUR_DISTRICT_RENDER_BUDGET.pavilion9.baseDrawCalls,
    detailedPrimaryDrawCalls: GATE_FOUR_DISTRICT_RENDER_BUDGET.pavilion9.detailedDrawCalls,
    focusedPrimaryDrawCalls: GATE_FOUR_DISTRICT_RENDER_BUDGET.pavilion9.detailedDrawCalls,
    maximumApproximateTriangles: 2_400,
  },
  crioulosCenter: {
    basePrimaryDrawCalls: GATE_FOUR_DISTRICT_RENDER_BUDGET.crioulos.baseDrawCalls,
    detailedPrimaryDrawCalls: GATE_FOUR_DISTRICT_RENDER_BUDGET.crioulos.detailedDrawCalls,
    focusedPrimaryDrawCalls: GATE_FOUR_DISTRICT_RENDER_BUDGET.crioulos.detailedDrawCalls,
    maximumApproximateTriangles: 4_800,
  },
  gateFour: {
    basePrimaryDrawCalls: GATE_FOUR_DISTRICT_RENDER_BUDGET.gate4.baseDrawCalls,
    detailedPrimaryDrawCalls: GATE_FOUR_DISTRICT_RENDER_BUDGET.gate4.detailedDrawCalls,
    focusedPrimaryDrawCalls: GATE_FOUR_DISTRICT_RENDER_BUDGET.gate4.detailedDrawCalls,
    maximumApproximateTriangles: 1_900,
  },
  textureSize: 64,
  animatedDrawCalls: 0,
} as const;

function hashNoise(x: number, y: number, seed: number) {
  let value = (x * 374761393 + y * 668265263 + seed * 1442695041) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
  return ((value ^ (value >>> 16)) & 0xffff) / 0xffff;
}

function writePixel(
  data: Uint8Array,
  size: number,
  x: number,
  y: number,
  color: readonly [number, number, number],
) {
  const offset = (y * size + x) * 4;
  data[offset] = THREE.MathUtils.clamp(Math.round(color[0]), 0, 255);
  data[offset + 1] = THREE.MathUtils.clamp(Math.round(color[1]), 0, 255);
  data[offset + 2] = THREE.MathUtils.clamp(Math.round(color[2]), 0, 255);
  data[offset + 3] = 255;
}

function finishTexture(
  data: Uint8Array,
  size: number,
  repeat: readonly [number, number],
  anisotropy: number,
  name: string,
) {
  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = name;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.max(1, Math.min(8, anisotropy));
  texture.needsUpdate = true;
  return texture;
}

function createBrickTexture(anisotropy: number) {
  const size = GATE_FOUR_LANDMARK_RENDER_BUDGET.textureSize;
  const data = new Uint8Array(size * size * 4);
  const brickWidth = 16;
  const brickHeight = 8;
  for (let y = 0; y < size; y += 1) {
    const row = Math.floor(y / brickHeight);
    for (let x = 0; x < size; x += 1) {
      const staggeredX = x + (row % 2) * brickWidth * 0.5;
      const mortar = y % brickHeight <= 1 || staggeredX % brickWidth <= 1;
      const brickX = Math.floor(staggeredX / brickWidth);
      const coarse = (hashNoise(brickX, row, 7103) - 0.5) * 22;
      const fine = (hashNoise(x, y, 1931) - 0.5) * 11;
      // The host material owns the brick hue and interaction tint. Keep this
      // map neutral so sRGB sampling does not multiply a second red albedo.
      const base = mortar ? 244 : 222;
      const shade = mortar ? fine * 0.25 : coarse + fine;
      const value = base + shade;
      writePixel(data, size, x, y, [value, value, value]);
    }
  }
  return finishTexture(data, size, [4.8, 2.7], anisotropy, 'gate-four-crioulos-brick');
}

function createCeramicRoofTexture(anisotropy: number) {
  const size = GATE_FOUR_LANDMARK_RENDER_BUDGET.textureSize;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const row = Math.floor(y / 8);
    for (let x = 0; x < size; x += 1) {
      const shiftedX = x + (row % 2) * 4;
      const channel = shiftedX % 8;
      const overlap = y % 8 <= 1;
      const seam = channel <= 1;
      const wave = Math.sin(channel / 8 * Math.PI) * 14;
      const weathering = (hashNoise(x, y, 4421) - 0.5) * 12;
      const shade = overlap ? -24 : seam ? -18 : wave + weathering;
      const value = 234 + shade;
      writePixel(data, size, x, y, [value, value, value]);
    }
  }
  return finishTexture(data, size, [5.5, 8.5], anisotropy, 'gate-four-crioulos-ceramic-roof');
}

function createMetalRoofTexture(anisotropy: number) {
  const size = GATE_FOUR_LANDMARK_RENDER_BUDGET.textureSize;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const seam = x % 8 <= 1;
      const broad = Math.sin(x / size * Math.PI * 10) * 6;
      const grain = (hashNoise(x, y, 8273) - 0.5) * 7;
      const shade = seam ? -16 : broad + grain;
      const value = 238 + shade;
      writePixel(data, size, x, y, [value, value, value]);
    }
  }
  return finishTexture(data, size, [5.5, 10], anisotropy, 'gate-four-pavilion-nine-metal-roof');
}

/** Neutral detail maps leave color, filter and selection ownership with the host. */
// eslint-disable-next-line react-refresh/only-export-components
export function createGateFourSurfaceTexture(
  surface: 'brick' | 'ceramic-roof' | 'metal-roof',
  anisotropy: number,
) {
  if (surface === 'brick') return createBrickTexture(anisotropy);
  if (surface === 'ceramic-roof') return createCeramicRoofTexture(anisotropy);
  return createMetalRoofTexture(anisotropy);
}

// eslint-disable-next-line react-refresh/only-export-components
export function createGateFourMappedMaterial(
  source: THREE.MeshStandardMaterial,
  map: THREE.DataTexture,
  roughness: number,
  metalness: number,
) {
  const result = new THREE.MeshStandardMaterial({
    map,
    roughness,
    metalness,
    emissiveIntensity: 0,
    depthTest: true,
    depthWrite: true,
  });
  // Share color objects so filter, hover and selection tints remain live.
  result.color = source.color;
  result.emissive = source.emissive;
  // The host updates primitive intensity in an effect after this material is
  // created. Copying it once captures Three's default 1 and makes the surface
  // permanently self-lit. Sync only when it is actually drawn; no frame loop,
  // material recreation or demand-render invalidation is needed here.
  result.onBeforeRender = () => {
    result.emissiveIntensity = source.emissiveIntensity;
  };
  return result;
}

/** Ten openings per long facade, centered inside the eleven structural piers. */
// eslint-disable-next-line react-refresh/only-export-components
export function createPavilionNineSideOpenings(
  bodyWidth: number,
  bodyDepth: number,
  wallHeight: number,
  bayCount: number,
): InstanceTransform[] {
  const bayWidth = bodyDepth / bayCount;
  return Array.from({ length: bayCount }, (_, index) => {
    const centerZ = -bodyDepth / 2 + (index + 0.5) * bayWidth;
    return [-1, 1].map((side): InstanceTransform => ({
      position: [side * (bodyWidth / 2 + 0.041), wallHeight * 0.48 + 0.08, centerZ],
      // Leave a gap for piers and for the 1.1x frame used at focused LOD.
      scale: [0.035, wallHeight * (index === 2 ? 0.68 : 0.36), bayWidth * 0.78],
      color: index === 2 ? '#334141' : '#68898b',
    }));
  }).flat();
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
    const color = new THREE.Color();
    let hasColors = false;
    items.forEach((item, index) => {
      position.fromArray(item.position);
      scale.fromArray(item.scale);
      euler.fromArray(item.rotation ?? [0, 0, 0]);
      quaternion.setFromEuler(euler);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      if (item.color) {
        mesh.setColorAt(index, color.set(item.color));
        hasColors = true;
      }
    });
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    if (hasColors && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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

function createGabledBodyGeometry(width: number, depth: number, wallHeight: number, roofRise: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width / 2, wallHeight);
  shape.lineTo(0, wallHeight + roofRise);
  shape.lineTo(-width / 2, wallHeight);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// eslint-disable-next-line react-refresh/only-export-components
export function createHipRoofGeometry(width: number, depth: number, rise: number) {
  // Equal-pitch hips meet the longitudinal ridge over the covered perimeter.
  const ridgeHalf = Math.max(0, (width - depth) / 2);
  const leftFront = [-width / 2, 0, depth / 2] as Vector3Tuple;
  const rightFront = [width / 2, 0, depth / 2] as Vector3Tuple;
  const rightBack = [width / 2, 0, -depth / 2] as Vector3Tuple;
  const leftBack = [-width / 2, 0, -depth / 2] as Vector3Tuple;
  const ridgeLeft = [-ridgeHalf, rise, 0] as Vector3Tuple;
  const ridgeRight = [ridgeHalf, rise, 0] as Vector3Tuple;
  const triangles = [
    leftFront, rightFront, ridgeRight, leftFront, ridgeRight, ridgeLeft,
    rightFront, rightBack, ridgeRight,
    rightBack, leftBack, ridgeLeft, rightBack, ridgeLeft, ridgeRight,
    leftBack, leftFront, ridgeLeft,
  ];
  const positions = triangles.flat();
  const uvs = triangles.flatMap(([x, , z]) => [x / width + 0.5, z / depth + 0.5]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createDirectionArrowGeometry(width: number, length: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.18, -length * 0.5);
  shape.lineTo(width * 0.18, -length * 0.5);
  shape.lineTo(width * 0.18, length * 0.08);
  shape.lineTo(width * 0.5, length * 0.08);
  shape.lineTo(0, length * 0.5);
  shape.lineTo(-width * 0.5, length * 0.08);
  shape.lineTo(-width * 0.18, length * 0.08);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function localPlanPoint(
  point: readonly [number, number],
  center: readonly [number, number],
  y = 0,
): Vector3Tuple {
  return [point[0] - center[0], y, point[1] - center[1]];
}

function segmentTransform(
  from: readonly [number, number],
  to: readonly [number, number],
  center: readonly [number, number],
  y: number,
  thickness: number,
): InstanceTransform {
  const localFrom = localPlanPoint(from, center);
  const localTo = localPlanPoint(to, center);
  const dx = localTo[0] - localFrom[0];
  const dz = localTo[2] - localFrom[2];
  return {
    position: [(localFrom[0] + localTo[0]) / 2, y, (localFrom[2] + localTo[2]) / 2],
    scale: [Math.hypot(dx, dz), thickness, thickness],
    rotation: [0, -Math.atan2(dz, dx), 0],
  };
}

export function PavilionNineLandmark({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: GateFourLandmarkProps) {
  const renderer = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const plan = GATE_FOUR_DISTRICT_LAYOUT.pavilion9;
  const width = Math.min(bounds.width, plan.width);
  const depth = Math.min(bounds.depth, plan.depth);
  const bodyWidth = Math.min(plan.bodyScale[0], width * 0.94);
  const bodyDepth = Math.min(plan.bodyScale[2], depth * 0.95);
  const roofRise = Math.min(plan.roof.ridgeHeight, height * 0.26);
  const wallHeight = Math.min(plan.bodyScale[1], height - roofRise - 0.1);
  const eave = Math.min(plan.roof.eaveOverhang, width * 0.06);
  const roofSlope = Math.hypot(bodyWidth / 2 + eave, roofRise);
  const roofPitch = Math.atan2(roofRise, bodyWidth / 2 + eave);
  const frontZ = bodyDepth / 2;
  const modelOffset = plan.visualOffset;

  const bodyGeometry = useMemo(
    () => createGabledBodyGeometry(bodyWidth, bodyDepth, wallHeight, roofRise),
    [bodyDepth, bodyWidth, roofRise, wallHeight],
  );
  const metalTexture = useMemo(() => createGateFourSurfaceTexture('metal-roof', anisotropy), [anisotropy]);
  const metalRoofMaterial = useMemo(
    () => createGateFourMappedMaterial(materials.roof, metalTexture, 0.68, 0.2),
    [materials.roof, metalTexture],
  );

  const roofItems = useMemo<InstanceTransform[]>(() => [
    {
      position: [-bodyWidth * 0.25 - eave * 0.25, wallHeight + roofRise * 0.5 + 0.08, 0],
      scale: [roofSlope, 0.085, bodyDepth + eave * 2.6],
      rotation: [0, 0, roofPitch],
    },
    {
      position: [bodyWidth * 0.25 + eave * 0.25, wallHeight + roofRise * 0.5 + 0.08, 0],
      scale: [roofSlope, 0.085, bodyDepth + eave * 2.6],
      rotation: [0, 0, -roofPitch],
    },
  ], [bodyDepth, bodyWidth, eave, roofPitch, roofRise, roofSlope, wallHeight]);

  const longitudinalModules = useMemo(
    () => Array.from({ length: plan.facade.longSideBayCount + 1 }, (_, index) => (
      -0.5 + index / plan.facade.longSideBayCount
    )),
    [plan.facade.longSideBayCount],
  );
  const facadePiers = useMemo<InstanceTransform[]>(() => [
    ...longitudinalModules.flatMap((ratio) => ([-1, 1].map((side) => ({
      position: [side * (bodyWidth / 2 + 0.018), wallHeight * 0.5 + 0.07, ratio * bodyDepth],
      scale: [0.065, wallHeight, 0.08],
    }) as InstanceTransform))),
    ...[-0.32, 0, 0.32].flatMap((ratio) => ([-1, 1].map((side) => ({
      position: [ratio * bodyWidth, wallHeight * 0.5 + 0.07, side * (bodyDepth / 2 + 0.018)],
      scale: [0.07, wallHeight, 0.065],
    }) as InstanceTransform))),
  ], [bodyDepth, bodyWidth, longitudinalModules, wallHeight]);

  const sideOpenings = useMemo(() => createPavilionNineSideOpenings(
    bodyWidth,
    bodyDepth,
    wallHeight,
    plan.facade.longSideBayCount,
  ), [bodyDepth, bodyWidth, plan.facade.longSideBayCount, wallHeight]);

  const endOpenings = useMemo<InstanceTransform[]>(() => [-1, 1].flatMap((side) => ([
    {
      position: [0, wallHeight * 0.42 + 0.07, side * (frontZ + 0.041)],
      scale: [bodyWidth * 0.38, wallHeight * 0.7, 0.035],
      color: '#334141',
    },
    {
      position: [-bodyWidth * 0.32, wallHeight * 0.57 + 0.07, side * (frontZ + 0.043)],
      scale: [bodyWidth * 0.15, wallHeight * 0.28, 0.038],
      color: '#68898b',
    },
    {
      position: [bodyWidth * 0.32, wallHeight * 0.57 + 0.07, side * (frontZ + 0.043)],
      scale: [bodyWidth * 0.15, wallHeight * 0.28, 0.038],
      color: '#68898b',
    },
  ] as InstanceTransform[])), [bodyWidth, frontZ, wallHeight]);

  const roofRibs = useMemo<InstanceTransform[]>(() => {
    const count = Math.max(9, Math.min(28, Math.round(bodyDepth / plan.roof.panelSpacing)));
    return Array.from({ length: count }, (_, index) => {
      const z = -bodyDepth / 2 + bodyDepth * index / Math.max(1, count - 1);
      return ([-1, 1].map((side) => ({
        position: [
          side * (bodyWidth * 0.25 + eave * 0.25),
          wallHeight + roofRise * 0.5 + 0.126,
          z,
        ] as Vector3Tuple,
        scale: [roofSlope * 0.96, 0.018, 0.022] as Vector3Tuple,
        rotation: [0, 0, side < 0 ? roofPitch : -roofPitch] as Vector3Tuple,
      }))).flat();
    }).flat();
  }, [bodyDepth, bodyWidth, eave, plan.roof.panelSpacing, roofPitch, roofRise, roofSlope, wallHeight]);

  const eaveItems = useMemo<InstanceTransform[]>(() => [
    { position: [0, wallHeight + roofRise + 0.13, 0], scale: [0.065, 0.065, bodyDepth + eave * 2.45] },
    { position: [-bodyWidth / 2 - eave * 0.72, wallHeight + 0.07, 0], scale: [0.06, 0.07, bodyDepth + eave * 2.4] },
    { position: [bodyWidth / 2 + eave * 0.72, wallHeight + 0.07, 0], scale: [0.06, 0.07, bodyDepth + eave * 2.4] },
  ], [bodyDepth, bodyWidth, eave, roofRise, wallHeight]);

  const focusFrames = useMemo<InstanceTransform[]>(() => sideOpenings.map((opening) => ({
    position: [opening.position[0] * 1.001, opening.position[1], opening.position[2]],
    scale: [0.028, opening.scale[1] * 1.08, opening.scale[2] * 1.1],
  })), [sideOpenings]);

  useEffect(() => () => {
    bodyGeometry.dispose();
    metalTexture.dispose();
    metalRoofMaterial.dispose();
  }, [bodyGeometry, metalRoofMaterial, metalTexture]);

  useEffect(() => {
    renderer.shadowMap.needsUpdate = true;
    invalidate();
  }, [invalidate, renderer, showDetail, showFocusDetail]);

  return (
    <group position={[modelOffset[0], 0, modelOffset[1]]} dispose={null}>
      <mesh
        geometry={UNIT_BOX}
        material={materials.platform}
        position={[0, 0.055, 0]}
        scale={[width * 0.97, 0.11, depth * 0.97]}
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <mesh
        geometry={bodyGeometry}
        material={materials.wall}
        position={[0, 0.1, 0]}
        castShadow
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <InstancedBatch material={metalRoofMaterial} items={roofItems} castShadow receiveShadow />
      <InstancedBatch material={materials.trim} items={facadePiers} />
      <InstancedBatch material={materials.glass} items={sideOpenings} />
      <InstancedBatch material={materials.dark} items={endOpenings} />
      <InstancedBatch material={materials.metal} items={eaveItems} />
      <InstancedBatch material={materials.accent} items={[
        { position: [0, wallHeight * 0.15 + 0.08, frontZ + 0.047], scale: [bodyWidth * 0.92, 0.075, 0.035] },
        { position: [0, wallHeight * 0.15 + 0.08, -frontZ - 0.047], scale: [bodyWidth * 0.92, 0.075, 0.035] },
      ]} />
      {showDetail && <InstancedBatch material={materials.metal} items={roofRibs} />}
      {showDetail && <InstancedBatch material={materials.trim} items={[
        { position: [0, wallHeight * 0.85 + 0.08, frontZ + 0.055], scale: [bodyWidth * 0.92, 0.055, 0.03] },
        { position: [0, wallHeight * 0.85 + 0.08, -frontZ - 0.055], scale: [bodyWidth * 0.92, 0.055, 0.03] },
      ]} />}
      {showFocusDetail && <InstancedBatch material={materials.trim} items={focusFrames} />}
      {showFocusDetail && <InstancedBatch material={materials.metal} items={longitudinalModules.map((ratio) => ({
        position: [0, 0.14, ratio * bodyDepth] as Vector3Tuple,
        scale: [bodyWidth * 0.9, 0.025, 0.025] as Vector3Tuple,
      }))} />}
    </group>
  );
}

export function CrioulosCenterLandmark({
  materials,
  showDetail,
  showFocusDetail,
}: GateFourLandmarkProps) {
  const renderer = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const plan = GATE_FOUR_DISTRICT_LAYOUT.crioulos;
  const architecture = useMemo(resolveCrioulosArchitectureEnvelope, []);
  const { floor, roof, columns, beams, chimney } = architecture;
  const modelOffset = plan.visualOffset;
  const buildingWidth = plan.bodyScale[0];
  const buildingDepth = plan.bodyScale[2];
  const buildingX = 0;
  const buildingZ = 0;
  const wallHeight = architecture.wallHeight;
  const roofRise = plan.roof.ridgeHeight;
  const frontZ = buildingZ + buildingDepth / 2;
  const sideX = buildingX + buildingWidth / 2;
  const roofWidth = roof.width;
  const roofDepth = roof.depth;
  const arenaRadiusX = plan.arena.radiusX;
  const arenaRadiusZ = plan.arena.radiusZ;
  const arenaCenter = localPlanPoint(plan.arena.center, plan.center);
  const thresholdPosition = localPlanPoint(plan.access.threshold, plan.center);

  const brickTexture = useMemo(() => createGateFourSurfaceTexture('brick', anisotropy), [anisotropy]);
  const ceramicTexture = useMemo(() => createGateFourSurfaceTexture('ceramic-roof', anisotropy), [anisotropy]);
  const brickMaterial = useMemo(
    () => createGateFourMappedMaterial(materials.wall, brickTexture, 0.97, 0),
    [brickTexture, materials.wall],
  );
  const ceramicMaterial = useMemo(
    () => createGateFourMappedMaterial(materials.roof, ceramicTexture, 0.94, 0),
    [ceramicTexture, materials.roof],
  );
  const roofGeometry = useMemo(
    () => createHipRoofGeometry(roofWidth, roofDepth, roofRise),
    [roofDepth, roofRise, roofWidth],
  );
  const arenaGeometry = useMemo(() => new THREE.CircleGeometry(1, 40), []);
  const arenaRailGeometry = useMemo(
    () => new THREE.TorusGeometry(1, 0.009, 5, 48),
    [],
  );

  const verandaColumns = useMemo<InstanceTransform[]>(() => [
    ...columns.front,
    ...columns.west,
  ].map(([x, z]) => ({
    position: [x, columns.centerY, z],
    scale: [columns.width, columns.height, columns.width],
  })), [columns]);

  const timberStructure = useMemo<InstanceTransform[]>(() => [
    // Continuous dark soffit closes the hips and meets both the walls and beams.
    {
      position: [roof.center[0], (roof.soffitBottomY + roof.eaveY) / 2, roof.center[1]],
      scale: [roof.width, plan.roof.soffitThickness, roof.depth],
    },
    ...[roof.minZ, roof.maxZ].map((z) => ({
      position: [roof.center[0], roof.eaveY - plan.roof.fasciaHeight / 2, z] as Vector3Tuple,
      scale: [roof.width, plan.roof.fasciaHeight, 0.025] as Vector3Tuple,
    })),
    ...[roof.minX, roof.maxX].map((x) => ({
      position: [x, roof.eaveY - plan.roof.fasciaHeight / 2, roof.center[1]] as Vector3Tuple,
      scale: [0.025, plan.roof.fasciaHeight, roof.depth] as Vector3Tuple,
    })),
    {
      position: [(floor.minX + floor.maxX) / 2, (beams.topY + beams.bottomY) / 2, columns.front[0][1]],
      scale: [floor.maxX - floor.minX, plan.veranda.beamHeight, columns.width],
    },
    {
      position: [columns.west[0][0], (beams.topY + beams.bottomY) / 2, (floor.minZ + floor.maxZ) / 2],
      scale: [columns.width, plan.veranda.beamHeight, floor.maxZ - floor.minZ],
    },
  ], [beams, columns, floor, plan.roof.fasciaHeight, plan.roof.soffitThickness, plan.veranda.beamHeight, roof]);

  const openings = useMemo<InstanceTransform[]>(() => [
    {
      position: [buildingX - buildingWidth * 0.28, floor.topY + wallHeight * 0.43, frontZ + 0.014],
      scale: [buildingWidth * 0.15, wallHeight * 0.86, 0.028],
    },
    {
      position: [buildingX + buildingWidth * 0.02, floor.topY + wallHeight * 0.43, frontZ + 0.014],
      scale: [buildingWidth * 0.13, wallHeight * 0.86, 0.028],
    },
    {
      position: [buildingX + buildingWidth * 0.31, floor.topY + wallHeight * 0.44, frontZ + 0.014],
      scale: [buildingWidth * 0.14, wallHeight * 0.4, 0.028],
    },
    {
      position: [-sideX - 0.014, floor.topY + wallHeight * 0.44, buildingZ - buildingDepth * 0.18],
      scale: [0.028, wallHeight * 0.4, buildingDepth * 0.19],
    },
    {
      position: [-sideX - 0.014, floor.topY + wallHeight * 0.44, buildingZ + buildingDepth * 0.23],
      scale: [0.028, wallHeight * 0.4, buildingDepth * 0.19],
    },
    ...[-0.2, 0.24].map((ratio) => ({
      position: [sideX + 0.014, floor.topY + wallHeight * 0.68, buildingDepth * ratio] as Vector3Tuple,
      scale: [0.028, wallHeight * 0.18, buildingDepth * 0.22] as Vector3Tuple,
    })),
  ], [buildingDepth, buildingWidth, buildingX, buildingZ, floor.topY, frontZ, sideX, wallHeight]);

  const steps = useMemo<InstanceTransform[]>(() => Array.from({ length: architecture.stairs.count }, (_, index) => ({
    position: [
      thresholdPosition[0],
      floor.baseY + (index + 1) * architecture.stairs.riserHeight / 2,
      floor.maxZ + (architecture.stairs.count - index - 0.5) * architecture.stairs.treadDepth,
    ] as Vector3Tuple,
    scale: [
      plan.access.width * 1.12,
      (index + 1) * architecture.stairs.riserHeight,
      architecture.stairs.treadDepth,
    ] as Vector3Tuple,
  })), [architecture.stairs, floor.baseY, floor.maxZ, plan.access.width, thresholdPosition]);

  const flagPolePositions = useMemo(
    () => plan.flagpoles.map((flagpole) => localPlanPoint(flagpole.position, plan.center)),
    [plan.center, plan.flagpoles],
  );
  const flagPoles = useMemo<InstanceTransform[]>(() => flagPolePositions.map((position, index) => ({
    position: [position[0], plan.flagpoles[index].height / 2 + plan.groundElevation, position[2]],
    scale: [0.019, plan.flagpoles[index].height, 0.019],
  })), [flagPolePositions, plan.flagpoles, plan.groundElevation]);
  const flags = useMemo<InstanceTransform[]>(() => flagPolePositions.map((position, index) => ({
    position: [
      position[0] + buildingWidth * 0.055,
      plan.groundElevation + plan.flagpoles[index].height * 0.87,
      position[2],
    ],
    scale: [buildingWidth * 0.11, plan.flagpoles[index].height * 0.105, 1],
    rotation: [0, index % 2 === 0 ? -0.08 : 0.08, 0],
    color: CRIOULOS_FLAG_COLORS[index],
  })), [buildingWidth, flagPolePositions, plan.flagpoles, plan.groundElevation]);

  const arenaPosts = useMemo<InstanceTransform[]>(() => {
    const circumference = Math.PI * (3 * (arenaRadiusX + arenaRadiusZ)
      - Math.sqrt((3 * arenaRadiusX + arenaRadiusZ) * (arenaRadiusX + 3 * arenaRadiusZ)));
    const count = Math.max(18, Math.min(32, Math.ceil(circumference / plan.arena.fence.postSpacing)));
    return Array.from({ length: count }, (_, index) => {
      const angle = index / count * Math.PI * 2;
      return {
        position: [
          arenaCenter[0] + Math.cos(angle) * arenaRadiusX,
          plan.arena.fence.postHeight / 2 + plan.groundElevation,
          arenaCenter[2] + Math.sin(angle) * arenaRadiusZ,
        ],
        scale: [0.028, plan.arena.fence.postHeight, 0.028],
      };
    });
  }, [arenaCenter, arenaRadiusX, arenaRadiusZ, plan.arena.fence.postHeight, plan.arena.fence.postSpacing, plan.groundElevation]);

  const fenceItems = useMemo<InstanceTransform[]>(() => {
    const rails = plan.fence.segments.flatMap(([from, to]) => (
      Array.from({ length: plan.fence.railCount }, (_, railIndex) => segmentTransform(
        from as readonly [number, number],
        to as readonly [number, number],
        plan.center,
        plan.groundElevation + plan.fence.postHeight * (0.38 + railIndex * 0.4),
        0.025,
      ))
    ));
    const posts = plan.fence.segments.flatMap(([from, to]) => {
      const localFrom = localPlanPoint(from as readonly [number, number], plan.center);
      const localTo = localPlanPoint(to as readonly [number, number], plan.center);
      const dx = localTo[0] - localFrom[0];
      const dz = localTo[2] - localFrom[2];
      const count = Math.max(2, Math.ceil(Math.hypot(dx, dz) / plan.fence.postSpacing) + 1);
      return Array.from({ length: count }, (_, index) => {
        const t = index / Math.max(1, count - 1);
        return {
          position: [
            THREE.MathUtils.lerp(localFrom[0], localTo[0], t),
            plan.fence.postHeight / 2 + plan.groundElevation,
            THREE.MathUtils.lerp(localFrom[2], localTo[2], t),
          ] as Vector3Tuple,
          scale: [0.028, plan.fence.postHeight, 0.028] as Vector3Tuple,
        };
      });
    });
    return [...rails, ...posts];
  }, [plan.center, plan.fence, plan.groundElevation]);

  const accessItems = useMemo<InstanceTransform[]>(() => plan.access.centerline.slice(0, -1).map((from, index) => {
    const item = segmentTransform(
      from,
      plan.access.centerline[index + 1],
      plan.center,
      plan.groundElevation + 0.006,
      0.012,
    );
    return { ...item, scale: [item.scale[0], 0.012, plan.access.width] as Vector3Tuple };
  }), [plan.access.centerline, plan.access.width, plan.center, plan.groundElevation]);

  const signMarks = useMemo<InstanceTransform[]>(() => {
    const glyphs = [
      ['111', '100', '100', '100', '111'],
      ['111', '100', '100', '100', '111'],
      ['111', '100', '100', '100', '111'],
      ['101', '111', '111', '111', '101'],
      ['111', '100', '101', '101', '111'],
    ] as const;
    const cellWidth = buildingWidth * 0.012;
    const cellHeight = wallHeight * 0.036;
    const characterAdvance = cellWidth * 4;
    const totalWidth = characterAdvance * glyphs.length - cellWidth;
    return glyphs.flatMap((glyph, glyphIndex) => glyph.flatMap((row, rowIndex) => (
      [...row].flatMap((pixel, columnIndex) => pixel === '1' ? [{
        position: [
          buildingX + buildingWidth * 0.24 - totalWidth / 2
            + glyphIndex * characterAdvance + columnIndex * cellWidth,
          floor.topY + wallHeight * 0.8 + (2 - rowIndex) * cellHeight,
          frontZ + 0.047,
        ] as Vector3Tuple,
        scale: [cellWidth * 0.78, cellHeight * 0.76, 0.025] as Vector3Tuple,
      }] : [])
    )));
  }, [buildingWidth, buildingX, floor.topY, frontZ, wallHeight]);

  const windowFrames = useMemo<InstanceTransform[]>(() => openings.map((opening) => ({
    position: [opening.position[0], opening.position[1], opening.position[2] * 1.001],
    scale: [opening.scale[0] * 1.08, 0.035, opening.scale[2] * 1.08],
  })), [openings]);

  useEffect(() => () => {
    brickTexture.dispose();
    ceramicTexture.dispose();
    brickMaterial.dispose();
    ceramicMaterial.dispose();
    roofGeometry.dispose();
    arenaGeometry.dispose();
    arenaRailGeometry.dispose();
  }, [arenaGeometry, arenaRailGeometry, brickMaterial, brickTexture, ceramicMaterial, ceramicTexture, roofGeometry]);

  useEffect(() => {
    renderer.shadowMap.needsUpdate = true;
    invalidate();
  }, [invalidate, renderer, showDetail, showFocusDetail]);

  return (
    <group position={[modelOffset[0], 0, modelOffset[1]]} dispose={null}>
      <mesh
        geometry={UNIT_BOX}
        material={materials.green}
        position={[roof.center[0], plan.groundElevation - 0.001, roof.center[1]]}
        scale={[roof.width + 0.04, 0.006, roof.depth + 0.04]}
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <mesh
        geometry={arenaGeometry}
        material={materials.platform}
        position={[arenaCenter[0], plan.groundElevation + plan.arena.surfaceElevationOffset, arenaCenter[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[arenaRadiusX, arenaRadiusZ, 1]}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={UNIT_BOX}
        material={brickMaterial}
        position={[buildingX, floor.topY + wallHeight / 2, buildingZ]}
        scale={[buildingWidth, wallHeight, buildingDepth]}
        castShadow
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <mesh
        geometry={roofGeometry}
        material={ceramicMaterial}
        position={[roof.center[0], roof.eaveY, roof.center[1]]}
        castShadow
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <InstancedBatch material={materials.platform} items={[
        {
          position: [(floor.minX + floor.maxX) / 2, (floor.baseY + floor.topY) / 2, (floor.minZ + floor.maxZ) / 2],
          scale: [floor.maxX - floor.minX, floor.topY - floor.baseY, floor.maxZ - floor.minZ],
        },
      ]} receiveShadow />
      <InstancedBatch material={materials.accent} items={timberStructure} castShadow receiveShadow />
      <InstancedBatch material={brickMaterial} items={[
        ...verandaColumns,
        {
          position: [chimney.position[0], (chimney.baseY + chimney.topY) / 2, chimney.position[1]],
          scale: [plan.chimney.width, chimney.topY - chimney.baseY, plan.chimney.depth],
        },
      ]} castShadow />
      <InstancedBatch material={materials.dark} items={[
        ...openings,
        {
          position: [chimney.position[0], (chimney.topY + chimney.capTopY) / 2, chimney.position[1]],
          scale: [plan.chimney.width * 1.18, plan.chimney.capHeight, plan.chimney.depth * 1.18],
        },
        ...(showDetail ? fenceItems : []),
        {
          position: [buildingX + buildingWidth * 0.24, floor.topY + wallHeight * 0.8, frontZ + 0.029],
          scale: [buildingWidth * 0.25, wallHeight * 0.25, 0.03],
        },
      ]} />
      <InstancedBatch geometry={UNIT_CYLINDER} material={materials.metal} items={flagPoles} />
      <InstancedBatch geometry={UNIT_PLANE} material={materials.white} items={flags} />
      <InstancedBatch material={materials.platform} items={[...accessItems, ...steps]} receiveShadow />
      <InstancedBatch geometry={arenaRailGeometry} material={materials.dark} items={[
        {
          position: [arenaCenter[0], plan.groundElevation + plan.arena.fence.railHeight * 0.48, arenaCenter[2]],
          scale: [arenaRadiusX, arenaRadiusZ, 1],
          rotation: [Math.PI / 2, 0, 0],
        },
        ...(showDetail ? [{
          position: [arenaCenter[0], plan.groundElevation + plan.arena.fence.railHeight, arenaCenter[2]],
          scale: [arenaRadiusX, arenaRadiusZ, 1],
          rotation: [Math.PI / 2, 0, 0],
        } as InstanceTransform] : []),
      ]} />
      {showDetail && <InstancedBatch geometry={UNIT_CYLINDER} material={materials.dark} items={arenaPosts} />}
      {showDetail && <InstancedBatch material={materials.trim} items={signMarks} />}
      {showDetail && <InstancedBatch material={materials.accent} items={[
        {
          position: [buildingX, floor.topY + 0.018, frontZ + 0.02],
          scale: [buildingWidth * 0.98, 0.032, 0.024],
        },
        {
          position: [-sideX - 0.02, floor.topY + 0.018, buildingZ],
          scale: [0.024, 0.032, buildingDepth * 0.98],
        },
      ]} />}
      {showDetail && <InstancedBatch material={materials.trim} items={windowFrames} />}
      {showFocusDetail && <InstancedBatch material={materials.accent} items={openings.slice(0, 3).map((opening) => ({
        position: [opening.position[0], opening.position[1], opening.position[2] + 0.032],
        scale: [0.025, opening.scale[1] * 0.82, 0.022],
      }))} />}
      {showFocusDetail && <InstancedBatch material={materials.trim} items={[
        {
          position: [roof.center[0], roof.ridgeY + 0.008, roof.center[1]],
          scale: [roof.ridgeHalfLength * 2, 0.022, 0.036],
        },
      ]} />}
    </group>
  );
}

/** Thin facade layers stay outside the beam but inside its 0.05 hit-envelope margin. */
// eslint-disable-next-line react-refresh/only-export-components
export function resolveGateFourFacadeDepths(portalDepth: number, pierWidth: number) {
  const portalFaceZ = portalDepth * 0.42 + pierWidth * 0.5;
  const faceClearance = 0.004;
  const bandThickness = 0.024;
  const plaqueThickness = 0.02;
  const trimThickness = 0.014;
  const metalThickness = 0.024;
  const plaqueCenterZ = portalFaceZ + faceClearance + plaqueThickness * 0.5;
  return {
    portalFaceZ,
    band: { centerZ: portalFaceZ + faceClearance + bandThickness * 0.5, thickness: bandThickness },
    plaque: { centerZ: plaqueCenterZ, thickness: plaqueThickness },
    trim: {
      centerZ: plaqueCenterZ + plaqueThickness * 0.5 + 0.002 + trimThickness * 0.5,
      thickness: trimThickness,
    },
    metal: { centerZ: portalFaceZ + faceClearance + metalThickness * 0.5, thickness: metalThickness },
  };
}

export function GateFourLandmark({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: GateFourLandmarkProps) {
  const renderer = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const plan = GATE_FOUR_DISTRICT_LAYOUT.gate4;
  const width = Math.max(bounds.width, plan.width);
  const depth = Math.max(bounds.depth, plan.depth);
  const modelOffset = plan.visualOffset;
  const span = plan.width;
  const portalDepth = plan.depth;
  const pierWidth = Math.max(0.18, span * 0.13);
  const facadeDepths = useMemo(
    () => resolveGateFourFacadeDepths(portalDepth, pierWidth),
    [pierWidth, portalDepth],
  );
  const clearHalf = span * 0.31;
  const portalHeight = Math.min(height, plan.canopyHeight);
  const beamHeight = portalHeight - plan.portalClearHeight;
  const beamY = plan.portalClearHeight + beamHeight * 0.5;
  const guardWidth = Math.max(width * 0.25, 0.48);
  const guardDepth = Math.max(depth * 0.42, 0.5);
  const arrowGeometry = useMemo(
    () => createDirectionArrowGeometry(Math.min(span * 0.2, 0.38), Math.min(depth * 0.34, 0.62)),
    [depth, span],
  );

  const portalPiers = useMemo<InstanceTransform[]>(() => [-1, 1].flatMap((side) => (
    [-1, 1].map((depthSide) => ({
      position: [side * (clearHalf + pierWidth * 0.5), plan.portalClearHeight * 0.5 + 0.07, depthSide * portalDepth * 0.42],
      scale: [pierWidth, plan.portalClearHeight, pierWidth],
    }) as InstanceTransform)
  )), [clearHalf, pierWidth, plan.portalClearHeight, portalDepth]);

  const portalBeams = useMemo<InstanceTransform[]>(() => [
    { position: [0, beamY, portalDepth * 0.42], scale: [span, beamHeight, pierWidth] },
    { position: [0, beamY, -portalDepth * 0.42], scale: [span, beamHeight, pierWidth] },
    { position: [-(clearHalf + pierWidth * 0.5), beamY, 0], scale: [pierWidth, beamHeight, portalDepth] },
    { position: [clearHalf + pierWidth * 0.5, beamY, 0], scale: [pierWidth, beamHeight, portalDepth] },
  ], [beamHeight, beamY, clearHalf, pierWidth, portalDepth, span]);

  const goldBands = useMemo<InstanceTransform[]>(() => [-1, 1].flatMap((depthSide): InstanceTransform[] => [
    {
      position: [0, beamY + beamHeight * 0.4, depthSide * facadeDepths.band.centerZ],
      scale: [span * 0.94, beamHeight * 0.12, facadeDepths.band.thickness],
    },
    ...[-1, 1].map((side): InstanceTransform => ({
      position: [side * (clearHalf + pierWidth * 0.5), height * 0.13 + 0.07, depthSide * facadeDepths.band.centerZ],
      scale: [pierWidth * 1.08, height * 0.1, facadeDepths.band.thickness],
    })),
    {
      position: [0, beamY, depthSide * facadeDepths.plaque.centerZ],
      scale: [span * 0.38, beamHeight * 0.34, facadeDepths.plaque.thickness],
    },
    ...(showFocusDetail ? [-1, 1].map((side): InstanceTransform => ({
      position: [side * span * 0.19, beamY, depthSide * facadeDepths.trim.centerZ],
      scale: [0.045, beamHeight * 0.5, facadeDepths.trim.thickness],
    })) : []),
  ]), [beamHeight, beamY, clearHalf, facadeDepths, height, pierWidth, showFocusDetail, span]);

  const guardX = clearHalf + pierWidth + guardWidth * 0.52;
  const wallItems = useMemo<InstanceTransform[]>(() => [
    ...portalPiers,
    {
      position: [guardX, height * 0.18 + 0.07, portalDepth * 0.05],
      scale: [guardWidth, height * 0.36, guardDepth],
    },
  ], [guardDepth, guardWidth, guardX, height, portalDepth, portalPiers]);
  const curbItems = useMemo<InstanceTransform[]>(() => [-1, 1].map((side) => ({
    position: [side * (clearHalf + pierWidth * 0.5), 0.065, 0],
    scale: [pierWidth * 1.55, 0.1, depth * 0.92],
  })), [clearHalf, depth, pierWidth]);

  const bollards = useMemo<InstanceTransform[]>(() => [-1, 1].flatMap((side) => (
    [-0.34, 0.34].map((zRatio) => ({
      position: [side * (clearHalf - pierWidth * 0.72), 0.2, zRatio * depth],
      scale: [0.055, 0.34, 0.055],
      color: side > 0 ? '#e4c64e' : '#f0ead9',
    }) as InstanceTransform)
  )), [clearHalf, depth, pierWidth]);

  useEffect(() => () => arrowGeometry.dispose(), [arrowGeometry]);

  useEffect(() => {
    renderer.shadowMap.needsUpdate = true;
    invalidate();
  }, [invalidate, renderer, showDetail, showFocusDetail]);

  return (
    <group position={[modelOffset[0], 0, modelOffset[1]]} dispose={null}>
      <InstancedBatch material={materials.platform} items={curbItems} receiveShadow />
      <InstancedBatch material={materials.wall} items={wallItems} castShadow receiveShadow />
      <InstancedBatch material={materials.green} items={portalBeams} castShadow />
      <InstancedBatch material={materials.accent} items={goldBands} />
      <mesh
        geometry={UNIT_BOX}
        material={materials.glass}
        position={[guardX - guardWidth * 0.22, height * 0.22 + 0.07, portalDepth * 0.05 - guardDepth * 0.51]}
        scale={[guardWidth * 0.42, height * 0.15, 0.035]}
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <mesh
        geometry={UNIT_BOX}
        material={materials.roof}
        position={[guardX, height * 0.38 + 0.08, portalDepth * 0.05]}
        scale={[guardWidth * 1.22, 0.095, guardDepth * 1.18]}
        castShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      {showDetail && <InstancedBatch geometry={UNIT_CYLINDER} material={materials.white} items={bollards} />}
      {showDetail && <InstancedBatch material={materials.metal} items={[-1, 1].flatMap((depthSide) => (
        [-1, 1].map((side): InstanceTransform => ({
          position: [side * clearHalf, height * 0.48, depthSide * facadeDepths.metal.centerZ],
          scale: [0.035, height * 0.34, facadeDepths.metal.thickness],
        }))
      ))} />}
      {showFocusDetail && <InstancedBatch
        geometry={arrowGeometry}
        material={materials.white}
        items={[
          {
            position: [-clearHalf * 0.48, 0.122, -depth * 0.12],
            scale: [1, 1, 1],
          },
          {
            position: [clearHalf * 0.48, 0.123, depth * 0.12],
            scale: [1, 1, 1],
            rotation: [0, Math.PI, 0],
          },
        ]}
      />}
    </group>
  );
}
