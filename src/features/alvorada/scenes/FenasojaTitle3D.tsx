import { useMemo, useRef } from 'react';
import { RoundedBox, Text3D } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AlvoradaQualityProfile } from '../capabilities';
import { useAlvoradaTimeline } from '../TimelineContext';
import { bellCurve, smoothRange } from '../timeline';

interface FenasojaTitle3DProps {
  quality: AlvoradaQualityProfile;
}

const FONT_URL = '/alvorada/helvetiker-bold.typeface.json';

export function FenasojaTitle3D({ quality }: FenasojaTitle3DProps) {
  const timeline = useAlvoradaTimeline();
  const root = useRef<THREE.Group>(null);
  const word = useRef<THREE.Mesh>(null);
  const edition = useRef<THREE.Group>(null);
  const wordMaterial = useRef<THREE.MeshPhysicalMaterial>(null);
  const capsuleMaterial = useRef<THREE.MeshPhysicalMaterial>(null);
  const editionMaterial = useRef<THREE.MeshPhysicalMaterial>(null);
  const sweepLight = useRef<THREE.PointLight>(null);
  const mobileScale = quality.mobile ? 1.04 : 1.34;
  const titlePosition = useMemo<[number, number, number]>(() => (
    quality.mobile ? [-0.18, 17.35, -27] : [-0.72, 17.2, -27]
  ), [quality.mobile]);

  useFrame(() => {
    const elapsed = timeline.current.elapsed;
    const wordReveal = smoothRange(elapsed, 6.95, 7.74);
    const editionReveal = smoothRange(elapsed, 7.12, 7.88);
    const sweep = smoothRange(elapsed, 7.56, 8.16);
    const sweepEnergy = bellCurve(elapsed, 7.48, 7.82, 8.25);

    if (root.current) root.current.visible = wordReveal > 0.001;
    if (word.current) {
      word.current.scale.x = Math.max(0.006, wordReveal);
      word.current.scale.y = 0.84 + wordReveal * 0.16;
      word.current.position.x = -1.85 - (1 - wordReveal) * 1.45;
    }
    if (edition.current) {
      const scale = Math.max(0.006, editionReveal);
      edition.current.scale.set(scale, 0.84 + editionReveal * 0.16, scale);
    }
    if (wordMaterial.current) {
      wordMaterial.current.opacity = wordReveal;
      wordMaterial.current.emissiveIntensity = 0.2 + sweepEnergy * 0.18;
    }
    if (capsuleMaterial.current) {
      capsuleMaterial.current.opacity = editionReveal;
      capsuleMaterial.current.emissiveIntensity = 0.15 + sweepEnergy * 0.15;
    }
    if (editionMaterial.current) editionMaterial.current.opacity = editionReveal;
    if (sweepLight.current) {
      sweepLight.current.position.x = THREE.MathUtils.lerp(-8, 8, sweep);
      sweepLight.current.intensity = sweepEnergy * 18;
    }
  });

  return (
    <group
      ref={root}
      position={titlePosition}
      scale={mobileScale}
      visible={false}
    >
      <Text3D
        ref={word}
        font={FONT_URL}
        size={1.34}
        height={0.13}
        curveSegments={quality.mobile ? 5 : 8}
        bevelEnabled
        bevelSegments={quality.mobile ? 2 : 4}
        bevelSize={0.035}
        bevelThickness={0.028}
        position={[-1.85, 0, 0]}
        onUpdate={(mesh) => mesh.geometry.center()}
      >
        FENASOJA
        <meshPhysicalMaterial
          ref={wordMaterial}
          color="#eef4fb"
          emissive="#8da1ba"
          emissiveIntensity={0.2}
          metalness={0.46}
          roughness={0.31}
          clearcoat={0.48}
          clearcoatRoughness={0.22}
          opacity={0}
          transparent
        />
      </Text3D>

      <group ref={edition} position={[4.75, 0.02, 0.03]} scale={0.001}>
        <RoundedBox args={[3.25, 1.72, 0.34]} radius={0.34} smoothness={quality.mobile ? 3 : 6}>
          <meshPhysicalMaterial
            ref={capsuleMaterial}
            color="#ff8b31"
            emissive="#ff701d"
            emissiveIntensity={0.15}
            metalness={0.16}
            roughness={0.31}
            clearcoat={0.62}
            clearcoatRoughness={0.2}
            opacity={0}
            transparent
          />
        </RoundedBox>
        <Text3D
          font={FONT_URL}
          size={0.77}
          height={0.08}
          curveSegments={quality.mobile ? 4 : 6}
          bevelEnabled
          bevelSegments={2}
          bevelSize={0.018}
          bevelThickness={0.016}
          position={[0, -0.02, 0.22]}
          onUpdate={(mesh) => mesh.geometry.center()}
        >
          2028
          <meshPhysicalMaterial
            ref={editionMaterial}
            color="#07182f"
            metalness={0.22}
            roughness={0.32}
            opacity={0}
            transparent
          />
        </Text3D>
      </group>

      <pointLight
        ref={sweepLight}
        color="#fff4d4"
        distance={12}
        decay={2}
        intensity={0}
        position={[-8, 2.2, 4]}
      />
      <directionalLight color="#b8d8ff" intensity={1.2} position={[-8, 8, 8]} />
      <directionalLight color="#ffb263" intensity={1.65} position={[10, -1, 8]} />
    </group>
  );
}
