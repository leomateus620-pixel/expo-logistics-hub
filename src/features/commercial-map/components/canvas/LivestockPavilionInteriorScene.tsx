import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { MapEntity } from '../../types';
import {
  createLivestockPavilionLayout,
  LIVESTOCK_PAVILION_RENDER_BUDGET,
  livestockPavilionBayPositions,
  livestockPavilionVisualHeight,
} from '../../utils/livestockPavilion';
import {
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
} from '../../utils/landmarks';
import {
  LivestockCattle,
  type CattlePose,
} from './LivestockPavilion';

const NO_RAYCAST = () => undefined;
const UP = new THREE.Vector3(0, 1, 0);
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

type Vector3Tuple = [number, number, number];

interface InstanceTransform {
  position: Vector3Tuple;
  scale: Vector3Tuple;
  rotation?: Vector3Tuple;
}

function InteriorInstances({
  material,
  items,
  castShadow = false,
  receiveShadow = false,
}: {
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
      args={[UNIT_BOX, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      raycast={NO_RAYCAST}
    />
  );
}

function createInteriorIdentityTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = LIVESTOCK_PAVILION_RENDER_BUDGET.identityTextureWidth;
  canvas.height = LIVESTOCK_PAVILION_RENDER_BUDGET.identityTextureHeight;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#eef0e9';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#315f67';
  context.fillRect(0, 0, canvas.width, 11);
  context.fillStyle = '#243f36';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '900 36px Arial, sans-serif';
  context.fillText('PECUÁRIA', canvas.width / 2, 50);
  context.fillStyle = '#9f593c';
  context.font = '800 21px Arial, sans-serif';
  context.fillText('PAVILHÕES 6 · 10 · 11', canvas.width / 2, 87);
  context.fillStyle = '#69736c';
  context.font = '700 10px Arial, sans-serif';
  context.fillText('CIRCULAÇÃO CENTRAL · BAIAS DE EXPOSIÇÃO', canvas.width / 2, 111);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function InteriorIdentity({
  position,
  width,
  frameMaterial,
}: {
  position: Vector3Tuple;
  width: number;
  frameMaterial: THREE.Material;
}) {
  const texture = useMemo(() => createInteriorIdentityTexture(), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: texture ? '#ffffff' : '#eef0e9',
    map: texture,
    roughness: 0.76,
    metalness: 0,
  }), [texture]);

  useEffect(() => () => {
    texture?.dispose();
    material.dispose();
  }, [material, texture]);

  return (
    <group position={position} raycast={NO_RAYCAST}>
      <mesh
        geometry={UNIT_BOX}
        material={frameMaterial}
        position={[0, 0, -0.035]}
        scale={[width + 0.1, width * 0.27 + 0.1, 0.08]}
        castShadow
      />
      <mesh
        geometry={UNIT_PLANE}
        material={material}
        position={[0, 0, 0.012]}
        scale={[width, width * 0.27, 1]}
      />
    </group>
  );
}

function createInteriorCattlePoses(
  entity: MapEntity,
  reducedGraphics: boolean,
): CattlePose[] {
  const bounds = strategicLandmarkBounds(entity);
  const height = Math.max(entity.geometry.extrusionHeight, livestockPavilionVisualHeight(bounds));
  const layout = createLivestockPavilionLayout(bounds, height);
  const coats = ['#eee6d4', '#9a6848', '#625247', '#c8ac83', '#dfcbaa', '#765c48'];
  const poses: CattlePose[] = [];

  layout.sections.forEach((section, sectionIndex) => {
    const bays = livestockPavilionBayPositions(section);
    const count = reducedGraphics
      ? LIVESTOCK_PAVILION_RENDER_BUDGET.reducedInteriorCattlePerSection
      : LIVESTOCK_PAVILION_RENDER_BUDGET.interiorCattlePerSection;
    for (let index = 0; index < count; index += 1) {
      const bayIndex = index % section.bayCount;
      const minX = bays[bayIndex] ?? section.minX;
      const maxX = bays[bayIndex + 1] ?? section.maxX;
      const side = (index + sectionIndex) % 2 === 0 ? 1 : -1;
      poses.push({
        position: [
          (minX + maxX) / 2 + (((index + sectionIndex) % 3) - 1) * 0.055,
          layout.platformHeight + 0.052,
          side * (layout.corridorWidth / 2 + layout.stallDepth * (0.49 + (index % 2) * 0.13)),
        ],
        rotationY: side > 0
          ? (index % 3 === 0 ? Math.PI * 0.47 : index % 2 ? Math.PI - 0.13 : 0.1)
          : (index % 3 === 0 ? -Math.PI * 0.48 : index % 2 ? 0.16 : Math.PI + 0.08),
        scale: 0.94 + ((index + sectionIndex) % 3) * 0.065,
        coat: coats[(index + sectionIndex * 2) % coats.length],
      });
    }
  });

  return poses;
}

