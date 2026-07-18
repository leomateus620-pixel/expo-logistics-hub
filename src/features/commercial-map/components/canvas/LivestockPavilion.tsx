import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  createLivestockPavilionLayout,
  LIVESTOCK_PAVILION_RENDER_BUDGET,
  livestockPavilionBayPositions,
  type LivestockPavilionLayout,
} from '../../utils/livestockPavilion';
import type { StrategicLandmarkBounds } from '../../utils/landmarks';

const NO_RAYCAST = () => undefined;
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);
const CATTLE_BODY = new THREE.SphereGeometry(0.5, 8, 6);
const CATTLE_HEAD = new THREE.SphereGeometry(0.5, 7, 5);
const CATTLE_LEG = new THREE.CylinderGeometry(0.5, 0.42, 1, 6);
const CATTLE_EAR = new THREE.ConeGeometry(0.5, 1, 5);

type Vector3Tuple = [number, number, number];

interface InstanceTransform {
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
}

export interface LivestockPavilionMaterials {
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

export interface CattlePose {
  position: Vector3Tuple;
  rotationY: number;
  scale?: number;
  coat: string;
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
  items: InstanceTransform[];
  castShadow?: boolean;
  receiveShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

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
  }, [items]);

  if (!items.length) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      raycast={NO_RAYCAST}
    />
  );
}

function ColoredInstances({
  geometry,
  material,
  items,
  castShadow = false,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  items: Array<InstanceTransform & { color: string }>;
  castShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const object = new THREE.Object3D();
    const color = new THREE.Color();
    items.forEach((item, index) => {
      object.position.set(...item.position);
      object.rotation.set(...(item.rotation ?? [0, 0, 0]));
      object.scale.set(...item.scale);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
      mesh.setColorAt(index, color.set(item.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [items]);

  if (!items.length) return null;
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, items.length]}
      castShadow={castShadow}
      receiveShadow
      raycast={NO_RAYCAST}
    />
  );
}

function rotatedOffset(rotationY: number, forward: number, lateral = 0) {
  return {
    x: Math.cos(rotationY) * forward + Math.sin(rotationY) * lateral,
    z: -Math.sin(rotationY) * forward + Math.cos(rotationY) * lateral,
  };
}

export const LivestockCattle = memo(function LivestockCattle({
  poses,
  castShadow = false,
}: {
  poses: CattlePose[];
  castShadow?: boolean;
}) {
  const materials = useMemo(() => ({
    coat: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.92,
      metalness: 0,
      vertexColors: true,
      emissive: '#51473e',
      emissiveIntensity: 0.055,
    }),
    muzzle: new THREE.MeshStandardMaterial({
      color: '#39332d',
      roughness: 0.94,
      metalness: 0,
      vertexColors: true,
      emissive: '#241f1b',
      emissiveIntensity: 0.035,
    }),
  }), []);

  useEffect(() => () => {
    materials.coat.dispose();
    materials.muzzle.dispose();
  }, [materials]);

  const transforms = useMemo(() => {
    const bodies: Array<InstanceTransform & { color: string }> = [];
    const heads: Array<InstanceTransform & { color: string }> = [];
    const legs: Array<InstanceTransform & { color: string }> = [];
    const ears: Array<InstanceTransform & { color: string }> = [];
    const horns: Array<InstanceTransform & { color: string }> = [];
    const muzzles: Array<InstanceTransform & { color: string }> = [];

    poses.forEach((pose) => {
      const scale = pose.scale ?? 1;
      const [x, baseY, z] = pose.position;
      const bodyY = baseY + 0.31 * scale;
      const headOffset = rotatedOffset(pose.rotationY, 0.32 * scale);
      const muzzleOffset = rotatedOffset(pose.rotationY, 0.415 * scale);

      bodies.push({
        position: [x, bodyY, z],
        scale: [0.58 * scale, 0.32 * scale, 0.27 * scale],
        rotation: [0, pose.rotationY, 0],
        color: pose.coat,
      });
      heads.push({
        position: [x + headOffset.x, baseY + 0.29 * scale, z + headOffset.z],
        scale: [0.25 * scale, 0.25 * scale, 0.22 * scale],
        rotation: [0, pose.rotationY, -0.12],
        color: pose.coat,
      });
      muzzles.push({
        position: [x + muzzleOffset.x, baseY + 0.245 * scale, z + muzzleOffset.z],
        scale: [0.13 * scale, 0.14 * scale, 0.17 * scale],
        rotation: [0, pose.rotationY, 0],
        color: pose.coat === '#e9dfc9' ? '#7e6552' : '#2d2925',
      });

      const legForward = [-0.17, 0.17];
      const legSides = [-0.085, 0.085];
      legForward.forEach((forward) => {
        legSides.forEach((lateral) => {
          const legOffset = rotatedOffset(pose.rotationY, forward * scale, lateral * scale);
          legs.push({
            position: [x + legOffset.x, baseY + 0.12 * scale, z + legOffset.z],
            scale: [0.07 * scale, 0.24 * scale, 0.07 * scale],
            rotation: [0, pose.rotationY, 0],
            color: pose.coat,
          });
        });
      });

      [-1, 1].forEach((side) => {
        const earOffset = rotatedOffset(pose.rotationY, 0.32 * scale, side * 0.13 * scale);
        ears.push({
          position: [x + earOffset.x, baseY + 0.405 * scale, z + earOffset.z],
          scale: [0.09 * scale, 0.12 * scale, 0.065 * scale],
          rotation: [Math.PI / 2, pose.rotationY, side * 0.5],
          color: pose.coat,
        });
        const hornOffset = rotatedOffset(pose.rotationY, 0.345 * scale, side * 0.062 * scale);
        horns.push({
          position: [x + hornOffset.x, baseY + 0.455 * scale, z + hornOffset.z],
          scale: [0.036 * scale, 0.12 * scale, 0.036 * scale],
          rotation: [0, pose.rotationY, side * 0.28],
          color: '#e1cf9f',
        });
      });
    });

    return { bodies, heads, legs, ears, horns, muzzles };
  }, [poses]);

  return (
    <group raycast={NO_RAYCAST}>
      <ColoredInstances geometry={CATTLE_BODY} material={materials.coat} items={transforms.bodies} castShadow={castShadow} />
      <ColoredInstances geometry={CATTLE_HEAD} material={materials.coat} items={transforms.heads} castShadow={castShadow} />
      <ColoredInstances geometry={CATTLE_LEG} material={materials.coat} items={transforms.legs} />
      <ColoredInstances geometry={CATTLE_EAR} material={materials.coat} items={transforms.ears} />
      <ColoredInstances geometry={CATTLE_EAR} material={materials.coat} items={transforms.horns} />
      <ColoredInstances geometry={CATTLE_HEAD} material={materials.muzzle} items={transforms.muzzles} />
    </group>
  );
});

function createIdentityTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = LIVESTOCK_PAVILION_RENDER_BUDGET.identityTextureWidth;
  canvas.height = LIVESTOCK_PAVILION_RENDER_BUDGET.identityTextureHeight;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#f3f1e8';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#2f6672';
  context.fillRect(0, 0, 15, canvas.height);
  context.fillStyle = '#2b443a';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.font = '800 29px Arial, sans-serif';
  context.fillText('PAVILHÕES 6 · 10 · 11', 36, 46);
  context.fillStyle = '#a45736';
  context.font = '900 36px Arial, sans-serif';
  context.fillText('PECUÁRIA', 36, 86);
  context.fillStyle = '#62716c';
  context.font = '700 11px Arial, sans-serif';
  context.fillText('FENASOJA · ESTRUTURA DE EXPOSIÇÃO ANIMAL', 265, 103);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function LivestockIdentitySign({
  width,
  depth,
  sideWallHeight,
  frameMaterial,
}: {
  width: number;
  depth: number;
  sideWallHeight: number;
  frameMaterial: THREE.Material;
}) {
  const texture = useMemo(() => createIdentityTexture(), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: texture ? '#ffffff' : '#f3f1e8',
    map: texture,
    roughness: 0.74,
    metalness: 0,
  }), [texture]);

  useEffect(() => () => {
    texture?.dispose();
    material.dispose();
  }, [material, texture]);

  const signWidth = Math.min(4.8, width * 0.3);
  const signHeight = Math.max(0.46, signWidth * 0.25);
  return (
    <group
      position={[0, sideWallHeight + signHeight * 0.68, depth / 2 + 0.018]}
      raycast={NO_RAYCAST}
    >
      <mesh
        geometry={UNIT_BOX}
        material={frameMaterial}
        position={[0, 0, -0.025]}
        scale={[signWidth + 0.09, signHeight + 0.09, 0.075]}
        castShadow
      />
      <mesh
        geometry={UNIT_PLANE}
        material={material}
        position={[0, 0, 0.018]}
        scale={[signWidth, signHeight, 1]}
      />
    </group>
  );
}

