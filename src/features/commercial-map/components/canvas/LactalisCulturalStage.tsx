import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  LACTALIS_STAGE_LAYOUT,
  lactalisStageModelDimensions,
} from '../../utils/lactalisStage';
import type { StrategicLandmarkBounds } from '../../utils/landmarks';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';

const NO_RAYCAST = () => undefined;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const UNIT_SPHERE = new THREE.SphereGeometry(0.5, 10, 8);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

type Vector3Tuple = [number, number, number];

interface InstanceTransform {
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
}

export interface LactalisStageMaterialSet {
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

function ScaledInstances({
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
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const object = new THREE.Object3D();
    items.forEach((item, index) => {
      object.position.set(...item.position);
      object.rotation.set(...(item.rotation ?? [0, 0, 0]));
      object.scale.set(...item.scale);
      object.updateMatrix();
      ref.current?.setMatrixAt(index, object.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingBox();
    ref.current.computeBoundingSphere();
  }, [items]);
  useEffect(() => {
    const mesh = ref.current;
    return () => disposeInstancedMesh(mesh);
  }, [items.length]);
  if (items.length === 0) return null;
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

function createGableGeometry(width: number, rise: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const thickness = LACTALIS_STAGE_LAYOUT.architecture.claddingThickness;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.translate(0, 0, -thickness / 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createCorrugatedNormalTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const derivative = Math.cos(x / size * Math.PI * 16) * 0.62;
      const inverseLength = 1 / Math.hypot(derivative, 1);
      data[offset] = Math.round((-derivative * inverseLength * 0.5 + 0.5) * 255);
      data[offset + 1] = 128;
      data[offset + 2] = Math.round((inverseLength * 0.5 + 0.5) * 255);
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = 'LactalisStage:corrugated-normal';
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(13, 5);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function StageIdentityPanel({ width, height, position }: {
  width: number;
  height: number;
  position: Vector3Tuple;
}) {
  const { texture, material } = useMemo(() => {
    let canvasTexture: THREE.CanvasTexture | null = null;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 768;
      canvas.height = canvas.width / LACTALIS_STAGE_LAYOUT.signage.aspectRatio;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = LACTALIS_STAGE_LAYOUT.palette.sign;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#c9ab4b';
        context.fillRect(18, 28, 6, canvas.height - 56);
        context.fillStyle = '#ffffff';
        context.textBaseline = 'middle';
        context.textAlign = 'left';
        context.font = '700 56px Arial, sans-serif';
        context.fillText('PALCO', 58, 130);
        context.font = '800 66px Arial, sans-serif';
        context.fillText('CULTURAL', 58, 202);
        context.textAlign = 'center';
        context.font = '700 31px Arial, sans-serif';
        context.fillText('LACTALIS', 622, 96);
        context.strokeStyle = '#ffffff';
        context.lineWidth = 3;
        context.beginPath();
        context.ellipse(622, 97, 101, 38, -0.08, 0, Math.PI * 2);
        context.stroke();
        canvasTexture = new THREE.CanvasTexture(canvas);
        canvasTexture.name = 'LactalisStage:identity-sign';
        canvasTexture.colorSpace = THREE.SRGBColorSpace;
        canvasTexture.anisotropy = 4;
        canvasTexture.generateMipmaps = true;
        canvasTexture.minFilter = THREE.LinearMipmapLinearFilter;
      }
    }
    return {
      texture: canvasTexture,
      material: new THREE.MeshStandardMaterial({
        color: canvasTexture ? '#ffffff' : LACTALIS_STAGE_LAYOUT.palette.sign,
        map: canvasTexture,
        roughness: 0.88,
        metalness: 0,
      }),
    };
  }, []);

  useEffect(() => () => {
    texture?.dispose();
    material.dispose();
  }, [material, texture]);

  return (
    <mesh
      name="palco-cultural-lactalis-signage"
      geometry={UNIT_PLANE}
      material={material}
      position={position}
      scale={[width, height, 1]}
      raycast={NO_RAYCAST}
      dispose={null}
    />
  );
}

function diagonalBrace(
  start: readonly [number, number],
  end: readonly [number, number],
  z: number,
  thickness: number,
): InstanceTransform {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  return {
    position: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, z],
    scale: [Math.hypot(dx, dy), thickness, thickness],
    rotation: [0, 0, Math.atan2(dy, dx)],
  };
}

export function LactalisCulturalStage({
  bounds,
  materials,
  showDetail,
  showFocusDetail,
}: {
  bounds: StrategicLandmarkBounds;
  materials: LactalisStageMaterialSet;
  showDetail: boolean;
  showFocusDetail: boolean;
}) {
  const model = useMemo(
    () => lactalisStageModelDimensions(bounds.width, bounds.depth),
    [bounds.depth, bounds.width],
  );
  const width = model.width;
  const depth = model.depth;
  const eaveHeight = LACTALIS_STAGE_LAYOUT.architecture.eaveHeight;
  const ridgeHeight = LACTALIS_STAGE_LAYOUT.architecture.ridgeHeight;
  const rise = ridgeHeight - eaveHeight;
  const column = Math.max(
    LACTALIS_STAGE_LAYOUT.architecture.minimumColumnThickness,
    width * LACTALIS_STAGE_LAYOUT.architecture.columnThicknessRatio,
  );
  const overhang = width * LACTALIS_STAGE_LAYOUT.architecture.roofOverhangRatio;
  const frontZ = depth / 2;
  const rearZ = -depth / 2;
  const roofPitch = Math.atan2(rise, width / 2 + overhang);
  const roofSlope = Math.hypot(width / 2 + overhang, rise);
  const roofThickness = LACTALIS_STAGE_LAYOUT.architecture.roofThickness;
  const apronDepth = LACTALIS_STAGE_LAYOUT.architecture.audienceApronDepth;
  const floorThickness = LACTALIS_STAGE_LAYOUT.architecture.floorThickness;
  const fasciaDepth = LACTALIS_STAGE_LAYOUT.architecture.fasciaDepth;
  const signWidth = width * LACTALIS_STAGE_LAYOUT.signage.widthRatio;
  const signHeight = signWidth / LACTALIS_STAGE_LAYOUT.signage.aspectRatio;
  const signSupportZ = frontZ + LACTALIS_STAGE_LAYOUT.architecture.claddingThickness / 2 + 0.035;
  const corrugatedNormal = useMemo(createCorrugatedNormalTexture, []);
  const gableGeometry = useMemo(() => createGableGeometry(width, rise), [rise, width]);
  const lightingMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: LACTALIS_STAGE_LAYOUT.palette.light,
    emissive: LACTALIS_STAGE_LAYOUT.palette.light,
    emissiveIntensity: 0.72,
    roughness: 0.56,
    metalness: 0.03,
    toneMapped: true,
  }), []);

