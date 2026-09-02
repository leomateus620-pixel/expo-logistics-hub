import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  VIA_EXPRESSA_RENDER_BUDGET,
  createViaExpressaLayout,
  viaExpressaFramePositions,
} from '../../utils/viaExpressa';
import { disposeInstancedMesh } from '../../utils/instancedMeshDisposal';
import type { StrategicLandmarkBounds } from '../../utils/landmarks';

const NO_RAYCAST = () => undefined;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 7);
const UNIT_CANOPY = new THREE.IcosahedronGeometry(0.5, 1);

type Vector3Tuple = [number, number, number];

interface InstanceTransform {
  position?: Vector3Tuple;
  scale?: Vector3Tuple;
  rotation?: Vector3Tuple;
  matrix?: THREE.Matrix4;
}

export interface ViaExpressaMaterials {
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

function PavilionInstances({
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
      if (item.matrix) {
        mesh.setMatrixAt(index, item.matrix);
        return;
      }
      object.position.set(...(item.position ?? [0, 0, 0]));
      object.rotation.set(...(item.rotation ?? [0, 0, 0]));
      object.scale.set(...(item.scale ?? [1, 1, 1]));
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

function beamBetween(
  start: Vector3Tuple,
  end: Vector3Tuple,
  thickness: number,
): InstanceTransform {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const direction = to.clone().sub(from);
  const length = Math.max(0.001, direction.length());
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(1, 0, 0),
    direction.normalize(),
  );
  const matrix = new THREE.Matrix4().compose(
    from.add(to).multiplyScalar(0.5),
    quaternion,
    new THREE.Vector3(length, thickness, thickness),
  );
  return { matrix };
}

function latticeColumn(
  x: number,
  z: number,
  baseY: number,
  topY: number,
  chordGap: number,
  chordThickness: number,
  braceThickness: number,
  segments: number,
): InstanceTransform[] {
  const items: InstanceTransform[] = [];
  const height = topY - baseY;
  const leftX = x - chordGap / 2;
  const rightX = x + chordGap / 2;
  items.push(
    {
      position: [leftX, baseY + height / 2, z],
      scale: [chordThickness, height, chordThickness],
    },
    {
      position: [rightX, baseY + height / 2, z],
      scale: [chordThickness, height, chordThickness],
    },
  );
  for (let index = 0; index <= segments; index += 1) {
    const y = baseY + height * (index / segments);
    items.push(beamBetween(
      [leftX, y, z],
      [rightX, y, z],
      braceThickness,
    ));
  }
  for (let index = 0; index < segments; index += 1) {
    const y0 = baseY + height * (index / segments);
    const y1 = baseY + height * ((index + 1) / segments);
    items.push(
      beamBetween([leftX, y0, z], [rightX, y1, z], braceThickness),
      beamBetween([rightX, y0, z], [leftX, y1, z], braceThickness),
    );
  }
  return items;
}

function createIdentityTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = VIA_EXPRESSA_RENDER_BUDGET.identityTextureWidth;
  canvas.height = VIA_EXPRESSA_RENDER_BUDGET.identityTextureHeight;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#1b1d1f';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const drawLogo = (cx: number, fill: string, ring: string) => {
    context.beginPath();
    context.arc(cx, canvas.height / 2, 28, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();
    context.beginPath();
    context.arc(cx, canvas.height / 2, 22, 0, Math.PI * 2);
    context.strokeStyle = ring;
    context.lineWidth = 3;
    context.stroke();
  };
  drawLogo(48, '#2f6b3c', '#d7c56a');
  drawLogo(canvas.width - 48, '#b73532', '#f2efe4');

  context.fillStyle = '#f4f1ea';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '800 42px Arial, sans-serif';
  context.fillText('VIA EXPRESSA', canvas.width / 2, canvas.height / 2 - 2);
  context.fillStyle = '#9aa19b';
  context.font = '700 11px Arial, sans-serif';
  context.fillText('D2  ·  FENASOJA  ·  PAVILHÃO ABERTO', canvas.width / 2, canvas.height - 16);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function ViaExpressaIdentitySign({
  layout,
  frameMaterial,
}: {
  layout: ReturnType<typeof createViaExpressaLayout>;
  frameMaterial: THREE.Material;
}) {
  const texture = useMemo(() => createIdentityTexture(), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: texture ? '#ffffff' : '#1b1d1f',
    map: texture,
    roughness: 0.62,
    metalness: 0.04,
  }), [texture]);

