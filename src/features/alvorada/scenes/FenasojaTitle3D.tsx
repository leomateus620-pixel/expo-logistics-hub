import { useEffect, useMemo, useRef } from 'react';
import { RoundedBox, Text3D, useTexture } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { AlvoradaQualityProfile } from '../capabilities';
import { useAlvoradaTimeline } from '../TimelineContext';
import {
  ALVORADA_PHASES,
  bellCurve,
  deriveAlvoradaVisualState,
  smoothRange,
} from '../timeline';

interface FenasojaTitle3DProps {
  quality: AlvoradaQualityProfile;
}

interface RevealMaterial {
  material: THREE.MeshPhysicalMaterial;
  reveal: { value: number };
  sweep: { value: number };
}

interface SymbolRevealMaterial {
  material: THREE.MeshBasicMaterial;
  reveal: { value: number };
  sweep: { value: number };
}

const FONT_URL = '/alvorada/helvetiker-bold.typeface.json';
const SYMBOL_URL = '/alvorada/fenasoja-symbol-official.png';
const TITLE_WIDTH = 15.7;

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

function createSymbolRevealMaterial(map: THREE.Texture): SymbolRevealMaterial {
  const reveal = { value: 0 };
  const sweep = { value: -1 };
  const material = new THREE.MeshBasicMaterial({
    alphaTest: 0.018,
    depthWrite: false,
    map,
    toneMapped: false,
    transparent: true,
  });
  material.dithering = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uAlvoradaSymbolReveal = reveal;
    shader.uniforms.uAlvoradaSymbolSweep = sweep;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uAlvoradaSymbolReveal;\nuniform float uAlvoradaSymbolSweep;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float alvoradaSymbolMask = smoothstep(
          -0.08,
          0.12,
          uAlvoradaSymbolReveal - vMapUv.x
        );
        diffuseColor.a *= alvoradaSymbolMask;
        float alvoradaSymbolSweep = exp(-pow((vMapUv.x - uAlvoradaSymbolSweep) * 8.0, 2.0));
        diffuseColor.rgb += vec3(1.0, 0.82, 0.48) * alvoradaSymbolSweep * 0.34;`,
      );
  };
  material.customProgramCacheKey = () => 'alvorada-official-symbol-reveal-v1';
  return { material, reveal, sweep };
}

export function FenasojaTitle3D({ quality }: FenasojaTitle3DProps) {
  const timeline = useAlvoradaTimeline();
  const { camera, viewport } = useThree();
  const root = useRef<THREE.Group>(null);
  const sweepLight = useRef<THREE.PointLight>(null);
  const titlePosition = useMemo(() => new THREE.Vector3(0, 17.38, -28.5), []);
  const symbolSource = useTexture(SYMBOL_URL);
  const symbolTexture = useMemo(() => {
    const clone = symbolSource.clone();
    clone.colorSpace = THREE.SRGBColorSpace;
    clone.anisotropy = quality.mobile ? 4 : 8;
    clone.minFilter = THREE.LinearMipmapLinearFilter;
    clone.generateMipmaps = true;
    clone.needsUpdate = true;
    return clone;
  }, [quality.mobile, symbolSource]);
  const symbol = useMemo(() => createSymbolRevealMaterial(symbolTexture), [symbolTexture]);
  const word = useMemo(() => createRevealMaterial({
    color: '#fbfdff',
    emissive: '#9fb6ca',
    emissiveIntensity: 0.42,
    metalness: 0.46,
    roughness: 0.24,
    clearcoat: 0.78,
    clearcoatRoughness: 0.12,
  }, 'word-v2'), []);
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
    symbol.material.dispose();
    symbolTexture.dispose();
    symbolSource.dispose();
    useTexture.clear(SYMBOL_URL);
    word.material.dispose();
    badge.material.dispose();
    edition.material.dispose();
  }, [badge.material, edition.material, symbol.material, symbolSource, symbolTexture, word.material]);

  useFrame(() => {
    const elapsed = timeline.current.elapsed;
    const ambientElapsed = timeline.current.ambientElapsed;
    const visualState = deriveAlvoradaVisualState(elapsed);
    const revealStart = ALVORADA_PHASES.titleReveal.start;
    const revealEnd = ALVORADA_PHASES.titleReveal.end;
    const wordReveal = smoothRange(elapsed, revealStart + 0.08, revealStart + 1.15);
    const editionReveal = smoothRange(elapsed, revealStart + 0.24, revealStart + 1.34);
    const symbolReveal = smoothRange(elapsed, revealStart, revealStart + 0.98);
    const sweep = smoothRange(elapsed, revealStart + 0.86, revealEnd - 0.12);
    const sweepEnergy = bellCurve(
      elapsed,
      revealStart + 0.78,
      revealStart + 1.24,
      revealEnd,
    );

    word.reveal.value = THREE.MathUtils.lerp(-7.2, 7.2, wordReveal);
    badge.reveal.value = THREE.MathUtils.lerp(-2.1, 2.1, editionReveal);
    edition.reveal.value = THREE.MathUtils.lerp(-1.7, 1.7, editionReveal);
    word.sweep.value = THREE.MathUtils.lerp(-7.8, 7.8, sweep);
    badge.sweep.value = THREE.MathUtils.lerp(-2.4, 2.4, sweep);
    edition.sweep.value = THREE.MathUtils.lerp(-2, 2, sweep);
    symbol.reveal.value = THREE.MathUtils.lerp(0, 1.12, symbolReveal);
    symbol.sweep.value = THREE.MathUtils.lerp(-0.2, 1.2, sweep);

    if (root.current) {
      root.current.visible = visualState.titleProgress > 0.001;
      const titleViewport = viewport.getCurrentViewport(camera, titlePosition);
      const targetWidth = titleViewport.width * (quality.mobile ? 0.56 : 0.58);
      const scale = targetWidth / TITLE_WIDTH;
      root.current.scale.setScalar(scale);
      root.current.position.copy(titlePosition);
      root.current.position.y += elapsed >= revealEnd
        ? Math.sin((ambientElapsed - revealEnd) * 0.16) * 0.012
        : 0;
    }
    if (sweepLight.current) {
      sweepLight.current.position.x = THREE.MathUtils.lerp(-8.5, 8.5, sweep);
      sweepLight.current.intensity = sweepEnergy * 13;
    }
  });

  return (
    <group ref={root} visible={false}>
      <mesh
        material={symbol.material}
        position={[-8.2, 0.05, 0.18]}
        renderOrder={4}
      >
        <planeGeometry args={[1.92, 1.92]} />
      </mesh>

      <Text3D
        font={FONT_URL}
        size={1.34}
        height={0.2}
        curveSegments={quality.mobile ? 8 : 12}
        bevelEnabled
        bevelSegments={quality.mobile ? 3 : 5}
        bevelSize={0.042}
        bevelThickness={0.038}
        position={[-1.55, 0, 0]}
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
      <pointLight
        color="#edf7ff"
        decay={2}
        distance={28}
        intensity={15}
        position={[0, 3.8, 9]}
      />
      <directionalLight color="#d7e9ff" intensity={2.15} position={[-7, 8, 12]} />
      <directionalLight color="#ffd09b" intensity={1.65} position={[10, -2, 10]} />
    </group>
  );
}