  useLayoutEffect(() => {
    const roofNormal = materials.roof.normalMap;
    const wallNormal = materials.wall.normalMap;
    const roofScale = materials.roof.normalScale.clone();
    const wallScale = materials.wall.normalScale.clone();
    materials.roof.normalMap = corrugatedNormal;
    materials.roof.normalScale.set(0.24, 0.24);
    materials.wall.normalMap = corrugatedNormal;
    materials.wall.normalScale.set(0.16, 0.16);
    materials.roof.needsUpdate = true;
    materials.wall.needsUpdate = true;
    return () => {
      materials.roof.normalMap = roofNormal;
      materials.roof.normalScale.copy(roofScale);
      materials.wall.normalMap = wallNormal;
      materials.wall.normalScale.copy(wallScale);
      materials.roof.needsUpdate = true;
      materials.wall.needsUpdate = true;
    };
  }, [corrugatedNormal, materials.roof, materials.wall]);
  // Owned resources outlive material binding changes; shared parent materials
  // and unit geometries are never disposed by this architectural child.
  useEffect(() => () => corrugatedNormal.dispose(), [corrugatedNormal]);
  useEffect(() => () => gableGeometry.dispose(), [gableGeometry]);
  useEffect(() => () => lightingMaterial.dispose(), [lightingMaterial]);