function LivestockInteriorCameraRig({
  entity,
  reducedGraphics,
}: {
  entity: MapEntity;
  reducedGraphics: boolean;
}) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const animating = useRef(true);
  const targetPosition = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  const { camera, gl, invalidate, size } = useThree();
  const bounds = useMemo(() => strategicLandmarkBounds(entity), [entity]);
  const height = Math.max(entity.geometry.extrusionHeight, livestockPavilionVisualHeight(bounds));
  const layout = useMemo(() => createLivestockPavilionLayout(bounds, height), [bounds, height]);
  const facing = strategicLandmarkFacingRadians(entity);
  const center = useMemo(
    () => new THREE.Vector3(bounds.centerX, entity.geometry.elevation, bounds.centerZ),
    [bounds.centerX, bounds.centerZ, entity.geometry.elevation],
  );
  const toWorld = useCallback((x: number, y: number, z: number) => (
    new THREE.Vector3(x, y, z).applyAxisAngle(UP, facing).add(center)
  ), [center, facing]);

  useEffect(() => {
    const compact = size.width < 700;
    const reducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = compact
      ? toWorld(-layout.width * 0.82, layout.height * 2.62, layout.width * 0.98)
      : toWorld(-layout.width * 0.76, layout.height * 2.02, layout.width * 0.57);
    const destination = compact
      ? toWorld(-layout.width * 0.72, layout.height * 2.38, layout.width * 0.82)
      : toWorld(-layout.width * 0.68, layout.height * 1.76, layout.width * 0.47);
    const lookAt = compact
      ? toWorld(-layout.width * 0.08, layout.sideWallHeight * 1.08, 0)
      : toWorld(-layout.width * 0.14, layout.sideWallHeight * 1.05, -layout.depth * 0.04);

    targetPosition.current.copy(destination);
    targetLookAt.current.copy(lookAt);
    camera.position.copy(reducedMotion ? destination : start);
    camera.near = 0.04;
    camera.far = Math.max(140, layout.width * 8);
    camera.updateProjectionMatrix();
    controls.current?.target.copy(lookAt);
    controls.current?.update();
    animating.current = !reducedMotion && !reducedGraphics;
    gl.domElement.style.cursor = 'grab';
    invalidate();
    return () => {
      gl.domElement.style.cursor = 'grab';
    };
  }, [
    camera,
    gl,
    invalidate,
    layout.depth,
    layout.eaveHeight,
    layout.height,
    layout.sideWallHeight,
    layout.width,
    reducedGraphics,
    size.width,
    toWorld,
  ]);

  useFrame((_state, delta) => {
    if (!animating.current) return;
    const factor = 1 - Math.exp(-delta * 4.6);
    camera.position.lerp(targetPosition.current, factor);
    if (controls.current) {
      controls.current.target.lerp(targetLookAt.current, factor);
      controls.current.update();
    }
    if (
      camera.position.distanceTo(targetPosition.current) < 0.035
      && (!controls.current || controls.current.target.distanceTo(targetLookAt.current) < 0.025)
    ) {
      camera.position.copy(targetPosition.current);
      controls.current?.target.copy(targetLookAt.current);
      controls.current?.update();
      animating.current = false;
    } else {
      invalidate();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.082}
      enablePan={false}
      minDistance={Math.max(6.2, layout.depth * 2.05)}
      maxDistance={Math.max(24, layout.width * 1.7)}
      minPolarAngle={0.28}
      maxPolarAngle={Math.PI / 2.04}
      target={toWorld(0, layout.sideWallHeight * 1.1, 0).toArray()}
      onStart={() => {
        animating.current = false;
        gl.domElement.style.cursor = 'grabbing';
      }}
      onEnd={() => {
        gl.domElement.style.cursor = 'grab';
      }}
      onChange={() => invalidate()}
    />
  );
}