function createExternalCattlePoses(
  layout: LivestockPavilionLayout,
  includeFocusedHerd: boolean,
): CattlePose[] {
  const coats = ['#e9dfc9', '#8c5d3f', '#403832', '#c9ad83', '#f0eadb'];
  const poses: CattlePose[] = [];

  layout.sections.forEach((section, sectionIndex) => {
    const bays = livestockPavilionBayPositions(section);
    const visibleCount = includeFocusedHerd
      ? Math.min(LIVESTOCK_PAVILION_RENDER_BUDGET.focusedCattlePerSection, section.bayCount)
      : Math.min(LIVESTOCK_PAVILION_RENDER_BUDGET.mediumCattlePerSection, section.bayCount);
    for (let index = 0; index < visibleCount; index += 1) {
      const bayIndex = includeFocusedHerd
        ? index
        : Math.round(index * (section.bayCount - 1) / Math.max(1, visibleCount - 1));
      const minX = bays[bayIndex] ?? section.minX;
      const maxX = bays[bayIndex + 1] ?? section.maxX;
      const side = (index + sectionIndex) % 2 === 0 ? 1 : -1;
      poses.push({
        position: [
          (minX + maxX) / 2 + ((index % 3) - 1) * 0.045,
          layout.platformHeight + 0.055,
          side * (layout.corridorWidth / 2 + layout.stallDepth * (0.52 + (index % 2) * 0.08)),
        ],
        rotationY: side > 0
          ? (index % 2 ? Math.PI - 0.16 : 0.12)
          : (index % 2 ? 0.18 : Math.PI + 0.1),
        scale: 0.88 + ((index + sectionIndex) % 3) * 0.055,
        coat: coats[(index * 2 + sectionIndex) % coats.length],
      });
    }
  });

  return poses;
}

