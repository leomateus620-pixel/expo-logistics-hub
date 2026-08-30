import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { useInteriorCameraRequest, type InteriorCameraRequest } from '../../hooks/useInteriorCameraRequest';
import * as THREE from 'three';
import type { MapEntity } from '../../types';
import {
  createMiranteLayout,
  miranteVisualHeight,
} from '../../utils/mirante';
import {
  strategicLandmarkBounds,
  strategicLandmarkFacingRadians,
} from '../../utils/landmarks';
import {
  MiranteArchitecture,
  type MirantePavilionMaterials,
} from './MirantePavilion';

const UP = new THREE.Vector3(0, 1, 0);

function MiranteInteriorCameraRig({ entity }: { entity: MapEntity; reducedGraphics: boolean }) {
  const size = useThree((state) => state.size);
  const request = useMemo<InteriorCameraRequest>(() => {
    const bounds = strategicLandmarkBounds(entity);
    const height = Math.max(entity.geometry.extrusionHeight, miranteVisualHeight(bounds));
    const layout = createMiranteLayout(bounds, height);
    const facing = strategicLandmarkFacingRadians(entity);
    const center = new THREE.Vector3(bounds.centerX, entity.geometry.elevation, bounds.centerZ);
    const toWorld = (x: number, y: number, z: number) => (
      new THREE.Vector3(x, y, z).applyAxisAngle(UP, facing).add(center)
    );
    const compact = size.width < 720 || size.height < 520;
    const portrait = size.height > size.width * 1.12;
    const narrowLandscape = !portrait && size.width / Math.max(size.height, 1) < 1.45;
    return {
      entityId: entity.id,
      position: portrait
        ? toWorld(-layout.width * 1.95, layout.height * 1.08, layout.depth * 1.7)
        : narrowLandscape
          ? toWorld(-layout.width * 3.85, layout.height * 1.08, layout.depth * 0.65)
          : compact
            ? toWorld(-layout.width * 3, layout.height * 1.12, layout.depth * 0.62)
            : toWorld(-layout.width * 2.75, layout.height * 0.98, layout.depth * 0.56),
      target: portrait
        ? toWorld(layout.width * 0.03, layout.platform.topY + layout.height * 0.18, layout.depth * 0.1)
        : narrowLandscape
          ? toWorld(layout.width * 0.08, layout.platform.topY + layout.height * 0.17, -layout.depth * 0.02)
          : compact
            ? toWorld(layout.width * 0.08, layout.platform.topY + layout.height * 0.18, -layout.depth * 0.04)
            : toWorld(layout.width * 0.12, layout.platform.topY + layout.height * 0.16, -layout.depth * 0.05),
      fov: portrait || narrowLandscape ? 48 + (portrait ? 10 : 0) : compact ? 48 : 44,
      near: 0.04,
      far: Math.max(150, layout.depth * 15),
      minDistance: Math.max(3.8, layout.width * 1.45),
      maxDistance: portrait ? Math.max(30, layout.depth * 3.5) : compact ? Math.max(24, layout.depth * 3) : Math.max(16, layout.depth * 2.25),
      minPolarAngle: 0.22,
      maxPolarAngle: Math.PI / 2.04,
      minAzimuthAngle: -2.72,
      maxAzimuthAngle: -0.58,
      dampingFactor: 0.072,
      enablePan: false,
      zoomToCursor: false,
      panBounds: {
        center,
        facing,
        min: [-layout.width * 0.5, 0.12, -layout.depth * 0.55],
        max: [layout.width * 0.48, layout.height * 1.02, layout.depth * 0.55],
      },
    };
  }, [entity, size.height, size.width]);
  useInteriorCameraRequest(request);
  return null;
}

export const MiranteInteriorScene = memo(function MiranteInteriorScene({
  entity,
  reducedGraphics,
}: {
  entity: MapEntity;
  reducedGraphics: boolean;
}) {
  const bounds = useMemo(() => strategicLandmarkBounds(entity), [entity]);
  const height = Math.max(entity.geometry.extrusionHeight, miranteVisualHeight(bounds));
  const layout = useMemo(() => createMiranteLayout(bounds, height), [bounds, height]);
  const facing = strategicLandmarkFacingRadians(entity);
  const materials = useMemo<MirantePavilionMaterials>(() => {
    const result: MirantePavilionMaterials = {
      wall: new THREE.MeshStandardMaterial({ color: '#d8d4ca', roughness: 0.95 }),
      accent: new THREE.MeshStandardMaterial({ color: '#8b765d', roughness: 0.8 }),
      roof: new THREE.MeshStandardMaterial({
        color: '#c8ced0',
        emissive: '#c8ced0',
        emissiveIntensity: 0.24,
        roughness: 0.67,
        metalness: 0.2,
        side: THREE.DoubleSide,
      }),
      trim: new THREE.MeshStandardMaterial({
        color: '#e2e0d9',
        roughness: 0.76,
        metalness: 0.05,
      }),
      dark: new THREE.MeshStandardMaterial({
        color: '#273033',
        roughness: 0.58,
        metalness: 0.28,
      }),
      glass: new THREE.MeshStandardMaterial({
        color: '#50676b',
        roughness: 0.35,
        metalness: 0.03,
      }),
      green: new THREE.MeshStandardMaterial({ color: '#506f50', roughness: 1 }),
      white: new THREE.MeshStandardMaterial({
        color: '#f0eee7',
        roughness: 0.9,
        side: THREE.DoubleSide,
      }),
      platform: new THREE.MeshStandardMaterial({ color: '#99968e', roughness: 0.98 }),
      metal: new THREE.MeshStandardMaterial({
        color: '#626d6e',
        roughness: 0.5,
        metalness: 0.34,
      }),
    };
    return result;
  }, []);

  useEffect(() => () => {
    Object.values(materials).forEach((material) => material.dispose());
  }, [materials]);

  return (
    <>
      <color attach="background" args={['#dfe5df']} />
      <fog attach="fog" args={['#dfe5df', 24, 92]} />
      <ambientLight intensity={0.72} />
      <hemisphereLight args={['#eef5f1', '#817b68', 1.15]} />
      <directionalLight
        position={[
          bounds.centerX - layout.width * 2.2,
          entity.geometry.elevation + layout.height * 4,
          bounds.centerZ + layout.depth * 0.8,
        ]}
        intensity={1.22}
        castShadow={!reducedGraphics}
        shadow-mapSize-width={reducedGraphics ? 256 : 1024}
        shadow-mapSize-height={reducedGraphics ? 256 : 1024}
        shadow-bias={-0.00018}
        shadow-normalBias={0.026}
        shadow-camera-near={0.1}
        shadow-camera-far={Math.max(24, layout.depth * 4)}
        shadow-camera-left={-layout.depth}
        shadow-camera-right={layout.depth}
        shadow-camera-top={layout.depth}
        shadow-camera-bottom={-layout.depth}
      />
      <group
        position={[bounds.centerX, entity.geometry.elevation, bounds.centerZ]}
        rotation={[0, facing, 0]}
        dispose={null}
      >
        <MiranteArchitecture
          layout={layout}
          materials={materials}
          showDetail
          showFocusDetail
          cutaway
          reducedGraphics={reducedGraphics}
        />
      </group>
      <MiranteInteriorCameraRig entity={entity} reducedGraphics={reducedGraphics} />
    </>
  );
});
