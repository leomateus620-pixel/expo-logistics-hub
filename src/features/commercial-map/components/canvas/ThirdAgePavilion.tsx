import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PARK_ACCESS_SPATIAL_PLAN } from '../../data/parkAccessSpatialPlan';
import {
  THIRD_AGE_PAVILION_LAYOUT,
  thirdAgePavilionEntranceAlongFacadeRatio,
} from '../../utils/thirdAgePavilion';

const NO_RAYCAST = () => undefined;

type Vector3Tuple = [number, number, number];

interface InstanceTransform {
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
}

export interface ThirdAgePavilionMaterials {
  wall: THREE.Material;
  roof: THREE.Material;
  trim: THREE.Material;
  dark: THREE.Material;
  platform: THREE.Material;
  metal: THREE.Material;
}

export interface ThirdAgePavilionProps {
  bounds: {
    width: number;
    depth: number;
  };
  height: number;
  materials: ThirdAgePavilionMaterials;
  showDetail: boolean;
}

function PavilionInstances({
  geometry,
  material,
  items,
  castShadow = false,
  receiveShadow = false,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  items: readonly InstanceTransform[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const object = new THREE.Object3D();
    items.forEach((item, index) => {
      object.position.set(...item.position);
      object.rotation.set(...(item.rotation ?? [0, 0, 0]));
      object.scale.set(...item.scale);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    invalidate();
  }, [invalidate, items]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      raycast={NO_RAYCAST}
      dispose={null}
    />
  );
}

function createGabledWallGeometry(
  width: number,
  depth: number,
  baseY: number,
  eaveY: number,
  ridgeY: number,
) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const vertices: number[] = [];

  const triangle = (
    first: Vector3Tuple,
    second: Vector3Tuple,
    third: Vector3Tuple,
  ) => vertices.push(...first, ...second, ...third);
  const quad = (
    first: Vector3Tuple,
    second: Vector3Tuple,
    third: Vector3Tuple,
    fourth: Vector3Tuple,
  ) => {
    triangle(first, second, third);
    triangle(first, third, fourth);
  };

  // Long walls.
  quad(
    [-halfWidth, baseY, halfDepth],
    [halfWidth, baseY, halfDepth],
    [halfWidth, eaveY, halfDepth],
    [-halfWidth, eaveY, halfDepth],
  );
  quad(
    [halfWidth, baseY, -halfDepth],
    [-halfWidth, baseY, -halfDepth],
    [-halfWidth, eaveY, -halfDepth],
    [halfWidth, eaveY, -halfDepth],
  );

  // End walls and conservative triangular gables below the two roof planes.
  quad(
    [-halfWidth, baseY, -halfDepth],
    [-halfWidth, baseY, halfDepth],
    [-halfWidth, eaveY, halfDepth],
    [-halfWidth, eaveY, -halfDepth],
  );
  triangle(
    [-halfWidth, eaveY, -halfDepth],
    [-halfWidth, eaveY, halfDepth],
    [-halfWidth, ridgeY, 0],
  );
  quad(
    [halfWidth, baseY, halfDepth],
    [halfWidth, baseY, -halfDepth],
    [halfWidth, eaveY, -halfDepth],
    [halfWidth, eaveY, halfDepth],
  );
  triangle(
    [halfWidth, eaveY, halfDepth],
    [halfWidth, eaveY, -halfDepth],
    [halfWidth, ridgeY, 0],
  );

  // Underside closes the lightweight envelope without adding an unseen ceiling.
  quad(
    [-halfWidth, baseY, -halfDepth],
    [halfWidth, baseY, -halfDepth],
    [halfWidth, baseY, halfDepth],
    [-halfWidth, baseY, halfDepth],
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function ThirdAgePavilion({
  bounds,
  height,
  materials,
  showDetail,
}: ThirdAgePavilionProps) {
  const unitBox = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const width = bounds.width * THIRD_AGE_PAVILION_LAYOUT.footprintFill.width;
  const depth = bounds.depth * THIRD_AGE_PAVILION_LAYOUT.footprintFill.depth;
  const foundationHeight = 0.07;
  const baseY = foundationHeight;
  const roofRise = Math.min(
    height * THIRD_AGE_PAVILION_LAYOUT.roof.riseRatio,
    depth * THIRD_AGE_PAVILION_LAYOUT.roof.maximumRiseToDepthRatio,
  );
  const ridgeY = height;
  const eaveY = ridgeY - roofRise;
  const roofOverhang = Math.min(width, depth)
    * THIRD_AGE_PAVILION_LAYOUT.roof.eaveOverhangRatio;
  const roofHalfRun = depth / 2 + roofOverhang;
  const roofPanelLength = Math.hypot(roofHalfRun, roofRise);
  const roofPitch = Math.atan2(roofRise, roofHalfRun);
  const roofWidth = width + roofOverhang * 2;
  const entranceX = thirdAgePavilionEntranceAlongFacadeRatio(
    PARK_ACCESS_SPATIAL_PLAN.thirdAgePavilionSetting,
  ) * width;
  const entranceWidth = width * THIRD_AGE_PAVILION_LAYOUT.entrance.widthRatio;
  const entranceHeight = (eaveY - baseY)
    * THIRD_AGE_PAVILION_LAYOUT.entrance.heightRatio;
  const thresholdDepth = depth * THIRD_AGE_PAVILION_LAYOUT.entrance.thresholdDepthRatio;

  const wallGeometry = useMemo(
    () => createGabledWallGeometry(width, depth, baseY, eaveY, ridgeY),
    [baseY, depth, eaveY, ridgeY, width],
  );
  const platformItems = useMemo<readonly InstanceTransform[]>(() => [
    {
      position: [0, foundationHeight / 2, 0],
      scale: [width + 0.12, foundationHeight, depth + 0.12],
    },
    {
      position: [entranceX, foundationHeight * 0.62, depth / 2 + thresholdDepth / 2],
      scale: [entranceWidth * 1.38, foundationHeight * 0.76, thresholdDepth],
    },
  ], [depth, entranceWidth, entranceX, foundationHeight, thresholdDepth, width]);
  const roofItems = useMemo<readonly InstanceTransform[]>(() => [
    {
      position: [0, eaveY + roofRise / 2, roofHalfRun / 2],
      rotation: [roofPitch, 0, 0],
      scale: [roofWidth, 0.055, roofPanelLength],
    },
    {
      position: [0, eaveY + roofRise / 2, -roofHalfRun / 2],
      rotation: [-roofPitch, 0, 0],
      scale: [roofWidth, 0.055, roofPanelLength],
    },
  ], [eaveY, roofHalfRun, roofPanelLength, roofPitch, roofRise, roofWidth]);
  const roofTrimItems = useMemo<readonly InstanceTransform[]>(() => [
    {
      position: [0, ridgeY + 0.025, 0],
      scale: [roofWidth, 0.045, 0.065],
    },
    {
      position: [0, eaveY + 0.012, roofHalfRun],
      scale: [roofWidth, 0.045, 0.055],
    },
    {
      position: [0, eaveY + 0.012, -roofHalfRun],
      scale: [roofWidth, 0.045, 0.055],
    },
  ], [eaveY, ridgeY, roofHalfRun, roofWidth]);
  const roofDetails = useMemo<readonly InstanceTransform[]>(() => (
    Array.from({ length: THIRD_AGE_PAVILION_LAYOUT.roof.detailCount }, (_, index) => ({
      position: [
        (-0.34 + index * 0.17) * width,
        ridgeY + 0.055,
        0,
      ] as Vector3Tuple,
      scale: [width * 0.055, 0.035, depth * 0.045] as Vector3Tuple,
    }))
  ), [depth, ridgeY, width]);

  useEffect(() => () => {
    unitBox.dispose();
    wallGeometry.dispose();
  }, [unitBox, wallGeometry]);

  return (
    <group dispose={null}>
      <PavilionInstances
        geometry={unitBox}
        material={materials.platform}
        items={platformItems}
        receiveShadow
      />
      <mesh
        geometry={wallGeometry}
        material={materials.wall}
        castShadow
        receiveShadow
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <PavilionInstances
        geometry={unitBox}
        material={materials.roof}
        items={roofItems}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={unitBox}
        material={materials.dark}
        position={[entranceX, baseY + entranceHeight / 2, depth / 2 + 0.022]}
        scale={[entranceWidth, entranceHeight, 0.04]}
        raycast={NO_RAYCAST}
        dispose={null}
      />
      <PavilionInstances
        geometry={unitBox}
        material={materials.trim}
        items={roofTrimItems}
      />
      {showDetail && (
        <PavilionInstances
          geometry={unitBox}
          material={materials.metal}
          items={roofDetails}
        />
      )}
    </group>
  );
}