export const LivestockPavilion = memo(function LivestockPavilion({
  bounds,
  height,
  materials,
  showDetail,
  showFocusDetail,
}: {
  bounds: StrategicLandmarkBounds;
  height: number;
  materials: LivestockPavilionMaterials;
  showDetail: boolean;
  showFocusDetail: boolean;
}) {
  const layout = useMemo(
    () => createLivestockPavilionLayout(bounds, height),
    [bounds, height],
  );

  const architecture = useMemo(() => {
    const roofFaces: InstanceTransform[] = [];
    const ridgeCaps: InstanceTransform[] = [];
    const gutters: InstanceTransform[] = [];
    const platforms: InstanceTransform[] = [];
    const stallFloors: InstanceTransform[] = [];
    const corridors: InstanceTransform[] = [];
    const sideWalls: InstanceTransform[] = [];
    const columns: InstanceTransform[] = [];
    const trussTies: InstanceTransform[] = [];
    const trussChords: InstanceTransform[] = [];
    const partitions: InstanceTransform[] = [];
    const sideRails: InstanceTransform[] = [];
    const roofSeams: InstanceTransform[] = [];
    const sectionFrames: InstanceTransform[] = [];

    layout.sections.forEach((section) => {
      platforms.push({
        position: [section.centerX, layout.platformHeight / 2, 0],
        scale: [section.width, layout.platformHeight, layout.depth - 0.04],
      });
      corridors.push({
        position: [section.centerX, layout.platformHeight + 0.018, 0],
        scale: [section.width - 0.08, 0.035, layout.corridorWidth - 0.04],
      });
      [-1, 1].forEach((side) => {
        const sideZ = side * (layout.corridorWidth / 2 + layout.stallDepth / 2);
        stallFloors.push({
          position: [section.centerX, layout.platformHeight + 0.023, sideZ],
          scale: [section.width - 0.1, 0.045, layout.stallDepth - 0.06],
        });
        sideWalls.push({
          position: [
            section.centerX,
            layout.platformHeight + layout.sideWallHeight / 2,
            side * (layout.depth / 2 - 0.075),
          ],
          scale: [section.width - 0.18, layout.sideWallHeight, 0.12],
        });
        roofFaces.push({
          position: [
            section.centerX,
            layout.eaveHeight + layout.roofRise / 2,
            side * layout.roofHalfSpan / 2,
          ],
          scale: [section.width + 0.08, 0.085, layout.roofSlopeLength + 0.055],
          rotation: [side * layout.roofAngle, 0, 0],
        });
        gutters.push({
          position: [section.centerX, layout.eaveHeight - 0.018, side * (layout.depth / 2 - 0.035)],
          scale: [section.width + 0.055, 0.07, 0.075],
        });
        [0.74, 1.04].forEach((heightRatio) => {
          sideRails.push({
            position: [
              section.centerX,
              Math.min(layout.eaveHeight - 0.18, layout.sideWallHeight * heightRatio + 0.33),
              side * (layout.depth / 2 - 0.115),
            ],
            scale: [section.width - 0.22, 0.035, 0.035],
          });
        });

        if (showFocusDetail) {
          const seamCount = Math.max(5, Math.round(section.width / 0.46));
          for (let seamIndex = 1; seamIndex < seamCount; seamIndex += 1) {
            roofSeams.push({
              position: [
                section.minX + section.width * (seamIndex / seamCount),
                layout.eaveHeight + layout.roofRise / 2 + 0.05,
                side * layout.roofHalfSpan / 2,
              ],
              scale: [0.018, 0.018, layout.roofSlopeLength],
              rotation: [side * layout.roofAngle, 0, 0],
            });
          }
        }
      });

      ridgeCaps.push({
        position: [section.centerX, layout.height + 0.025, 0],
        scale: [section.width + 0.09, 0.085, 0.14],
      });

      const bayPositions = livestockPavilionBayPositions(section);
      bayPositions.forEach((x, index) => {
        [-1, 1].forEach((side) => {
          columns.push({
            position: [
              x,
              layout.platformHeight + layout.eaveHeight / 2,
              side * (layout.depth / 2 - 0.13),
            ],
            scale: [0.072, layout.eaveHeight, 0.072],
          });
          trussChords.push({
            position: [x, layout.eaveHeight + layout.roofRise / 2 - 0.055, side * layout.roofHalfSpan / 2],
            scale: [0.055, 0.055, layout.roofSlopeLength - 0.06],
            rotation: [side * layout.roofAngle, 0, 0],
          });
        });
        trussTies.push({
          position: [x, layout.eaveHeight - 0.095, 0],
          scale: [0.055, 0.055, layout.depth - 0.24],
        });
        if (index > 0 && index < bayPositions.length - 1) {
          [-1, 1].forEach((side) => {
            partitions.push({
              position: [
                x,
                layout.platformHeight + layout.sideWallHeight * 0.42,
                side * (layout.corridorWidth / 2 + layout.stallDepth / 2),
              ],
              scale: [0.055, layout.sideWallHeight * 0.78, layout.stallDepth - 0.12],
            });
          });
        }
      });

      [section.minX + 0.035, section.maxX - 0.035].forEach((x) => {
        sectionFrames.push({
          position: [x, layout.platformHeight + layout.eaveHeight / 2, 0],
          scale: [0.095, layout.eaveHeight, layout.depth - 0.16],
        });
      });
    });

    return {
      columns,
      corridors,
      gutters,
      partitions,
      platforms,
      ridgeCaps,
      roofFaces,
      roofSeams,
      sectionFrames,
      sideRails,
      sideWalls,
      stallFloors,
      trussChords,
      trussTies,
    };
  }, [layout, showFocusDetail]);

  const cattle = useMemo(
    () => createExternalCattlePoses(layout, showFocusDetail),
    [layout, showFocusDetail],
  );

  return (
    <group raycast={NO_RAYCAST} dispose={null}>
      <ScaledInstances
        material={materials.platform}
        items={architecture.platforms}
        receiveShadow
      />
      <ScaledInstances
        material={materials.trim}
        items={architecture.corridors}
        receiveShadow
      />
      <ScaledInstances
        material={materials.accent}
        items={architecture.stallFloors}
        receiveShadow
      />
      <ScaledInstances
        material={materials.wall}
        items={architecture.sideWalls}
        castShadow
        receiveShadow
      />
      <ScaledInstances
        material={materials.roof}
        items={architecture.roofFaces}
        castShadow
        receiveShadow
      />
      <ScaledInstances material={materials.metal} items={architecture.ridgeCaps} castShadow />
      <ScaledInstances material={materials.metal} items={architecture.gutters} />
      <ScaledInstances material={materials.dark} items={architecture.columns} castShadow={showDetail} />
      <ScaledInstances material={materials.dark} items={architecture.sectionFrames} />

      {showDetail && (
        <>
          <ScaledInstances material={materials.metal} items={architecture.sideRails} />
          <ScaledInstances material={materials.wall} items={architecture.partitions} />
          <ScaledInstances material={materials.dark} items={architecture.trussTies} />
          <ScaledInstances material={materials.dark} items={architecture.trussChords} />
          <LivestockCattle poses={cattle} castShadow={showFocusDetail} />
          <LivestockIdentitySign
            width={layout.width}
            depth={layout.depth}
            sideWallHeight={layout.sideWallHeight}
            frameMaterial={materials.dark}
          />
        </>
      )}

      {showFocusDetail && (
        <ScaledInstances material={materials.white} items={architecture.roofSeams} />
      )}
    </group>
  );
});
