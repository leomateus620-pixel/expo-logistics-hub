import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
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

function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return reducedMotion;
}

function MiranteInteriorCameraRig({
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
  const reducedMotion = useReducedMotionPreference();
  const bounds = useMemo(() => strategicLandmarkBounds(entity), [entity]);
  const height = Math.max(entity.geometry.extrusionHeight, miranteVisualHeight(bounds));
  const layout = useMemo(() => createMiranteLayout(bounds, height), [bounds, height]);
  const facing = strategicLandmarkFacingRadians(entity);
  const center = useMemo(
    () => new THREE.Vector3(bounds.centerX, entity.geometry.elevation, bounds.centerZ),
    [bounds.centerX, bounds.centerZ, entity.geometry.elevation],
  );
  const toWorld = useCallback((x: number, y: number, z: number) => (
    new THREE.Vector3(x, y, z).applyAxisAngle(UP, facing).add(center)
  ), [center, facing]);
  const clampTarget = useCallback(() => {
    const target = controls.current?.target;
    if (!target) return;
    const local = target.clone().sub(center).applyAxisAngle(UP, -facing);
    local.x = THREE.MathUtils.clamp(local.x, -layout.width * 0.5, layout.width * 0.48);
    local.y = THREE.MathUtils.clamp(local.y, 0.12, layout.height * 1.02);
    local.z = THREE.MathUtils.clamp(local.z, -layout.depth * 0.55, layout.depth * 0.55);
    target.copy(local.applyAxisAngle(UP, facing).add(center));
  }, [center, facing, layout.depth, layout.height, layout.width]);

  useEffect(() => {
    const compact = size.width < 720 || size.height < 520;
    const portrait = size.height > size.width * 1.12;
    const narrowLandscape = !portrait && size.width / Math.max(size.height, 1) < 1.45;
    const start = portrait
      ? toWorld(-layout.width * 2.3, layout.height * 1.36, layout.depth * 1.82)
      : narrowLandscape
        ? toWorld(-layout.width * 4.2, layout.height * 1.34, layout.depth * 0.74)
      : compact
        ? toWorld(-layout.width * 3.35, layout.height * 1.38, layout.depth * 0.72)
        : toWorld(-layout.width * 3.15, layout.height * 1.25, layout.depth * 0.62);
    const destination = portrait
      ? toWorld(-layout.width * 1.95, layout.height * 1.08, layout.depth * 1.7)
      : narrowLandscape
        ? toWorld(-layout.width * 3.85, layout.height * 1.08, layout.depth * 0.65)
      : compact
        ? toWorld(-layout.width * 3, layout.height * 1.12, layout.depth * 0.62)
        : toWorld(-layout.width * 2.75, layout.height * 0.98, layout.depth * 0.56);
    const lookAt = portrait
      ? toWorld(layout.width * 0.03, layout.platform.topY + layout.height * 0.18, layout.depth * 0.1)
      : narrowLandscape
        ? toWorld(layout.width * 0.08, layout.platform.topY + layout.height * 0.17, -layout.depth * 0.02)
      : compact
        ? toWorld(layout.width * 0.08, layout.platform.topY + layout.height * 0.18, -layout.depth * 0.04)
        : toWorld(layout.width * 0.12, layout.platform.topY + layout.height * 0.16, -layout.depth * 0.05);

    targetPosition.current.copy(destination);
    targetLookAt.current.copy(lookAt);
    camera.position.copy(reducedMotion || reducedGraphics ? destination : start);
    camera.near = 0.04;
    camera.far = Math.max(150, layout.depth * 15);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = portrait || narrowLandscape ? 48 + (portrait ? 10 : 0) : compact ? 48 : 44;
    }
    camera.updateProjectionMatrix();
    controls.current?.target.copy(lookAt);
    clampTarget();
    controls.current?.update();
    animating.current = !reducedMotion && !reducedGraphics;
    gl.domElement.style.cursor = 'grab';
    invalidate();
    return () => {
      gl.domElement.style.cursor = 'grab';
    };
  }, [
    camera,
    clampTarget,
    gl,
    invalidate,
    layout.depth,
    layout.height,
    layout.platform.topY,
    layout.width,
    reducedGraphics,
    reducedMotion,
    size.height,
    size.width,
    toWorld,
  ]);

  useFrame((_state, delta) => {
    if (!animating.current) return;
    const factor = 1 - Math.exp(-delta * 4.8);
    camera.position.lerp(targetPosition.current, factor);
    if (controls.current) {
      controls.current.target.lerp(targetLookAt.current, factor);
      clampTarget();
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

  const portraitViewport = size.height > size.width * 1.12;
  const compactViewport = size.width < 720 || size.height < 520;

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      regress
      enableDamping={!reducedMotion}
      dampingFactor={0.072}
      enablePan={false}
      screenSpacePanning
      zoomToCursor={false}
      minDistance={Math.max(3.8, layout.width * 1.45)}
      maxDistance={portraitViewport
        ? Math.max(30, layout.depth * 3.5)
        : compactViewport
          ? Math.max(24, layout.depth * 3)
          : Math.max(16, layout.depth * 2.25)}
      minPolarAngle={0.22}
      maxPolarAngle={Math.PI / 2.04}
      minAzimuthAngle={-2.72}
      maxAzimuthAngle={-0.58}
      target={toWorld(0, layout.platform.topY + layout.height * 0.2, 0).toArray()}
      onStart={() => {
        animating.current = false;
        gl.domElement.style.cursor = 'grabbing';
      }}
      onEnd={() => {
        gl.domElement.style.cursor = 'grab';
      }}
      onChange={() => {
        clampTarget();
        invalidate();
      }}
    />
  );
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