  const shellPanels = useMemo<InstanceTransform[]>(() => [
    { position: [0, eaveHeight * 0.48, rearZ + column * 0.4], scale: [width, eaveHeight * 0.92, column * 0.78] },
    ...[-1, 1].map((side): InstanceTransform => ({
      position: [side * (width / 2 - column * 0.42), eaveHeight * 0.49, rearZ + depth * LACTALIS_STAGE_LAYOUT.architecture.sideEnclosureDepthRatio / 2],
      scale: [column * 0.78, eaveHeight * 0.86, depth * LACTALIS_STAGE_LAYOUT.architecture.sideEnclosureDepthRatio],
    })),
    { position: [0, eaveHeight - fasciaDepth / 2, frontZ], scale: [width, fasciaDepth, LACTALIS_STAGE_LAYOUT.architecture.claddingThickness] },
    // Thin front-sheet ribs have the exact gable profile and remain present at
    // every LOD; normals supply the finer folds between these structural ribs.
    ...Array.from({ length: 31 }, (_, index): InstanceTransform => {
      const ratio = (index + 1) / 32 - 0.5;
      const ribHeight = fasciaDepth + rise * (1 - Math.abs(ratio) * 2) - 0.018;
      return {
        position: [ratio * width, eaveHeight - fasciaDepth + ribHeight / 2, frontZ + LACTALIS_STAGE_LAYOUT.architecture.claddingThickness / 2 + 0.007],
        scale: [width * 0.0042, ribHeight, 0.012],
      };
    }),
  ], [column, depth, eaveHeight, fasciaDepth, frontZ, rearZ, rise, width]);
  const roofPanels = useMemo<InstanceTransform[]>(() => [
    { position: [-width / 4 - overhang / 2, eaveHeight + rise / 2 - roofThickness * Math.cos(roofPitch) / 2, 0], scale: [roofSlope, roofThickness, depth + overhang * 2], rotation: [0, 0, roofPitch] },
    { position: [width / 4 + overhang / 2, eaveHeight + rise / 2 - roofThickness * Math.cos(roofPitch) / 2, 0], scale: [roofSlope, roofThickness, depth + overhang * 2], rotation: [0, 0, -roofPitch] },
  ], [depth, eaveHeight, overhang, rise, roofPitch, roofSlope, roofThickness, width]);
  const columns = useMemo<InstanceTransform[]>(() => [-0.5, -1 / 6, 1 / 6, 0.5].flatMap((ratio) => ([
    { position: [ratio * width, eaveHeight / 2, frontZ - column * 0.12], scale: [column, eaveHeight, column] },
    { position: [ratio * width, eaveHeight / 2, rearZ + column * 0.12], scale: [column, eaveHeight, column] },
  ])), [column, eaveHeight, frontZ, rearZ, width]);
  const frameBeams = useMemo<InstanceTransform[]>(() => [
    ...columns,
    { position: [0, eaveHeight - column * 0.5, frontZ - column * 0.08], scale: [width + column, column, column] },
    { position: [0, eaveHeight - column * 0.5, rearZ + column * 0.08], scale: [width + column, column, column] },
    { position: [-width / 2, eaveHeight, 0], scale: [column, column, depth + overhang] },
    { position: [width / 2, eaveHeight, 0], scale: [column, column, depth + overhang] },
    { position: [0, ridgeHeight - column * 0.65, 0], scale: [column, column, depth + overhang * 1.5] },
    { position: [-width / 2 - overhang * 0.38, eaveHeight - 0.025, 0], scale: [column * 0.72, column * 0.72, depth + overhang * 2.05] },
    { position: [width / 2 + overhang * 0.38, eaveHeight - 0.025, 0], scale: [column * 0.72, column * 0.72, depth + overhang * 2.05] },
    diagonalBrace([-width / 2, eaveHeight * 0.55], [-width * 0.28, eaveHeight - column], frontZ - column * 0.18, column * 0.52),
    diagonalBrace([width / 2, eaveHeight * 0.55], [width * 0.28, eaveHeight - column], frontZ - column * 0.18, column * 0.52),
    { position: [0, eaveHeight + LACTALIS_STAGE_LAYOUT.signage.centerAboveEave, signSupportZ], scale: [signWidth + 0.026, signHeight + 0.026, 0.018] },
  ], [column, columns, depth, eaveHeight, frontZ, overhang, rearZ, ridgeHeight, signHeight, signSupportZ, signWidth, width]);
  const floorPanels = useMemo<InstanceTransform[]>(() => [
    { position: [0, floorThickness / 2, 0], scale: [width + column, floorThickness, depth] },
    { position: [0, floorThickness / 2, frontZ + apronDepth / 2], scale: [width * LACTALIS_STAGE_LAYOUT.architecture.audienceApronWidthRatio, floorThickness, apronDepth] },
  ], [apronDepth, column, depth, floorThickness, frontZ, width]);
  const stagePlatform = useMemo<InstanceTransform[]>(() => [
    {
      position: [0, floorThickness + LACTALIS_STAGE_LAYOUT.architecture.platformHeight / 2, -depth * 0.2],
      scale: [width * LACTALIS_STAGE_LAYOUT.architecture.platformWidthRatio, LACTALIS_STAGE_LAYOUT.architecture.platformHeight, depth * LACTALIS_STAGE_LAYOUT.architecture.platformDepthRatio],
    },
  ], [depth, floorThickness, width]);
  const truss = useMemo<InstanceTransform[]>(() => {
    const trussY = eaveHeight * 0.89;
    const trussZ = -depth * 0.08;
    return [
      { position: [0, trussY, trussZ], scale: [width * 0.76, column * 0.42, column * 0.42] },
      { position: [0, trussY - column * 2.3, trussZ], scale: [width * 0.76, column * 0.42, column * 0.42] },
      ...[-0.36, -0.18, 0, 0.18, 0.36].flatMap((ratio, index) => ([
        { position: [ratio * width, trussY - column * 1.15, trussZ], scale: [column * 0.34, column * 2.6, column * 0.34] },
        diagonalBrace(
          [ratio * width - width * 0.075, trussY - column * 2.15],
          [ratio * width + width * 0.075, trussY - column * 0.15],
          trussZ + index * 0.0004,
          column * 0.28,
        ),
      ])),
    ];
  }, [column, depth, eaveHeight, width]);
  const speakers = useMemo<InstanceTransform[]>(() => {
    const speakerHeight = eaveHeight * 0.14;
    const stageTop = floorThickness + LACTALIS_STAGE_LAYOUT.architecture.platformHeight;
    return [-1, 1].flatMap((side) => [0, 1, 2].map((index) => ({
      position: [side * width * 0.34, stageTop + speakerHeight * (index + 0.5), -depth * 0.27] as Vector3Tuple,
      scale: [width * 0.11, speakerHeight, depth * 0.11] as Vector3Tuple,
      rotation: [0, side * -0.07, 0] as Vector3Tuple,
    })));
  }, [depth, eaveHeight, floorThickness, width]);
  const lights = useMemo<InstanceTransform[]>(() => [-0.3, -0.18, -0.06, 0.06, 0.18, 0.3].map((ratio, index) => ({
    position: [ratio * width, eaveHeight * 0.79, -depth * 0.045] as Vector3Tuple,
    scale: [width * 0.022, width * 0.022, width * 0.022] as Vector3Tuple,
    rotation: [0.18 + (index % 2) * 0.08, 0, 0] as Vector3Tuple,
  })), [depth, eaveHeight, width]);

