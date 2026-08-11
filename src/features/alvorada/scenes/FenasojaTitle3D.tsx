import { useEffect, useMemo, useRef } from 'react';
import { RoundedBox, Text3D } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AlvoradaQualityProfile } from '../capabilities';
import { useAlvoradaTimeline } from '../TimelineContext';
import { bellCurve, smoothRange } from '../timeline';

interface FenasojaTitle3DProps {
  quality: AlvoradaQualityProfile;
}

interface RevealMaterial {
  material: THREE.MeshPhysicalMaterial;
  reveal: { value: number };
  sweep: { value: number };
}

const FONT_URL = '/alvorada/helvetiker-bold.typeface.json';
const TITLE_WIDTH = 13.7;

function createRevealMaterial(
  parameters: THREE.MeshPhysicalMaterialParameters,
  cacheKey: string,
): RevealMaterial {
  const reveal = { value: -10 };
  const sweep = { value: -10 };
  const material = new THREE.MeshPhysicalMaterial(parameters);
  material.dithering = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAlvoradaReveal = reveal;
    shader.uniforms.uAlvoradaSweep = sweep;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vAlvoradaBrandX;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvAlvoradaBrandX = position.x;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vAlvoradaBrandX;\nuniform float uAlvoradaReveal;\nuniform float uAlvoradaSweep;',
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float alvoradaRevealMask = 1.0 - smoothstep(
          uAlvoradaReveal - 0.16,
          uAlvoradaReveal + 0.16,
          vAlvoradaBrandX
        );
        float alvoradaDither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        if (alvoradaRevealMask < alvoradaDither) discard;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float alvoradaSpecularSweep = exp(-pow((vAlvoradaBrandX - uAlvoradaSweep) * 1.15, 2.0));
        totalEmissiveRadiance += vec3(1.0, 0.78, 0.48) * alvoradaSpecularSweep * 0.32;`,
      );
  };
  material.customProgramCacheKey = () => `alvorada-brand-${cacheKey}-v3`;
  return { material, reveal, sweep };
}

export function FenasojaTitle3D({ quality }: FenasojaTitle3DProps) {
  const timeline = useAlvoradaTimeline();
  const { camera, viewport } = useThree();
  const root = useRef<THREE.Group>(null);
  const sweepLight = useRef<THREE.PointLight>(null);
  const titlePosition = useMemo(() => new THREE.Vector3(0, 12.35, -28.5), []);
  const word = useMemo(() => createRevealMaterial({
    color: '#eef4fb',
    emissive: '#91a6bf',
    emissiveIntensity: 0.56,
    metalness: 0.58,
    roughness: 0.28,
    clearcoat: 0.52,
    clearcoatRoughness: 0.2,
  }, 'word'), []);
  const badge = useMemo(() => createRevealMaterial({
    color: '#ff8a32',
    emissive: '#f05c18',
    emissiveIntensity: 0.34,
    metalness: 0.18,
    roughness: 0.3,
    clearcoat: 0.68,
    clearcoatRoughness: 0.18,
  }, 'badge'), []);
  const edition = useMemo(() => createRevealMaterial({
    color: '#07182f',
    emissive: '#020817',
    emissiveIntensity: 0.14,
    metalness: 0.24,
    roughness: 0.32,
  }, 'edition'), []);

  useEffect(() => () => {
    word.material.dispose();
    badge.material.dispose();
    edition.material.dispose();
  }, [badge.material, edition.material, word.material]);

  useFrame(() => {
    const elapsed = timeline.current.elapsed;
    const ambientElapsed = timeline.current.ambientElapsed;
    const wordReveal = smoothRange(elapsed, 9.02, 10.03);
    const editionReveal = smoothRange(elapsed, 9.18, 10.18);
    const sweep = smoothRange(elapsed, 9.64, 10.38);
    const sweepEnergy = bellCurve(elapsed, 9.55, 9.96, 10.48);

    word.reveal.value = THREE.MathUtils.lerp(-7.2, 7.2, wordReveal);
    badge.reveal.value = THREE.MathUtils.lerp(-2.1, 2.1, editionReveal);
    edition.reveal.value = THREE.MathUtils.lerp(-1.7, 1.7, editionReveal);
    word.sweep.value = THREE.MathUtils.lerp(-7.8, 7.8, sweep);
    badge.sweep.value = THREE.MathUtils.lerp(-2.4, 2.4, sweep);
    edition.sweep.value = THREE.MathUtils.lerp(-2, 2, sweep);

    if (root.current) {
      root.current.visible = elapsed >= 8.98;
      const titleViewport = viewport.getCurrentViewport(camera, titlePosition);
      const targetWidth = titleViewport.width * (quality.mobile ? 0.72 : 0.58);
      const scale = targetWidth / TITLE_WIDTH;
      root.current.scale.setScalar(scale);
      root.current.position.copy(titlePosition);
      root.current.position.y += elapsed >= 10.5
        ? Math.sin((ambientElapsed - 10.5) * 0.16) * 0.012
        : 0;
    }
    if (sweepLight.current) {
      sweepLight.current.position.x = THREE.MathUtils.lerp(-8.5, 8.5, sweep);
      sweepLight.current.intensity = sweepEnergy * 13;
    }
  });

  return (
    <group ref={root} visible={false}>
      <Text3D
        font={FONT_URL}
        size={1.34}
        height={0.16}
        curveSegments={quality.mobile ? 8 : 12}
        bevelEnabled
        bevelSegments={quality.mobile ? 3 : 5}
        bevelSize={0.034}
        bevelThickness={0.03}
        position={[-1.9, 0, 0]}
        onUpdate={(mesh) => mesh.geometry.center()}
      >
        FENASOJA
        <primitive object={word.material} attach="material" />
      </Text3D>

      <group position={[4.78, 0.01, 0.035]}>
        <RoundedBox args={[3.3, 1.74, 0.38]} radius={0.36} smoothness={quality.mobile ? 5 : 8}>
          <primitive object={badge.material} attach="material" />
        </RoundedBox>
        <Text3D
          font={FONT_URL}
          size={0.79}
          height={0.095}
          curveSegments={quality.mobile ? 7 : 10}
          bevelEnabled
          bevelSegments={3}
          bevelSize={0.018}
          bevelThickness={0.016}
          position={[0, -0.02, 0.225]}
          onUpdate={(mesh) => mesh.geometry.center()}
        >
          2028
          <primitive object={edition.material} attach="material" />
        </Text3D>
      </group>

      <pointLight
        ref={sweepLight}
        color="#fff2d3"
        distance={14}
        decay={2}
        intensity={0}
        position={[-8.5, 2.1, 4]}
      />
      <directionalLight color="#d7e9ff" intensity={1.35} position={[-7, 8, 12]} />
      <directionalLight color="#ffd09b" intensity={1.05} position={[10, -2, 10]} />
    </group>
  );
}
