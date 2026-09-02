import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  LIVESTOCK_TENT_RENDER_BUDGET,
  createLivestockTentLayout,
  livestockTentFramePositions,
} from '../../utils/livestockTent';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';
import type { StrategicLandmarkBounds } from '../../utils/landmarks';

const NO_RAYCAST = () => undefined;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

type Vector3Tuple = [number, number, number];

interface InstanceTransform {
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
}

export interface LivestockTentMaterials {
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

function TentInstances({
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

  useLayoutEffect(() => {
    const mesh = ref.current;
    return () => disposeInstancedMesh(mesh);
  }, []);

  if (!items.length) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      raycast={NO_RAYCAST}
      frustumCulled
      dispose={null}
    />
  );
}

function beamAlongXy(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  z: number,
  thickness: number,
): InstanceTransform {
  const dx = endX - startX;
  const dy = endY - startY;
  return {
    position: [(startX + endX) / 2, (startY + endY) / 2, z],
    scale: [Math.hypot(dx, dy), thickness, thickness],
    rotation: [0, 0, Math.atan2(dy, dx)],
  };
}

function createIdentityTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = LIVESTOCK_TENT_RENDER_BUDGET.identityTextureWidth;
  canvas.height = LIVESTOCK_TENT_RENDER_BUDGET.identityTextureHeight;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#f4efe3';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#6b4a2c';
  context.fillRect(0, 0, 14, canvas.height);
  context.fillStyle = '#2f4a3a';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.font = '800 26px Arial, sans-serif';
  context.fillText('TENDA DA', 32, 42);
  context.fillStyle = '#8a4e2c';
  context.font = '900 38px Arial, sans-serif';
  context.fillText('PECUÁRIA', 32, 84);
  context.fillStyle = '#6a6f68';
  context.font = '700 12px Arial, sans-serif';
  context.fillText('D4  ·  FENASOJA  ·  ESTRUTURA ABERTA', 248, 108);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function LivestockTentIdentitySign({
  layout,
  frameMaterial,
}: {
  layout: ReturnType<typeof createLivestockTentLayout>;
  frameMaterial: THREE.Material;
}) {
  const texture = useMemo(() => createIdentityTexture(), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: texture ? '#ffffff' : '#f4efe3',
    map: texture,
    roughness: 0.76,
    metalness: 0,
  }), [texture]);

  useEffect(() => () => {
    texture?.dispose();
    material.dispose();
  }, [material, texture]);

  const signWidth = Math.min(1.42, layout.fillWidth * 0.64);
  const signHeight = Math.max(0.28, signWidth * 0.28);
  return (
    <group
      name="tenda-pecuaria-d4-identidade"
      position={[0, layout.eaveHeight + layout.roofRise * 0.18, layout.frontZ + 0.012]}
      raycast={NO_RAYCAST}
    >
      <mesh
        geometry={UNIT_BOX}
        material={frameMaterial}
        position={[0, 0, -0.018]}
        scale={[signWidth + 0.07, signHeight + 0.07, 0.055]}
        castShadow
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={UNIT_PLANE}
        material={material}
        position={[0, 0, 0.016]}
        scale={[signWidth, signHeight, 1]}
        raycast={NO_RAYCAST}
      />
    </group>
  );
}