  useEffect(() => () => {
    texture?.dispose();
    material.dispose();
  }, [material, texture]);

  const signWidth = Math.min(1.55, layout.fillWidth * 0.58);
  const signHeight = Math.max(0.22, signWidth * 0.22);
  const signY = layout.eaveHeight + layout.roofRise * 0.42;
  return (
    <group
      name="via-expressa-d2-identidade"
      position={[0, signY, layout.frontZ + layout.roofThickness * 0.7 + 0.012]}
      raycast={NO_RAYCAST}
    >
      <mesh
        geometry={UNIT_BOX}
        material={frameMaterial}
        position={[0, 0, -0.014]}
        scale={[signWidth + 0.055, signHeight + 0.05, 0.042]}
        castShadow
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={UNIT_PLANE}
        material={material}
        position={[0, 0, 0.014]}
        scale={[signWidth, signHeight, 1]}
        raycast={NO_RAYCAST}
      />
    </group>
  );
}

export const ViaExpressa = memo(function ViaExpressa({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: {
  bounds: Pick<StrategicLandmarkBounds, 'width' | 'depth'>;
  height: number;
  materials: ViaExpressaMaterials;
  showDetail: boolean;
  showFocusDetail: boolean;
}) {
  const layout = useMemo(
    () => createViaExpressaLayout(bounds, height),
    [bounds, height],
  );

  const architecture = useMemo(() => {
    const lattice: InstanceTransform[] = [];
    const beams: InstanceTransform[] = [];
    const roofFaces: InstanceTransform[] = [];
    const ridgeCaps: InstanceTransform[] = [];
    const purlins: InstanceTransform[] = [];
    const seams: InstanceTransform[] = [];
    const trunks: InstanceTransform[] = [];
    const canopies: InstanceTransform[] = [];
    const frames = viaExpressaFramePositions(layout);
    const sideX = layout.columnSpan / 2;
    const eaveX = layout.roofHalfSpan * 0.97;
    const columnBase = layout.sidewalkHeight;
    const columnTop = layout.eaveHeight;

    frames.forEach((z) => {
      [-1, 1].forEach((side) => {
        lattice.push(...latticeColumn(
          side * sideX,
          z,
          columnBase,
          columnTop,
          layout.columnChordGap,
          layout.columnThickness,
          layout.braceThickness,
          layout.braceSegmentsPerColumn,
        ));
        beams.push(beamBetween(
          [side * eaveX, layout.eaveHeight, z],
          [0, layout.height, z],
          layout.beamThickness,
        ));
        beams.push(beamBetween(
          [side * eaveX * 0.42, layout.eaveHeight + layout.roofRise * 0.12, z],
          [0, layout.eaveHeight + layout.roofRise * 0.22, z],
          layout.braceThickness,
        ));
      });
      beams.push({
        position: [0, layout.eaveHeight, z],
        scale: [layout.columnSpan, layout.beamThickness, layout.beamThickness],
      });
      beams.push({
        position: [0, layout.eaveHeight + layout.roofRise / 2, z],
        scale: [layout.beamThickness * 0.9, layout.roofRise, layout.beamThickness * 0.9],
      });
    });

    beams.push({
      position: [0, layout.height - layout.beamThickness * 0.12, layout.centerZ],
      scale: [layout.beamThickness * 1.2, layout.beamThickness * 1.15, layout.fillDepth],
    });
    [-1, 1].forEach((side) => {
      beams.push({
        position: [side * sideX, layout.eaveHeight, layout.centerZ],
        scale: [layout.beamThickness, layout.beamThickness, layout.fillDepth],
      });
    });

    [-1, 1].forEach((side) => {
      roofFaces.push({
        position: [
          side * layout.roofHalfSpan / 2,
          layout.eaveHeight + layout.roofRise / 2,
          layout.centerZ,
        ],
        scale: [layout.roofSlopeLength + 0.02, layout.roofThickness, layout.roofDepth],
        rotation: [0, 0, -side * layout.roofAngle],
      });
    });
    ridgeCaps.push({
      position: [0, layout.height + layout.roofThickness * 0.28, layout.centerZ],
      scale: [layout.ridgeWidth, layout.roofThickness * 0.8, layout.roofDepth + 0.02],
    });

    if (showDetail) {
      const frontZ = layout.frontZ + 0.006;
      beams.push(
        beamBetween(
          [-eaveX, layout.eaveHeight, frontZ],
          [0, layout.height, frontZ],
          layout.beamThickness * 0.85,
        ),
        beamBetween(
          [eaveX, layout.eaveHeight, frontZ],
          [0, layout.height, frontZ],
          layout.beamThickness * 0.85,
        ),
      );
      for (let index = 1; index <= layout.purlinCountPerSlope; index += 1) {
        const ratio = index / (layout.purlinCountPerSlope + 1);
        [-1, 1].forEach((side) => {
          purlins.push({
            position: [
              side * layout.roofHalfSpan * ratio,
              layout.height - layout.roofRise * ratio,
              layout.centerZ,
            ],
            scale: [
              layout.braceThickness * 0.85,
              layout.braceThickness * 0.7,
              layout.fillDepth * 0.97,
            ],
          });
        });
      }
      layout.trees.forEach((tree) => {
        trunks.push({
          position: [tree.x, tree.height * 0.34, tree.z],
          scale: [tree.trunkRadius * 2, tree.height * 0.68, tree.trunkRadius * 2],
        });
        canopies.push({
          position: [tree.x, tree.height * 0.72, tree.z],
          scale: [tree.canopyRadius * 2, tree.canopyRadius * 1.7, tree.canopyRadius * 2],
        });
      });
    }

    if (showFocusDetail) {
      const seamCount = 5;
      for (let index = 1; index < seamCount; index += 1) {
        const z = layout.centerZ - layout.roofDepth / 2 + layout.roofDepth * (index / seamCount);
        [-1, 1].forEach((side) => {
          seams.push({
            position: [
              side * layout.roofHalfSpan / 2,
              layout.eaveHeight + layout.roofRise / 2 + 0.016,
              z,
            ],
            scale: [layout.roofSlopeLength, 0.01, 0.012],
            rotation: [0, 0, -side * layout.roofAngle],
          });
        });
      }
    }

    return {
      lattice,
      beams,
      roofFaces,
      ridgeCaps,
      purlins,
      seams,
      trunks,
      canopies,
    };
  }, [layout, showDetail, showFocusDetail]);

  return (
    <group name="via-expressa-d2" raycast={NO_RAYCAST} dispose={null}>
      <mesh
        geometry={UNIT_BOX}
        material={materials.platform}
        position={[0, layout.platformHeight / 2, 0]}
        scale={[layout.gravelWidth, layout.platformHeight, layout.gravelDepth]}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <mesh
        geometry={UNIT_BOX}
        material={materials.wall}
        position={[0, layout.sidewalkHeight / 2, layout.centerZ]}
        scale={[layout.sidewalkWidth, layout.sidewalkHeight, layout.sidewalkDepth]}
        receiveShadow
        raycast={NO_RAYCAST}
      />
      <PavilionInstances
        material={materials.dark}
        items={architecture.lattice}
        castShadow
      />
      <PavilionInstances
        material={materials.metal}
        items={architecture.beams}
        castShadow={showDetail}
      />
      <PavilionInstances
        material={materials.roof}
        items={architecture.roofFaces}
        castShadow
        receiveShadow
      />
      <PavilionInstances
        material={materials.trim}
        items={architecture.ridgeCaps}
        castShadow
      />
      {showDetail && (
        <>
          <PavilionInstances material={materials.trim} items={architecture.purlins} />
          <PavilionInstances
            geometry={UNIT_CYLINDER}
            material={materials.accent}
            items={architecture.trunks}
            castShadow
          />
          <PavilionInstances
            geometry={UNIT_CANOPY}
            material={materials.green}
            items={architecture.canopies}
            castShadow
          />
          <ViaExpressaIdentitySign layout={layout} frameMaterial={materials.accent} />
        </>
      )}
      {showFocusDetail && (
        <PavilionInstances material={materials.white} items={architecture.seams} />
      )}
    </group>
  );
});
