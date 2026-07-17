import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { AdaptiveDpr } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface SoybeanAtmosphereProps {
  compact: boolean;
  motionEnabled: boolean;
}

interface SoybeanPlacement {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotation: [number, number, number];
}

const backgroundPlacements: SoybeanPlacement[] = [
  { x: -0.91, y: 0.71, z: -3.6, scale: 0.14, rotation: [0.4, 0.2, -0.7] },
  { x: 0.91, y: 0.69, z: -3.8, scale: 0.14, rotation: [0.3, 1.6, -0.4] },
  { x: -0.98, y: 0.08, z: -4.2, scale: 0.11, rotation: [1.2, 0.4, 0.1] },
  { x: 0.98, y: -0.1, z: -4, scale: 0.12, rotation: [0.5, 1.4, 0.8] },
  { x: -0.8, y: -0.74, z: -4.4, scale: 0.1, rotation: [0.1, 0.8, -0.3] },
  { x: 0.8, y: -0.75, z: -4.3, scale: 0.1, rotation: [0.7, 0.3, 0.4] },
  { x: -0.66, y: 0.89, z: -4.7, scale: 0.08, rotation: [0.6, 1.7, 0.2] },
  { x: 0.66, y: 0.88, z: -4.8, scale: 0.08, rotation: [1.1, 0.2, -0.8] },
];

const middlePlacements: SoybeanPlacement[] = [
  { x: -1.02, y: 0.54, z: -0.9, scale: 0.28, rotation: [0.4, 0.8, -0.4] },
  { x: 1.02, y: 0.52, z: -0.8, scale: 0.29, rotation: [0.7, 0.4, -0.6] },
  { x: -0.98, y: -0.57, z: -0.6, scale: 0.32, rotation: [0.8, 0.25, 0.7] },
  { x: 0.98, y: -0.56, z: -0.5, scale: 0.33, rotation: [0.3, 1.2, 0.3] },
  { x: -0.82, y: 0.83, z: -1.2, scale: 0.2, rotation: [0.2, 1.4, 0.4] },
  { x: 0.82, y: 0.82, z: -1.3, scale: 0.2, rotation: [1, 0.2, 0.9] },
];

const foregroundPlacements: SoybeanPlacement[] = [
  { x: -1.13, y: 0.66, z: 1.7, scale: 0.44, rotation: [0.5, 0.4, -0.8] },
  { x: 1.13, y: 0.64, z: 1.8, scale: 0.46, rotation: [0.3, 1.3, 0.7] },
  { x: -1.1, y: -0.71, z: 1.9, scale: 0.52, rotation: [0.9, 1.1, 0.3] },
  { x: 1.1, y: -0.7, z: 2, scale: 0.54, rotation: [0.7, 0.35, -0.45] },
];