export const LivestockTent = memo(function LivestockTent({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: {
  bounds: Pick<StrategicLandmarkBounds, 'width' | 'depth'>;
  height: number;
  materials: LivestockTentMaterials;
  showDetail: boolean;
  showFocusDetail: boolean;
}) {
  const layout = useMemo(
    () => createLivestockTentLayout(bounds, height),
    [bounds, height],
  );
  const lightMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#fff1c4',
    emissive: '#ffbf69',
    emissiveIntensity: 0.95,
    roughness: 0.48,
    metalness: 0,
    toneMapped: false,
  }), []);

  useEffect(() => () => lightMaterial.dispose(), [lightMaterial]);

  const architecture = useMemo(() => {
    const columns: InstanceTransform[] = [];
    const beams: InstanceTransform[] = [];
    const roofFaces: InstanceTransform[] = [];
    const ridgeCaps: InstanceTransform[] = [];
    const valances: InstanceTransform[] = [];
    const rails: InstanceTransform[] = [];
    const lights: InstanceTransform[] = [];
    const seams: InstanceTransform[] = [];
    const frames = livestockTentFramePositions(layout);
    const sideX = layout.columnSpan / 2;
    const eaveX = layout.roofHalfSpan * 0.96;

    frames.forEach((z) => {
      [-1, 1].forEach((side) => {
        columns.push({
          position: [
            side * sideX,
            layout.platformHeight + layout.eaveHeight / 2,
            z,
          ],
          scale: [layout.columnThickness, layout.eaveHeight, layout.columnThickness],
        });
        beams.push(beamAlongXy(
          side * eaveX,
          layout.eaveHeight,
          0,
          layout.height,
          z,
          layout.beamThickness,
        ));
        beams.push(beamAlongXy(
          side * eaveX * 0.48,
          layout.eaveHeight + layout.roofRise * 0.46,
          0,
          layout.eaveHeight,
          z,
          layout.beamThickness * 0.72,
        ));
      });
      beams.push({
        position: [0, layout.eaveHeight, z],
        scale: [layout.columnSpan, layout.beamThickness, layout.beamThickness],
      });
      beams.push({
        position: [0, layout.eaveHeight + layout.roofRise / 2, z],
        scale: [layout.beamThickness, layout.roofRise, layout.beamThickness],
      });
    });

    beams.push({
      position: [0, layout.height - layout.beamThickness * 0.15, 0],
      scale: [layout.beamThickness * 1.15, layout.beamThickness * 1.15, layout.fillDepth],
    });
    [-1, 1].forEach((side) => {
      beams.push({
        position: [side * sideX, layout.eaveHeight, 0],
        scale: [layout.beamThickness, layout.beamThickness, layout.fillDepth],
      });
    });

    [-1, 1].forEach((side) => {
      roofFaces.push({
        position: [
          side * layout.roofHalfSpan / 2,
          layout.eaveHeight + layout.roofRise / 2,
          0,
        ],
        scale: [layout.roofSlopeLength + 0.02, layout.roofThickness, layout.roofDepth],
        rotation: [0, 0, -side * layout.roofAngle],
      });
    });
    ridgeCaps.push({
      position: [0, layout.height + layout.roofThickness * 0.28, 0],
      scale: [layout.ridgeWidth, layout.roofThickness * 0.85, layout.roofDepth + 0.02],
    });

    if (showDetail) {
      [-1, 1].forEach((side) => {
        valances.push({
          position: [
            side * (layout.roofHalfSpan - 0.012),
            layout.eaveHeight - layout.valanceHeight / 2,
            0,
          ],
          scale: [0.028, layout.valanceHeight, layout.fillDepth * 0.97],
        });
      });
      [0.28, 0.55, 0.82].forEach((slopeRatio) => {
        [-1, 1].forEach((side) => {
          beams.push({
            position: [
              side * layout.roofHalfSpan * slopeRatio,
              layout.height - layout.roofRise * slopeRatio,
              0,
            ],
            scale: [
              layout.beamThickness * 0.68,
              layout.beamThickness * 0.68,
              layout.fillDepth * 0.96,
            ],
          });
        });
      });
      [0.4, 0.78].forEach((heightRatio) => {
        [-1, 1].forEach((side) => {
          rails.push({
            position: [
              side * sideX,
              layout.platformHeight + layout.railHeight * heightRatio,
              0,
            ],
            scale: [
              layout.beamThickness * 0.62,
              layout.beamThickness * 0.62,
              layout.fillDepth - layout.columnThickness * 1.4,
            ],
          });
        });
      });
      frames.slice(1, -1).forEach((z) => {
        lights.push({
          position: [0, layout.eaveHeight - 0.055, z],
          scale: [0.1, 0.038, 0.15],
        });
      });
    }

    if (showFocusDetail) {
      const seamCount = 7;
      for (let index = 1; index < seamCount; index += 1) {
        const z = -layout.roofDepth / 2 + layout.roofDepth * (index / seamCount);
        [-1, 1].forEach((side) => {
          seams.push({
            position: [
              side * layout.roofHalfSpan / 2,
              layout.eaveHeight + layout.roofRise / 2 + 0.018,
              z,
            ],
            scale: [layout.roofSlopeLength, 0.012, 0.014],
            rotation: [0, 0, -side * layout.roofAngle],
          });
        });
      }
    }

    return {
      columns,
      beams,
      roofFaces,
      ridgeCaps,
      valances,
      rails,
      lights,
      seams,
    };
  }, [layout, showDetail, showFocusDetail]);

  return (
    <group name="tenda-pecuaria-d4" raycast={NO_RAYCAST} dispose={null}>
      <mesh
        geometry={UNIT_BOX}
        material={materials.platform}
        position={[0, layout.platformHeight / 2, 0]}
        scale={[layout.fillWidth, layout.platformHeight, layout.fillDepth]}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <TentInstances
        material={materials.metal}
        items={architecture.columns}
        castShadow
      />
      <TentInstances
        material={materials.dark}
        items={architecture.beams}
        castShadow={showDetail}
      />
      <TentInstances
        material={materials.roof}
        items={architecture.roofFaces}
        castShadow
        receiveShadow
      />
      <TentInstances
        material={materials.trim}
        items={architecture.ridgeCaps}
        castShadow
      />
      {showDetail && (
        <>
          <TentInstances material={materials.wall} items={architecture.valances} />
          <TentInstances material={materials.metal} items={architecture.rails} />
          <TentInstances material={lightMaterial} items={architecture.lights} />
          <LivestockTentIdentitySign layout={layout} frameMaterial={materials.dark} />
        </>
      )}
      {showFocusDetail && (
        <TentInstances material={materials.white} items={architecture.seams} />
      )}
    </group>
  );
});
