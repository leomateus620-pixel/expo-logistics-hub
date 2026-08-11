import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AlvoradaQualityProfile } from '../capabilities';
import { useAlvoradaTimeline } from '../TimelineContext';
import { smoothRange } from '../timeline';
import { createCloudTexture, createSunGlowTexture, seededRandom } from '../visualTextures';

interface DawnEnvironmentProps {
  quality: AlvoradaQualityProfile;
}

interface CloudPlacement {
  color: THREE.Color;
  position: [number, number, number];
  scale: [number, number, number];
}

const atmosphereVertexShader = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const atmosphereFragmentShader = `
  varying vec3 vWorldPosition;
  void main() {
    vec3 viewDirection = normalize(vWorldPosition - cameraPosition);
    vec3 sunDirection = normalize(vec3(12.0, 0.8, -58.0));
    float altitude = viewDirection.y;
    float upperMix = smoothstep(0.045, 0.38, altitude);
    float horizonMix = smoothstep(-0.055, 0.11, altitude);
    vec3 horizon = vec3(0.52, 0.18, 0.055);
    vec3 middle = vec3(0.15, 0.34, 0.58);
    vec3 zenith = vec3(0.018, 0.09, 0.255);
    vec3 color = mix(horizon, middle, horizonMix);
    color = mix(color, zenith, upperMix);

    float sunAlignment = max(dot(viewDirection, sunDirection), 0.0);
    float mieGlow = pow(sunAlignment, 18.0);
    float solarDisc = pow(sunAlignment, 1800.0);
    float horizonDensity = exp(-abs(altitude) * 7.5);
    color += vec3(1.0, 0.47, 0.12) * mieGlow * (0.045 + horizonDensity * 0.12);
    color += vec3(1.0, 0.83, 0.46) * solarDisc * 0.42;
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function DawnEnvironment({ quality }: DawnEnvironmentProps) {
  const timeline = useAlvoradaTimeline();
  const root = useRef<THREE.Group>(null);
  const sunMaterial = useRef<THREE.SpriteMaterial>(null);
  const cloudMaterials = useRef<THREE.SpriteMaterial[]>([]);
  const cloudTexture = useMemo(() => createCloudTexture(quality.mobile ? 192 : 256), [quality.mobile]);
  const sunTexture = useMemo(() => createSunGlowTexture(256), []);
  const clouds = useMemo<CloudPlacement[]>(() => {
    const random = seededRandom(4317202);
    return Array.from({ length: quality.cloudCount }, (_, index) => {
      const nearSun = index % 4 === 0;
      return {
        color: new THREE.Color(nearSun ? '#ffc28b' : index % 3 === 0 ? '#cbd8f1' : '#efe5dc'),
        position: [
          -25 + random() * 50,
          8 + random() * 12,
          -31 - random() * 35,
        ],
        scale: [
          8 + random() * 15,
          2.1 + random() * 4,
          1,
        ],
      };
    });
  }, [quality.cloudCount]);

  useEffect(() => () => {
    cloudTexture.dispose();
    sunTexture.dispose();
  }, [cloudTexture, sunTexture]);

  useFrame((state) => {
    const elapsed = timeline.current.elapsed;
    const reveal = smoothRange(elapsed, 4.48, 5.02);
    if (root.current) root.current.visible = reveal > 0.001;
    if (sunMaterial.current) {
      sunMaterial.current.opacity = reveal * (0.17 + smoothRange(elapsed, 5.5, 7.7) * 0.08);
    }
    cloudMaterials.current.forEach((material, index) => {
      material.opacity = reveal * (index % 4 === 0 ? 0.38 : 0.25);
      material.rotation = Math.sin(state.clock.elapsedTime * 0.025 + index) * 0.018;
    });
    if (root.current) root.current.position.x = Math.sin(state.clock.elapsedTime * 0.035) * 0.18;
  });

  return (
    <group ref={root} visible={false}>
      <mesh scale={420} renderOrder={-100}>
        <sphereGeometry args={[1, quality.mobile ? 32 : 48, quality.mobile ? 20 : 32]} />
        <shaderMaterial
          depthWrite={false}
          fog={false}
          fragmentShader={atmosphereFragmentShader}
          side={THREE.BackSide}
          vertexShader={atmosphereVertexShader}
        />
      </mesh>

      <hemisphereLight args={['#8ab7ec', '#5a4131', 1.05]} />
      <ambientLight color="#c8d2da" intensity={0.64} />
      <directionalLight color="#a9c2dc" intensity={0.76} position={[-18, 24, 22]} />
      <directionalLight
        castShadow={quality.shadows}
        color="#ffd2a0"
        intensity={2.05}
        position={[22, 13, -18]}
        shadow-bias={-0.00035}
        shadow-mapSize-height={quality.shadowMapSize}
        shadow-mapSize-width={quality.shadowMapSize}
        shadow-camera-far={90}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
      />

      <sprite position={[12, 0.8, -58]} scale={[2.6, 2.6, 1]}>
        <spriteMaterial
          ref={sunMaterial}
          map={sunTexture}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          opacity={0}
          transparent
          toneMapped={false}
        />
      </sprite>

      {clouds.map((cloud, index) => (
        <sprite key={index} position={cloud.position} scale={cloud.scale}>
          <spriteMaterial
            ref={(material) => {
              if (material) cloudMaterials.current[index] = material;
            }}
            map={cloudTexture}
            color={cloud.color}
            depthWrite={false}
            opacity={0}
            transparent
          />
        </sprite>
      ))}
    </group>
  );
}