function createSoybeanGeometry() {
  const geometry = new THREE.SphereGeometry(1, 32, 24);
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;

  for (let index = 0; index < positions.count; index += 1) {
    const originalX = positions.getX(index);
    const originalY = positions.getY(index);
    const originalZ = positions.getZ(index);
    const hilumDent = originalZ > 0.45
      ? Math.exp(-((originalX / 0.38) ** 2 + (originalY / 0.16) ** 2)) * 0.065
      : 0;
    const organicVariation =
      1 + Math.sin(originalX * 3.4 + originalY * 2.2) * 0.012;

    positions.setXYZ(
      index,
      originalX * 1.07 * organicVariation,
      originalY * 0.92,
      originalZ * 0.86 - hilumDent,
    );
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.center();
  return geometry;
}

function SoybeanLayer({
  placements,
  pointer,
  motionEnabled,
  phase,
  drift,
  speed,
  pointerStrength,
  color,
  opacity,
}: {
  placements: SoybeanPlacement[];
  pointer: React.MutableRefObject<{ x: number; y: number }>;
  motionEnabled: boolean;
  phase: number;
  drift: number;
  speed: number;
  pointerStrength: number;
  color: string;
  opacity: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const beanMeshRef = useRef<THREE.InstancedMesh>(null);
  const hilumMeshRef = useRef<THREE.InstancedMesh>(null);
  const viewport = useThree((state) => state.viewport);
  const beanGeometry = useMemo(createSoybeanGeometry, []);
  const hilumGeometry = useMemo(() => new THREE.CircleGeometry(1, 18), []);

  useLayoutEffect(() => {
    const beanMesh = beanMeshRef.current;
    const hilumMesh = hilumMeshRef.current;
    if (!beanMesh || !hilumMesh) return;

    const baseMatrix = new THREE.Matrix4();
    const hilumMatrix = new THREE.Matrix4();
    const localHilum = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    const responsiveScale = THREE.MathUtils.clamp(
      Math.min(viewport.width / 12, viewport.height / 6.2),
      0.72,
      1.08,
    );

    placements.forEach((placement, index) => {
      position.set(
        placement.x * viewport.width * 0.5,
        placement.y * viewport.height * 0.5,
        placement.z,
      );
      euler.set(...placement.rotation);
      quaternion.setFromEuler(euler);
      const instanceScale = placement.scale * responsiveScale;
      scale.setScalar(instanceScale);
      baseMatrix.compose(position, quaternion, scale);
      beanMesh.setMatrixAt(index, baseMatrix);

      localHilum.makeTranslation(0, 0, 0.835);
      localHilum.scale(new THREE.Vector3(0.24, 0.085, 1));
      hilumMatrix.multiplyMatrices(baseMatrix, localHilum);
      hilumMesh.setMatrixAt(index, hilumMatrix);
    });

    beanMesh.instanceMatrix.needsUpdate = true;
    hilumMesh.instanceMatrix.needsUpdate = true;
  }, [placements, viewport.height, viewport.width]);

  useEffect(() => () => {
    beanGeometry.dispose();
    hilumGeometry.dispose();
  }, [beanGeometry, hilumGeometry]);

  useFrame((state, delta) => {
    if (!motionEnabled || !groupRef.current) return;

    const elapsed = state.clock.elapsedTime;
    const lerpFactor = Math.min(1, delta * 1.8);
    groupRef.current.position.y = Math.sin(elapsed * speed + phase) * drift;
    groupRef.current.position.x = Math.cos(elapsed * speed * 0.72 + phase) * drift * 0.45;
    groupRef.current.rotation.y = THREE.MathUtils.lerp(
      groupRef.current.rotation.y,
      pointer.current.x * pointerStrength,
      lerpFactor,
    );
    groupRef.current.rotation.x = THREE.MathUtils.lerp(
      groupRef.current.rotation.x,
      -pointer.current.y * pointerStrength * 0.55,
      lerpFactor,
    );
  });

  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={beanMeshRef}
        args={[beanGeometry, undefined, placements.length]}
        frustumCulled={false}
      >
        <meshPhysicalMaterial
          color={color}
          roughness={0.56}
          metalness={0.035}
          clearcoat={0.18}
          clearcoatRoughness={0.62}
          transparent={opacity < 1}
          opacity={opacity}
        />
      </instancedMesh>
      <instancedMesh
        ref={hilumMeshRef}
        args={[hilumGeometry, undefined, placements.length]}
        frustumCulled={false}
      >
        <meshStandardMaterial
          color="#4b2d16"
          roughness={0.78}
          transparent={opacity < 1}
          opacity={opacity * 0.92}
          side={THREE.DoubleSide}
        />
      </instancedMesh>
    </group>
  );
}

function SoybeanScene({
  compact,
  motionEnabled,
}: SoybeanAtmosphereProps) {
  const pointer = useRef({ x: 0, y: 0 });
  const background = compact ? backgroundPlacements.slice(0, 5) : backgroundPlacements;
  const middle = compact ? middlePlacements.slice(0, 4) : middlePlacements;
  const foreground = compact ? foregroundPlacements.slice(0, 2) : foregroundPlacements;

  useEffect(() => {
    if (!motionEnabled || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      pointer.current = { x: 0, y: 0 };
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      pointer.current.x = (event.clientX / Math.max(window.innerWidth, 1)) * 2 - 1;
      pointer.current.y = (event.clientY / Math.max(window.innerHeight, 1)) * 2 - 1;
    };
    const resetPointer = () => {
      pointer.current = { x: 0, y: 0 };
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerleave', resetPointer);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', resetPointer);
    };
  }, [motionEnabled]);

  return (
    <>
      <fog attach="fog" args={['#031834', 8, 18]} />
      <ambientLight intensity={0.68} color="#8b93c9" />
      <directionalLight position={[-4, 6, 7]} intensity={3.1} color="#ffd66d" />
      <directionalLight position={[5, -2, 5]} intensity={1.45} color="#f2751a" />
      <pointLight position={[0, 2.5, 4]} intensity={24} distance={15} color="#fad954" />

      <SoybeanLayer
        placements={background}
        pointer={pointer}
        motionEnabled={motionEnabled}
        phase={0.4}
        drift={0.045}
        speed={0.18}
        pointerStrength={0.018}
        color="#9d6b25"
        opacity={0.2}
      />
      <SoybeanLayer
        placements={middle}
        pointer={pointer}
        motionEnabled={motionEnabled}
        phase={1.7}
        drift={0.075}
        speed={0.23}
        pointerStrength={0.032}
        color="#b98532"
        opacity={0.44}
      />
      <SoybeanLayer
        placements={foreground}
        pointer={pointer}
        motionEnabled={motionEnabled}
        phase={2.8}
        drift={0.095}
        speed={0.16}
        pointerStrength={0.052}
        color="#d2a24f"
        opacity={0.64}
      />
    </>
  );
}

export default memo(function SoybeanAtmosphere({
  compact,
  motionEnabled,
}: SoybeanAtmosphereProps) {
  return (
    <Canvas
      className="fenasoja-countdown-experience__canvas"
      camera={{ position: [0, 0, 8], fov: 42, near: 0.1, far: 40 }}
      dpr={compact ? [1, 1.15] : [1, 1.5]}
      frameloop={motionEnabled ? 'always' : 'demand'}
      gl={{
        alpha: true,
        antialias: !compact,
        depth: true,
        powerPreference: 'high-performance',
        stencil: false,
      }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.08;
      }}
    >
      <AdaptiveDpr pixelated />
      <SoybeanScene compact={compact} motionEnabled={motionEnabled} />
    </Canvas>
  );
});