export const LivestockPavilionInteriorScene = memo(function LivestockPavilionInteriorScene({
  entity,
  reducedGraphics,
}: {
  entity: MapEntity;
  reducedGraphics: boolean;
}) {
  const bounds = useMemo(() => strategicLandmarkBounds(entity), [entity]);
  const height = Math.max(entity.geometry.extrusionHeight, livestockPavilionVisualHeight(bounds));
  const layout = useMemo(() => createLivestockPavilionLayout(bounds, height), [bounds, height]);
  const facing = strategicLandmarkFacingRadians(entity);
  const cattle = useMemo(
    () => createInteriorCattlePoses(entity, reducedGraphics),
    [entity, reducedGraphics],
  );
  const materials = useMemo(() => ({
    platform: new THREE.MeshStandardMaterial({ color: '#77786f', roughness: 0.98, metalness: 0 }),
    bedding: new THREE.MeshStandardMaterial({ color: '#c98050', roughness: 1, metalness: 0 }),
    aisle: new THREE.MeshStandardMaterial({ color: '#8d5a43', roughness: 0.98, metalness: 0 }),
    wall: new THREE.MeshStandardMaterial({ color: '#6fa6b6', roughness: 0.9, metalness: 0 }),
    steel: new THREE.MeshStandardMaterial({ color: '#313e40', roughness: 0.68, metalness: 0.16 }),
    roof: new THREE.MeshStandardMaterial({ color: '#d2d1c9', roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide }),
    trim: new THREE.MeshStandardMaterial({ color: '#a9b7b6', roughness: 0.84, metalness: 0.04 }),
  }), []);

  useEffect(() => () => {
    Object.values(materials).forEach((material) => material.dispose());
  }, [materials]);

  const architecture = useMemo(() => {
    const platforms: InstanceTransform[] = [];
    const stallFloors: InstanceTransform[] = [];
    const aisles: InstanceTransform[] = [];
    const outerWalls: InstanceTransform[] = [];
    const partitions: InstanceTransform[] = [];
    const columns: InstanceTransform[] = [];
    const ties: InstanceTransform[] = [];
    const chords: InstanceTransform[] = [];
    const farRoof: InstanceTransform[] = [];
    const ridgeCaps: InstanceTransform[] = [];
    const rails: InstanceTransform[] = [];
    const sectionThresholds: InstanceTransform[] = [];

    layout.sections.forEach((section) => {
      platforms.push({
        position: [section.centerX, layout.platformHeight / 2, 0],
        scale: [section.width, layout.platformHeight, layout.depth - 0.035],
      });
      aisles.push({
        position: [section.centerX, layout.platformHeight + 0.026, 0],
        scale: [section.width - 0.06, 0.052, layout.corridorWidth - 0.025],
      });
      [-1, 1].forEach((side) => {
        const stallZ = side * (layout.corridorWidth / 2 + layout.stallDepth / 2);
        stallFloors.push({
          position: [section.centerX, layout.platformHeight + 0.031, stallZ],
          scale: [section.width - 0.08, 0.062, layout.stallDepth - 0.04],
        });
        outerWalls.push({
          position: [
            section.centerX,
            layout.platformHeight + layout.sideWallHeight / 2,
            side * (layout.depth / 2 - 0.07),
          ],
          scale: [section.width - 0.15, layout.sideWallHeight, 0.12],
        });
        [0.79, 1.17].forEach((heightRatio) => {
          rails.push({
            position: [
              section.centerX,
              Math.min(layout.eaveHeight - 0.16, layout.sideWallHeight * heightRatio + 0.31),
              side * (layout.depth / 2 - 0.12),
            ],
            scale: [section.width - 0.18, 0.035, 0.035],
          });
        });
      });

      // The roof half closest to the inspection camera is intentionally
      // omitted. The remaining opaque half provides a true sectional view
      // without alpha sorting or a disconnected generic room.
      farRoof.push({
        position: [
          section.centerX,
          layout.eaveHeight + layout.roofRise / 2,
          -layout.roofHalfSpan / 2,
        ],
        scale: [section.width + 0.08, 0.085, layout.roofSlopeLength + 0.055],
        rotation: [-layout.roofAngle, 0, 0],
      });
      ridgeCaps.push({
        position: [section.centerX, layout.height + 0.025, 0],
        scale: [section.width + 0.08, 0.085, 0.13],
      });

      const bays = livestockPavilionBayPositions(section);
      bays.forEach((x, index) => {
        if (!reducedGraphics || index === 0 || index === bays.length - 1 || index % 2 === 0) {
          [-1, 1].forEach((side) => {
            columns.push({
              position: [
                x,
                layout.platformHeight + layout.eaveHeight / 2,
                side * (layout.depth / 2 - 0.13),
              ],
              scale: [0.07, layout.eaveHeight, 0.07],
            });
            chords.push({
              position: [
                x,
                layout.eaveHeight + layout.roofRise / 2 - 0.05,
                side * layout.roofHalfSpan / 2,
              ],
              scale: [0.055, 0.055, layout.roofSlopeLength - 0.06],
              rotation: [side * layout.roofAngle, 0, 0],
            });
          });
          ties.push({
            position: [x, layout.eaveHeight - 0.09, 0],
            scale: [0.055, 0.055, layout.depth - 0.23],
          });
        }
        if (index > 0 && index < bays.length - 1) {
          [-1, 1].forEach((side) => {
            partitions.push({
              position: [
                x,
                layout.platformHeight + layout.sideWallHeight * 0.49,
                side * (layout.corridorWidth / 2 + layout.stallDepth / 2),
              ],
              scale: [0.06, layout.sideWallHeight * 0.92, layout.stallDepth - 0.1],
            });
          });
        }
      });

      sectionThresholds.push({
        position: [section.minX + 0.035, layout.platformHeight + 0.055, 0],
        scale: [0.07, 0.11, layout.corridorWidth],
      });
    });

    return {
      aisles,
      chords,
      columns,
      farRoof,
      outerWalls,
      partitions,
      platforms,
      rails,
      ridgeCaps,
      sectionThresholds,
      stallFloors,
      ties,
    };
  }, [layout, reducedGraphics]);

  const shadowSpan = Math.max(layout.width * 0.62, 8);
  const signWidth = Math.min(3.6, layout.width * 0.22);

  return (
    <>
      <color attach="background" args={['#d9ddd5']} />
      <fog attach="fog" args={['#d9ddd5', layout.width * 1.45, layout.width * 3.4]} />
      <ambientLight intensity={0.62} />
      <hemisphereLight args={['#fff7e5', '#665142', 0.86]} />
      <directionalLight
        position={[bounds.centerX - layout.width * 0.28, 10, bounds.centerZ + 8]}
        intensity={1.62}
        color="#fff0ce"
        castShadow={!reducedGraphics}
        shadow-mapSize-width={reducedGraphics ? 256 : 1024}
        shadow-mapSize-height={reducedGraphics ? 256 : 1024}
        shadow-camera-left={-shadowSpan}
        shadow-camera-right={shadowSpan}
        shadow-camera-top={shadowSpan * 0.5}
        shadow-camera-bottom={-shadowSpan * 0.5}
        shadow-camera-near={0.5}
        shadow-camera-far={60}
        shadow-bias={-0.00008}
        shadow-normalBias={0.035}
      />
      <pointLight
        position={[bounds.centerX, layout.eaveHeight * 0.92, bounds.centerZ]}
        intensity={0.72}
        distance={layout.width * 0.72}
        decay={1.8}
        color="#ffe5b5"
      />
      <group
        position={[bounds.centerX, entity.geometry.elevation, bounds.centerZ]}
        rotation={[0, facing, 0]}
        dispose={null}
        raycast={NO_RAYCAST}
      >
        <InteriorInstances material={materials.platform} items={architecture.platforms} receiveShadow />
        <InteriorInstances material={materials.aisle} items={architecture.aisles} receiveShadow />
        <InteriorInstances material={materials.bedding} items={architecture.stallFloors} receiveShadow />
        <InteriorInstances material={materials.wall} items={architecture.outerWalls} />
        <InteriorInstances material={materials.wall} items={architecture.partitions} />
        <InteriorInstances material={materials.steel} items={architecture.rails} />
        <InteriorInstances material={materials.steel} items={architecture.columns} castShadow={!reducedGraphics} />
        <InteriorInstances material={materials.steel} items={architecture.ties} />
        <InteriorInstances material={materials.steel} items={architecture.chords} />
        <InteriorInstances material={materials.roof} items={architecture.farRoof} castShadow receiveShadow />
        <InteriorInstances material={materials.trim} items={architecture.ridgeCaps} />
        <InteriorInstances material={materials.trim} items={architecture.sectionThresholds} />
        <LivestockCattle poses={cattle} castShadow={!reducedGraphics} />
        <InteriorIdentity
          position={[0, layout.eaveHeight - 0.38, -layout.depth / 2 + 0.135]}
          width={signWidth}
          frameMaterial={materials.steel}
        />
      </group>
      <LivestockInteriorCameraRig entity={entity} reducedGraphics={reducedGraphics} />
    </>
  );
});