  return (
    <group name="palco-cultural-lactalis-architecture" dispose={null} raycast={NO_RAYCAST}>
      <ScaledInstances material={materials.accent} items={floorPanels} receiveShadow />
      <ScaledInstances material={materials.wall} items={shellPanels} castShadow receiveShadow />
      <ScaledInstances material={materials.roof} items={roofPanels} castShadow receiveShadow />
      <ScaledInstances material={materials.metal} items={frameBeams} castShadow receiveShadow />
      <ScaledInstances material={materials.platform} items={stagePlatform} castShadow receiveShadow />
      <mesh
        geometry={gableGeometry}
        material={materials.wall}
        position={[0, eaveHeight, frontZ + column * 0.02]}
        raycast={NO_RAYCAST}
        castShadow
        receiveShadow
        dispose={null}
      />
      <mesh
        geometry={gableGeometry}
        material={materials.wall}
        position={[0, eaveHeight, rearZ]}
        raycast={NO_RAYCAST}
        castShadow
        receiveShadow
        dispose={null}
      />
      <mesh
        geometry={UNIT_BOX}
        material={materials.dark}
        position={[0, eaveHeight * 0.48, rearZ + column * 0.82]}
        scale={[width * 0.82, eaveHeight * 0.58, column * 0.45]}
        raycast={NO_RAYCAST}
        receiveShadow
        dispose={null}
      />
      <StageIdentityPanel
        width={signWidth}
        height={signHeight}
        position={[0, eaveHeight + LACTALIS_STAGE_LAYOUT.signage.centerAboveEave, signSupportZ + 0.012]}
      />

      {showDetail && (
        <>
          <ScaledInstances material={materials.metal} items={truss} castShadow />
          <ScaledInstances material={materials.dark} items={speakers} castShadow receiveShadow />
          <ScaledInstances geometry={UNIT_SPHERE} material={lightingMaterial} items={lights} />
          <ScaledInstances material={materials.white} items={[
            { position: [0, eaveHeight * 0.51, rearZ + column * 1.16], scale: [width * 0.42, eaveHeight * 0.28, column * 0.2] },
          ]} />
        </>
      )}

      {showFocusDetail && (
        <>
          <ScaledInstances geometry={UNIT_CYLINDER} material={materials.metal} items={[-0.25, 0, 0.25].map((ratio) => ({
            position: [ratio * width, eaveHeight * 0.79, -depth * 0.045] as Vector3Tuple,
            scale: [column * 0.52, column * 0.9, column * 0.52] as Vector3Tuple,
            rotation: [0, 0, Math.PI / 2] as Vector3Tuple,
          }))} />
        </>
      )}
    </group>
  );
}
